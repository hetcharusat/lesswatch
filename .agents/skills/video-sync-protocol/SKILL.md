---
name: video-sync-protocol
description: >-
  Sub-second precision clock synchronization, NTP drift compensation, anti-feedback event loops,
  and synchronized video playback across remote browsers over WebSockets.
---

# Video Synchronization Protocol Runbook

## Protocol Architecture

1. **State Ownership**:
   - The server maintains the authoritative room playback state:
     `{ isPlaying: boolean, currentTime: number, updatedAt: timestamp, playbackRate: number }`

2. **Accurate Elapsed Time Calculation**:
   ```javascript
   function getAuthoritativeTime(state) {
     if (!state.isPlaying) return state.currentTime;
     const elapsed = (Date.now() - state.updatedAt) / 1000;
     return state.currentTime + elapsed * state.playbackRate;
   }
   ```

3. **Drift Detection & Correction Matrix**:
   - `|clientTime - authoritativeTime| <= 0.4s`: In sync, no action needed.
   - `0.4s < drift <= 1.5s`: Minor drift. Nudge playback rate (e.g. 1.05x or 0.95x) to catch up smoothly without audio/video jumps.
   - `drift > 1.5s`: Hard seek to `authoritativeTime`.

4. **Anti-Feedback Loop Flagging**:
   - When a client receives a remote play/pause/seek command from the server, it sets `isRemoteAction = true`.
   - Native HTML5 `<video>` events (`onplay`, `onpause`, `onseeking`) ignore triggers while `isRemoteAction` is active.
   - Resets flag after execution settles (~300ms).
