#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# CloudVault — SSL Certificate Setup
# Run after setting up NGINX and DNS pointing to your EC2 IP
# Usage: chmod +x setup-ssl.sh && sudo ./setup-ssl.sh YOUR_DOMAIN.com
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

DOMAIN="${1:-}"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

if [ -z "$DOMAIN" ]; then
  echo -e "${RED}Usage: $0 <your-domain.com>${NC}"
  exit 1
fi

echo -e "${CYAN}[SSL]${NC} Setting up Let's Encrypt SSL for ${DOMAIN}..."

# ── Install NGINX site config ──────────────────────────────────────────────
echo -e "${CYAN}[SSL]${NC} Deploying NGINX config..."
NGINX_CONF="/etc/nginx/sites-available/cloudvault"
NGINX_ENABLED="/etc/nginx/sites-enabled/cloudvault"

# Copy template and replace domain
cp /opt/cloudvault/deploy/nginx/cloudvault.conf "${NGINX_CONF}"
sed -i "s/YOUR_DOMAIN\.com/${DOMAIN}/g" "${NGINX_CONF}"

# Remove default site and enable cloudvault
rm -f /etc/nginx/sites-enabled/default
ln -sf "${NGINX_CONF}" "${NGINX_ENABLED}"

# Create web root for SPA
mkdir -p /var/www/cloudvault
echo '<!DOCTYPE html><html><head><title>CloudVault</title></head><body><h1>CloudVault</h1></body></html>' > /var/www/cloudvault/index.html
chown -R www-data:www-data /var/www/cloudvault

# Create certbot challenge directory
mkdir -p /var/www/certbot

# ── Temporary HTTP-only config for certbot ─────────────────────────────────
# Comment out SSL lines temporarily so NGINX can start on port 80
TEMP_CONF="/etc/nginx/sites-available/cloudvault-temp"
cat > "${TEMP_CONF}" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        root /var/www/cloudvault;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

ln -sf "${TEMP_CONF}" "${NGINX_ENABLED}"
nginx -t && systemctl reload nginx
echo -e "${GREEN}[✓]${NC} NGINX running with temporary HTTP config"

# ── Obtain SSL Certificate ─────────────────────────────────────────────────
echo -e "${CYAN}[SSL]${NC} Requesting SSL certificate from Let's Encrypt..."
certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  -d "${DOMAIN}" \
  -d "www.${DOMAIN}" \
  --non-interactive \
  --agree-tos \
  --email "admin@${DOMAIN}" \
  --no-eff-email

echo -e "${GREEN}[✓]${NC} SSL certificate obtained"

# ── Switch to full SSL config ──────────────────────────────────────────────
ln -sf "${NGINX_CONF}" "${NGINX_ENABLED}"
rm -f "${TEMP_CONF}"
nginx -t && systemctl reload nginx

echo -e "${GREEN}[✓]${NC} NGINX reloaded with full SSL configuration"

# ── Auto-Renewal Cron ──────────────────────────────────────────────────────
echo -e "${CYAN}[SSL]${NC} Setting up auto-renewal..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
echo -e "${GREEN}[✓]${NC} Auto-renewal cron job added (daily at 3 AM)"

# ── Update CORS in .env ───────────────────────────────────────────────────
if [ -f /opt/cloudvault/.env ]; then
  sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" /opt/cloudvault/.env
  echo -e "${GREEN}[✓]${NC} Updated CORS_ORIGIN in .env"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN} SSL Setup Complete!${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Domain:  https://${DOMAIN}"
echo "  Cert:    /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
echo "  Key:     /etc/letsencrypt/live/${DOMAIN}/privkey.pem"
echo "  Renewal: Automatic (daily cron at 3 AM)"
echo ""
