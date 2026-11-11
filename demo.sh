#!/usr/bin/env bash
# Start the Solace demo next to your real Solace, on its own ports and its own fake database:
#   • API server → http://localhost:8797   • Web UI → http://localhost:5177
# Re-seeds data/demo.sqlite on every start (so the dates are current). Never touches data/solace.sqlite.
# Garmin sync is disabled in the demo. Ctrl+C stops both.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

node22=/opt/homebrew/opt/node@22/bin
if [ ! -x "$node22/node" ]; then
  node22=$(ls -d "$HOME"/.nvm/versions/node/v22.*/bin 2>/dev/null | sort -V | tail -1)
fi
if [ -z "$node22" ] || [ ! -x "$node22/node" ]; then
  echo "✖ No Node 22 found (Homebrew node@22 keg or ~/.nvm/versions/node/v22.*)." >&2
  echo "  Install one: brew install node@22   —or—   nvm install 22" >&2
  exit 1
fi
export PATH="$node22:/opt/homebrew/bin:$PATH"
unset -f node npm npx 2>/dev/null || true

[ -d node_modules ] || npm install

export SOLACE_DEMO=1   # pins the DB to data/demo.sqlite and disables sync, whatever SOLACE_DB says
npm run cli seed -- --demo --reset || exit 1

echo "▶ Demo API → http://localhost:8797/api/dashboard"
echo "▶ Demo web → http://localhost:5177   (Ctrl+C stops both)"
echo

PORT=8797 HOST=127.0.0.1 npm run server &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null' EXIT INT TERM

SOLACE_API=http://localhost:8797 npm run dev -w web -- --port 5177 --strictPort
