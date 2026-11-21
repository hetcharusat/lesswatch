# syntax=docker/dockerfile:1
# Compile browser assets on the builder's native architecture. The generated
# JavaScript/WASM is shared by the amd64 and arm64 runtime images.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY client/package*.json ./client/
RUN cd client && npm ci --no-audit --no-fund
COPY client ./client
COPY public ./public
RUN rm -rf /build/public/assets && cd client && npm run build

# Production runtime: no frontend source, compiler, or dev dependencies.
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    DEBIAN_FRONTEND=noninteractive \
    PORT=3000 \
    DATA_DIR=/app/data \
    DOWNLOADS_DIR=/app/downloads

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    aria2 \
    python3 \
    ca-certificates \
    curl \
    gosu \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp binary for web video stream extraction
RUN curl -fsSL --retry 3 --retry-delay 2 https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server.js ./
COPY scripts/neko-upstream.cjs ./scripts/neko-upstream.cjs
COPY scripts/neko-modes.cjs ./scripts/neko-modes.cjs
COPY scripts/neko-lifecycle.cjs ./scripts/neko-lifecycle.cjs
COPY scripts/neko-receiver.js ./scripts/neko-receiver.js
COPY --from=frontend /build/public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/data /app/downloads

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
