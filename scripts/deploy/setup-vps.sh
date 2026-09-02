#!/usr/bin/env bash
set -euo pipefail

# Bootstrap a fresh Ubuntu 22.04+ Hetzner VPS for Agora.
# Run from your laptop, not on the VPS.
#
# Usage:
#   AGORA_APP_DOMAIN=agora.example.com \
#   AGORA_API_DOMAIN=api.agora.example.com \
#   VPS_IP=1.2.3.4 \
#   bash scripts/deploy/setup-vps.sh

AGORA_APP_DOMAIN="${AGORA_APP_DOMAIN:?Set AGORA_APP_DOMAIN}"
AGORA_API_DOMAIN="${AGORA_API_DOMAIN:?Set AGORA_API_DOMAIN}"
VPS_IP="${VPS_IP:?Set VPS_IP}"
SSH_USER="${SSH_USER:-root}"
APP_USER="agora"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

echo "=== Bootstrapping ${VPS_IP} for ${AGORA_APP_DOMAIN} ==="

ssh "${SSH_USER}@${VPS_IP}" 'bash -s' <<'BOOTSTRAP'
set -euo pipefail

if ! id -u agora >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" agora
  mkdir -p /home/agora/.ssh
  cp ~/.ssh/authorized_keys /home/agora/.ssh/authorized_keys
  chown -R agora:agora /home/agora/.ssh
  chmod 700 /home/agora/.ssh
fi

if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release rsync
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  CODENAME="$(lsb_release -cs)"
  if ! curl -fsI "https://download.docker.com/linux/ubuntu/dists/${CODENAME}/stable/binary-amd64/Packages" >/dev/null 2>&1; then
    CODENAME=noble
  fi
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

usermod -aG docker agora
systemctl enable docker
systemctl start docker
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable || true
fi
echo "Server bootstrap complete."
BOOTSTRAP

echo "==> Syncing repo to /home/agora/Agora"
ssh "${SSH_USER}@${VPS_IP}" "mkdir -p /home/${APP_USER}/Agora && chown ${APP_USER}:${APP_USER} /home/${APP_USER}/Agora"

rsync -az --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='test-results' \
  --exclude='coverage' \
  --exclude='.env.local' \
  --exclude='.env.production' \
  --exclude='infrastructure/supabase/.env' \
  --exclude='supabase/.temp' \
  "${ROOT_DIR}/" "${SSH_USER}@${VPS_IP}:/tmp/agora-sync/"

ssh "${SSH_USER}@${VPS_IP}" "rsync -a --delete /tmp/agora-sync/ /home/${APP_USER}/Agora/ && chown -R ${APP_USER}:${APP_USER} /home/${APP_USER}/Agora && rm -rf /tmp/agora-sync"

echo ""
echo "VPS is ready. Next, SSH in as ${APP_USER}:"
echo "  ssh ${APP_USER}@${VPS_IP}"
echo "  cd ~/Agora"
echo "  cp infrastructure/supabase/env.example infrastructure/supabase/.env"
echo "  cp .env.production.example .env.production"
echo "  node scripts/deploy/generate-keys.mjs   # paste into both env files"
echo "  # set domains, SMTP, OpenAI, then:"
echo "  bash scripts/deploy/deploy.sh"
echo ""
echo "DNS must already point here:"
echo "  ${AGORA_APP_DOMAIN} → ${VPS_IP}"
echo "  ${AGORA_API_DOMAIN} → ${VPS_IP}"
