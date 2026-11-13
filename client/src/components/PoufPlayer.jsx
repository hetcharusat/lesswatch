import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  RefreshCw,
  Globe,
  Search,
  Download,
  Heart,
  Users,
  Folder,
  Lock,
  Unlock,
  PictureInPicture,
  Sun,
  ChevronRight,
  ChevronLeft,
  Gauge,
  Crop,
  Camera
} from 'lucide-react';

/**
 * PoufPlayer - Compact Video.js 10 Cinema Pink Edition
 * 
 * - Compact, sleek player deck (36px controls, tightened padding)
 * - Subtitles menu is OUTSIDE of Settings: Dedicated Subtitles button opens full subtitle track list,
 *   custom file upload, OpenSubtitles 1-click search & download, pixel size & bottom position steppers,
 *   sync delay, and Special Pink Aesthetic Subtitle Mode!
 * - Settings menu is compact and dedicated to: Audio Tracks (multi-audio & background cache),
 *   Aspect Ratio (16:9, 21:9 Cinema Zoom, Stretch), and Playback Speed + Room Sync.
 * - Microsecond Dual-Track Audio Sync Engine for 0ms zero-lag streaming
 */
export function PoufPlayer({
  socket = null,
  url,
  title = 'Video Stream',
  audioTracks = [],
  activeAudioIndex = 0,
  onAudioTrackChange,
  subtitleTracks = [],
  activeSubtitleIndex = -1,
  onSubtitleChange,
  onAddSubtitleTrack,
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
  onEnterChat,
  onToggleFullscreen,
  viewerCount = 1,
  isHost = false,
  canControl = true,
  barrierState = null,
  isChitChatMode = false,
  className = '',
  style = {},
  children
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

  // Autoplay recovery & black screen watchdog
  const [needsUnmutePrompt, setNeedsUnmutePrompt] = useState(false);
  const [isPlaybackStalled, setIsPlaybackStalled] = useState(false);
  const pendingSeekRef = useRef(null);
  const lastProgressTimeRef = useRef(Date.now());
  const lastRecordedTimeRef = useRef(0);

  // Scrubber Hover Tooltip
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(0);

  // Separate Compact YouTube-Style Menus for Subtitles and Settings
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [subsSubView, setSubsSubView] = useState('root'); // 'root' | 'options' | 'search'
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsSubView, setSettingsSubView] = useState('root'); // 'root' | 'audio' | 'speed' | 'boost' | 'filters' | 'aspect'
  const [activeSettingsTab, setActiveSettingsTab] = useState('audio'); // 'audio' | 'visual' | 'aspect' | 'speed'
  const [subtitleColor, setSubtitleColor] = useState(() => localStorage.getItem('wt_sub_color') || '#ffffff');

  // Controls Lock Mode
  const [isLocked, setIsLocked] = useState(false);
  const [isHoveringUnlock, setIsHoveringUnlock] = useState(false);
  const [showLockHint, setShowLockHint] = useState(false);
  const [lockHintTick, setLockHintTick] = useState(0);
  const lockHintTimerRef = useRef(null);

  // Skip Ripple Feedback (+10s / -10s)
  const [skipFeedback, setSkipFeedback] = useState(null);
  const skipFeedbackTimerRef = useRef(null);

  // Visual Customizer & Presets
  const [visualPreset, setVisualPreset] = useState(() => {
    return localStorage.getItem('wt_visual_preset') || 'standard';
  });
  const [visualFilter, setVisualFilter] = useState(() => {
    try {
      const saved = localStorage.getItem('wt_visual_filter');
      if (saved) return JSON.parse(saved);
    } catch { }
    return { brightness: 100, contrast: 100, saturation: 100 };
  });

  // Live Film Grain Engine (Defaultly Disabled; customizable Silver-Halide & Rosé stocks)
  const [filmGrainEnabled, setFilmGrainEnabled] = useState(() => {
    return localStorage.getItem('wt_grain_enabled') === 'true';
  });
  const [filmGrainIntensity, setFilmGrainIntensity] = useState(() => {
    const saved = localStorage.getItem('wt_grain_intensity');
    return saved !== null ? Math.max(5, parseInt(saved, 10) || 35) : 35;
  });
  const [filmGrainPreset, setFilmGrainPreset] = useState(() => {
    return localStorage.getItem('wt_grain_preset') || '35mm';
  });
  const [filmGrainSize, setFilmGrainSize] = useState(() => {
    const saved = parseFloat(localStorage.getItem('wt_grain_size'));
    return Number.isFinite(saved) ? saved : 1.0;
  });
  const [filmGrainBlend, setFilmGrainBlend] = useState(() => {
    return localStorage.getItem('wt_grain_blend') || 'normal';
  });
  const [filmGrainChroma, setFilmGrainChroma] = useState(() => {
    return localStorage.getItem('wt_grain_chroma') || 'mono';
  });
  const [filmGrainMotion, setFilmGrainMotion] = useState(() => {
    return localStorage.getItem('wt_grain_motion') || '24fps';
  });
  const [filterLabTab, setFilterLabTab] = useState('grain');

  // Subtitle Background Styling (Opacity, Blur, Color)
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState(() => {
    const saved = localStorage.getItem('wt_sub_bg_opacity');
    return saved !== null ? parseInt(saved, 10) : 55;
  });
  const [subtitleBgBlur, setSubtitleBgBlur] = useState(() => {
    const saved = localStorage.getItem('wt_sub_bg_blur');
    return saved !== null ? parseInt(saved, 10) : 6;
  });
  const [subtitleBgColor, setSubtitleBgColor] = useState(() => {
    return localStorage.getItem('wt_sub_bg_color') || 'black'; // 'black' | 'pink' | 'purple' | 'charcoal' | pink presets
  });
  const [subtitleFont, setSubtitleFont] = useState(() => localStorage.getItem('wt_sub_font') || 'sans');
  const [subtitleEdge, setSubtitleEdge] = useState(() => localStorage.getItem('wt_sub_edge') || 'auto');
  const [subCustomizerTab, setSubCustomizerTab] = useState('presets');

  // Audio Boost (100%, 125%, 150%, 200%)
  const [audioBoost, setAudioBoost] = useState(() => {
    return parseInt(localStorage.getItem('wt_audio_boost'), 10) || 100;
  });
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  const sourceNodeRef = useRef(null);

  const triggerLockHint = useCallback(() => {
    setShowLockHint(true);
    setLockHintTick((t) => t + 1);
    if (lockHintTimerRef.current) clearTimeout(lockHintTimerRef.current);
    lockHintTimerRef.current = setTimeout(() => {
      setShowLockHint(false);
    }, 2400);
  }, []);

  const handleAudioBoostChange = useCallback((newBoost) => {
    setAudioBoost(newBoost);
    localStorage.setItem('wt_audio_boost', String(newBoost));
    try {
      const video = videoRef.current;
      if (!video) return;
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioContextRef.current = ctx;
          const gain = ctx.createGain();
          gainNodeRef.current = gain;
          const src = ctx.createMediaElementSource(video);
          sourceNodeRef.current = src;
          src.connect(gain);
          gain.connect(ctx.destination);
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      if (gainNodeRef.current && audioContextRef.current) {
        gainNodeRef.current.gain.setValueAtTime(newBoost / 100, audioContextRef.current.currentTime);
      }
    } catch (e) {
      console.warn('Audio boost setup notice:', e.message);
    }
  }, []);

  const handleVisualFilterChange = (key, val) => {
    setVisualFilter(prev => {
      const next = { ...prev, [key]: val };
      localStorage.setItem('wt_visual_filter', JSON.stringify(next));
      return next;
    });
    setVisualPreset('custom');
  };

  const handleTogglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP error:', e);
    }
  };

  // Subtitle Customization (with Special Pink Subtitle Mode & Pixel Controllers)
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
    return localStorage.getItem('wt_sub_style') || 'pink'; // 'pink' | 'transparent' | 'soft' | 'box'
  });
  const [uploadedSubtitles, setUploadedSubtitles] = useState([]);

  // SubDL Online Search State
  const [showOnlineSubSearch, setShowOnlineSubSearch] = useState(false);
  const [onlineSearchQuery, setOnlineSearchQuery] = useState(() => {
    return (title || '')
      .replace(/\.(mkv|mp4|avi|webm)$/i, '')
      .replace(/[\._]/g, ' ')
      .replace(/\b(1080p|720p|2160p|4k|bluray|web-dl|x264|x265|hevc|aac|dts|ddp5\.1|nf|4khdhub|com|kontrast|amzn)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  });
  const [onlineSearchResults, setOnlineSearchResults] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [isDownloadingOnline, setIsDownloadingOnline] = useState(false);
  const [downloadingSubId, setDownloadingSubId] = useState(null);

  // Re-sync SubDL search query whenever active video changes
  useEffect(() => {
    if (title) {
      const cleaned = (title || '')
        .replace(/\.(mkv|mp4|avi|webm)$/i, '')
        .replace(/[\._]/g, ' ')
        .replace(/\b(1080p|720p|2160p|4k|bluray|web-dl|x264|x265|hevc|aac|dts|ddp5\.1|nf|4khdhub|com|kontrast|amzn)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      setOnlineSearchQuery(cleaned);
      setOnlineSearchResults([]);
    }
  }, [title]);

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
    } catch { }
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
      const token = localStorage.getItem('wt_token') || '';
      await fetch(`/api/media/process-audio/${encodeURIComponent(cleanFilename)}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      fetchAudioStatus();
    } catch { }
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

  // Robust Safe Play with Muted Autoplay Fallback (Zero Black Screen Guarantee)
  const safePlayVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setNeedsUnmutePrompt(false);
      setIsPlaybackStalled(false);
    } catch (err) {
      console.warn('[PoufPlayer] Direct play blocked by browser autoplay policy:', err?.message || err);
      // Auto-fallback: Mute video immediately so browser decodes and paints frames without black screen!
      try {
        video.muted = true;
        await video.play();
        setNeedsUnmutePrompt(true);
        setIsPlaybackStalled(false);
      } catch (e2) {
        console.warn('[PoufPlayer] Muted play also failed:', e2?.message || e2);
      }
    }
  }, []);

  const handleUnmuteAudio = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (!shouldUseAudioElement) {
        video.muted = isMuted;
        video.volume = isMuted ? 0 : volume;
      }
    }
    if (audioRef.current && shouldUseAudioElement) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = isMuted ? 0 : volume;
      if (isPlaying && audioRef.current.paused) {
        audioRef.current.play().catch(() => { });
      }
    }
    setNeedsUnmutePrompt(false);
  }, [isMuted, volume, shouldUseAudioElement, isPlaying]);

  // Smooth Stream Kickstart & Sync Nudge (Zero Reset Guarantee)
  const handleFixBlackScreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const targetTime = (typeof currentTime === 'number' && !isNaN(currentTime) && currentTime > 0)
      ? currentTime
      : (video.currentTime || 0);

    try {
      if (Math.abs(video.currentTime - targetTime) > 0.5) {
        video.currentTime = targetTime;
      }
      video.play().catch(async () => {
        video.muted = true;
        await video.play().catch(() => { });
        setNeedsUnmutePrompt(true);
      });
    } catch { }

    if (audioRef.current && shouldUseAudioElement) {
      try {
        audioRef.current.currentTime = video.currentTime;
        if (!video.paused) audioRef.current.play().catch(() => { });
      } catch { }
    }
  }, [currentTime, shouldUseAudioElement]);

  // Mount Direct Stream to Video safely without premature seeking
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !directStreamUrl) return;

    if (video.src !== directStreamUrl && !video.src.endsWith(directStreamUrl)) {
      video.src = directStreamUrl;
      if (currentTime > 0) {
        pendingSeekRef.current = currentTime;
      }
      if (video.readyState >= 1) {
        if (currentTime > 0) {
          video.currentTime = currentTime;
          pendingSeekRef.current = null;
        }
        if (isPlaying) {
          safePlayVideo();
        }
      }
    }
  }, [directStreamUrl, safePlayVideo]);

  // Apply playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Dual-Track Audio Sync Engine with direct Range-Seekable .m4a pipeline
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
        if (audio.src !== activeAudioUrl && !audio.src.endsWith(activeAudioUrl)) {
          audio.src = activeAudioUrl;
          audio.load();
        }
        audio.volume = isMuted ? 0 : volume;
        audio.muted = isMuted;
        audio.playbackRate = video.playbackRate;

        const syncAudioPosition = () => {
          if (!videoRef.current || !audioRef.current) return;
          const target = videoRef.current.currentTime || currentTime || 0;
          if (typeof target === 'number' && Math.abs(audioRef.current.currentTime - target) > 0.4) {
            audioRef.current.currentTime = target;
          }
          audioRef.current.playbackRate = videoRef.current.playbackRate;
          if (!videoRef.current.paused) {
            audioRef.current.play().catch(() => { });
          }
        };

        const onAudioError = (err) => {
          console.warn('[PoufPlayer] Secondary audio load error:', err);
          if (videoRef.current && activeAudioIndex === 0) videoRef.current.muted = false;
        };

        audio.addEventListener('loadedmetadata', syncAudioPosition);
        audio.addEventListener('canplay', syncAudioPosition);
        audio.addEventListener('error', onAudioError, { once: true });

        // Immediate check in case audio is already buffered
        syncAudioPosition();
      }
    }
  }, [activeAudioIndex, activeAudioUrl, shouldUseAudioElement]);

  // Audio status update listener via socket to switch to seekable cached .m4a once ready
  useEffect(() => {
    const s = socket || (typeof window !== 'undefined' ? window.wtSocket : null);
    if (!s || !cleanFilename) return;

    const handleAudioStatusUpdate = (data) => {
      if (data && data.filename === cleanFilename && data.track === activeAudioIndex && data.isReady) {
        const audio = audioRef.current;
        const video = videoRef.current;
        if (audio && shouldUseAudioElement && video) {
          const curTime = audio.currentTime || video.currentTime || 0;
          const wasPlaying = !audio.paused && !video.paused;
          audio.src = `/api/media/audio/${encodeURIComponent(cleanFilename)}?track=${activeAudioIndex}&cb=${Date.now()}`;
          audio.load();
          audio.addEventListener('canplay', () => {
            audio.currentTime = curTime;
            if (wasPlaying) audio.play().catch(() => { });
          }, { once: true });
        }
      }
    };

    s.on('audio:status_update', handleAudioStatusUpdate);
    return () => s.off('audio:status_update', handleAudioStatusUpdate);
  }, [socket, cleanFilename, activeAudioIndex, shouldUseAudioElement]);

  // Sync external playback state
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    if (isPlaying) {
      if (video.paused) video.play().catch(() => { });
      if (shouldUseAudioElement && audio && audio.paused) {
        if (Math.abs(audio.currentTime - video.currentTime) > 0.4) {
          audio.currentTime = video.currentTime;
        }
        audio.play().catch(() => { });
      }
    } else {
      if (!video.paused) video.pause();
      if (audio && !audio.paused) audio.pause();
    }
  }, [isPlaying, shouldUseAudioElement]);

  // Sync external currentTime (when paused: threshold 0.4s; when playing: threshold 2.0s so joining users and scrubs instantly sync without frame drops during playback)
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || typeof currentTime !== 'number' || isNaN(currentTime)) return;
    if (isDraggingScrubberRef.current) return;

    // Relaxed 4s tolerance window: play naturally at 1.0x without chopping frames or artificial seeks
    const diff = Math.abs(video.currentTime - currentTime);
    const threshold = video.paused ? 0.4 : 4.0;
    if (diff > threshold) {
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
    const text = (rawText || '')
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
        title: file.name.replace(/\.[^/.]+$/, ''),
        url: blobUrl,
        cues: parsedCues,
        isCustom: true
      };
      cuesRef.current = parsedCues;
      if (onAddSubtitleTrack) {
        onAddSubtitleTrack(newTrack);
      } else {
        setUploadedSubtitles((prev) => [...prev, newTrack]);
        const newIndex = subtitleTracks.length + uploadedSubtitles.length;
        onSubtitleChange?.(newIndex);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // SubDL Online Search & Download
  const handleSearchOnlineSubtitles = async (overrideQuery = null) => {
    const q = (overrideQuery !== null ? overrideQuery : onlineSearchQuery).trim();
    const rawTarget = cleanFilename || title || '';
    if (!q && !rawTarget) return;
    setIsSearchingOnline(true);
    try {
      const res = await fetch(`/api/subtitles/search?query=${encodeURIComponent(q || rawTarget)}&filename=${encodeURIComponent(rawTarget)}`);
      if (res.ok) {
        const data = await res.json();
        setOnlineSearchResults(data.data || []);
      }
    } catch (e) {
      console.warn('SubDL search error:', e);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const handleToggleOnlineSubSearch = () => {
    setShowOnlineSubSearch((prev) => {
      const next = !prev;
      if (next && onlineSearchResults.length === 0) {
        handleSearchOnlineSubtitles();
      }
      return next;
    });
  };

  const handleDownloadOnlineSubtitle = async (sub) => {
    setIsDownloadingOnline(true);
    setDownloadingSubId(sub.fileId);
    try {
      const seMatch = (cleanFilename || title || '').match(/s(\d+)e(\d+)/i) || (cleanFilename || title || '').match(/(\d+)x(\d+)/i);
      const targetEpisode = seMatch ? parseInt(seMatch[2], 10) : (sub.episode || null);

      const res = await fetch('/api/subtitles/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: sub.fileId,
          fileName: sub.fileName,
          targetEpisode
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.vttContent) {
          const parsedCues = parseSubtitlesText(data.vttContent);
          const newTrack = {
            id: `subdl-${Date.now()}`,
            title: sub.fileName || 'SubDL Subtitle',
            url: data.url,
            cues: parsedCues,
            isCustom: true
          };
          cuesRef.current = parsedCues;
          if (onAddSubtitleTrack) {
            onAddSubtitleTrack(newTrack);
          } else {
            setUploadedSubtitles((prev) => [...prev, newTrack]);
            const newIndex = subtitleTracks.length + uploadedSubtitles.length;
            onSubtitleChange?.(newIndex);
          }
          setShowOnlineSubSearch(false);
        }
      }
    } catch (e) {
      console.warn('SubDL download error:', e);
    } finally {
      setIsDownloadingOnline(false);
      setDownloadingSubId(null);
    }
  };

  // Video DOM Event Handlers
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || isDraggingScrubberRef.current) return;

    setPlayProgress(video.currentTime);

    // Smooth Dual-Track Sync: keep secondary audio tightly locked to video
    if (shouldUseAudioElement && audio && !video.paused && !audio.paused && !audio.seeking && !video.seeking) {
      const drift = Math.abs(audio.currentTime - video.currentTime);
      if (drift > 0.6) {
        audio.currentTime = video.currentTime;
      }
      if (audio.playbackRate !== video.playbackRate) {
        audio.playbackRate = video.playbackRate;
      }
    }

    // Buffer progress
    if (video.buffered && video.buffered.length > 0) {
      try {
        setBufferedProgress(video.buffered.end(video.buffered.length - 1));
      } catch { }
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
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);

    // Initial seek to target currentTime once video metadata is ready
    const seekTarget = pendingSeekRef.current !== null ? pendingSeekRef.current : currentTime;
    if (typeof seekTarget === 'number' && seekTarget > 0 && Math.abs(video.currentTime - seekTarget) > 0.4) {
      video.currentTime = seekTarget;
      if (shouldUseAudioElement && audioRef.current) {
        audioRef.current.currentTime = seekTarget;
      }
    }
    pendingSeekRef.current = null;

    if (isPlaying && video.paused) {
      safePlayVideo();
    }
  }

  function handlePlayEvent() {
    setLocalPlaying(true);
    setIsBuffering(false);
    setIsPlaybackStalled(false);
    if (shouldUseAudioElement && audioRef.current && audioRef.current.paused) {
      audioRef.current.currentTime = videoRef.current?.currentTime || 0;
      audioRef.current.play().catch(() => { });
    }
  }

  function handlePauseEvent() {
    setLocalPlaying(false);
    if (shouldUseAudioElement && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }

  function triggerCenterAnimation(type) {
    setCenterAnimation(type);
    setTimeout(() => setCenterAnimation(null), 550);
  }

  function togglePlayPause() {
    if (isLocked) {
      triggerLockHint();
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      triggerCenterAnimation('play');
      video.play().catch(() => { });
      if (shouldUseAudioElement && audioRef.current && audioRef.current.paused) {
        audioRef.current.currentTime = video.currentTime;
        audioRef.current.play().catch(() => { });
      }
      if (onPlay) onPlay(video.currentTime);
    } else {
      triggerCenterAnimation('pause');
      video.pause();
      if (shouldUseAudioElement && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      if (onPause) onPause(video.currentTime);
    }
  }

  function handleVideoClick(e) {
    if (e && e.defaultPrevented) return;
    if (needsUnmutePrompt) {
      handleUnmuteAudio();
      return;
    }
    togglePlayPause();
  }

  // Stall watchdog: If isPlaying is true, verify that currentTime is actively advancing
  useEffect(() => {
    if (!isPlaying) {
      setIsPlaybackStalled(false);
      return;
    }
    const checkInterval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const cur = video.currentTime;
      if (Math.abs(cur - lastRecordedTimeRef.current) < 0.05) {
        if (Date.now() - lastProgressTimeRef.current > 3800) {
          setIsPlaybackStalled(true);
        }
      } else {
        lastRecordedTimeRef.current = cur;
        lastProgressTimeRef.current = Date.now();
        setIsPlaybackStalled(false);
      }
    }, 1500);
    return () => clearInterval(checkInterval);
  }, [isPlaying]);

  function handleSeekRelative(deltaSeconds) {
    if (isLocked) {
      triggerLockHint();
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    const newTime = Math.max(0, Math.min(duration, video.currentTime + deltaSeconds));
    video.currentTime = newTime;
    if (shouldUseAudioElement && audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    if (onSeek) onSeek(newTime);

    setSkipFeedback({
      direction: deltaSeconds > 0 ? 'forward' : 'backward',
      delta: Math.abs(deltaSeconds),
      key: Date.now()
    });
    if (skipFeedbackTimerRef.current) clearTimeout(skipFeedbackTimerRef.current);
    skipFeedbackTimerRef.current = setTimeout(() => {
      setSkipFeedback(null);
    }, 650);
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

  useEffect(() => {
    const handleFsChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(!!fsEl);
      if (!fsEl && 'keyboard' in navigator && navigator.keyboard?.unlock) {
        navigator.keyboard.unlock();
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  function toggleFullscreen() {
    if (onToggleFullscreen) {
      onToggleFullscreen();
      return;
    }
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const targetEl = containerRef.current || document.documentElement;
    if (!isFs) {
      if (targetEl.requestFullscreen) {
        targetEl.requestFullscreen().then(() => {
          if ('keyboard' in navigator && navigator.keyboard?.lock) {
            navigator.keyboard.lock(['Escape']).catch(() => { });
          }
        }).catch(() => { });
      } else if (targetEl.webkitRequestFullscreen) {
        targetEl.webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if ('keyboard' in navigator && navigator.keyboard?.unlock) {
        navigator.keyboard.unlock();
      }
      if (document.exitFullscreen) document.exitFullscreen().catch(() => { });
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      setIsFullscreen(false);
    }
  }

  function handleCaptureScreenshot() {
    const video = videoRef.current;
    if (!video) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || video.clientWidth || 1920;
      canvas.height = video.videoHeight || video.clientHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (visualFilter.brightness !== 100 || visualFilter.contrast !== 100 || visualFilter.saturation !== 100) {
        ctx.filter = `brightness(${visualFilter.brightness}%) contrast(${visualFilter.contrast}%) saturate(${visualFilter.saturation}%)`;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const cleanName = (title || 'watch_together').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${cleanName}_${Math.floor(video.currentTime || 0)}s.png`;
      a.href = dataUrl;
      a.click();
      triggerCenterAnimation('screenshot');
    } catch (err) {
      console.warn('Screenshot capture error:', err);
    }
  }

  function handleMouseMove() {
    setShowControls(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (isLocked || (localPlaying && !showSettingsMenu && !showSubMenu)) {
      hideControlsTimerRef.current = setTimeout(() => setShowControls(false), isLocked ? 2200 : 3500);
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

  const SUBTITLE_BG_MAP = {
    black: { label: 'Obsidian', hex: '#050507', rgb: '0, 0, 0' },
    charcoal: { label: 'Charcoal', hex: '#1c1c23', rgb: '28, 28, 35' },
    pink: { label: 'Plum Pink', hex: '#2d0f24', rgb: '45, 15, 36' },
    rose: { label: 'Velvet Rose', hex: '#3b0d2a', rgb: '59, 13, 42' },
    sakura: { label: 'Sakura Glass', hex: '#58183e', rgb: '88, 24, 62' },
    berry: { label: 'Deep Berry', hex: '#4c052d', rgb: '76, 5, 45' },
    blush: { label: 'Blush Satin', hex: '#701a46', rgb: '112, 26, 70' },
    purple: { label: 'Midnight Plum', hex: '#190e28', rgb: '25, 14, 40' },
  };

  const SUBTITLE_FONT_MAP = {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    rounded: "'Plus Jakarta Sans', 'Nunito', 'Inter', system-ui, sans-serif",
    serif: "'Georgia', 'Playfair Display', serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  };

  const PINK_SUB_PRESETS = [
    { id: 'sakura-milk', name: 'Sakura Milk', tag: 'Soft Pink', color: '#fdf2f8', bgColor: 'sakura', opacity: 72, blur: 10, font: 'rounded', edge: 'pink-glow', swatch: 'linear-gradient(135deg, #f472b6, #9d174d)' },
    { id: 'velvet-rose', name: 'Velvet Rose', tag: 'Warm Glass', color: '#fbcfe8', bgColor: 'rose', opacity: 78, blur: 8, font: 'sans', edge: 'auto', swatch: 'linear-gradient(135deg, #be185d, #3b0d2a)' },
    { id: 'neon-berry', name: 'Neon Berry', tag: 'Vivid Glow', color: '#ff79c6', bgColor: 'black', opacity: 65, blur: 6, font: 'sans', edge: 'pink-glow', swatch: 'linear-gradient(135deg, #ff79c6, #1f1024)' },
    { id: 'blush-satin', name: 'Blush Satin', tag: 'Sheer Frosted', color: '#f9a8d4', bgColor: 'blush', opacity: 46, blur: 12, font: 'rounded', edge: 'glow', swatch: 'linear-gradient(135deg, #f9a8d4, #701a46)' },
    { id: 'midnight-plum', name: 'Midnight Plum', tag: 'Editorial', color: '#fce7f3', bgColor: 'purple', opacity: 75, blur: 8, font: 'serif', edge: 'auto', swatch: 'linear-gradient(135deg, #c084fc, #190e28)' },
    { id: 'cinema-crisp', name: 'Crystal Ink', tag: 'No Box', color: '#ffffff', bgColor: 'black', opacity: 0, blur: 0, font: 'sans', edge: 'crisp', swatch: 'linear-gradient(135deg, #ffffff 30%, #27272a 100%)' },
  ];

  const handleSubtitleBgColorChange = (id) => {
    setSubtitleBgColor(id);
    localStorage.setItem('wt_sub_bg_color', id);
  };

  const handleSubtitleColorChange = (hex) => {
    setSubtitleColor(hex);
    localStorage.setItem('wt_sub_color', hex);
  };

  const handleSubtitleFontChange = (fontId) => {
    setSubtitleFont(fontId);
    localStorage.setItem('wt_sub_font', fontId);
  };

  const handleSubtitleEdgeChange = (edgeId) => {
    setSubtitleEdge(edgeId);
    localStorage.setItem('wt_sub_edge', edgeId);
  };

  const applySubtitlePreset = (preset) => {
    handleSubtitleColorChange(preset.color);
    handleSubtitleBgColorChange(preset.bgColor);
    setSubtitleBgOpacity(preset.opacity);
    localStorage.setItem('wt_sub_bg_opacity', preset.opacity);
    setSubtitleBgBlur(preset.blur);
    localStorage.setItem('wt_sub_bg_blur', preset.blur);
    handleSubtitleFontChange(preset.font);
    handleSubtitleEdgeChange(preset.edge);
  };

  const resetSubtitleDefaults = () => {
    handleSizeChange(24);
    handleBottomChange(65);
    handleDelayChange(0.0);
    setSubtitleBgOpacity(55);
    localStorage.setItem('wt_sub_bg_opacity', 55);
    setSubtitleBgBlur(6);
    localStorage.setItem('wt_sub_bg_blur', 6);
    handleSubtitleBgColorChange('black');
    handleSubtitleColorChange('#ffffff');
    handleSubtitleFontChange('sans');
    handleSubtitleEdgeChange('auto');
  };

  const getSubtitleCueStyle = (previewScale = 1) => {
    const bgInfo = SUBTITLE_BG_MAP[subtitleBgColor] || SUBTITLE_BG_MAP.black;
    const bgString = subtitleBgOpacity === 0 ? 'transparent' : `rgba(${bgInfo.rgb}, ${subtitleBgOpacity / 100})`;
    const blurPx = Math.max(0, Math.round(subtitleBgBlur * previewScale));
    const blurString = subtitleBgBlur > 0 && subtitleBgOpacity > 0 ? `blur(${blurPx}px)` : 'none';
    const isPinkFrame = ['pink', 'rose', 'sakura', 'berry', 'blush'].includes(subtitleBgColor);
    let textShadow = subtitleBgOpacity < 40
      ? '0 2px 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85), -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000'
      : '0 1px 3px rgba(0,0,0,0.8)';
    if (subtitleEdge === 'crisp') {
      textShadow = '0 2px 4px rgba(0,0,0,0.95), -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000';
    } else if (subtitleEdge === 'glow') {
      textShadow = '0 0 12px rgba(255,255,255,0.45), 0 2px 5px rgba(0,0,0,0.9)';
    } else if (subtitleEdge === 'pink-glow') {
      textShadow = '0 0 12px rgba(244,114,182,0.75), 0 0 4px rgba(236,72,153,0.55), 0 2px 4px rgba(0,0,0,0.9)';
    }
    return {
      display: 'inline-block',
      color: subtitleColor || '#ffffff',
      fontFamily: SUBTITLE_FONT_MAP[subtitleFont] || SUBTITLE_FONT_MAP.sans,
      fontSize: `${Math.max(11, Math.round(subtitleSize * previewScale))}px`,
      fontWeight: 800,
      lineHeight: 1.35,
      padding: subtitleBgOpacity === 0 ? `${Math.round(4 * previewScale)}px ${Math.round(8 * previewScale)}px` : `${Math.round(6 * previewScale)}px ${Math.round(14 * previewScale)}px`,
      borderRadius: subtitleBgOpacity === 0 ? '0' : `${Math.max(6, Math.round(10 * previewScale))}px`,
      background: bgString,
      backdropFilter: blurString,
      WebkitBackdropFilter: blurString,
      border: isPinkFrame && subtitleBgOpacity > 0 ? '1px solid rgba(244, 114, 182, 0.42)' : (subtitleBgColor === 'purple' && subtitleBgOpacity > 0 ? '1px solid rgba(192, 132, 252, 0.35)' : 'none'),
      textShadow,
      whiteSpace: 'pre-wrap',
      letterSpacing: '0.015em',
    };
  };

  const FILM_GRAIN_STOCKS = [
    { id: '70mm', label: '70mm Silk', short: '70mm', tag: 'Ultra Fine', speckle: 0.72, cell: 1, size: 0.85, blend: 'normal', chroma: 'mono', intensity: 30 },
    { id: '35mm', label: '35mm Kodak', short: '35mm', tag: 'Cinema Std', speckle: 0.9, cell: 1, size: 1.0, blend: 'normal', chroma: 'mono', intensity: 40 },
    { id: '16mm', label: '16mm Indie', short: '16mm', tag: 'Organic', speckle: 1.1, cell: 2, size: 1.15, blend: 'normal', chroma: 'mono', intensity: 48 },
    { id: 'heavy', label: '8mm Vintage', short: '8mm', tag: 'Coarse Grit', speckle: 1.35, cell: 2, size: 1.45, blend: 'overlay', chroma: 'color', intensity: 60 },
    { id: 'sakura', label: 'Rosé Halide', short: 'Rosé', tag: 'Pink Tint', speckle: 1.0, cell: 1, size: 1.05, blend: 'normal', chroma: 'color', intensity: 42 },
  ];

  // Universal Canvas PNG Gaussian Silver-Halide Tile (guarantees grain visibility on dark frames & HW video layers)
  const filmGrainTileUrl = useMemo(() => {
    if (typeof document === 'undefined') return '';
    const tileDim = 256;
    const canvas = document.createElement('canvas');
    canvas.width = tileDim;
    canvas.height = tileDim;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const img = ctx.createImageData(tileDim, tileDim);
    const data = img.data;
    const stock = FILM_GRAIN_STOCKS.find((s) => s.id === filmGrainPreset) || FILM_GRAIN_STOCKS[1];
    const cell = stock.cell || 1;
    const isColor = filmGrainChroma === 'color';
    const isRose = filmGrainPreset === 'sakura';

    for (let y = 0; y < tileDim; y += cell) {
      for (let x = 0; x < tileDim; x += cell) {
        // Triangular distribution approximates analog silver-halide grain density without periodicity
        const tri = (Math.random() - Math.random()) * stock.speckle;
        const mag = Math.abs(tri);
        if (mag < 0.08) continue;
        const lum = tri > 0 ? 255 : 0;
        const alpha = Math.min(210, Math.round(mag * 190));

        let r = lum;
        let g = lum;
        let b = lum;
        if (isRose) {
          r = tri > 0 ? 255 : 38;
          g = tri > 0 ? 182 : 10;
          b = tri > 0 ? 220 : 28;
        } else if (isColor) {
          r = Math.max(0, Math.min(255, lum + Math.round((Math.random() - 0.5) * 90)));
          g = Math.max(0, Math.min(255, lum + Math.round((Math.random() - 0.5) * 70)));
          b = Math.max(0, Math.min(255, lum + Math.round((Math.random() - 0.5) * 90)));
        }

        for (let dy = 0; dy < cell && y + dy < tileDim; dy++) {
          for (let dx = 0; dx < cell && x + dx < tileDim; dx++) {
            const idx = ((y + dy) * tileDim + (x + dx)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = alpha;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }, [filmGrainPreset, filmGrainChroma]);

  const handleToggleGrainEnabled = (nextEnabled) => {
    setFilmGrainEnabled(nextEnabled);
    localStorage.setItem('wt_grain_enabled', String(nextEnabled));
  };

  const handleApplyGrainStock = (stock) => {
    setFilmGrainEnabled(true);
    localStorage.setItem('wt_grain_enabled', 'true');
    setFilmGrainPreset(stock.id);
    localStorage.setItem('wt_grain_preset', stock.id);
    setFilmGrainSize(stock.size);
    localStorage.setItem('wt_grain_size', stock.size);
    setFilmGrainBlend(stock.blend);
    localStorage.setItem('wt_grain_blend', stock.blend);
    setFilmGrainChroma(stock.chroma);
    localStorage.setItem('wt_grain_chroma', stock.chroma);
    if (filmGrainIntensity === 0) {
      setFilmGrainIntensity(stock.intensity);
      localStorage.setItem('wt_grain_intensity', stock.intensity);
    }
  };

  const getFilmGrainVisualProps = (previewScale = 1) => {
    const tilePx = Math.max(96, Math.round(256 * filmGrainSize * previewScale));
    const maxOpacity = filmGrainBlend === 'normal' ? 0.34 : 0.68;
    return {
      opacity: filmGrainEnabled ? Math.min(maxOpacity, (filmGrainIntensity / 100) * maxOpacity) : 0,
      mixBlendMode: filmGrainBlend,
      backgroundRepeat: 'repeat',
      backgroundSize: `${tilePx}px ${tilePx}px`,
      backgroundImage: filmGrainTileUrl ? `url("${filmGrainTileUrl}")` : 'none',
      animation: filmGrainEnabled && filmGrainMotion === '24fps' ? 'liveFilmGrainShift 0.25s steps(6) infinite' : 'none',
      transform: 'translateZ(0)',
      willChange: filmGrainEnabled && filmGrainMotion === '24fps' ? 'transform' : 'auto',
    };
  };

  const VISUAL_GRADE_PRESETS = [
    { id: 'standard', label: 'Standard', b: 100, c: 100, s: 100, dot: 'linear-gradient(135deg, #e5e7eb, #6b7280)' },
    { id: 'anime', label: 'Anime Vivid', b: 102, c: 110, s: 125, dot: 'linear-gradient(135deg, #f472b6, #38bdf8)' },
    { id: 'cinema', label: 'Cinema Warm', b: 96, c: 108, s: 105, dot: 'linear-gradient(135deg, #fbbf24, #9a3412)' },
    { id: 'night', label: 'Night Dim', b: 82, c: 95, s: 90, dot: 'linear-gradient(135deg, #6366f1, #1e1b4b)' },
    { id: 'cyberpunk', label: 'Cyber Neon', b: 100, c: 120, s: 140, dot: 'linear-gradient(135deg, #e879f9, #06b6d4)' },
    { id: 'noir', label: 'Noir B&W', b: 95, c: 115, s: 0, dot: 'linear-gradient(135deg, #ffffff, #18181b)' },
  ];

  const handleApplyVisualPreset = (p) => {
    const newFilter = { brightness: p.b, contrast: p.c, saturation: p.s };
    setVisualFilter(newFilter);
    setVisualPreset(p.id);
    localStorage.setItem('wt_visual_filter', JSON.stringify(newFilter));
    localStorage.setItem('wt_visual_preset', p.id);
  };

  const handleAspectChange = (newAspect) => {
    setAspectRatio(newAspect);
    localStorage.setItem('wt_aspect_ratio', newAspect);
  };

  const handleSpeedChange = (newSpeed) => {
    setPlaybackSpeed(newSpeed);
    localStorage.setItem('wt_playback_speed', newSpeed);
  };

  // Always-fresh refs for keyboard shortcuts to avoid stale closures
  const onEnterChatRef = useRef(onEnterChat);
  onEnterChatRef.current = onEnterChat;
  const onToggleChatRef = useRef(onToggleChat);
  onToggleChatRef.current = onToggleChat;
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const showSubMenuRef = useRef(showSubMenu);
  showSubMenuRef.current = showSubMenu;
  const showSettingsMenuRef = useRef(showSettingsMenu);
  showSettingsMenuRef.current = showSettingsMenu;

  // Escape dismisses player popovers; L toggles player controls lock (F / C / V live in TheaterRoom)
  useEffect(() => {
    const isEditableTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.isContentEditable);
    };

    function handleKeyDown(e) {
      if (e.key === 'Escape' && (showSubMenuRef.current || showSettingsMenuRef.current)) {
        e.preventDefault();
        e.stopPropagation();
        setShowSubMenu(false);
        setShowSettingsMenu(false);
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isEditableTarget(document.activeElement) || isEditableTarget(e.target)) return;

      if (e.code === 'KeyL' || e.key?.toLowerCase() === 'l') {
        e.preventDefault();
        e.stopPropagation();
        if (isLockedRef.current) {
          setIsLocked(false);
          setShowLockHint(false);
          setShowControls(true);
        } else {
          setIsLocked(true);
          setShowControls(false);
          setShowSubMenu(false);
          setShowSettingsMenu(false);
          triggerLockHint();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [triggerLockHint]);

  const renderSettingsCoreViews = () => (
    <>
      {settingsSubView === 'root' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px 8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#fce7f3' }}>Playback Settings</span>
            <button type="button" onClick={() => setShowSettingsMenu(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
          </div>
          <div onClick={() => setSettingsSubView('audio')} className="pouf-yt-menu-item"><Volume2 size={15} color="#f472b6" /><span>Audio Track</span><span className="pouf-yt-val">{audioTracks[activeAudioIndex]?.title || (audioTracks.length > 0 ? `Track #${activeAudioIndex + 1}` : 'Stereo AAC')}</span><ChevronRight size={14} style={{ color: '#9ca3af' }} /></div>
          <div onClick={() => setSettingsSubView('speed')} className="pouf-yt-menu-item"><Gauge size={15} color="#f472b6" /><span>Speed</span><span className="pouf-yt-val">{playbackSpeed === 1.0 ? 'Normal' : `${playbackSpeed}x`}</span><ChevronRight size={14} style={{ color: '#9ca3af' }} /></div>
          <div onClick={() => setSettingsSubView('boost')} className="pouf-yt-menu-item"><Sparkles size={15} color="#f472b6" /><span>Volume Boost</span><span className="pouf-yt-val" style={{ color: audioBoost > 100 ? '#fbbf24' : undefined }}>{audioBoost}%</span><ChevronRight size={14} style={{ color: '#9ca3af' }} /></div>
          <div onClick={() => setSettingsSubView('filters')} className="pouf-yt-menu-item"><Sliders size={15} color="#f472b6" /><span>Visual & Grain</span><span className="pouf-yt-val">{visualPreset === 'standard' ? 'Normal' : visualPreset}{filmGrainEnabled ? ' + Grain' : ''}</span><ChevronRight size={14} style={{ color: '#9ca3af' }} /></div>
          <div onClick={() => setSettingsSubView('aspect')} className="pouf-yt-menu-item"><Crop size={15} color="#f472b6" /><span>Aspect Ratio</span><span className="pouf-yt-val">{aspectRatio === 'contain' ? '16:9' : aspectRatio === 'cover' ? 'Zoom' : 'Stretch'}</span><ChevronRight size={14} style={{ color: '#9ca3af' }} /></div>
          <div onClick={() => { handleFixBlackScreen(); setShowSettingsMenu(false); }} className="pouf-yt-menu-item" style={{ marginTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', color: '#f472b6' }} title="Reload stream decoder, unfreeze frame, and kickstart playback"><Sparkles size={15} color="#f472b6" /><span style={{ fontWeight: 700 }}>⚡ Fix Black Screen</span></div>
        </>
      )}
      {settingsSubView === 'audio' && (
        <>
          <button type="button" onClick={() => setSettingsSubView('root')} className="pouf-yt-back-btn"><ChevronLeft size={16} /><span>Audio Stream ({audioTracks.length || 1})</span></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '200px', overflowY: 'auto' }}>
            {audioTracks.length === 0 ? (<div className="pouf-yt-menu-item active"><span>Default Audio (Stereo AAC)</span><Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} /></div>) : (audioTracks.map((t, idx) => { const trackIdx = t.index ?? idx; const isActive = activeAudioIndex === trackIdx; return (
              <div key={trackIdx} onClick={() => onAudioTrackChange?.(trackIdx)} className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || `Track #${idx + 1}`}</span>
                {t.codec && <span style={{ fontSize: '0.60rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', color: '#d1d5db' }}>{t.codec.toUpperCase()}</span>}
                {isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
              </div>
            ); }))}
          </div>
          {audioTracks.length > 1 && !audioStatusData?.allReady && (<button type="button" onClick={handleProcessAllAudio} disabled={isProcessingAudio} style={{ marginTop: '6px', padding: '6px 8px', borderRadius: '6px', background: 'rgba(244, 114, 182, 0.15)', border: '1px solid rgba(244, 114, 182, 0.35)', color: '#fbcfe8', fontSize: '0.68rem', fontWeight: 700, cursor: isProcessingAudio ? 'not-allowed' : 'pointer' }}>{isProcessingAudio ? 'Extracting in background...' : 'Pre-extract All Tracks to AAC'}</button>)}
        </>
      )}
      {settingsSubView === 'speed' && (
        <>
          <button type="button" onClick={() => setSettingsSubView('root')} className="pouf-yt-back-btn"><ChevronLeft size={16} /><span>Playback Speed</span></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((spd) => { const isActive = playbackSpeed === spd; return (<div key={spd} onClick={() => handleSpeedChange(spd)} className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}><span>{spd === 1.0 ? 'Normal (1.0x)' : `${spd}x`}</span>{isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}</div>); })}</div>
        </>
      )}
      {settingsSubView === 'boost' && (
        <>
          <button type="button" onClick={() => setSettingsSubView('root')} className="pouf-yt-back-btn"><ChevronLeft size={16} /><span>Volume Boost (Gain)</span></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{[{ b: 100, label: 'Normal (100%)' }, { b: 125, label: 'Boost 125%' }, { b: 150, label: 'Boost 150%' }, { b: 175, label: 'Boost 175%' }, { b: 200, label: 'Max Boost (200%)' }].map((item) => { const isActive = audioBoost === item.b; return (<div key={item.b} onClick={() => handleAudioBoostChange(item.b)} className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}><span>{item.label}</span>{isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}</div>); })}</div>
        </>
      )}
      {settingsSubView === 'aspect' && (
        <>
          <button type="button" onClick={() => setSettingsSubView('root')} className="pouf-yt-back-btn"><ChevronLeft size={16} /><span>Aspect Ratio</span></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{[{ id: 'contain', label: 'Default Fit (16:9)' }, { id: 'cover', label: 'Cinema Zoom (Cover 21:9)' }, { id: 'fill', label: 'Full Stretch (100% Canvas)' }].map((opt) => { const isActive = aspectRatio === opt.id; return (<div key={opt.id} onClick={() => handleAspectChange(opt.id)} className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}><span>{opt.label}</span>{isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}</div>); })}</div>
        </>
      )}
    </>
  );

  return (
    <div
      ref={containerRef}
      className={`pouf-player-container ${isFullscreen ? 'pouf-fullscreen' : ''} ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => localPlaying && !showSettingsMenu && !showSubMenu && setShowControls(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '340px',
        background: '#000000',
        borderRadius: '0px',
        overflow: 'hidden',
        boxShadow: 'none',
        border: 'none',
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
        onClick={handleVideoClick}
        onDoubleClick={() => {
          if (isLocked) {
            triggerLockHint();
            return;
          }
          toggleFullscreen();
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={handlePlayEvent}
        onPause={handlePauseEvent}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onSeeking={() => setIsBuffering(true)}
        onSeeked={() => setIsBuffering(false)}
        onError={() => {
          setIsBuffering(false);
          setIsPlaybackStalled(true);
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: aspectRatio,
          filter: `brightness(${visualFilter.brightness}%) contrast(${visualFilter.contrast}%) saturate(${visualFilter.saturation}%)`,
          background: '#000000',
          cursor: isLocked ? 'default' : 'pointer'
        }}
      />

      {/* Authentic Live Moving Film Grain Layer (Defaultly Disabled; Canvas PNG Engine) */}
      {filmGrainEnabled && filmGrainIntensity > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            left: '-20%',
            width: '140%',
            height: '140%',
            pointerEvents: 'none',
            zIndex: 9,
            ...getFilmGrainVisualProps(1),
          }}
        />
      )}

      {/* 2. Hidden Secondary Audio Stream for Multi-Track Sync */}
      <audio ref={audioRef} preload="auto" playsInline style={{ display: 'none' }} />

      {/* 3. Ultra-Slim Top Title Overlay (Soft Cinema Vignette Gradient, Minimal Height, Zero Blur Band) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: isChitChatMode ? '0.45rem 4.5rem 0.65rem 1.1rem' : '0.45rem 1.1rem 0.65rem 1.1rem',
          background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0.22) 55%, transparent 100%)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 40,
          opacity: !isLocked && showControls ? 1 : 0,
          transform: !isLocked && showControls ? 'translateY(0)' : 'translateY(-8px)',
          transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
          pointerEvents: !isLocked && showControls ? 'auto' : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', maxWidth: '82%' }}>
          <h2 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff', margin: 0, textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 2px 10px rgba(0,0,0,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title || 'Video Stream'}
          </h2>
          <span style={{ background: 'rgba(244, 114, 182, 0.20)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(244, 114, 182, 0.35)', color: '#f472b6', fontWeight: 700, fontSize: '0.68rem', flexShrink: 0, lineHeight: 1.4 }}>
            Direct Stream
          </span>
        </div>

        {/* Top-Right Badges & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div
            className="pouf-glass-card"
            style={{
              padding: '3px 9px',
              borderRadius: '9999px',
              color: '#fff',
              fontSize: '0.72rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Users size={12} color="#f472b6" />
            <span>{viewerCount}</span>
          </div>
        </div>
      </div>

      {/* Autoplay Audio Muted Banner - Click to Unmute */}
      {needsUnmutePrompt && (
        <div
          onClick={handleUnmuteAudio}
          style={{
            position: 'absolute',
            top: '64px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 65,
            background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.95), rgba(219, 39, 119, 0.95))',
            color: '#ffffff',
            padding: '8px 18px',
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.80rem',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 8px 30px rgba(236, 72, 153, 0.6), 0 0 16px rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(16px)',
            pointerEvents: 'auto'
          }}
          title="Click to unmute"
        >
          <VolumeX size={15} />
          <span>Sound paused by browser — Tap anywhere to unmute!</span>
        </div>
      )}

      {/* Synchronized Seek Barrier HUD (Liquid Glass Ready Gate) */}
      {barrierState?.active && (() => {
        const readyCount = barrierState.readyCount || 0;
        const totalUsers = barrierState.totalUsers || 2;
        const isAllReady = readyCount >= totalUsers;
        const sender = barrierState.sender || 'Syncing';
        const formattedTime = formatTime(barrierState.targetTime);

        return (
          <div className="liquid-glass-barrier-card">
            {/* Liquid Glow Spinner */}
            <div className="liquid-spinner-wrap">
              <div className="liquid-spinner-glow" />
              <div className="liquid-spinner-ring" />
            </div>

            {/* Concise Title & Timestamp */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'rgba(255, 255, 255, 0.95)', letterSpacing: '-0.2px' }}>
                {sender}
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '0.75rem' }}>•</span>
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#ffffff', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.2px' }}>
                {formattedTime}
              </span>
            </div>

            {/* Sleek Liquid Status Pill */}
            <div className={`liquid-status-pill ${isAllReady ? 'ready' : 'syncing'}`}>
              <span className={`liquid-status-dot ${isAllReady ? 'ready' : 'syncing'}`} />
              <span>{readyCount}/{totalUsers} ready</span>
            </div>
          </div>
        );
      })()}

      {/* 4. Subtitle Display Layer with Live Customization */}
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
          <span style={getSubtitleCueStyle(1)}>
            {currentCueText}
          </span>
        </div>
      )}

      {/* 5. Center Play/Pause Burst Animation (Frosted Glass Roundel) */}
      {centerAnimation && !barrierState?.active && (
        <div style={{ position: 'absolute', pointerEvents: 'none', zIndex: 35, animation: 'poufPopIn 0.5s forwards' }}>
          <div
            style={{
              width: '78px',
              height: '78px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(254, 215, 226, 0.92))',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 36px rgba(236,72,153,0.5), 0 0 24px rgba(244,114,182,0.6)',
              border: '2.5px solid #f472b6'
            }}
          >
            {centerAnimation === 'play' ? <ClayPlay size={40} /> : <ClayPause size={40} />}
          </div>
        </div>
      )}

      {/* 5.1. Skip Ripple HUD Feedback (+10s / -10s) */}
      {skipFeedback && (
        <div
          key={skipFeedback.key}
          style={{
            position: 'absolute',
            top: '50%',
            [skipFeedback.direction === 'forward' ? 'right' : 'left']: '14%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            zIndex: 36,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(20, 8, 28, 0.82)',
            backdropFilter: 'blur(20px)',
            padding: '12px 20px',
            borderRadius: '24px',
            border: '1px solid rgba(244, 114, 182, 0.45)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7), 0 0 22px rgba(244, 114, 182, 0.35)',
            animation: 'poufSkipPulse 0.65s cubic-bezier(0.16, 1, 0.3, 1) both'
          }}
        >
          {skipFeedback.direction === 'forward' ? (
            <RotateCw size={24} color="#f472b6" />
          ) : (
            <RotateCcw size={24} color="#f472b6" />
          )}
          <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>
            {skipFeedback.direction === 'forward' ? `+${skipFeedback.delta}s` : `-${skipFeedback.delta}s`}
          </span>
        </div>
      )}

      {/* 5.2. Non-Intrusive Corner Unlock HUD Button (Top-Left corner, never collides) */}
      {isLocked && (
        <div className="pouf-unlock-wrap">
          <div className="pouf-unlock-btn-slot">
            {showLockHint && (
              <React.Fragment key={lockHintTick}>
                <span className="pouf-unlock-ring" aria-hidden="true" />
                <span className="pouf-unlock-ring is-delayed" aria-hidden="true" />
              </React.Fragment>
            )}
            <button
              key={showLockHint ? `nudge-${lockHintTick}` : 'idle'}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsLocked(false);
                setShowLockHint(false);
                setShowControls(true);
              }}
              onMouseEnter={() => setIsHoveringUnlock(true)}
              onMouseLeave={() => setIsHoveringUnlock(false)}
              className={`pouf-unlock-btn ${showLockHint ? 'is-hinting' : (showControls || isHoveringUnlock ? 'is-awake' : 'is-dormant')}`}
              title="Controls Locked — Click or press L to Unlock"
              aria-label="Unlock player controls (L)"
            >
              {isHoveringUnlock ? <Unlock size={17} color="#f472b6" /> : <Lock size={17} color="#fbcfe8" />}
            </button>
          </div>
          {showLockHint && (
            <div key={`hint-${lockHintTick}`} className="pouf-unlock-hint-pill" role="status">
              <span>Player locked · Click lock or press</span>
              <kbd className="pouf-unlock-kbd">L</kbd>
              <span>to unlock</span>
            </div>
          )}
        </div>
      )}

      {/* 6. Minimalist Obsidian Cinema HUD Glass Controls Overlay */}
          <div
            className={`pouf-hud-overlay a4-hud ${!isLocked && showControls ? '' : 'is-hidden'}`}
          >
            <div className="a4-timeline">
              <span className="a4-tcode">{formatTime(playProgress)}</span>
              <div
                id="pouf-progress-track"
                className="a4-track"
                onMouseDown={(e) => {
                  const track = e.currentTarget;
                  if (!track || !videoRef.current || !duration) return;
                  isDraggingScrubberRef.current = true;
                  const rect = track.getBoundingClientRect();
                  const upd = (cx) => {
                    const tt = Math.max(0, Math.min(1, (cx - rect.left) / (rect.width || 1))) * duration;
                    setPlayProgress(tt);
                    return tt;
                  };
                  upd(e.clientX);
                  const onMM = (me) => upd(me.clientX);
                  const onMU = (ue) => {
                    const ft = upd(ue.clientX);
                    isDraggingScrubberRef.current = false;
                    if (videoRef.current) videoRef.current.currentTime = ft;
                    if (shouldUseAudioElement && audioRef.current) audioRef.current.currentTime = ft;
                    if (onSeek) onSeek(ft);
                    window.removeEventListener('mousemove', onMM);
                    window.removeEventListener('mouseup', onMU);
                  };
                  window.addEventListener('mousemove', onMM);
                  window.addEventListener('mouseup', onMU);
                }}
                onMouseMove={(e) => {
                  if (!duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / (rect.width || 1)));
                  setHoverPosition(pos * 100);
                  setHoverTime(pos * duration);
                }}
                onMouseLeave={handleScrubberMouseLeave}
              >
                {hoverTime !== null && (
                  <div className="a4-tip" style={{ left: `${hoverPosition}%` }}>
                    {formatTime(hoverTime)}
                  </div>
                )}
                <div className="a4-rail">
                  <div className="a4-buf" style={{ width: `${duration > 0 ? (bufferedProgress / duration) * 100 : 0}%` }} />
                  <div className="a4-fill" style={{ width: `${duration > 0 ? (playProgress / duration) * 100 : 0}%` }} />
                </div>
                <div className="a4-knob" style={{ left: `${duration > 0 ? (playProgress / duration) * 100 : 0}%` }} />
              </div>
              <span className="a4-tcode" style={{ color: 'rgba(255,228,230,0.75)' }}>{formatTime(duration)}</span>
            </div>

            <div className="a4-deck">
              <div className="a4-left">
                <button type="button" onClick={() => setIsMuted(m => !m)} className="a4-btn" title={isMuted ? 'Unmute' : 'Mute'}>
                  {isMuted || volume === 0 ? <VolumeX size={16} color="#ff2e93" /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => { const val = parseFloat(e.target.value); setVolume(val); setIsMuted(false); localStorage.setItem('wt_player_vol', val); }}
                  style={{ width: '54px', accentColor: '#ff2e93', cursor: 'pointer', height: '3px' }}
                  aria-label="Volume"
                />
                {onForceSyncAll && (
                  <button type="button" onClick={onForceSyncAll} className="a4-pill" title="Sync Everyone">
                    <RefreshCw size={12} color="#f472b6" /><span>Sync</span>
                  </button>
                )}
              </div>

              <div className="a4-center">
                <button type="button" onClick={() => handleSeekRelative(-10)} className="a4-btn" title="Rewind 10s (Left Arrow)"><RotateCcw size={15} /></button>
                <button type="button" onClick={togglePlayPause} className="a4-play" title={localPlaying ? 'Pause (Space)' : 'Play (Space)'}>
                  {localPlaying ? <ClayPause size={19} /> : <ClayPlay size={19} />}
                </button>
                <button type="button" onClick={() => handleSeekRelative(10)} className="a4-btn" title="Fast Forward 10s (Right Arrow)"><RotateCw size={15} /></button>
              </div>

              <div className="a4-right">
                <button
                  type="button"
                  onClick={() => { const speeds = [0.75, 1.0, 1.25, 1.5, 2.0]; handleSpeedChange(speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length]); }}
                  className="a4-pill"
                  title="Cycle Playback Speed"
                >
                  {playbackSpeed === 1.0 ? '1.0x' : `${playbackSpeed}x`}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSubMenu(prev => !prev); setSubsSubView('root'); setShowSettingsMenu(false); }}
                  className={showSubMenu ? 'a4-pill active' : 'a4-pill'}
                  title="Subtitles"
                >
                  <ClaySubtitles size={13} /><span>Subs</span>{activeSubtitleIndex >= 0 && <span className="pouf-active-dot" />}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSettingsMenu(prev => !prev); setSettingsSubView('root'); setShowSubMenu(false); }}
                  className={showSettingsMenu ? 'a4-btn active' : 'a4-btn'}
                  title="Settings (Audio, Speed, Boost, Presets)"
                >
                  <Settings size={15} style={{ transform: showSettingsMenu ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }} />
                </button>
                <div className="a4-utils">
                  <button type="button" onClick={handleTogglePiP} className="a4-btn" title="Picture-in-Picture"><PictureInPicture size={14} /></button>
                  <button type="button" onClick={handleCaptureScreenshot} className="a4-btn" title="Capture Screenshot Frame"><Camera size={14} /></button>
                  <button type="button" onClick={() => { setIsLocked(true); setShowControls(false); setShowSubMenu(false); setShowSettingsMenu(false); triggerLockHint(); }} className="a4-btn" title="Lock Screen Controls (L)"><Lock size={14} /></button>
                </div>
                <button type="button" onClick={toggleFullscreen} className="a4-btn" title="Fullscreen (F)">{isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}</button>
              </div>
            </div>

            {showSubMenu && (
                  <div onClick={(e) => e.stopPropagation()} className="subv1-shell">
                    {subsSubView === 'root' && (
                      <>
                        <div className="subv1-head">
                          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fce7f3' }}>Subtitles (CC)</span>
                          <button type="button" onClick={() => setShowSubMenu(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 2 }}><X size={14} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '165px', overflowY: 'auto' }}>
                          <div onClick={() => onSubtitleChange?.(-1)} className={`pouf-yt-menu-item ${activeSubtitleIndex === -1 ? 'active' : ''}`}>
                            <span>Off</span>{activeSubtitleIndex === -1 && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}
                          </div>
                          {allSubtitles.map((t, idx) => { const isActive = activeSubtitleIndex === idx; return (
                            <div key={idx} onClick={() => onSubtitleChange?.(idx)} className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || `Track ${idx + 1}`}</span>
                              {isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                            </div>
                          ); })}
                        </div>
                        <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '2px 0' }} />
                        <input type="file" ref={fileInputRef} accept=".srt,.vtt" onChange={handleUploadSubtitleFile} style={{ display: 'none' }} />
                        <div onClick={() => fileInputRef.current?.click()} className="pouf-yt-menu-item"><Upload size={14} color="#f472b6" /><span>Upload Subtitle File</span></div>
                        <div onClick={() => setSubsSubView('search')} className="pouf-yt-menu-item"><Sparkles size={14} color="#f472b6" /><span>Search SubDL Online</span><ChevronRight size={14} style={{ marginLeft: 'auto', color: '#9ca3af' }} /></div>
                        <div onClick={() => setSubsSubView('options')} className="pouf-yt-menu-item"><Sliders size={14} color="#f472b6" /><span>Studio Customizer & Sync</span><ChevronRight size={14} style={{ marginLeft: 'auto', color: '#9ca3af' }} /></div>
                      </>
                    )}
                    {subsSubView === 'options' && (
                      <>
                        <div className="subv1-head">
                          <button type="button" onClick={() => setSubsSubView('root')} className="pouf-yt-back-btn" style={{ padding: 0 }}><ChevronLeft size={16} /><span>Subtitle Studio</span></button>
                          <button type="button" onClick={resetSubtitleDefaults} title="Reset All Subtitle Settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'rgba(255,255,255,0.07)', color: '#f9a8d4', borderRadius: 999, padding: '3px 8px', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}>
                            <RotateCcw size={11} /><span>Reset</span>
                          </button>
                        </div>
                        <div className="subv1-stage">
                          <span style={{ ...getSubtitleCueStyle(0.58), maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {currentCueText || 'We stayed till dawn.'}
                          </span>
                        </div>
                        <div className="subv1-tabs">
                          <button type="button" onClick={() => setSubCustomizerTab('presets')} className={`subv1-tab ${subCustomizerTab === 'presets' ? 'is-on' : ''}`}>Pink Moods & Look</button>
                          <button type="button" onClick={() => setSubCustomizerTab('tune')} className={`subv1-tab ${subCustomizerTab === 'tune' ? 'is-on' : ''}`}>Fine Tune & Sync</button>
                        </div>
                        {subCustomizerTab === 'presets' ? (
                          <div className="subv1-scroll">
                            <div className="subv1-preset-grid">
                              {PINK_SUB_PRESETS.map((p) => {
                                const isActive = subtitleBgColor === p.bgColor && subtitleColor.toLowerCase() === p.color.toLowerCase() && subtitleFont === p.font && subtitleEdge === p.edge;
                                return (
                                  <button type="button" key={p.id} onClick={() => applySubtitlePreset(p)} className={`subv1-preset-card ${isActive ? 'is-active' : ''}`}>
                                    <span style={{ width: 22, height: 22, borderRadius: 7, background: p.swatch, flexShrink: 0, border: '1px solid rgba(255,255,255,0.28)' }} />
                                    <span style={{ minWidth: 0 }}>
                                      <span style={{ display: 'block', fontSize: '0.70rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                      <span style={{ display: 'block', fontSize: '0.60rem', color: '#f472b6' }}>{p.tag}</span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: 4 }}>Typeface</div>
                              <div className="subv1-seg-row">
                                {[{ id: 'sans', label: 'Clean' }, { id: 'rounded', label: 'Soft' }, { id: 'serif', label: 'Serif' }, { id: 'mono', label: 'Mono' }].map((f) => (
                                  <button type="button" key={f.id} onClick={() => handleSubtitleFontChange(f.id)} className={`subv1-pill ${subtitleFont === f.id ? 'is-active' : ''}`}>{f.label}</button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: 4 }}>Edge & Glow</div>
                              <div className="subv1-seg-row">
                                {[{ id: 'auto', label: 'Auto' }, { id: 'crisp', label: 'Outline' }, { id: 'glow', label: 'Soft Glow' }, { id: 'pink-glow', label: 'Pink Neon' }].map((edge) => (
                                  <button type="button" key={edge.id} onClick={() => handleSubtitleEdgeChange(edge.id)} className={`subv1-pill ${subtitleEdge === edge.id ? 'is-active' : ''}`}>{edge.label}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="subv1-scroll">
                            <div className="subv1-sl-grid">
                              <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.64rem', fontWeight: 800, color: '#f472b6', marginBottom: 2 }}><span>SIZE</span><span style={{ color: '#fff', fontFamily: 'monospace' }}>{subtitleSize}px</span></div><input type="range" min="14" max="48" step="1" value={subtitleSize} onChange={(e) => handleSizeChange(Number(e.target.value))} style={{ width: '100%', accentColor: '#ec4899', height: 4 }} /></div>
                              <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.64rem', fontWeight: 800, color: '#f472b6', marginBottom: 2 }}><span>HEIGHT</span><span style={{ color: '#fff', fontFamily: 'monospace' }}>{subtitleBottom}px</span></div><input type="range" min="16" max="240" step="4" value={subtitleBottom} onChange={(e) => handleBottomChange(Number(e.target.value))} style={{ width: '100%', accentColor: '#ec4899', height: 4 }} /></div>
                              <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.64rem', fontWeight: 800, color: '#f472b6', marginBottom: 2 }}><span>OPACITY</span><span style={{ color: '#fff', fontFamily: 'monospace' }}>{subtitleBgOpacity}%</span></div><input type="range" min="0" max="100" step="5" value={subtitleBgOpacity} onChange={(e) => { const v = Number(e.target.value); setSubtitleBgOpacity(v); localStorage.setItem('wt_sub_bg_opacity', v); }} style={{ width: '100%', accentColor: '#ec4899', height: 4 }} /></div>
                              <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.64rem', fontWeight: 800, color: '#f472b6', marginBottom: 2 }}><span>BLUR</span><span style={{ color: '#fff', fontFamily: 'monospace' }}>{subtitleBgBlur}px</span></div><input type="range" min="0" max="20" step="1" value={subtitleBgBlur} onChange={(e) => { const v = Number(e.target.value); setSubtitleBgBlur(v); localStorage.setItem('wt_sub_bg_blur', v); }} style={{ width: '100%', accentColor: '#ec4899', height: 4 }} /></div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: 4 }}>Backdrop Tint</div>
                              <div className="subv1-seg-row">
                                {Object.entries(SUBTITLE_BG_MAP).map(([id, info]) => (
                                  <button type="button" key={id} onClick={() => handleSubtitleBgColorChange(id)} style={{ padding: '4px 2px', borderRadius: 7, background: info.hex, border: subtitleBgColor === id ? '1.5px solid #f472b6' : '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.label.split(' ')[0]}</button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: 4 }}>Text Color</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                {['#ffffff', '#fde047', '#fbcfe8', '#f472b6', '#fb7185', '#e879f9', '#38bdf8', '#34d399'].map((c) => (
                                  <button type="button" key={c} onClick={() => handleSubtitleColorChange(c)} style={{ flex: 1, height: 20, borderRadius: 6, background: c, border: subtitleColor.toLowerCase() === c ? '2px solid #fff' : '1px solid rgba(0,0,0,0.4)', cursor: 'pointer' }} />
                                ))}
                                <input type="color" value={subtitleColor} onChange={(e) => handleSubtitleColorChange(e.target.value)} title="Custom Color" style={{ width: 22, height: 22, padding: 0, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer' }} />
                              </div>
                            </div>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.64rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: 4 }}>
                                <span>Sync Offset</span>
                                <span style={{ color: subtitleDelay !== 0 ? '#fbbf24' : '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>{subtitleDelay > 0 ? `+${subtitleDelay.toFixed(1)}s` : `${subtitleDelay.toFixed(1)}s`}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button type="button" onClick={() => handleDelayChange(subtitleDelay - 0.5)} className="pouf-dock-pill-btn" style={{ flex: 1, justifyContent: 'center', padding: '3px 0', fontSize: '0.66rem' }}>-0.5</button>
                                <button type="button" onClick={() => handleDelayChange(subtitleDelay - 0.1)} className="pouf-dock-pill-btn" style={{ flex: 1, justifyContent: 'center', padding: '3px 0', fontSize: '0.66rem' }}>-0.1</button>
                                <button type="button" onClick={() => handleDelayChange(0)} className="pouf-dock-pill-btn" style={{ padding: '3px 7px', fontSize: '0.65rem' }}>0s</button>
                                <button type="button" onClick={() => handleDelayChange(subtitleDelay + 0.1)} className="pouf-dock-pill-btn" style={{ flex: 1, justifyContent: 'center', padding: '3px 0', fontSize: '0.66rem' }}>+0.1</button>
                                <button type="button" onClick={() => handleDelayChange(subtitleDelay + 0.5)} className="pouf-dock-pill-btn" style={{ flex: 1, justifyContent: 'center', padding: '3px 0', fontSize: '0.66rem' }}>+0.5</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {subsSubView === 'search' && (
                      <>
                        <button type="button" onClick={() => setSubsSubView('root')} className="pouf-yt-back-btn"><ChevronLeft size={16} /><span>SubDL Online Search</span></button>
                        <div style={{ display: 'flex', gap: '4px', padding: '2px 4px' }}>
                          <input type="text" value={onlineSearchQuery} onChange={(e) => setOnlineSearchQuery(e.target.value)} placeholder="Search movie/anime..." onKeyDown={(e) => e.key === 'Enter' && handleSearchOnlineSubtitles()} className="pouf-glass-input" style={{ flex: 1, padding: '4px 6px', fontSize: '0.72rem' }} />
                          <button type="button" onClick={() => handleSearchOnlineSubtitles()} disabled={isSearchingOnline} className="pouf-glass-btn-primary" style={{ padding: '4px 8px', fontSize: '0.70rem' }}>{isSearchingOnline ? '...' : <Search size={12} />}</button>
                        </div>
                        <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                          {isSearchingOnline ? (<div style={{ textAlign: 'center', padding: '10px 0', fontSize: '0.70rem', color: '#f472b6' }}>Searching SubDL...</div>) : onlineSearchResults.length > 0 ? (onlineSearchResults.map((sub, sIdx) => (
                            <div key={sIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(244,114,182,0.15)', gap: '6px' }}>
                              <div style={{ overflow: 'hidden', flex: 1, minWidth: 0, fontSize: '0.68rem', color: '#f3f4f6' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{sub.fileName}</div><span style={{ fontSize: '0.60rem', color: '#f472b6' }}>{sub.language}</span></div>
                              <button type="button" onClick={() => handleDownloadOnlineSubtitle(sub)} disabled={isDownloadingOnline} className="pouf-glass-btn-primary" style={{ padding: '3px 6px', fontSize: '0.64rem', flexShrink: 0 }}>{downloadingSubId === sub.fileId ? '...' : 'Get'}</button>
                            </div>
                          ))) : (<div style={{ textAlign: 'center', padding: '10px 0', fontSize: '0.68rem', color: '#9ca3af' }}>Type title and press enter</div>)}
                        </div>
                      </>
                    )}
                  </div>

            )}

            {showSettingsMenu && (
                  <div onClick={(e) => e.stopPropagation()} className="cfgv1-shell">
                    {settingsSubView !== 'filters' ? renderSettingsCoreViews() : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <button type="button" onClick={() => setSettingsSubView('root')} className="pouf-yt-back-btn" style={{ padding: 0 }}><ChevronLeft size={16} /><span>Picture & Grain</span></button>
                          <button type="button" onClick={() => handleToggleGrainEnabled(!filmGrainEnabled)} style={{ border: '1px solid rgba(244,114,182,0.32)', background: filmGrainEnabled ? 'rgba(236,72,153,0.24)' : 'rgba(255,255,255,0.06)', color: filmGrainEnabled ? '#fdf2f8' : '#9ca3af', borderRadius: 999, padding: '2px 8px', fontSize: '0.63rem', fontWeight: 800, cursor: 'pointer' }}>
                            Grain: {filmGrainEnabled ? 'ON' : 'OFF'}
                          </button>
                        </div>
                        <div className="cfgv1-tabs">
                          <button type="button" onClick={() => setFilterLabTab('color')} className={`cfgv1-tab ${filterLabTab === 'color' ? 'is-on' : ''}`}>Color Look</button>
                          <button type="button" onClick={() => setFilterLabTab('grain')} className={`cfgv1-tab ${filterLabTab === 'grain' ? 'is-on' : ''}`}>Film Grain</button>
                        </div>
                        {filterLabTab === 'color' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {VISUAL_GRADE_PRESETS.map((p) => {
                              const isActive = visualPreset === p.id;
                              return (
                                <button type="button" key={p.id} onClick={() => handleApplyVisualPreset(p)} className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`} style={{ border: 'none', width: '100%', textAlign: 'left', background: isActive ? undefined : 'transparent' }}>
                                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.dot, border: '1px solid rgba(255,255,255,0.25)', flexShrink: 0 }} />
                                  <span>{p.label}</span>
                                  {isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div className="cfgv1-swatch">
                              {filmGrainEnabled && (
                                <div style={{ position: 'absolute', inset: '-30%', pointerEvents: 'none', ...getFilmGrainVisualProps(0.45) }} />
                              )}
                              <span style={{ position: 'relative', fontSize: '0.63rem', fontWeight: 700, color: '#fce7f3', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                                {filmGrainEnabled ? `${FILM_GRAIN_STOCKS.find((s) => s.id === filmGrainPreset)?.label || '35mm'} · ${filmGrainIntensity}%` : 'Grain Disabled (Clean Feed)'}
                              </span>
                              <span style={{ position: 'relative', fontSize: '0.60rem', color: '#f9a8d4', fontFamily: 'monospace' }}>
                                {filmGrainEnabled ? (filmGrainBlend === 'normal' ? 'Universal' : filmGrainBlend) : 'OFF'}
                              </span>
                            </div>
                            <div className="cfgv1-stocks">
                              {FILM_GRAIN_STOCKS.map((s) => (
                                <button type="button" key={s.id} onClick={() => handleApplyGrainStock(s)} className={`cfgv1-card ${filmGrainEnabled && filmGrainPreset === s.id ? 'is-on' : ''}`}>
                                  <span style={{ fontSize: '0.67rem', fontWeight: 800 }}>{s.label}</span>
                                  <span style={{ fontSize: '0.57rem', color: '#f472b6' }}>{s.tag}</span>
                                </button>
                              ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.60rem', color: '#f9a8d4', fontWeight: 700, marginBottom: 2 }}><span>Strength</span><span>{filmGrainEnabled ? `${filmGrainIntensity}%` : '0%'}</span></div>
                                <input type="range" min="5" max="100" step="5" value={filmGrainIntensity} onChange={(e) => { const v = Number(e.target.value); handleToggleGrainEnabled(true); setFilmGrainIntensity(v); localStorage.setItem('wt_grain_intensity', v); }} style={{ width: '100%', accentColor: '#ec4899', height: 4 }} />
                              </div>
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.60rem', color: '#f9a8d4', fontWeight: 700, marginBottom: 2 }}><span>Grain Size</span><span>{filmGrainSize.toFixed(1)}x</span></div>
                                <input type="range" min="0.6" max="1.8" step="0.1" value={filmGrainSize} onChange={(e) => { const v = Number(e.target.value); handleToggleGrainEnabled(true); setFilmGrainSize(v); localStorage.setItem('wt_grain_size', v); }} style={{ width: '100%', accentColor: '#ec4899', height: 4 }} />
                              </div>
                            </div>
                            <div className="cfgv1-chips">
                              <button type="button" onClick={() => { const order = ['normal', 'soft-light', 'overlay']; const n = order[(order.indexOf(filmGrainBlend) + 1) % order.length]; handleToggleGrainEnabled(true); setFilmGrainBlend(n); localStorage.setItem('wt_grain_blend', n); }} className={`cfgv1-chip ${filmGrainEnabled && filmGrainBlend === 'normal' ? 'is-on' : ''}`} title="Universal guarantees visibility on black frames & all streams">
                                {filmGrainBlend === 'normal' ? 'Universal' : (filmGrainBlend === 'soft-light' ? 'Soft Light' : 'Overlay')}
                              </button>
                              <button type="button" onClick={() => { const n = filmGrainChroma === 'mono' ? 'color' : 'mono'; handleToggleGrainEnabled(true); setFilmGrainChroma(n); localStorage.setItem('wt_grain_chroma', n); }} className={`cfgv1-chip ${filmGrainEnabled && filmGrainChroma === 'color' ? 'is-on' : ''}`}>
                                {filmGrainChroma === 'mono' ? 'Silver Mono' : 'Color Dye'}
                              </button>
                              <button type="button" onClick={() => { const n = filmGrainMotion === '24fps' ? 'still' : '24fps'; handleToggleGrainEnabled(true); setFilmGrainMotion(n); localStorage.setItem('wt_grain_motion', n); }} className={`cfgv1-chip ${filmGrainEnabled && filmGrainMotion === '24fps' ? 'is-on' : ''}`}>
                                {filmGrainMotion === '24fps' ? '24fps Live' : 'Static'}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

            )}
          </div>

      {/* 8. In-Video Overlays (Floating Instant Chat rendered inside player for Fullscreen visibility) */}
      <div
        className="pouf-invideo-overlay-layer"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 70
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default PoufPlayer;
