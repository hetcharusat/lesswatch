import React, { useState, useEffect } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { io } from 'socket.io-client';

export function LiveBanner({ onJoinRoom }) {
  const [liveData, setLiveData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function checkPresence() {
      try {
        const res = await fetch('/api/live-status');
        const data = await res.json();
        if (isMounted) {
          if (data.isWatching && data.activeRoom) {
            setLiveData(data);
          } else {
            setLiveData(null);
          }
        }
      } catch (err) {
        console.warn('Presence notice:', err);
      }
    }

    checkPresence();

    // Instant real-time socket notification when someone starts playing or joins!
    const socket = io({
      path: '/api/v1/sync',
      transports: ['websocket', 'polling']
    });
    socket.on('live:update', (data) => {
      if (isMounted) {
        if (data.isWatching && data.activeRoom) {
          setLiveData(data);
        } else {
          setLiveData(null);
        }
      }
    });

    const interval = setInterval(checkPresence, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  if (!liveData) return null;

  return (
    <div className="pink-live-banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          background: 'rgba(255, 42, 133, 0.25)',
          border: '1px solid var(--pink-primary)',
          color: '#fff',
          padding: '0.3rem 0.85rem',
          borderRadius: 'var(--radius-full)',
          fontSize: '0.78rem',
          fontWeight: 700,
          letterSpacing: '0.05em'
        }}>
          <span className="pink-pulse-dot"></span>
          <span>LIVE NOW</span>
        </div>

        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>
            {liveData.activeTitle || 'Movie Watch Party'}
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--pink-blush)' }}>
            {liveData.watchers.map((w) => `${w.avatar === 'jotaro' ? '★' : w.avatar === 'jolyne' ? '🦋' : (w.avatar || '🌸')} ${w.name}`).join(', ')} currently watching in room "{liveData.activeRoom}"
          </p>
        </div>
      </div>

      <button
        onClick={() => onJoinRoom(liveData.activeRoom)}
        className="btn-pink-primary"
        style={{ padding: '0.65rem 1.4rem' }}
      >
        <Play size={16} fill="currentColor" />
        <span>Join Watch Party</span>
      </button>
    </div>
  );
}
