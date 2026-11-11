#!/usr/bin/env bash
# Container start: prepare the DB, then run the API server (127.0.0.1 inside the container) and Vite
# (0.0.0.0 inside the container). Only Vite's port is published, and it proxies /api to the server.
#   SOLACE_DEMO=1 (default)  fake data in data/demo.sqlite, seeded once; Garmin sync disabled
#   SOLACE_DEMO=0            your own database data/solace.sqlite (seed is idempotent)
set -euo pipefail

if [ "${SOLACE_DEMO:-1}" = "0" ]; then
  unset SOLACE_DEMO
  npm run cli seed
else
  export SOLACE_DEMO=1
  [ -f data/demo.sqlite ] || npm run cli seed -- --demo
fi

HOST=127.0.0.1 PORT=8787 npm run server &
server_pid=$!
SOLACE_API=http://127.0.0.1:8787 npm run dev -w web -- --host 0.0.0.0 --port 5174 --strictPort &
web_pid=$!

trap 'kill "$server_pid" "$web_pid" 2>/dev/null' TERM INT
wait -n
kill "$server_pid" "$web_pid" 2>/dev/null || true
