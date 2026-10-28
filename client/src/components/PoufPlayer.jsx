import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ClayPlay,
  ClayPause,
  ClayVolume,
  ClayMute,
  ClayFullscreen,
  ClayCompress,
  ClayHeadphones,
  ClaySubtitles,
  ClayCheck,
  ClaySparkle,
  ClayClose,
  ClayRewind,
  ClayForward,
  ClayUpload
} from './ClayIcons';
import {
  Settings,
  Sliders,
  Type,
  FastForward,
  Check,
  X,
  Upload,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  MoveVertical,
  Sparkles,
  RefreshCw
} from 'lucide-react';

/**
 * PoufPlayer - Professional Video.js 10 / Cinema Pink Edition
 * 
 * Clean, uncluttered UI:
 * - Scrim contrast gradient over moving video
 * - Tabular steady numbers for time display
 * - Main bar has ONLY essential controls: Play/Pause, -10s, +10s, Volume, Time, Quick CC, Settings Gear, Fullscreen
 * - All secondary actions, badges, and complex controls reside in the unified Video.js 10 Settings Menu:
 *     1. Subtitles (Tracks, Upload custom .srt/.vtt, Pixel Size controller, Pixel Position controller, Delay offset, Styling)
 *     2. Audio Tracks (Multi-audio track selector with codecs, background AAC pre-extraction)
 *     3. Aspect Ratio (Contain 16:9, Cinema Zoom 21:9 Cover, Stretch Fill)
 *     4. Playback Speed & Room Sync (0.5x to 2.0x, Force Sync Both Viewers)
 * - Microsecond Dual-Track Audio Sync Engine for 0ms zero-lag streaming
 */
export function PoufPlayer({
  url,
  title = 'Video Stream',
  audioTracks = [],
  activeAudioIndex = 0,
  onAudioTrackChange,
  subtitleTracks = [],
  activeSubtitleIndex = -1,
  onSubtitleChange,
  subtitleSize: propSubtitleSize,
  subtitlePos: propSubtitlePos,
  onSubtitleSizeChange,
  onSubtitlePosChange,
  isPlaying = false,
  currentTime = 0,
  onPlay,
  onPause,
  onSeek,
  onForceSyncAll,
  onToggleChat,
  viewerCount = 1,
  isHost = false,
  canControl = true,
  className = '',
  style = {}
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastActiveSubRef = useRef(0);

  // Core Playback State
  const [localPlaying, setLocalPlaying] = useState(isPlaying);
  const [playProgress, setPlayProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedProgress, setBufferedProgress] = useState(0);
  const [volume, setVolume] = useState(() => parseFloat(localStorage.getItem('wt_player_vol') || '1'));
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [centerAnimation, setCenterAnimation] = useState(null);

  // Scrubber Hover Tooltip
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(0);

  // Unified Settings Menu & Tabs
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('subtitles'); // 'subtitles' | 'audio' | 'aspect' | 'speed'

  // Subtitle Customization with Pixel Controllers (stored in localStorage)
  const [subtitleSize, setSubtitleSize] = useState(() => {
    return parseInt(localStorage.getItem('wt_sub_size_px'), 10) || propSubtitleSize || 22;
  });
  const [subtitleBottom, setSubtitleBottom] = useState(() => {
    const saved = localStorage.getItem('wt_sub_bottom_px');
    if (saved) return parseInt(saved, 10);
    if (propSubtitlePos === 'top') return 480;
    if (propSubtitlePos === 'raised') return 110;
    return 65;
  });
  const [subtitleDelay, setSubtitleDelay] = useState(() => {
    return parseFloat(localStorage.getItem('wt_sub_delay') || '0.0');
  });
  const [subtitleStyle, setSubtitleStyle] = useState(() => {
    return localStorage.getItem('wt_sub_style') || 'transparent'; // 'transparent' | 'soft' | 'box'
  });
  const [uploadedSubtitles, setUploadedSubtitles] = useState([]);

  // Aspect Ratio & Playback Speed
  const [aspectRatio, setAspectRatio] = useState(() => {
    return localStorage.getItem('wt_aspect_ratio') || 'contain'; // 'contain' | 'cover' | 'fill'
  });
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    return parseFloat(localStorage.getItem('wt_playback_speed') || '1.0');
  });

  // Multi-Audio Extraction State
  const [audioStatusData, setAudioStatusData] = useState(null);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);

  // Subtitle Cues state
  const [currentCueText, setCurrentCueText] = useState('');
  const cuesRef = useRef([]);

  // Control Timers & Dragging
  const hideControlsTimerRef = useRef(null);
  const isDraggingScrubberRef = useRef(false);

  // Derive clean filename & direct stream URL
  const cleanFilename = decodeURIComponent(
    (url || '')
      .replace('/api/media/stream/', '')
      .replace('/api/media/hls/', '')
      .split('/master.m3u8')[0]
      .split('?')[0]
  );

  const directStreamUrl = cleanFilename ? `/api/media/stream/${encodeURIComponent(cleanFilename)}` : url;

  // Track 0 codec check: does it need the transcoded AAC stream? (e.g. EAC3, AC3, DTS, TrueHD)
  const track0Codec = (audioTracks[0]?.codec || '').toLowerCase();
  const track0IsAac = track0Codec.includes('aac') || track0Codec.includes('mp4a');
  const track0NeedsExternalAudio = audioTracks.length > 0 && !track0IsAac;
  const shouldUseAudioElement = activeAudioIndex > 0 || track0NeedsExternalAudio;

  const activeAudioUrl = (cleanFilename && shouldUseAudioElement)
    ? `/api/media/audio/${encodeURIComponent(cleanFilename)}?track=${activeAudioIndex}`
    : '';

  // Audio processing status polling
  const fetchAudioStatus = useCallback(async () => {
    if (!cleanFilename) return;
    try {
      const res = await fetch(`/api/media/audio-status/${encodeURIComponent(cleanFilename)}`);
      if (res.ok) {
        const data = await res.json();
        setAudioStatusData(data);
      }
    } catch {}
  }, [cleanFilename]);

  useEffect(() => {
    if (!cleanFilename || audioTracks.length <= 1) return;
    fetchAudioStatus();
    const interval = setInterval(() => {
      fetchAudioStatus();
    }, showSettingsMenu && activeSettingsTab === 'audio' ? 2500 : 8000);
    return () => clearInterval(interval);
  }, [cleanFilename, audioTracks.length, showSettingsMenu, activeSettingsTab, fetchAudioStatus]);

  const handleProcessAllAudio = async () => {
    if (!cleanFilename || isProcessingAudio) return;
    setIsProcessingAudio(true);
    try {
      await fetch(`/api/media/process-audio/${encodeURIComponent(cleanFilename)}`, { method: 'POST' });
      fetchAudioStatus();
    } catch {}
    setTimeout(() => setIsProcessingAudio(false), 3000);
  };

  // Time formatter with tabular digits
  function formatTime(sec) {
    if (!sec || isNaN(sec) || sec < 0) return '00:00';
    const s = Math.floor(sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const pMins = String(mins).padStart(2, '0');
    const pSecs = String(secs).padStart(2, '0');
    if (hrs > 0) {
      return `${hrs}:${pMins}:${pSecs}`;
    }
    return `${pMins}:${pSecs}`;
  }

  // --------------------------------------------------------------------------
  // Mount Direct Stream to Video
  // --------------------------------------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !directStreamUrl) return;

    if (video.src !== directStreamUrl && !video.src.endsWith(directStreamUrl)) {
      video.src = directStreamUrl;
      if (currentTime > 0) {
        video.currentTime = currentTime;
      }
      if (isPlaying) {
        video.play().catch(() => {});
      }
    }
  }, [directStreamUrl]);

  // Apply playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Dual-Track Audio Sync Engine
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    if (!shouldUseAudioElement || !activeAudioUrl) {
      video.muted = isMuted;
      video.volume = isMuted ? 0 : volume;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    } else {
      video.muted = true;
      if (audio) {
        const fullUrl = new URL(activeAudioUrl, window.location.href).href;
        if (audio.src !== fullUrl) {
          audio.src = activeAudioUrl;
        }
        audio.volume = isMuted ? 0 : volume;
        audio.muted = isMuted;
        audio.playbackRate = video.playbackRate;

        const onAudioReady = () => {
          if (!videoRef.current || !audioRef.current) return;
          if (Math.abs(audioRef.current.currentTime - videoRef.current.currentTime) > 0.4) {
            audioRef.current.currentTime = videoRef.current.currentTime;
          }
          audioRef.current.playbackRate = videoRef.current.playbackRate;
          if (!videoRef.current.paused) {
            audioRef.current.play().catch(() => {});
          }
        };

        const onAudioError = (err) => {
          console.warn('[PoufPlayer] Secondary audio load error:', err);
          if (videoRef.current && activeAudioIndex === 0) videoRef.current.muted = false;
        };

        audio.addEventListener('canplay', onAudioReady, { once: true });
        audio.addEventListener('error', onAudioError, { once: true });
        audio.load();
      }
    }
  }, [activeAudioIndex, activeAudioUrl, shouldUseAudioElement]);

  // Sync external playback state
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    if (isPlaying) {
      if (video.paused) video.play().catch(() => {});
      if (shouldUseAudioElement && audio && audio.paused) {
        if (Math.abs(audio.currentTime - video.currentTime) > 0.4) {
          audio.currentTime = video.currentTime;
        }
        audio.play().catch(() => {});
      }
    } else {
      if (!video.paused) video.pause();
      if (audio && !audio.paused) audio.pause();
    }
  }, [isPlaying, shouldUseAudioElement]);

  // Sync external currentTime
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || typeof currentTime !== 'number' || isNaN(currentTime)) return;
    if (isDraggingScrubberRef.current) return;

    const diff = Math.abs(video.currentTime - currentTime);
    if (diff > 1.2) {
      video.currentTime = currentTime;
      if (shouldUseAudioElement && audio) {
        audio.currentTime = currentTime;
      }
    }
  }, [currentTime, shouldUseAudioElement]);

  // Sync volume & mute
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;

    if (!shouldUseAudioElement) {
      if (video) {
        video.volume = isMuted ? 0 : volume;
        video.muted = isMuted;
      }
    } else {
      if (video) video.muted = true;
      if (audio) {
        audio.volume = isMuted ? 0 : volume;
        audio.muted = isMuted;
      }
    }
  }, [volume, isMuted, shouldUseAudioElement]);

  // --------------------------------------------------------------------------
  // Subtitle Parsing (.vtt & .srt)
  // --------------------------------------------------------------------------
  const allSubtitles = [...subtitleTracks, ...uploadedSubtitles];

  useEffect(() => {
    cuesRef.current = [];
    setCurrentCueText('');

    if (activeSubtitleIndex === -1 || !allSubtitles[activeSubtitleIndex]) {
      return;
    }

    const currentSub = allSubtitles[activeSubtitleIndex];
    if (currentSub.cues && currentSub.cues.length > 0) {
      cuesRef.current = currentSub.cues;
      return;
    }

    if (!currentSub.url) return;

    let isCancelled = false;
    fetch(currentSub.url)
      .then(res => res.text())
      .then(rawText => {
        if (isCancelled) return;
        cuesRef.current = parseSubtitlesText(rawText);
      })
      .catch(err => console.warn('[PoufPlayer] Subtitle load error:', err));

    return () => { isCancelled = true; };
  }, [activeSubtitleIndex, allSubtitles.length]);

  function parseSubtitlesText(rawText) {
    // Normalize SRT comma timestamps to VTT period timestamps
    const text = rawText
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const lines = text.split('\n');
    const cues = [];
    let start = 0;
    let end = 0;
    let cueLines = [];

    const timeRegex = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/;

    function parseSec(tStr) {
      const parts = tStr.split(':');
      let h = 0, m = 0, s = 0;
      if (parts.length === 3) {
        h = parseFloat(parts[0]);
        m = parseFloat(parts[1]);
        s = parseFloat(parts[2]);
      } else {
        m = parseFloat(parts[0]);
        s = parseFloat(parts[1]);
      }
      return h * 3600 + m * 60 + s;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(timeRegex);
      if (match) {
        if (cueLines.length > 0 && end > start) {
          cues.push({ start, end, text: cueLines.join('\n') });
          cueLines = [];
        }
        start = parseSec(match[1]);
        end = parseSec(match[2]);
      } else if (line && !line.startsWith('WEBVTT') && !line.startsWith('NOTE') && isNaN(line)) {
        if (start !== 0 || end !== 0) {
          cueLines.push(line);
        }
      } else if (!line && cueLines.length > 0) {
        cues.push({ start, end, text: cueLines.join('\n') });
        cueLines = [];
        start = 0;
        end = 0;
      }
    }
    if (cueLines.length > 0 && end > start) {
      cues.push({ start, end, text: cueLines.join('\n') });
    }
    return cues;
  }

  // Handle Custom Subtitle Upload (.srt / .vtt)
  const handleUploadSubtitleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      if (typeof content !== 'string') return;
      const parsedCues = parseSubtitlesText(content);
      const blob = new Blob([content], { type: 'text/vtt' });
      const blobUrl = URL.createObjectURL(blob);
      const newTrack = {
        id: `custom-${Date.now()}`,
        title: `📁 ${file.name.replace(/\.[^/.]+$/, '')}`,
        url: blobUrl,
        cues: parsedCues,
        isCustom: true
      };
      setUploadedSubtitles(prev => [...prev, newTrack]);
      const newIndex = subtitleTracks.length + uploadedSubtitles.length;
      cuesRef.current = parsedCues;
      onSubtitleChange?.(newIndex);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --------------------------------------------------------------------------
  // Video DOM Event Handlers
  // --------------------------------------------------------------------------
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || isDraggingScrubberRef.current) return;

    setPlayProgress(video.currentTime);

    // Smooth Dual-Track Sync
    if (shouldUseAudioElement && audio && !video.paused && !audio.paused && !audio.seeking && !video.seeking) {
      const drift = audio.currentTime - video.currentTime;
      const absDrift = Math.abs(drift);

      if (absDrift > 0.25 && absDrift < 2.0) {
        audio.playbackRate = video.playbackRate * (drift > 0 ? 0.96 : 1.04);
      } else if (absDrift >= 2.0) {
        audio.currentTime = video.currentTime;
        audio.playbackRate = video.playbackRate;
      } else {
        if (audio.playbackRate !== video.playbackRate) {
          audio.playbackRate = video.playbackRate;
        }
      }
    }

    // Buffer progress
    if (video.buffered && video.buffered.length > 0) {
      try {
        setBufferedProgress(video.buffered.end(video.buffered.length - 1));
      } catch {}
    }

    // Subtitle Cues with Timing Offset
    if (cuesRef.current.length > 0) {
      const cur = video.currentTime + subtitleDelay;
      const activeCue = cuesRef.current.find(c => cur >= c.start && cur <= c.end);
      setCurrentCueText(activeCue ? activeCue.text : '');
    } else {
      if (currentCueText) setCurrentCueText('');
    }
  }, [currentCueText, shouldUseAudioElement, subtitleDelay]);

  function handleLoadedMetadata() {
    if (videoRef.current) setDuration(videoRef.current.duration || 0);
  }

  function handlePlayEvent() {
    setLocalPlaying(true);
    setIsBuffering(false);
    triggerCenterAnimation('play');
    if (shouldUseAudioElement && audioRef.current && audioRef.current.paused) {
      audioRef.current.currentTime = videoRef.current?.currentTime || 0;
      audioRef.current.play().catch(() => {});
    }
  }

  function handlePauseEvent() {
    setLocalPlaying(false);
    triggerCenterAnimation('pause');
    if (shouldUseAudioElement && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }

  function triggerCenterAnimation(type) {
    setCenterAnimation(type);
    setTimeout(() => setCenterAnimation(null), 550);
  }

  function togglePlayPause() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
      if (shouldUseAudioElement && audioRef.current && audioRef.current.paused) {
        audioRef.current.currentTime = video.currentTime;
        audioRef.current.play().catch(() => {});
      }
      if (onPlay) onPlay(video.currentTime);
    } else {
      video.pause();
      if (shouldUseAudioElement && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      if (onPause) onPause(video.currentTime);
    }
  }

  function handleSeekRelative(deltaSeconds) {
    const video = videoRef.current;
    if (!video) return;

    const newTime = Math.max(0, Math.min(duration, video.currentTime + deltaSeconds));
    video.currentTime = newTime;
    if (shouldUseAudioElement && audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    if (onSeek) onSeek(newTime);
  }

  // Scrubber scrubber drag & hover
  function handleScrubberMouseDown(e) {
    const track = document.getElementById('pouf-progress-track');
    if (!track || !videoRef.current || !duration) return;

    isDraggingScrubberRef.current = true;
    const rect = track.getBoundingClientRect();

    function updateFromClientX(clientX) {
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetTime = pos * duration;
      setPlayProgress(targetTime);
      return targetTime;
    }

    const initialTime = updateFromClientX(e.clientX);

    function onMouseMove(moveEvent) {
      updateFromClientX(moveEvent.clientX);
    }

    function onMouseUp(upEvent) {
      const finalTime = updateFromClientX(upEvent.clientX);
      isDraggingScrubberRef.current = false;
      if (videoRef.current) {
        videoRef.current.currentTime = finalTime;
      }
      if (shouldUseAudioElement && audioRef.current) {
        audioRef.current.currentTime = finalTime;
      }
      if (onSeek) onSeek(finalTime);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function handleScrubberMouseMove(e) {
    const track = document.getElementById('pouf-progress-track');
    if (!track || !duration) return;
    const rect = track.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * duration);
  }

  function handleScrubberMouseLeave() {
    setHoverTime(null);
  }

  function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) container.requestFullscreen().catch(() => {});
      else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      setIsFullscreen(false);
    }
  }

  function handleMouseMove() {
    setShowControls(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (localPlaying && !showSettingsMenu) {
      hideControlsTimerRef.current = setTimeout(() => setShowControls(false), 3500);
    }
  }

  // Quick CC Toggle on Control Bar
  const handleToggleCC = () => {
    if (activeSubtitleIndex >= 0) {
      lastActiveSubRef.current = activeSubtitleIndex;
      onSubtitleChange?.(-1);
    } else {
      const restoreIdx = (lastActiveSubRef.current !== undefined && lastActiveSubRef.current >= 0 && lastActiveSubRef.current < allSubtitles.length)
        ? lastActiveSubRef.current
        : 0;
      onSubtitleChange?.(restoreIdx);
    }
  };

  // Subtitle Customization Handlers
  const handleSizeChange = (newSize) => {
    const clamped = Math.max(14, Math.min(48, newSize));
    setSubtitleSize(clamped);
    localStorage.setItem('wt_sub_size_px', clamped);
    onSubtitleSizeChange?.(clamped);
  };

  const handleBottomChange = (newBottom) => {
    const clamped = Math.max(10, Math.min(280, newBottom));
    setSubtitleBottom(clamped);
    localStorage.setItem('wt_sub_bottom_px', clamped);
    onSubtitlePosChange?.(clamped);
  };

  const handleDelayChange = (newDelay) => {
    const clamped = parseFloat(Math.max(-5.0, Math.min(5.0, newDelay)).toFixed(1));
    setSubtitleDelay(clamped);
    localStorage.setItem('wt_sub_delay', clamped);
  };

  const handleStyleChange = (newStyle) => {
    setSubtitleStyle(newStyle);
    localStorage.setItem('wt_sub_style', newStyle);
  };

  const handleAspectChange = (newAspect) => {
    setAspectRatio(newAspect);
    localStorage.setItem('wt_aspect_ratio', newAspect);
  };

  const handleSpeedChange = (newSpeed) => {
    setPlaybackSpeed(newSpeed);
    localStorage.setItem('wt_playback_speed', newSpeed);
  };

  // Hotkey Navigation
  useEffect(() => {
    function handleKeyDown(e) {
      // Ignore if user is typing in chat or input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSeekRelative(-10);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSeekRelative(10);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setIsMuted(prev => !prev);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleToggleCC();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration, activeSubtitleIndex, allSubtitles.length]);

  return (
    <div
      ref={containerRef}
      className={`pouf-player-container ${isFullscreen ? 'pouf-fullscreen' : ''} ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => localPlaying && !showSettingsMenu && setShowControls(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '380px',
        background: '#07030a',
        borderRadius: isFullscreen ? '0px' : '24px',
        overflow: 'hidden',
        boxShadow: isFullscreen ? 'none' : '0 20px 45px rgba(244,114,182,0.25)',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
    >
      {/* 1. Crisp, Zero-Blur Native Video Surface */}
      <video
        ref={videoRef}
        playsInline
        crossOrigin="anonymous"
        onClick={togglePlayPause}
        onDoubleClick={toggleFullscreen}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={handlePlayEvent}
        onPause={handlePauseEvent}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: aspectRatio,
          background: '#000000',
          cursor: 'pointer'
        }}
      />

      {/* 2. Hidden Secondary Audio Stream for Multi-Track Sync */}
      <audio ref={audioRef} preload="auto" playsInline style={{ display: 'none' }} />

      {/* 3. Top Title & Specs Overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '1.25rem 1.5rem',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          zIndex: 40,
          opacity: showControls ? 1 : 0,
          transform: showControls ? 'translateY(0)' : 'translateY(-15px)',
          transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
          pointerEvents: showControls ? 'auto' : 'none'
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', margin: 0, textShadow: '0 2px 6px rgba(0,0,0,0.8)' }}>
            {title || 'Video Stream'}
          </h2>
          <div style={{ fontSize: '0.78rem', color: '#e5e7eb', marginTop: '3px', fontWeight: 600, display: 'flex', gap: '8px', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            <span>1080p • Direct Stream</span>
            {audioTracks.length > 1 && (
              <span style={{ color: '#f472b6' }}>• Multi-Audio ({audioTracks.length})</span>
            )}
            {allSubtitles.length > 0 && (
              <span style={{ color: '#a7f3d0' }}>• Subtitles ({allSubtitles.length})</span>
            )}
          </div>
        </div>

        {/* Top-Right Badges: Viewer count & Fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '5px 12px',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#fff',
              fontSize: '0.78rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>👥</span>
            <span>{viewerCount}</span>
          </div>

          <button
            onClick={toggleFullscreen}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>

      {/* 4. Subtitle Display Layer with Exact Pixel Positioning & Styling */}
      {currentCueText && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: `${subtitleBottom}px`,
            maxWidth: '85%',
            textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 30,
            transition: 'bottom 0.15s ease'
          }}
        >
          <span
            style={{
              display: 'inline-block',
              color: '#ffffff',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: `${subtitleSize}px`,
              fontWeight: 700,
              lineHeight: 1.35,
              padding: subtitleStyle === 'transparent' ? '4px 8px' : '6px 14px',
              borderRadius: subtitleStyle === 'transparent' ? '0' : '8px',
              background: subtitleStyle === 'transparent' ? 'transparent' : (subtitleStyle === 'box' ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.45)'),
              backdropFilter: subtitleStyle === 'soft' ? 'blur(4px)' : 'none',
              textShadow: subtitleStyle === 'transparent'
                ? '0 2px 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85), -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000'
                : '0 1px 3px rgba(0,0,0,0.8)',
              whiteSpace: 'pre-wrap',
              letterSpacing: '0.015em'
            }}
          >
            {currentCueText}
          </span>
        </div>
      )}

      {/* 5. Center Play/Pause Burst Animation */}
      {centerAnimation && (
        <div style={{ position: 'absolute', pointerEvents: 'none', zIndex: 35, animation: 'poufPopIn 0.5s forwards' }}>
          <div
            style={{
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(254,215,226,0.92))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 15px 35px rgba(236,72,153,0.4)',
              border: '3px solid #f472b6'
            }}
          >
            {centerAnimation === 'play' ? <ClayPlay size={44} /> : <ClayPause size={44} />}
          </div>
        </div>
      )}

      {/* 6. Video.js 10 Cinema Pink Scrim Background & Floating Control Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '24px 20px 14px 20px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.45) 65%, transparent 100%)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          opacity: showControls ? 1 : 0,
          transform: showControls ? 'translateY(0)' : 'translateY(15px)',
          transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
          pointerEvents: showControls ? 'auto' : 'none'
        }}
      >
        {/* Full-Width Pink Scrubber Bar */}
        <div
          id="pouf-progress-track"
          onMouseDown={handleScrubberMouseDown}
          onMouseMove={handleScrubberMouseMove}
          onMouseLeave={handleScrubberMouseLeave}
          style={{
            position: 'relative',
            width: '100%',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer'
          }}
        >
          {/* Hover Time Tooltip */}
          {hoverTime !== null && (
            <div
              style={{
                position: 'absolute',
                left: `${hoverPosition}%`,
                bottom: '22px',
                transform: 'translateX(-50%)',
                background: 'rgba(23, 15, 32, 0.95)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(244, 114, 182, 0.5)',
                color: '#fce7f3',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                pointerEvents: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                whiteSpace: 'nowrap'
              }}
            >
              {formatTime(hoverTime)}
            </div>
          )}

          {/* Rail */}
          <div
            style={{
              width: '100%',
              height: '5px',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.22)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {/* Buffer bar */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${duration > 0 ? (bufferedProgress / duration) * 100 : 0}%`,
                background: 'rgba(244, 114, 182, 0.4)'
              }}
            />
            {/* Play progress bar */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${duration > 0 ? (playProgress / duration) * 100 : 0}%`,
                background: 'linear-gradient(90deg, #ec4899, #f472b6)',
                boxShadow: '0 0 10px #ec4899'
              }}
            />
          </div>

          {/* Scrubber Knob */}
          <div
            style={{
              position: 'absolute',
              left: `${duration > 0 ? (playProgress / duration) * 100 : 0}%`,
              transform: 'translateX(-50%)',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: '#ec4899',
              border: '2px solid #ffffff',
              boxShadow: '0 0 10px rgba(236,72,153,0.9)',
              pointerEvents: 'none',
              transition: isDraggingScrubberRef.current ? 'none' : 'transform 0.1s ease'
            }}
          />
        </div>

        {/* Bottom Control Actions (Clean & Professional) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          {/* Left Controls: Big Circular Play/Pause, Rewind 10s, Forward 10s, Volume, Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Large Hot Pink Play/Pause Button */}
            <button
              onClick={togglePlayPause}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                color: '#ffffff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(236, 72, 153, 0.55)',
                cursor: 'pointer',
                transition: 'transform 0.15s ease'
              }}
              className="pouf-btn-tactile"
              title={localPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {localPlaying ? <ClayPause size={20} /> : <ClayPlay size={20} />}
            </button>

            {/* -10s Rewind Button */}
            <button
              onClick={() => handleSeekRelative(-10)}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              className="pouf-btn-tactile"
              title="Rewind 10s (Left Arrow)"
            >
              <RotateCcw size={15} />
            </button>

            {/* +10s Forward Button */}
            <button
              onClick={() => handleSeekRelative(10)}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              className="pouf-btn-tactile"
              title="Fast Forward 10s (Right Arrow)"
            >
              <RotateCw size={15} />
            </button>

            {/* Volume Control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '4px' }}>
              <button
                onClick={() => setIsMuted(m => !m)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#fff', display: 'flex', alignItems: 'center' }}
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted || volume === 0 ? <VolumeX size={19} color="#f472b6" /> : <Volume2 size={19} />}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  setIsMuted(false);
                  localStorage.setItem('wt_player_vol', val);
                }}
                style={{
                  width: '64px',
                  accentColor: '#ec4899',
                  cursor: 'pointer',
                  height: '4px'
                }}
              />
            </div>

            {/* Time Stamp (Tabular Steady Numbers) */}
            <div
              style={{
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.86rem',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.5px',
                marginLeft: '6px'
              }}
            >
              {formatTime(playProgress)} / {formatTime(duration)}
            </div>
          </div>

          {/* Right Controls: Quick CC, Settings Gear, Fullscreen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Quick CC Subtitles Toggle Button */}
            <button
              onClick={handleToggleCC}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                background: activeSubtitleIndex >= 0 ? 'rgba(236, 72, 153, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                border: activeSubtitleIndex >= 0 ? '1px solid rgba(244, 114, 182, 0.6)' : '1px solid rgba(255, 255, 255, 0.15)',
                color: activeSubtitleIndex >= 0 ? '#f472b6' : '#d1d5db',
                fontWeight: 800,
                fontSize: '0.78rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Toggle Subtitles (C)"
            >
              <ClaySubtitles size={17} />
              <span>CC</span>
            </button>

            {/* Unified Settings Gear Button */}
            <button
              onClick={() => setShowSettingsMenu(prev => !prev)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: showSettingsMenu ? 'linear-gradient(135deg, #ec4899, #db2777)' : 'rgba(255, 255, 255, 0.1)',
                border: showSettingsMenu ? '1px solid #f472b6' : '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: showSettingsMenu ? '0 0 14px rgba(236,72,153,0.5)' : 'none'
              }}
              title="Settings (Subtitles, Audio, Aspect, Speed)"
            >
              <Settings
                size={18}
                style={{
                  transform: showSettingsMenu ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: 'transform 0.3s ease'
                }}
              />
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* UNIFIED VIDEO.JS 10 / CINEMA PINK SETTINGS MENU POPOVER            */}
        {/* ------------------------------------------------------------------ */}
        {showSettingsMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: '62px',
              right: '16px',
              background: 'rgba(18, 12, 26, 0.96)',
              backdropFilter: 'blur(24px)',
              border: '1.5px solid rgba(244, 114, 182, 0.38)',
              borderRadius: '20px',
              padding: '14px',
              width: '360px',
              maxHeight: '490px',
              boxShadow: '0 16px 42px rgba(0, 0, 0, 0.85), 0 0 20px rgba(244, 114, 182, 0.18)',
              zIndex: 70,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              overflowY: 'auto'
            }}
          >
            {/* Popover Header & Close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Settings size={15} color="#f472b6" />
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fce7f3' }}>
                  Player Settings
                </span>
              </div>
              <button
                onClick={() => setShowSettingsMenu(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', background: 'rgba(255, 255, 255, 0.05)', padding: '3px', borderRadius: '12px' }}>
              {[
                { id: 'subtitles', label: '💬 Subs' },
                { id: 'audio', label: '🎵 Audio' },
                { id: 'aspect', label: '📐 Ratio' },
                { id: 'speed', label: '⚡ Speed' }
              ].map(tab => {
                const isActive = activeSettingsTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSettingsTab(tab.id)}
                    style={{
                      padding: '6px 2px',
                      borderRadius: '9px',
                      background: isActive ? 'linear-gradient(135deg, #ec4899, #db2777)' : 'transparent',
                      color: isActive ? '#ffffff' : '#9ca3af',
                      border: 'none',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* TAB 1: SUBTITLES & PIXEL CONTROLLERS */}
            {activeSettingsTab === 'subtitles' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* 1. Track Picker */}
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Select Subtitle Track
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '110px', overflowY: 'auto' }}>
                    <button
                      onClick={() => onSubtitleChange?.(-1)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        background: activeSubtitleIndex === -1 ? 'rgba(244, 114, 182, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        color: activeSubtitleIndex === -1 ? '#f472b6' : '#e5e7eb',
                        border: activeSubtitleIndex === -1 ? '1px solid rgba(244, 114, 182, 0.45)' : '1px solid transparent',
                        fontWeight: activeSubtitleIndex === -1 ? 800 : 600,
                        fontSize: '0.78rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer'
                      }}
                    >
                      <span>Off (No Subtitles)</span>
                      {activeSubtitleIndex === -1 && <Check size={14} />}
                    </button>

                    {allSubtitles.map((t, idx) => {
                      const isActive = activeSubtitleIndex === idx;
                      return (
                        <button
                          key={idx}
                          onClick={() => onSubtitleChange?.(idx)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            background: isActive ? 'rgba(244, 114, 182, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                            color: isActive ? '#f472b6' : '#e5e7eb',
                            border: isActive ? '1px solid rgba(244, 114, 182, 0.45)' : '1px solid transparent',
                            fontWeight: isActive ? 800 : 600,
                            fontSize: '0.78rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.title || `Track ${idx + 1}`}
                          </span>
                          {isActive && <Check size={14} />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Custom Subtitle File Upload */}
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".srt,.vtt"
                    onChange={handleUploadSubtitleFile}
                    style={{ display: 'none' }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: 'rgba(244, 114, 182, 0.15)',
                      border: '1px dashed rgba(244, 114, 182, 0.5)',
                      color: '#f472b6',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <Upload size={14} />
                    <span>Upload Custom Subtitle (.srt / .vtt)</span>
                  </button>
                </div>

                {/* 3. Pixel Controller: Font Size */}
                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#d1d5db' }}>
                      Font Size
                    </span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f472b6', fontVariantNumeric: 'tabular-nums' }}>
                      {subtitleSize}px
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => handleSizeChange(subtitleSize - 1)}
                      style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min="14"
                      max="48"
                      value={subtitleSize}
                      onChange={(e) => handleSizeChange(parseInt(e.target.value, 10))}
                      style={{ flex: 1, accentColor: '#ec4899', cursor: 'pointer' }}
                    />
                    <button
                      onClick={() => handleSizeChange(subtitleSize + 1)}
                      style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 4. Pixel Controller: Position from Bottom */}
                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#d1d5db' }}>
                      Bottom Position
                    </span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f472b6', fontVariantNumeric: 'tabular-nums' }}>
                      {subtitleBottom}px
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => handleBottomChange(subtitleBottom - 5)}
                      style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min="10"
                      max="280"
                      step="5"
                      value={subtitleBottom}
                      onChange={(e) => handleBottomChange(parseInt(e.target.value, 10))}
                      style={{ flex: 1, accentColor: '#ec4899', cursor: 'pointer' }}
                    />
                    <button
                      onClick={() => handleBottomChange(subtitleBottom + 5)}
                      style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 5. Subtitle Sync Offset / Delay */}
                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#d1d5db' }}>
                      Sync Delay
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: subtitleDelay !== 0 ? '#fbbf24' : '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                        {subtitleDelay > 0 ? `+${subtitleDelay.toFixed(1)}s` : `${subtitleDelay.toFixed(1)}s`}
                      </span>
                      {subtitleDelay !== 0 && (
                        <button
                          onClick={() => handleDelayChange(0.0)}
                          style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#9ca3af', fontSize: '0.66rem', cursor: 'pointer' }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => handleDelayChange(subtitleDelay - 0.1)}
                      style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min="-5.0"
                      max="5.0"
                      step="0.1"
                      value={subtitleDelay}
                      onChange={(e) => handleDelayChange(parseFloat(e.target.value))}
                      style={{ flex: 1, accentColor: '#ec4899', cursor: 'pointer' }}
                    />
                    <button
                      onClick={() => handleDelayChange(subtitleDelay + 0.1)}
                      style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 6. Subtitle Background Style */}
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Subtitle Appearance
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {[
                      { id: 'transparent', label: 'Outline' },
                      { id: 'soft', label: 'Soft Glass' },
                      { id: 'box', label: 'Solid Box' }
                    ].map(st => (
                      <button
                        key={st.id}
                        onClick={() => handleStyleChange(st.id)}
                        style={{
                          padding: '6px 4px',
                          borderRadius: '8px',
                          background: subtitleStyle === st.id ? 'rgba(244, 114, 182, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                          color: subtitleStyle === st.id ? '#f472b6' : '#9ca3af',
                          border: subtitleStyle === st.id ? '1px solid rgba(244, 114, 182, 0.5)' : '1px solid transparent',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: AUDIO TRACKS & PRE-EXTRACTION */}
            {activeSettingsTab === 'audio' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
                  Available Audio Tracks
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {audioTracks.length === 0 ? (
                    <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(244, 114, 182, 0.15)', color: '#f472b6', fontSize: '0.8rem', fontWeight: 700 }}>
                      Default Audio (Stereo AAC)
                    </div>
                  ) : (
                    audioTracks.map((t, idx) => {
                      const trackIdx = t.index ?? idx;
                      const isActive = activeAudioIndex === trackIdx;
                      const trackStatus = audioStatusData?.tracks?.find((st) => st.index === trackIdx);
                      const isReady = trackIdx === 0 || trackStatus?.isReady;
                      const isProcessing = trackStatus?.isProcessing;

                      return (
                        <button
                          key={trackIdx}
                          onClick={() => {
                            onAudioTrackChange?.(trackIdx);
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '10px',
                            background: isActive ? 'rgba(244, 114, 182, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                            color: isActive ? '#f472b6' : '#e5e7eb',
                            border: isActive ? '1px solid rgba(244, 114, 182, 0.45)' : '1px solid transparent',
                            fontWeight: isActive ? 800 : 600,
                            fontSize: '0.82rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                            <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {t.title || `Track ${idx + 1}`}
                            </span>
                            {t.codec && (
                              <span style={{ fontSize: '0.64rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#a1a1aa', fontWeight: 700 }}>
                                {t.codec.toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {isReady ? (
                              <span style={{ fontSize: '0.66rem', padding: '2px 6px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.18)', color: '#34d399', fontWeight: 700 }}>
                                ✓ Ready
                              </span>
                            ) : isProcessing ? (
                              <span style={{ fontSize: '0.66rem', padding: '2px 6px', borderRadius: '6px', background: 'rgba(251, 191, 36, 0.18)', color: '#fbbf24', fontWeight: 700 }}>
                                ⏳ Extracting
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.66rem', padding: '2px 6px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.08)', color: '#9ca3af', fontWeight: 600 }}>
                                Pending
                              </span>
                            )}
                            {isActive && <Check size={14} />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Pre-extract All Tracks Action */}
                {audioTracks.length > 1 && (
                  <div style={{ marginTop: '8px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                      <span style={{ color: '#9ca3af', fontWeight: 600 }}>Audio Cache Status:</span>
                      <span style={{ color: audioStatusData?.allReady ? '#34d399' : '#f472b6', fontWeight: 700 }}>
                        {audioStatusData?.percent !== undefined ? `${audioStatusData.percent}% Ready` : '100% Ready'}
                      </span>
                    </div>

                    <div style={{ width: '100%', height: '5px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${audioStatusData?.percent !== undefined ? audioStatusData.percent : 100}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #f472b6, #34d399)',
                          transition: 'width 0.4s ease'
                        }}
                      />
                    </div>

                    {!audioStatusData?.allReady ? (
                      <button
                        onClick={handleProcessAllAudio}
                        disabled={isProcessingAudio}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #f472b6, #ec4899)',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.76rem',
                          border: 'none',
                          cursor: isProcessingAudio ? 'not-allowed' : 'pointer',
                          opacity: isProcessingAudio ? 0.65 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 12px rgba(244, 114, 182, 0.3)'
                        }}
                      >
                        <Sparkles size={14} />
                        {isProcessingAudio ? 'Extracting in Background...' : '⚡ Pre-extract All Tracks to AAC'}
                      </button>
                    ) : (
                      <div style={{ fontSize: '0.72rem', color: '#34d399', textAlign: 'center', fontWeight: 600 }}>
                        ✨ All tracks cached for 0ms instant zero-lag switching!
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: ASPECT RATIO */}
            {activeSettingsTab === 'aspect' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Screen Fit & Aspect Ratio
                </div>

                {[
                  { id: 'contain', label: 'Default Fit (16:9)', desc: 'Standard aspect ratio with letterboxing' },
                  { id: 'cover', label: 'Cinema Zoom (Cover 21:9)', desc: 'Fills screen completely, eliminates black bars' },
                  { id: 'fill', label: 'Stretch (100% Canvas)', desc: 'Stretches video to fill stage without cropping' }
                ].map(opt => {
                  const isActive = aspectRatio === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleAspectChange(opt.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: isActive ? 'rgba(244, 114, 182, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        border: isActive ? '1px solid rgba(244, 114, 182, 0.5)' : '1px solid transparent',
                        color: isActive ? '#f472b6' : '#e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{opt.label}</div>
                        <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '2px' }}>{opt.desc}</div>
                      </div>
                      {isActive && <Check size={16} />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* TAB 4: PLAYBACK SPEED & ROOM SYNC */}
            {activeSettingsTab === 'speed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Speed Presets */}
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Playback Speed
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(spd => {
                      const isActive = playbackSpeed === spd;
                      return (
                        <button
                          key={spd}
                          onClick={() => handleSpeedChange(spd)}
                          style={{
                            padding: '8px 4px',
                            borderRadius: '8px',
                            background: isActive ? 'linear-gradient(135deg, #ec4899, #db2777)' : 'rgba(255, 255, 255, 0.06)',
                            color: isActive ? '#ffffff' : '#d1d5db',
                            border: 'none',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          {spd === 1.0 ? '1.0x (Normal)' : `${spd}x`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Force Sync Room Action */}
                <div style={{ paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Room Synchronization
                  </div>
                  <button
                    onClick={() => {
                      onForceSyncAll?.();
                      setShowSettingsMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                      color: '#1a1006',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)'
                    }}
                  >
                    <span>⚡ Force Sync Both Viewers</span>
                  </button>
                  <div style={{ fontSize: '0.68rem', color: '#9ca3af', textAlign: 'center', marginTop: '6px' }}>
                    Snaps timeline and audio clock across all connected viewers instantly.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PoufPlayer;
