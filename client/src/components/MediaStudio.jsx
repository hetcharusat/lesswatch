import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  ClayFilm,
  ClayFolder,
  ClayPlay,
  ClaySearch,
  ClayRefresh,
  ClayTrash,
  ClayCheck,
  ClayClose,
  ClaySparkle,
  ClayDownload,
  ClayHeadphones,
  ClaySubtitles
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

  const isAdmin = currentUser?.role === 'admin' || currentUser?.name?.toLowerCase() === 'het' || currentUser?.name?.toLowerCase() === 'riaa';

  // 1. Fetch library media files & active transcode jobs
  const fetchStudioData = useCallback(async () => {
    try {
      setLoading(true);
      const [libRes, jobsRes] = await Promise.all([
        fetch('/api/library'),
        fetch('/api/media/process/status').catch(() => null)
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
      await fetch(`/api/media/process-audio/${encodeURIComponent(rel)}`, { method: 'POST' });
      setTimeout(() => {
        setProcessingAudioFiles(p => ({ ...p, [rel]: false }));
        fetchStudioData();
      }, 3000);
    } catch {
      setProcessingAudioFiles(p => ({ ...p, [rel]: false }));
    }
  };

  // 6. Delete file with fail-safe auth
  const handleDeleteFile = async (file) => {
    const rel = file.relativePath || file.filename;
    try {
      const res = await fetch(`/api/library/file?path=${encodeURIComponent(rel)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('wt_token') || ''}`,
          'x-user-profile': JSON.stringify(currentUser || { name: 'Het', role: 'admin' })
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

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', width: '100%', padding: '1.2rem 1.2rem 4rem' }}>
      {/* Toast Notification */}
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

      {/* Header Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #ec4899, #db2777)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(236, 72, 153, 0.35)'
          }}>
            <ClayFilm size={26} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#831843', margin: 0 }}>
              Media Studio & Web Optimizer
            </h1>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#78345c', fontWeight: 600 }}>
              Pre-process videos, convert HEVC to web-ready H.264, cache multiple audio tracks, and ensure seamless playback.
            </p>
          </div>
        </div>

        <button
          onClick={fetchStudioData}
          className="btn-pink-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.48rem 1rem', fontSize: '0.82rem' }}
        >
          <ClayRefresh size={16} />
          <span>Refresh Studio</span>
        </button>
      </div>

      {/* HP Office Laptop / Windows HEVC Solution Card */}
      <div style={{
        background: 'linear-gradient(135deg, #fdf2f8 0%, #fff7fb 100%)',
        border: '1.5px solid rgba(244, 114, 182, 0.35)',
        borderRadius: '20px',
        padding: '16px 20px',
        marginBottom: '24px',
        boxShadow: '0 6px 20px rgba(244, 114, 182, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ flex: 1, minWidth: '280px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '1.2rem' }}>💻</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#831843' }}>
              HP Office Laptop / Windows HEVC Fix (Black Screen Prevention)
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#78345c', lineHeight: 1.4 }}>
            Direct download of official Microsoft HEVC Extension for Riaa’s laptop. Double-click to install on Windows, restart Chrome, and enjoy native hardware HEVC playback!
          </p>
        </div>
        <a
          href="/HEVC-Extension-x64.Appx"
          download="HEVC-Extension-x64.Appx"
          className="btn-pink-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0.55rem 1.25rem',
            borderRadius: '9999px',
            textDecoration: 'none',
            fontSize: '0.84rem',
            fontWeight: 800,
            whiteSpace: 'nowrap'
          }}
        >
          <ClayDownload size={16} />
          <span>Download HEVC Extension (2.8 MB)</span>
        </a>
      </div>

      {/* Active Transcode Jobs Section */}
      {activeJobs.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #1e1124 0%, #2b1335 100%)',
          borderRadius: '22px',
          padding: '18px 22px',
          marginBottom: '24px',
          border: '1.5px solid rgba(244, 114, 182, 0.4)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
          color: '#ffffff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <ClaySparkle size={18} color="#f472b6" />
            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fbcfe8' }}>
              Active Background Optimization Jobs ({activeJobs.length})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {activeJobs.map(job => (
              <div
                key={job.id || job.relativePath}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  borderRadius: '16px',
                  padding: '14px 18px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#ffffff' }}>
                      {job.outputFilename || job.relativePath}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: '#f472b6', marginLeft: '10px', fontWeight: 700 }}>
                      ⚡ Speed: {job.speed || '1.0x'} • {job.fps ? `${job.fps} FPS` : ''} • {job.time || 'Processing'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#34d399' }}>
                      {job.progress ? `${job.progress}%` : 'Starting...'}
                    </span>
                    <button
                      onClick={() => handleCancelJob(job.relativePath)}
                      style={{
                        background: 'rgba(239, 68, 68, 0.25)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#f87171',
                        borderRadius: '8px',
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${job.progress || 0}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #ec4899, #34d399)',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Chips & Filter Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '18px'
      }}>
        {/* Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#ffffff',
          border: '1.5px solid rgba(244, 114, 182, 0.35)',
          borderRadius: '9999px',
          padding: '6px 14px',
          width: '280px',
          boxShadow: '0 2px 8px rgba(244, 114, 182, 0.1)'
        }}>
          <ClaySearch size={16} />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '0.84rem',
              color: '#3b142d',
              width: '100%',
              fontWeight: 600
            }}
          />
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setFilterType('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: filterType === 'all' ? '1.5px solid #ec4899' : '1.5px solid transparent',
              background: filterType === 'all' ? 'rgba(236, 72, 153, 0.15)' : '#ffffff',
              color: filterType === 'all' ? '#be185d' : '#78345c'
            }}
          >
            All Media ({totalFilesCount})
          </button>
          <button
            onClick={() => setFilterType('needs_transcode')}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: filterType === 'needs_transcode' ? '1.5px solid #f59e0b' : '1.5px solid transparent',
              background: filterType === 'needs_transcode' ? 'rgba(245, 158, 11, 0.15)' : '#ffffff',
              color: filterType === 'needs_transcode' ? '#b45309' : '#78345c'
            }}
          >
            ⚡ Needs Optimization ({needsOptCount})
          </button>
          <button
            onClick={() => setFilterType('web_ready')}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: filterType === 'web_ready' ? '1.5px solid #10b981' : '1.5px solid transparent',
              background: filterType === 'web_ready' ? 'rgba(16, 185, 129, 0.15)' : '#ffffff',
              color: filterType === 'web_ready' ? '#047857' : '#78345c'
            }}
          >
            ✓ Web Ready ({webReadyCount})
          </button>
        </div>
      </div>

      {/* Media Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#9ca3af', fontWeight: 600 }}>
          Scanning media directory and probing codecs... 🌸
        </div>
      ) : filteredFiles.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 1rem',
          background: '#ffffff',
          borderRadius: '20px',
          border: '1.5px solid rgba(244, 114, 182, 0.3)',
          color: '#78345c',
          fontWeight: 700
        }}>
          No media files match your filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredFiles.map(file => {
            const rel = file.relativePath || file.filename;
            const audioData = audioStatusMap[rel];
            const isOptimizing = activeJobs.some(j => j.relativePath === rel);
            const isProcessingAudio = processingAudioFiles[rel];

            return (
              <div
                key={rel}
                style={{
                  background: '#ffffff',
                  borderRadius: '18px',
                  border: file.isHevc
                    ? '1.5px solid rgba(245, 158, 11, 0.4)'
                    : '1.5px solid rgba(244, 114, 182, 0.3)',
                  padding: '16px 20px',
                  boxShadow: '0 4px 16px rgba(244, 114, 182, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '16px',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* File Details */}
                <div style={{ flex: 1, minWidth: '300px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.94rem', fontWeight: 800, color: '#3b142d', wordBreak: 'break-all' }}>
                      {file.filename}
                    </span>
                  </div>

                  {/* Metadata Chips */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Size & Duration */}
                    <span style={{ fontSize: '0.74rem', color: '#9ca3af', fontWeight: 600 }}>
                      💾 {file.sizeFormatted}
                    </span>

                    {/* Video Codec Badge */}
                    {file.isHevc ? (
                      <span style={{
                        fontSize: '0.70rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#b45309',
                        border: '1px solid rgba(245, 158, 11, 0.35)'
                      }}>
                        ⚠️ HEVC (x265) • Black screen risk on basic laptops
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '0.70rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#047857',
                        border: '1px solid rgba(16, 185, 129, 0.35)'
                      }}>
                        ✓ H.264 Web Ready
                      </span>
                    )}

                    {/* Audio Status */}
                    {file.audioTracks && file.audioTracks.length > 0 && (
                      <span style={{
                        fontSize: '0.70rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: audioData?.allReady ? 'rgba(16, 185, 129, 0.12)' : 'rgba(236, 72, 153, 0.12)',
                        color: audioData?.allReady ? '#047857' : '#be185d',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <ClayHeadphones size={12} />
                        <span>
                          {file.audioTracks.length} Audio {file.audioTracks.length > 1 ? 'Tracks' : 'Track'}
                          {audioData?.percent !== undefined ? ` (${audioData.percent}% Cached)` : ''}
                        </span>
                      </span>
                    )}

                    {/* Subtitles Count */}
                    {file.subtitles && file.subtitles.length > 0 && (
                      <span style={{
                        fontSize: '0.70rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(244, 114, 182, 0.12)',
                        color: '#be185d',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <ClaySubtitles size={12} />
                        <span>{file.subtitles.length} Subs</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {/* Web Optimize Button */}
                  {file.isHevc && (
                    <button
                      onClick={() => handleStartOptimization(file)}
                      disabled={isOptimizing}
                      className="btn-gold-shimmer"
                      style={{
                        padding: '0.45rem 0.95rem',
                        fontSize: '0.78rem',
                        gap: '6px',
                        cursor: isOptimizing ? 'not-allowed' : 'pointer',
                        opacity: isOptimizing ? 0.6 : 1
                      }}
                      title="Transcode to web-ready H.264 MP4 with AAC audio"
                    >
                      <ClaySparkle size={14} />
                      <span>{isOptimizing ? 'Optimizing...' : '⚡ Optimize for Web'}</span>
                    </button>
                  )}

                  {/* Pre-process Audio Button */}
                  {file.audioTracks && file.audioTracks.length > 1 && !audioData?.allReady && (
                    <button
                      onClick={() => handleProcessAudio(file)}
                      disabled={isProcessingAudio}
                      className="btn-pink-secondary"
                      style={{ padding: '0.45rem 0.85rem', fontSize: '0.76rem', gap: '5px' }}
                      title="Pre-extract all audio tracks to AAC"
                    >
                      <ClayHeadphones size={14} color="var(--pink-primary)" />
                      <span>{isProcessingAudio ? 'Extracting...' : 'Extract Audio'}</span>
                    </button>
                  )}

                  {/* Play in Lounge Button */}
                  <button
                    onClick={() => onPlayMedia({
                      type: 'direct',
                      url: file.streamUrl,
                      title: file.filename,
                      roomId: 'lounge'
                    })}
                    className="btn-pink-primary"
                    style={{ padding: '0.45rem 0.95rem', fontSize: '0.78rem', gap: '6px' }}
                    title="Launch directly in Common Room"
                  >
                    <ClayPlay size={14} />
                    <span>Play in Room</span>
                  </button>

                  {/* Delete Button */}
                  {isAdmin && (
                    <button
                      onClick={() => setConfirmDeleteFile(file)}
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '10px',
                        background: '#ffffff',
                        border: '1.5px solid rgba(239, 68, 68, 0.4)',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(239, 68, 68, 0.1)'
                      }}
                      title="Delete file permanently"
                    >
                      <ClayTrash size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
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
    </div>
  );
}

export default MediaStudio;

