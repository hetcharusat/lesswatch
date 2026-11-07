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

  // Live Film Grain Intensity (0% to 100%) and Texture Style ('35mm' | '16mm' | 'heavy')
  const [filmGrainIntensity, setFilmGrainIntensity] = useState(() => {
    const saved = localStorage.getItem('wt_grain_intensity');
    if (saved !== null) return parseInt(saved, 10);
    const legacy = localStorage.getItem('wt_film_grain');
    return (legacy && legacy !== 'off') ? 45 : 0;
  });
  const [filmGrainPreset, setFilmGrainPreset] = useState(() => {
    return localStorage.getItem('wt_grain_preset') || '35mm';
  });

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
    return localStorage.getItem('wt_sub_bg_color') || 'black'; // 'black' | 'pink' | 'purple' | 'charcoal'
  });

  // Audio Boost (100%, 125%, 150%, 200%)
  const [audioBoost, setAudioBoost] = useState(() => {
    return parseInt(localStorage.getItem('wt_audio_boost'), 10) || 100;
  });
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  const sourceNodeRef = useRef(null);

  const triggerLockHint = useCallback(() => {
    setShowLockHint(true);
    if (lockHintTimerRef.current) clearTimeout(lockHintTimerRef.current);
    lockHintTimerRef.current = setTimeout(() => {
      setShowLockHint(false);
    }, 2200);
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
      await fetch(`/api/media/process-audio/${encodeURIComponent(cleanFilename)}`, { method: 'POST' });
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

  // Dual-Track Audio Sync Engine with Fast -ss live start & auto-cache detection
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
        const curTarget = video.currentTime || currentTime || 0;
        const targetSs = Math.floor(curTarget);
        const urlWithSs = `${activeAudioUrl}&ss=${targetSs}`;
        const fullUrl = new URL(urlWithSs, window.location.href).href;
        if (audio.src !== fullUrl) {
          audio.src = urlWithSs;
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
            audioRef.current.play().catch(() => { });
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
        if (!audio.src.includes('&ss=')) {
          audio.currentTime = currentTime;
        } else {
          const targetSs = Math.floor(currentTime);
          audio.src = `${activeAudioUrl}&ss=${targetSs}&cb=${Date.now()}`;
          audio.load();
          if (!video.paused) audio.play().catch(() => {});
        }
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

    // Smooth Dual-Track Sync (natural 4s window: zero rate throttling, 100% smooth GPU video decoding)
    if (shouldUseAudioElement && audio && !video.paused && !audio.paused && !audio.seeking && !video.seeking) {
      if (!audio.src.includes('&ss=')) {
        const drift = Math.abs(audio.currentTime - video.currentTime);
        if (drift > 4.0) {
          audio.currentTime = video.currentTime;
        }
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
    triggerCenterAnimation('play');
    if (shouldUseAudioElement && audioRef.current && audioRef.current.paused) {
      if (!audioRef.current.src.includes('&ss=')) {
        audioRef.current.currentTime = videoRef.current?.currentTime || 0;
      }
      audioRef.current.play().catch(() => { });
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
    if (isLocked) {
      triggerLockHint();
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => { });
      if (shouldUseAudioElement && audioRef.current && audioRef.current.paused) {
        if (!audioRef.current.src.includes('&ss=')) {
          audioRef.current.currentTime = video.currentTime;
        }
        audioRef.current.play().catch(() => { });
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
      if (!audioRef.current.src.includes('&ss=')) {
        audioRef.current.currentTime = newTime;
      } else {
        const targetSs = Math.floor(newTime);
        audioRef.current.src = `${activeAudioUrl}&ss=${targetSs}&cb=${Date.now()}`;
        audioRef.current.load();
        if (!video.paused) audioRef.current.play().catch(() => {});
      }
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
        if (!audioRef.current.src.includes('&ss=')) {
          audioRef.current.currentTime = finalTime;
        } else {
          const targetSs = Math.floor(finalTime);
          audioRef.current.src = `${activeAudioUrl}&ss=${targetSs}&cb=${Date.now()}`;
          audioRef.current.load();
          if (videoRef.current && !videoRef.current.paused) audioRef.current.play().catch(() => {});
        }
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
    if (localPlaying && !showSettingsMenu && !showSubMenu) {
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

  // Keyboard Shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) {
        return;
      }

      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setIsLocked(prev => {
          const next = !prev;
          if (next) triggerLockHint();
          return next;
        });
        return;
      }

      if (isLockedRef.current) {
        triggerLockHint();
        return;
      }

      // Escape closes player popover menus first
      if (e.key === 'Escape') {
        if (showSubMenuRef.current || showSettingsMenuRef.current) {
          e.preventDefault();
          e.stopPropagation();
          setShowSubMenu(false);
          setShowSettingsMenu(false);
          return;
        }
      }

      // Enter triggers floating quick chat if available
      if (e.key === 'Enter') {
        if (onEnterChatRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onEnterChatRef.current();
          return;
        }
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
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleTogglePiP();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        onToggleChatRef.current?.();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        onDoubleClick={toggleFullscreen}
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

      {/* Authentic Live Moving Film Grain Layer with Slider Control */}
      {filmGrainIntensity > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            left: '-20%',
            width: '140%',
            height: '140%',
            pointerEvents: 'none',
            zIndex: 8,
            opacity: (filmGrainIntensity / 100) * 0.42,
            mixBlendMode: 'overlay',
            backgroundRepeat: 'repeat',
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${filmGrainPreset === 'heavy' ? '0.65' : (filmGrainPreset === '16mm' ? '0.80' : '0.95')}' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            animation: 'liveFilmGrainShift 0.35s steps(3) infinite'
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#ffffff', letterSpacing: '-0.2px' }}>
                {sender}
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.40)', fontSize: '0.75rem' }}>•</span>
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#fbcfe8', fontVariantNumeric: 'tabular-nums' }}>
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
          {(() => {
            const bgRgb = subtitleBgColor === 'pink' ? '45, 15, 36' : (subtitleBgColor === 'purple' ? '25, 14, 40' : (subtitleBgColor === 'charcoal' ? '28, 28, 35' : '0, 0, 0'));
            const bgString = subtitleBgOpacity === 0 ? 'transparent' : `rgba(${bgRgb}, ${subtitleBgOpacity / 100})`;
            const blurString = subtitleBgBlur > 0 && subtitleBgOpacity > 0 ? `blur(${subtitleBgBlur}px)` : 'none';

            return (
              <span
                style={{
                  display: 'inline-block',
                  color: subtitleColor || '#ffffff',
                  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  fontSize: `${subtitleSize}px`,
                  fontWeight: 800,
                  lineHeight: 1.35,
                  padding: subtitleBgOpacity === 0 ? '4px 8px' : '6px 14px',
                  borderRadius: subtitleBgOpacity === 0 ? '0' : '10px',
                  background: bgString,
                  backdropFilter: blurString,
                  WebkitBackdropFilter: blurString,
                  border: subtitleBgColor === 'pink' && subtitleBgOpacity > 0 ? '1px solid rgba(244, 114, 182, 0.4)' : 'none',
                  textShadow: subtitleBgOpacity < 40
                    ? '0 2px 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85), -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000'
                    : '0 1px 3px rgba(0,0,0,0.8)',
                  whiteSpace: 'pre-wrap',
                  letterSpacing: '0.015em'
                }}
              >
                {currentCueText}
              </span>
            );
          })()}
        </div>
      )}

      {/* 5. Center Play/Pause Burst Animation (Frosted Glass Roundel) */}
      {centerAnimation && (
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsLocked(false);
            setShowControls(true);
          }}
          onMouseEnter={() => setIsHoveringUnlock(true)}
          onMouseLeave={() => setIsHoveringUnlock(false)}
          title="Controls Locked — Click to Unlock"
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 80,
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: isHoveringUnlock ? 'rgba(236, 72, 153, 0.28)' : 'rgba(15, 10, 22, 0.65)',
            backdropFilter: 'blur(16px)',
            border: isHoveringUnlock ? '1.5px solid var(--pink-primary)' : '1px solid rgba(255, 255, 255, 0.12)',
            color: isHoveringUnlock ? '#ffffff' : '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: isHoveringUnlock ? 1 : 0.80,
            boxShadow: isHoveringUnlock ? '0 0 16px rgba(236, 72, 153, 0.6)' : 'none',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: 'auto'
          }}
        >
          {isHoveringUnlock ? <Unlock size={17} color="#f472b6" /> : <Lock size={17} color="#fbcfe8" />}
        </button>
      )}

      {/* 6. Minimalist Obsidian Cinema HUD Glass Controls Overlay */}
      <div
        className="pouf-hud-overlay"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '0 24px 24px 24px',
          background: 'linear-gradient(to top, rgba(8, 8, 12, 0.65) 0%, rgba(8, 8, 12, 0.15) 50%, transparent 100%)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          opacity: !isLocked && showControls ? 1 : 0,
          transform: !isLocked && showControls ? 'translateY(0)' : 'translateY(16px)',
          transition: 'all 0.28s cubic-bezier(0.16,1,0.3,1)',
          pointerEvents: !isLocked && showControls ? 'auto' : 'none'
        }}
      >
        {/* Floating Precision Scrubber Bar */}
        <div
          id="pouf-progress-track"
          onMouseDown={handleScrubberMouseDown}
          onMouseMove={handleScrubberMouseMove}
          onMouseLeave={handleScrubberMouseLeave}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '860px',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer'
          }}
        >
          {/* Hover Time Tooltip */}
          {hoverTime !== null && (
            <div
              className="pouf-glass-card"
              style={{
                position: 'absolute',
                left: `${hoverPosition}%`,
                bottom: '24px',
                transform: 'translateX(-50%)',
                color: '#ffe4e6',
                background: 'rgba(14, 15, 23, 0.92)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 46, 147, 0.4)',
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                pointerEvents: 'none',
                boxShadow: '0 6px 20px rgba(0,0,0,0.8), 0 0 12px rgba(255,46,147,0.35)',
                whiteSpace: 'nowrap'
              }}
            >
              {formatTime(hoverTime)}
            </div>
          )}

          {/* Rail Track */}
          <div
            className="pouf-progress-rail"
            style={{
              width: '100%',
              height: '4px',
              borderRadius: '9999px',
              position: 'relative',
              overflow: 'hidden',
              background: 'rgba(255, 228, 230, 0.16)'
            }}
          >
            {/* Buffer progress bar */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${duration > 0 ? (bufferedProgress / duration) * 100 : 0}%`,
                background: 'rgba(255, 110, 167, 0.30)',
                borderRadius: '9999px'
              }}
            />
            {/* Play progress bar */}
            <div
              className="pouf-progress-fill"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${duration > 0 ? (playProgress / duration) * 100 : 0}%`,
                background: 'linear-gradient(90deg, #f43f5e 0%, #ff2e93 60%, #ec4899 100%)',
                boxShadow: '0 0 12px rgba(255, 46, 147, 0.7)',
                borderRadius: '9999px'
              }}
            />
          </div>

          {/* Scrubber Knob */}
          <div
            className="pouf-scrubber-knob"
            style={{
              position: 'absolute',
              left: `${duration > 0 ? (playProgress / duration) * 100 : 0}%`,
              transform: 'translateX(-50%)',
              width: '13px',
              height: '13px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '2px solid #ff2e93',
              boxShadow: '0 0 12px #ff2e93, 0 2px 6px rgba(0,0,0,0.5)',
              pointerEvents: 'none'
            }}
          />
        </div>

        {/* Floating Luxury Glass Pill Dock */}
        <div
          className="pouf-glass-pill-dock"
          style={{
            width: '100%',
            maxWidth: '860px',
            background: 'rgba(14, 15, 23, 0.76)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            border: '1px solid rgba(255, 110, 167, 0.28)',
            borderRadius: '9999px',
            padding: '7px 20px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 25px rgba(255, 46, 147, 0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          {/* Left Cluster: Volume & Timestamps */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setIsMuted(m => !m)}
                className="pouf-dock-icon-btn"
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted || volume === 0 ? <VolumeX size={17} color="#ff2e93" /> : <Volume2 size={17} color="#ffe4e6" />}
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
                className="pouf-vol-slider"
                style={{
                  width: '56px',
                  accentColor: '#ff2e93',
                  cursor: 'pointer',
                  height: '3px'
                }}
              />
            </div>

            <div style={{ width: '1px', height: '14px', background: 'rgba(255, 228, 230, 0.15)' }} />

            {/* Timestamps */}
            <div
              style={{
                color: '#ffe4e6',
                fontWeight: 600,
                fontSize: '0.78rem',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.3px',
                whiteSpace: 'nowrap'
              }}
            >
              <span>{formatTime(playProgress)}</span>
              <span style={{ color: 'rgba(255, 228, 230, 0.45)', margin: '0 5px' }}>/</span>
              <span style={{ color: 'rgba(255, 228, 230, 0.70)' }}>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Center Cluster: Playback Action Hero */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* -10s Rewind */}
            <button
              onClick={() => handleSeekRelative(-10)}
              className="pouf-dock-icon-btn"
              title="Rewind 10s (Left Arrow)"
            >
              <RotateCcw size={15} color="#ffe4e6" />
            </button>

            {/* Center Hero Play/Pause Button */}
            <button
              onClick={togglePlayPause}
              className="pouf-hero-play-btn"
              title={localPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {localPlaying ? <ClayPause size={20} /> : <ClayPlay size={20} />}
            </button>

            {/* +10s Forward */}
            <button
              onClick={() => handleSeekRelative(10)}
              className="pouf-dock-icon-btn"
              title="Fast Forward 10s (Right Arrow)"
            >
              <RotateCw size={15} color="#ffe4e6" />
            </button>
          </div>

          {/* Right Cluster: Speed, Subs Pill, Settings, Fullscreen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Playback Speed Pill */}
            <button
              onClick={() => {
                const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
                const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                handleSpeedChange(speeds[nextIdx]);
              }}
              className="pouf-dock-pill-btn"
              title="Cycle Playback Speed"
            >
              {playbackSpeed === 1.0 ? '1.0x' : `${playbackSpeed}x`}
            </button>

            {/* Dedicated Subs Pill (Translucent Glass Pill with glowing indicator) */}
            <button
              onClick={() => {
                setShowSubMenu(prev => !prev);
                setSubsSubView('root');
                setShowSettingsMenu(false);
              }}
              className={showSubMenu ? 'pouf-dock-pill-btn active' : 'pouf-dock-pill-btn'}
              title="Subtitles"
            >
              <ClaySubtitles size={14} />
              <span>Subs</span>
              {activeSubtitleIndex >= 0 && (
                <span className="pouf-active-dot" />
              )}
            </button>

            {/* Settings Gear */}
            <button
              onClick={() => {
                setShowSettingsMenu(prev => !prev);
                setSettingsSubView('root');
                setShowSubMenu(false);
              }}
              className={showSettingsMenu ? 'pouf-dock-icon-btn active' : 'pouf-dock-icon-btn'}
              title="Settings (Audio, Speed, Boost, Presets)"
            >
              <Settings
                size={16}
                style={{
                  transform: showSettingsMenu ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: 'transform 0.3s ease'
                }}
              />
            </button>

            {/* Picture-in-Picture */}
            <button
              onClick={handleTogglePiP}
              className="pouf-dock-icon-btn"
              title="Picture-in-Picture (P)"
            >
              <PictureInPicture size={15} color="#ffe4e6" />
            </button>

            {/* Instant Screenshot Snapshot */}
            <button
              onClick={handleCaptureScreenshot}
              className="pouf-dock-icon-btn"
              title="Capture Screenshot Frame"
            >
              <Camera size={15} color="#ffe4e6" />
            </button>

            {/* Lock Screen Controls */}
            <button
              onClick={() => {
                setIsLocked(true);
                setShowControls(false);
                triggerLockHint();
              }}
              className="pouf-dock-icon-btn"
              title="Lock Screen Controls (L)"
            >
              <Lock size={15} color="#ffe4e6" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="pouf-dock-icon-btn"
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 7. COMPACT YOUTUBE-STYLE SUBTITLES POPOVER                         */}
        {/* ------------------------------------------------------------------ */}
        {showSubMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="pouf-popover-shell"
            style={{
              position: 'absolute',
              bottom: '62px',
              right: '54px',
              width: '260px',
              maxHeight: '380px',
              padding: '8px',
              zIndex: 75,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              overflowY: 'auto'
            }}
          >
            {subsSubView === 'root' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px 8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#fce7f3' }}>
                    Subtitles (CC)
                  </span>
                  <button
                    onClick={() => setShowSubMenu(false)}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '160px', overflowY: 'auto', marginTop: '2px' }}>
                  <div
                    onClick={() => onSubtitleChange?.(-1)}
                    className={`pouf-yt-menu-item ${activeSubtitleIndex === -1 ? 'active' : ''}`}
                  >
                    <span>Off</span>
                    {activeSubtitleIndex === -1 && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}
                  </div>

                  {allSubtitles.map((t, idx) => {
                    const isActive = activeSubtitleIndex === idx;
                    return (
                      <div
                        key={idx}
                        onClick={() => onSubtitleChange?.(idx)}
                        className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.title || `Track ${idx + 1}`}
                        </span>
                        {isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                </div>

                <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".srt,.vtt"
                  onChange={handleUploadSubtitleFile}
                  style={{ display: 'none' }}
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="pouf-yt-menu-item"
                >
                  <Upload size={14} color="#f472b6" />
                  <span>Upload Subtitle File</span>
                </div>

                <div
                  onClick={() => setSubsSubView('search')}
                  className="pouf-yt-menu-item"
                >
                  <Sparkles size={14} color="#f472b6" />
                  <span>Search SubDL Online</span>
                  <ChevronRight size={14} style={{ marginLeft: 'auto', color: '#9ca3af' }} />
                </div>

                <div
                  onClick={() => setSubsSubView('options')}
                  className="pouf-yt-menu-item"
                >
                  <Sliders size={14} color="#f472b6" />
                  <span>Options & Delay Sync</span>
                  <ChevronRight size={14} style={{ marginLeft: 'auto', color: '#9ca3af' }} />
                </div>
              </>
            )}

            {subsSubView === 'options' && (
              <>
                <button
                  onClick={() => setSubsSubView('root')}
                  className="pouf-yt-back-btn"
                >
                  <ChevronLeft size={16} />
                  <span>Subtitle Customizer</span>
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', padding: '4px 2px', maxHeight: '310px', overflowY: 'auto' }}>
                  {/* Font Size Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: '3px' }}>
                      <span>Size</span>
                      <span style={{ color: '#fff', fontFamily: 'monospace' }}>{subtitleSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="14"
                      max="48"
                      step="1"
                      value={subtitleSize}
                      onChange={(e) => handleSizeChange(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#ec4899', height: '4px', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Position Height Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: '3px' }}>
                      <span>Height from Bottom</span>
                      <span style={{ color: '#fff', fontFamily: 'monospace' }}>{subtitleBottom}px</span>
                    </div>
                    <input
                      type="range"
                      min="16"
                      max="240"
                      step="4"
                      value={subtitleBottom}
                      onChange={(e) => handleBottomChange(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#ec4899', height: '4px', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Background Opacity Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: '3px' }}>
                      <span>Background Opacity</span>
                      <span style={{ color: '#fff', fontFamily: 'monospace' }}>{subtitleBgOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={subtitleBgOpacity}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSubtitleBgOpacity(val);
                        localStorage.setItem('wt_sub_bg_opacity', val);
                      }}
                      style={{ width: '100%', accentColor: '#ec4899', height: '4px', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Background Blur Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: '3px' }}>
                      <span>Background Blur</span>
                      <span style={{ color: '#fff', fontFamily: 'monospace' }}>{subtitleBgBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={subtitleBgBlur}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSubtitleBgBlur(val);
                        localStorage.setItem('wt_sub_bg_blur', val);
                      }}
                      style={{ width: '100%', accentColor: '#ec4899', height: '4px', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Background Color Swatches */}
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Background Color
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                      {[
                        { id: 'black', label: 'Black', bg: '#000000' },
                        { id: 'charcoal', label: 'Charcoal', bg: '#1c1c23' },
                        { id: 'pink', label: 'Pink', bg: '#2d0f24' },
                        { id: 'purple', label: 'Purple', bg: '#190e28' }
                      ].map((bg) => (
                        <button
                          key={bg.id}
                          onClick={() => {
                            setSubtitleBgColor(bg.id);
                            localStorage.setItem('wt_sub_bg_color', bg.id);
                          }}
                          style={{
                            padding: '4px 0',
                            borderRadius: '6px',
                            background: bg.bg,
                            border: subtitleBgColor === bg.id ? '1.5px solid var(--pink-primary)' : '1px solid rgba(255,255,255,0.12)',
                            color: '#fff',
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {bg.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subtitle Text Color Swatches */}
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Text Color
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[
                        { color: '#ffffff', label: 'White' },
                        { color: '#fde047', label: 'Yellow' },
                        { color: '#38bdf8', label: 'Cyan' },
                        { color: '#f472b6', label: 'Pink' },
                        { color: '#34d399', label: 'Mint' }
                      ].map((c) => (
                        <button
                          key={c.color}
                          onClick={() => {
                            setSubtitleColor(c.color);
                            localStorage.setItem('wt_sub_color', c.color);
                          }}
                          style={{
                            flex: 1,
                            height: '22px',
                            borderRadius: '6px',
                            background: c.color,
                            border: subtitleColor === c.color ? '2px solid #fff' : '1px solid rgba(0,0,0,0.4)',
                            boxShadow: subtitleColor === c.color ? '0 0 10px rgba(255,255,255,0.6)' : 'none',
                            cursor: 'pointer'
                          }}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Delay Offset */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: '4px' }}>
                      <span>Sync Delay</span>
                      <span style={{ color: subtitleDelay !== 0 ? '#fbbf24' : '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>
                        {subtitleDelay > 0 ? `+${subtitleDelay.toFixed(1)}s` : `${subtitleDelay.toFixed(1)}s`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => handleDelayChange(subtitleDelay - 0.5)}
                        className="pouf-dock-pill-btn"
                        style={{ flex: 1, justifyContent: 'center', padding: '3px 0', fontSize: '0.70rem' }}
                      >
                        -0.5s
                      </button>
                      <button
                        onClick={() => handleDelayChange(0.0)}
                        className="pouf-dock-pill-btn"
                        style={{ padding: '3px 8px', fontSize: '0.68rem' }}
                      >
                        Reset
                      </button>
                      <button
                        onClick={() => handleDelayChange(subtitleDelay + 0.5)}
                        className="pouf-dock-pill-btn"
                        style={{ flex: 1, justifyContent: 'center', padding: '3px 0', fontSize: '0.70rem' }}
                      >
                        +0.5s
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {subsSubView === 'search' && (
              <>
                <button
                  onClick={() => setSubsSubView('root')}
                  className="pouf-yt-back-btn"
                >
                  <ChevronLeft size={16} />
                  <span>SubDL Online Search</span>
                </button>

                <div style={{ display: 'flex', gap: '4px', padding: '2px 4px' }}>
                  <input
                    type="text"
                    value={onlineSearchQuery}
                    onChange={(e) => setOnlineSearchQuery(e.target.value)}
                    placeholder="Search movie/anime..."
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchOnlineSubtitles()}
                    className="pouf-glass-input"
                    style={{ flex: 1, padding: '4px 6px', fontSize: '0.72rem' }}
                  />
                  <button
                    onClick={() => handleSearchOnlineSubtitles()}
                    disabled={isSearchingOnline}
                    className="pouf-glass-btn-primary"
                    style={{ padding: '4px 8px', fontSize: '0.70rem' }}
                  >
                    {isSearchingOnline ? '...' : <Search size={12} />}
                  </button>
                </div>

                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                  {isSearchingOnline ? (
                    <div style={{ textAlign: 'center', padding: '10px 0', fontSize: '0.70rem', color: '#f472b6' }}>
                      Searching SubDL...
                    </div>
                  ) : onlineSearchResults.length > 0 ? (
                    onlineSearchResults.map((sub, sIdx) => (
                      <div
                        key={sIdx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 6px',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(244,114,182,0.15)',
                          gap: '6px'
                        }}
                      >
                        <div style={{ overflow: 'hidden', flex: 1, minWidth: 0, fontSize: '0.68rem', color: '#f3f4f6' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
                            {sub.fileName}
                          </div>
                          <span style={{ fontSize: '0.60rem', color: '#f472b6' }}>{sub.language}</span>
                        </div>
                        <button
                          onClick={() => handleDownloadOnlineSubtitle(sub)}
                          disabled={isDownloadingOnline}
                          className="pouf-glass-btn-primary"
                          style={{ padding: '3px 6px', fontSize: '0.64rem', flexShrink: 0 }}
                        >
                          {downloadingSubId === sub.fileId ? '...' : 'Get'}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '10px 0', fontSize: '0.68rem', color: '#9ca3af' }}>
                      Type title and press enter
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 8. COMPACT YOUTUBE-STYLE SETTINGS POPOVER (Audio, Speed, Boost, etc.) */}
        {/* ------------------------------------------------------------------ */}
        {showSettingsMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="pouf-popover-shell"
            style={{
              position: 'absolute',
              bottom: '62px',
              right: '18px',
              width: '250px',
              maxHeight: '380px',
              padding: '8px',
              zIndex: 75,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              overflowY: 'auto'
            }}
          >
            {settingsSubView === 'root' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px 8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#fce7f3' }}>
                    Playback Settings
                  </span>
                  <button
                    onClick={() => setShowSettingsMenu(false)}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Audio Track Row */}
                <div
                  onClick={() => setSettingsSubView('audio')}
                  className="pouf-yt-menu-item"
                >
                  <Volume2 size={15} color="#f472b6" />
                  <span>Audio Track</span>
                  <span className="pouf-yt-val">
                    {audioTracks[activeAudioIndex]?.title || (audioTracks.length > 0 ? `Track #${activeAudioIndex + 1}` : 'Stereo AAC')}
                  </span>
                  <ChevronRight size={14} style={{ color: '#9ca3af' }} />
                </div>

                {/* Speed Row */}
                <div
                  onClick={() => setSettingsSubView('speed')}
                  className="pouf-yt-menu-item"
                >
                  <Gauge size={15} color="#f472b6" />
                  <span>Speed</span>
                  <span className="pouf-yt-val">
                    {playbackSpeed === 1.0 ? 'Normal' : `${playbackSpeed}x`}
                  </span>
                  <ChevronRight size={14} style={{ color: '#9ca3af' }} />
                </div>

                {/* Audio Boost Row */}
                <div
                  onClick={() => setSettingsSubView('boost')}
                  className="pouf-yt-menu-item"
                >
                  <Sparkles size={15} color="#f472b6" />
                  <span>Volume Boost</span>
                  <span className="pouf-yt-val" style={{ color: audioBoost > 100 ? '#fbbf24' : undefined }}>
                    {audioBoost}%
                  </span>
                  <ChevronRight size={14} style={{ color: '#9ca3af' }} />
                </div>

                {/* Visual Presets Row */}
                <div
                  onClick={() => setSettingsSubView('filters')}
                  className="pouf-yt-menu-item"
                >
                  <Sliders size={15} color="#f472b6" />
                  <span>Visual Presets</span>
                  <span className="pouf-yt-val">
                    {visualPreset === 'standard' ? 'Normal' : visualPreset}
                  </span>
                  <ChevronRight size={14} style={{ color: '#9ca3af' }} />
                </div>

                {/* Aspect Ratio Row */}
                <div
                  onClick={() => setSettingsSubView('aspect')}
                  className="pouf-yt-menu-item"
                >
                  <Crop size={15} color="#f472b6" />
                  <span>Aspect Ratio</span>
                  <span className="pouf-yt-val">
                    {aspectRatio === 'contain' ? '16:9' : aspectRatio === 'cover' ? 'Zoom' : 'Stretch'}
                  </span>
                  <ChevronRight size={14} style={{ color: '#9ca3af' }} />
                </div>

                {/* Quick Stream Fix / Kickstart */}
                <div
                  onClick={() => {
                    handleFixBlackScreen();
                    setShowSettingsMenu(false);
                  }}
                  className="pouf-yt-menu-item"
                  style={{ marginTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', color: '#f472b6' }}
                  title="Reload stream decoder, unfreeze frame, and kickstart playback"
                >
                  <Sparkles size={15} color="#f472b6" />
                  <span style={{ fontWeight: 700 }}>⚡ Fix Black Screen</span>
                </div>
              </>
            )}

            {settingsSubView === 'audio' && (
              <>
                <button
                  onClick={() => setSettingsSubView('root')}
                  className="pouf-yt-back-btn"
                >
                  <ChevronLeft size={16} />
                  <span>Audio Stream ({audioTracks.length || 1})</span>
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '200px', overflowY: 'auto' }}>
                  {audioTracks.length === 0 ? (
                    <div className="pouf-yt-menu-item active">
                      <span>Default Audio (Stereo AAC)</span>
                      <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />
                    </div>
                  ) : (
                    audioTracks.map((t, idx) => {
                      const trackIdx = t.index ?? idx;
                      const isActive = activeAudioIndex === trackIdx;
                      return (
                        <div
                          key={trackIdx}
                          onClick={() => onAudioTrackChange?.(trackIdx)}
                          className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.title || `Track #${idx + 1}`}
                          </span>
                          {t.codec && (
                            <span style={{ fontSize: '0.60rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', color: '#d1d5db' }}>
                              {t.codec.toUpperCase()}
                            </span>
                          )}
                          {isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                        </div>
                      );
                    })
                  )}
                </div>

                {audioTracks.length > 1 && !audioStatusData?.allReady && (
                  <button
                    onClick={handleProcessAllAudio}
                    disabled={isProcessingAudio}
                    style={{
                      marginTop: '6px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(244, 114, 182, 0.15)',
                      border: '1px solid rgba(244, 114, 182, 0.35)',
                      color: '#fbcfe8',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: isProcessingAudio ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isProcessingAudio ? 'Extracting in background...' : 'Pre-extract All Tracks to AAC'}
                  </button>
                )}
              </>
            )}

            {settingsSubView === 'speed' && (
              <>
                <button
                  onClick={() => setSettingsSubView('root')}
                  className="pouf-yt-back-btn"
                >
                  <ChevronLeft size={16} />
                  <span>Playback Speed</span>
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((spd) => {
                    const isActive = playbackSpeed === spd;
                    return (
                      <div
                        key={spd}
                        onClick={() => handleSpeedChange(spd)}
                        className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}
                      >
                        <span>{spd === 1.0 ? 'Normal (1.0x)' : `${spd}x`}</span>
                        {isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {settingsSubView === 'boost' && (
              <>
                <button
                  onClick={() => setSettingsSubView('root')}
                  className="pouf-yt-back-btn"
                >
                  <ChevronLeft size={16} />
                  <span>Volume Boost (Gain)</span>
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {[
                    { b: 100, label: 'Normal (100%)' },
                    { b: 125, label: 'Boost 125%' },
                    { b: 150, label: 'Boost 150%' },
                    { b: 175, label: 'Boost 175%' },
                    { b: 200, label: 'Max Boost (200%)' }
                  ].map((item) => {
                    const isActive = audioBoost === item.b;
                    return (
                      <div
                        key={item.b}
                        onClick={() => handleAudioBoostChange(item.b)}
                        className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}
                      >
                        <span>{item.label}</span>
                        {isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {settingsSubView === 'filters' && (
              <>
                <button
                  onClick={() => setSettingsSubView('root')}
                  className="pouf-yt-back-btn"
                >
                  <ChevronLeft size={16} />
                  <span>Visual Presets</span>
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {[
                    { id: 'standard', label: 'Standard (Default)', b: 100, c: 100, s: 100 },
                    { id: 'anime', label: 'Anime Vivid', b: 102, c: 110, s: 125 },
                    { id: 'cinema', label: 'Cinema Warm', b: 96, c: 108, s: 105 },
                    { id: 'night', label: 'Night Dim', b: 82, c: 95, s: 90 },
                    { id: 'cyberpunk', label: 'Cyberpunk Neon', b: 100, c: 120, s: 140 },
                    { id: 'noir', label: 'Noir (Black & White)', b: 95, c: 115, s: 0 }
                  ].map((p) => {
                    const isActive = visualPreset === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          const newFilter = { brightness: p.b, contrast: p.c, saturation: p.s };
                          setVisualFilter(newFilter);
                          setVisualPreset(p.id);
                          localStorage.setItem('wt_visual_filter', JSON.stringify(newFilter));
                          localStorage.setItem('wt_visual_preset', p.id);
                        }}
                        className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}
                      >
                        <span>{p.label}</span>
                        {isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}
                      </div>
                    );
                  })}
                </div>

                {/* Live Film Grain Controls */}
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Live Film Grain
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: filmGrainIntensity > 0 ? '#34d399' : '#9ca3af', fontFamily: 'monospace' }}>
                      {filmGrainIntensity === 0 ? 'Off (0%)' : `${filmGrainIntensity}%`}
                    </span>
                  </div>

                  {/* Live Grain Slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={filmGrainIntensity}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setFilmGrainIntensity(val);
                        localStorage.setItem('wt_grain_intensity', val);
                      }}
                      style={{ flex: 1, accentColor: '#ec4899', height: '4px', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Grain Grain Texture Styles */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                    {[
                      { id: '35mm', label: '35mm Fine' },
                      { id: '16mm', label: '16mm Indie' },
                      { id: 'heavy', label: 'Vintage Grit' }
                    ].map((g) => {
                      const isActive = filmGrainPreset === g.id && filmGrainIntensity > 0;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setFilmGrainPreset(g.id);
                            localStorage.setItem('wt_grain_preset', g.id);
                            if (filmGrainIntensity === 0) {
                              setFilmGrainIntensity(40);
                              localStorage.setItem('wt_grain_intensity', 40);
                            }
                          }}
                          className={`pouf-dock-pill-btn ${isActive ? 'active' : ''}`}
                          style={{ padding: '4px 0', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700 }}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {settingsSubView === 'aspect' && (
              <>
                <button
                  onClick={() => setSettingsSubView('root')}
                  className="pouf-yt-back-btn"
                >
                  <ChevronLeft size={16} />
                  <span>Aspect Ratio</span>
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {[
                    { id: 'contain', label: 'Default Fit (16:9)' },
                    { id: 'cover', label: 'Cinema Zoom (Cover 21:9)' },
                    { id: 'fill', label: 'Full Stretch (100% Canvas)' }
                  ].map((opt) => {
                    const isActive = aspectRatio === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => handleAspectChange(opt.id)}
                        className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}
                      >
                        <span>{opt.label}</span>
                        {isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}
                      </div>
                    );
                  })}
                </div>
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
