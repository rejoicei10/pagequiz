#!/usr/bin/env bash
# Offline server-side test: runs the BUILT worker under wrangler (miniflare)
# with locally minted ES256 JWTs and a mock api-worker for Firecrawl/Anthropic,
# then drives a 3-account game through every server action (41 checks).
# No DeepSpace login or credits needed. Run from the app root:
#   bash scripts/local-harness/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$HERE/../.." && pwd)"
cd "$APP"
node "$HERE/keys.mjs" >/dev/null
npx vite build >/dev/null
PUB=$(awk 'BEGIN{ORS="\\n"} {print}' "$HERE/.keys/pub.pem")
cat > dist/pagequiz/.dev.vars <<VARS
AUTH_JWT_PUBLIC_KEY="$PUB"
AUTH_JWT_ISSUER="local-test"
API_WORKER_URL="http://127.0.0.1:4600"
PLATFORM_WORKER_URL="http://127.0.0.1:4600"
AUTH_WORKER_URL="http://127.0.0.1:4600"
APP_OWNER_JWT="owner-test-jwt"
OWNER_USER_ID="user-host"
VARS
rm -rf dist/pagequiz/.wrangler
node "$HERE/mock-api.mjs" > /tmp/pagequiz-mock.log 2>&1 &
MOCK=$!
npx wrangler dev -c dist/pagequiz/wrangler.json --port 8799 --inspector-port 9399 --ip 127.0.0.1 > /tmp/pagequiz-wrangler.log 2>&1 &
WR=$!
trap 'kill $MOCK $WR 2>/dev/null; pkill -f "wrangler dev -c dist/pagequiz" 2>/dev/null; true' EXIT
for _ in $(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:8799/robots.txt && break; sleep 1; done
node "$HERE/flow.mjs"
