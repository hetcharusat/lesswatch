#!/usr/bin/env bash
# ==============================================================================
# 🍿 LESSWATCH — 1-Line Self-Hosted Deployment Script
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hetcharusat/lesswatch/main/install.sh | bash
#   or:
#   sudo ./install.sh
# ==============================================================================
set -euo pipefail

# ANSI color styling
CYAN='\033[38;2;0;240;255m'
PINK='\033[38;2;255;94;165m'
PURPLE='\033[38;2;168;85;247m'
GREEN='\033[38;2;16;185;129m'
YELLOW='\033[38;2;245;158;11m'
GRAY='\033[38;2;148;163;184m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

clear 2>/dev/null || true

cat << "EOF"
  _       ______ _____ _____ _    _          _______ _____ _    _ 
 | |     |  ____/ ____/ ____| |  | |   /\   |__   __/ ____| |  | |
 | |     | |__ | (___| (___ | |__| |  /  \     | | | |    | |__| |
 | |     |  __| \___ \\___ \|  __  | / /\ \    | | | |    |  __  |
 | |____ | |________) |___) | |  | |/ ____ \   | | | |____| |  | |
 |______||______|_____/_____/|_|  |_/_/    \_\  |_|  \_____|_|  |_|
  🍿 Synchronized Watch Parties · Spatial WebRTC Voice · P2P Webcams
EOF

echo -e "${PINK}====================================================================${RESET}"
echo -e " ${BOLD}LESSWATCH — Automated Self-Host Installer${RESET}"
echo -e "${PINK}====================================================================${RESET}\n"

# Helper: sudo wrapper
SUDO=""
if [ "$EUID" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo -e "${YELLOW}[!] Root or sudo required to configure system and Docker.${RESET}"
    exit 1
  fi
fi

# Detect public IP
DETECTED_IP=$(curl -s4 --max-time 2 https://api.ipify.org 2>/dev/null || curl -s4 --max-time 2 https://ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo -e "${CYAN}[1/6] Checking system prerequisites...${RESET}"

# Install curl and git if missing
if ! command -v curl >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  echo -e "  ${GRAY}Installing curl & git...${RESET}"
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -qq && $SUDO apt-get install -y -qq curl git
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y -q curl git
  elif command -v yum >/dev/null 2>&1; then
    $SUDO yum install -y -q curl git
  fi
fi

# 1. Low-RAM Swap auto-allocation (Essential for EC2 t2/t3.micro)
TOTAL_RAM_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "2048")
TOTAL_SWAP_MB=$(free -m 2>/dev/null | awk '/^Swap:/{print $2}' || echo "0")

if [ "$TOTAL_RAM_MB" -lt 1900 ] && [ "$TOTAL_SWAP_MB" -lt 1500 ]; then
  echo -e "  ${YELLOW}[i] Server RAM is ${TOTAL_RAM_MB}MB (< 2GB). Creating a 2GB swap file to prevent OOM during builds...${RESET}"
  if [ ! -f /swapfile ]; then
    $SUDO fallocate -l 2G /swapfile 2>/dev/null || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=2048
    $SUDO chmod 600 /swapfile
    $SUDO mkswap /swapfile >/dev/null 2>&1
    $SUDO swapon /swapfile 2>/dev/null || true
    if ! grep -q "/swapfile" /etc/fstab 2>/dev/null; then
      echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
    fi
    echo -e "  ${GREEN}✔ 2GB Swap file created and enabled.${RESET}"
  fi
fi

# 2. Check Docker and Docker Compose
echo -e "${CYAN}[2/6] Verifying Docker Engine & Compose...${RESET}"
if ! command -v docker >/dev/null 2>&1; then
  echo -e "  ${GRAY}Docker not detected. Installing official Docker Engine...${RESET}"
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  $SUDO sh /tmp/get-docker.sh >/dev/null 2>&1
  rm -f /tmp/get-docker.sh
  if [ -n "${SUDO_USER:-}" ]; then
    $SUDO usermod -aG docker "$SUDO_USER" 2>/dev/null || true
  fi
  $SUDO usermod -aG docker "$USER" 2>/dev/null || true
  echo -e "  ${GREEN}✔ Docker Engine installed.${RESET}"
else
  echo -e "  ${GREEN}✔ Docker is installed.${RESET}"
fi

# Ensure docker service is running
$SUDO systemctl start docker 2>/dev/null || true

# Check docker compose plugin
if ! docker compose version >/dev/null 2>&1 && ! docker-compose version >/dev/null 2>&1; then
  echo -e "  ${GRAY}Installing docker compose plugin...${RESET}"
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -qq && $SUDO apt-get install -y -qq docker-compose-plugin
  fi
fi

# 3. Clone or Navigate to repository
echo -e "${CYAN}[3/6] Setting up LESSWATCH repository...${RESET}"
INSTALL_DIR="lesswatch"
if [ -f "server.js" ] && [ -f "docker-compose.yml" ]; then
  INSTALL_DIR="."
elif [ -d "lesswatch" ]; then
  INSTALL_DIR="lesswatch"
  cd "$INSTALL_DIR"
  echo -e "  ${GRAY}Updating existing repository in $(pwd)...${RESET}"
  git pull -q origin main 2>/dev/null || true
else
  echo -e "  ${GRAY}Cloning https://github.com/hetcharusat/lesswatch.git...${RESET}"
  git clone -q https://github.com/hetcharusat/lesswatch.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# 4. Interactive Configuration
echo -e "${CYAN}[4/6] Configuring environment settings...${RESET}"

DEFAULT_PORT="3000"
APP_PORT="${PORT:-$DEFAULT_PORT}"
USE_DOMAIN=""
DOMAIN_NAME=""

# Only ask interactively if stdin is a terminal and PORT is unset
if [ -t 0 ] && [ -z "${PORT:-}" ]; then
  echo -e ""
  read -r -p "➤ Choose application port [default: 3000]: " USER_PORT
  if [ -n "$USER_PORT" ]; then
    APP_PORT="$USER_PORT"
  fi

  read -r -p "➤ Do you have a domain pointing to this server for automated HTTPS? (y/N): " HAS_DOMAIN
  if [[ "$HAS_DOMAIN" =~ ^[Yy]$ ]]; then
    read -r -p "  Enter your domain (e.g. watch.myhome.tech): " USER_DOMAIN
    if [ -n "$USER_DOMAIN" ]; then
      USE_DOMAIN="yes"
      DOMAIN_NAME="$USER_DOMAIN"
    fi
  fi
  echo -e ""
fi

# Generate / Update .env
if [ ! -f .env ]; then
  cp .env.example .env
fi

# Generate random secure secrets
RAND_SECRET=$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 24)
RAND_VAULT=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)

# Update .env values safely
sed -i "s|^PORT=.*|PORT=${APP_PORT}|g" .env
if grep -q "change-this-to-a-long-random-secret-key" .env; then
  sed -i "s|change-this-to-a-long-random-secret-key|${RAND_SECRET}|g" .env
fi

# Update LiveKit external IP to the server public IP
if [ -f livekit.yaml ]; then
  if ! grep -q "use_external_ip" livekit.yaml; then
    echo "  use_external_ip: true" >> livekit.yaml
  fi
fi

# Configure Caddy if domain was provided
COMPOSE_CMD="docker compose"
if [ "$USE_DOMAIN" = "yes" ] && [ -n "$DOMAIN_NAME" ]; then
  sed -i "s|^CADDY_DOMAIN=.*|CADDY_DOMAIN=${DOMAIN_NAME}|g" .env
  cat << EOF > Caddyfile
{
    email hetpatel.dev@gmail.com
}

${DOMAIN_NAME} {
    @notMedia not path /api/media/stream/* /api/media/audio/* /api/media/hls/* /api/media/subtitles/*
    encode @notMedia gzip zstd

    handle_path /livekit* {
        reverse_proxy livekit:7880
    }

    reverse_proxy /neko* 172.17.0.1:8080
    reverse_proxy watch-together:${APP_PORT}
}

:80 {
    @notMedia not path /api/media/stream/* /api/media/audio/* /api/media/hls/* /api/media/subtitles/*
    encode @notMedia gzip zstd

    handle_path /livekit* {
        reverse_proxy livekit:7880
    }

    reverse_proxy /neko* 172.17.0.1:8080
    reverse_proxy watch-together:${APP_PORT}
}
EOF
  COMPOSE_CMD="docker compose --profile caddy"
fi

echo -e "  ${GREEN}✔ Configuration saved to .env (Port: ${APP_PORT})${RESET}"

# 5. Build and Launch Containers
echo -e "${CYAN}[5/6] Building & launching Docker containers...${RESET}"
echo -e "  ${GRAY}This may take 1-2 minutes on first run (pulling LiveKit and compiling frontend)...${RESET}"

$SUDO $COMPOSE_CMD up -d --build

# 6. Verify Health
echo -e "${CYAN}[6/6] Verifying service health...${RESET}"
HEALTHY=false
for i in {1..30}; do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  sleep 2
done

echo -e "\n${PINK}====================================================================${RESET}"
if [ "$HEALTHY" = true ]; then
  echo -e " ${GREEN}${BOLD}🎉 LESSWATCH IS LIVE & READY!${RESET}"
else
  echo -e " ${YELLOW}${BOLD}⚠️ Containers started. Initializing in background...${RESET}"
fi
echo -e "${PINK}====================================================================${RESET}\n"

if [ "$USE_DOMAIN" = "yes" ] && [ -n "$DOMAIN_NAME" ]; then
  echo -e "  🌐 ${BOLD}Live URL:${RESET}      ${CYAN}https://${DOMAIN_NAME}${RESET}"
  echo -e "  🌐 ${BOLD}Fallback IP:${RESET}   ${CYAN}http://${DETECTED_IP}:${APP_PORT}${RESET}"
else
  echo -e "  🌐 ${BOLD}Access URL:${RESET}    ${CYAN}http://${DETECTED_IP}:${APP_PORT}${RESET}"
fi

echo -e "  📁 ${BOLD}Data Storage:${RESET}  $(pwd)/data"
echo -e "  📁 ${BOLD}Downloads:${RESET}     $(pwd)/downloads"
echo -e "\n${BOLD}Helpful Commands:${RESET}"
echo -e "  ${GRAY}View live logs:${RESET}        docker compose logs -f"
echo -e "  ${GRAY}Restart containers:${RESET}    docker compose restart"
echo -e "  ${GRAY}Stop containers:${RESET}       docker compose down"
echo -e "  ${GRAY}Update to latest:${RESET}      git pull && docker compose up -d --build"
echo -e "\nEnjoy your watch party! 🍿✨\n"
