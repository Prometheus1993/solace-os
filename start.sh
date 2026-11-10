#!/usr/bin/env bash
# Start the solace dashboard locally:
#   • the API server  → http://localhost:8787/api/dashboard
#   • the Vite + React web UI    → http://localhost:5174
# Ctrl+C stops both.
set -uo pipefail

# Run from the repo root no matter where this was invoked from.
cd "$(dirname "${BASH_SOURCE[0]}")"

# Pin Node 22 (the better-sqlite3 native module is built per major): Homebrew keg, else nvm's newest v22.
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

# First-run convenience: install workspace deps if they're missing.
[ -d node_modules ] || npm install

echo "▶ API server  → http://localhost:8787/api/dashboard"
echo "▶ Web UI      → http://localhost:5174   (Ctrl+C stops both)"
echo

# API server in the background; make sure it dies when this script exits.
npm run server &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null' EXIT INT TERM

# Web dev server in the foreground — Ctrl+C here triggers the trap above.
npm run web
