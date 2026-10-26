#!/usr/bin/env bash
# Starts the whole app in a codespace: database + API (Docker), demo data, then the web app.
set -u
cd "$(dirname "$0")/.."
LOG=/tmp/dentassist-start.log
exec > >(tee -a "$LOG") 2>&1

echo "== Starting database and API (first time takes a few minutes) =="
for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done
# Links the API puts in messages and QR codes (booking, check-in, enquiry form) should open this codespace.
if [ -n "${CODESPACE_NAME:-}" ]; then
  export PUBLIC_APP_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi
docker compose up -d --build

echo "== Waiting for the API =="
for i in $(seq 1 90); do
  curl -sf http://localhost:8000/health >/dev/null 2>&1 && break
  sleep 2
done
if ! curl -sf http://localhost:8000/health >/dev/null 2>&1; then
  echo "!! The API did not start. Showing its log:"
  docker compose logs api --tail 60
fi

echo "== Loading demo data (skipped if already there) =="
docker compose exec -T api python -m app.seed || true

echo "== Starting the web app on port 3000 =="
pkill -f "vite --port=3000" 2>/dev/null || true
setsid nohup npm run dev > /tmp/dentassist-web.log 2>&1 < /dev/null &
echo "Open the PORTS tab and click the globe next to port 3000. Sign in: admin@visionedge.com / Demo@1234"
