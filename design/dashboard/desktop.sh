#!/usr/bin/env bash
# Open the SafeCart prototype UI (design/dashboard: autopilot stage, trust graph, all pages) in the team's
# Electron shell (web/electron/main.cjs loads DESKTOP_URL instead of spawning Next). No web/ code changes.
# Needs: the agent on :8000 (cd server && npm run dev) and web/ deps installed (cd web && npm install).
# Usage: bash design/dashboard/desktop.sh      (PROTO_PORT=5174 by default; works in Git Bash on Windows)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PORT="${PROTO_PORT:-5175}"
if ! curl -s -o /dev/null "http://localhost:$PORT/"; then
  PY="$(command -v python3 || command -v python)"
  (cd "$HERE" && "$PY" -m http.server "$PORT" >/dev/null 2>&1 &)
  sleep 1
fi
curl -s -o /dev/null "http://localhost:8000/health" || echo "warning: agent not reachable on :8000 (cd server && npm run dev)" >&2
cd "$ROOT/web" && DESKTOP_URL="http://localhost:$PORT/" npm run desktop
