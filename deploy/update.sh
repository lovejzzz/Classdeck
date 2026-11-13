#!/usr/bin/env bash
# Puts the latest code from GitHub online. Run as root on the server: bash /opt/questhand/deploy/update.sh
set -euo pipefail
DIR=/opt/questhand
sudo -u questhand bash -c "cd $DIR && git pull -q --ff-only && npm ci --no-audit --no-fund --loglevel=error && npm run build >/dev/null"
cp "$DIR/deploy/questhand.service" "$DIR/deploy/questhand-backup.service" /etc/systemd/system/
systemctl daemon-reload
systemctl restart questhand questhand-backup
curl -fsS -o /dev/null -w "Updated. Site on this machine: HTTP %{http_code}\n" http://127.0.0.1:3000/
