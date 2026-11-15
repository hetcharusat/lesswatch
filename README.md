# 🍿 LESSWATCH

> **Self-hosted, real-time synchronized video watch parties with spatial WebRTC voice chat, floating party webcams, push-to-talk, anime streaming, and virtual browser.**

---

## ✨ Features

- **⚡ Zero-Drift Video Synchronization**: Sub-second drift compensation with automatic seek barriers and play/pause alignment across all viewers.
- **🎙️ Studio Voice Chat & Push-to-Talk**: Low-latency voice powered by LiveKit SFU + P2P fallback. Includes RNNoise background suppression, acoustic echo cancellation, and instant hold-`V` push-to-talk HUD.
- **📹 Magnetic Floating Webcam Dock**: Drag-and-drop party webcam grid with magnetic edge snapping, individual participant volume sliders, and compact reaction orb mode.
- **🎬 Universal Media Engine**:
  - Direct video files (`.mp4`, `.mkv`, `.webm`, `.m3u8` HLS streams).
  - YouTube player sync.
  - Anime stream extraction with episode playlists.
  - BitTorrent & direct HTTP downloader with native browser streaming.
  - Custom subtitle upload (`.srt`, `.vtt`, `.ass`) with live time offset calibration.
- **🌐 Shared Virtual Browser (Neko)**: Optional multi-user Chromium virtual desktop inside the player for watching DRM-gated sites or browsing the web together.

---

## 🚀 1-Line Quick Install

On any clean Linux server (**Ubuntu, Debian, CentOS, Oracle Linux, Arch** on AWS, OCI, Hetzner, or local VM), run:

```bash
curl -fsSL https://raw.githubusercontent.com/hetcharusat/lesswatch/main/install.sh | bash
```

**What the installer does automatically:**
1. Installs `docker`, `docker-compose-plugin`, `git`, and `curl` if missing.
2. Allocates a **2 GB swap file** if the server has < 2 GB RAM (prevents out-of-memory crashes on free-tier instances like `t2.micro` or `t3.micro`).
3. Prompts you for a custom port (default: `3000`) and an optional domain for automatic HTTPS.
4. Generates cryptographically secure secrets and launches the containers with `docker compose up -d`.

Once done, open `http://YOUR_SERVER_IP:3000` in your browser!

---

## 🐳 Standard Docker Compose Setup

If you prefer manual Docker management:

### 1. Clone the repository
```bash
git clone https://github.com/hetcharusat/lesswatch.git
cd lesswatch
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Open `.env` to customize your port or passwords:
```ini
# Change application port (e.g. 3000, 80, 8080)
PORT=3000

# Persistent host paths for media & database
DATA_PATH=./data
DOWNLOADS_PATH=./downloads

# Secret key for LiveKit SFU
LIVEKIT_API_KEY=watchtogether
LIVEKIT_API_SECRET=your-random-secret-key-here
```

### 3. Launch the Stack
```bash
docker compose up -d
```

To view live application logs:
```bash
docker compose logs -f watch-together
```

---

## 🌐 Custom Domain & Automatic HTTPS (Caddy)

To serve LESSWATCH over `https://your-domain.com` with automatic Let's Encrypt SSL:

1. Point your domain's DNS `A` record to your server's public IP.
2. Edit `.env`:
   ```ini
   CADDY_DOMAIN=your-domain.com
   CADDY_EMAIL=your-email@example.com
   ```
3. Start with the `caddy` profile:
   ```bash
   docker compose --profile caddy up -d
   ```

---

## 🛡️ Firewall & Cloud Security Groups

Ensure the following inbound ports are open in your cloud provider's firewall (**AWS EC2 Security Group**, **Oracle Cloud VCN Security List**, or **UFW**):

| Protocol | Port Range | Description |
| :--- | :--- | :--- |
| **TCP** | `22` | SSH Access |
| **TCP** | `80` | HTTP & SSL certificate challenge |
| **TCP** | `443` | HTTPS & WebSockets |
| **TCP** | `3000` | Direct web port (if not using reverse proxy) |
| **TCP** | `7880 - 7881` | LiveKit Voice & Video SFU signaling |
| **UDP** | `50000 - 50200` | LiveKit WebRTC media channels |

---

## 🛠️ Management Commands

```bash
# View live logs
docker compose logs -f

# Restart services
docker compose restart

# Stop the stack
docker compose down

# Update to latest version
git pull && docker compose up -d --build
```

---

## 📜 License
MIT License. Built for seamless movie nights and watch parties with friends! 🍿
