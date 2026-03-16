#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${SCRIPT_DIR}/src"
NODE_BIN="${SCRIPT_DIR}/bin/linux/bin/node"
LOG_FILE="${SCRIPT_DIR}/run.log"

if command -v pgrep >/dev/null 2>&1; then
  sslPids="$(pgrep -f "node .*resign_server\\.js" || true)"
else
  sslPids="$(ps aux | grep "node .*resign_server\\.js" | grep -v grep | awk '{print $2}')"
fi

if [ -z "$sslPids" ]; then
  echo 'Ssl resign procedure is empty.'
  if [ ! -d "$SRC_DIR" ]; then
    echo "src directory not found: $SRC_DIR"
    exit 1
  fi
  cd "$SRC_DIR"
  if [ -x "$NODE_BIN" ]; then
    sudo "$NODE_BIN" resign_server.js > "$LOG_FILE" 2>&1 &
  else
    sudo node resign_server.js > "$LOG_FILE" 2>&1 &
  fi
  echo "Started. Log: $LOG_FILE"
else
  echo "Ssl resign procedure is not empty: $sslPids"
  echo "$sslPids" | xargs kill || true
fi
