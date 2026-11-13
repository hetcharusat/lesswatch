import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  ClayPlay,
  ClaySearch,
  ClayRefresh,
  ClayTrash,
  ClaySparkle,
  ClayDownload
} from './ClayIcons';

export function MediaStudio({ currentUser, onNavigate, onPlayMedia }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'needs_transcode' | 'web_ready'
  const [activeJobs, setActiveJobs] = useState([]);
  const [audioStatusMap, setAudioStatusMap] = useState({});
  const [confirmDeleteFile, setConfirmDeleteFile] = useState(null);
  const [processingAudioFiles, setProcessingAudioFiles] = useState({});
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const isAdmin = currentUser?.role === 'admin';

  // 1. Fetch library media files & active transcode jobs
  const fetchStudioData = useCallback(async () => {
    try {
      setLoading(true);
      const [libRes, jobsRes] = await Promise.all([
        fetch('/api/library'),
        fetch('/api/media/process/status', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}` }
        }).catch(() => null)
      ]);

      if (libRes.ok) {
        const libData = await libRes.json();
        const mediaList = Array.isArray(libData.files) ? libData.files : [];
        setFiles(mediaList);

        // Fetch audio status for files with multiple tracks
        mediaList.forEach(async (f) => {
          if (f.audioTracks && f.audioTracks.length > 0) {
            try {
              const rel = f.relativePath || f.filename;
              const aRes = await fetch(`/api/media/audio-status/${encodeURIComponent(rel)}`);
              if (aRes.ok) {
                const aData = await aRes.json();
                setAudioStatusMap(prev => ({ ...prev, [rel]: aData }));
              }
            } catch {}
          }
        });
      }

      if (jobsRes && jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setActiveJobs(Array.isArray(jobsData.activeJobs) ? jobsData.activeJobs : []);
      }
    } catch (err) {
      console.error('Failed to load studio data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudioData();

    // 2. Real-time transcode progress & audio extraction updates via Socket.IO
    const socket = io({
      path: '/api/v1/sync',
      transports: ['websocket', 'polling']
    });

    socket.on('media:process_progress', (data) => {
      setActiveJobs(prev => {
        const existing = prev.find(j => j.relativePath === data.relativePath);
        if (existing) {
          return prev.map(j => j.relativePath === data.relativePath ? { ...j, ...data } : j);
        }
        return [...prev, data];
      });
    });

    socket.on('media:process_complete', (data) => {
      showToast(`✨ Optimization complete: ${data.outputFilename}`);
      setActiveJobs(prev => prev.filter(j => j.relativePath !== data.relativePath));
      fetchStudioData();
    });

    socket.on('media:process_error', (data) => {
      showToast(`❌ Optimization error: ${data.error || 'Failed'}`);
      setActiveJobs(prev => prev.filter(j => j.relativePath !== data.relativePath));
    });

    socket.on('audio:status_update', (data) => {
      setAudioStatusMap(prev => {
        const updated = { ...prev };
        if (updated[data.filename]) {
          updated[data.filename] = { ...updated[data.filename] };
        }
        return updated;
      });
      fetchStudioData();
    });

    const interval = setInterval(fetchStudioData, 6000);
    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [fetchStudioData]);

  // 3. Start Web Optimization (FFmpeg HEVC -> H.264 MP4 with AAC + faststart)
  const handleStartOptimization = async (file) => {
    const rel = file.relativePath || file.filename;
    try {
      showToast(`🚀 Starting Web Optimization for "${file.filename}"...`);
      const res = await fetch('/api/media/process/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`
        },
        body: JSON.stringify({ relativePath: rel, crf: 22, preset: 'veryfast' })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`⚡ Transcoding "${data.outputFilename}" in background!`);
        fetchStudioData();
      } else {
        alert(data.error || 'Failed to start optimization');
      }
    } catch (err) {
      alert('Error starting optimization: ' + err.message);
    }
  };

  // 4. Cancel active transcode job
  const handleCancelJob = async (relativePath) => {
    try {
      const res = await fetch('/api/media/process/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`
        },
        body: JSON.stringify({ relativePath })
      });
      if (res.ok) {
        setActiveJobs(prev => prev.filter(j => j.relativePath !== relativePath));
        showToast('Transcode job cancelled');
      }
    } catch (err) {
      alert('Error cancelling job: ' + err.message);
    }
  };

  // 5. Trigger Audio Extraction for all tracks
  const handleProcessAudio = async (file) => {
    const rel = file.relativePath || file.filename;
    setProcessingAudioFiles(p => ({ ...p, [rel]: true }));
    try {
      showToast(`🎵 Extracting audio tracks for "${file.filename}"...`);
      await fetch(`/api/media/process-audio/${encodeURIComponent(rel)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}` }
      });
      setTimeout(() => {
        setProcessingAudioFiles(p => ({ ...p, [rel]: false }));
        fetchStudioData();
      }, 3000);
    } catch {
      setProcessingAudioFiles(p => ({ ...p, [rel]: false }));
    }
  };

  // 6. Delete file with Bearer auth
  const handleDeleteFile = async (file) => {
    const rel = file.relativePath || file.filename;
    try {
      const res = await fetch(`/api/library/file?path=${encodeURIComponent(rel)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`
        }
      });
      const data = await res.json();
      if (data.success) {
        showToast(`🗑️ Deleted "${file.filename}"`);
        setConfirmDeleteFile(null);
        fetchStudioData();
      } else {
        alert(data.error || 'Failed to delete file');
      }
    } catch (err) {
      alert('Error deleting file: ' + err.message);
    }
  };

  // Filtered files
  const filteredFiles = files.filter(f => {
    const matchesSearch = f.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (f.relativePath || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filterType === 'needs_transcode') return f.isHevc || !f.isWebReady;
    if (filterType === 'web_ready') return !f.isHevc && f.isWebReady;
    return true;
  });

  const totalFilesCount = files.length;
  const webReadyCount = files.filter(f => !f.isHevc && f.isWebReady).length;
  const needsOptCount = files.filter(f => f.isHevc || !f.isWebReady).length;

  const cleanTitle = (name = '') =>
    String(name)
      .replace(/^\d{10,14}_/, '')
      .replace(/\.(mp4|mkv|webm|mov|avi|m4v)$/i, '')
      .replace(/(?<!\d)\.(?!\d)|_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || name;

  const renderActiveJobs = (compact = false) =>
    activeJobs.length > 0 && (
      <div className={`ms-jobs-panel ${compact ? 'is-compact' : ''}`}>
        <div className="ms-jobs-head">
          <ClaySparkle size={17} color="#f472b6" />
          <span>Active Optimization Jobs ({activeJobs.length})</span>
        </div>
        <div className="ms-jobs-list">
          {activeJobs.map((job) => (
            <div key={job.id || job.relativePath} className="ms-job-row">
              <div className="ms-job-top">
                <div className="ms-job-meta">
                  <span className="ms-job-name">{cleanTitle(job.outputFilename || job.relativePath)}</span>
                  <span className="ms-job-stat">
                    {job.speed || '1.0x'}{job.fps ? ` • ${job.fps} FPS` : ''}{job.time ? ` • ${job.time}` : ''}
                  </span>
                </div>
                <div className="ms-job-actions">
                  <span className="ms-job-pct">{job.progress ? `${job.progress}%` : 'Starting…'}</span>
                  <button type="button" onClick={() => handleCancelJob(job.relativePath)} className="ms-job-cancel">
                    Cancel
                  </button>
                </div>
              </div>
              <div className="ms-job-track">
                <div className="ms-job-fill" style={{ width: `${job.progress || 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <>
      <div className="media-studio-root">
        <div className="media-studio-head">
          <div>
            <h1 className="media-studio-title">Media Studio</h1>
            <p className="media-studio-sub">Prepare HEVC videos and audio tracks for browser playback.</p>
          </div>
          <button type="button" onClick={fetchStudioData} className="btn-pink-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.45rem 0.95rem', fontSize: '0.8rem' }}>
            <ClayRefresh size={15} /> Refresh
          </button>
        </div>

        <div className="media-studio-helper">
          <span><strong>Windows HEVC Codec:</strong> Install to decode x265 hardware natively in Chrome or Edge.</span>
          <a href="/HEVC-Extension-x64.Appx" download="HEVC-Extension-x64.Appx" className="media-studio-helper-link">
            <ClayDownload size={14} /> Download Extension (2.8 MB)
          </a>
        </div>

        {renderActiveJobs()}

        <div className="media-studio-toolbar">
          <div className="media-studio-search">
            <ClaySearch size={15} />
            <input type="text" placeholder="Filter media files..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>

          <div className="media-studio-tabs" role="tablist" aria-label="Media readiness filter">
            <button type="button" onClick={() => setFilterType('all')} className={`media-studio-tab ${filterType === 'all' ? 'active-pink' : ''}`}>All ({totalFilesCount})</button>
            <button type="button" onClick={() => setFilterType('needs_transcode')} className={`media-studio-tab ${filterType === 'needs_transcode' ? 'active-amber' : ''}`}>Needs Prep ({needsOptCount})</button>
            <button type="button" onClick={() => setFilterType('web_ready')} className={`media-studio-tab ${filterType === 'web_ready' ? 'active-emerald' : ''}`}>Ready ({webReadyCount})</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#78345c', fontWeight: 600 }}>Scanning media library…</div>
        ) : filteredFiles.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#78345c', fontWeight: 700, background: '#fff', borderRadius: '16px' }}>No files match this filter.</div>
        ) : (
          <div className="media-studio-ledger">
            {filteredFiles.map((file) => {
              const rel = file.relativePath || file.filename;
              const audioData = audioStatusMap[rel];
              const isOptimizing = activeJobs.some((j) => j.relativePath === rel);
              const isProcessingAudio = processingAudioFiles[rel];

              return (
                <div key={rel} className="media-studio-row">
                  <div className="media-studio-row-info">
                    <div className="media-studio-name" title={file.filename}>{cleanTitle(file.filename)}</div>
                    <div className="media-studio-chips">
                      <span>{file.sizeFormatted}</span>
                      {file.isHevc ? (
                        <span className="media-studio-pill hevc">HEVC</span>
                      ) : (
                        <span className="media-studio-pill ready">H.264 Ready</span>
                      )}
                      {file.audioTracks?.length > 0 && (
                        <span className="media-studio-pill meta">
                          {file.audioTracks.length} Audio{audioData?.percent !== undefined ? ` (${audioData.percent}%)` : ''}
                        </span>
                      )}
                      {file.subtitles?.length > 0 && (
                        <span className="media-studio-pill meta">{file.subtitles.length} Subs</span>
                      )}
                    </div>
                  </div>

                  <div className="media-studio-actions">
                    {file.isHevc && (
                      <button type="button" onClick={() => handleStartOptimization(file)} disabled={isOptimizing} className="btn-gold-shimmer" style={{ padding: '0.4rem 0.85rem', fontSize: '0.76rem', gap: '5px', opacity: isOptimizing ? 0.6 : 1 }}>
                        <ClaySparkle size={13} /> {isOptimizing ? 'Optimizing…' : 'Optimize'}
                      </button>
                    )}
                    {file.audioTracks?.length > 1 && !audioData?.allReady && (
                      <button type="button" onClick={() => handleProcessAudio(file)} disabled={isProcessingAudio} className="btn-pink-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>
                        {isProcessingAudio ? 'Extracting…' : 'Extract Audio'}
                      </button>
                    )}
                    <button type="button" onClick={() => onPlayMedia({ type: 'direct', url: file.streamUrl, title: file.filename, roomId: 'lounge' })} className="btn-pink-primary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.76rem', gap: '5px' }}>
                      <ClayPlay size={13} /> Play
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => setConfirmDeleteFile(file)} className="media-studio-del" aria-label={`Delete ${file.filename}`}>
                        <ClayTrash size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toastMsg && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          background: 'rgba(23, 15, 32, 0.95)',
          color: '#ffffff',
          padding: '10px 20px',
          borderRadius: '9999px',
          border: '1.5px solid rgba(244, 114, 182, 0.5)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          fontWeight: 700,
          fontSize: '0.85rem'
        }}>
          {toastMsg}
        </div>
      )}

      {confirmDeleteFile && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '24px',
            padding: '24px',
            maxWidth: '440px',
            width: '90%',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
            border: '1.5px solid rgba(244, 114, 182, 0.35)',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#be185d', fontSize: '1.2rem', fontWeight: 800 }}>
              Delete Media File?
            </h3>
            <p style={{ margin: '0 0 20px 0', color: '#78345c', fontSize: '0.86rem', lineHeight: 1.4, wordBreak: 'break-all' }}>
              Are you sure you want to delete <strong>"{confirmDeleteFile.filename}"</strong> from server downloads? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmDeleteFile(null)}
                className="btn-pink-secondary"
                style={{ padding: '0.55rem 1.4rem', fontSize: '0.84rem' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteFile(confirmDeleteFile)}
                style={{
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '0.55rem 1.4rem',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.35)'
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MediaStudio;

