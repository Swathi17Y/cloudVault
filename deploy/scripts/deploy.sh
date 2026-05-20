#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# CloudVault — Deployment Script
# Run from the project root: deploy/scripts/deploy.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/opt/cloudvault"
COMPOSE_FILE="docker-compose.prod.yml"

log() { echo -e "${CYAN}[Deploy]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

# ── Preflight Checks ──────────────────────────────────────────────────────────
log "Running preflight checks..."

if [ ! -f "${APP_DIR}/.env" ]; then
  error "Missing .env file at ${APP_DIR}/.env — copy from .env.production.example"
fi

if ! command -v docker &> /dev/null; then
  error "Docker not installed. Run setup-ec2.sh first."
fi

if ! command -v docker-compose &> /dev/null; then
  error "Docker Compose not installed. Run setup-ec2.sh first."
fi

success "Preflight checks passed"

# ── Navigate to App Directory ──────────────────────────────────────────────────
cd "${APP_DIR}"

# ── Pull Latest Code ───────────────────────────────────────────────────────────
if [ -d ".git" ]; then
  log "Pulling latest code..."
  git fetch origin
  git reset --hard origin/main
  success "Code updated to latest"
else
  warn "Not a git repo — skipping pull"
fi

# ── Build Client Bundle ────────────────────────────────────────────────────────
log "Building client production bundle..."
if [ -d "client" ]; then
  cd client
  npm ci --production=false
  npx vite build
  cd ..
  success "Client built successfully"
fi

# ── Docker Build & Deploy ──────────────────────────────────────────────────────
log "Building and deploying containers..."

# Stop existing containers gracefully
docker-compose -f "${COMPOSE_FILE}" down --remove-orphans 2>/dev/null || true

# Build fresh images
docker-compose -f "${COMPOSE_FILE}" build --no-cache

# Start all services
docker-compose -f "${COMPOSE_FILE}" up -d

success "Containers started"

# ── Wait for Health Checks ────────────────────────────────────────────────────
log "Waiting for services to become healthy..."
sleep 10

# Check API server
MAX_RETRIES=15
RETRY_COUNT=0
until curl -sf http://localhost:5000/api/health > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    warn "API server health check timed out — check logs with: docker-compose -f ${COMPOSE_FILE} logs api"
    break
  fi
  sleep 2
done

if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
  success "API server is healthy"
fi

# ── Copy Client Build to NGINX ────────────────────────────────────────────────
log "Deploying client files to NGINX..."
rm -rf /var/www/cloudvault/*
mkdir -p /var/www/cloudvault
cp -r client/dist/* /var/www/cloudvault/
chown -R www-data:www-data /var/www/cloudvault
success "Client deployed to /var/www/cloudvault"

# ── Reload NGINX ──────────────────────────────────────────────────────────────
log "Reloading NGINX..."
nginx -t && systemctl reload nginx
success "NGINX reloaded"

# ── Cleanup Old Docker Resources ──────────────────────────────────────────────
log "Cleaning up old Docker resources..."
docker image prune -f
docker volume prune -f --filter "label!=keep"
success "Cleanup complete"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN} CloudVault Deployment Complete!${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Running containers:"
docker-compose -f "${COMPOSE_FILE}" ps
echo ""
echo "  Logs:  docker-compose -f ${COMPOSE_FILE} logs -f"
echo "  Stop:  docker-compose -f ${COMPOSE_FILE} down"
echo ""
