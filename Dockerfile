# Stage 1: Build React/Vite frontend inside Docker
FROM node:20-bookworm-slim AS client-builder

WORKDIR /build

# Copy existing static public assets (icons, extension zip, etc.) first
COPY public ./public

# Install client dependencies and build frontend into /build/public
COPY client/package*.json ./client/
RUN npm ci --prefix ./client || npm install --prefix ./client

COPY client ./client
RUN npm run build --prefix ./client

# Stage 2: Production runtime with Node + ffmpeg + aria2 + yt-dlp + gosu
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
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

# Install yt-dlp binary for stream extraction
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY server.js ./
COPY --from=client-builder /build/public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/data /app/downloads

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
