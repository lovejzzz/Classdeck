#!/usr/bin/env bash
# Turns on invitation emails from Questhand. Asks for a Resend API key (pasted; not shown) and the address to send
# from, checks the key with Resend, saves both in .env.local, and restarts the site.
# Run on the server as root:  bash /opt/questhand/deploy/set-mail-key.sh
# Before this: in Resend, add the domain you'll send from (e.g. questhand.com), add the DNS records it shows you
# (in Cloudflare), wait until it says Verified, then create an API key with "Sending access".
set -euo pipefail
F=/opt/questhand/.env.local
read -r -s -p "Resend API key (hidden): " key; echo
key=$(printf %s "$key" | tr -d '[:space:]')
[[ "$key" =~ ^re_[A-Za-z0-9_]{20,}$ ]] || { echo "That doesn't look like a Resend API key (it starts with re_). Nothing was saved."; exit 1; }
read -r -p "Send from (e.g. Questhand <invites@questhand.com>): " from
from=$(printf %s "$from" | sed 's/^ *//;s/ *$//')
[[ "$from" =~ @ ]] || { echo "That isn't an email address. Nothing was saved."; exit 1; }
# Check the key without sending anything: list the account's domains.
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $key" https://api.resend.com/domains)
case "$code" in
  200) echo "Resend accepted the key." ;;
  401|403) echo "Resend didn't accept that key (HTTP $code). If it's a sending-only key, that's fine; continuing."; ;;
  *) echo "Couldn't reach Resend to check the key (HTTP $code). Nothing was saved."; exit 1 ;;
esac
tmp=$(mktemp)
grep -vE '^#? ?RESEND_API_KEY=|^#? ?MAIL_FROM=' "$F" > "$tmp" || true
printf 'RESEND_API_KEY=%s\nMAIL_FROM="%s"\n' "$key" "$from" >> "$tmp"
install -m 600 -o questhand -g questhand "$tmp" "$F"; rm -f "$tmp"
systemctl restart questhand
echo "Saved, and the site restarted. Teachers now see \"Email each one a personal invitation\" when they invite students."
