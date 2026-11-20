#!/usr/bin/env bash
# Shared prerequisite for the shell installer and both Node installer entry points.
set -euo pipefail

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo 'Docker Engine and Compose are ready.'
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  echo 'Docker needs installation or startup. Run the installer with sudo: sudo bash deploy.sh' >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! command -v dockerd >/dev/null 2>&1; then
  echo 'Installing Docker Engine...'
  # curl is normally installed by install.sh; support running deploy.sh directly too.
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo 'curl is required to install Docker. Install curl with your package manager and retry.' >&2
    exit 1
  fi
  # Amazon Linux packages its own Docker Engine. Other supported distributions
  # use Docker's official installer, which also configures its update repository.
  os_id=$(. /etc/os-release && printf '%s' "$ID")
  if [ "$os_id" = amzn ]; then
    dnf install -y docker
  else
    docker_installer=$(mktemp)
    trap 'rm -f "$docker_installer"' EXIT
    curl -fsSL --retry 3 https://get.docker.com -o "$docker_installer"
    sh "$docker_installer"
    rm -f "$docker_installer"
    trap - EXIT
  fi
fi

if ! docker info >/dev/null 2>&1; then
  echo 'Starting Docker Engine...'
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    systemctl enable --now docker
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service docker start
    rc-update add docker default
  elif command -v service >/dev/null 2>&1 && [ -f /etc/init.d/docker ]; then
    service docker start
  else
    # Shell environments may lack an init system. Avoid starting a second daemon.
    if ! command -v pgrep >/dev/null 2>&1 || ! pgrep -x dockerd >/dev/null 2>&1; then
      nohup dockerd >/var/log/lesswatch-dockerd.log 2>&1 </dev/null &
    fi
  fi

  docker_ready=false
  for attempt in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then docker_ready=true; break; fi
    sleep 1
  done
  if [ "$docker_ready" != true ]; then
    echo 'Docker did not become ready. This host may restrict container daemons.' >&2
    echo 'Check: sudo journalctl -u docker --no-pager -n 30, or /var/log/lesswatch-dockerd.log.' >&2
    docker info >&2 || true
    exit 1
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  echo 'Installing the Docker Compose plugin...'
  case "$(uname -m)" in
    x86_64) compose_arch=x86_64 ;;
    aarch64|arm64) compose_arch=aarch64 ;;
    *) echo 'Unsupported architecture for automatic Compose installation.' >&2; exit 1 ;;
  esac
  compose_asset="docker-compose-linux-$compose_arch"
  compose_tmp=$(mktemp -d)
  trap 'rm -f "$compose_tmp/$compose_asset" "$compose_tmp/checksum"; rmdir "$compose_tmp"' EXIT
  compose_url="https://github.com/docker/compose/releases/latest/download/$compose_asset"
  curl -fsSL --retry 3 "$compose_url" -o "$compose_tmp/$compose_asset"
  curl -fsSL --retry 3 "$compose_url.sha256" -o "$compose_tmp/checksum"
  expected=$(awk '{print $1}' "$compose_tmp/checksum")
  actual=$(sha256sum "$compose_tmp/$compose_asset" | awk '{print $1}')
  if [ "$expected" != "$actual" ]; then echo 'Compose checksum verification failed.' >&2; exit 1; fi
  install -D -m 0755 "$compose_tmp/$compose_asset" /usr/local/lib/docker/cli-plugins/docker-compose
  rm -f "$compose_tmp/$compose_asset" "$compose_tmp/checksum"
  rmdir "$compose_tmp"
  trap - EXIT
fi

docker info >/dev/null
docker compose version
echo 'Docker Engine and Compose are ready.'
