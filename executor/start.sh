#!/usr/bin/env bash
# Simple startup wrapper for the Maktub executor.
# Runs the node, auto-restarts on crash with a 5-second backoff.

set -u
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "[start.sh] No .env found. Copy .env.example to .env and fill in your keys."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[start.sh] Installing dependencies…"
  npm install
fi

while true; do
  node src/index.js
  code=$?
  if [ $code -eq 0 ]; then
    echo "[start.sh] Executor exited cleanly. Bye."
    exit 0
  fi
  echo "[start.sh] Executor crashed with exit code $code. Restarting in 5s…"
  sleep 5
done
