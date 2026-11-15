#!/usr/bin/env bash
# ==============================================================================
# 🍿 LESSWATCH — 1-Line Self-Hosted Deployment Launcher
# Runs the full interactive Animated TUI / deploy.sh orchestrator
# ==============================================================================
set -euo pipefail

CYAN='\033[38;2;0;240;255m'
PINK='\033[38;2;255;94;165m'
RESET='\033[0m'
BOLD='\033[1m'

echo -e "\n${PINK}${BOLD}🍿 Launching LESSWATCH Interactive Setup...${RESET}\n"

# 1. Ensure curl and git are installed
if ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  echo -e "${CYAN}Installing git & curl prerequisites...${RESET}"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq git curl
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y -q git curl
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y -q git curl
  fi
fi

# 2. Clone or update repository into ~/lesswatch
TARGET_DIR="${HOME}/lesswatch"
if [ -f "deploy.sh" ] && [ -f "docker-compose.yml" ]; then
  TARGET_DIR="$(pwd)"
elif [ -d "$TARGET_DIR/.git" ]; then
  echo -e "${CYAN}Syncing latest LESSWATCH repository in ${TARGET_DIR}...${RESET}"
  ( cd "$TARGET_DIR" && git pull -q origin main 2>/dev/null || true )
elif [ -d "$TARGET_DIR" ]; then
  rm -rf "$TARGET_DIR"
  echo -e "${CYAN}Cloning LESSWATCH repository into ${TARGET_DIR}...${RESET}"
  git clone -q https://github.com/hetcharusat/lesswatch.git "$TARGET_DIR"
else
  echo -e "${CYAN}Cloning LESSWATCH repository into ${TARGET_DIR}...${RESET}"
  git clone -q https://github.com/hetcharusat/lesswatch.git "$TARGET_DIR"
fi

cd "$TARGET_DIR"
chmod +x deploy.sh deploy-oci.sh 2>/dev/null || true

# 3. Hand off directly to the interactive deploy.sh with terminal keyboard connected
if [ -t 1 ] && [ ! -t 0 ] && [ -e /dev/tty ]; then
  exec sudo ./deploy.sh "$@" </dev/tty
else
  exec sudo ./deploy.sh "$@"
fi
