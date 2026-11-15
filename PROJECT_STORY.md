# 🍿 LESSWATCH (Watch Together): The Engineering Story & Technical Retrospective

> **"It started with wanting to watch a movie with her without Discord ruining the quality, and ended with building a full-stack, sub-second synchronized cinema platform with WebRTC spatial voice, floating webcams, and a 1-line self-hosted installer."**

---

## 📖 Executive Summary & Context (For ChatGPT / Readers)

This document is a complete technical case study and development journey of **LESSWATCH** (originally *Watch Together*). 

It details:
1. **The Origin Story**: Who this was built for, why existing solutions failed, and the personal motivation behind creating it.
2. **What Was Built**: Full architectural breakdown of the platform (sub-second sync, WebRTC SFU voice/video, custom Video.js 10 Cinema HUD, virtual browser, universal media engine).
3. **The Engineering Challenges & "War Stories"**: The technical roadblocks encountered—from browser HEVC decoding failures to WebRTC left-ear audio glitches, Bluetooth HFP degradation, Docker OOM crashes on free-tier EC2 instances, and terminal stdin pipe hangs—and how each was solved.
4. **The Evolution**: How a rough date-night script transformed into a polished, self-hosted open-source application with a 60 FPS animated Terminal UI and a 1-line `curl | bash` deployment engine.

---

## 1. The Origin Story: Why I Built This & For Whom

### The Real-World Motivation
The motivation behind this project was deeply personal: **a long-distance relationship**. 

When you are long-distance, movie nights and anime marathons aren't just entertainment—they are one of the few ways to share an evening, feel close, and hang out in real time. 

However, trying to watch a movie together online in 2026 is still an exercise in frustration:
- **Discord Screen Share**: Compresses video to muddy 720p/30fps. Dark scenes in horror or cinema become unwatchable macro-blocking pixel soup. High-framerate anime stutters, and audio is downsampled into aggressive compression. Plus, Discord screen-sharing requires the host's PC to constantly decode and re-encode video on the fly, heating up laptops and draining batteries.
- **Browser Extensions (Teleparty, Watch2Gether, etc.)**: Prone to constant desync. They only work on specific streaming sites, require both parties to have paid subscriptions to the same service in the same region, and cannot handle local video files, personal libraries, or anime downloads.
- **Plex / Jellyfin SyncPlay**: Clunky setup, audio track desynchronization, and zero integrated voice or camera communication. You still need Discord running side-by-side, which forces constant Alt-Tabbing.

### The Turning Point: The *Hannibal* & Low-Spec Laptop Crisis
The catalyst for building LESSWATCH happened on a real movie night:
We sat down to watch the TV series *Hannibal* and some anime (*JoJo’s Bizarre Adventure*). 
- My setup had a dedicated GPU and high-end hardware.
- **Her setup was a standard, entry-level HP office laptop with integrated Intel graphics and stock Windows.**

The result? Total failure.
The file played flawlessly on my screen, but on her laptop, it was a **pure black screen with audio and unresponsive player controls**. She couldn't watch, and trying to troubleshoot codecs, VLC sync plugins, or Discord streams killed the mood of the entire evening. 

That was the moment I decided: **I am done using third-party tools. I am going to build our own cinema platform from scratch.**

It had to meet three non-negotiable rules:
1. **Zero Device Burden**: It must work on any standard laptop, phone, or tablet directly in the browser—no high-end GPU or special codecs required.
2. **True Cinema Quality & Sub-Second Sync**: Native 1080p/4K video with zero compression artifacts, sub-second sync drift compensation, and multi-track audio/subtitles.
3. **All-in-One Presence**: Built-in crystal-clear voice chat, push-to-talk, and draggable floating webcams right inside the player, without needing Discord or any secondary app open.

---

## 2. What Was Built: System Architecture & Features

LESSWATCH evolved into a complete, self-hosted, distributed media streaming and real-time collaboration stack.

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                           LESSWATCH CLIENT                             │
 │  ┌───────────────────────┐  ┌────────────────────┐  ┌───────────────┐  │
 │  │ Video.js 10 Cinema HUD│  │  WebRTC AV Mesh /  │  │ Obsidian Chat │  │
 │  │ (Liquid Glassmorphism)│  │ LiveKit SFU Client │  │ (GIPHY/Reactions)│
 │  └───────────┬───────────┘  └─────────┬──────────┘  └───────┬───────┘  │
 └──────────────┼────────────────────────┼─────────────────────┼──────────┘
                │ HTTP Range / WS        │ WebRTC / WSS        │ Socket.io
 ┌──────────────▼────────────────────────▼─────────────────────▼──────────┐
 │                           BACKEND CONTAINER                            │
 │  ┌──────────────────────────────────────────────────────────────────┐  │
 │  │ Express.js Engine:                                               │  │
 │  │  • Sub-Second NTP Drift Sync & Synchronized Seek Barrier         │  │
 │  │  • HTTP 206 Partial Content Streamer (10MB bounded chunks)       │  │
 │  │  • Real-time FFmpeg Audio/Video Transcoder & Remuxer             │  │
 │  │  • SubDL & OpenSubtitles API with on-the-fly ASS->VTT converter  │  │
 │  │  • WebTorrent & Direct Stream Downloader Engine                  │  │
 │  └──────────────────────────────────┬───────────────────────────────┘  │
 └─────────────────────────────────────┼──────────────────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
 ┌─────────────────────────────┐               ┌──────────────────────────┐
 │     LIVEKIT SFU SERVER      │               │   NEKO VIRTUAL BROWSER   │
 │ WebRTC Selective Forwarding │               │ Chromium Virtual Desktop │
 │ (Sub-50ms Voice & Webcams)  │               │ (Shared Web Browsing)    │
 └─────────────────────────────┘               └──────────────────────────┘
```

### Core Capabilities Built:
1. **Zero-Drift Playback Sync Engine**:
   - WebSocket-based clock drift synchronization using a custom NTP-style round-trip time estimator.
   - **Synchronized Seek Barrier**: When anyone scrubs or jumps ahead, both players enter a synchronized buffering state, waiting for mutual readiness before unpausing at the exact same millisecond.
2. **Integrated Studio Voice & Webcam System**:
   - **LiveKit SFU** with automatic **P2P WebRTC fallback**: Sub-50ms latency voice and video feeds.
   - **RNNoise AI Background Noise Suppression** & acoustic echo cancellation running client-side via Web Audio API.
   - **Push-to-Talk (PTT)** with instant floating voice indicator HUD on holding the `V` key.
   - **Magnetic Floating Webcam Dock**: Draggable webcam cards that snap to screen edges, morph on hover into per-peer volume sliders, and auto-dim during movie immersion.
3. **Universal Media & Subtitle Engine**:
   - Support for direct local files (`.mp4`, `.mkv`, `.webm`), HLS `.m3u8` live streams, and YouTube synchronization.
   - **SubDL API Integration**: Direct subtitle search by movie/episode title, automatic `.zip` archive extraction on the server, and instant on-the-fly conversion from stylized `.ass` / `.ssa` subtitles to browser-compliant `.vtt`.
   - **Dual-Audio Track Switcher**: Dynamic server-side audio track extraction and multi-audio stream synchronization.
4. **Shared Virtual Browser (Neko)**:
   - Integrated Dockerized Chromium desktop inside the theater so users can browse any website together or watch DRM-gated platforms in real time with shared mouse and keyboard control.
5. **Obsidian Pink Cinema UI**:
   - Built with React, Vite, and custom CSS glassmorphism (neon pink, deep obsidian slate, specular highlights, and 6px backdrop blur).
   - Video.js 10 custom skin with floating pill controls, cinema vignette gradients, film grain toggle, 200% audio booster, and full WhatsApp-style read ticks in chit-chat.

---

## 3. The Major Engineering Challenges & How They Were Solved

Building this platform meant encountering nearly every edge case in web media playback, real-time networking, and Linux cloud infrastructure. Here are the hardest technical problems faced and their solutions:

---

### Challenge 1: The "Black Screen of Death" on Low-End Laptops (HEVC/x265 vs Chrome)
- **The Problem**: When streaming 1080p BluRay releases encoded in HEVC (H.265), the video played smoothly on a gaming PC but displayed a pure black screen on an office laptop with integrated graphics.
- **The Root Cause**: Google Chrome does not bundle a royalty-free software HEVC decoder on Windows due to licensing costs; it relies entirely on the OS hardware decoder. Laptops without a dedicated GPU or the OEM Microsoft HEVC extension cannot decode HEVC inside Chrome.
- **How We Solved It**:
  1. Implemented a dual-path media pipeline: Added server-side auto-probing (`ffprobe`) to detect video codecs upfront.
  2. For files with HEVC encoding, the server initiates an on-the-fly stream remux into universal H.264 (AVC) with fast preset copying when needed.
  3. Hosted the official Microsoft OEM HEVC extension package directly on the server's static endpoint so users could install the native Windows decoder with a single double-click without paying the Microsoft Store fee.

---

### Challenge 2: The Video Desync Nightmare & Audio Scrub Loops
- **The Problem**: Early versions suffered from "rubber-banding"—if one user experienced a 200ms network hiccup, the synchronization engine would forcibly seek their video to match the host, causing repetitive audio stuttering and frame jumps. Furthermore, scrubbing the timeline while paused often trapped the player in an infinite pause-play loop.
- **The Root Cause**: High-frequency WebSocket state broadcasts without timestamp delta thresholds caused event feedback loops (User A receives seek -> emits seek -> User B receives seek -> emits seek).
- **How We Solved It**:
  1. **Relaxed Natural Window**: Allowed a 2-second drift threshold where no seeking occurs, letting normal browser buffering handle small jitter naturally.
  2. **Synchronized Seek Barrier**: Created a two-phase commit for seeking:
     - When a seek occurs, the coordinator emits `playback:seeking` with the target timestamp.
     - Both clients pause and buffer the chunk.
     - Once both clients fire the `canplaythrough` event, a `playback:ready` signal unlocks playback simultaneously across all clients.
  3. **Event Origin Guarding**: Attached unique UUIDs and client socket IDs to every playback action so clients ignore reflections of their own events.

---

### Challenge 3: WebRTC "Left-Ear Only" Voice & Bluetooth Audio Quality Collapse
- **The Problem**: 
  1. Viewers reported that other participants' voices were only audible in the **left ear** of their headphones.
  2. When someone turned their microphone on while wearing Bluetooth headphones, the movie audio instantly became muffled and tinny, dropping from 48kHz stereo to an 8kHz telephone sound.
- **The Root Cause**:
  1. Chromium handles single-channel mono microphone inputs by sending single-channel SDP audio packets. Certain operating systems route this directly to the left stereo channel instead of centering it across both ears.
  2. Bluetooth headsets operate in two profiles: **A2DP** (high-quality stereo playback, mic disabled) and **HFP** (Hands-Free Profile: 8kHz mono audio + mic). Keeping a WebRTC microphone track open permanently locks the user's Bluetooth headset in low-bandwidth HFP mode.
- **How We Solved It**:
  1. **Receiver-Side Web Audio API Channel Splitter/Merger**: Intercepted incoming WebRTC audio streams using `AudioContext.createChannelSplitter(2)` and piped the mono track into a `ChannelMergerNode` with identical gain nodes on both channels (Left + Right), guaranteeing centered stereo audio for all headsets.
  2. **Push-to-Talk (PTT) Dynamic Track Activation**: Designed a global keyboard listener on the `V` key. Audio tracks are only unmuted and published during the push-to-talk press. When released, the mic track is muted and audio constraints release the hardware, keeping Bluetooth headphones in Hi-Fi A2DP mode throughout the movie.

---

### Challenge 4: Floating Webcam Grid & React Re-Render Flickering
- **The Problem**: Every time a participant spoke, their webcam box would flash, stutter, or drop frames. Dragging a webcam across the screen caused choppy 15 FPS movement and lag.
- **The Root Cause**: 
  1. Passing speaking volume thresholds into React state caused the entire `<PartyWebcamGrid />` component to re-render 60 times a second. Re-rendering in React was disconnecting and reconnecting the `<video>` element's `srcObject` MediaStream.
  2. Dragging relied on React state updates (`onMouseMove` updating `style={{ left, top }}`), triggering full DOM reconciliation loops on every mouse movement.
- **How We Solved It**:
  1. **Direct GPU Pointer Capture**: Rewrote the webcam drag system using native DOM `setPointerCapture` and hardware-accelerated CSS `transform: translate3d(x, y, 0)`. Dragging now runs at a buttery-smooth 120 FPS directly on the GPU without triggering any React state changes.
  2. **Component Hoisting & CSS-Only Speaking Rings**: Hoisted the `<video>` stream wrappers into isolated memoized containers that never re-mount when volume meters fluctuate.

---

### Challenge 5: Running Docker Stacks on Free-Tier Cloud Instances ($0 AWS / Oracle)
- **The Problem**: When running the full stack (Node.js, LiveKit SFU, Neko Chromium container, and client build) on free-tier cloud instances like AWS EC2 `t3.micro` (1 GB RAM), the server would suddenly freeze and drop SSH connections. Inspecting system logs revealed the Linux **OOM (Out of Memory) Killer** was killing the processes.
- **The Root Cause**: Compiling Vite frontend bundles and running LiveKit inside Docker containers exceeds 1 GB of physical memory.
- **How We Solved It**:
  1. In the installer script (`deploy.sh`), added an automatic memory check: if the host system has less than 2 GB of RAM, it immediately creates and enables a **2 GB Linux swap file** (`/swapfile`) with optimized swappiness.
  2. Implemented multi-stage Docker builds with BuildKit caching so dependencies (`node_modules`) are pre-compiled and never compiled during production launches.
  3. Configured 10MB chunk-bounded HTTP 206 streaming for local video files so the server never loads entire gigabyte video files into RAM.

---

### Challenge 6: The Stdin Pipe Conflict (`curl ... | bash` Hanging)
- **The Problem**: When creating a 1-line installer (`curl -fsSL https://.../install.sh | bash`), the terminal would print an empty prompt and hang indefinitely until the user pressed `^C`.
- **The Root Cause**: The installer was designed with an interactive arrow-key Terminal UI (TUI). To read keyboard arrow keys, the script called `exec </dev/tty`. But in a piped execution (`curl | bash`), bash itself is reading the script commands from `stdin`! Calling `exec </dev/tty` abruptly cut off bash from reading the curl stream, freezing the shell.
- **How We Solved It**:
  - Separated the architecture into two scripts:
    1. **`install.sh`**: A lightweight, non-interactive bootstrap script that only downloads or clones the repository into `~/lesswatch`.
    2. **`deploy.sh`**: The full interactive TUI orchestrator. `install.sh` finishes by executing `exec sudo ./deploy.sh "$@" </dev/tty`. Because `deploy.sh` is now reading from a real file on disk, bash can safely attach `stdin` to `/dev/tty` for interactive keyboard arrow controls without any pipe conflict.

---

## 4. The Evolution: From Private Date-Night Tool to Open-Source LESSWATCH

| Phase | What It Was | Tech & State |
| :--- | :--- | :--- |
| **Phase 1: The Quick Hack** | A rough local Node.js script and an ngrok tunnel so two people could watch an episode together. | Hardcoded IPs, messy audio, manual VLC sync, zero UI. |
| **Phase 2: The Custom Player** | Dedicated web app deployed on a private EC2 server with a custom Video.js skin, SubDL integration, and chat. | Smooth playback, but still relied on Discord for voice chat. |
| **Phase 3: The Presence Layer** | LiveKit SFU integration, P2P mesh fallback, floating magnetic webcams, push-to-talk, and Neko virtual browser. | Fully independent from Discord. Immersive cinema experience. |
| **Phase 4: The Open-Source Product (LESSWATCH)** | Enterprise-grade packaging: 60 FPS animated Terminal UI, 1-line curl installer, Docker Compose orchestration, auto-SSL with Caddy, and automatic swap allocation for free-tier VMs. | Anyone can run their own self-hosted movie theater in 60 seconds. |

---

## 5. Complete Tech Stack Overview

| Layer | Technologies Used | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18, Vite | High-performance SPA with instant HMR and lightweight bundle. |
| **Video Engine** | Video.js 10, HLS.js | Custom HTML5 cinema player, HLS streaming, and audio booster. |
| **Real-Time Sync** | WebSockets (Socket.io) | NTP drift compensation, seek barrier locks, chat, and room state. |
| **Voice & Video Chat**| LiveKit SFU, WebRTC, RNNoise | Sub-50ms voice/video, AI noise suppression, PTT, floating webcams. |
| **Audio Processing** | Web Audio API | Centered stereo channel merger, volume flyouts, and 13-bar VU meters. |
| **Backend Server** | Node.js, Express.js | HTTP 206 chunked video streaming, room management, API endpoints. |
| **Subtitles** | SubDL API, Adm-Zip, subtitle.js | Automatic subtitle search, zip unpacking, and ASS-to-VTT conversion. |
| **Virtual Browser** | Neko (Chromium Docker) | Embedded multi-user web browsing inside the theater room. |
| **Orchestration** | Docker, Docker Compose | Containerized microservices (App, LiveKit, Neko, Caddy). |
| **DevOps & TUI** | Bash (ANSI 256/Truecolor), Caddy | 60 FPS interactive terminal installer, automatic Let's Encrypt SSL. |

---

## 6. Key Engineering Lessons Learned

1. **Never Trust Client Clocks**: Client device clocks can drift by hundreds of milliseconds. Never compare raw `Date.now()` across two different computers without calculating an NTP-style round-trip offset.
2. **WebRTC Is Not Just Video, It's Audio Physics**: Building real-time audio requires understanding operating system audio pipelines, microphone channel counts, and Bluetooth hardware profile limitations (A2DP vs HFP).
3. **Decouple High-Frequency State from React**: Keep 60 FPS animations, mouse dragging, and audio VU meters outside the React reconciliation tree using raw DOM references and GPU transforms.
4. **Design for the Weakest Link**: In collaborative applications, your system's performance is defined by the user with the oldest laptop and weakest Wi-Fi. If you optimize for the office laptop with integrated graphics, it will fly on everything else.
5. **Developer Experience Makes or Breaks Open Source**: A brilliant project with a 20-step manual setup guide will gather dust. Packaging complex multi-container software into a friendly, beautiful 1-line interactive installer makes self-hosting accessible to everyone.

---

*LESSWATCH is open-source under the MIT License on GitHub: [https://github.com/hetcharusat/lesswatch](https://github.com/hetcharusat/lesswatch)*
