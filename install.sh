#!/usr/bin/env bash
# ==============================================================================
# 🍿 Watch Together - Universal Cloud & VM Orchestrator (v4.0 Impeccable Edition)
# Arrow-Key Interactive Terminal UI, Cyber Motion Animations & Cloud VM Engine
# ==============================================================================
set -euo pipefail

# If piped via curl (stdin is not a tty), reconnect stdin to terminal so interactive arrow keys work
if [ -t 1 ] && [ ! -t 0 ] && [ -e /dev/tty ]; then
  exec </dev/tty
fi

# If running outside repository root, clone repository and invoke deploy.sh from inside it
if [ ! -f "docker-compose.yml" ] || [ ! -f "server.js" ]; then
  echo -e "\033[38;2;255;0;122m🍿 Fetching LESSWATCH repository...\033[0m"
  if ! command -v git >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -qq && sudo apt-get install -y -qq git
    elif command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y -q git
    elif command -v yum >/dev/null 2>&1; then
      sudo yum install -y -q git
    fi
  fi
  if [ ! -d "lesswatch" ]; then
    git clone https://github.com/hetcharusat/lesswatch.git lesswatch
  fi
  cd lesswatch
  chmod +x deploy.sh install.sh 2>/dev/null || true
  exec sudo ./deploy.sh "$@"
fi

# ANSI Styling Palette (Cyber Pink & Neon Cyan)
ESC="\033"
CYAN="${ESC}[38;2;0;240;255m"
PINK="${ESC}[38;2;255;0;122m"
ROSE="${ESC}[38;2;244;114;182m"
PURPLE="${ESC}[38;2;168;85;247m"
GREEN="${ESC}[38;2;16;185;129m"
AMBER="${ESC}[38;2;245;158;11m"
GRAY="${ESC}[38;2;148;163;184m"
DARK_GRAY="${ESC}[38;2;71;85;105m"
WHITE="${ESC}[38;2;255;255;255m"
BG_PINK="${ESC}[48;2;255;0;122m"
BG_DARK="${ESC}[48;2;24;24;27m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
RESET="${ESC}[0m"

# Ensure cursor restoration on exit or interrupt
restore_cursor() {
  echo -ne "\033[?25h" 2>/dev/null || true
}
trap restore_cursor EXIT INT TERM

# Silence Google Cloud Shell apt warning upfront if in Cloud Shell
mkdir -p ~/.cloudshell 2>/dev/null || true
touch ~/.cloudshell/no-apt-get-warning 2>/dev/null || true

# Root check: auto-elevate with sudo if running as standard user
if [ "$EUID" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo -E bash "$0" "$@"
  else
    echo -e "\n${PINK}${BOLD}✖ Permission Denied:${RESET} Please run this installer with sudo:"
    echo -e "  ${CYAN}${BOLD}sudo ./deploy.sh${RESET}\n"
    exit 1
  fi
fi

ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" 2>/dev/null | cut -d: -f6 || echo "$HOME")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "$PWD")"

NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
fi

if [ -z "$NODE_BIN" ]; then
  # 1. Ask the calling user's login shell where node is (picks up user's active nvm / node)
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
  # 4. Check system standard locations
  for p in /usr/bin/node /usr/local/bin/node /opt/node/bin/node; do
    if [ -x "$p" ]; then
      NODE_BIN="$p"
      break
    fi
  done
fi

# Pre-pull cloudflared, node base image, and livekit in the background so build & tunnel launch are instantaneous
( docker pull cloudflare/cloudflared:latest >/dev/null 2>&1 & ) 2>/dev/null || true
( docker pull node:20-bookworm-slim >/dev/null 2>&1 & ) 2>/dev/null || true
( docker pull livekit/livekit-server:latest >/dev/null 2>&1 & ) 2>/dev/null || true

# If Node.js is available, hand off directly to next-gen Animated TUI CLI
if [ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ]; then
  export PATH="$(dirname "$NODE_BIN"):$PATH"
  if [ -f "$SCRIPT_DIR/scripts/deploy-tui.mjs" ]; then
    exec "$NODE_BIN" "$SCRIPT_DIR/scripts/deploy-tui.mjs" "$@"
  elif [ -f "scripts/deploy-tui.mjs" ]; then
    exec "$NODE_BIN" scripts/deploy-tui.mjs "$@"
  fi
fi

# Attempt quick install of nodejs on Debian/Ubuntu to unlock modern Animated TUI
if command -v apt-get >/dev/null 2>&1; then
  ( apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq nodejs >/dev/null 2>&1 ) || true
  if command -v node >/dev/null 2>&1; then
    if [ -f "$SCRIPT_DIR/scripts/deploy-tui.mjs" ]; then
      exec node "$SCRIPT_DIR/scripts/deploy-tui.mjs" "$@"
    elif [ -f "scripts/deploy-tui.mjs" ]; then
      exec node scripts/deploy-tui.mjs "$@"
    fi
  fi
fi

# ------------------------------------------------------------------------------
# 1. ANIMATION UTILITIES
# ------------------------------------------------------------------------------

# Typewriter effect for headers
typewriter() {
  local text="$1"
  local delay="${2:-0.015}"
  for (( i=0; i<${#text}; i++ )); do
    echo -ne "${text:$i:1}"
    sleep "$delay"
  done
  echo ""
}

# Animated Orbital Braille Spinner
spin_cmd() {
  local msg="$1"
  shift
  local cmd="$*"

  echo -ne "\033[?25l" # Hide cursor
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local pid

  # Execute command in background
  eval "$cmd" > /tmp/wt_cmd.log 2>&1 &
  pid=$!

  local i=0
  local start_time
  start_time=$(date +%s)

  while kill -0 "$pid" 2>/dev/null; do
    local now
    now=$(date +%s)
    local elapsed=$((now - start_time))
    local frame="${frames[$((i % 10))]}"
    echo -ne "\r  ${PINK}${BOLD}${frame}${RESET} ${msg} ${GRAY}(${elapsed}s)${RESET}\033[K"
    i=$((i + 1))
    sleep 0.08
  done

  wait "$pid"
  local exit_code=$?
  local total_time
  total_time=$(($(date +%s) - start_time))

  if [ "$exit_code" -eq 0 ]; then
    echo -ne "\r  ${GREEN}${BOLD}✔${RESET} ${msg} ${DARK_GRAY}(Done in ${total_time}s)${RESET}\033[K\n"
  else
    echo -ne "\r  ${PINK}${BOLD}✖${RESET} ${msg} ${AMBER}(Failed - exit code ${exit_code})${RESET}\033[K\n"
    if [ -f /tmp/wt_cmd.log ]; then
      echo -e "${GRAY}--- Error Details (last 6 lines) ---${RESET}"
      tail -n 6 /tmp/wt_cmd.log | sed "s/^/    ${DARK_GRAY}│${RESET} /"
      echo -e "${GRAY}------------------------------------${RESET}"
    fi
  fi
  echo -ne "\033[?25h" # Restore cursor
  return "$exit_code"
}

# ------------------------------------------------------------------------------
# 2. PURE BASH ARROW-KEY INTERACTIVE SELECTOR
# ------------------------------------------------------------------------------
# Usage: select_menu "Prompt title" selected_index_var "Option 1" "Sub 1" "Option 2" "Sub 2" ...
select_menu() {
  local prompt_title="$1"
  local -n out_var="$2"
  shift 2

  local -a titles=()
  local -a subtitles=()

  while [ "$#" -gt 0 ]; do
    titles+=("$1")
    subtitles+=("${2:-}")
    shift 2 2>/dev/null || shift 1
  done

  local count=${#titles[@]}
  local current=0
  echo -ne "\033[?25l" # Hide cursor

  echo -e "\n${PURPLE}${BOLD}❯ ${prompt_title}${RESET}"
  echo -e "${DARK_GRAY}  Use ↑/↓ arrow keys (or j/k) to navigate, press [Enter] to choose:${RESET}"

  # Reserve space for items
  for (( i=0; i<count; i++ )); do
    echo ""
    if [ -n "${subtitles[$i]}" ]; then echo ""; fi
  done

  # Calculate total lines printed for cursor rewind
  local total_lines=0
  for (( i=0; i<count; i++ )); do
    total_lines=$((total_lines + 1))
    if [ -n "${subtitles[$i]}" ]; then total_lines=$((total_lines + 1)); fi
  done

  # Redraw menu function
  redraw() {
    # Move cursor up
    echo -ne "\033[${total_lines}A"

    for (( i=0; i<count; i++ )); do
      if [ "$i" -eq "$current" ]; then
        echo -e "\r  ${PINK}${BOLD}❯ [●] ${CYAN}${BOLD}${titles[$i]}${RESET}\033[K"
        if [ -n "${subtitles[$i]}" ]; then
          echo -e "\r      ${ROSE}${subtitles[$i]}${RESET}\033[K"
        fi
      else
        echo -e "\r    ${DARK_GRAY}[○] ${GRAY}${titles[$i]}${RESET}\033[K"
        if [ -n "${subtitles[$i]}" ]; then
          echo -e "\r      ${DARK_GRAY}${subtitles[$i]}${RESET}\033[K"
        fi
      fi
    done
  }

  redraw

  # Key listening loop
  while true; do
    local key=""
    IFS= read -rsn1 key 2>/dev/null || true

    if [[ "$key" == $'\x1b' ]]; then
      local rest=""
      IFS= read -rsn2 -t 0.5 rest 2>/dev/null || true
      key+="$rest"
    fi

    case "$key" in
      $'\x1b[A'|[kK]) # Up
        current=$(( (current - 1 + count) % count ))
        redraw
        ;;
      $'\x1b[B'|[jJ]|$'\t') # Down or Tab
        current=$(( (current + 1) % count ))
        redraw
        ;;
      [1-9]) # Number hotkey
        if [ "$key" -le "$count" ]; then
          current=$((key - 1))
          break
        fi
        ;;
      $'\n'|$'\r'|" ") # Enter or Space
        break
        ;;
      *)
        # Ignore any unrecognized control character without exiting
        ;;
    esac
  done

  echo -ne "\033[?25h" # Restore cursor
  out_var=$current
  echo -e "  ${GREEN}✔ Confirmed:${RESET} ${WHITE}${BOLD}${titles[$current]}${RESET}\n"
}

# Multi-select Checkbox Menu
checkbox_menu() {
  local prompt_title="$1"
  local -n _out_ref="$2"
  shift 2

  local -a titles=()
  local -a subtitles=()
  local -a states=()

  while [ $# -gt 0 ]; do
    titles+=("$1")
    subtitles+=("$2")
    states+=("$3")
    shift 3
  done

  local count=${#titles[@]}
  local current=0
  echo -ne "\033[?25l" # Hide cursor

  echo -e "\n${PURPLE}${BOLD}❯ ${prompt_title}${RESET}"
  echo -e "${DARK_GRAY}  [Space] toggle [✔] · [1-$count] direct toggle · [a] toggle all · [Enter] confirm:${RESET}"

  local total_lines=0
  for (( i=0; i<count; i++ )); do
    total_lines=$((total_lines + 1))
    if [ -n "${subtitles[$i]}" ]; then total_lines=$((total_lines + 1)); fi
  done

  for (( i=0; i<total_lines; i++ )); do echo ""; done

  redraw() {
    echo -ne "\033[${total_lines}A"
    for (( i=0; i<count; i++ )); do
      local box
      if [ "${states[$i]}" -eq 1 ]; then
        box="${GREEN}${BOLD}[✔]${RESET}"
      else
        box="${DARK_GRAY}[ ]${RESET}"
      fi

      if [ "$i" -eq "$current" ]; then
        echo -e "\r  ${PINK}${BOLD}❯${RESET} ${box} ${CYAN}${BOLD}${titles[$i]}${RESET}\033[K"
        if [ -n "${subtitles[$i]}" ]; then
          echo -e "\r      ${ROSE}${subtitles[$i]}${RESET}\033[K"
        fi
      else
        echo -e "\r    ${box} ${GRAY}${titles[$i]}${RESET}\033[K"
        if [ -n "${subtitles[$i]}" ]; then
          echo -e "\r      ${DARK_GRAY}${subtitles[$i]}${RESET}\033[K"
        fi
      fi
    done
  }

  redraw

  while true; do
    local key=""
    IFS= read -rsn1 key 2>/dev/null || true

    if [[ "$key" == $'\x1b' ]]; then
      local rest=""
      IFS= read -rsn2 -t 0.5 rest 2>/dev/null || true
      key+="$rest"
    fi

    case "$key" in
      $'\x1b[A'|[kK]) # Up
        current=$(( (current - 1 + count) % count ))
        redraw
        ;;
      $'\x1b[B'|[jJ]|$'\t') # Down or Tab
        current=$(( (current + 1) % count ))
        redraw
        ;;
      " ") # Space toggle
        if [ "${states[$current]}" -eq 1 ]; then
          states[$current]=0
        else
          states[$current]=1
        fi
        redraw
        ;;
      [aA]) # Toggle all
        local any_off=0
        for (( i=0; i<count; i++ )); do
          if [ "${states[$i]}" -eq 0 ]; then any_off=1; break; fi
        done
        for (( i=0; i<count; i++ )); do
          states[$i]=$any_off
        done
        redraw
        ;;
      [1-9]) # Number direct toggle
        if [ "$key" -le "$count" ]; then
          local idx=$((key - 1))
          current=$idx
          if [ "${states[$idx]}" -eq 1 ]; then
            states[$idx]=0
          else
            states[$idx]=1
          fi
          redraw
        fi
        ;;
      $'\n'|$'\r') # Enter confirm
        break
        ;;
      *)
        ;;
    esac
  done

  echo -ne "\033[?25h" # Restore cursor
  local res=""
  for (( i=0; i<count; i++ )); do
    if [ -n "$res" ]; then res+=","; fi
    res+="${states[$i]}"
  done
  _out_ref="$res"

  local active_n=0
  for (( i=0; i<count; i++ )); do
    if [ "${states[$i]}" -eq 1 ]; then active_n=$((active_n + 1)); fi
  done
  echo -e "  ${GREEN}✔ Confirmed:${RESET} ${WHITE}${BOLD}${active_n} of ${count} modules enabled${RESET}\n"
}

# ------------------------------------------------------------------------------
# 3. OPENING CYBER BANNER & DETECTION
# ------------------------------------------------------------------------------
clear 2>/dev/null || true
echo -e "${CYAN}${BOLD}"
cat << "EOF"
┌─────────────────────────────────────────────────────────────────────────────┐
│  🍿  L E S S W A T C H                                      v4.2 Production │
│  Minimalist Synchronized Streaming & Cloud Desktop Engine                   │
└─────────────────────────────────────────────────────────────────────────────┘
EOF
echo -e "${RESET}"
echo -e "${GRAY}    Sub-second synced rooms • Shared Chromium • Native Torrent/URL Downloader${RESET}\n"

# Environment auto-detection
DETECTED_ENV="Standard Linux Cloud VM"
IS_CLOUDSHELL=false

if [ -n "${DEVSHELL_CLIENT_PORT:-}" ] || grep -q 'cloudshell' /etc/hostname 2>/dev/null || [ -d "/google/devshell" ]; then
  IS_CLOUDSHELL=true
  DETECTED_ENV="Google Cloud Shell (Ephemeral Web Sandbox)"
elif curl -s -m 1 http://169.254.169.254/opc/v1/instance/ 2>/dev/null | grep -q "displayName"; then
  DETECTED_ENV="Oracle Cloud Infrastructure (OCI)"
elif curl -s -m 1 http://169.254.169.254/latest/meta-data/ 2>/dev/null | grep -q "instance-id"; then
  DETECTED_ENV="Amazon Web Services (AWS EC2)"
elif [ -f "/etc/digitalocean" ] || curl -s -m 1 http://169.254.169.254/metadata/v1/ 2>/dev/null | grep -q "droplet_id"; then
  DETECTED_ENV="DigitalOcean Droplet"
elif [ -f "/etc/hetzner" ]; then
  DETECTED_ENV="Hetzner Cloud VPS"
fi

echo -e "${GRAY}┌─────────────────────────────────────────────────────────────────────────────┐${RESET}"
echo -e "${GRAY}│${RESET}  ${BOLD}Environment Check:${RESET} ${CYAN}${BOLD}${DETECTED_ENV}${RESET}"
echo -e "${GRAY}│${RESET}  ${DARK_GRAY}Target System User:${RESET} ${ACTUAL_USER} (${ACTUAL_HOME})"
echo -e "${GRAY}└─────────────────────────────────────────────────────────────────────────────┘${RESET}"

# ------------------------------------------------------------------------------
# 4. INTERACTIVE CONFIGURATION MENUS (Arrow-Key Driven)
# ------------------------------------------------------------------------------

# Step 1: Target Platform (Dedicated VM is Primary / Recommended)
select_menu "Select Deployment Strategy" PLATFORM_CHOICE \
  "🚀 Dedicated Linux Cloud VM (Ubuntu VPS / OCI / AWS / DigitalOcean)" \
  "PRIMARY RECOMMENDED: 24/7 background hosting, permanent storage, auto-start on boot." \
  "⚡ Google Cloud Shell / Web Sandbox" \
  "ALTERNATIVE METHOD: Fast temporary test sandbox. Auto-configures Web Preview on port 8080." \
  "💻 Local Machine / Docker Desktop" \
  "Self-hosted local workspace instance."

# Step 2: HTTP Web Port
DEFAULT_PORT=3000
if [ "$PLATFORM_CHOICE" -eq 1 ] || [ "$IS_CLOUDSHELL" = true ]; then
  select_menu "Select Public HTTP Port" PORT_CHOICE \
    "Port 8080 (Cloud Shell Web Preview standard)" \
    "Recommended: Google Cloud Shell Web Preview connects in 1 click without port changes." \
    "Port 3000 (Default Watch Together port)" \
    "Standard internal application port." \
    "Port 80 (Standard Web HTTP)" \
    "Binds directly to port 80 (requires nothing else on port 80)." \
    "Custom Port..." \
    "Specify your own custom numeric port."
else
  select_menu "Select Public HTTP Port" PORT_CHOICE \
    "Port 3000 (Standard Recommended for VPS)" \
    "Default port. Ideal for VPS direct IP access or reverse proxies." \
    "Port 8080 (Alternative Web Port)" \
    "Secondary web port." \
    "Port 80 (Standard Web HTTP)" \
    "Binds directly to standard HTTP port 80." \
    "Custom Port..." \
    "Specify your own custom numeric port."
fi

TARGET_PORT=3000
case "$PORT_CHOICE" in
  0)
    if [ "$PLATFORM_CHOICE" -eq 1 ] || [ "$IS_CLOUDSHELL" = true ]; then TARGET_PORT=8080; else TARGET_PORT=3000; fi
    ;;
  1)
    if [ "$PLATFORM_CHOICE" -eq 1 ] || [ "$IS_CLOUDSHELL" = true ]; then TARGET_PORT=3000; else TARGET_PORT=8080; fi
    ;;
  2)
    TARGET_PORT=80
    ;;
  3)
    read -rp "  Enter desired port number (e.g. 5000): " TARGET_PORT || TARGET_PORT=3000
    TARGET_PORT="${TARGET_PORT:-3000}"
    ;;
esac

# Step 3: Modules Checkbox Menu
checkbox_menu "Select LESSWATCH Modules & Components" MODULE_RESULTS \
  "Shared Chromium Virtual Browser (Neko)" "Synced party browser tabs. Auto-sleeps when idle to save RAM." 1 \
  "Server Media Downloader (aria2c + yt-dlp)" "High-speed torrent daemon & direct YouTube/web stream extractor." 1 \
  "Cloudflare Public HTTPS Quick Tunnel" "Instant shareable HTTPS URL with SSL without opening router ports." 1 \
  "LiveKit Voice & Room SFU Server" "Sub-second spatial audio/video party channels with echo cancellation." 1 \
  "Media Library & Streaming Transcoder" "Direct streaming for MKV, MP4, HLS, WebM + subtitle auto-search." 1 \
  "Always-On Browser Mode (Pre-warmed in RAM)" "Keeps Neko hot in memory (~600MB permanent RAM instead of sleep)." 0

IFS=',' read -r NEKO_ON DL_ON TUNNEL_ON LIVEKIT_ON STORAGE_ON WARM_ON <<< "$MODULE_RESULTS"

ENABLE_NEKO=false
[ "$NEKO_ON" = "1" ] && ENABLE_NEKO=true

NEKO_PROFILE="ondemand"
if [ "$ENABLE_NEKO" = false ]; then
  NEKO_PROFILE="disabled"
elif [ "$WARM_ON" = "1" ]; then
  NEKO_PROFILE="always"
fi

ENABLE_DOWNLOADER=false
[ "$DL_ON" = "1" ] && ENABLE_DOWNLOADER=true

ENABLE_TUNNEL=false
[ "$TUNNEL_ON" = "1" ] && ENABLE_TUNNEL=true

ENABLE_LIVEKIT=true
[ "$LIVEKIT_ON" = "0" ] && ENABLE_LIVEKIT=false

CUSTOM_DOMAIN=""

# ------------------------------------------------------------------------------
# 5. SYSTEM TUNING & DEPENDENCIES
# ------------------------------------------------------------------------------
echo -e "${PURPLE}${BOLD}⚡ Orchestrating System Infrastructure...${RESET}"

# Swap optimization
TOTAL_RAM_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "4000")
if [ "$TOTAL_RAM_MB" -lt 2500 ] && [ ! -f /swapfile ]; then
  spin_cmd "Configuring 2GB high-speed swap for smooth transcoding" \
    "(fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048) && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && (grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab) && sysctl vm.swappiness=10"
else
  echo -e "  ${GREEN}✔${RESET} Memory capacity verified (${TOTAL_RAM_MB}MB RAM)"
fi

# Ensure Docker Engine
if ! command -v docker >/dev/null 2>&1; then
  spin_cmd "Installing modern Docker Engine" \
    "curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sh /tmp/get-docker.sh && usermod -aG docker $ACTUAL_USER && systemctl enable docker && systemctl start docker"
else
  echo -e "  ${GREEN}✔${RESET} Docker Engine is operational"
fi

# Open Firewall Ports
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  spin_cmd "Configuring UFW firewall rules" \
    "ufw allow ${TARGET_PORT}/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 7880/tcp && ufw allow 7881/tcp && ufw allow 50000:50200/udp && ufw allow 52000:52100/udp"
elif command -v iptables >/dev/null 2>&1; then
  iptables -I INPUT 1 -p tcp --dport "$TARGET_PORT" -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p tcp --dport 7880 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p tcp --dport 7881 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p udp --dport 50000:50200 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p udp --dport 52000:52100 -j ACCEPT 2>/dev/null || true
  echo -e "  ${GREEN}✔${RESET} Network firewall ports opened"
fi

# ------------------------------------------------------------------------------
# 6. SECURE ENVIRONMENT CONFIGURATION
# ------------------------------------------------------------------------------
PUBLIC_IP=$(curl -s -m 2 https://api.ipify.org 2>/dev/null || echo "127.0.0.1")

spin_cmd "Generating cryptographic secrets & .env parameters" "
  if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || touch .env
  fi
  RANDOM_SECRET=\$(openssl rand -hex 24 2>/dev/null || date +%s%N | sha256sum | head -c 48)
  RANDOM_VAULT=\$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | head -c 64)
  sed -i 's/change-this-to-a-long-random-secret-key/'\"\$RANDOM_SECRET\"'/g' .env 2>/dev/null || true
  if grep -q '^VAULT_SECRET=' .env; then
    sed -i 's/^VAULT_SECRET=.*/VAULT_SECRET='\"\$RANDOM_VAULT\"'/' .env
  else
    echo 'VAULT_SECRET='\"\$RANDOM_VAULT\" >> .env
  fi
  USER_UID=\$(id -u \"$ACTUAL_USER\" 2>/dev/null || echo '1000')
  USER_GID=\$(id -g \"$ACTUAL_USER\" 2>/dev/null || echo '1000')
  sed -i \"s/^PUID=.*/PUID=\${USER_UID}/\" .env 2>/dev/null || echo \"PUID=\${USER_UID}\" >> .env
  sed -i \"s/^PGID=.*/PGID=\${USER_GID}/\" .env 2>/dev/null || echo \"PGID=\${USER_GID}\" >> .env
  if grep -q '^PORT=' .env 2>/dev/null; then
    sed -i \"s/^PORT=.*/PORT=${TARGET_PORT}/\" .env
  else
    echo \"PORT=${TARGET_PORT}\" >> .env
  fi
  if [ -n \"$CUSTOM_DOMAIN\" ]; then
    if grep -q '^CADDY_DOMAIN=' .env 2>/dev/null; then
      sed -i \"s/^CADDY_DOMAIN=.*/CADDY_DOMAIN=${CUSTOM_DOMAIN}/\" .env
    else
      echo \"CADDY_DOMAIN=${CUSTOM_DOMAIN}\" >> .env
    fi
  fi
  IS_TUNNEL_OR_CLOUDSHELL=false
  if [ \"$PLATFORM_CHOICE\" -eq 1 ] || [ \"$ENABLE_TUNNEL\" = true ] || [ \"$IS_CLOUDSHELL\" = true ]; then
    IS_TUNNEL_OR_CLOUDSHELL=true
  fi

  if [ \"$IS_TUNNEL_OR_CLOUDSHELL\" = false ] && [ -n \"$PUBLIC_IP\" ] && [ \"$PUBLIC_IP\" != \"127.0.0.1\" ]; then
    if grep -q '^NEKO_NAT1TO1=' .env 2>/dev/null; then
      sed -i \"s/^NEKO_NAT1TO1=.*/NEKO_NAT1TO1=${PUBLIC_IP}/\" .env
    else
      echo \"NEKO_NAT1TO1=${PUBLIC_IP}\" >> .env
    fi
  else
    if grep -q '^NEKO_NAT1TO1=' .env 2>/dev/null; then
      sed -i \"s/^NEKO_NAT1TO1=.*/NEKO_NAT1TO1=/\" .env
    else
      echo \"NEKO_NAT1TO1=\" >> .env
    fi
  fi
  if grep -q '^NEKO_PASSWORD=' .env 2>/dev/null; then
    sed -i \"s/^NEKO_PASSWORD=.*/NEKO_PASSWORD=admin/\" .env
  else
    echo \"NEKO_PASSWORD=admin\" >> .env
  fi
  if grep -q '^NEKO_ADMIN_PASSWORD=' .env 2>/dev/null; then
    sed -i \"s/^NEKO_ADMIN_PASSWORD=.*/NEKO_ADMIN_PASSWORD=admin/\" .env
  else
    echo \"NEKO_ADMIN_PASSWORD=admin\" >> .env
  fi
  DEFAULT_ICESERVERS='[{\"urls\":[\"stun:stun.l.google.com:19302\",\"stun:stun1.l.google.com:19302\",\"stun:stun2.l.google.com:19302\"]},{\"urls\":[\"turn:openrelay.metered.ca:443?transport=tcp\",\"turn:openrelay.metered.ca:80\",\"turn:openrelay.metered.ca:443\"],\"username\":\"openrelayproject\",\"credential\":\"openrelayproject\"}]'
  ICE_MODE=0
  if [ \"$PLATFORM_CHOICE\" -eq 0 ] && [ \"$IS_TUNNEL_OR_CLOUDSHELL\" = false ] && [ -n \"$PUBLIC_IP\" ] && [ \"$PUBLIC_IP\" != \"127.0.0.1\" ]; then
    ICE_MODE=1
  fi
  if grep -q '^NEKO_ICELITE=' .env 2>/dev/null; then
    sed -i \"s/^NEKO_ICELITE=.*/NEKO_ICELITE=\${ICE_MODE}/\" .env
  else
    echo \"NEKO_ICELITE=\${ICE_MODE}\" >> .env
  fi
  if grep -q '^NEKO_WEBRTC_ICELITE=' .env 2>/dev/null; then
    sed -i \"s/^NEKO_WEBRTC_ICELITE=.*/NEKO_WEBRTC_ICELITE=\${ICE_MODE}/\" .env
  else
    echo \"NEKO_WEBRTC_ICELITE=\${ICE_MODE}\" >> .env
  fi
  if [ \"$IS_TUNNEL_OR_CLOUDSHELL\" = true ]; then
    SCREEN_RES=\"960x540@20\"
    VIDEO_BR=\"1500\"
    MAX_FPS=\"20\"
  else
    SCREEN_RES=\"1280x720@30\"
    VIDEO_BR=\"3072\"
    MAX_FPS=\"30\"
  fi
  if grep -q '^NEKO_SCREEN=' .env 2>/dev/null; then
    sed -i \"s/^NEKO_SCREEN=.*/NEKO_SCREEN=\${SCREEN_RES}/\" .env
  else
    echo \"NEKO_SCREEN=\${SCREEN_RES}\" >> .env
  fi
  if grep -q '^NEKO_DESKTOP_SCREEN=' .env 2>/dev/null; then
    sed -i \"s/^NEKO_DESKTOP_SCREEN=.*/NEKO_DESKTOP_SCREEN=\${SCREEN_RES}/\" .env
  else
    echo \"NEKO_DESKTOP_SCREEN=\${SCREEN_RES}\" >> .env
  fi
  if grep -q '^NEKO_VIDEO_BITRATE=' .env 2>/dev/null; then
    sed -i \"s/^NEKO_VIDEO_BITRATE=.*/NEKO_VIDEO_BITRATE=\${VIDEO_BR}/\" .env
  else
    echo \"NEKO_VIDEO_BITRATE=\${VIDEO_BR}\" >> .env
  fi
  if grep -q '^NEKO_MAX_FPS=' .env 2>/dev/null; then
    sed -i \"s/^NEKO_MAX_FPS=.*/NEKO_MAX_FPS=\${MAX_FPS}/\" .env
  else
    echo \"NEKO_MAX_FPS=\${MAX_FPS}\" >> .env
  fi
  if grep -q '^NEKO_WEBRTC_ICESERVERS_FRONTEND=' .env 2>/dev/null; then
    sed -i \"s|^NEKO_WEBRTC_ICESERVERS_FRONTEND=.*|NEKO_WEBRTC_ICESERVERS_FRONTEND='\${DEFAULT_ICESERVERS}'|\" .env
  else
    echo \"NEKO_WEBRTC_ICESERVERS_FRONTEND='\${DEFAULT_ICESERVERS}'\" >> .env
  fi
  if grep -q '^NEKO_WEBRTC_ICESERVERS_BACKEND=' .env 2>/dev/null; then
    sed -i \"s|^NEKO_WEBRTC_ICESERVERS_BACKEND=.*|NEKO_WEBRTC_ICESERVERS_BACKEND='\${DEFAULT_ICESERVERS}'|\" .env
  else
    echo \"NEKO_WEBRTC_ICESERVERS_BACKEND='\${DEFAULT_ICESERVERS}'\" >> .env
  fi
  mkdir -p ./data ./downloads
  chown -R \"\$ACTUAL_USER:\$ACTUAL_USER\" ./data ./downloads 2>/dev/null || true
"

# ------------------------------------------------------------------------------
# 7. CONTAINER BUILD & LAUNCH
# ------------------------------------------------------------------------------
DOCKER_CMD="docker compose up -d --build"
if [ -n "$CUSTOM_DOMAIN" ] && [ "$PLATFORM_CHOICE" -ne 1 ]; then
  DOCKER_CMD="docker compose --profile caddy up -d --build"
fi

spin_cmd "Compiling & launching Watch Together services" "$DOCKER_CMD"

# If Neko enabled, pre-warm asynchronously for on-demand or with live progress for always-running
if [ "$ENABLE_NEKO" = true ]; then
  if [ "$NEKO_PROFILE" = "always" ]; then
    echo -e "  ${CYAN}📥 Downloading Neko Chromium browser image (live download)...${RESET}"
    docker compose --profile neko pull neko || docker pull m1k1o/neko:chromium
    spin_cmd "Starting persistent Neko browser container" "docker compose --profile neko up -d neko 2>/dev/null || true"
  else
    # On-demand: dispatch pre-warming in background so deployment finishes in seconds
    ( docker compose --profile neko pull neko >/dev/null 2>&1 && docker compose --profile neko up --no-start neko >/dev/null 2>&1 ) &
    echo -e "  ${GREEN}✔${RESET} Neko Chromium browser image pre-warming dispatched in background (${PURPLE}non-blocking${RESET})"
  fi
fi

# Optional Cloudflare Quick Tunnel setup (Docker-backed for 100% reliability)
PUBLIC_TUNNEL_URL=""
if [ "$ENABLE_TUNNEL" = true ]; then
  docker rm -f wt-tunnel 2>/dev/null || true
  pkill -f 'cloudflared' 2>/dev/null || true

  spin_cmd "Launching Cloudflare Quick Tunnel container" \
    "docker run -d --name wt-tunnel --restart=unless-stopped --network=host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:${TARGET_PORT}"

  echo -ne "  ${CYAN}⏳ Securing public HTTPS tunnel route...${RESET}"
  for i in {1..30}; do
    TUNNEL_MATCH=$(docker logs wt-tunnel 2>&1 | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -n 1 || true)
    if [ -n "$TUNNEL_MATCH" ]; then
      PUBLIC_TUNNEL_URL="$TUNNEL_MATCH"
      echo -e "\r  ${GREEN}✔ Cloudflare Tunnel Connected:${RESET} ${WHITE}${BOLD}${PUBLIC_TUNNEL_URL}${RESET}"
      break
    fi
    sleep 1
  done

  if [ -z "$PUBLIC_TUNNEL_URL" ]; then
    echo -e "\r  ${AMBER}ℹ Cloudflare tunnel is initializing in background. Check link with:${RESET} ${CYAN}docker logs wt-tunnel${RESET}"
  fi
fi

# Public IP display
PUBLIC_IP="${PUBLIC_IP:-127.0.0.1}"

# ------------------------------------------------------------------------------
# 8. IMPECCABLE COMPLETION CARD
# ------------------------------------------------------------------------------
echo -e "\n${PINK}${BOLD}╭─────────────────────────────────────────────────────────────────────────────╮${RESET}"
echo -e "${PINK}${BOLD}│${RESET}                       ${BOLD}🍿 WATCH TOGETHER IS READY!${RESET}                           ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}├─────────────────────────────────────────────────────────────────────────────┤${RESET}"

if [ "$PLATFORM_CHOICE" -eq 1 ] || [ "$IS_CLOUDSHELL" = true ]; then
  echo -e "${PINK}${BOLD}│${RESET}  ${CYAN}${BOLD}Google Cloud Shell Web Preview Mode:${RESET}                                      ${PINK}${BOLD}│${RESET}"
  if [ "$TARGET_PORT" = "8080" ]; then
    echo -e "${PINK}${BOLD}│${RESET}  👉 Simply click the ${BOLD}Web Preview${RESET} icon at top-right of your Cloud Shell!   ${PINK}${BOLD}│${RESET}"
  else
    echo -e "${PINK}${BOLD}│${RESET}  👉 Click ${BOLD}Web Preview${RESET} ➔ ${BOLD}Change Port${RESET} ➔ ${CYAN}${BOLD}${TARGET_PORT}${RESET} ➔ ${BOLD}Change & Preview${RESET}               ${PINK}${BOLD}│${RESET}"
  fi
fi

if [ -n "$PUBLIC_TUNNEL_URL" ]; then
  echo -e "${PINK}${BOLD}│${RESET}                                                                             ${PINK}${BOLD}│${RESET}"
  echo -e "${PINK}${BOLD}│${RESET}  ${GREEN}${BOLD}Instant Public Link (Share with Friends Anywhere):${RESET}                          ${PINK}${BOLD}│${RESET}"
  echo -e "${PINK}${BOLD}│${RESET}  👉 ${GREEN}${BOLD}${PUBLIC_TUNNEL_URL}${RESET}"
  echo -e "${PINK}${BOLD}│${RESET}     ${DARK_GRAY}(Zero setup, works on all iPhones, Androids, & TVs without login)${RESET}        ${PINK}${BOLD}│${RESET}"
fi

if [ -n "$CUSTOM_DOMAIN" ]; then
  echo -e "${PINK}${BOLD}│${RESET}                                                                             ${PINK}${BOLD}│${RESET}"
  echo -e "${PINK}${BOLD}│${RESET}  ${PURPLE}${BOLD}Custom Domain with SSL:${RESET} https://${CUSTOM_DOMAIN}                                  ${PINK}${BOLD}│${RESET}"
fi

echo -e "${PINK}${BOLD}│${RESET}                                                                             ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}  ${WHITE}${BOLD}Access Points:${RESET}                                                              ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}  ${GRAY}• Direct VPS IP  :${RESET} http://${PUBLIC_IP}:${TARGET_PORT}                                ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}  ${GRAY}• Local Network  :${RESET} http://localhost:${TARGET_PORT}                                     ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}  ${GRAY}• Setup Wizard   :${RESET} http://${PUBLIC_IP}:${TARGET_PORT}/?setup                           ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}                                                                             ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}  ${DARK_GRAY}Quick Commands:${RESET}                                                            ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}  ${DARK_GRAY}• View logs  : docker compose logs -f${RESET}                                       ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}  ${DARK_GRAY}• Restart    : docker compose restart${RESET}                                       ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}  ${DARK_GRAY}• Stop       : docker compose down${RESET}                                          ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}╰─────────────────────────────────────────────────────────────────────────────╯${RESET}\n"
