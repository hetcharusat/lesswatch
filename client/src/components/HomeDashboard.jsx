import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertCircle,
  ChevronRight,
  Download,
  FolderOpen,
  Play,
  RefreshCw,
  Tv
} from 'lucide-react';
import { CreateRoomModal } from './CreateRoomModal';
import { UserAvatar } from './JojoAvatar';
import { ClayTv, ClayPopcorn } from './ClayIcons';

const MAX_RECENT_FILES = 6;
const MAX_FOLDER_CHIPS = 5;

function getGreeting(name) {
  const hour = new Date().getHours();
  const firstName = (name || 'Friend').trim().split(/\s+/)[0];
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

function getFileDisplayMeta(filename = '') {
  const clean = String(filename);
  const dotIdx = clean.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === clean.length - 1) {
    return { title: clean, ext: 'VIDEO' };
  }
  return {
    title: clean.slice(0, dotIdx),
    ext: clean.slice(dotIdx + 1).toUpperCase()
  };
}

function formatDuration(seconds) {
  const total = Math.floor(Number(seconds) || 0);
  if (total <= 0) return null;
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatRelativeDate(dateInput) {
  if (!dateInput) return '';
  const ts = new Date(dateInput).getTime();
  if (Number.isNaN(ts)) return '';
  const diffMins = Math.floor((Date.now() - ts) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildFileSummaryLine(file, ext) {
  const parts = [ext];
  const durationLabel = formatDuration(file.duration);
  if (durationLabel) parts.push(durationLabel);
  if (file.sizeFormatted) parts.push(file.sizeFormatted);
  const audioCount = file.audioTracks?.length || 0;
  if (audioCount > 1) parts.push(`${audioCount} audio`);
  const subCount = file.subtitles?.length || 0;
  if (subCount > 0) parts.push(`${subCount} ${subCount === 1 ? 'sub' : 'subs'}`);
  const relativeDate = formatRelativeDate(file.modifiedAt);
  if (relativeDate) parts.push(relativeDate);
  return parts.join(' · ');
}

export function HomeDashboard({
  currentUser,
  appConfig,
  onNavigate,
  onLaunchMedia,
  liveData: propLiveData
}) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [liveData, setLiveData] = useState(propLiveData || null);

  const [selectedFolder, setSelectedFolder] = useState('');
  const [libraryState, setLibraryState] = useState({
    loading: true,
    error: '',
    folders: [],
    allFolders: [],
    files: []
  });

  const [statusData, setStatusData] = useState({
    storage: null,
    health: null,
    downloads: null,
    diagnostics: null
  });

  const isAdmin = currentUser?.role === 'admin';
  const showDownloader = isAdmin && appConfig?.modules?.downloader !== false;
  const voiceEnabled = appConfig?.modules?.livekit !== false;

  useEffect(() => {
    if (propLiveData !== undefined) {
      setLiveData(propLiveData);
    }
  }, [propLiveData]);

  const fetchLibraryShelf = useCallback(async (folder = '') => {
    setLibraryState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const url = folder
        ? `/api/library?folder=${encodeURIComponent(folder)}`
        : '/api/library';
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setLibraryState({
        loading: false,
        error: '',
        folders: Array.isArray(data.folders) ? data.folders : [],
        allFolders: Array.isArray(data.allFolders) ? data.allFolders : [],
        files: Array.isArray(data.files) ? data.files : []
      });
    } catch (err) {
      setLibraryState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Unable to reach media library'
      }));
    }
  }, []);

  const fetchStatusTelemetry = useCallback(async () => {
    const token = localStorage.getItem('wt_token') || '';
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    const [storageRes, healthRes, downloadsRes, diagRes] = await Promise.allSettled([
      fetch('/api/system/storage').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/health').then((r) => (r.ok ? r.json() : null)),
      showDownloader
        ? fetch('/api/downloads/active', { headers: authHeaders }).then((r) => (r.ok ? r.json() : null))
        : Promise.resolve(null),
      isAdmin && token
        ? fetch('/api/system/diagnostics', { headers: authHeaders }).then((r) => (r.ok ? r.json() : null))
        : Promise.resolve(null)
    ]);

    setStatusData({
      storage: storageRes.status === 'fulfilled' ? storageRes.value : null,
      health: healthRes.status === 'fulfilled' ? healthRes.value : null,
      downloads: downloadsRes.status === 'fulfilled' ? downloadsRes.value : null,
      diagnostics: diagRes.status === 'fulfilled' ? diagRes.value : null
    });
  }, [isAdmin, showDownloader]);

  useEffect(() => {
    fetchLibraryShelf(selectedFolder);
  }, [fetchLibraryShelf, selectedFolder]);

  useEffect(() => {
    fetchStatusTelemetry();
    const timer = setInterval(fetchStatusTelemetry, 15000);
    return () => clearInterval(timer);
  }, [fetchStatusTelemetry]);

  function handleModalLaunch(mediaConfig) {
    if (onLaunchMedia) {
      onLaunchMedia(mediaConfig);
    } else {
      onNavigate('room', mediaConfig.roomId || 'lounge', mediaConfig.url, mediaConfig.title, mediaConfig.type);
    }
  }

  function handlePlayLibraryFile(file) {
    const type = file.mediaType || (file.streamUrl?.includes('.m3u8') ? 'hls' : 'direct');
    handleModalLaunch({
      type,
      url: file.streamUrl,
      title: file.filename,
      subtitleUrl: file.subtitleUrl,
      roomId: 'lounge'
    });
  }

  const isRoomActive = Boolean(liveData?.isWatching);
  const watchers = Array.isArray(liveData?.watchers) ? liveData.watchers : [];
  const watcherCount = liveData?.totalUsers || watchers.length;
  const activeStreamTitle =
    liveData?.activeTitle ||
    liveData?.media?.title ||
    liveData?.title ||
    'Common Room Stream';

  const activeDownloadCount = statusData.downloads?.active?.length || 0;
  const waitingDownloadCount = statusData.downloads?.waiting?.length || 0;
  const diskFree = statusData.storage?.disk?.free || null;
  const secureOrigin = typeof window !== 'undefined' ? window.isSecureContext : true;
  const livekitDiag = statusData.diagnostics?.livekit;
  const livekitHealthy = livekitDiag
    ? Boolean(livekitDiag.configured && livekitDiag.reachable)
    : undefined;

  const voiceLabel = !voiceEnabled
    ? { dot: 'is-muted', text: 'Voice off' }
    : !secureOrigin
      ? { dot: 'is-warn', text: 'Voice needs HTTPS' }
      : livekitHealthy === false
        ? { dot: 'is-warn', text: 'Check LiveKit' }
        : { dot: 'is-ok', text: 'Voice ready' };

  const serverOnline = statusData.health?.ok !== false;

  const { folderChips, extraFolderCount } = useMemo(() => {
    const rawList = libraryState.allFolders.length > 0
      ? libraryState.allFolders
      : libraryState.folders;

    const uniquePaths = [];
    const seen = new Set();
    for (const item of rawList) {
      const folderPath = typeof item === 'string'
        ? item
        : (item?.path ?? item?.relativePath ?? '');
      if (!folderPath || seen.has(folderPath)) continue;
      seen.add(folderPath);
      uniquePaths.push(folderPath);
    }

    const chips = uniquePaths.slice(0, MAX_FOLDER_CHIPS);
    return {
      folderChips: chips,
      extraFolderCount: Math.max(0, uniquePaths.length - chips.length)
    };
  }, [libraryState.allFolders, libraryState.folders]);

  const visibleFiles = useMemo(
    () => libraryState.files.slice(0, MAX_RECENT_FILES),
    [libraryState.files]
  );

  return (
    <div className="home-dashboard">
      {/* 1. Common Room Hero + Inline Status */}
      <section className={`home-hero ${isRoomActive ? 'is-live' : ''}`} aria-label="Common Room">
        <div className="home-hero-main">
          <div className="home-hero-emblem" aria-hidden="true">
            <ClayTv size={28} />
          </div>

          <div className="home-hero-copy">
            <h1 className="home-hero-title">
              {isRoomActive ? activeStreamTitle : getGreeting(currentUser?.name)}
            </h1>

            {isRoomActive ? (
              <div className="home-watchers-row">
                <span className="home-live-pill">
                  <span className="home-status-dot is-live" />
                  <span>{watcherCount} watching</span>
                </span>
                {watchers.map((w, idx) => (
                  <span key={`${w.name || 'w'}-${idx}`} className="home-watcher-chip">
                    <UserAvatar user={w} size={15} showBorder={false} />
                    <span>{w.name}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="home-hero-sub">
                Start a synced watch party from your library, a link, or the shared browser.
              </p>
            )}

            <div className="home-meta-row" aria-label="System and room status">
              <button
                type="button"
                className="home-meta-item is-link"
                onClick={() => onNavigate('room', liveData?.activeRoom || 'lounge')}
              >
                <span className={`home-status-dot ${isRoomActive ? 'is-live' : 'is-muted'}`} />
                <span>{isRoomActive ? 'Room live' : 'Room idle'}</span>
              </button>

              {isAdmin ? (
                <button
                  type="button"
                  className="home-meta-item is-link"
                  onClick={() => onNavigate('admin')}
                >
                  <span className={`home-status-dot ${voiceLabel.dot}`} />
                  <span>{voiceLabel.text}</span>
                </button>
              ) : (
                <span className="home-meta-item">
                  <span className={`home-status-dot ${voiceLabel.dot}`} />
                  <span>{voiceLabel.text}</span>
                </span>
              )}

              {showDownloader && (
                <button
                  type="button"
                  className="home-meta-item is-link"
                  onClick={() => onNavigate('downloads')}
                >
                  <span className={`home-status-dot ${activeDownloadCount > 0 ? 'is-live' : 'is-muted'}`} />
                  <span>
                    {activeDownloadCount > 0
                      ? `${activeDownloadCount} downloading`
                      : waitingDownloadCount > 0
                        ? `${waitingDownloadCount} queued`
                        : 'No active downloads'}
                  </span>
                </button>
              )}

              <span className="home-meta-item">
                <span className={`home-status-dot ${serverOnline ? 'is-ok' : 'is-warn'}`} />
                <span>
                  {!serverOnline
                    ? 'Server offline'
                    : diskFree
                      ? `${diskFree} free`
                      : 'Server healthy'}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="home-hero-actions">
          {isRoomActive ? (
            <>
              <button
                type="button"
                onClick={() => onNavigate('room', liveData?.activeRoom || 'lounge')}
                className="btn-pink-primary home-hero-cta"
              >
                <Play size={15} fill="currentColor" />
                <span>Join Stream</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="btn-pink-secondary home-hero-cta-sec"
              >
                <span>Switch Media</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="btn-gold-shimmer home-hero-cta"
              >
                <ClayPopcorn size={17} />
                <span>Start Watch Party</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('room', 'lounge')}
                className="btn-pink-secondary home-hero-cta-sec"
              >
                <Tv size={15} />
                <span>Enter Lounge</span>
              </button>
            </>
          )}
        </div>
      </section>

      {/* 2. Flat Library Shelf */}
      <section className="home-shelf" aria-label="Recently in Library">
        <div className="home-shelf-header">
          <div className="home-shelf-title-group">
            <h2 className="home-shelf-title">
              {selectedFolder ? `Library · ${selectedFolder}` : 'Recently in Library'}
            </h2>
            {!libraryState.loading && !libraryState.error && (
              <span className="home-shelf-count">
                {libraryState.files.length} {libraryState.files.length === 1 ? 'video' : 'videos'}
              </span>
            )}
          </div>

          <div className="home-shelf-controls">
            <button
              type="button"
              onClick={() => fetchLibraryShelf(selectedFolder)}
              className={`home-icon-btn ${libraryState.loading ? 'is-spinning' : ''}`}
              aria-label="Refresh library"
              title="Refresh library"
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="home-text-link"
            >
              <span>Full Library</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {folderChips.length > 0 && (
          <div className="home-folder-bar" role="tablist" aria-label="Filter by folder">
            <button
              type="button"
              role="tab"
              aria-selected={selectedFolder === ''}
              className={`home-folder-chip ${selectedFolder === '' ? 'active' : ''}`}
              onClick={() => setSelectedFolder('')}
            >
              <FolderOpen size={13} />
              <span>Root</span>
            </button>
            {folderChips.map((folderPath) => (
              <button
                key={folderPath}
                type="button"
                role="tab"
                aria-selected={selectedFolder === folderPath}
                className={`home-folder-chip ${selectedFolder === folderPath ? 'active' : ''}`}
                onClick={() => setSelectedFolder(folderPath)}
              >
                <FolderOpen size={13} />
                <span>{folderPath}</span>
              </button>
            ))}
            {extraFolderCount > 0 && (
              <button
                type="button"
                className="home-folder-chip"
                onClick={() => onNavigate('library')}
              >
                <span>+{extraFolderCount} more</span>
              </button>
            )}
          </div>
        )}

        {libraryState.loading ? (
          <div className="home-media-grid" aria-busy="true" aria-label="Loading library">
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <div key={idx} className="home-media-skeleton" />
            ))}
          </div>
        ) : libraryState.error ? (
          <div className="home-empty-state" role="alert">
            <AlertCircle size={24} color="#be185d" />
            <h3 className="home-empty-title">Couldn&apos;t load your library</h3>
            <p className="home-empty-copy">
              The server returned {libraryState.error}. Check that the backend is running and try again.
            </p>
            <div className="home-empty-actions">
              <button
                type="button"
                onClick={() => fetchLibraryShelf(selectedFolder)}
                className="btn-pink-secondary"
              >
                Retry
              </button>
            </div>
          </div>
        ) : visibleFiles.length > 0 ? (
          <div className="home-media-grid">
            {visibleFiles.map((file) => {
              const { title, ext } = getFileDisplayMeta(file.filename);
              const metaLine = buildFileSummaryLine(file, ext);

              return (
                <article key={file.relativePath || file.filename} className="home-media-card">
                  <div>
                    <h3 className="home-media-title" title={file.filename}>
                      {title}
                    </h3>
                    <div className="home-media-meta">
                      <span>{metaLine}</span>
                      {file.isHevc && !file.isWebReady && (
                        <span className="home-compat-badge" title="HEVC video may need Media Studio prep">
                          HEVC
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlayLibraryFile(file)}
                    className="home-play-pill"
                  >
                    <Play size={13} fill="currentColor" />
                    <span>Watch Together</span>
                  </button>
                </article>
              );
            })}
          </div>
        ) : libraryState.folders.length > 0 ? (
          <div className="home-folder-grid">
            {libraryState.folders.map((folder) => (
              <button
                key={folder.relativePath || folder.name}
                type="button"
                className="home-folder-tile"
                onClick={() => setSelectedFolder(folder.relativePath)}
              >
                <span className="home-folder-icon">
                  <FolderOpen size={17} />
                </span>
                <span className="home-folder-meta">
                  <span className="home-folder-name">{folder.name}</span>
                  <span className="home-folder-count">
                    {folder.itemCount} {folder.itemCount === 1 ? 'item' : 'items'}
                  </span>
                </span>
                <ChevronRight size={15} color="#9d174d" />
              </button>
            ))}
          </div>
        ) : (
          <div className="home-empty-state">
            <FolderOpen size={24} color="#9d174d" />
            <h3 className="home-empty-title">
              {selectedFolder ? `No playable videos in ${selectedFolder}` : 'Your library is empty'}
            </h3>
            <p className="home-empty-copy">
              Upload MP4 or MKV files, add a download link, or start with YouTube or the shared browser.
            </p>
            <div className="home-empty-actions">
              <button
                type="button"
                onClick={() => onNavigate('library')}
                className="btn-pink-primary"
              >
                <FolderOpen size={15} />
                <span>Open Library</span>
              </button>
              {showDownloader && (
                <button
                  type="button"
                  onClick={() => onNavigate('downloads')}
                  className="btn-pink-secondary"
                >
                  <Download size={15} />
                  <span>Add Download</span>
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <CreateRoomModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onLaunchMedia={handleModalLaunch}
        defaultRoom="lounge"
        appConfig={appConfig}
      />
    </div>
  );
}

export default HomeDashboard;
