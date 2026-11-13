#!/usr/bin/env bash
# Asks for the R2 access key id and secret (typed or pasted; the secret isn't shown) and saves them in .env.local,
# then finishes the setup. Run on the server as root:  bash /opt/questhand/deploy/set-r2-keys.sh
set -euo pipefail
F=/opt/questhand/.env.local
read -r -p "R2 Access Key ID: " id
read -r -s -p "R2 Secret Access Key (hidden): " secret; echo
[ -n "$id" ] && [ -n "$secret" ] || { echo "Both are needed."; exit 1; }
tmp=$(mktemp)
grep -vE '^#? ?R2_ACCESS_KEY_ID=|^#? ?R2_SECRET_ACCESS_KEY=' "$F" > "$tmp" || true
printf 'R2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\n' "$id" "$secret" >> "$tmp"
install -m 600 -o questhand -g questhand "$tmp" "$F"; rm -f "$tmp"
echo "Saved. Finishing setup…"
bash /opt/questhand/deploy/setup.sh
