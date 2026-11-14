# 🐱 Neko Virtual Shared Browser: Deep Root-Cause Analysis, Diagnostics & Production Architectural Blueprint

> **Executive Summary**: This document provides an exhaustive, root-cause diagnostic of why the **Neko Virtual Shared Browser (`m1k1o/neko`)** succeeds with sub-30ms responsiveness on dedicated Linux Cloud VMs (Ubuntu VPS / OCI / AWS), but suffers from infinite loading (`Connecting...` cat logo), packet loss, or high input latency when deployed inside **Google Cloud Shell** behind **Cloudflare Quick Tunnels (`trycloudflare.com`)**. It details the underlying media/networking pipeline, the five fatal bottlenecks of ephemeral sandbox environments, and actionable architectural solutions.

---

## 1. Architectural Overview: How Neko Works

Neko is an open-source, self-hosted virtual desktop environment inside Docker that captures an X11 desktop and streams it to multiple remote viewers via WebRTC.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       NEKO CONTAINER (Docker)                               │
│                                                                             │
│  ┌────────────────┐     X11 Screen Capture     ┌────────────────────────┐  │
│  │ Chromium / X11 │ ─────────────────────────> │ Software VP8 / H.264   │  │
│  │ (Software Mesa)│   (Desktop buffer @ 720p)  │ Video Encoder (CPU)    │  │
│  └────────────────┘                            └───────────┬────────────┘  │
│           ▲                                                │               │
│           │ Keyboard / Mouse Events                        ▼               │
│  ┌────────┴────────┐    Signaling & State       ┌────────────────────────┐  │
│  │ WebSocket API   │ <───────────────────────>  │ Pion WebRTC Engine     │  │
│  │ (Port 8080/tcp) │                            │ (UDP 52000-52100)      │  │
│  └─────────────────┘                            └───────────┬────────────┘  │
│           ▲                                                 │               │
└───────────┼─────────────────────────────────────────────────┼───────────────┘
            │                                                 │
            │ HTTP / WebSocket                                │ WebRTC RTP / RTCP
            │ (Works over Cloudflare Tunnel)                  │ (REQUIRES UDP OR TURN)
            ▼                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      VIEWER BROWSER CLIENT (Remote Home PC)                 │
│                                                                             │
│   • UI / Controls (Iframe: /neko/?usr=Viewer&pwd=admin&embed=1)             │
│   • HTML5 <video> element receiving decoded WebRTC stream                   │
│   • Web AudioContext for low-latency synchronized sound                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Three Independent Traffic Channels:
1. **HTTP Asset Channel (Port 8080 TCP)**:
   - Serves Neko's client web GUI (HTML, JavaScript, CSS, icons).
   - Handles REST authentication: `POST /api/login`, `GET /api/whoami`.
2. **WebSocket Signaling & Input Channel (Port 8080 TCP)**:
   - Handles WebSockets (`/api/ws?token=...`).
   - Negotiates WebRTC SDP offer/answer and sends client mouse/keyboard input events.
3. **WebRTC Media Stream (UDP Ports 52000-52100)**:
   - Transports live video (VP8/H.264) and audio (Opus) packets using RTP/RTCP.
   - **Crucial**: This channel is **UDP-based** and operates independently of the HTTP/WebSocket connection.

---

## 2. The 5 Root Causes of Why Neko Stalls/Lags on Cloud Shell + Cloudflare

| Problem Observed | Primary Symptom | Exact Root Cause |
|---|---|---|
| **Stuck on Neko Cat Logo with Green Dot** | Infinite spinner, video never renders | Cloudflare Tunnel drops UDP; STUN fails behind Cloud Shell symmetric NAT; fallback TURN relay fails or stalls. |
| **Heavy Lag / Input Delay (1-3s)** | Typing or mouse movement takes seconds to react | CPU saturation (100% on 2 shared vCPUs) due to software rendering + software video encoding. |
| **Stuttering / Dropped Frames** | Video plays like a slideshow (5-10 fps) | TURN relay packet throttling or bufferbloat over TCP fallback. |
| **`/neko/api/whoami` 401 Unauthorized** | Console error on initial load | Expected initial session probe before `?pwd=admin` login token is established (harmless unless auto-login is blocked). |
| **No Audio / Muted Video** | Video plays but zero sound comes out | Browser autoplay restrictions on cross-origin iframes without user gesture. |

---

### Root Cause 1: Cloudflare Quick Tunnels DO NOT Tunnel UDP Traffic
* **The Reality**: Cloudflare Quick Tunnels (`*.trycloudflare.com` via `cloudflared`) operate strictly at **Layer 7 (HTTP/1.1, HTTP/2, WebSockets)**.
* **The Failure**: Cloudflare Tunnel **cannot and does not route UDP packets**.
* **What Happens**:
  1. The browser successfully connects to the web UI and WebSocket signaling via `https://xxxx.trycloudflare.com/neko`.
  2. Neko sends its WebRTC SDP offer containing server ICE candidates (e.g., `UDP 52000-52100`).
  3. The viewer's browser tries to send WebRTC UDP packets to the tunnel hostname. Cloudflare rejects or drops all non-HTTP/WS packets.
  4. The WebRTC connection state remains in `connecting` indefinitely.

---

### Root Cause 2: Google Cloud Shell Has No Public IP & Blocks Inbound UDP
* **The Reality**: Google Cloud Shell is a container running inside a Google Kubernetes cluster behind **Carrier-Grade Symmetric NAT (CGNAT)**.
* **The Failure**:
  - Google Cloud Shell has **zero inbound port forwarding** for UDP from the public internet.
  - Standard STUN (Session Traversal Utilities for NAT) works by punching a reflexive hole in cone NATs. But under **Symmetric NAT**, the external port mapping changes for every destination IP. The public port reported by Google's STUN server cannot be reached by the client's home PC.
* **What Happens**: Direct peer-to-peer UDP connection between the user's home PC and the Cloud Shell container is physically impossible.

---

### Root Cause 3: The Free Public TURN Relay Bottleneck (OpenRelay)
* **The Reality**: When direct UDP and STUN hole-punching both fail, WebRTC's only remaining survival mechanism is a **TURN (Traversal Using Relays around NAT)** server operating over TCP or TLS (port 443).
* **The Failure**:
  - The project uses `turn:openrelay.metered.ca:443?transport=tcp`.
  - OpenRelay is a **free public community TURN server** shared by thousands of developers globally.
  - Streaming 720p 30fps video requires **2.5 to 3.5 Mbps of continuous upstream and downstream bandwidth**.
  - When OpenRelay is under high load or enforces rate limits, it drops WebRTC packets or delays them. Over TCP, dropped packets trigger TCP retransmissions (Head-of-Line Blocking), which destroys the real-time nature of WebRTC.
* **What Happens**: The WebRTC stream hangs on "Connecting...", or connects after 45 seconds with extreme latency and stutter.

---

### Root Cause 4: CPU Software Rasterization (llvmpipe) & Software Encoding on 2 vCPUs
* **The Reality**: Virtual machines without dedicated GPU passthrough must render modern web pages and desktop graphics via CPU software rasterizers (Mesa `llvmpipe`).
* **The Numbers on Google Cloud Shell**:
  - Cloud Shell provides **2 shared vCPUs** (often throttled Intel Xeon or AMD EPYC slices).
  - Modern Chromium rendering a modern website (YouTube, Netflix, anime players with WebAssembly/Canvas) consumes **70–90% of 1 vCPU**.
  - Software VP8 video encoding at 1280x720 30fps consumes **80–110% of 1 vCPU**.
  - Total CPU load = **150–200% (pegging both vCPUs at 100%)**.
* **What Happens**:
  - When CPU hits 100%, the Pion WebRTC frame grabber drops frames.
  - Video framerate collapses to 5–12 fps.
  - Mouse movement and keyboard input events queue up in the WebSocket buffer, causing 1–3 seconds of input lag.

---

### Root Cause 5: Autoplay Policies on Embedded Iframes
* **The Reality**: All modern browsers (Google Chrome, Microsoft Edge, Mozilla Firefox, Apple Safari) enforce strict **Autoplay Policies**.
* **The Failure**: An iframe loaded from another origin or subpath cannot play WebRTC audio with sound unless:
  1. The user has physically interacted with the iframe (clicked inside it).
  2. The iframe has `allow="autoplay; camera; microphone; fullscreen; clipboard-read; clipboard-write; display-capture"`.
* **What Happens**: If the user does not click inside Neko's iframe, the WebRTC audio sink stays in `suspended` state, and some WebRTC implementations will pause video rendering until the audio context is unlocked.

---

## 3. Why a Production Server (Dedicated Cloud VM) Works Flawlessly

When deployed on a **Dedicated Linux Cloud VM (Ubuntu VPS / Oracle Cloud / AWS / DigitalOcean / Hetzner)**:

| Factor | Google Cloud Shell + Cloudflare Tunnel | Production Dedicated Cloud VM |
|---|---|---|
| **Public IP** | None (Symmetric NAT behind Google CGNAT) | **Dedicated Public IPv4 Address** |
| **Inbound UDP** | 100% Blocked by Google Firewall | **Direct Inbound UDP Allowed** (`ufw allow 52000:52100/udp`) |
| **WebRTC Route** | Relayed via free OpenRelay over TCP 443 | **Direct Host-to-Host UDP** (`ICE-Lite` direct connection) |
| **Network Latency** | 150ms – 400ms (Relay hops + TCP backoff) | **15ms – 45ms** (Direct peer-to-peer UDP) |
| **CPU Resources** | 2 shared, throttled sandbox vCPUs | 4 Dedicated OCPUs / 8 vCPUs (e.g. OCI Ampere A1 Free Tier) |
| **GPU/Encoding** | CPU software llvmpipe (100% CPU lock) | High-speed multi-threaded CPU or VAAPI/NVENC hardware encoder |
| **Stability** | Ephemeral (resets after 20-60 min) | **24/7 Persistent Background Service** with auto-reboot |

---

## 4. Architectural Solutions & Future Implementation Roadmap

### Path A: Production VPS Deployment (The Permanent Fix — Recommended)
This is the standard, battle-tested deployment target for self-hosted WebRTC rooms.
1. Run on any VPS with a public IP:
   - **Oracle Cloud Always Free Tier**: 4 OCPUs (ARM64 Ampere), 24 GB RAM, 100% free forever.
   - **Hetzner Cloud**: 2-4 vCPU x86 instance (~€4/month).
   - **DigitalOcean / AWS Lightsail**: Standard droplet with public IPv4.
2. In `.env`:
   ```bash
   NEKO_ICELITE=1
   NEKO_WEBRTC_ICELITE=1
   NEKO_NAT1TO1=<YOUR_SERVER_PUBLIC_IP>
   NEKO_WEBRTC_NAT1TO1=<YOUR_SERVER_PUBLIC_IP>
   NEKO_EPR=52000-52100
   NEKO_WEBRTC_EPR=52000-52100
   ```
3. Open firewall ports:
   ```bash
   sudo ufw allow 3000/tcp
   sudo ufw allow 52000:52100/udp
   ```
4. **Result**: Direct UDP connection. ZERO TURN servers required. Neko connects in <200ms with zero lag.

---

### Path B: Dedicated Self-Hosted CoTURN Relay (For NAT/Sandboxed Environments)
If users MUST host on a restricted machine without public UDP:
1. Deploy an unthrottled **CoTURN** instance on a cheap $3/month VPS:
   ```yaml
   services:
     coturn:
       image: coturn/coturn:latest
       network_mode: host
       command:
         - -n
         - --log-file=stdout
         - --min-port=49160
         - --max-port=49200
         - --realm=turn.myvps.com
         - --user=wtuser:wtpassword123
         - --lt-cred-mech
         - --fingerprint
   ```
2. Point `neko.yaml` and `server.js` to `turn:turn.myvps.com:3478` with private credentials.
3. **Result**: Replaces overloaded public OpenRelay with a dedicated 100+ Mbps TURN pipeline.

---

### Path C: Alternative to Neko for Video Watching (Pouf Player Native Sync)
For 90% of user watch parties (YouTube, Anime, Direct Video Files, Torrents, HLS Streams):
* **Why run a heavy virtual browser just to watch a video?**
* Watch Together already includes the high-performance **Pouf Player** (HTML5 / Video.js / ArtPlayer) with:
  - Sub-second WebSocket clock synchronization.
  - Native browser hardware decoding (uses viewer's local GPU, 0% server CPU).
  - Works 100% over standard HTTP, HTTPS, and Cloudflare Tunnels with ZERO WebRTC UDP requirements!
* **Recommendation**:
  - Keep Neko for interactive web browsing (e.g., navigating pages together).
  - Use **Media Library / Downloader / YouTube / HLS** for media playback.

---

## 5. Diagnostic Cheatsheet for Future Debugging

When testing Neko in any environment, follow these 3 diagnostic steps:

### 1. Check Chrome WebRTC Internals:
In Google Chrome on the viewer's computer:
1. Open a new tab and navigate to: `chrome://webrtc-internals`
2. Look for the active PeerConnection corresponding to Neko.
3. Check **`iceConnectionState`**:
   - If stuck on `checking` or `disconnected`: UDP and TURN candidates failed to handshake.
   - If `connected`: Connection established. Look at `bytesReceivedIn5Sec` and `framesDecoded`.
4. Inspect the **Active Candidate Pair**:
   - `local-candidate`: `host` or `relay`
   - `remote-candidate`: `host` (Direct UDP, ideal) vs `relay` (TURN fallback, high latency).

### 2. Check Neko Container Logs:
```bash
docker logs --tail 100 -f neko
```
Look for:
- `webrtc: connecting`: WebRTC handshake initiated.
- `webrtc: connected`: PeerConnection established successfully.
- `webrtc: failed`: All ICE candidate pairs timed out.

### 3. Verify UDP Port Accessibility from Remote:
From your home computer terminal:
```bash
# Test UDP connectivity to Neko port
nc -u -z -v <SERVER_IP> 52000
```
If this times out or reports `unreachable`, inbound UDP is blocked by a cloud firewall or NAT.

---

*Document compiled for Watch Together Engineering & Model Upgrades.*

