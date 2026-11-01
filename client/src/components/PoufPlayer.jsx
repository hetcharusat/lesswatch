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
  Sun
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

  // Separate Menus for Subtitles and Settings
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('audio'); // 'audio' | 'visual' | 'aspect' | 'speed'

  // Controls Lock Mode
  const [isLocked, setIsLocked] = useState(false);
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
    } catch {}
    return { brightness: 100, contrast: 100, saturation: 100 };
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

  // Mount Direct Stream to Video
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

  // Sync external currentTime (when paused: threshold 0.4s; when playing: threshold 2.0s so joining users and scrubs instantly sync without frame drops during playback)
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || typeof currentTime !== 'number' || isNaN(currentTime)) return;
    if (isDraggingScrubberRef.current) return;

    const diff = Math.abs(video.currentTime - currentTime);
    const threshold = video.paused ? 0.35 : 1.5;
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
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);

    // Initial seek to target currentTime once video metadata is ready
    if (currentTime > 0 && Math.abs(video.currentTime - currentTime) > 0.4) {
      video.currentTime = currentTime;
      if (shouldUseAudioElement && audioRef.current) {
        audioRef.current.currentTime = currentTime;
      }
    }
    if (isPlaying && video.paused) {
      video.play().catch(() => {});
    }
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
    if (isLocked) {
      triggerLockHint();
      return;
    }
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

      if (isLocked) {
        triggerLockHint();
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
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleTogglePiP();
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
      onMouseLeave={() => localPlaying && !showSettingsMenu && !showSubMenu && setShowControls(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '340px',
        background: '#07030a',
        borderRadius: isFullscreen ? '0px' : '20px',
        overflow: 'hidden',
        boxShadow: isFullscreen ? 'none' : '0 16px 36px rgba(244,114,182,0.2)',
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
          filter: `brightness(${visualFilter.brightness}%) contrast(${visualFilter.contrast}%) saturate(${visualFilter.saturation}%)`,
          background: '#000000',
          cursor: isLocked ? 'default' : 'pointer'
        }}
      />

      {/* 2. Hidden Secondary Audio Stream for Multi-Track Sync */}
      <audio ref={audioRef} preload="auto" playsInline style={{ display: 'none' }} />

      {/* 3. Compact Top Title & Specs Overlay with Pink Glassmorphism */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '0.85rem 1.4rem',
          background: 'linear-gradient(180deg, rgba(10, 10, 15, 0.70) 0%, rgba(10, 10, 15, 0.20) 60%, transparent 100%)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 40,
          opacity: !isLocked && showControls ? 1 : 0,
          transform: !isLocked && showControls ? 'translateY(0)' : 'translateY(-12px)',
          transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
          pointerEvents: !isLocked && showControls ? 'auto' : 'none'
        }}
      >
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 0 12px rgba(244,114,182,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title || 'Video Stream'}
          </h2>
          <div style={{ fontSize: '0.72rem', color: '#e5e7eb', marginTop: '3px', fontWeight: 600, display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ background: 'rgba(244, 114, 182, 0.22)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(244, 114, 182, 0.35)', color: '#f472b6', fontWeight: 700 }}>Direct Stream</span>
            {audioTracks.length > 1 && (
              <span style={{ color: '#fbcfe8', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                • <Volume2 size={11} color="#f472b6" /> Multi-Audio ({audioTracks.length})
              </span>
            )}
            {allSubtitles.length > 0 && (
              <span style={{ color: '#a7f3d0', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                • <Type size={11} color="#34d399" /> Subs ({allSubtitles.length})
              </span>
            )}
          </div>
        </div>

        {/* Top-Right Badges & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div
            className="pouf-glass-card"
            style={{
              padding: '4px 10px',
              borderRadius: '9999px',
              color: '#fff',
              fontSize: '0.74rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Users size={12} color="#f472b6" />
            <span>{viewerCount}</span>
          </div>

          <button
            onClick={() => {
              setIsLocked(true);
              setShowControls(false);
              triggerLockHint();
            }}
            className="pouf-glass-btn"
            style={{
              width: '32px',
              height: '32px',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Lock Controls (L)"
          >
            <Lock size={14} />
          </button>

          <button
            onClick={toggleFullscreen}
            className="pouf-glass-btn"
            style={{
              width: '32px',
              height: '32px',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>

      {/* 4. Subtitle Display Layer with Special Pink Subtitle Mode */}
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
              color: subtitleStyle === 'pink' ? '#ff85c0' : '#ffffff',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: `${subtitleSize}px`,
              fontWeight: 800,
              lineHeight: 1.35,
              padding: subtitleStyle === 'transparent' ? '4px 8px' : '6px 14px',
              borderRadius: subtitleStyle === 'transparent' ? '0' : '10px',
              background: subtitleStyle === 'pink'
                ? 'rgba(35, 12, 28, 0.65)'
                : (subtitleStyle === 'transparent' ? 'transparent' : (subtitleStyle === 'box' ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.45)')),
              backdropFilter: (subtitleStyle === 'pink' || subtitleStyle === 'soft') ? 'blur(6px)' : 'none',
              border: subtitleStyle === 'pink' ? '1px solid rgba(244, 114, 182, 0.4)' : 'none',
              textShadow: subtitleStyle === 'pink'
                ? '0 0 12px rgba(244, 114, 182, 0.9), 0 0 4px #ec4899, -1.5px -1.5px 0 #3b0724, 1.5px -1.5px 0 #3b0724, -1.5px 1.5px 0 #3b0724, 1.5px 1.5px 0 #3b0724'
                : (subtitleStyle === 'transparent'
                  ? '0 2px 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85), -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000'
                  : '0 1px 3px rgba(0,0,0,0.8)'),
              whiteSpace: 'pre-wrap',
              letterSpacing: '0.015em'
            }}
          >
            {currentCueText}
          </span>
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

      {/* 5.2. Screen Controls Locked HUD */}
      {isLocked && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 18px',
            borderRadius: '9999px',
            background: 'rgba(18, 8, 26, 0.88)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(244, 114, 182, 0.4)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 16px rgba(244, 114, 182, 0.28)',
            opacity: showControls || showLockHint ? 1 : 0.28,
            transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <Lock size={14} color="#f472b6" />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fce7f3' }}>
            Controls Locked
          </span>
          <button
            onClick={() => {
              setIsLocked(false);
              setShowControls(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 10px',
              borderRadius: '9999px',
              background: 'linear-gradient(135deg, #ec4899, #db2777)',
              border: 'none',
              color: '#ffffff',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 0 10px rgba(236, 72, 153, 0.45)'
            }}
          >
            <Unlock size={12} />
            <span>Unlock</span>
          </button>
        </div>
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
                setShowSettingsMenu(false);
              }}
              className={showSubMenu ? 'pouf-dock-pill-btn active' : 'pouf-dock-pill-btn'}
              title="Subtitles & SubDL Search"
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
                setShowSubMenu(false);
              }}
              className={showSettingsMenu ? 'pouf-dock-icon-btn active' : 'pouf-dock-icon-btn'}
              title="Settings (Audio, Ratio, Sync)"
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
        {/* 7. DEDICATED SUBTITLES & STYLING POPOVER (OUTSIDE SETTINGS)        */}
        {/* ------------------------------------------------------------------ */}
        {showSubMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="pouf-popover-shell"
            style={{
              position: 'absolute',
              bottom: '76px',
              right: '32px',
              padding: '16px',
              width: '360px',
              maxHeight: '480px',
              zIndex: 70,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              overflowY: 'auto'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(236, 72, 153, 0.15)', border: '1px solid rgba(244, 114, 182, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClaySubtitles size={15} />
                </div>
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fce7f3', letterSpacing: '0.02em' }}>
                  Subtitles & Styling
                </span>
              </div>
              <button
                onClick={() => setShowSubMenu(false)}
                style={{
                  width: '24px',
                  height: '24px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '50%',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Subtitle Track Selector */}
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
                Active Subtitle Track
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '120px', overflowY: 'auto' }}>
                <button
                  onClick={() => onSubtitleChange?.(-1)}
                  className={`pouf-item-card ${activeSubtitleIndex === -1 ? 'active' : ''}`}
                >
                  <span style={{ fontWeight: activeSubtitleIndex === -1 ? 700 : 500 }}>Off (No Subtitles)</span>
                  {activeSubtitleIndex === -1 ? <span className="pouf-badge-active">ACTIVE</span> : <span style={{ fontSize: '0.70rem', color: '#52525b' }}>Select</span>}
                </button>

                {allSubtitles.map((t, idx) => {
                  const isActive = activeSubtitleIndex === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => onSubtitleChange?.(idx)}
                      className={`pouf-item-card ${isActive ? 'active' : ''}`}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 700 : 500 }}>
                        {t.title || `Track ${idx + 1}`}
                      </span>
                      {isActive ? <span className="pouf-badge-active">ACTIVE</span> : <span style={{ fontSize: '0.70rem', color: '#52525b' }}>Select</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Actions: Upload File & SubDL Direct Search */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <input
                type="file"
                ref={fileInputRef}
                accept=".srt,.vtt"
                onChange={handleUploadSubtitleFile}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="pouf-glass-btn"
                style={{
                  padding: '6px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  cursor: 'pointer'
                }}
              >
                <Upload size={12} color="#f472b6" />
                <span>Upload File</span>
              </button>

              <button
                onClick={handleToggleOnlineSubSearch}
                className={showOnlineSubSearch ? 'pouf-glass-btn-primary' : 'pouf-glass-btn'}
                style={{
                  padding: '6px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  cursor: 'pointer'
                }}
              >
                <Sparkles size={12} />
                <span>SubDL Search</span>
              </button>
            </div>

            {/* SubDL Direct Search Drawer */}
            {showOnlineSubSearch && (
              <div
                className="pouf-glass-card"
                style={{
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Search size={12} color="#f472b6" />
                    <span>SubDL Online Subtitles</span>
                  </span>
                  <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>API Ready</span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    type="text"
                    value={onlineSearchQuery}
                    onChange={(e) => setOnlineSearchQuery(e.target.value)}
                    placeholder="Search title, filename or episode..."
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchOnlineSubtitles()}
                    className="pouf-glass-input"
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      fontSize: '0.72rem'
                    }}
                  />
                  <button
                    onClick={() => handleSearchOnlineSubtitles()}
                    disabled={isSearchingOnline}
                    className="pouf-glass-btn-primary"
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {isSearchingOnline ? '...' : <Search size={12} />}
                  </button>
                </div>

                {isSearchingOnline ? (
                  <div style={{ padding: '12px 0', textAlign: 'center', color: '#f472b6', fontSize: '0.70rem', fontWeight: 700 }}>
                    Searching SubDL releases...
                  </div>
                ) : onlineSearchResults.length > 0 ? (
                  <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                    {onlineSearchResults.map((sub, sIdx) => {
                      const isDownloadingThis = downloadingSubId === sub.fileId;
                      return (
                        <div
                          key={sIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(244, 114, 182, 0.18)',
                            gap: '6px'
                          }}
                        >
                          <div style={{ overflow: 'hidden', flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.70rem', color: '#f3f4f6', fontWeight: 700 }} title={sub.fileName}>
                              {sub.fileName}
                            </div>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px', fontSize: '0.60rem' }}>
                              <span style={{ padding: '0px 4px', borderRadius: '3px', background: 'rgba(244, 114, 182, 0.25)', color: '#f472b6', fontWeight: 800 }}>
                                {sub.language}
                              </span>
                              {sub.episode && (
                                <span style={{ padding: '0px 4px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', color: '#d1d5db', fontWeight: 700 }}>
                                  S{sub.season}E{sub.episode}
                                </span>
                              )}
                              {sub.hi && (
                                <span style={{ padding: '0px 4px', borderRadius: '3px', background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', fontWeight: 700 }}>
                                  SDH
                                </span>
                              )}
                              {sub.author && (
                                <span style={{ color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  by {sub.author}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownloadOnlineSubtitle(sub)}
                            disabled={isDownloadingOnline}
                            className={isDownloadingThis ? 'pouf-glass-btn' : 'pouf-glass-btn-primary'}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '5px',
                              fontSize: '0.66rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                              flexShrink: 0
                            }}
                          >
                            {isDownloadingThis ? (
                              <span>Loading...</span>
                            ) : (
                              <>
                                <Download size={11} />
                                <span>Get</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '8px 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.66rem' }}>
                    Type a title or episode and tap Search
                  </div>
                )}
              </div>
            )}

            {/* Subtitle Appearance & Style */}
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.04em' }}>
                Appearance & Style
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {[
                  { id: 'pink', label: 'Pink Glow', desc: 'Aesthetic Pink' },
                  { id: 'transparent', label: 'Outline', desc: 'Drop Shadow' },
                  { id: 'soft', label: 'Soft Glass', desc: 'Translucent' },
                  { id: 'box', label: 'Solid Box', desc: 'Dark Box' }
                ].map(st => (
                  <button
                    key={st.id}
                    onClick={() => handleStyleChange(st.id)}
                    className={subtitleStyle === st.id ? 'pouf-glass-btn-primary' : 'pouf-glass-btn'}
                    style={{
                      padding: '5px 2px',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pixel Controller: Font Size */}
            <div className="pouf-glass-card" style={{ padding: '7px 9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.70rem', fontWeight: 700, color: '#d1d5db' }}>
                  Font Size
                </span>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#f472b6', fontVariantNumeric: 'tabular-nums' }}>
                  {subtitleSize}px
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => handleSizeChange(subtitleSize - 1)}
                  className="pouf-glass-btn"
                  style={{ width: '22px', height: '22px', padding: 0, fontWeight: 800, cursor: 'pointer' }}
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
                  className="pouf-glass-btn"
                  style={{ width: '22px', height: '22px', padding: 0, fontWeight: 800, cursor: 'pointer' }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Pixel Controller: Bottom Position */}
            <div className="pouf-glass-card" style={{ padding: '7px 9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.70rem', fontWeight: 700, color: '#d1d5db' }}>
                  Bottom Position
                </span>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#f472b6', fontVariantNumeric: 'tabular-nums' }}>
                  {subtitleBottom}px
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => handleBottomChange(subtitleBottom - 5)}
                  className="pouf-glass-btn"
                  style={{ width: '22px', height: '22px', padding: 0, fontWeight: 800, cursor: 'pointer' }}
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
                  className="pouf-glass-btn"
                  style={{ width: '22px', height: '22px', padding: 0, fontWeight: 800, cursor: 'pointer' }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Subtitle Sync Delay */}
            <div className="pouf-glass-card" style={{ padding: '7px 9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.70rem', fontWeight: 700, color: '#d1d5db' }}>
                  Sync Delay
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 800, color: subtitleDelay !== 0 ? '#fbbf24' : '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                    {subtitleDelay > 0 ? `+${subtitleDelay.toFixed(1)}s` : `${subtitleDelay.toFixed(1)}s`}
                  </span>
                  {subtitleDelay !== 0 && (
                    <button
                      onClick={() => handleDelayChange(0.0)}
                      className="pouf-glass-btn"
                      style={{ padding: '1px 5px', fontSize: '0.62rem', cursor: 'pointer' }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => handleDelayChange(subtitleDelay - 0.1)}
                  className="pouf-glass-btn"
                  style={{ width: '22px', height: '22px', padding: 0, fontWeight: 800, cursor: 'pointer' }}
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
                  className="pouf-glass-btn"
                  style={{ width: '22px', height: '22px', padding: 0, fontWeight: 800, cursor: 'pointer' }}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 8. OBSIDIAN NEON HUD SETTINGS POPOVER (Audio, Ratio, Speed, Sync)  */}
        {/* ------------------------------------------------------------------ */}
        {showSettingsMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="pouf-popover-shell"
            style={{
              position: 'absolute',
              bottom: '76px',
              right: '32px',
              padding: '16px',
              width: '330px',
              maxHeight: '460px',
              zIndex: 70,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              overflowY: 'auto'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(236, 72, 153, 0.15)', border: '1px solid rgba(244, 114, 182, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Settings size={14} color="var(--pink-primary)" />
                </div>
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fce7f3', letterSpacing: '0.02em' }}>
                  Player Settings
                </span>
              </div>
              <button
                onClick={() => setShowSettingsMenu(false)}
                style={{
                  width: '24px',
                  height: '24px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '50%',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Recessed Obsidian Capsule Tabs */}
            <div className="pouf-tab-bar">
              {[
                { id: 'audio', label: 'Audio' },
                { id: 'visual', label: 'Visual' },
                { id: 'aspect', label: 'Ratio' },
                { id: 'speed', label: 'Speed' }
              ].map(tab => {
                const isActive = activeSettingsTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSettingsTab(tab.id)}
                    className={`pouf-tab-item ${isActive ? 'active' : ''}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* TAB: AUDIO TRACKS */}
            {activeSettingsTab === 'audio' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Available Audio Streams
                  </span>
                  <span style={{ fontSize: '0.64rem', color: '#71717a', fontFamily: 'JetBrains Mono, monospace' }}>
                    {audioTracks.length} Detected
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {audioTracks.length === 0 ? (
                    <div className="pouf-item-card active" style={{ cursor: 'default' }}>
                      <span style={{ fontWeight: 700 }}>Default Audio (Stereo AAC)</span>
                      <span className="pouf-badge-active">ACTIVE</span>
                    </div>
                  ) : (
                    audioTracks.map((t, idx) => {
                      const trackIdx = t.index ?? idx;
                      const isActive = activeAudioIndex === trackIdx;
                      const trackStatus = audioStatusData?.tracks?.find((st) => st.index === trackIdx);
                      const isReady = (t.codec || '').toLowerCase() === 'aac' || trackIdx === 0 || trackStatus?.isReady;
                      const isProcessing = trackStatus?.isProcessing;

                      return (
                        <button
                          key={trackIdx}
                          onClick={() => onAudioTrackChange?.(trackIdx)}
                          className={`pouf-item-card ${isActive ? 'active' : ''}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', overflow: 'hidden' }}>
                            <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {t.title || `Audio Track #${idx + 1}`}
                            </span>
                            {t.codec && (
                              <span className="pouf-badge-codec">
                                {t.codec.toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {isReady ? (
                              <span className="pouf-badge-ready" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <Check size={10} /> Ready
                              </span>
                            ) : isProcessing ? (
                              <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(251, 191, 36, 0.22)', color: '#fbbf24', fontWeight: 700 }}>
                                Extracting
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', color: '#9ca3af', fontWeight: 600 }}>
                                Pending
                              </span>
                            )}
                            {isActive ? (
                              <span className="pouf-badge-active">ACTIVE</span>
                            ) : (
                              <span style={{ fontSize: '0.70rem', color: '#52525b' }}>Select</span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {audioTracks.length > 1 && (
                  <div style={{ marginTop: '2px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    {audioStatusData?.allReady ? (
                      <div style={{ fontSize: '0.68rem', color: '#34d399', textAlign: 'center', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                        <Check size={12} color="#34d399" />
                        <span>Dual-Track Audio Cache Active</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleProcessAllAudio}
                        disabled={isProcessingAudio}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          background: 'rgba(244, 114, 182, 0.15)',
                          border: '1px solid rgba(244, 114, 182, 0.35)',
                          color: '#fbcfe8',
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          cursor: isProcessingAudio ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px'
                        }}
                      >
                        <Sparkles size={12} color="var(--pink-primary)" />
                        <span>{isProcessingAudio ? 'Extracting in Background...' : 'Pre-extract All Tracks to AAC'}</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Audio Gain Boost Section */}
                <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Volume Boost (Gain)
                    </span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: audioBoost > 100 ? '#fbbf24' : '#9ca3af', fontFamily: 'JetBrains Mono, monospace' }}>
                      {audioBoost}%
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                    {[100, 125, 150, 200].map((b) => (
                      <button
                        key={b}
                        onClick={() => handleAudioBoostChange(b)}
                        className={`pouf-dock-pill-btn ${audioBoost === b ? 'active' : ''}`}
                        style={{ padding: '4px 6px', justifyContent: 'center', fontSize: '0.68rem' }}
                      >
                        {b === 100 ? 'Normal' : `${b}%`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: VISUAL / COLOR FILTER */}
            {activeSettingsTab === 'visual' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Visual Presets
                  </span>
                  <button
                    onClick={() => {
                      const resetFilter = { brightness: 100, contrast: 100, saturation: 100 };
                      setVisualFilter(resetFilter);
                      setVisualPreset('standard');
                      localStorage.setItem('wt_visual_filter', JSON.stringify(resetFilter));
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#9ca3af',
                      fontSize: '0.66rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: 0
                    }}
                  >
                    <RotateCcw size={11} /> Reset
                  </button>
                </div>

                {/* Preset Chips */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  {[
                    { id: 'standard', label: 'Standard', b: 100, c: 100, s: 100 },
                    { id: 'anime', label: 'Anime Vivid', b: 102, c: 110, s: 125 },
                    { id: 'cinema', label: 'Cinema Warm', b: 96, c: 108, s: 105 },
                    { id: 'night', label: 'Night Dim', b: 82, c: 95, s: 90 }
                  ].map((p) => {
                    const isSelected = visualPreset === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          const newFilter = { brightness: p.b, contrast: p.c, saturation: p.s };
                          setVisualFilter(newFilter);
                          setVisualPreset(p.id);
                          localStorage.setItem('wt_visual_filter', JSON.stringify(newFilter));
                        }}
                        className={`pouf-item-card ${isSelected ? 'active' : ''}`}
                        style={{ padding: '6px 8px', justifyContent: 'center' }}
                      >
                        <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{p.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Range Sliders */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#e5e7eb', marginBottom: '3px' }}>
                      <span>Brightness</span>
                      <span style={{ color: '#f472b6', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{visualFilter.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="70"
                      max="130"
                      value={visualFilter.brightness}
                      onChange={(e) => handleVisualFilterChange('brightness', parseInt(e.target.value, 10))}
                      className="pouf-range-slider"
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#e5e7eb', marginBottom: '3px' }}>
                      <span>Contrast</span>
                      <span style={{ color: '#f472b6', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{visualFilter.contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="80"
                      max="140"
                      value={visualFilter.contrast}
                      onChange={(e) => handleVisualFilterChange('contrast', parseInt(e.target.value, 10))}
                      className="pouf-range-slider"
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#e5e7eb', marginBottom: '3px' }}>
                      <span>Saturation</span>
                      <span style={{ color: '#f472b6', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{visualFilter.saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={visualFilter.saturation}
                      onChange={(e) => handleVisualFilterChange('saturation', parseInt(e.target.value, 10))}
                      className="pouf-range-slider"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ASPECT RATIO */}
            {activeSettingsTab === 'aspect' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.05em' }}>
                  Aspect Ratio Fit
                </div>

                {[
                  { id: 'contain', label: 'Default Fit (16:9)', desc: 'Standard pillarbox & letterbox ratio' },
                  { id: 'cover', label: 'Cinema Zoom (Cover 21:9)', desc: 'Fills display & eliminates black bars' },
                  { id: 'fill', label: 'Full Stretch (100% Canvas)', desc: 'Fills viewport without cropping' }
                ].map(opt => {
                  const isActive = aspectRatio === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleAspectChange(opt.id)}
                      className={`pouf-item-card ${isActive ? 'active' : ''}`}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.78rem' }}>{opt.label}</div>
                        <div style={{ fontSize: '0.64rem', color: isActive ? '#fce7f3' : '#9ca3af', marginTop: '1px' }}>{opt.desc}</div>
                      </div>
                      {isActive ? (
                        <span className="pouf-badge-active">ACTIVE</span>
                      ) : (
                        <span style={{ fontSize: '0.70rem', color: '#52525b' }}>Select</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* TAB: PLAYBACK SPEED & ROOM SYNC */}
            {activeSettingsTab === 'speed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
                    Playback Speed
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(spd => {
                      const isActive = playbackSpeed === spd;
                      return (
                        <button
                          key={spd}
                          onClick={() => handleSpeedChange(spd)}
                          className={`pouf-item-card ${isActive ? 'active' : ''}`}
                          style={{
                            padding: '8px 2px',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.76rem'
                          }}
                        >
                          <span>{spd === 1.0 ? '1.0x Normal' : `${spd}x`}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <button
                    onClick={() => {
                      onForceSyncAll?.();
                      setShowSettingsMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(245, 158, 11, 0.1) 100%)',
                      border: '1px solid rgba(245, 158, 11, 0.55)',
                      color: '#fef3c7',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(245, 158, 11, 0.25)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Sparkles size={14} color="#fbbf24" />
                    <span>Force Sync Both Viewers</span>
                  </button>
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
