import React, { useState, useEffect } from 'react';
import {
  ClayFilm,
  ClayTv,
  ClayPopcorn,
  ClayFolder,
  ClayPlay,
  ClayClose,
  ClaySearch,
  ClayRefresh,
  ClayArrow
} from './ClayIcons';

export function CreateRoomModal({ isOpen, onClose, onLaunchMedia, defaultRoom = 'lounge' }) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState('library'); // 'library' | 'neko' | 'youtube'
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [nekoStartUrl, setNekoStartUrl] = useState('https://hianime.to');

  // Library State
  const [currentFolder, setCurrentFolder] = useState('');
  const [parentFolder, setParentFolder] = useState(null);
  const [libraryFolders, setLibraryFolders] = useState([]);
  const [libraryFiles, setLibraryFiles] = useState([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Load Library whenever activeTab is library or folder changes
  useEffect(() => {
    if (activeTab === 'library') {
      loadLibrary(currentFolder);
    }
  }, [activeTab, currentFolder]);

  async function loadLibrary(folder = '') {
    setLoadingLibrary(true);
    try {
      const url = folder ? `/api/library?folder=${encodeURIComponent(folder)}` : '/api/library';
      const res = await fetch(url);
      const data = await res.json();

      if (Array.isArray(data)) {
        setLibraryFiles(data);
        setLibraryFolders([]);
        setParentFolder(null);
      } else {
        setLibraryFiles(data.files || []);
        setLibraryFolders(data.folders || []);
        setParentFolder(data.parentFolder !== undefined ? data.parentFolder : null);
      }
    } catch (err) {
      console.warn('Failed to load library:', err);
    } finally {
      setLoadingLibrary(false);
    }
  }

  function handleLaunchNeko(e) {
    e.preventDefault();
    onLaunchMedia({
      type: 'neko',
      url: `/neko/?url=${encodeURIComponent(nekoStartUrl)}`,
      title: 'Shared Virtual Browser (Neko)',
      roomId: defaultRoom
    });
    onClose();
  }

  function handleLaunchYouTube(e) {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;
    onLaunchMedia({
      type: 'youtube',
      url: youtubeUrl.trim(),
      title: 'YouTube Stream',
      roomId: defaultRoom
    });
    onClose();
  }

  function handleSelectLibraryFile(file) {
    onLaunchMedia({
      type: file.mediaType || (file.streamUrl?.includes('.m3u8') ? 'hls' : 'direct'),
      url: file.streamUrl,
      title: file.filename,
      subtitleUrl: file.subtitleUrl,
      roomId: defaultRoom
    });
    onClose();
  }

  const filteredFiles = libraryFiles.filter((f) =>
    f.filename.toLowerCase().includes(searchFilter.trim().toLowerCase())
  );

  return (
    <div className="pink-modal-backdrop" onClick={onClose}>
      <div
        className="pink-modal-card"
        style={{ maxWidth: '640px', width: '92%', padding: '1.75rem', background: '#fff9fc' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (High Contrast Crisp Deep Berry Text) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ClayPopcorn size={32} />
            <div>
              <h2 style={{
                fontSize: '1.35rem',
                fontWeight: 800,
                color: '#831843',
                margin: '0 0 0.2rem 0',
                letterSpacing: '-0.01em'
              }}>
                Change Lounge Media
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#78345c', margin: 0, fontWeight: 500 }}>
                Pick downloaded anime/movies, launch the shared browser, or play YouTube:
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
            title="Close"
          >
            <ClayClose size={24} />
          </button>
        </div>

        {/* 3 Streamlined Clay Option Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          background: 'rgba(244, 114, 182, 0.08)',
          padding: '6px',
          borderRadius: '16px',
          border: '1.5px solid rgba(244, 114, 182, 0.25)',
          marginBottom: '1.25rem'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            style={{
              background: activeTab === 'library' ? 'linear-gradient(145deg, #ffffff, #ffe4f1)' : 'transparent',
              border: activeTab === 'library' ? '1.5px solid #ec4899' : '1.5px solid transparent',
              borderRadius: '12px',
              padding: '10px 6px',
              color: activeTab === 'library' ? '#9d174d' : '#78345c',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 800,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'library' ? '0 4px 12px rgba(236,72,153,0.2)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <ClayFilm size={22} />
            <span>Downloaded Media</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('neko')}
            style={{
              background: activeTab === 'neko' ? 'linear-gradient(145deg, #ffffff, #fffbeb)' : 'transparent',
              border: activeTab === 'neko' ? '1.5px solid #f59e0b' : '1.5px solid transparent',
              borderRadius: '12px',
              padding: '10px 6px',
              color: activeTab === 'neko' ? '#b45309' : '#78345c',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 800,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'neko' ? '0 4px 12px rgba(245,158,11,0.2)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <ClayTv size={22} />
            <span>Shared Browser</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('youtube')}
            style={{
              background: activeTab === 'youtube' ? 'linear-gradient(145deg, #ffffff, #ffe4f1)' : 'transparent',
              border: activeTab === 'youtube' ? '1.5px solid #ec4899' : '1.5px solid transparent',
              borderRadius: '12px',
              padding: '10px 6px',
              color: activeTab === 'youtube' ? '#9d174d' : '#78345c',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 800,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'youtube' ? '0 4px 12px rgba(236,72,153,0.2)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <ClayPopcorn size={22} />
            <span>YouTube</span>
          </button>
        </div>

        {/* Tab 1: Downloaded Media Browser */}
        {activeTab === 'library' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Filter Search Input & Refresh */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <div className="pink-input-group" style={{ flex: 1 }}>
                <span className="pink-input-icon">
                  <ClaySearch size={16} />
                </span>
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter downloaded files..."
                  className="pink-input"
                  style={{
                    fontSize: '0.82rem',
                    padding: '0.55rem 0.85rem 0.55rem 2.4rem',
                    background: '#ffffff',
                    border: '1.5px solid rgba(244, 114, 182, 0.4)',
                    color: '#3b142d'
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => loadLibrary(currentFolder)}
                className="btn-pink-secondary"
                style={{ padding: '0.55rem 0.75rem', borderRadius: '12px' }}
                title="Refresh Library"
              >
                <ClayRefresh size={18} />
              </button>
            </div>

            {/* Folder Navigation Path */}
            {currentFolder && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                background: 'rgba(236, 72, 153, 0.08)',
                borderRadius: '10px',
                fontSize: '0.78rem',
                color: '#831843'
              }}>
                <button
                  type="button"
                  onClick={() => setCurrentFolder(parentFolder || '')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#be185d',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 800
                  }}
                >
                  <ClayArrow direction="left" size={14} />
                  <span>Up</span>
                </button>
                <span>/</span>
                <span style={{ color: '#831843', fontWeight: 700 }}>{currentFolder}</span>
              </div>
            )}

            {/* Folder & Files List */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxHeight: '300px',
              overflowY: 'auto',
              paddingRight: '4px'
            }}>
              {loadingLibrary ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#78345c', fontSize: '0.85rem', fontWeight: 600 }}>
                  Loading downloaded files on EC2... ⚡
                </div>
              ) : libraryFolders.length === 0 && filteredFiles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#78345c', fontSize: '0.85rem' }}>
                  No downloaded media files found in this folder.
                  <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#be185d', fontWeight: 600 }}>
                    Het can download torrents or direct videos in the Downloads tab!
                  </div>
                </div>
              ) : (
                <>
                  {/* Subfolders */}
                  {libraryFolders.map((f) => (
                    <div
                      key={f.relativePath}
                      onClick={() => setCurrentFolder(f.relativePath)}
                      style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#ffffff',
                        border: '1.5px solid rgba(244, 114, 182, 0.35)',
                        borderRadius: '14px',
                        boxShadow: '0 3px 8px rgba(244,114,182,0.12)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                        <ClayFolder size={22} />
                        <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#3b142d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {f.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: '#78345c', fontWeight: 700 }}>
                        <span>{f.itemCount} items</span>
                        <ClayArrow direction="right" size={14} />
                      </div>
                    </div>
                  ))}

                  {/* Media Files */}
                  {filteredFiles.map((file) => (
                    <div
                      key={file.filename}
                      onClick={() => handleSelectLibraryFile(file)}
                      style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#ffffff',
                        border: '1.5px solid rgba(244, 114, 182, 0.35)',
                        borderRadius: '14px',
                        boxShadow: '0 3px 8px rgba(244,114,182,0.12)',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ overflow: 'hidden', paddingRight: '0.75rem' }}>
                        <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#3b142d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {file.filename}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#78345c', marginTop: '2px', fontWeight: 600 }}>
                          {file.sizeFormatted} • Tap to stream with synchronized controls
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-pink-primary"
                        style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem', gap: '6px', flexShrink: 0, borderRadius: '12px' }}
                      >
                        <ClayPlay size={16} />
                        <span>Play</span>
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Shared Virtual Browser (Neko) */}
        {activeTab === 'neko' && (
          <form onSubmit={handleLaunchNeko} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              background: '#fffbeb',
              border: '1.5px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '14px',
              padding: '0.9rem 1.1rem',
              fontSize: '0.82rem',
              color: '#78345c',
              lineHeight: 1.5
            }}>
              <strong style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <ClayTv size={18} />
                Shared Virtual Browser (Neko on EC2):
              </strong>
              Streams a live Chromium session with built-in adblock. Both Het and Ria share mouse and keyboard controls on the exact same browser page with ultra-low latency WebRTC.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#831843', marginBottom: '0.4rem', fontWeight: 700 }}>
                Start URL
              </label>
              <input
                type="text"
                value={nekoStartUrl}
                onChange={(e) => setNekoStartUrl(e.target.value)}
                placeholder="https://hianime.to"
                className="pink-input"
                style={{ width: '100%', background: '#ffffff', color: '#3b142d', border: '1.5px solid var(--pink-rose)' }}
              />
            </div>

            <button
              type="submit"
              className="btn-gold-shimmer"
              style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', borderRadius: '14px', gap: '8px' }}
            >
              <ClayTv size={20} />
              <span>Launch Shared Browser (Neko) ✨</span>
            </button>
          </form>
        )}

        {/* Tab 3: YouTube */}
        {activeTab === 'youtube' && (
          <form onSubmit={handleLaunchYouTube} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#831843', marginBottom: '0.4rem', fontWeight: 700 }}>
                YouTube Video or Shorts URL
              </label>
              <input
                type="text"
                required
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="pink-input"
                style={{ width: '100%', background: '#ffffff', color: '#3b142d', border: '1.5px solid var(--pink-rose)' }}
              />
            </div>

            <button
              type="submit"
              className="btn-pink-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', borderRadius: '14px', gap: '8px' }}
            >
              <ClayPopcorn size={20} />
              <span>Launch YouTube in Lounge 🍿</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default CreateRoomModal;
