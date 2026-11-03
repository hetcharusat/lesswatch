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
        style={{
          maxWidth: '680px',
          width: '94%',
          padding: '1.85rem',
          background: 'linear-gradient(155deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 242, 250, 0.96) 55%, rgba(254, 226, 242, 0.97) 100%)',
          backdropFilter: 'blur(28px) saturate(190%)',
          WebkitBackdropFilter: 'blur(28px) saturate(190%)',
          borderRadius: '30px',
          border: '2px solid rgba(255, 255, 255, 0.95)',
          boxShadow: '0 28px 65px -10px rgba(236, 72, 153, 0.32), 0 14px 28px -4px rgba(244, 114, 182, 0.22), inset 0 2px 5px rgba(255, 255, 255, 1), inset 0 -3px 6px rgba(244, 114, 182, 0.16)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (High Contrast Crisp Deep Berry Text & 3D Clay Popcorn Badge) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)',
              padding: '10px',
              borderRadius: '18px',
              boxShadow: '0 4px 12px rgba(236, 72, 153, 0.18), inset 0 2px 0 rgba(255, 255, 255, 0.9), inset 0 -2px 0 rgba(244, 114, 182, 0.3)',
              border: '1.5px solid rgba(255, 255, 255, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ClayPopcorn size={32} />
            </div>
            <div>
              <h2 style={{
                fontSize: '1.38rem',
                fontWeight: 800,
                color: '#831843',
                margin: '0 0 0.25rem 0',
                letterSpacing: '-0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>Change Lounge Media</span>
                <span style={{ fontSize: '1rem' }}>✨</span>
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#9d174d', margin: 0, fontWeight: 600 }}>
                Pick downloaded anime & movies, launch the shared browser, or stream YouTube:
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'linear-gradient(145deg, #ffffff, #ffe4f1)',
              border: '1.5px solid rgba(244, 114, 182, 0.35)',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(236, 72, 153, 0.15), inset 0 1px 0 #ffffff',
              transition: 'all 0.15s ease'
            }}
            title="Close"
          >
            <ClayClose size={20} />
          </button>
        </div>

        {/* 3 Streamlined Clay Option Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          background: 'rgba(244, 114, 182, 0.12)',
          padding: '6px',
          borderRadius: '20px',
          border: '1.5px solid rgba(244, 114, 182, 0.28)',
          boxShadow: 'inset 0 2px 6px rgba(190, 24, 93, 0.06)',
          marginBottom: '1.25rem'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            style={{
              background: activeTab === 'library'
                ? 'linear-gradient(145deg, #ffffff 0%, #ffe4f1 100%)'
                : 'transparent',
              border: activeTab === 'library'
                ? '1.8px solid #ec4899'
                : '1.8px solid transparent',
              borderRadius: '15px',
              padding: '10px 8px',
              color: activeTab === 'library' ? '#831843' : '#9d174d',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 800,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'library'
                ? '0 6px 16px rgba(236, 72, 153, 0.24), 0 2px 4px rgba(0,0,0,0.04), inset 0 1px 0 #ffffff'
                : 'none',
              transform: activeTab === 'library' ? 'translateY(-1px)' : 'none',
              transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            <ClayFilm size={22} />
            <span>Downloaded Media</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('neko')}
            style={{
              background: activeTab === 'neko'
                ? 'linear-gradient(145deg, #ffffff 0%, #fffbeb 100%)'
                : 'transparent',
              border: activeTab === 'neko'
                ? '1.8px solid #f59e0b'
                : '1.8px solid transparent',
              borderRadius: '15px',
              padding: '10px 8px',
              color: activeTab === 'neko' ? '#92400e' : '#9d174d',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 800,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'neko'
                ? '0 6px 16px rgba(245, 158, 11, 0.24), 0 2px 4px rgba(0,0,0,0.04), inset 0 1px 0 #ffffff'
                : 'none',
              transform: activeTab === 'neko' ? 'translateY(-1px)' : 'none',
              transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            <ClayTv size={22} />
            <span>Shared Browser</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('youtube')}
            style={{
              background: activeTab === 'youtube'
                ? 'linear-gradient(145deg, #ffffff 0%, #ffe4f1 100%)'
                : 'transparent',
              border: activeTab === 'youtube'
                ? '1.8px solid #ec4899'
                : '1.8px solid transparent',
              borderRadius: '15px',
              padding: '10px 8px',
              color: activeTab === 'youtube' ? '#831843' : '#9d174d',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 800,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'youtube'
                ? '0 6px 16px rgba(236, 72, 153, 0.24), 0 2px 4px rgba(0,0,0,0.04), inset 0 1px 0 #ffffff'
                : 'none',
              transform: activeTab === 'youtube' ? 'translateY(-1px)' : 'none',
              transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '12px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                  <ClaySearch size={18} />
                </span>
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter downloaded files..."
                  style={{
                    width: '100%',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    padding: '0.65rem 0.85rem 0.65rem 2.5rem',
                    background: '#ffffff',
                    border: '1.8px solid rgba(244, 114, 182, 0.45)',
                    borderRadius: '14px',
                    color: '#3b142d',
                    outline: 'none',
                    boxShadow: 'inset 0 2px 4px rgba(236, 72, 153, 0.06)'
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => loadLibrary(currentFolder)}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '14px',
                  background: 'linear-gradient(145deg, #ffffff, #ffe4f1)',
                  border: '1.8px solid rgba(244, 114, 182, 0.45)',
                  boxShadow: '0 4px 10px rgba(236, 72, 153, 0.15), inset 0 1px 0 #ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
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
                padding: '8px 14px',
                background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1) 0%, rgba(244, 114, 182, 0.06) 100%)',
                borderRadius: '12px',
                fontSize: '0.8rem',
                border: '1px solid rgba(244, 114, 182, 0.25)',
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
                    fontWeight: 800,
                    padding: 0
                  }}
                >
                  <ClayArrow direction="left" size={14} />
                  <span>Up</span>
                </button>
                <span style={{ opacity: 0.5 }}>/</span>
                <span style={{ color: '#831843', fontWeight: 800 }}>{currentFolder}</span>
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
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#831843', fontSize: '0.85rem', fontWeight: 700 }}>
                  Loading downloaded files on EC2... ⚡
                </div>
              ) : libraryFolders.length === 0 && filteredFiles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#78345c', fontSize: '0.85rem' }}>
                  No downloaded media files found in this folder.
                  <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#be185d', fontWeight: 700 }}>
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
                        padding: '0.85rem 1.15rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'linear-gradient(135deg, #ffffff 0%, #fff7fb 100%)',
                        border: '1.8px solid rgba(244, 114, 182, 0.38)',
                        borderRadius: '16px',
                        boxShadow: '0 4px 12px rgba(244, 114, 182, 0.12), inset 0 1px 0 #ffffff',
                        transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(236, 72, 153, 0.22), inset 0 1px 0 #ffffff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(244, 114, 182, 0.12), inset 0 1px 0 #ffffff';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                        <ClayFolder size={24} />
                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#3b142d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {f.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#9d174d', fontWeight: 700 }}>
                        <span style={{ background: 'rgba(236, 72, 153, 0.1)', padding: '2px 8px', borderRadius: '10px' }}>{f.itemCount} items</span>
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
                        padding: '0.85rem 1.15rem',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'linear-gradient(135deg, #ffffff 0%, #fff5fa 100%)',
                        border: '1.8px solid rgba(244, 114, 182, 0.38)',
                        borderRadius: '16px',
                        boxShadow: '0 4px 12px rgba(244, 114, 182, 0.12), inset 0 1px 0 #ffffff',
                        transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(236, 72, 153, 0.22), inset 0 1px 0 #ffffff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(244, 114, 182, 0.12), inset 0 1px 0 #ffffff';
                      }}
                    >
                      <div style={{ overflow: 'hidden', paddingRight: '0.85rem' }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#3b142d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {file.filename}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#9d174d', marginTop: '3px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ background: 'rgba(236, 72, 153, 0.1)', padding: '1px 6px', borderRadius: '8px' }}>{file.sizeFormatted}</span>
                          <span>•</span>
                          <span>Tap to stream with synced playback</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.82rem',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          flexShrink: 0,
                          borderRadius: '14px',
                          background: 'linear-gradient(145deg, #f472b6 0%, #ec4899 50%, #db2777 100%)',
                          border: '1.5px solid rgba(255, 255, 255, 0.65)',
                          color: '#ffffff',
                          boxShadow: '0 6px 14px rgba(236, 72, 153, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.45), inset 0 -2px 0 rgba(190, 24, 93, 0.6)',
                          cursor: 'pointer'
                        }}
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
          <form onSubmit={handleLaunchNeko} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <div style={{
              background: 'linear-gradient(145deg, #fffbeb 0%, #fef3c7 100%)',
              border: '1.8px solid rgba(245, 158, 11, 0.45)',
              borderRadius: '18px',
              padding: '1.1rem 1.25rem',
              fontSize: '0.84rem',
              color: '#78345c',
              lineHeight: 1.55,
              boxShadow: '0 6px 18px rgba(245, 158, 11, 0.12), inset 0 2px 0 rgba(255, 255, 255, 0.9)'
            }}>
              <strong style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '0.92rem' }}>
                <ClayTv size={20} />
                <span>Shared Virtual Browser (Neko on EC2)</span>
              </strong>
              Streams a live Chromium session with built-in adblock. Both Het and Ria share mouse and keyboard controls on the exact same browser page with ultra-low latency WebRTC.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#831843', marginBottom: '0.5rem', fontWeight: 800 }}>
                Start URL
              </label>
              <input
                type="text"
                value={nekoStartUrl}
                onChange={(e) => setNekoStartUrl(e.target.value)}
                placeholder="https://hianime.to"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '14px',
                  border: '1.8px solid rgba(245, 158, 11, 0.5)',
                  background: '#ffffff',
                  color: '#3b142d',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  outline: 'none',
                  boxShadow: 'inset 0 2px 4px rgba(245, 158, 11, 0.08)'
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '0.95rem',
                borderRadius: '16px',
                gap: '8px',
                display: 'flex',
                alignItems: 'center',
                fontSize: '0.95rem',
                fontWeight: 800,
                background: 'linear-gradient(145deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
                border: '1.5px solid rgba(255, 255, 255, 0.65)',
                color: '#ffffff',
                boxShadow: '0 8px 22px rgba(245, 158, 11, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.5), inset 0 -2px 0 rgba(180, 83, 9, 0.6)',
                cursor: 'pointer'
              }}
            >
              <ClayTv size={20} />
              <span>Launch Shared Browser (Neko) ✨</span>
            </button>
          </form>
        )}

        {/* Tab 3: YouTube */}
        {activeTab === 'youtube' && (
          <form onSubmit={handleLaunchYouTube} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#831843', marginBottom: '0.5rem', fontWeight: 800 }}>
                YouTube Video or Shorts URL
              </label>
              <input
                type="text"
                required
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '14px',
                  border: '1.8px solid rgba(244, 114, 182, 0.5)',
                  background: '#ffffff',
                  color: '#3b142d',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  outline: 'none',
                  boxShadow: 'inset 0 2px 4px rgba(236, 72, 153, 0.08)'
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '0.95rem',
                borderRadius: '16px',
                gap: '8px',
                display: 'flex',
                alignItems: 'center',
                fontSize: '0.95rem',
                fontWeight: 800,
                background: 'linear-gradient(145deg, #f472b6 0%, #ec4899 50%, #db2777 100%)',
                border: '1.5px solid rgba(255, 255, 255, 0.65)',
                color: '#ffffff',
                boxShadow: '0 8px 24px rgba(236, 72, 153, 0.42), inset 0 2px 0 rgba(255, 255, 255, 0.5), inset 0 -2px 0 rgba(190, 24, 93, 0.6)',
                cursor: 'pointer'
              }}
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
