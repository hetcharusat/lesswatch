---
name: media-stream-extractor
description: >-
  Techniques for extracting and proxying direct HLS (.m3u8), MP4, and anime streaming provider links
  using yt-dlp and CORS reverse proxies for native browser playback.
---

# Media Stream Extractor & CORS Proxy Runbook

## Overview
Anime and movie streaming websites (e.g. HiAnime, 9anime, FMovies, Soap2day) host video on third-party CDNs (MegaCloud, Vidcloud, Rapid-Cloud, Streamtape). To play these natively in browser without running a virtual desktop:

1. **Stream Resolution via yt-dlp**:
   - `yt-dlp` extracts the master `.m3u8` or direct `.mp4` link from 1000+ supported video hosts.
   - Run in Node.js via child process or Python daemon on EC2.

2. **CORS Headers Proxying**:
   - Video CDNs often send strict `Access-Control-Allow-Origin` or check the `Referer` / `Origin` header.
   - The EC2 runs an HTTP stream proxy:
     ```
     Browser Request → EC2 Proxy (`/proxy/stream?url=...&referer=...`) → Video CDN
     ```
   - The proxy strips restrictive CORS headers and injects necessary headers (e.g. `Referer: https://videohost.com`), delivering clean HLS segments to both browsers.

3. **Client Playback**:
   - Loaded directly in browser via `hls.js`.
   - Local hardware decoding with zero lag and full quality.
