#!/bin/sh
set -e

# Apply timezone if TZ is set and tzdata is present
if [ -n "$TZ" ] && [ -f "/usr/share/zoneinfo/$TZ" ]; then
  ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
  echo "$TZ" > /etc/timezone
fi

DATA_DIR="${DATA_DIR:-/app/data}"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-/app/downloads}"
mkdir -p "$DATA_DIR" "$DOWNLOADS_DIR"

# Arr-stack PUID / PGID privilege drop when specified (non-zero)
PUID="${PUID:-}"
PGID="${PGID:-}"

if [ -n "$PUID" ] && [ "$PUID" != "0" ]; then
  PGID="${PGID:-$PUID}"

  if ! getent group "$PGID" >/dev/null 2>&1; then
    groupadd -g "$PGID" watchtogether
  fi
  GROUP_NAME="$(getent group "$PGID" | cut -d: -f1)"

  if ! getent passwd "$PUID" >/dev/null 2>&1; then
    useradd -u "$PUID" -g "$GROUP_NAME" -M -s /bin/sh watchtogether
  fi
  USER_NAME="$(getent passwd "$PUID" | cut -d: -f1)"
  if [ -z "$USER_NAME" ]; then
    USER_NAME="$(id -nu "$PUID" 2>/dev/null || true)"
  fi
  if [ -n "$USER_NAME" ] && [ "$(id -g "$USER_NAME" 2>/dev/null || true)" != "$PGID" ]; then
    usermod -g "$GROUP_NAME" "$USER_NAME" || true
  fi

  # If Docker socket is mounted, grant access to its GID so Neko lifecycle control works
  if [ -S /var/run/docker.sock ] && [ -n "$USER_NAME" ]; then
    SOCK_GID="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || true)"
    if [ -n "$SOCK_GID" ] && [ "$SOCK_GID" != "0" ]; then
      if ! getent group "$SOCK_GID" >/dev/null 2>&1; then
        groupadd -g "$SOCK_GID" dockersock || true
      fi
      SOCK_GROUP="$(getent group "$SOCK_GID" | cut -d: -f1 || true)"
      if [ -n "$SOCK_GROUP" ]; then
        usermod -aG "$SOCK_GROUP" "$USER_NAME" || true
      fi
    fi
  fi

  chown -R "$PUID:$PGID" "$DATA_DIR"
  chown -R "$PUID:$PGID" "$DOWNLOADS_DIR" 2>/dev/null || true

  if [ -n "$USER_NAME" ]; then
    exec gosu "$USER_NAME" "$@"
  fi
  exec gosu "$PUID:$PGID" "$@"
fi

exec "$@"

