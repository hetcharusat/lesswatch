---
name: torrent-streaming-pipeline
description: >-
  Architectural patterns, HTTP range streaming, subtitle extraction, and WebTorrent/torrent-stream
  integration for browser-native video playback from torrents without local downloading.
---

# Torrent Streaming Pipeline Runbook

## Overview
Streaming torrented video files directly into web browsers requires solving three problems:
1. **Sequential Torrent Piece Retrieval**: Normal BitTorrent downloads pieces randomly. Streaming requires prioritizing pieces sequentially from the current playback timestamp.
2. **Container & Codec Compatibility**: Many anime/movie torrents use Matroska (.mkv) containers with HEVC/H.265 or AAC/Opus audio. Chrome/Firefox natively play MP4 (H.264/AAC). For non-native containers, on-the-fly remuxing via FFmpeg or native MKV parsing is required.
3. **HTTP 206 Partial Content (Byte-Range Requests)**: HTML5 `<video>` requires byte-range requests (`Range: bytes=start-end`) to seek forward and backward smoothly.

## Pipeline Architecture
```
[Magnet Link / Torrent]
       ↓
[torrent-stream / WebTorrent Engine]
       ↓ (Sequential Piece Priority)
[HTTP Range Stream Server (Port 3000)]
       ↓
[Native HTML5 Video Player in Browser (Client A & Client B)]
```

## Key Guidelines
- Never store entire uncompressed files before streaming begins.
- Support instant seeking by translating time offsets to file byte offsets.
- Automatically parse and serve external/internal WebVTT subtitles.
