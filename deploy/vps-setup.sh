#!/usr/bin/env bash
# Bootstrap platform bot Discord di VPS (Ubuntu/Debian, akses root/sudo).
# Pakai:
#   sudo DOMAIN=quiz.domainmu.com \
#        DISCORD_CLIENT_ID=xxx DISCORD_CLIENT_SECRET=yyy \
#        GITHUB_REPO=https://github.com/neyzaak/discord-bot-platform.git \
#        bash deploy/vps-setup.sh
set -euo pipefail

: "${DOMAIN:?set DOMAIN (domain yang sudah di-A/AAAA-kan ke IP VPS ini)}"
: "${DISCORD_CLIENT_ID:?set DISCORD_CLIENT_ID}"
: "${DISCORD_CLIENT_SECRET:?set DISCORD_CLIENT_SECRET}"
GITHUB_REPO="${GITHUB_REPO:-https://github.com/neyzaak/discord-bot-platform.git}"
APP_DIR="${APP_DIR:-/opt/discord-bot-platform}"

# 1) Docker (lewati bila sudah ada)
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin tidak ada"; exit 1; }

# 2) Kode
mkdir -p "$(dirname "$APP_DIR")"
[ -d "$APP_DIR/.git" ] || git clone "$GITHUB_REPO" "$APP_DIR"
cd "$APP_DIR"
git pull --ff-only || true

# 3) .env (idempoten — secret hanya dibuat sekali)
if [ ! -f .env ]; then
  SESSION=$(openssl rand -hex 32)
  TOKENKEY=$(openssl rand -hex 32)
  cat > .env <<EOF
NODE_ENV=production
APP_URL=https://${DOMAIN}
API_URL=http://api:4001
API_PORT=4001
DATABASE_URL=postgres://platform:platform@postgres:5432/platform
REDIS_URL=redis://redis:6379
DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET}
DISCORD_REDIRECT_URI=https://${DOMAIN}/api/auth/callback
SESSION_SECRET=${SESSION}
TOKEN_ENCRYPTION_KEY=${TOKENKEY}
PUBLIC_API_URL=https://${DOMAIN}
LOG_LEVEL=info
EOF
  chmod 600 .env
  echo ".env dibuat (TOKEN_ENCRYPTION_KEY baru — jangan pernah diubah setelah ada bot)."
else
  echo ".env sudah ada — dipakai apa adanya."
fi

# 4) HTTPS (Caddy)
cp Caddyfile.example Caddyfile
mkdir -p deploy
cat > docker-compose.override.yml <<'EOF'
services:
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddydata:/data
    depends_on: [api, web]
    restart: unless-stopped
volumes:
  caddydata:
EOF

# 5) Build & start
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm worker pnpm --filter @platform/core db:push

echo ""
echo "=== SELESAI ==="
echo "Dashboard : https://${DOMAIN}"
echo "Healthz   : https://${DOMAIN}/api/healthz"
echo "Cek log   : docker compose -f docker-compose.prod.yml logs -f worker"
