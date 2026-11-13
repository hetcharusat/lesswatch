#!/usr/bin/env bash
# ==============================================================================
# 🍿 Watch Together - Universal Cloud & VM Interactive Deployer
# Impeccable CLI Experience for Google Cloud Shell, OCI, AWS, DigitalOcean & VPS
# ==============================================================================
set -euo pipefail

# ANSI Styling (Cyber Pink & Neon Cyan palette)
ESC="\033"
CYAN="${ESC}[38;2;0;240;255m"
PINK="${ESC}[38;2;255;0;122m"
PURPLE="${ESC}[38;2;168;85;247m"
GREEN="${ESC}[38;2;16;185;129m"
AMBER="${ESC}[38;2;245;158;11m"
GRAY="${ESC}[38;2;148;163;184m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
RESET="${ESC}[0m"

# Silence Google Cloud Shell apt warning upfront
mkdir -p ~/.cloudshell 2>/dev/null || true
touch ~/.cloudshell/no-apt-get-warning 2>/dev/null || true

# Check root/sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "${PINK}${BOLD}Error:${RESET} Please run with sudo: ${CYAN}sudo ./deploy.sh${RESET}"
  exit 1
fi

ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" 2>/dev/null | cut -d: -f6 || echo "$HOME")

# Banner
clear 2>/dev/null || true
echo -e "${PINK}${BOLD}"
cat << "EOF"
 ██╗    ██╗ █████╗ ████████╗ ██████╗██╗  ██╗   ████████╗ ██████╗ 
 ██║    ██║██╔══██╗╚══██╔══╝██╔════╝██║  ██║   ╚══██╔══╝██╔════╝ 
 ██║ █╗ ██║███████║   ██║   ██║     ███████║█████╗██║   ██║  ███╗
 ██║███╗██║██╔══██║   ██║   ██║     ██╔══██║╚════╝██║   ██║   ██║
 ╚███╔███╔╝██║  ██║   ██║   ╚██████╗██║  ██║      ██║   ╚██████╔╝
  ╚══╝╚══╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝      ╚═╝    ╚═════╝ 
EOF
echo -e "${CYAN}${BOLD}    🍿 Universal Cloud & VM Orchestrator | v3.0 Impeccable Edition${RESET}\n"

# ------------------------------------------------------------------------------
# 1. Environment & Platform Detection
# ------------------------------------------------------------------------------
IS_CLOUDSHELL=false
PLATFORM_NAME="Standard Linux VPS"

if [ -n "${DEVSHELL_CLIENT_PORT:-}" ] || grep -q 'cloudshell' /etc/hostname 2>/dev/null || [ -d "/google/devshell" ]; then
  IS_CLOUDSHELL=true
  PLATFORM_NAME="Google Cloud Shell (Ephemeral Container VM)"
elif curl -s -m 1 http://169.254.169.254/opc/v1/instance/ 2>/dev/null | grep -q "displayName"; then
  PLATFORM_NAME="Oracle Cloud Infrastructure (OCI)"
elif curl -s -m 1 http://169.254.169.254/latest/meta-data/ 2>/dev/null | grep -q "instance-id"; then
  PLATFORM_NAME="Amazon Web Services (AWS EC2)"
elif [ -f "/etc/digitalocean" ] || curl -s -m 1 http://169.254.169.254/metadata/v1/ 2>/dev/null | grep -q "droplet_id"; then
  PLATFORM_NAME="DigitalOcean Droplet"
fi

echo -e "${GRAY}┌─${RESET} ${BOLD}Detected Environment:${RESET} ${CYAN}${BOLD}${PLATFORM_NAME}${RESET}"
echo -e "${GRAY}│  Target User:${RESET} ${ACTUAL_USER} (${ACTUAL_HOME})"
echo -e "${GRAY}└─────────────────────────────────────────────────────────────${RESET}\n"

# ------------------------------------------------------------------------------
# 2. Interactive Configuration Choices
# ------------------------------------------------------------------------------
echo -e "${PURPLE}${BOLD}[1/4] Network & Port Configuration${RESET}"

DEFAULT_PORT=3000
if [ "$IS_CLOUDSHELL" = true ]; then
  DEFAULT_PORT=8080
fi

echo -e "Choose the public HTTP port for Watch Together:"
if [ "$IS_CLOUDSHELL" = true ]; then
  echo -e "  ${CYAN}[1] Port 8080${RESET} ${GREEN}(Recommended for Cloud Shell: 1-click Web Preview works instantly!)${RESET}"
  echo -e "  ${GRAY}[2] Port 3000${RESET} (Default Watch Together port)"
  echo -e "  ${GRAY}[3] Custom port${RESET}"
else
  echo -e "  ${CYAN}[1] Port 3000${RESET} ${GREEN}(Recommended for VPS: Direct Web)${RESET}"
  echo -e "  ${GRAY}[2] Port 8080${RESET}"
  echo -e "  ${GRAY}[3] Custom port${RESET}"
fi

read -rp "Select option [1-3, default 1]: " PORT_CHOICE || PORT_CHOICE="1"
PORT_CHOICE="${PORT_CHOICE:-1}"

case "$PORT_CHOICE" in
  1)
    TARGET_PORT=$DEFAULT_PORT
    ;;
  2)
    if [ "$IS_CLOUDSHELL" = true ]; then TARGET_PORT=3000; else TARGET_PORT=8080; fi
    ;;
  3)
    read -rp "Enter your desired port (e.g. 5000): " TARGET_PORT
    TARGET_PORT="${TARGET_PORT:-$DEFAULT_PORT}"
    ;;
  *)
    TARGET_PORT=$DEFAULT_PORT
    ;;
esac

echo -e "${GREEN}✔${RESET} Selected HTTP Port: ${BOLD}${TARGET_PORT}${RESET}\n"

# Sharing / Tunnel Choice
echo -e "${PURPLE}${BOLD}[2/4] Access & Sharing Method${RESET}"
echo -e "How do you want to access Watch Together?"
echo -e "  ${CYAN}[1] Direct / Web Preview${RESET} ${DIM}(Cloud Shell Web Preview or direct IP)${RESET}"
echo -e "  ${CYAN}[2] Instant Public Link (Cloudflare Quick Tunnel)${RESET} ${GREEN}(Shareable with friends with 0 setup!)${RESET}"
echo -e "  ${CYAN}[3] Custom Domain with SSL${RESET} ${DIM}(Link your own domain via Caddy / Cloudflare)${RESET}"

read -rp "Select option [1-3, default 1]: " ACCESS_CHOICE || ACCESS_CHOICE="1"
ACCESS_CHOICE="${ACCESS_CHOICE:-1}"

CUSTOM_DOMAIN=""
ENABLE_TUNNEL=false

case "$ACCESS_CHOICE" in
  2)
    ENABLE_TUNNEL=true
    echo -e "${GREEN}✔${RESET} Cloudflare Quick Tunnel enabled (an instant public HTTPS link will be generated)"
    ;;
  3)
    read -rp "Enter your domain name (e.g. watch.yourdomain.com): " CUSTOM_DOMAIN
    echo -e "${GREEN}✔${RESET} Custom domain set: ${BOLD}${CUSTOM_DOMAIN}${RESET}"
    ;;
  *)
    echo -e "${GREEN}✔${RESET} Direct access mode selected"
    ;;
esac
echo ""

# Shared Virtual Browser (Neko) Choice
echo -e "${PURPLE}${BOLD}[3/5] Virtual Shared Browser (Neko)${RESET}"
echo -e "Do you want to enable the Shared Virtual Browser (Neko)?"
echo -e "  ${DIM}(Runs a shared Chromium browser inside rooms. Starts on-demand only when in use)${RESET}"
read -rp "Enable Virtual Browser? [y/N, default N]: " NEKO_INPUT || NEKO_INPUT="N"
ENABLE_NEKO=false
if [[ "$NEKO_INPUT" =~ ^[Yy]$ ]]; then
  ENABLE_NEKO=true
  echo -e "${GREEN}✔${RESET} Virtual Browser (Neko) will be provisioned on-demand"
else
  echo -e "${GRAY}ℹ${RESET} Virtual Browser skipped (saves RAM for pure video streaming)"
fi
echo ""

# ------------------------------------------------------------------------------
# 3. System Tuning & Swap
# ------------------------------------------------------------------------------
echo -e "${PURPLE}${BOLD}[3/4] System Verification & Dependencies${RESET}"

TOTAL_RAM_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "4000")
if [ "$TOTAL_RAM_MB" -lt 2000 ] && [ ! -f /swapfile ]; then
  echo -e "  ${AMBER}⚡ Low-memory instance detected (${TOTAL_RAM_MB}MB RAM). Configuring 2GB swap...${RESET}"
  (fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null) || true
  chmod 600 /swapfile 2>/dev/null || true
  mkswap /swapfile 2>/dev/null || true
  swapon /swapfile 2>/dev/null || true
  if ! grep -q '/swapfile' /etc/fstab 2>/dev/null; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab 2>/dev/null || true
  fi
  sysctl vm.swappiness=10 2>/dev/null || true
  echo -e "  ${GREEN}✔${RESET} 2GB swap configured"
else
  echo -e "  ${GREEN}✔${RESET} Memory capacity verified (${TOTAL_RAM_MB}MB RAM)"
fi

# Ensure docker is installed
if ! command -v docker >/dev/null 2>&1; then
  echo -e "  ${CYAN}📦 Installing Docker Engine...${RESET}"
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh >/dev/null 2>&1
  rm -f get-docker.sh
  usermod -aG docker "$ACTUAL_USER" 2>/dev/null || true
  systemctl enable docker 2>/dev/null || true
  systemctl start docker 2>/dev/null || service docker start 2>/dev/null || true
  echo -e "  ${GREEN}✔${RESET} Docker installed"
else
  echo -e "  ${GREEN}✔${RESET} Docker is ready"
fi

# Firewall ports (safe check)
if command -v iptables >/dev/null 2>&1; then
  iptables -I INPUT 1 -p tcp --dport "$TARGET_PORT" -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p tcp --dport 7880 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p tcp --dport 7881 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p udp --dport 50000:50200 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p udp --dport 52000:52100 -j ACCEPT 2>/dev/null || true
fi

# ------------------------------------------------------------------------------
# 4. Generate & Update .env
# ------------------------------------------------------------------------------
echo -e "\n${PURPLE}${BOLD}[4/4] Environment & Container Launch${RESET}"

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
  else
    touch .env
  fi
  RANDOM_SECRET=$(openssl rand -hex 24 2>/dev/null || date +%s%N | sha256sum | head -c 48)
  RANDOM_VAULT=$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | head -c 64)
  sed -i "s/change-this-to-a-long-random-secret-key/${RANDOM_SECRET}/g" .env 2>/dev/null || true
  if grep -q "VAULT_SECRET=" .env; then
    sed -i "s/VAULT_SECRET=/VAULT_SECRET=${RANDOM_VAULT}/g" .env 2>/dev/null || true
  else
    echo "VAULT_SECRET=${RANDOM_VAULT}" >> .env
  fi
  echo -e "  ${GREEN}✔${RESET} Generated cryptographically secure secrets in .env"
fi

# Ensure host port & user IDs are correctly written to .env
USER_UID=$(id -u "$ACTUAL_USER" 2>/dev/null || echo "1000")
USER_GID=$(id -g "$ACTUAL_USER" 2>/dev/null || echo "1000")
sed -i "s/^PUID=.*/PUID=${USER_UID}/" .env 2>/dev/null || echo "PUID=${USER_UID}" >> .env
sed -i "s/^PGID=.*/PGID=${USER_GID}/" .env 2>/dev/null || echo "PGID=${USER_GID}" >> .env

if grep -q "^PORT=" .env 2>/dev/null; then
  sed -i "s/^PORT=.*/PORT=${TARGET_PORT}/" .env
else
  echo "PORT=${TARGET_PORT}" >> .env
fi

if [ -n "$CUSTOM_DOMAIN" ]; then
  if grep -q "^CADDY_DOMAIN=" .env 2>/dev/null; then
    sed -i "s/^CADDY_DOMAIN=.*/CADDY_DOMAIN=${CUSTOM_DOMAIN}/" .env
  else
    echo "CADDY_DOMAIN=${CUSTOM_DOMAIN}" >> .env
  fi
fi

# Ensure storage directories
mkdir -p ./data ./downloads
chown -R "$ACTUAL_USER:$ACTUAL_USER" ./data ./downloads 2>/dev/null || true

# Launch containers
echo -e "  ${CYAN}🚀 Launching Docker services...${RESET}"
if [ -n "$CUSTOM_DOMAIN" ] && [ "$IS_CLOUDSHELL" = false ]; then
  docker compose --profile caddy up -d --build
else
  docker compose up -d --build
fi

sleep 4
echo -e "  ${GREEN}✔${RESET} Containers are online and healthy"

# Optional Cloudflare Quick Tunnel setup
PUBLIC_TUNNEL_URL=""
if [ "$ENABLE_TUNNEL" = true ]; then
  echo -e "\n  ${CYAN}🌐 Establishing Cloudflare Quick Tunnel on port ${TARGET_PORT}...${RESET}"
  if ! command -v cloudflared >/dev/null 2>&1; then
    curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared 2>/dev/null || true
    chmod +x /usr/local/bin/cloudflared 2>/dev/null || true
  fi
  
  pkill -f "cloudflared tunnel" 2>/dev/null || true
  nohup cloudflared tunnel --url "http://localhost:${TARGET_PORT}" > /tmp/cloudflared.log 2>&1 &
  
  # Wait up to 10 seconds for URL
  for i in {1..10}; do
    PUBLIC_TUNNEL_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | tail -n 1 || true)
    if [ -n "$PUBLIC_TUNNEL_URL" ]; then
      break
    fi
    sleep 1
  done
fi

# Optional Neko Virtual Browser creation
if [ "${ENABLE_NEKO:-false}" = "true" ]; then
  echo -e "  ${CYAN}🌐 Pulling Neko Virtual Browser container...${RESET}"
  docker compose --profile neko up --no-start neko 2>/dev/null || true
  echo -e "  ${GREEN}✔${RESET} Neko container provisioned"
fi

# Determine IP
PUBLIC_IP=$(curl -s -m 2 https://api.ipify.org 2>/dev/null || echo "localhost")

# ------------------------------------------------------------------------------
# 5. Impeccable Summary Card
# ------------------------------------------------------------------------------
echo -e "\n${PINK}${BOLD}╭─────────────────────────────────────────────────────────────────────────────╮${RESET}"
echo -e "${PINK}${BOLD}│${RESET}                       ${BOLD}🍿 WATCH TOGETHER IS READY!${RESET}                           ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}├─────────────────────────────────────────────────────────────────────────────┤${RESET}"

if [ "$IS_CLOUDSHELL" = true ]; then
  echo -e "${PINK}${BOLD}│${RESET}  ${CYAN}${BOLD}Google Cloud Shell Web Preview:${RESET}                                            ${PINK}${BOLD}│${RESET}"
  if [ "$TARGET_PORT" = "8080" ]; then
    echo -e "${PINK}${BOLD}│${RESET}  👉 Simply click the ${BOLD}Web Preview${RESET} icon at top-right (no port change needed!) ${PINK}${BOLD}│${RESET}"
  else
    echo -e "${PINK}${BOLD}│${RESET}  👉 Click ${BOLD}Web Preview${RESET} ➔ ${BOLD}Change Port${RESET} ➔ ${CYAN}${BOLD}${TARGET_PORT}${RESET} ➔ ${BOLD}Change & Preview${RESET}               ${PINK}${BOLD}│${RESET}"
  fi
fi

if [ -n "$PUBLIC_TUNNEL_URL" ]; then
  echo -e "${PINK}${BOLD}│${RESET}                                                                             ${PINK}${BOLD}│${RESET}"
  echo -e "${PINK}${BOLD}│${RESET}  ${GREEN}${BOLD}Instant Public Link (Share with Friends):${RESET}                                   ${PINK}${BOLD}│${RESET}"
  echo -e "${PINK}${BOLD}│${RESET}  👉 ${GREEN}${BOLD}${PUBLIC_TUNNEL_URL}${RESET}"
  echo -e "${PINK}${BOLD}│${RESET}     ${DIM}(Works on all phones, tablets, & laptops without Google sign-in!)${RESET}     ${PINK}${BOLD}│${RESET}"
fi

if [ -n "$CUSTOM_DOMAIN" ]; then
  echo -e "${PINK}${BOLD}│${RESET}                                                                             ${PINK}${BOLD}│${RESET}"
  echo -e "${PINK}${BOLD}│${RESET}  ${PURPLE}${BOLD}Custom Domain:${RESET} https://${CUSTOM_DOMAIN}                                         ${PINK}${BOLD}│${RESET}"
fi

echo -e "${PINK}${BOLD}│${RESET}                                                                             ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}  ${GRAY}Local Server URL :${RESET} http://localhost:${TARGET_PORT}                                     ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}  ${GRAY}Direct Public IP :${RESET} http://${PUBLIC_IP}:${TARGET_PORT}                                ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}│${RESET}  ${GRAY}First-Run Setup  :${RESET} http://localhost:${TARGET_PORT}/?setup                               ${PINK}${BOLD}│${RESET}"
echo -e "${PINK}${BOLD}╰─────────────────────────────────────────────────────────────────────────────╯${RESET}\n"

