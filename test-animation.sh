#!/usr/bin/env bash
# ==============================================================================
# 🍿 LESSWATCH — ASCII-Motion & Bubble Tea Animation Playground
# Standalone Testing Harness for Terminal Art, Lipgloss Styling & Motion Canvas
# ==============================================================================
set -euo pipefail

ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" 2>/dev/null | cut -d: -f6 || echo "$HOME")

NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
fi

if [ -z "$NODE_BIN" ]; then
  # 1. Ask calling user's login shell where node is
  USER_NODE=$(su - "$ACTUAL_USER" -c 'which node 2>/dev/null' 2>/dev/null || true)
  if [ -n "$USER_NODE" ] && [ -x "$USER_NODE" ]; then
    NODE_BIN="$USER_NODE"
  fi
fi

if [ -z "$NODE_BIN" ]; then
  # 2. Check Google Cloud Shell global NVM directory (/usr/local/nvm)
  FOUND_NODE=$(find /usr/local/nvm/versions/node -name node -type f -perm -u+x 2>/dev/null | tail -n 1 || true)
  if [ -n "$FOUND_NODE" ] && [ -x "$FOUND_NODE" ]; then
    NODE_BIN="$FOUND_NODE"
  fi
fi

if [ -z "$NODE_BIN" ]; then
  # 3. Check user's local NVM directory (~/.nvm)
  FOUND_NODE=$(find "$ACTUAL_HOME/.nvm/versions/node" -name node -type f -perm -u+x 2>/dev/null | tail -n 1 || true)
  if [ -n "$FOUND_NODE" ] && [ -x "$FOUND_NODE" ]; then
    NODE_BIN="$FOUND_NODE"
  fi
fi

if [ -z "$NODE_BIN" ]; then
  # 4. Check system standard paths
  for p in /usr/bin/node /usr/local/bin/node /opt/node/bin/node; do
    if [ -x "$p" ]; then
      NODE_BIN="$p"
      break
    fi
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo "✖ Node.js is required to run the interactive 30 FPS animation playground."
  echo "  Please install node (e.g. nvm install 20) and try again."
  exit 1
fi

export PATH="$(dirname "$NODE_BIN"):$PATH"
exec "$NODE_BIN" scripts/lesswatch-install-v2.mjs "$@"

