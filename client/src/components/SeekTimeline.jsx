import React, { useRef, useState } from 'react';

export function SeekTimeline({ currentTime, duration, buffered, formatTime, onSeek, disabled = false }) {
  const [draft, setDraft] = useState(null);
  const [hover, setHover] = useState(null);
  const dragging = useRef(false);
  const pending = useRef(0);
  const end = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const clamp = (value) => Math.max(0, Math.min(end, Number.isFinite(value) ? value : 0));
  const value = clamp(draft ?? currentTime);
  const percent = end ? value / end * 100 : 0;
  const preview = draft !== null ? value : hover;
  const previewPercent = end && preview !== null ? preview / end * 100 : 0;
  const unavailable = disabled || !end;

  return (
    <div className={`a4-timeline seek-timeline ${draft !== null ? 'is-scrubbing' : ''}`}>
      <div className="seek-times">
        <span className="seek-elapsed">{formatTime(value)}</span>
        <span className="seek-total"> / {formatTime(end)}</span>
        <span className="seek-remaining">−{formatTime(Math.max(0, end - value))}</span>
      </div>
      <div className="seek-control" onPointerLeave={() => setHover(null)}>
        <div className="seek-rail" aria-hidden="true">
          <div className="seek-buffer" style={{ width: `${end ? clamp(buffered) / end * 100 : 0}%` }} />
          <div className="seek-progress" style={{ width: `${percent}%` }} />
        </div>
        <input
          className="seek-input"
          type="range"
          aria-label="Seek video"
          aria-valuetext={`${formatTime(value)} of ${formatTime(end)}`}
          min={0} max={end || 1} step={0.1} value={value} disabled={unavailable}
          onPointerDown={(event) => {
            if (event.button !== 0 || unavailable) return;
            dragging.current = true;
            pending.current = value;
            setDraft(value);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onChange={(event) => {
            const next = clamp(Number(event.currentTarget.value));
            if (dragging.current) {
              pending.current = next;
              setDraft(next);
            } else {
              onSeek(next);
            }
          }}
          onPointerUp={(event) => {
            if (!dragging.current) return;
            dragging.current = false;
            onSeek(pending.current);
            setDraft(null);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => { dragging.current = false; setDraft(null); }}
          onPointerCancel={() => { dragging.current = false; setDraft(null); setHover(null); }}
          onBlur={() => { dragging.current = false; setDraft(null); setHover(null); }}
          onPointerMove={(event) => {
            if (unavailable || event.pointerType === 'touch') return;
            const rect = event.currentTarget.getBoundingClientRect();
            // Match the native thumb's 14px travel inset.
            setHover(clamp((event.clientX - rect.left - 7) / Math.max(1, rect.width - 14) * end));
          }}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
            event.preventDefault();
            const delta = ['ArrowLeft', 'ArrowDown', 'PageDown'].includes(event.key) ? -1 : 1;
            const step = event.key.startsWith('Page') ? 30 : 5;
            onSeek(event.key === 'Home' ? 0 : event.key === 'End' ? end : clamp(value + delta * step));
          }}
        />
        {preview !== null && !unavailable && (
          <div className="seek-preview" aria-hidden="true" style={{ left: `clamp(44px, ${previewPercent}%, calc(100% - 44px))` }}>
            {formatTime(preview)}
          </div>
        )}
      </div>
    </div>
  );
}
