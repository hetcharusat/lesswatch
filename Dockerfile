FROM node:20-bookworm-slim

WORKDIR /app

# Install system dependencies: ffmpeg, aria2, python3, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    aria2 \
    python3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp binary for anime/movie stream extraction
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Create persistent storage directories
RUN mkdir -p data downloads

EXPOSE 3000

CMD ["node", "server.js"]
