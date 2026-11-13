#!/usr/bin/env bash
# Asks for the R2 access key id and secret (typed or pasted; the secret isn't shown) and saves them in .env.local,
# then finishes the setup. Run on the server as root:  bash /opt/questhand/deploy/set-r2-keys.sh
set -euo pipefail
F=/opt/questhand/.env.local
read -r -p "R2 Access Key ID: " id
read -r -s -p "R2 Secret Access Key (hidden): " secret; echo
id=$(printf %s "$id" | tr -d '[:space:]'); secret=$(printf %s "$secret" | tr -d '[:space:]')
[[ "$id" =~ ^[0-9a-f]{32}$ ]] || { echo "That Access Key ID doesn't look right: it should be 32 letters and digits (0-9, a-f). Nothing was saved."; exit 1; }
[[ "$secret" =~ ^[0-9a-f]{64}$ ]] || { echo "That Secret Access Key doesn't look right: it should be 64 letters and digits (0-9, a-f). Nothing was saved."; exit 1; }
# Check the keys against the bucket before saving them.
set -a; . "$F"; set +a
code=$(cd /opt/questhand && R2_ACCESS_KEY_ID="$id" R2_SECRET_ACCESS_KEY="$secret" sudo -E -u questhand node -e '
const { AwsClient } = require("aws4fetch");
const c = new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
c.fetch(`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/?list-type=2&max-keys=1`).then((r) => console.log(r.status)).catch(() => console.log(0));')
[ "$code" = 200 ] || { echo "R2 didn't accept these keys (HTTP $code). Check you copied the Access Key ID and Secret Access Key of the questhand-server token. Nothing was saved."; exit 1; }
echo "R2 accepted the keys."
tmp=$(mktemp)
grep -vE '^#? ?R2_ACCESS_KEY_ID=|^#? ?R2_SECRET_ACCESS_KEY=' "$F" > "$tmp" || true
printf 'R2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\n' "$id" "$secret" >> "$tmp"
install -m 600 -o questhand -g questhand "$tmp" "$F"; rm -f "$tmp"
echo "Saved. Finishing setup…"
bash /opt/questhand/deploy/setup.sh
