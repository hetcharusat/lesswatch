<div align="center">

<img src="public/logo.png" alt="LESSWATCH" width="96" />

# LESSWATCH

**Your own little cinema, wherever your people are.**

Watch together, talk over the good parts, and send a reaction without leaving the screen.
A self-hosted watch-party app with synchronized playback, voice, webcams, and a shared browser.

[Get started](#get-started) · [Local development](#local-development) · [Shared browser](#shared-browser-neko) · [Troubleshooting](#troubleshooting)

</div>

## What you can do

| Feature | What it does |
| --- | --- |
| Watch in sync | Shared play, pause, and seeking, with drift correction and manual resync. |
| Bring your media | YouTube, direct video links, HLS streams, and files from your library. |
| Talk and hang out | LiveKit voice and camera rooms, push-to-talk, noise suppression, and participant volume controls. |
| Keep chat close | Sidebar chat, GIFs, reactions, and floating message bubbles over the video. |
| Browse together | Optional Neko Chromium desktop streamed to viewers over WebRTC. |
| Manage your library | Downloads through aria2 and yt-dlp, plus transcoding and subtitle tools. |
| Run your own instance | First-run setup, member accounts, login policies, feature switches, and host diagnostics. |

Direct playback depends on browser codec support and source-server access rules. Site extraction can change when providers change. A shared browser does not guarantee playback of DRM-protected services.

## Get started

Docker Compose provides the most complete setup. The app image includes FFmpeg, aria2, and yt-dlp. LiveKit runs separately; Neko and Caddy are optional profiles.

### 1. Clone and configure

```bash
git clone https://github.com/hetcharusat/lesswatch.git
cd lesswatch
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` for the last step.

Edit `.env` before starting. Set a unique `LIVEKIT_API_SECRET`; generate one with:

```bash
openssl rand -hex 32
```

### 2. Start the application

```bash
docker compose up -d --build
```

Open **http://localhost:3000** or `http://YOUR_SERVER_IP:3000`. Complete the setup wizard to create the first administrator, name your instance, and select its modules.

The default stack starts the app and LiveKit. Module switches in the admin panel control app features; Compose profiles control which optional containers are created.

### 3. Invite your people

Create member accounts in **Admin → Users & Vault**, or enable public signup in **Auth & Modules**. Share your instance URL and join the same room.

Use HTTPS for remote microphone and camera access. `localhost` works for development.

### Interactive Linux installer

Run the production launcher directly:

```bash
curl -fsSL https://raw.githubusercontent.com/hetcharusat/lesswatch/main/install.sh | bash
```

Or download it before running:

```bash
curl -fsSL https://raw.githubusercontent.com/hetcharusat/lesswatch/main/install.sh -o install.sh
bash install.sh
```

The installer launches `deploy.sh` to configure Docker, ports, modules, and domain or tunnel setup. It performs privileged system configuration and may create a **4 GB swap file** on low-memory hosts. Review the scripts before running them on an existing server.

By default, installation uses `~/lesswatch`. Existing non-Git folders are preserved and the launcher stops instead of replacing them. To choose another location:

```bash
LESSWATCH_INSTALL_DIR="$HOME/lesswatch-server" bash install.sh
```

Run `bash install.sh` from an existing project directory to deploy that local checkout. Clean checkouts at the default installation path update with `git pull --ff-only`; local modifications or a different branch are kept without an automatic update. An update failure stops deployment and displays the Git error. Root users do not need `sudo` installed; other users need sudo privileges. Docker installation and daemon startup are handled by the deployment script before containers are launched.

To update an existing installation with the one-line launcher, run the curl command from your home directory (`cd ~`) instead of from inside the project. Installer logs do not block updates; tracked local edits are preserved, and Git refuses to overwrite conflicting untracked files.

The installer preserves existing service credentials on reruns. Image pulls, app builds, service startup, and app health verification run as separate phases with plain Docker output in `install.log` (press **L** in the installer to expand logs). Progress advances when phases complete; a command with no output for five minutes fails with a retryable error instead of leaving a misleading progress bar running indefinitely. First-time image downloads can still take several minutes.

## HTTPS and networking

Point your domain's DNS to the VPS, then configure `.env`:

```dotenv
CADDY_DOMAIN=watch.example.com
CADDY_EMAIL=you@example.com
```

Start Caddy for automatic HTTPS:

```bash
docker compose --profile caddy up -d --build
```

Allow the ports needed for your deployment in both the host and cloud firewalls:

| Service | Ports | When needed |
| --- | --- | --- |
| Web application | TCP `3000`, or your configured `PORT` | Direct web access. |
| Caddy | TCP `80`, `443` | Domain access and automatic HTTPS. |
| LiveKit signaling | TCP `7880` | Direct signaling; Caddy can proxy it through `/livekit`. |
| LiveKit media | TCP `7881`, UDP `50000–50200` | Voice and camera connections. |
| Neko media | TCP `52000`, UDP `52000–52100` | Shared-browser WebRTC connections. |

Neko's HTTP interface stays on the Compose network and is reached through the app's `/neko` proxy. Set `NEKO_NAT1TO1` to the VPS public IP when appropriate for its network layout.

A web tunnel can expose the page and signaling, but does not automatically carry WebRTC UDP media. A page loading successfully does not confirm media connectivity.

## Shared browser (Neko)

Enable the module in the app, then create its container:

```bash
docker compose --profile neko up -d neko
```

For the full stack with HTTPS:

```bash
docker compose --profile caddy --profile neko up -d --build
```

The app manages Neko through the Docker socket and stops it after three minutes without anyone using a shared-browser room. Returning before the timeout cancels shutdown. **Stop browser** closes it for everyone, and background polling cannot restart it; select Shared Browser again to launch a new session. New sessions start in **Interact**, while joining a running session preserves its selected mode. The Interact / Watch switch controls the same desktop and encoder for all viewers.

`NEKO_DESKTOP_SCREEN` sets the desktop mode. Encoder settings live in [`neko.yaml`](neko.yaml): the current H.264 pipeline follows the selected refresh rate, up to 60 FPS, and shares one encoder across viewers.

### Small VPS settings

**Use Interact (720p30) for responsive interaction on a two-core server.** Watch keeps 1080p60 with an ultrafast 14 Mbps encoder; Interact uses ultrafast H.264 at 1.8 Mbps to reduce CPU load and network queues. At the same FPS, 1080p has 2.25 times as many pixels to process and needs more CPU and bandwidth. A configured refresh rate is a target, not a guarantee of delivered frames.

The current `.env.example` allows Neko **3072 MiB** of memory. **That exceeds the budget of a 2 GB VPS shared with the app and LiveKit.** A constrained-host starting point to measure is:

```dotenv
NEKO_DESKTOP_SCREEN=1280x720@30
NEKO_MEMORY_LIMIT=1400m
NEKO_MEMORY_RESERVATION=768m
```

Heavy pages can exceed this limit and restart Neko. Monitor the whole host, close unnecessary tabs, and avoid simultaneous transcoding. If it cannot sustain the workload, try `1024x576@60` for motion or `1280x720@30` for lower frame-processing demand.

`shm_size: 2gb` is a shared-memory ceiling, not preallocated RAM. Swap may help with memory exhaustion, but swapping during playback can cause stalls.

Apply environment changes and inspect resource use:

```bash
docker compose --profile neko up -d --force-recreate neko
docker stats
```

The embedded client currently uses `pwd=admin` in its Neko URL. Changing Neko passwords independently can break automatic login; coordinate that change with the client integration. Docker socket access gives the app powerful host-level permissions, so run the stack on a host you control.

## Local development

Use **Node.js 22.12+** and npm. Install FFmpeg, aria2, and yt-dlp separately if you need their features outside Docker.

From the repository root:

```bash
cp .env.example .env
npm ci
npm --prefix client ci
```

Run the backend in one terminal:

```bash
node --env-file=.env --watch server.js
```

Run the frontend in another:

```bash
npm --prefix client run dev
```

Open **http://localhost:5173**. Vite proxies `/api`, `/livekit`, `/neko`, and `/socket.io` to the backend on port `3000`. Keep that port unless you also update [`client/vite.config.js`](client/vite.config.js).

`npm start` and `npm run dev` do not automatically load `.env`; the Node command above loads it explicitly.

For a local backend with LiveKit in Docker:

```bash
docker compose up -d livekit
```

Set `LIVEKIT_URL=ws://127.0.0.1:7880` for the local backend and use matching LiveKit credentials. The hostname `livekit` resolves inside Docker, not from the host. Neko also needs a host-reachable endpoint when the backend runs outside Docker; its HTTP port is not published by default.

### Production frontend build

```bash
npm --prefix client run build
```

Vite writes the frontend into `public/`, which Express serves. **The Dockerfile copies this directory; it does not build the frontend.** Rebuild it after UI changes before rebuilding the app image.

## Configuration reference

See [`.env.example`](.env.example) for the full template.

| Variable | Purpose |
| --- | --- |
| `PORT` | Published web port in Compose; listen port for a directly running Node backend. |
| `DATA_PATH`, `DOWNLOADS_PATH` | Host paths mounted into Docker for persistent data and media. |
| `DATA_DIR`, `DOWNLOADS_DIR` | Runtime paths for a directly running Node backend. |
| `PUID`, `PGID`, `TZ` | Container file ownership and timezone. |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Matching credentials for token generation and LiveKit. |
| `LIVEKIT_URL` | LiveKit address reachable from the backend. |
| `LIVEKIT_WS_URL` | Optional browser-facing LiveKit WebSocket URL. |
| `CADDY_DOMAIN`, `CADDY_EMAIL` | HTTPS domain and certificate contact. |
| `NEKO_URL`, `NEKO_CONTAINER_NAME`, `NEKO_IMAGE` | Neko upstream, managed container name, and image. |
| `NEKO_DESKTOP_SCREEN` | Resolution and refresh rate, such as `1280x720@30`. |
| `NEKO_MEMORY_LIMIT`, `NEKO_MEMORY_RESERVATION` | Neko hard memory limit and soft reservation. |
| `NEKO_NAT1TO1` | Advertised address for applicable Neko NAT deployments. |
| `VAULT_SECRET` | Optional vault-key override; otherwise the instance generates a key. |
| `SUBDL_API_KEY` | Optional subtitle-search API key. |

## Keyboard shortcuts

While the theater has focus:

| Key | Action |
| --- | --- |
| `Enter` | Open instant bubble chat and focus its input. |
| `Enter` in chat | Send the message; an empty composer closes. |
| `C` | Toggle the chat sidebar. |
| `F` | Toggle theater fullscreen. |
| Hold `V` | Push to talk. |
| `Esc` | Close active chat or overlays; exit fullscreen when applicable. |

Text fields and interactive controls keep their normal keyboard behavior. Neko forwards room shortcuts from its embedded client; text entry inside a remote website is controlled by that remote browser.

## Updates and backups

```bash
# Inspect services and follow logs
docker compose ps
docker compose logs -f watch-together

# Update source, build the frontend, then rebuild the app
git pull
npm --prefix client ci
npm --prefix client run build
docker compose up -d --build

# Stop the stack
docker compose down
```

Include your optional `--profile` flags when updating those services. An app update does not automatically pull a newer Neko image; its default image is version-pinned.

Back up the configured data directory, downloaded media, and `.env`. The data directory contains accounts, sessions, configuration, and the generated vault key. Stop writes while taking a consistent backup, and preserve `VAULT_SECRET` if you supplied one.

Account passwords are stored as login hashes and also encrypted for administrator recovery. Treat the data and its encryption key as sensitive.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| UI changes are missing | Rebuild `client`, rebuild the app image, then refresh the browser. |
| Microphone or camera is unavailable | Use HTTPS or localhost, grant browser permissions, and run admin diagnostics. |
| Voice connects but media does not arrive | Check LiveKit media ports, public-IP detection, and cloud firewall rules. |
| Shared browser stays on “Connecting” | Check the Neko container, proxy upstream, Docker socket, advertised IP, and media ports. |
| 720p works but 1080p stutters | Compare server CPU/RAM with browser WebRTC dropped-frame and decode statistics. More bitrate cannot fix an overloaded encoder. |
| Downloads or transcoding fail locally | Check that `aria2c`, `yt-dlp`, `ffmpeg`, and `ffprobe` are on `PATH`. |
| Files fail to play directly | Check source access, CORS, and browser codec support; convert media when needed. |
| Docker cannot write data | Check mounted paths and permissions against `PUID` and `PGID`. |

```bash
curl http://localhost:3000/api/health
docker compose logs --tail=100 watch-together livekit
docker compose --profile neko logs --tail=100 neko
docker stats
```

## Project layout

```text
client/                 React + Vite frontend and Capacitor Android wrapper
server.js               Express API, Socket.IO sync, media tools, and service proxies
public/                 Built frontend served by Express
extension/              Browser extension source
mobile/                 Flutter companion project
docker-compose.yml      App, LiveKit, and optional Neko/Caddy/tunnel services
neko.yaml               Shared-browser capture and WebRTC settings
neko-policies.json      Managed Chromium policies
livekit.yaml            Voice and camera server settings
Caddyfile               HTTPS and reverse-proxy configuration
deploy.sh               Interactive Linux deployment
docs/                   Architecture and deployment notes
```

See [`OCI_DEPLOYMENT.md`](OCI_DEPLOYMENT.md) for OCI-specific notes and the [Neko architecture notes](docs/NEKO_ROOT_CAUSE_AND_ARCHITECTURE.md) for networking and tunnel details.

## Contributing

Keep changes focused, explain the behavior they address, and include how you verified them. Run `npm test` for the Neko upstream-routing regression checks. For frontend changes, run `npm --prefix client run build`. For playback, chat, or WebRTC changes, test with two browser sessions and describe the network and device conditions.

Check [`AGENTS.md`](AGENTS.md) for repository-specific coding-agent guidance. Never commit `.env`, account data, credentials, or personal media.
