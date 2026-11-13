# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A private host (couple or close friends) running their own watch-party server, along with the invited friends/members who join rooms for synchronized viewing and voice chat.

## Product Purpose

Deliver an intimate, reliable, self-hosted synchronized watch-party hub where friends or partners can watch downloaded media, anime, direct URLs, YouTube, or a shared remote browser together in sub-second sync with voice chat and automatic audio/subtitle tooling — packaged with Arr-stack-style Docker portability.

## Positioning

A warm, deeply personal watch cinema rather than a generic teleconference tool or cold enterprise media server: pairs sub-second synchronized playback, encrypted admin credential management, and honest first-run host diagnostics inside one self-hosted container stack.

## Operating Context

Deployed primarily on a single personal VPS or home server via Docker Compose (`watch-together` + `livekit`, with optional `neko` and `caddy` profiles), or run directly via Node/Vite during local iteration. Hosts configure auth policies, quick-login cards, and system diagnostics cleanly from the browser on first boot.

## Capabilities and Constraints

- Real-time playback sync over Socket.IO (`/api/v1/sync`), LiveKit SFU voice/video (`/livekit`), on-demand Neko shared browser with idle auto-stop, `yt-dlp` / `aria2c` downloading, and `ffmpeg` / `ffprobe` Media Studio audio & subtitle processing.
- First-Run Setup Wizard (`config.json`), dynamic auth policies (public sign-ups toggle, `autofill` vs `passwordless` quick-login cards), Admin Panel with AES-256-GCM credential vault, and host/WebSocket/HTTPS diagnostics.
- Some hosts lack Docker socket access or sufficient RAM for Neko; Setup and Diagnostics must surface clear errors while allowing users to disable Neko and keep all core modules running.
- Mobile web responsiveness matters alongside desktop widescreen cinema layouts (`client/android` wraps the same web app).

## Brand Commitments

- **Playful pastel-pink personality everywhere:** The warm pastel-pink, coquette/fairy luxury claymorphic voice belongs across the entire application — including Setup, Admin, and Diagnostics — never dropping into generic corporate SaaS or sterile dark-mode developer chrome.

## Evidence on Hand

- Frontend SPA in `client/` (`client/src/styles/pink.css`, React + Vite) served from `public/` by `server.js`.
- Docker & reverse proxy stack in `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `Caddyfile`, and `livekit.yaml`.

## Product Principles

1. **Cozy First, Always:** Every flow — from setup diagnostics to theater playback — should feel inviting, charming, and unmistakably made for close friends watching together.
2. **Honest Host Diagnostics:** Surface host CPU/RAM/storage, missing binaries, HTTPS Secure Context issues, and WebSocket proxy failures clearly with actionable fixes before a watch night fails.
3. **Zero-Friction Companion Access:** Let trusted members sign in quickly via optional Quick-Login cards while giving the admin full vault visibility and session revocation control.
4. **Graceful Module Independence:** An incapable Neko host or disabled downloader must never block core synced playback, LiveKit voice, or Media Studio.

