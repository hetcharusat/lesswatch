import React, { useState, useEffect } from 'react';
import { ClayDownload, ClayPlay, ClayPopcorn, ClayTrash, ClayRefresh, ClayCheck, ClayClose } from './ClayIcons';

export function Downloader() {
  const [url, setUrl] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'completed' | 'failed'
  const [downloads, setDownloads] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [stopped, setStopped] = useState([]);
  const [restricted, setRestricted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  function notify(msg) {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  }

  async function fetchDownloads() {
    try {
      const token = localStorage.getItem('wt_token');
      const res = await fetch('/api/downloads/active', {
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.restricted) {
        setRestricted(true);
        return;
      }
      setRestricted(false);
      setDownloads(data.active || []);
      setWaiting(data.waiting || []);
      setStopped(data.stopped || []);
    } catch (err) {
      console.warn('Downloader poll error:', err);
    }
  }

  useEffect(() => {
    fetchDownloads();
    const interval = setInterval(fetchDownloads, 2000);
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
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ url: url.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        notify('🚀 Download queued successfully!');
        setUrl('');
        fetchDownloads();
      } else {
        notify('❌ ' + (data.error || `Server returned HTTP ${res.status}`));
      }
    } catch (err) {
      notify('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelDownload(gid) {
    try {
      const token = localStorage.getItem('wt_token');
      await fetch('/api/downloads/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ gid })
      });
      notify('Download cancelled');
      fetchDownloads();
    } catch (err) {
      notify('Failed to cancel: ' + err.message);
    }
  }

  async function handleClearHistory() {
    try {
      const token = localStorage.getItem('wt_token');
      await fetch('/api/downloads/clear', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      notify('History cleared');
      fetchDownloads();
    } catch (err) {
      notify('Failed to clear: ' + err.message);
    }
  }

  async function handleRetry(downloadUrl) {
    if (!downloadUrl) return;
    setUrl(downloadUrl);
    notify('URL loaded into download bar. Press Start Download!');
  }

  // Filter stopped list into completed and failed
  const completedList = stopped.filter((t) => t.status === 'complete' || (!t.errorMessage && (t.percent >= 100 || t.status === 'finished')));
  const failedList = stopped.filter((t) => t.status === 'error' || t.errorMessage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* Toast Notice */}
      {actionNotice && (
        <div
          style={{
            padding: '10px 18px',
            borderRadius: '16px',
            background: 'linear-gradient(180deg, #ec4899 0%, #db2777 100%)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '0.88rem',
            boxShadow: '0 8px 24px rgba(219, 39, 119, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <span>{actionNotice}</span>
          <button
            onClick={() => setActionNotice(null)}
            style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', display: 'flex' }}
          >
            <ClayClose size={16} />
          </button>
        </div>
      )}

      {/* Admin Restriction Banner */}
      {restricted && (
        <div
          style={{
            background: '#fff1f2',
            border: '1.5px solid #fecdd3',
            borderRadius: '20px',
            padding: '1rem 1.25rem',
            color: '#9f1239',
            fontSize: '0.88rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <span>🔒 Downloader is restricted to Administrator accounts. Please log in with an Admin account to manage server downloads.</span>
        </div>
      )}

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
              placeholder="Paste magnet link, direct MP4/MKV URL, YouTube or video stream..."
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

      {/* Downloads Deck */}
      <div
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fff5f8 100%)',
          borderRadius: '24px',
          padding: '1.5rem',
          border: '1.5px solid rgba(244, 114, 182, 0.35)',
          boxShadow: '0 8px 24px rgba(244, 114, 182, 0.14), inset 0 2px 0 rgba(255, 255, 255, 0.95), inset 0 -2px 4px rgba(244, 114, 182, 0.1)'
        }}
      >
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('active')}
              style={{
                padding: '6px 16px',
                borderRadius: '9999px',
                background: activeTab === 'active' ? 'linear-gradient(180deg, #ec4899 0%, #db2777 100%)' : '#ffffff',
                color: activeTab === 'active' ? '#ffffff' : '#831843',
                border: '1.5px solid rgba(244, 114, 182, 0.4)',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeTab === 'active' ? '0 4px 12px rgba(219, 39, 119, 0.25)' : 'none'
              }}
            >
              <span>Active ({downloads.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('completed')}
              style={{
                padding: '6px 16px',
                borderRadius: '9999px',
                background: activeTab === 'completed' ? 'linear-gradient(180deg, #ec4899 0%, #db2777 100%)' : '#ffffff',
                color: activeTab === 'completed' ? '#ffffff' : '#831843',
                border: '1.5px solid rgba(244, 114, 182, 0.4)',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeTab === 'completed' ? '0 4px 12px rgba(219, 39, 119, 0.25)' : 'none'
              }}
            >
              <span>Completed ({completedList.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('failed')}
              style={{
                padding: '6px 16px',
                borderRadius: '9999px',
                background: activeTab === 'failed' ? 'linear-gradient(180deg, #ec4899 0%, #db2777 100%)' : '#ffffff',
                color: activeTab === 'failed' ? '#ffffff' : '#831843',
                border: '1.5px solid rgba(244, 114, 182, 0.4)',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeTab === 'failed' ? '0 4px 12px rgba(219, 39, 119, 0.25)' : 'none'
              }}
            >
              <span>Failed ({failedList.length})</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchDownloads}
              style={{
                padding: '6px 12px',
                borderRadius: '9999px',
                background: '#ffffff',
                border: '1.5px solid rgba(244, 114, 182, 0.35)',
                color: '#831843',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <ClayRefresh size={14} />
              <span>Refresh</span>
            </button>

            {(completedList.length > 0 || failedList.length > 0) && (
              <button
                onClick={handleClearHistory}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  background: '#ffffff',
                  border: '1.5px solid rgba(244, 114, 182, 0.35)',
                  color: '#be185d',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ClayTrash size={14} />
                <span>Clear History</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: Active Downloads */}
        {activeTab === 'active' && (
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
                  No active downloads running
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>
                  Paste a magnet link or media URL above to stream directly to your server storage!
                </div>
              </div>
            ) : (
              downloads.map((task) => {
                const completed = parseInt(task.completedLength || 0, 10);
                const total = parseInt(task.totalLength || 0, 10);
                const percent = Math.min(100, task.percent !== undefined ? task.percent : (total > 0 ? Math.floor((completed / total) * 100) : 0));
                const speed = task.downloadSpeed || '0 MB/s';
                const title = task.title || `Download Task ${task.gid}`;

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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                        <button
                          onClick={() => handleCancelDownload(task.gid)}
                          title="Cancel Download"
                          style={{
                            border: 'none',
                            background: '#fee2e2',
                            color: '#ef4444',
                            borderRadius: '9999px',
                            width: '26px',
                            height: '26px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <ClayClose size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar */}
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
                        ⚡ {speed}
                      </span>
                      <span>
                        {total > 0 ? `${(completed / (1024 * 1024)).toFixed(1)} / ${(total / (1024 * 1024)).toFixed(1)} MB` : 'Buffering stream...'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Completed Downloads */}
        {activeTab === 'completed' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {completedList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#78345c' }}>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#831843' }}>No completed downloads yet</div>
              </div>
            ) : (
              completedList.map((task) => (
                <div
                  key={task.gid}
                  style={{
                    background: '#ffffff',
                    borderRadius: '18px',
                    padding: '1rem 1.25rem',
                    border: '1.5px solid rgba(16, 185, 129, 0.3)',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '9999px',
                        background: '#d1fae5',
                        color: '#059669',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <ClayCheck size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: '0.9rem', color: '#065f46', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.title}
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: '#047857', fontWeight: 600 }}>
                        ✓ Ready in Media Library {task.totalLength ? `(${(task.totalLength / (1024 * 1024)).toFixed(1)} MB)` : ''}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleCancelDownload(task.gid)}
                    title="Remove from history"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#9ca3af',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                  >
                    <ClayTrash size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Failed Downloads */}
        {activeTab === 'failed' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {failedList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#78345c' }}>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#059669' }}>All downloads healthy! No failed tasks.</div>
              </div>
            ) : (
              failedList.map((task) => (
                <div
                  key={task.gid}
                  style={{
                    background: '#ffffff',
                    borderRadius: '18px',
                    padding: '1rem 1.25rem',
                    border: '1.5px solid rgba(239, 68, 68, 0.35)',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ fontSize: '0.9rem', color: '#991b1b', display: 'block', wordBreak: 'break-word' }}>
                      {task.title}
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600, display: 'block', marginTop: '2px' }}>
                      ⚠️ {task.errorMessage || 'Download interrupted or host connection refused.'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleRetry(task.url || task.title)}
                      style={{
                        border: 'none',
                        background: '#fef2f2',
                        color: '#b91c1c',
                        padding: '6px 12px',
                        borderRadius: '9999px',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => handleCancelDownload(task.gid)}
                      title="Dismiss"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#9ca3af',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                    >
                      <ClayClose size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Downloader;
