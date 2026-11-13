#!/usr/bin/env bash
# Sets up Questhand on a fresh Ubuntu 24.04 server. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/lovejzzz/Classdeck/main/deploy/setup.sh | bash
# Run it again after filling in /opt/questhand/.env.local; it's safe to run more than once.
set -euo pipefail

REPO=https://github.com/lovejzzz/Classdeck.git
DIR=/opt/questhand
LITESTREAM=0.3.13

echo "== Packages"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates sqlite3 >/dev/null

if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])\.'; then
  echo "== Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

id questhand >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin questhand

echo "== Code"
if [ ! -d "$DIR/.git" ]; then git clone -q "$REPO" "$DIR"; else git -C "$DIR" pull -q --ff-only; fi
chown -R questhand:questhand "$DIR"

if [ ! -f "$DIR/.env.local" ]; then
  cp "$DIR/.env.example" "$DIR/.env.local"
  chown questhand:questhand "$DIR/.env.local"
  chmod 600 "$DIR/.env.local"
  echo
  echo "Fill in $DIR/.env.local (PUBLIC_URL and the four R2_ lines), then run this script again."
  exit 0
fi
set -a; . "$DIR/.env.local"; set +a
for v in PUBLIC_URL R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  [ -n "${!v:-}" ] || { echo "$v is empty in $DIR/.env.local"; exit 1; }
done

echo "== Build"
sudo -u questhand bash -c "cd $DIR && npm ci --no-audit --no-fund --loglevel=error && npm run build >/dev/null"

echo "== Database backup (Litestream)"
if ! command -v litestream >/dev/null; then
  arch=$(dpkg --print-architecture)
  curl -fsSL -o /tmp/litestream.deb "https://github.com/benbjohnson/litestream/releases/download/v$LITESTREAM/litestream-v$LITESTREAM-linux-$arch.deb"
  dpkg -i /tmp/litestream.deb >/dev/null
fi
mkdir -p "$DIR/.data" && chown questhand:questhand "$DIR/.data"
# A new server with a backup in R2 (say, after moving servers) starts from that backup.
if [ ! -f "$DIR/.data/questhand.db" ]; then
  sudo -u questhand -E litestream restore -if-replica-exists -config "$DIR/deploy/litestream.yml" "$DIR/.data/questhand.db" || true
fi

echo "== Services"
cp "$DIR/deploy/questhand.service" "$DIR/deploy/questhand-backup.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now questhand questhand-backup >/dev/null
systemctl restart questhand questhand-backup

echo "== Cloudflare Tunnel"
if ! command -v cloudflared >/dev/null; then
  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -qq && apt-get install -y -qq cloudflared >/dev/null
fi
if [ -n "${TUNNEL_TOKEN:-}" ] && ! systemctl is-active --quiet cloudflared; then
  cloudflared service install "$TUNNEL_TOKEN"
fi

echo
systemctl --no-pager --lines=0 status questhand questhand-backup | grep -E "●|Active:"
systemctl is-active --quiet cloudflared && echo "Tunnel: running" || echo "Tunnel: not set up yet. Run: TUNNEL_TOKEN=<token from Cloudflare> bash $DIR/deploy/setup.sh"
curl -fsS -o /dev/null -w "Site on this machine: HTTP %{http_code}\n" http://127.0.0.1:3000/ || true
