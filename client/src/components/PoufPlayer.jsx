import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GlassSurface } from './GlassSurface';
import { SeekTimeline } from './SeekTimeline';
import { FilmGrain } from './FilmGrain';
import { PlayerMenu, PlayerSlider } from './PlayerMenu';
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
  Camera,
  Video,
  VideoOff
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
  getPlaybackState,
  onPlay,
  onPause,
  onEnded,
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
  isCameraEnabled = false,
  onToggleCamera,
  className = '',
  style = {},
  children
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const latestPlaybackRef = useRef(null);
  latestPlaybackRef.current = { isPlaying, currentTime, getPlaybackState };
  const sourceVersionRef = useRef(0);
  const decoderRetryRef = useRef(false);
  const recoveryTimerRef = useRef(null);
  const [playbackError, setPlaybackError] = useState('');
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
    return localStorage.getItem('wt_grain_blend') === 'overlay' ? 'overlay' : 'soft-light';
  });
  const [filmGrainChroma, setFilmGrainChroma] = useState(() => {
    return localStorage.getItem('wt_grain_chroma') || 'mono';
  });
  const [filterLabTab, setFilterLabTab] = useState('color');

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
  const [onlineSearchError, setOnlineSearchError] = useState('');
  const [onlineSearchDone, setOnlineSearchDone] = useState(false);
  const [onlineSearchLanguage, setOnlineSearchLanguage] = useState('EN');
  const onlineSearchAbort = useRef(null);
  const subtitleDownloadAbort = useRef(null);
  useEffect(() => () => { onlineSearchAbort.current?.abort(); subtitleDownloadAbort.current?.abort(); }, []);
  useEffect(() => {
    onlineSearchAbort.current?.abort(); subtitleDownloadAbort.current?.abort();
    setOnlineSearchResults([]); setOnlineSearchDone(false); setOnlineSearchError('');
    setIsSearchingOnline(false); setIsDownloadingOnline(false); setDownloadingSubId(null);
  }, [url]);
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

  // Only autoplay policy failures benefit from muting. Aborted loads and codec
  // errors must not turn into competing play attempts on a replacement source.
  const safePlayVideo = useCallback(async () => {
    const video = videoRef.current;
    const version = sourceVersionRef.current;
    if (!video || !latestPlaybackRef.current?.isPlaying || video.error) return;
    try {
      await video.play();
      if (version !== sourceVersionRef.current) return;
      setNeedsUnmutePrompt(false);
      setIsPlaybackStalled(false);
    } catch (err) {
      if (version !== sourceVersionRef.current || !latestPlaybackRef.current?.isPlaying || err?.name === 'AbortError') return;
      if (err?.name !== 'NotAllowedError') {
        setPlaybackError(err?.name === 'NotSupportedError' ? 'This browser cannot decode this video. HEVC support also depends on your device and the video’s profile.' : 'Playback could not start. Retry the video to reconnect to the current room position.');
        return;
      }
      try {
        video.muted = true;
        await video.play();
        if (version !== sourceVersionRef.current) return;
        setNeedsUnmutePrompt(true);
        setIsPlaybackStalled(false);
      } catch (e2) {
        if (version === sourceVersionRef.current && e2?.name !== 'AbortError') setPlaybackError('Your browser paused playback. Tap Retry video to continue.');
      }
    }
  }, []);

  const reloadMedia = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    sourceVersionRef.current += 1;
    const state = latestPlaybackRef.current;
    const target = state?.getPlaybackState?.()?.currentTime ?? state?.currentTime ?? video.currentTime;
    pendingSeekRef.current = Number.isFinite(target) ? target : 0;
    setPlaybackError('');
    setIsBuffering(true);
    video.load();
  }, []);

  const handleMediaError = useCallback(() => {
    const error = videoRef.current?.error;
    if (!error || error.code === 1) return;
    if ((error.code === 2 || error.code === 3) && !decoderRetryRef.current) {
      decoderRetryRef.current = true;
      recoveryTimerRef.current = setTimeout(reloadMedia, 250);
      return;
    }
    setIsBuffering(false);
    setIsPlaybackStalled(true);
    setPlaybackError(error.code === 4 ? 'This browser cannot decode this video format. HEVC needs compatible device decoding as well as the installed codec.' : error.code === 3 ? 'The video decoder stopped. Retry video to reopen it at the room’s current position.' : 'The video connection was interrupted. Retry video to rejoin playback.');
  }, [reloadMedia]);

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

    sourceVersionRef.current += 1;
    decoderRetryRef.current = false;
    setPlaybackError('');
    setNeedsUnmutePrompt(false);

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
    return () => {
      sourceVersionRef.current += 1;
      clearTimeout(recoveryTimerRef.current);
    };
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
      if (video.paused) safePlayVideo();
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
  }, [isPlaying, shouldUseAudioElement, safePlayVideo]);

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
    const suggested = (title || '').replace(/\.(mkv|mp4|avi|webm)$/i, '').replace(/[\._]/g, ' ').replace(/\b(1080p|720p|2160p|4k|bluray|web-dl|x264|x265|hevc|aac|dts|ddp5\.1|nf|4khdhub|com|kontrast|amzn)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    const filenameHint = !q || q.toLowerCase() === suggested.toLowerCase() ? rawTarget : '';
    onlineSearchAbort.current?.abort();
    const controller = new AbortController();
    onlineSearchAbort.current = controller;
    setIsSearchingOnline(true); setOnlineSearchError(''); setOnlineSearchDone(false);
    setOnlineSearchResults([]);
    try {
      const res = await fetch(`/api/subtitles/search?query=${encodeURIComponent(q || rawTarget)}&filename=${encodeURIComponent(filenameHint)}&lang=${onlineSearchLanguage}`, { signal: controller.signal });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'SubDL search is unavailable. Try again.');
      if (!controller.signal.aborted) { setOnlineSearchResults(data.data || []); setOnlineSearchDone(true); }
    } catch (error) {
      if (!controller.signal.aborted) setOnlineSearchError(error.message);
    } finally {
      if (!controller.signal.aborted) setIsSearchingOnline(false);
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
    if (isDownloadingOnline) return;
    subtitleDownloadAbort.current?.abort();
    const controller = new AbortController();
    subtitleDownloadAbort.current = controller;
    setOnlineSearchError('');
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
        }),
        signal: controller.signal
      });
      {
        const data = await res.json();
        if (!res.ok || !data.success || !data.vttContent) throw new Error(data.error || 'Could not download this subtitle. Try another result.');
        if (controller.signal.aborted) return;
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
          setSubsSubView('root');
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) setOnlineSearchError(e.message);
    } finally {
      if (!controller.signal.aborted) { setIsDownloadingOnline(false); setDownloadingSubId(null); }
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
    const liveState = latestPlaybackRef.current?.getPlaybackState?.();
    const seekTarget = liveState?.currentTime ?? (pendingSeekRef.current !== null ? pendingSeekRef.current : latestPlaybackRef.current?.currentTime);
    if (typeof seekTarget === 'number' && seekTarget > 0 && Math.abs(video.currentTime - seekTarget) > 0.4) {
      video.currentTime = seekTarget;
      if (shouldUseAudioElement && audioRef.current) {
        audioRef.current.currentTime = seekTarget;
      }
    }
    pendingSeekRef.current = null;

    if ((liveState?.isPlaying ?? latestPlaybackRef.current?.isPlaying) && video.paused) {
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
    { id: '70mm', label: 'Fine', short: '70mm', tag: 'Ultra Fine', speckle: 0.72, cell: 1, size: 0.85, blend: 'soft-light', chroma: 'mono', intensity: 30 },
    { id: '35mm', label: 'Classic', short: '35mm', tag: 'Cinema Std', speckle: 0.9, cell: 1, size: 1.0, blend: 'soft-light', chroma: 'mono', intensity: 40 },
    { id: '16mm', label: 'Textured', short: '16mm', tag: 'Organic', speckle: 1.1, cell: 2, size: 1.15, blend: 'soft-light', chroma: 'mono', intensity: 48 },
    { id: 'heavy', label: 'Coarse', short: '8mm', tag: 'Coarse Grit', speckle: 1.35, cell: 2, size: 1.45, blend: 'overlay', chroma: 'color', intensity: 60 },
    { id: 'sakura', label: 'Rose', short: 'Rosé', tag: 'Pink Tint', speckle: 1.0, cell: 1, size: 1.05, blend: 'soft-light', chroma: 'color', intensity: 42 },
  ];

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
    {
      setFilmGrainIntensity(stock.intensity);
      localStorage.setItem('wt_grain_intensity', stock.intensity);
    }
  };

  const VISUAL_GRADE_PRESETS = [
    { id: 'standard', label: 'Standard', b: 100, c: 100, s: 100, dot: 'linear-gradient(135deg, #e5e7eb, #6b7280)' },
    { id: 'anime', label: 'Anime Vivid', b: 101, c: 106, s: 115, dot: 'linear-gradient(135deg, #f472b6, #38bdf8)' },
    { id: 'cinema', label: 'Cinema Warm', b: 100, c: 106, s: 102, warmth: 12, dot: 'linear-gradient(135deg, #fbbf24, #9a3412)' },
    { id: 'night', label: 'Night Dim', b: 82, c: 95, s: 90, dot: 'linear-gradient(135deg, #6366f1, #1e1b4b)' },
    { id: 'cyberpunk', label: 'Cyber Neon', b: 100, c: 112, s: 125, dot: 'linear-gradient(135deg, #e879f9, #06b6d4)' },
    { id: 'noir', label: 'Noir B&W', b: 95, c: 115, s: 0, dot: 'linear-gradient(135deg, #ffffff, #18181b)' },
  ];

  const handleApplyVisualPreset = (p) => {
    const newFilter = { brightness: p.b, contrast: p.c, saturation: p.s, warmth: p.warmth || 0 };
    setVisualFilter(newFilter);
    setVisualPreset(p.id);
    localStorage.setItem('wt_visual_filter', JSON.stringify(newFilter));
    localStorage.setItem('wt_visual_preset', p.id);
  };

  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSurfaceSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const ratioParts = /^\d+:\d+$/.test(aspectRatio) ? aspectRatio.split(':').map(Number) : null;
  const forcedRatio = ratioParts ? ratioParts[0] / ratioParts[1] : null;
  const frameWidth = forcedRatio ? Math.min(surfaceSize.width, surfaceSize.height * forcedRatio) : surfaceSize.width;
  const frameHeight = forcedRatio ? frameWidth / forcedRatio : surfaceSize.height;
  const pictureFilter = visualFilter.brightness === 100 && visualFilter.contrast === 100 && visualFilter.saturation === 100 && !visualFilter.warmth ? 'none' : `brightness(${visualFilter.brightness}%) contrast(${visualFilter.contrast}%) saturate(${visualFilter.saturation}%) sepia(${visualFilter.warmth || 0}%)`;
  const changePictureValue = (key, value) => {
    const next = { ...visualFilter, [key]: value };
    setVisualFilter(next); setVisualPreset('custom');
    localStorage.setItem('wt_visual_filter', JSON.stringify(next)); localStorage.setItem('wt_visual_preset', 'custom');
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
      if (document.querySelector('[data-lounge-library]')) return;
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

          <button type="button" onClick={() => setSettingsSubView('audio')} className="pouf-yt-menu-item"><Volume2 size={15} color="#f472b6" /><span>Audio Track</span><span className="pouf-yt-val">{audioTracks[activeAudioIndex]?.title || (audioTracks.length > 0 ? `Track #${activeAudioIndex + 1}` : 'Stereo AAC')}</span><ChevronRight size={14} style={{ color: '#9ca3af' }} /></button>
          <button type="button" onClick={() => setSettingsSubView('speed')} className="pouf-yt-menu-item"><Gauge size={15} color="#f472b6" /><span>Speed</span><span className="pouf-yt-val">{playbackSpeed === 1.0 ? 'Normal' : `${playbackSpeed}x`}</span><ChevronRight size={14} style={{ color: '#9ca3af' }} /></button>
          <button type="button" onClick={() => setSettingsSubView('boost')} className="pouf-yt-menu-item"><Sparkles size={15} color="#f472b6" /><span>Volume Boost</span><span className="pouf-yt-val" style={{ color: audioBoost > 100 ? '#fbbf24' : undefined }}>{audioBoost}%</span><ChevronRight size={14} style={{ color: '#9ca3af' }} /></button>
          <button type="button" onClick={() => setSettingsSubView('filters')} className="pouf-yt-menu-item"><Sliders size={15} color="#f472b6" /><span>Visual & Grain</span><span className="pouf-yt-val">{visualPreset === 'standard' ? 'Normal' : visualPreset}{filmGrainEnabled ? ' + Grain' : ''}</span><ChevronRight size={14} style={{ color: '#9ca3af' }} /></button>
          <button type="button" onClick={() => setSettingsSubView('aspect')} className="pouf-yt-menu-item"><Crop size={15} color="#f472b6" /><span>Aspect Ratio</span><span className="pouf-yt-val">{aspectRatio === 'contain' ? 'Fit' : aspectRatio === 'cover' ? 'Fill screen' : aspectRatio === 'fill' ? 'Stretch' : aspectRatio}</span><ChevronRight size={14} style={{ color: '#9ca3af' }} /></button>
          <button type="button" onClick={() => { handleFixBlackScreen(); setShowSettingsMenu(false); }} className="pouf-yt-menu-item" style={{ marginTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', color: '#f472b6' }} title="Reload stream decoder, unfreeze frame, and kickstart playback"><Sparkles size={15} color="#f472b6" /><span style={{ fontWeight: 700 }}>⚡ Fix Black Screen</span></button>
        </>
      )}
      {settingsSubView === 'audio' && (
        <>
          <button type="button" onClick={() => setSettingsSubView('root')} className="pouf-yt-back-btn"><ChevronLeft size={16} /><span>Audio Stream ({audioTracks.length || 1})</span></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '200px', overflowY: 'auto' }}>
            {audioTracks.length === 0 ? (<div className="pouf-yt-menu-item active"><span>Default Audio (Stereo AAC)</span><Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} /></div>) : (audioTracks.map((t, idx) => {
              const trackIdx = t.index ?? idx; const isActive = activeAudioIndex === trackIdx; return (
                <button type="button" key={trackIdx} onClick={() => onAudioTrackChange?.(trackIdx)} className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || `Track #${idx + 1}`}</span>
                  {t.codec && <span style={{ fontSize: '0.60rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', color: '#d1d5db' }}>{t.codec.toUpperCase()}</span>}
                  {isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                </button>
              );
            }))}
          </div>
          {audioTracks.length > 1 && !audioStatusData?.allReady && (<button type="button" onClick={handleProcessAllAudio} disabled={isProcessingAudio} style={{ marginTop: '6px', padding: '6px 8px', borderRadius: '6px', background: 'rgba(244, 114, 182, 0.15)', border: '1px solid rgba(244, 114, 182, 0.35)', color: '#fbcfe8', fontSize: '0.68rem', fontWeight: 700, cursor: isProcessingAudio ? 'not-allowed' : 'pointer' }}>{isProcessingAudio ? 'Extracting in background...' : 'Pre-extract All Tracks to AAC'}</button>)}
        </>
      )}
      {settingsSubView === 'speed' && (
        <>
          <button type="button" onClick={() => setSettingsSubView('root')} className="pouf-yt-back-btn"><ChevronLeft size={16} /><span>Playback Speed</span></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((spd) => { const isActive = playbackSpeed === spd; return (<button type="button" key={spd} onClick={() => handleSpeedChange(spd)} className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}><span>{spd === 1.0 ? 'Normal (1.0x)' : `${spd}x`}</span>{isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}</button>); })}</div>
        </>
      )}
      {settingsSubView === 'boost' && (
        <>
          <button type="button" onClick={() => setSettingsSubView('root')} className="pouf-yt-back-btn"><ChevronLeft size={16} /><span>Volume Boost (Gain)</span></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{[{ b: 100, label: 'Normal (100%)' }, { b: 125, label: 'Boost 125%' }, { b: 150, label: 'Boost 150%' }, { b: 175, label: 'Boost 175%' }, { b: 200, label: 'Max Boost (200%)' }].map((item) => { const isActive = audioBoost === item.b; return (<button type="button" key={item.b} onClick={() => handleAudioBoostChange(item.b)} className={`pouf-yt-menu-item ${isActive ? 'active' : ''}`}><span>{item.label}</span>{isActive && <Check size={14} color="#f472b6" style={{ marginLeft: 'auto' }} />}</button>); })}</div>
        </>
      )}
      {settingsSubView === 'aspect' && (
        <>
          <button type="button" onClick={() => setSettingsSubView('root')} className="pouf-yt-back-btn"><ChevronLeft size={16} /><span>Picture framing</span></button>
          <div className="player-aspect-options">
            {[
              { id: 'contain', label: 'Fit original', note: 'Show the full picture. No cropping.' },
              { id: 'cover', label: 'Fill screen', note: 'Fill the player. Edges may be cropped.' },
              { id: 'fill', label: 'Stretch', note: 'Fill the player by changing proportions.' },
              { id: '16:9', label: '16:9', note: 'Widescreen frame' },
              { id: '4:3', label: '4:3', note: 'Classic frame' },
              { id: '21:9', label: '21:9', note: 'Cinema frame' }
            ].map(option => <button type="button" key={option.id} aria-pressed={aspectRatio === option.id}
              className="player-option" onClick={() => handleAspectChange(option.id)}>
              <span className="player-aspect-icon" style={{ aspectRatio: option.id.includes(':') ? option.id.replace(':', '/') : '16 / 9' }} />
              <span><strong>{option.label}</strong><small>{option.note}</small></span>
              {aspectRatio === option.id && <Check size={16} />}
            </button>)}
          </div>
          <p className="player-menu-hint">Frame presets crop the picture. Fit original preserves its proportions.</p>
        </>
      )}
    </>
  );

  return (
    <div
      ref={containerRef}
      className={`pouf-player-container player-liquid-glass ${isFullscreen ? 'pouf-fullscreen' : ''} ${className}`}
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
        onEnded={() => onEnded?.({ url, duration: videoRef.current?.duration, currentTime: videoRef.current?.currentTime })}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => { setIsBuffering(false); if (videoRef.current?.paused) safePlayVideo(); }}
        onSeeking={() => setIsBuffering(true)}
        onSeeked={() => setIsBuffering(false)}
        onError={handleMediaError}
        style={{
          width: '100%',
          height: '100%',
          ...(forcedRatio ? { width: `${frameWidth}px`, height: `${frameHeight}px` } : {}),
          flexShrink: 0,
          objectFit: forcedRatio ? 'cover' : aspectRatio,
          filter: pictureFilter,
          background: '#000000',
          cursor: isLocked ? 'default' : 'pointer'
        }}
      />

      {playbackError && <div className="player-playback-error" role="alert">
        <p>{playbackError}</p>
        <button type="button" onClick={reloadMedia}>Retry video</button>
        <span>Your room stays connected.</span>
      </div>}

      {filmGrainEnabled && filmGrainIntensity > 0 && <FilmGrain intensity={filmGrainIntensity}
        size={filmGrainSize} blend={filmGrainBlend}
        rose={filmGrainPreset === 'sakura'} />}

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

        {/* Top-Right Area (Viewer count removed per user request) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }} />
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
        <SeekTimeline
          currentTime={playProgress}
          duration={duration}
          buffered={bufferedProgress}
          formatTime={formatTime}
          disabled={!canControl}
          onSeek={(time) => {
            if (!videoRef.current) return;
            videoRef.current.currentTime = time;
            if (shouldUseAudioElement && audioRef.current) audioRef.current.currentTime = time;
            setPlayProgress(time);
            onSeek?.(time);
          }}
        />

        <GlassSurface className="a4-deck">
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
        </GlassSurface>

        {showSubMenu && <PlayerMenu portalRoot={containerRef.current} title={subsSubView === 'root' ? 'Subtitles' : subsSubView === 'options' ? 'Style & timing' : 'Find subtitles'} onBack={subsSubView === 'root' ? undefined : () => setSubsSubView('root')} onClose={() => setShowSubMenu(false)}>
          {subsSubView === 'root' && <>
            <button type="button" className="player-option" aria-pressed={activeSubtitleIndex === -1} onClick={() => onSubtitleChange?.(-1)}><span>Subtitles off</span>{activeSubtitleIndex === -1 && <Check size={16} />}</button>
            {allSubtitles.map((track, index) => <button type="button" key={track.id || index} className="player-option" aria-pressed={activeSubtitleIndex === index} onClick={() => onSubtitleChange?.(index)}><span className="player-option-title">{track.title || `Track ${index + 1}`}</span>{activeSubtitleIndex === index && <Check size={16} />}</button>)}
            {!allSubtitles.length && <p className="player-menu-hint">No subtitle tracks yet. Find one online or add an SRT / VTT file.</p>}
            <div className="player-menu-divider" />
            <input type="file" ref={fileInputRef} accept=".srt,.vtt" onChange={handleUploadSubtitleFile} hidden />
            <button type="button" className="player-option" onClick={() => fileInputRef.current?.click()}><Upload size={16} /><span>Upload subtitle file</span><ChevronRight size={15} /></button>
            <button type="button" className="player-option" onClick={() => setSubsSubView('search')}><Search size={16} /><span>Find on SubDL</span><ChevronRight size={15} /></button>
            <button type="button" className="player-option" onClick={() => setSubsSubView('options')}><Sliders size={16} /><span>Style & timing</span><ChevronRight size={15} /></button>
          </>}
          {subsSubView === 'options' && <>
            <div className="player-subtitle-preview"><span style={getSubtitleCueStyle(0.8)}>{currentCueText || 'Just one more episode.'}</span></div>
            <div className="player-menu-tabs" role="group" aria-label="Subtitle customization"><button type="button" aria-pressed={subCustomizerTab === 'presets'} onClick={() => setSubCustomizerTab('presets')}>Appearance</button><button type="button" aria-pressed={subCustomizerTab === 'tune'} onClick={() => setSubCustomizerTab('tune')}>Size & timing</button></div>
            {subCustomizerTab === 'presets' && <>
            <div className="player-preset-grid">{PINK_SUB_PRESETS.map(preset => <button type="button" key={preset.id} className="player-look-card" aria-pressed={subtitleBgColor === preset.bgColor && subtitleColor.toLowerCase() === preset.color.toLowerCase() && subtitleFont === preset.font && subtitleEdge === preset.edge} onClick={() => applySubtitlePreset(preset)}><span className="player-look-swatch" style={{ background: preset.swatch }}>Aa</span><span>{preset.name}</span></button>)}</div>
            <label className="player-menu-select">Typeface<select value={subtitleFont} onChange={event => handleSubtitleFontChange(event.target.value)}><option value="sans">Clean sans</option><option value="rounded">Rounded</option><option value="serif">Serif</option><option value="mono">Monospace</option></select></label>
            <label className="player-menu-select">Text edge<select value={subtitleEdge} onChange={event => handleSubtitleEdgeChange(event.target.value)}><option value="auto">Soft shadow</option><option value="crisp">Outline</option><option value="glow">Soft glow</option><option value="pink-glow">Rose glow</option></select></label>
            <label className="player-menu-select">Text colour<input type="color" value={subtitleColor} onChange={event => handleSubtitleColorChange(event.target.value)} /></label>
            <label className="player-menu-select">Backdrop<select value={subtitleBgColor} onChange={event => handleSubtitleBgColorChange(event.target.value)}>{Object.entries(SUBTITLE_BG_MAP).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}</select></label>
            </>}
            {subCustomizerTab === 'tune' && <>
            <PlayerSlider label="Text size" value={subtitleSize} min={14} max={48} suffix="px" onChange={handleSizeChange} />
            <PlayerSlider label="Distance from bottom" value={subtitleBottom} min={16} max={240} step={4} suffix="px" onChange={handleBottomChange} />
            <PlayerSlider label="Backdrop opacity" value={subtitleBgOpacity} min={0} max={100} step={5} suffix="%" onChange={value => { setSubtitleBgOpacity(value); localStorage.setItem('wt_sub_bg_opacity', value); }} />
            <PlayerSlider label="Backdrop blur" value={subtitleBgBlur} min={0} max={20} suffix="px" disabled={subtitleBgOpacity === 0} onChange={value => { setSubtitleBgBlur(value); localStorage.setItem('wt_sub_bg_blur', value); }} />
            <PlayerSlider label="Timing offset" value={subtitleDelay} min={-5} max={5} step={0.1} suffix="s" onChange={handleDelayChange} />
            <p className="player-menu-hint">Positive values show subtitles earlier; negative values show them later.</p>
            </>}
            <button type="button" className="player-menu-reset" onClick={resetSubtitleDefaults}><RotateCcw size={14} />Reset subtitle settings</button>
          </>}
          {subsSubView === 'search' && <>
            <p className="player-menu-hint">Match your movie, episode, and release.</p>
            <form className="player-sub-search" onSubmit={event => { event.preventDefault(); handleSearchOnlineSubtitles(); }}>
              <label><span className="sr-only">Movie or episode title</span><input autoFocus type="search" value={onlineSearchQuery} onChange={event => setOnlineSearchQuery(event.target.value)} placeholder="Movie or episode title" /></label>
              <button type="submit" className="player-menu-primary" disabled={isSearchingOnline || !onlineSearchQuery.trim()}><Search size={15} />{isSearchingOnline ? 'Searching…' : 'Search'}</button>
            </form>
            <label className="player-menu-select">Language<select value={onlineSearchLanguage} onChange={event => { onlineSearchAbort.current?.abort(); setIsSearchingOnline(false); setOnlineSearchLanguage(event.target.value); setOnlineSearchError(''); setOnlineSearchResults([]); setOnlineSearchDone(false); }}><option value="EN">English</option><option value="HI">Hindi</option><option value="ES">Spanish</option><option value="FR">French</option><option value="AR">Arabic</option></select></label>
            {onlineSearchError && <p className="player-menu-error" role="alert">{onlineSearchError}</p>}
            {isSearchingOnline ? <p className="player-menu-status" role="status">Looking for matching subtitles…</p> : <>
              {onlineSearchDone && <p className="player-menu-hint" role="status">{onlineSearchResults.length ? `${onlineSearchResults.length} results` : 'No matches. Try a shorter title or another language.'}</p>}
              <div className="player-search-results">{onlineSearchResults.map((sub, index) => <div className="player-sub-result" key={`${sub.fileId}-${index}`}><div><strong title={sub.fileName}>{sub.fileName}</strong><small>{sub.language}{sub.author ? ` · ${sub.author}` : ''}{sub.hi ? ' · Hearing impaired' : ''}</small></div><button type="button" aria-label={`Use subtitle ${sub.fileName}`} disabled={isDownloadingOnline} onClick={() => handleDownloadOnlineSubtitle(sub)}>{downloadingSubId === sub.fileId ? 'Adding…' : <><Download size={14} />Use</>}</button></div>)}</div>
            </>}
          </>}
        </PlayerMenu>}
        {showSettingsMenu && <PlayerMenu portalRoot={containerRef.current} title={settingsSubView === 'filters' ? 'Picture & grain' : 'Player settings'} onBack={settingsSubView === 'filters' ? () => setSettingsSubView('root') : undefined} onClose={() => setShowSettingsMenu(false)}>
          {settingsSubView !== 'filters' ? renderSettingsCoreViews() : <>
            <div className="player-menu-tabs" role="group" aria-label="Picture settings"><button type="button" aria-pressed={filterLabTab === 'color'} onClick={() => setFilterLabTab('color')}>Colour</button><button type="button" aria-pressed={filterLabTab === 'grain'} onClick={() => setFilterLabTab('grain')}>Film grain</button></div>
            {filterLabTab === 'color' ? <>
              <div className="player-colour-preview" style={{ filter: pictureFilter }} aria-label="Colour treatment preview"><span /><span /><span /><span /><span /></div>
              <div className="player-preset-grid">{VISUAL_GRADE_PRESETS.map(preset => <button type="button" key={preset.id} className="player-look-card" aria-pressed={visualPreset === preset.id} onClick={() => handleApplyVisualPreset(preset)}><span className="player-look-swatch" style={{ background: preset.dot }} />{preset.label}</button>)}</div>
              <PlayerSlider label="Brightness" value={visualFilter.brightness} min={70} max={130} suffix="%" onChange={value => changePictureValue('brightness', value)} />
              <PlayerSlider label="Contrast" value={visualFilter.contrast} min={70} max={140} suffix="%" onChange={value => changePictureValue('contrast', value)} />
              <PlayerSlider label="Saturation" value={visualFilter.saturation} min={0} max={160} suffix="%" onChange={value => changePictureValue('saturation', value)} />
              <PlayerSlider label="Warmth" value={visualFilter.warmth || 0} min={0} max={30} suffix="%" onChange={value => changePictureValue('warmth', value)} />
              <button type="button" className="player-menu-reset" onClick={() => handleApplyVisualPreset(VISUAL_GRADE_PRESETS[0])}><RotateCcw size={14} />Reset picture</button>
            </> : <>
              <button type="button" className="player-option" role="switch" aria-checked={filmGrainEnabled} onClick={() => handleToggleGrainEnabled(!filmGrainEnabled)}><span>Film grain</span><span className="player-toggle" data-on={filmGrainEnabled} /><span>{filmGrainEnabled ? 'On' : 'Off'}</span></button>
              <div className="player-grain-preview"><FilmGrain intensity={filmGrainEnabled ? filmGrainIntensity : 0} size={filmGrainSize} blend={filmGrainBlend} rose={filmGrainPreset === 'sakura'} /><span>Texture, gently.</span></div>
              <div className="player-grain-presets">{FILM_GRAIN_STOCKS.map(stock => <button type="button" key={stock.id} aria-pressed={filmGrainEnabled && filmGrainPreset === stock.id} onClick={() => handleApplyGrainStock(stock)}>{stock.label}</button>)}</div>
              <PlayerSlider label="Grain strength" value={filmGrainIntensity} min={0} max={100} step={5} suffix="%" onChange={value => { handleToggleGrainEnabled(value > 0); setFilmGrainIntensity(value); localStorage.setItem('wt_grain_intensity', value); }} />
              <PlayerSlider label="Grain size" value={filmGrainSize} min={0.6} max={1.8} step={0.1} suffix="×" onChange={value => { setFilmGrainSize(value); localStorage.setItem('wt_grain_size', value); }} />
              <label className="player-menu-select">Blend<select value={filmGrainBlend} onChange={event => { setFilmGrainBlend(event.target.value); localStorage.setItem('wt_grain_blend', event.target.value); }}><option value="soft-light">Soft light</option><option value="overlay">Overlay</option></select></label>

              <p className="player-menu-hint">Fresh grain at 24 frames per second. Always moving, including when the video is paused.</p>
            </>}
          </>}
        </PlayerMenu>}
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
