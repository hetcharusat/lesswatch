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

as_root() {
  if [ "${EUID:-$(id -u)}" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo 'Root access is needed to install prerequisites. Install sudo or run this launcher as root.' >&2
    exit 1
  fi
}

# 1. Ensure curl and git are installed
if ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  echo -e "${CYAN}Installing git & curl prerequisites...${RESET}"
  if command -v apt-get >/dev/null 2>&1; then
    as_root apt-get update -qq
    as_root apt-get install -y -qq git curl
  elif command -v dnf >/dev/null 2>&1; then
    as_root dnf install -y -q git curl
  elif command -v yum >/dev/null 2>&1; then
    as_root yum install -y -q git curl
  else
    echo 'Install git and curl with your package manager, then run this launcher again.' >&2
    exit 1
  fi
fi
command -v git >/dev/null 2>&1 && command -v curl >/dev/null 2>&1 || {
  echo 'git and curl are required; prerequisite installation did not complete.' >&2
  exit 1
}

# 2. Clone or update repository into ~/lesswatch
TARGET_DIR="${LESSWATCH_INSTALL_DIR:-${HOME}/lesswatch}"
REPO_URL="${LESSWATCH_REPO_URL:-https://github.com/hetcharusat/lesswatch.git}"
REPO_BRANCH="${LESSWATCH_BRANCH:-main}"
if [ -f "deploy.sh" ] && [ -f "docker-compose.yml" ]; then
  TARGET_DIR="$(pwd)"
elif [ -e "$TARGET_DIR/.git" ]; then
  local_changes=$(git -C "$TARGET_DIR" status --porcelain)
  current_branch=$(git -C "$TARGET_DIR" symbolic-ref --short HEAD 2>/dev/null || true)
  if [ -n "$local_changes" ] || [ "$current_branch" != "$REPO_BRANCH" ]; then
    echo -e "${CYAN}Using the existing checkout without updating it (local changes or a different branch).${RESET}"
  else
    echo -e "${CYAN}Updating LESSWATCH in ${TARGET_DIR}...${RESET}"
    if ! git -C "$TARGET_DIR" pull --ff-only origin "$REPO_BRANCH"; then
      echo 'Update failed. Resolve the Git/network error above and rerun; deployment has not started.' >&2
      exit 1
    fi
  fi
else
  if [ -e "$TARGET_DIR" ] && { [ ! -d "$TARGET_DIR" ] || [ -n "$(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]; }; then
    echo "The installation path already contains files: $TARGET_DIR" >&2
    echo 'Nothing was removed. Run from your existing LESSWATCH checkout, or choose an empty path with LESSWATCH_INSTALL_DIR.' >&2
    exit 1
  fi
  echo -e "${CYAN}Cloning LESSWATCH repository into ${TARGET_DIR}...${RESET}"
  git clone --branch "$REPO_BRANCH" --single-branch "$REPO_URL" "$TARGET_DIR"
fi

cd "$TARGET_DIR"
if [ ! -f deploy.sh ] || [ ! -f docker-compose.yml ] || [ ! -f scripts/ensure-docker.sh ]; then
  echo 'This directory is not a complete LESSWATCH checkout. Deployment has not started.' >&2
  exit 1
fi
chmod +x deploy.sh deploy-oci.sh 2>/dev/null || true

# 3. Hand off directly to the interactive deploy.sh with terminal keyboard connected
if [ "${EUID:-$(id -u)}" -eq 0 ]; then
  DEPLOY=(bash ./deploy.sh)
elif command -v sudo >/dev/null 2>&1; then
  DEPLOY=(sudo -E bash ./deploy.sh)
else
  echo 'Run this launcher as root or install sudo to continue with Docker setup.' >&2
  exit 1
fi
if [ -t 1 ] && [ ! -t 0 ] && [ -e /dev/tty ]; then
  exec "${DEPLOY[@]}" "$@" </dev/tty
else
  exec "${DEPLOY[@]}" "$@"
fi
