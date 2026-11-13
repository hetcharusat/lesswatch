import React, { useState, useEffect } from 'react';
import { ClayDownload, ClayPlay, ClayPopcorn } from './ClayIcons';

export function Downloader() {
  const [url, setUrl] = useState('');
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(false);

  async function fetchDownloads() {
    try {
      const token = localStorage.getItem('wt_token');
      const res = await fetch('/api/downloads/active', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      setDownloads(data.active || []);
    } catch (err) {
      console.warn('Downloader poll error:', err);
    }
  }

  useEffect(() => {
    fetchDownloads();
    const interval = setInterval(fetchDownloads, 2500);
    return () => clearInterval(interval);
  }, []);

  async function handleAddDownload(e) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('wt_token');
      const res = await fetch('/api/downloads/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ url })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setUrl('');
        fetchDownloads();
      } else {
        alert('Download Error: ' + (data.error || `Server returned HTTP ${res.status}`));
      }
    } catch (err) {
      alert('Network error connecting to server: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* 1st-Pouf Puffy Add Download Card */}
      <div
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fff0f5 100%)',
          borderRadius: '24px',
          padding: '1.5rem',
          border: '1.5px solid rgba(244, 114, 182, 0.35)',
          boxShadow: '0 8px 24px rgba(244, 114, 182, 0.16), inset 0 2px 0 rgba(255, 255, 255, 0.95), inset 0 -2px 4px rgba(244, 114, 182, 0.1)'
        }}
      >
        <form onSubmit={handleAddDownload} style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
          <div
            style={{
              flex: 1,
              minWidth: '280px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#ffffff',
              borderRadius: '9999px',
              padding: '8px 18px',
              border: '1.5px solid rgba(244, 114, 182, 0.45)',
              boxShadow: 'inset 0 2px 4px rgba(244, 114, 182, 0.1)'
            }}
          >
            <ClayDownload size={20} />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste magnet:?xt=urn:btih:... or Direct MP4 / MKV link"
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#831843'
              }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="pouf-btn-tactile"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              borderRadius: '9999px',
              background: 'linear-gradient(180deg, #ec4899 0%, #db2777 100%)',
              color: '#ffffff',
              border: '1.5px solid rgba(255, 255, 255, 0.5)',
              boxShadow: '0 6px 16px rgba(219, 39, 119, 0.35), inset 0 2px 0 rgba(255, 255, 255, 0.6), inset 0 -2px 4px rgba(0, 0, 0, 0.15)',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <ClayPlay size={16} />
            <span>{loading ? 'Adding...' : 'Start Download'}</span>
          </button>
        </form>
      </div>

      {/* Active & Queued Downloads Deck */}
      <div
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fff5f8 100%)',
          borderRadius: '24px',
          padding: '1.5rem',
          border: '1.5px solid rgba(244, 114, 182, 0.35)',
          boxShadow: '0 8px 24px rgba(244, 114, 182, 0.14), inset 0 2px 0 rgba(255, 255, 255, 0.95), inset 0 -2px 4px rgba(244, 114, 182, 0.1)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.1rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 12px',
              borderRadius: '9999px',
              background: 'rgba(244, 114, 182, 0.15)',
              fontWeight: 800,
              fontSize: '0.82rem',
              color: '#831843',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            <span>Active Downloads ({downloads.length})</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {downloads.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3.5rem 1rem',
                color: '#78345c',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.6rem'
              }}
            >
              <ClayPopcorn size={42} />
              <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#831843' }}>
                No active downloads right now
              </div>
              <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>
                Paste a magnet link or media URL above to download directly to your server!
              </div>
            </div>
          ) : (
            downloads.map((task) => {
              const completed = parseInt(task.completedLength || 0, 10);
              const total = parseInt(task.totalLength || 0, 10);
              const percent = total > 0 ? Math.floor((completed / total) * 100) : 0;
              const speed = (parseInt(task.downloadSpeed || 0, 10) / (1024 * 1024)).toFixed(2);
              const title = (task.bittorrent && task.bittorrent.info && task.bittorrent.info.name) ||
                            (task.files && task.files[0] && task.files[0].path) || `Task ${task.gid}`;

              return (
                <div
                  key={task.gid}
                  style={{
                    background: '#ffffff',
                    borderRadius: '18px',
                    padding: '1.1rem 1.25rem',
                    border: '1.5px solid rgba(244, 114, 182, 0.35)',
                    boxShadow: '0 4px 12px rgba(244, 114, 182, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <strong style={{ fontSize: '0.92rem', color: '#831843', wordBreak: 'break-word' }}>
                      {title}
                    </strong>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '9999px',
                        background: 'linear-gradient(180deg, #fbcfe8 0%, #f472b6 100%)',
                        color: '#831843',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        boxShadow: '0 2px 6px rgba(244, 114, 182, 0.25)'
                      }}
                    >
                      {percent}%
                    </span>
                  </div>

                  {/* Marshmallow Bouncy Progress Bar */}
                  <div
                    style={{
                      width: '100%',
                      height: '10px',
                      background: 'rgba(244, 114, 182, 0.18)',
                      borderRadius: '9999px',
                      overflow: 'hidden',
                      padding: '2px',
                      boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.08)'
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(2, percent)}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #f472b6, #ec4899, #db2777)',
                        borderRadius: '9999px',
                        boxShadow: '0 0 10px rgba(236, 72, 153, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
                        transition: 'width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: '#78345c', fontWeight: 700 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      ⚡ {speed} MB/s
                    </span>
                    <span>
                      {(completed / (1024 * 1024)).toFixed(1)} / {(total / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default Downloader;
