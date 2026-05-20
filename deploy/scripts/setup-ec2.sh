#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# CloudVault — EC2 Instance Setup Script
# Run this on a fresh Ubuntu 22.04/24.04 LTS instance
# Usage: chmod +x setup-ec2.sh && sudo ./setup-ec2.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${CYAN}[CloudVault]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

# ── System Updates ──────────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -y && apt-get upgrade -y
success "System updated"

# ── Essential Packages ──────────────────────────────────────────────────────────
log "Installing essential packages..."
apt-get install -y \
  curl wget git unzip htop \
  apt-transport-https ca-certificates \
  software-properties-common \
  ufw fail2ban
success "Essential packages installed"

# ── Docker ──────────────────────────────────────────────────────────────────────
log "Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker ubuntu
  systemctl enable docker
  systemctl start docker
  success "Docker installed"
else
  success "Docker already installed"
fi

# ── Docker Compose ──────────────────────────────────────────────────────────────
log "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
  COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep -oP '"tag_name": "\K(.*)(?=")')
  curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  success "Docker Compose ${COMPOSE_VERSION} installed"
else
  success "Docker Compose already installed"
fi

# ── Node.js 20 LTS (for local builds if needed) ────────────────────────────────
log "Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  success "Node.js $(node -v) installed"
else
  success "Node.js $(node -v) already installed"
fi

# ── NGINX ────────────────────────────────────────────────────────────────────────
log "Installing NGINX..."
apt-get install -y nginx
systemctl enable nginx
success "NGINX installed"

# ── Certbot (Let's Encrypt SSL) ────────────────────────────────────────────────
log "Installing Certbot..."
apt-get install -y certbot python3-certbot-nginx
success "Certbot installed"

# ── Firewall Configuration ──────────────────────────────────────────────────────
log "Configuring UFW firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
success "Firewall configured (SSH, HTTP, HTTPS allowed)"

# ── Fail2Ban Configuration ──────────────────────────────────────────────────────
log "Configuring Fail2Ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
backend = systemd

[nginx-http-auth]
enabled = true
port    = http,https
logpath = /var/log/nginx/error.log
EOF
systemctl enable fail2ban
systemctl restart fail2ban
success "Fail2Ban configured"

# ── Swap Space (for t2.micro / t3.micro) ────────────────────────────────────────
log "Setting up swap space..."
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Optimize swap behavior
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  success "2GB swap space created"
else
  success "Swap already exists"
fi

# ── Application Directory ──────────────────────────────────────────────────────
log "Creating application directory..."
mkdir -p /opt/cloudvault
chown ubuntu:ubuntu /opt/cloudvault
success "App directory created at /opt/cloudvault"

# ── Docker Log Rotation ────────────────────────────────────────────────────────
log "Configuring Docker log rotation..."
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker
success "Docker log rotation configured"

# ── Summary ─────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN} CloudVault EC2 Setup Complete!${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Docker:         $(docker --version)"
echo "  Docker Compose: $(docker-compose --version)"
echo "  Node.js:        $(node -v)"
echo "  NGINX:          $(nginx -v 2>&1)"
echo "  Certbot:        $(certbot --version 2>&1)"
echo ""
echo "  Next steps:"
echo "    1. Clone your repo into /opt/cloudvault"
echo "    2. Copy .env.production to /opt/cloudvault/.env"
echo "    3. Run: deploy/scripts/deploy.sh"
echo ""
