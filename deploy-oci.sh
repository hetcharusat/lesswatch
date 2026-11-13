#!/usr/bin/env bash
# ==============================================================================
# Watch Together - Oracle Cloud Infrastructure (OCI) Automated Deployment
# Tested on: Ubuntu 22.04 / 24.04 LTS (x86_64 & ARM64 Ampere A1)
# ==============================================================================
set -euo pipefail

echo "=========================================================="
echo "🍿 Watch Together - OCI Cloud Deployer"
echo "=========================================================="

# Check root/sudo
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run with sudo: sudo ./deploy-oci.sh"
  exit 1
fi

ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)

echo "[+] Target system user: $ACTUAL_USER ($ACTUAL_HOME)"

# Auto-configure 2GB Swap if RAM < 2GB (Crucial for AWS t2/t3.micro & GCP e2-micro)
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM_MB" -lt 2000 ] && [ ! -f /swapfile ]; then
  echo "[+] Low-memory instance detected (${TOTAL_RAM_MB}MB RAM). Configuring 2GB swap..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  sysctl vm.swappiness=10 || true
  echo "[+] 2GB swap configured successfully."
fi

# 1. Update Packages & Dependencies
echo "[+] Updating system packages and installing curl/git..."
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  iptables-persistent \
  netfilter-persistent

# 2. Configure Host Firewall (OCI iptables / ufw)
echo "[+] Opening host ports (80, 443, 3000, 7880, 50000-50200/udp)..."
# OCI Ubuntu images have strict iptables reject rules. Insert ACCEPT before REJECT rules:
iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT || true
iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT || true
iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT || true
iptables -I INPUT 1 -p tcp --dport 7880 -j ACCEPT || true
iptables -I INPUT 1 -p tcp --dport 7881 -j ACCEPT || true
iptables -I INPUT 1 -p udp --dport 50000:50200 -j ACCEPT || true
iptables -I INPUT 1 -p udp --dport 52000:52100 -j ACCEPT || true

# Persist iptables across reboots
netfilter-persistent save || true

# Also configure UFW if active
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw allow 3000/tcp || true
  ufw allow 7880/tcp || true
  ufw allow 7881/tcp || true
  ufw allow 50000:50200/udp || true
  ufw allow 52000:52100/udp || true
fi

# 3. Install Docker Engine & Compose if missing
if ! command -v docker >/dev/null 2>&1; then
  echo "[+] Installing Docker Engine..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  rm -f get-docker.sh
  usermod -aG docker "$ACTUAL_USER"
  systemctl enable docker
  systemctl start docker
  echo "[+] Docker installed successfully."
fi

# Ensure docker compose plugin exists
if ! docker compose version >/dev/null 2>&1; then
  echo "[+] Installing docker-compose-plugin..."
  apt-get install -y docker-compose-plugin
fi

# 4. Generate .env configuration if not present
if [ ! -f ".env" ]; then
  echo "[+] Creating .env configuration from .env.example..."
  if [ -f ".env.example" ]; then
    cp .env.example .env
  else
    touch .env
  fi

  # Generate cryptographically strong random secrets
  RANDOM_SECRET=$(openssl rand -hex 24)
  RANDOM_VAULT=$(openssl rand -hex 32)

  sed -i "s/change-this-to-a-long-random-secret-key/${RANDOM_SECRET}/g" .env || true
  if grep -q "VAULT_SECRET=" .env; then
    sed -i "s/VAULT_SECRET=/VAULT_SECRET=${RANDOM_VAULT}/g" .env || true
  else
    echo "VAULT_SECRET=${RANDOM_VAULT}" >> .env
  fi

  # Set PUID and PGID to actual user
  USER_UID=$(id -u "$ACTUAL_USER")
  USER_GID=$(id -g "$ACTUAL_USER")
  sed -i "s/PUID=1000/PUID=${USER_UID}/g" .env || true
  sed -i "s/PGID=1000/PGID=${USER_GID}/g" .env || true

  echo "[+] Generated random LiveKit & Vault secrets in .env."
fi

# 5. Create persistent directories with permissions
mkdir -p ./data ./downloads
chown -R "$ACTUAL_USER:$ACTUAL_USER" ./data ./downloads

# 6. Build and Launch Containers
echo "=========================================================="
echo "[+] Building and launching Watch Together with Caddy..."
echo "=========================================================="

# Build and start services (watch-together, livekit, caddy)
docker compose --profile caddy up -d --build

echo ""
echo "[+] Waiting for container health check..."
sleep 5

# Check status
docker compose ps

echo "=========================================================="
echo "🎉 Watch Together is Deployed on Oracle Cloud!"
echo "=========================================================="
PUBLIC_IP=$(curl -s https://ifconfig.me || curl -s https://api.ipify.org || echo "YOUR_OCI_IP")
echo "Direct Access:    http://${PUBLIC_IP}:3000"
echo "Reverse Proxy:    http://${PUBLIC_IP}"
echo "First-Run Setup:  http://${PUBLIC_IP}:3000/?setup"
echo ""
echo "⚠️  CRITICAL OCI STEP REMINDER:"
echo "Remember to add Ingress Rules in your OCI VCN Security List for:"
echo "  - Port 80 (TCP)        -> HTTP / Let's Encrypt"
echo "  - Port 443 (TCP)       -> HTTPS"
echo "  - Port 3000 (TCP)      -> Watch Together direct web"
echo "  - Port 7880-7881 (TCP) -> LiveKit Signaling"
echo "  - Port 50000-50200 (UDP) -> LiveKit Voice/Camera WebRTC"
echo "=========================================================="

