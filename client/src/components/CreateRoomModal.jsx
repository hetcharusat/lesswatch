import React, { useState, useEffect } from 'react';
import {
  ClayTv,
  ClayPopcorn,
  ClayFolder,
  ClayRefresh,
  ClayArrow
} from './ClayIcons';

export function CreateRoomModal({ isOpen, onClose, onLaunchMedia, defaultRoom = 'lounge', appConfig = null }) {
  const nekoEnabled = appConfig?.modules?.neko !== false;
  const [activeTab, setActiveTab] = useState('library'); // 'library' | 'neko' | 'youtube'
  const [youtubeUrl, setYoutubeUrl] = useState('');

  // Library State
  const [currentFolder, setCurrentFolder] = useState('');
  const [parentFolder, setParentFolder] = useState(null);
  const [libraryFolders, setLibraryFolders] = useState([]);
  const [libraryFiles, setLibraryFiles] = useState([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    if (!nekoEnabled && activeTab === 'neko') {
      setActiveTab('library');
    }
  }, [nekoEnabled, activeTab]);

  // Load Library whenever modal is open and activeTab is library or folder changes
  useEffect(() => {
    if (isOpen && activeTab === 'library') {
      loadLibrary(currentFolder);
    }
  }, [isOpen, activeTab, currentFolder]);

  if (!isOpen) return null;

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
      url: '/neko/',
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
      <div className="pink-modal-card media-picker-modal media-picker-distilled" onClick={(e) => e.stopPropagation()}>
        <div className="mp-distill-head">
          <h2 className="mp-distill-title">Change Lounge Media</h2>
          <div className="mp-distill-head-right">
            <div className="mp-distill-tabs" role="tablist" aria-label="Media source">
              <button type="button" onClick={() => setActiveTab('library')} className={`mp-distill-tab ${activeTab === 'library' ? 'is-active' : ''}`}>Library</button>
              {nekoEnabled && (
                <button type="button" onClick={() => setActiveTab('neko')} className={`mp-distill-tab ${activeTab === 'neko' ? 'is-active-amber' : ''}`}>Browser</button>
              )}
              <button type="button" onClick={() => setActiveTab('youtube')} className={`mp-distill-tab ${activeTab === 'youtube' ? 'is-active' : ''}`}>YouTube</button>
            </div>
            <button type="button" onClick={onClose} className="mp-distill-close" aria-label="Close">×</button>
          </div>
        </div>

            {activeTab === 'library' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filter downloaded files..."
                    className="media-picker-input"
                  />
                  <button type="button" onClick={() => loadLibrary(currentFolder)} className="media-picker-refresh media-picker-btn" title="Refresh Library">
                    <ClayRefresh size={17} />
                  </button>
                </div>

                {(currentFolder || libraryFolders.length > 0) && (
                  <div className="media-picker-folder-strip">
                    {currentFolder && (
                      <button type="button" onClick={() => setCurrentFolder(parentFolder || '')} className="media-picker-folder-chip media-picker-btn">
                        <ClayArrow direction="left" size={14} /> Up ({currentFolder})
                      </button>
                    )}
                    {libraryFolders.map((f) => (
                      <button key={f.relativePath} type="button" onClick={() => setCurrentFolder(f.relativePath)} className="media-picker-folder-chip media-picker-btn">
                        <ClayFolder size={15} /> {f.name}
                      </button>
                    ))}
                  </div>
                )}

                {loadingLibrary ? (
                  <div style={{ textAlign: 'center', padding: '1.8rem 1rem', color: '#78345c', fontSize: '0.84rem', fontWeight: 600 }}>Loading library…</div>
                ) : libraryFolders.length === 0 && filteredFiles.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.8rem 1rem', color: '#78345c', fontSize: '0.84rem' }}>No media files in this folder.</div>
                ) : (
                  <div className="mp-distill-lib-list">
                    {filteredFiles.map((file) => {
                      const rawName = file.filename || '';
                      const cleanNoPrefix = rawName.replace(/^\d{10,14}_/, '');
                      const lastDot = cleanNoPrefix.lastIndexOf('.');
                      const ext = lastDot > 0 ? cleanNoPrefix.slice(lastDot + 1).toUpperCase() : 'MEDIA';
                      const rawBase = lastDot > 0 ? cleanNoPrefix.slice(0, lastDot) : cleanNoPrefix;
                      const displayTitle = rawBase.replace(/(?<!\d)\.(?!\d)|_/g, ' ').replace(/\s+/g, ' ').trim();
                      return (
                        <button key={file.relativePath || file.filename} type="button" className="mp-distill-lib-row" onClick={() => handleSelectLibraryFile(file)} title={file.filename}>
                          <span className="mp-distill-lib-name">{displayTitle}</span>
                          <span className="mp-distill-lib-meta">{ext}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'neko' && (
              <form onSubmit={handleLaunchNeko} className="mp-distill-neko">
                <h3 className="mp-distill-neko-title">Shared Virtual Browser</h3>
                <p className="mp-distill-neko-copy">Shared Chromium session with built-in adblock that auto-stops when idle.</p>
                <button type="submit" className="media-picker-cta media-picker-cta-amber media-picker-btn mp-distill-cta-clean">
                  <ClayTv size={18} /> Launch Shared Browser
                </button>
              </form>
            )}

            {activeTab === 'youtube' && (
              <form onSubmit={handleLaunchYouTube} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="text"
                  required
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="media-picker-input"
                />
                <button type="submit" className="media-picker-cta media-picker-cta-pink media-picker-btn mp-distill-cta-clean">
                  <ClayPopcorn size={18} /> Launch YouTube
                </button>
              </form>
            )}
      </div>
    </div>
  );
}

export default CreateRoomModal;
