import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { io } from 'socket.io-client';
import Hls from 'hls.js';
import {
  Room as LiveKitRoom,
  RoomEvent,
  Track,
  ParticipantEvent,
  createLocalAudioTrack,
  createLocalVideoTrack,
  LocalAudioTrack,
  LocalVideoTrack,
  AudioPresets,
  VideoPresets,
} from 'livekit-client';
import {
  Play, Pause, Zap, MessageSquare, Maximize, Minimize,
  Link as LinkIcon, Send, X, Film, Folder, Sparkles, Volume2, VolumeX, Users,
  Check, Upload, Type, Mic, MicOff, Settings, Radio, Headphones,
  RotateCcw, Power, Sliders, ChevronDown, ChevronLeft, Smile, AlertCircle, Globe, LogOut, ShieldCheck, FastForward,
  Video, VideoOff
} from 'lucide-react';
import { CreateRoomModal } from './CreateRoomModal';
import { ChatSidebar } from './ChatSidebar';
import { UserAvatar } from './JojoAvatar';
import { PoufPlayer } from './PoufPlayer';
import {
  ClayPopcorn,
  ClayFolder,
  ClayTv,
  ClayFilm,
  ClaySparkle,
  ClayChat,
  ClayPlay,
  ClayPause,
  ClayArrow,
  ClayHeart,
  ClayCheck,
  ClayClose,
  ClayVolume,
  ClayMute,
  ClayFullscreen,
  ClayCompress,
  ClayHeadphones,
  ClaySubtitles,
  ClayUpload
} from './ClayIcons';
import { createNoiseSuppressorNode } from '../services/noiseSuppressor';
import { GiphyPicker } from './GiphyPicker';

function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return '';
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  return m ? m[1] : '';
}

// --------------------------------------------------------------------------
// WebRTC & Studio Audio Configuration
// --------------------------------------------------------------------------
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
};

// Studio Opus SDP modifier (Forces 128kbps high-fidelity voice transmission, forward error correction, continuous voice stream)
function boostOpusSDP(sdp) {
  if (!sdp) return sdp;
  return sdp.replace(/a=fmtp:(\d+)(.*)/g, (match, pt, rest) => {
    if (sdp.includes(`a=rtpmap:${pt} opus/48000`)) {
      let params = rest.trim();
      if (!params.includes('maxaveragebitrate')) {
        params += ';maxaveragebitrate=128000';
      }
      if (!params.includes('cbr=')) {
        params += ';cbr=1';
      }
      if (!params.includes('useinbandfec=')) {
        params += ';useinbandfec=1';
      }
      if (!params.includes('usedtx=')) {
        params += ';usedtx=0';
      }
      return `a=fmtp:${pt} ${params}`;
    }
    return match;
  });
}

// Low-latency Web Audio Synthesizer Beeps for instant mic feedback
function playAudioChirp(type = 'unmute') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    if (type === 'unmute') {
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.09);
    } else {
      osc.frequency.setValueAtTime(680, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.09);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.11);
    osc.start();
    osc.stop(ctx.currentTime + 0.11);
    setTimeout(() => ctx.close(), 250);
  } catch { }
}

export function TheaterRoom({ roomId = 'lounge', currentProfile, appConfig = null, initialMedia, initialTitle, initialType, onNavigate, onConsumeInitialMedia, onOpenAvatarModal }) {
  const [socket, setSocket] = useState(null);
  const [syncStatus, setSyncStatus] = useState('In Sync');
  const [isHost, setIsHost] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const connectedUsersRef = useRef([]);
  useEffect(() => {
    connectedUsersRef.current = connectedUsers;
  }, [connectedUsers]);

  // Reactive playback state for flawless sync across all connected viewers
  const [roomPlaybackState, setRoomPlaybackState] = useState({ isPlaying: false, currentTime: 0 });

  // Active Media & Players
  const [activePlayerType, setActivePlayerType] = useState(() => {
    if (initialType) return initialType;
    if (initialMedia && extractYouTubeId(initialMedia)) return 'youtube';
    if (initialMedia?.includes('neko')) return 'neko';
    if (initialMedia?.includes('.m3u8')) return 'hls';
    if (initialMedia) return 'direct';
    return 'direct';
  });
  const [currentTitle, setCurrentTitle] = useState(initialTitle || 'Watch Lounge');
  const [currentUrl, setCurrentUrl] = useState(initialMedia || '');
  const [mediaInput, setMediaInput] = useState('');

  // Audio & Subtitle Tracks (Interactive with Real Language Names)
  const [audioTracks, setAudioTracks] = useState([]);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [activeAudioIndex, setActiveAudioIndex] = useState(0);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState(0);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleSize, setSubtitleSize] = useState(() => {
    return parseInt(localStorage.getItem('wt_sub_size'), 10) || 24;
  });
  const [subtitlePos, setSubtitlePos] = useState(() => {
    return localStorage.getItem('wt_sub_pos') || 'bottom';
  });

  // Direct Track Selector Popovers
  const [showSubtitlePopover, setShowSubtitlePopover] = useState(false);
  const [showAudioPopover, setShowAudioPopover] = useState(false);
  const [audioStatusData, setAudioStatusData] = useState(null);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);

  const fetchAudioStatus = useCallback(async () => {
    const clean = decodeURIComponent(
      (currentUrl || '')
        .replace('/api/media/stream/', '')
        .replace('/api/media/hls/', '')
        .split('/master.m3u8')[0]
        .split('?')[0]
    );
    if (!clean) return;
    try {
      const res = await fetch(`/api/media/audio-status/${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        setAudioStatusData(data);
      }
    } catch { }
  }, [currentUrl]);

  useEffect(() => {
    if (showAudioPopover) {
      fetchAudioStatus();
      const interval = setInterval(fetchAudioStatus, 2500);
      return () => clearInterval(interval);
    }
  }, [showAudioPopover, fetchAudioStatus]);

  const handleProcessAllAudio = async () => {
    const clean = decodeURIComponent(
      (currentUrl || '')
        .replace('/api/media/stream/', '')
        .replace('/api/media/hls/', '')
        .split('/master.m3u8')[0]
        .split('?')[0]
    );
    if (!clean || isProcessingAudio) return;
    setIsProcessingAudio(true);
    try {
      const token = localStorage.getItem('wt_token') || '';
      await fetch(`/api/media/process-audio/${encodeURIComponent(clean)}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      fetchAudioStatus();
    } catch { }
    setTimeout(() => setIsProcessingAudio(false), 2000);
  };

  // WebRTC Studio Voice State (Smart Sourcing & Push-to-Talk)
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPushToTalking, setIsPushToTalking] = useState(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [remotePeers, setRemotePeers] = useState(new Map()); // peerId -> { username, avatar, color, isSpeaking, isMuted, stream }
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  // Hardware Audio Sourcing (Solves Bluetooth Hands-Free degradation)
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState(() => localStorage.getItem('wt_pref_mic') || '');
  const [selectedAudioOutput, setSelectedAudioOutput] = useState(() => localStorage.getItem('wt_pref_sink') || '');
  const [studioAudioMode, setStudioAudioMode] = useState(() => localStorage.getItem('wt_studio_mode') !== 'false');
  const [noiseSuppressionMode, setNoiseSuppressionMode] = useState(() => {
    return localStorage.getItem('wt_noise_supp_mode') || 'rnnoise';
  });
  const noiseSuppressionModeRef = useRef(noiseSuppressionMode);
  const [micGain, setMicGain] = useState(() => {
    const saved = localStorage.getItem('wt_mic_gain');
    return saved !== null ? Math.max(50, Math.min(200, parseInt(saved, 10) || 100)) : 100;
  });
  const micGainRef = useRef(micGain);
  const [noiseIntensity, setNoiseIntensity] = useState(() => {
    const saved = localStorage.getItem('wt_noise_intensity');
    return saved !== null ? Math.max(0, Math.min(100, parseInt(saved, 10) || 0)) : 0;
  });
  const [isEchoCancellationEnabled, setIsEchoCancellationEnabled] = useState(() => {
    return localStorage.getItem('wt_echo_cancellation') !== 'false';
  });
  const isEchoCancellationEnabledRef = useRef(isEchoCancellationEnabled);
  const [micLevel, setMicLevel] = useState(0);
  const [isNoiseGateOpen, setIsNoiseGateOpen] = useState(false);
  const [showMicPermissionModal, setShowMicPermissionModal] = useState(false);
  const [micPermissionErrorMsg, setMicPermissionErrorMsg] = useState('');
  const [isMicSilentWarning, setIsMicSilentWarning] = useState(false);
  const [dismissedSilenceWarning, setDismissedSilenceWarning] = useState(false);
  const dismissedSilenceWarningRef = useRef(false);
  dismissedSilenceWarningRef.current = dismissedSilenceWarning;
  const noiseIntensityRef = useRef(noiseIntensity);
  const rawHardwareStreamRef = useRef(null);
  const audioNodesRef = useRef(null);

  // LiveKit SFU Studio Voice Engine Refs
  const socketRef = useRef(null);
  const livekitRoomRef = useRef(null);             // LiveKitRoom instance
  const localAudioTrackRef = useRef(null);         // LocalAudioTrack (livekit-client)
  const localVideoTrackRef = useRef(null);         // LocalVideoTrack (livekit-client)
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [remoteVideoTracks, setRemoteVideoTracks] = useState(new Map()); // participantIdentity -> Track
  const remoteAudioElementsRef = useRef(new Map()); // participantIdentity -> HTMLAudioElement
  const audioContextRef = useRef(null);
  const audioAnalyserIntervalRef = useRef(null);
  const isVoiceConnectedRef = useRef(false);
  const isMutedRef = useRef(false);
  const isPushToTalkingRef = useRef(false);
  const isLocalSpeakingRef = useRef(false);

  // Chat System: Floating In-Video Overlay + Chit Chat Mode Split Screen + Persistent Sidebar
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(false);
  const [renderChatSidebar, setRenderChatSidebar] = useState(false);
  const [isChatClosing, setIsChatClosing] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const isChatSidebarOpenRef = useRef(false);
  isChatSidebarOpenRef.current = isChatSidebarOpen;
  const [isChitChatMode, setIsChitChatMode] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [roomLastSeen, setRoomLastSeen] = useState({});
  const isChitChatModeRef = useRef(false);
  const isChatCollapsedRef = useRef(false);

  // Discord-Style Voice Volume Controls & Boost
  const [peerVolumes, setPeerVolumes] = useState(new Map()); // peerId -> volume (0 to 200)
  const peerGainNodesRef = useRef(new Map()); // peerId -> { ctx, gainNode }
  const [voiceSettingsTab, setVoiceSettingsTab] = useState('mic'); // 'mic' | 'peers'
  const [isHoveringExitChitChat, setIsHoveringExitChitChat] = useState(false);

  const handlePeerVolume = useCallback((peerId, vol) => {
    const numericVol = Math.max(0, Math.min(200, Number(vol)));
    setPeerVolumes((prev) => {
      const next = new Map(prev);
      next.set(peerId, numericVol);
      return next;
    });

    const gainEntry = peerGainNodesRef.current.get(peerId);
    if (gainEntry && gainEntry.gainNode) {
      gainEntry.gainNode.gain.value = numericVol / 100;
    } else {
      const audioEl = remoteAudioElementsRef.current.get(peerId);
      if (audioEl) audioEl.volume = Math.min(1.0, numericVol / 100);
    }
  }, []);

  useEffect(() => {
    isChitChatModeRef.current = isChitChatMode;
  }, [isChitChatMode]);

  useEffect(() => {
    isChatCollapsedRef.current = isChatCollapsed;
  }, [isChatCollapsed]);

  const handleMarkChatSeen = useCallback(() => {
    setUnreadChatCount(0);
    socketRef.current?.emit('chat:seen', {
      roomId,
      username: currentProfile.name || currentProfile.username,
      timestamp: Date.now()
    });
  }, [roomId, currentProfile.name, currentProfile.username]);

  const handleEnterChitChat = useCallback(() => {
    // If native container fullscreen was active, exit it so sidechat is visible beside video
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => { });
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    setIsChitChatMode(true);
    document.body.classList.add('in-chit-chat-mode');
    setIsChatCollapsed(false);
    setIsChatSidebarOpen(false);
    handleMarkChatSeen();
  }, [handleMarkChatSeen]);

  const handleExitChitChat = useCallback(() => {
    setIsChitChatMode(false);
    document.body.classList.remove('in-chit-chat-mode');
    setIsChatCollapsed(false);
  }, []);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [libraryFiles, setLibraryFiles] = useState([]);

  // Toast & Autoplay prompt
  const [isToastActive, setIsToastActive] = useState(false);
  const [toastContent, setToastContent] = useState({ text: '', icon: null });
  const [needsUserClickToPlay, setNeedsUserClickToPlay] = useState(false);
  const [needsVoiceAudioUnlock, setNeedsVoiceAudioUnlock] = useState(false);

  // In-Video Floating Chat Overlay (auto-fades with smooth transition)
  const [artPlayerDomEl, setArtPlayerDomEl] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [renderFloatingChat, setRenderFloatingChat] = useState(false);
  const [isFloatingChatClosing, setIsFloatingChatClosing] = useState(false);
  const [chatInputText, setChatInputText] = useState('');
  const [showFloatingGiphy, setShowFloatingGiphy] = useState(false);
  const [recentMessages, setRecentMessages] = useState([]);
  const [quickBubbleEmojis, setQuickBubbleEmojis] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('wt_quick_emojis') || 'null');
      const list = Array.isArray(saved) && saved.length > 0 ? saved.filter((x) => typeof x === 'string' && x.trim()) : ['❤️', '🔥', '😂'];
      const usage = JSON.parse(localStorage.getItem('wt_quick_emoji_usage') || '{}');
      const hasUsage = list.some((em) => (Number(usage[em]) || 0) > 0);
      const ranked = hasUsage
        ? [...list].sort((a, b) => (Number(usage[b]) || 0) - (Number(usage[a]) || 0))
        : list;
      return ranked.slice(0, 3);
    } catch {
      return ['❤️', '🔥', '😂'];
    }
  });

  useEffect(() => {
    const syncTopEmojis = () => {
      try {
        const saved = JSON.parse(localStorage.getItem('wt_quick_emojis') || 'null');
        const list = Array.isArray(saved) && saved.length > 0 ? saved.filter((x) => typeof x === 'string' && x.trim()) : ['❤️', '🔥', '😂'];
        const usage = JSON.parse(localStorage.getItem('wt_quick_emoji_usage') || '{}');
        const hasUsage = list.some((em) => (Number(usage[em]) || 0) > 0);
        const ranked = hasUsage
          ? [...list].sort((a, b) => (Number(usage[b]) || 0) - (Number(usage[a]) || 0))
          : list;
        setQuickBubbleEmojis(ranked.slice(0, 3));
      } catch {
        setQuickBubbleEmojis(['❤️', '🔥', '😂']);
      }
    };
    window.addEventListener('storage', syncTopEmojis);
    window.addEventListener('wt_quick_emojis_updated', syncTopEmojis);
    return () => {
      window.removeEventListener('storage', syncTopEmojis);
      window.removeEventListener('wt_quick_emojis_updated', syncTopEmojis);
    };
  }, []);

  useEffect(() => {
    if (chatOpen) {
      setRenderFloatingChat(true);
      setIsFloatingChatClosing(false);
      return undefined;
    }
    if (!renderFloatingChat) return undefined;
    setIsFloatingChatClosing(true);
    const closeTimer = setTimeout(() => {
      setRenderFloatingChat(false);
      setIsFloatingChatClosing(false);
    }, 220);
    return () => clearTimeout(closeTimer);
  }, [chatOpen, renderFloatingChat]);

  const handleFloatingEmojiTap = (em) => {
    setChatInputText((prev) => prev + em);
    resetChatInactivityTimer();
    try {
      const counts = JSON.parse(localStorage.getItem('wt_quick_emoji_usage') || '{}');
      counts[em] = (Number(counts[em]) || 0) + 1;
      localStorage.setItem('wt_quick_emoji_usage', JSON.stringify(counts));
      window.dispatchEvent(new Event('wt_quick_emojis_updated'));
    } catch { }
    const visibleInputs = document.querySelectorAll('.floating-chat-input');
    for (const el of visibleInputs) {
      if (el.offsetParent !== null) {
        el.focus();
        return;
      }
    }
    chatInputRef.current?.focus();
  };

  const closeFloatingBubbleChat = () => {
    setChatOpen(false);
    setShowFloatingGiphy(false);
    setChatInputText('');
    if (activePlayerType === 'neko') {
      setTimeout(() => nekoIframeRef.current?.focus?.(), 50);
    } else {
      setTimeout(() => focusTheaterStage(), 10);
    }
  };

  // Refs
  const theaterWrapperRef = useRef(null);
  const theaterCanvasRef = useRef(null);
  const theaterDeckRef = useRef(null);
  const fsCurtainRef = useRef(null);
  const ambientDeckCanvasRef = useRef(null);
  const fsWasActiveRef = useRef(false);
  const fsStageAnimRef = useRef(null);
  const fsDeckAnimRef = useRef(null);
  const fsDeckTimerRef = useRef(null);
  const fsAuxAnimsRef = useRef([]);
  const [ambientEnabled, setAmbientEnabled] = useState(() => {
    try { return localStorage.getItem('wt_ambient_deck') !== 'false'; } catch { return true; }
  });
  const isLoungeScreen = roomId === 'lounge';
  const isAmbientActive = ambientEnabled && isLoungeScreen;
  const toggleAmbientMode = () => {
    setAmbientEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem('wt_ambient_deck', String(next)); } catch { }
      try { window.dispatchEvent(new CustomEvent('wt_ambient_change', { detail: { enabled: next } })); } catch { }
      return next;
    });
  };
  const artContainerRef = useRef(null);
  const artInstanceRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const chatInputRef = useRef(null);
  const subtitleFileInputRef = useRef(null);
  const chatFadeTimerRef = useRef(null);
  const isRemoteActionRef = useRef(false);
  const remoteActionTimeoutRef = useRef(null);
  const pendingPlaybackRef = useRef(null);
  const isBufferingRef = useRef(false);
  const isSeekingRef = useRef(false);
  const initialBufferDoneRef = useRef(false);
  const [barrierState, setBarrierState] = useState(null); // Synchronized Seek Barrier (Ready Gate) state

  // Metronome & Drift Watchdog Refs
  const serverSyncStateRef = useRef({
    currentTime: 0,
    isPlaying: false,
    playbackRate: 1.0,
    receivedAt: 0
  });
  const outOfSyncSecondsRef = useRef(0);
  const lastForceSyncTimestampRef = useRef(0);


  function setRemoteLock(duration = 800) {
    isRemoteActionRef.current = true;
    if (remoteActionTimeoutRef.current) clearTimeout(remoteActionTimeoutRef.current);
    remoteActionTimeoutRef.current = setTimeout(() => {
      isRemoteActionRef.current = false;
    }, duration);
  }

  function showToast(text, icon = null) {
    const resolvedIcon = icon || <Sparkles size={15} color="var(--pink-primary)" />;
    setToastContent({ text, icon: resolvedIcon });
    setIsToastActive(true);
    setTimeout(() => setIsToastActive(false), 2400);
  }

  // Keep active status refs synchronized
  useEffect(() => {
    isVoiceConnectedRef.current = isVoiceConnected;
  }, [isVoiceConnected]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isPushToTalkingRef.current = isPushToTalking;
  }, [isPushToTalking]);

  useEffect(() => {
    isChatSidebarOpenRef.current = isChatSidebarOpen;
  }, [isChatSidebarOpen]);

  useEffect(() => {
    if (isChatSidebarOpen) {
      setRenderChatSidebar(true);
      setIsChatClosing(false);
      return undefined;
    }
    if (!renderChatSidebar) return undefined;
    setIsChatClosing(true);
    const closeTimer = setTimeout(() => {
      setRenderChatSidebar(false);
      setIsChatClosing(false);
    }, 260);
    return () => clearTimeout(closeTimer);
  }, [isChatSidebarOpen, renderChatSidebar]);

  // 1. Hardware Audio Device Enumeration (Mic, Headphones) with Anti-Bluetooth Hands-Free Guard
  async function refreshMediaDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devs = await navigator.mediaDevices.enumerateDevices();
      const aInputs = devs.filter((d) => d.kind === 'audioinput').map((d, i) => ({
        ...d,
        label: d.label || `Microphone ${i + 1}`,
        deviceId: d.deviceId || `default-${i}`
      }));
      const aOutputs = devs.filter((d) => d.kind === 'audiooutput').map((d, i) => ({
        ...d,
        label: d.label || `Speaker/Headphones ${i + 1}`,
        deviceId: d.deviceId || `default-${i}`
      }));
      setAudioInputDevices(aInputs);
      setAudioOutputDevices(aOutputs);

      // Microphone Selection:
      // Respect saved preference if present. Otherwise default to user's primary/first device.
      // NEVER force or lock the laptop mic — user has full freedom to select ANY mic!
      const savedInput = localStorage.getItem('wt_pref_mic');
      if (savedInput && aInputs.some((d) => d.deviceId === savedInput)) {
        setSelectedAudioInput(savedInput);
      } else if (aInputs.length > 0) {
        setSelectedAudioInput(aInputs[0].deviceId);
      }

      if (!selectedAudioOutput && aOutputs.length > 0) {
        setSelectedAudioOutput(aOutputs[0].deviceId);
      }
    } catch (err) {
      console.warn('Error enumerating audio devices:', err);
    }
  }

  // LiveKit SFU Studio Voice Engine
  // --------------------------------------------------------------------------
  function cleanupLocalAudioPipeline({ closeContext = false } = {}) {
    if (audioNodesRef.current) {
      const nodes = audioNodesRef.current;
      try { nodes.source?.disconnect(); } catch { }
      try { nodes.inputGain?.disconnect(); } catch { }
      try { nodes.suppressor?.disconnect(); } catch { }
      try { nodes.analyser?.disconnect(); } catch { }
      try { nodes.gateGain?.disconnect(); } catch { }
      try { nodes.dest?.disconnect(); } catch { }
      try {
        nodes.dest?.stream?.getTracks().forEach((t) => {
          try { t.stop(); } catch { }
        });
      } catch { }
      audioNodesRef.current = null;
    }
    if (rawHardwareStreamRef.current) {
      try {
        rawHardwareStreamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch { }
        });
      } catch { }
      rawHardwareStreamRef.current = null;
    }
    if (closeContext && audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
  }

  async function buildProcessedLocalAudio({ deviceId, mode = 'rnnoise', echoCancellation = true } = {}) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('WebAudio API not available');
    }

    cleanupLocalAudioPipeline({ closeContext: false });

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContextClass();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => { });
    }

    let supNode = null;
    const wantsSuppressor = mode !== 'raw' && mode !== 'bypass' && mode !== 'off';
    if (wantsSuppressor) {
      try {
        const sup = await createNoiseSuppressorNode(ctx, mode);
        if (sup?.node) {
          supNode = sup.node;
        }
      } catch (err) {
        console.warn('Noise suppressor worklet unavailable, falling back to browser NS:', err);
      }
    }

    const constraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: Boolean(echoCancellation),
        // Avoid double-filtering when our AudioWorklet suppressor is active; fallback to browser NS if worklet failed
        noiseSuppression: wantsSuppressor && !supNode,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    };

    const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
    rawHardwareStreamRef.current = rawStream;

    const source = ctx.createMediaStreamSource(rawStream);
    const inputGain = ctx.createGain();
    inputGain.gain.value = (micGainRef.current || 100) / 100;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.25;

    const gateGain = ctx.createGain();
    const initialThresh = noiseIntensityRef.current === 0 ? 0 : Math.max(1, Math.round(noiseIntensityRef.current * 0.55));
    gateGain.gain.value = initialThresh === 0 ? 1 : 0;

    const dest = ctx.createMediaStreamDestination();

    source.connect(inputGain);
    if (supNode) {
      inputGain.connect(supNode);
      supNode.connect(analyser);
    } else {
      inputGain.connect(analyser);
    }
    // Analyser sits upstream of gateGain so closed gate still detects speech onset
    analyser.connect(gateGain);
    gateGain.connect(dest);

    audioNodesRef.current = { source, inputGain, suppressor: supNode, analyser, gateGain, dest };

    const processedTrack = dest.stream.getAudioTracks()[0];
    if (!processedTrack) {
      throw new Error('Failed to create processed audio stream track');
    }

    return { track: processedTrack, analyser, ctx, constraints: constraints.audio };
  }

  async function rebuildLiveProcessedMicTrack({
    deviceId = selectedAudioInput || undefined,
    mode = noiseSuppressionModeRef.current || 'rnnoise',
    echoCancellation = isEchoCancellationEnabledRef.current,
  } = {}) {
    if (!isVoiceConnectedRef.current || !localAudioTrackRef.current) return;
    const processed = await buildProcessedLocalAudio({ deviceId, mode, echoCancellation });
    await localAudioTrackRef.current.replaceTrack(processed.track, true);
    setupAnalyser(processed.analyser);
  }

  function setupAnalyser(analyserOrTrack) {
    if (audioAnalyserIntervalRef.current) {
      clearInterval(audioAnalyserIntervalRef.current);
      audioAnalyserIntervalRef.current = null;
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => { });
      }

      let analyser = null;
      if (analyserOrTrack && typeof analyserOrTrack.getByteFrequencyData === 'function') {
        analyser = analyserOrTrack;
      } else if (analyserOrTrack) {
        const stream = new MediaStream([analyserOrTrack]);
        const source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.25;
        source.connect(analyser);
      }
      if (!analyser) return;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let speakingTicks = 0;
      let silentTicks = 0;
      let gateHoldTicks = 0;
      let lastGateOpen = null;

      audioAnalyserIntervalRef.current = setInterval(() => {
        const activeCtx = audioContextRef.current;
        const gateNode = audioNodesRef.current?.gateGain;

        if (!isVoiceConnectedRef.current || isMutedRef.current) {
          silentTicks = 0;
          gateHoldTicks = 0;
          setIsMicSilentWarning(false);
          if (gateNode && activeCtx && activeCtx.state !== 'closed') {
            gateNode.gain.setTargetAtTime(0, activeCtx.currentTime, 0.02);
          }
          if (isLocalSpeakingRef.current) {
            isLocalSpeakingRef.current = false;
            setIsLocalSpeaking(false);
            socketRef.current?.emit('voice:speaking', { isSpeaking: false });
          }
          setMicLevel(0);
          if (lastGateOpen !== false) {
            lastGateOpen = false;
            setIsNoiseGateOpen(false);
          }
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const levelPct = Math.min(100, Math.round((avg / 120) * 100));
        setMicLevel(levelPct);

        // Apply Noise Gate with ~300ms hold tail to avoid clipping word endings
        const sliderVal = noiseIntensityRef.current || 0;
        const thresholdPct = sliderVal === 0 ? 0 : Math.max(1, Math.round(sliderVal * 0.55));
        let gateOpen = true;
        if (thresholdPct > 0) {
          if (levelPct >= thresholdPct) {
            gateHoldTicks = 6;
            gateOpen = true;
          } else if (gateHoldTicks > 0) {
            gateHoldTicks--;
            gateOpen = true;
          } else {
            gateOpen = false;
          }
        } else {
          gateHoldTicks = 0;
        }

        if (gateNode && activeCtx && activeCtx.state !== 'closed') {
          gateNode.gain.setTargetAtTime(gateOpen ? 1 : 0, activeCtx.currentTime, gateOpen ? 0.012 : 0.06);
        }

        if (lastGateOpen !== gateOpen) {
          lastGateOpen = gateOpen;
          setIsNoiseGateOpen(gateOpen);
        }

        // Silence diagnosis tracking
        if (avg < 2.0) {
          if (!dismissedSilenceWarningRef.current) {
            silentTicks++;
            if (silentTicks > 75) {
              setIsMicSilentWarning(true);
            }
          }
        } else {
          silentTicks = 0;
          setIsMicSilentWarning(false);
        }

        const isSpeakingNow = gateOpen && avg > 12;
        if (isSpeakingNow) {
          speakingTicks = Math.min(speakingTicks + 1, 5);
        } else {
          speakingTicks = Math.max(speakingTicks - 1, 0);
        }

        const active = speakingTicks >= 2;
        if (active !== isLocalSpeakingRef.current) {
          isLocalSpeakingRef.current = active;
          setIsLocalSpeaking(active);
          socketRef.current?.emit('voice:speaking', { isSpeaking: active });
        }
      }, 50);
    } catch (err) {
      console.warn('setupAnalyser error:', err);
    }
  }

  async function handleNoiseModeChange(newMode) {
    setNoiseSuppressionMode(newMode);
    noiseSuppressionModeRef.current = newMode;
    localStorage.setItem('wt_noise_supp_mode', newMode);
    if (isVoiceConnectedRef.current && localAudioTrackRef.current) {
      try {
        await rebuildLiveProcessedMicTrack({ mode: newMode });
        showToast(`Noise Suppression: ${newMode.toUpperCase()}`, <ShieldCheck size={15} color="var(--pink-primary)" />);
      } catch (err) {
        console.warn('Failed to update noise suppression mode:', err);
      }
    }
  }

  function handleNoiseIntensityChange(val) {
    const num = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
    setNoiseIntensity(num);
    noiseIntensityRef.current = num;
    localStorage.setItem('wt_noise_intensity', String(num));
  }

  function handleMicGainChange(val) {
    const num = Math.max(50, Math.min(200, parseInt(val, 10) || 100));
    setMicGain(num);
    micGainRef.current = num;
    localStorage.setItem('wt_mic_gain', String(num));
    const nodes = audioNodesRef.current;
    const ctx = audioContextRef.current;
    if (nodes?.inputGain && ctx && ctx.state !== 'closed') {
      if (ctx.state === 'suspended') ctx.resume().catch(() => { });
      nodes.inputGain.gain.setTargetAtTime(num / 100, ctx.currentTime, 0.02);
    }
  }

  async function handleEchoCancellationToggle() {
    const nextVal = !isEchoCancellationEnabled;
    setIsEchoCancellationEnabled(nextVal);
    isEchoCancellationEnabledRef.current = nextVal;
    localStorage.setItem('wt_echo_cancellation', String(nextVal));
    if (isVoiceConnectedRef.current && localAudioTrackRef.current) {
      try {
        await rebuildLiveProcessedMicTrack({ echoCancellation: nextVal });
        showToast(nextVal ? 'Echo Cancellation Active' : 'Echo Cancellation Disabled', <ShieldCheck size={15} color="var(--pink-primary)" />);
      } catch (err) {
        console.warn('Error applying echo cancellation change:', err);
      }
    }
  }

  // ==========================================================================
  // LiveKit SFU Full-Duplex Voice Engine + Dual-Ear Stereo Pipeline
  // ==========================================================================
  const isConnectingVoiceRef = useRef(false);

  // Automatically connects to LiveKit SFU room in listening mode (or with mic)
  // Guarantees all participants in the lounge hear each other without refreshing or toggling
  async function connectVoiceRoom({ publishMic = false } = {}) {
    if (livekitRoomRef.current && livekitRoomRef.current.state === 'connected') {
      if (publishMic && !localAudioTrackRef.current) {
        return publishLocalMic();
      }
      return;
    }

    if (isConnectingVoiceRef.current) return;
    isConnectingVoiceRef.current = true;

    try {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume().catch(() => { });
      }

      // 1. Fetch LiveKit access token from server
      const myId = socketRef.current?.id || `user-${Date.now()}`;
      const myUsername = currentProfile?.name || 'User';

      const resp = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, identity: myId, username: myUsername })
      });

      if (!resp.ok) {
        throw new Error(`Failed to get voice token (${resp.status})`);
      }
      const { token, url } = await resp.json();

      // 2. Disconnect previous instance if any
      if (livekitRoomRef.current) {
        try { livekitRoomRef.current.disconnect(); } catch { }
        livekitRoomRef.current = null;
      }

      // 3. Create LiveKit SFU Room
      const lkRoom = new LiveKitRoom({
        audioCaptureDefaults: {
          deviceId: selectedAudioInput || undefined,
          echoCancellation: isEchoCancellationEnabledRef.current,
          noiseSuppression: (noiseSuppressionModeRef.current || 'rnnoise') !== 'raw' && (noiseSuppressionModeRef.current || 'rnnoise') !== 'bypass',
          autoGainControl: true,
        },
        adaptiveStream: false,
        dynacast: false,
      });
      livekitRoomRef.current = lkRoom;

      // 4. Remote Track Subscriptions with Dual-Ear Stereo Pipeline
      lkRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const audioEl = track.attach();
          audioEl.id = `remote-audio-${participant.identity}`;
          audioEl.autoplay = true;
          audioEl.playsInline = true;

          const vol = peerVolumes.get(participant.identity) ?? 100;

          // Dual-Ear Stereo Pipeline: Duplicates mono/left mic voice to BOTH Left (0) and Right (1) channels!
          // Completely solves the fatal "one side voice / left-ear only" issue on Windows & headphones.
          try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass && track.mediaStreamTrack) {
              const stream = new MediaStream([track.mediaStreamTrack]);
              let gainEntry = peerGainNodesRef.current.get(participant.identity);
              if (!gainEntry) {
                const ctx = new AudioContextClass();
                const source = ctx.createMediaStreamSource(stream);
                const gainNode = ctx.createGain();
                const merger = ctx.createChannelMerger(2);

                source.connect(gainNode);
                gainNode.connect(merger, 0, 0); // Pipe to Left ear
                gainNode.connect(merger, 0, 1); // Pipe identical voice to Right ear
                merger.connect(ctx.destination);

                gainNode.gain.value = vol / 100;
                gainEntry = { ctx, source, gainNode, merger };
                peerGainNodesRef.current.set(participant.identity, gainEntry);

                if (ctx.state === 'suspended') {
                  ctx.resume().catch(() => { });
                }
                // Mute raw audio element to avoid unbalanced echo
                audioEl.volume = 0;
              } else {
                gainEntry.gainNode.gain.value = vol / 100;
                if (gainEntry.ctx && gainEntry.ctx.state === 'suspended') {
                  gainEntry.ctx.resume().catch(() => { });
                }
                audioEl.volume = 0;
              }
            } else {
              audioEl.volume = Math.max(0, Math.min(1.0, vol / 100));
            }
          } catch (e) {
            console.warn('Dual-ear voice pipeline fallback to raw audio element:', e);
            audioEl.volume = Math.max(0, Math.min(1.0, vol / 100));
          }

          let hub = document.getElementById('wt-remote-audio-hub');
          if (!hub) {
            hub = document.createElement('div');
            hub.id = 'wt-remote-audio-hub';
            hub.style.position = 'fixed';
            hub.style.left = '-9999px';
            hub.style.top = '-9999px';
            hub.style.width = '1px';
            hub.style.height = '1px';
            hub.style.opacity = '0.01';
            hub.style.pointerEvents = 'none';
            hub.setAttribute('aria-hidden', 'true');
            document.body.appendChild(hub);
          }
          hub.appendChild(audioEl);
          remoteAudioElementsRef.current.set(participant.identity, audioEl);

          if (selectedAudioOutput && typeof audioEl.setSinkId === 'function') {
            audioEl.setSinkId(selectedAudioOutput).catch(() => { });
          }

          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn('Remote audio waiting for interaction:', err);
              setNeedsVoiceAudioUnlock(true);
              const unlock = () => {
                audioEl.play().then(() => setNeedsVoiceAudioUnlock(false)).catch(() => { });
                const entry = peerGainNodesRef.current.get(participant.identity);
                if (entry && entry.ctx && entry.ctx.state === 'suspended') {
                  entry.ctx.resume().catch(() => { });
                }
                window.removeEventListener('click', unlock);
                window.removeEventListener('keydown', unlock);
                window.removeEventListener('touchstart', unlock);
              };
              window.addEventListener('click', unlock, { once: true });
              window.addEventListener('keydown', unlock, { once: true });
              window.addEventListener('touchstart', unlock, { once: true });
            });
          }

          setRemotePeers((prev) => {
            const next = new Map(prev);
            const user = connectedUsersRef.current.find((u) => u.id === participant.identity);
            next.set(participant.identity, {
              username: participant.name || user?.username || 'Partner',
              avatar: user?.avatar || 'jojo-star',
              color: user?.color || '#f472b6',
              isSpeaking: false,
              isMuted: false,
            });
            return next;
          });
        } else if (track.kind === Track.Kind.Video) {
          setRemoteVideoTracks((prev) => {
            const next = new Map(prev);
            next.set(participant.identity, track);
            return next;
          });
          setRemotePeers((prev) => {
            const next = new Map(prev);
            const user = connectedUsersRef.current.find((u) => u.id === participant.identity);
            const peer = next.get(participant.identity) || {
              username: participant.name || user?.username || 'Partner',
              avatar: user?.avatar || 'jojo-star',
              color: user?.color || '#f472b6',
              isSpeaking: false,
              isMuted: false,
            };
            next.set(participant.identity, { ...peer, hasVideo: true });
            return next;
          });
        }
      });

      lkRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        track.detach();
        if (track.kind === Track.Kind.Video) {
          setRemoteVideoTracks((prev) => {
            const next = new Map(prev);
            next.delete(participant.identity);
            return next;
          });
          setRemotePeers((prev) => {
            const next = new Map(prev);
            const peer = next.get(participant.identity);
            if (peer) next.set(participant.identity, { ...peer, hasVideo: false });
            return next;
          });
          return;
        }
        const el = remoteAudioElementsRef.current.get(participant.identity);
        if (el) {
          try {
            el.pause();
            el.srcObject = null;
            if (el.parentNode) el.parentNode.removeChild(el);
          } catch { }
          remoteAudioElementsRef.current.delete(participant.identity);
        }
        const gainEntry = peerGainNodesRef.current.get(participant.identity);
        if (gainEntry) {
          try {
            if (gainEntry.source) gainEntry.source.disconnect();
            if (gainEntry.gainNode) gainEntry.gainNode.disconnect();
            if (gainEntry.merger) gainEntry.merger.disconnect();
            if (gainEntry.ctx && gainEntry.ctx.state !== 'closed') gainEntry.ctx.close().catch(() => { });
          } catch { }
          peerGainNodesRef.current.delete(participant.identity);
        }
        setRemotePeers((prev) => {
          const next = new Map(prev);
          next.delete(participant.identity);
          return next;
        });
      });

      lkRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const speakingSet = new Set(speakers.map((s) => s.identity));
        setRemotePeers((prev) => {
          let changed = false;
          const next = new Map(prev);
          next.forEach((peer, id) => {
            const isSpeaking = speakingSet.has(id);
            if (peer.isSpeaking !== isSpeaking) {
              next.set(id, { ...peer, isSpeaking });
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      });

      lkRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
        const el = remoteAudioElementsRef.current.get(participant.identity);
        if (el) {
          try {
            el.pause();
            el.srcObject = null;
            if (el.parentNode) el.parentNode.removeChild(el);
          } catch { }
          remoteAudioElementsRef.current.delete(participant.identity);
        }
        const gainEntry = peerGainNodesRef.current.get(participant.identity);
        if (gainEntry) {
          try {
            if (gainEntry.source) gainEntry.source.disconnect();
            if (gainEntry.gainNode) gainEntry.gainNode.disconnect();
            if (gainEntry.merger) gainEntry.merger.disconnect();
            if (gainEntry.ctx && gainEntry.ctx.state !== 'closed') gainEntry.ctx.close().catch(() => { });
          } catch { }
          peerGainNodesRef.current.delete(participant.identity);
        }
        setRemotePeers((prev) => {
          const next = new Map(prev);
          next.delete(participant.identity);
          return next;
        });
      });

      // 5. Connect to LiveKit server
      await lkRoom.connect(url, token);

      if (publishMic) {
        await publishLocalMic();
      }
    } catch (err) {
      console.warn('Voice room connection error:', err);
    } finally {
      isConnectingVoiceRef.current = false;
    }
  }

  // Publishes user's microphone track to the LiveKit SFU room
  async function publishLocalMic() {
    try {
      showToast('Connecting microphone...', <Mic size={15} color="var(--pink-primary)" />);
      const lkRoom = livekitRoomRef.current;
      if (!lkRoom || lkRoom.state !== 'connected') {
        await connectVoiceRoom({ publishMic: true });
        return;
      }

      const mode = noiseSuppressionModeRef.current || 'rnnoise';
      const ecEnabled = isEchoCancellationEnabledRef.current;
      let audioTrack = null;
      let analyserNode = null;

      try {
        const processed = await buildProcessedLocalAudio({
          deviceId: selectedAudioInput || undefined,
          mode,
          echoCancellation: ecEnabled,
        });
        audioTrack = new LocalAudioTrack(processed.track, processed.constraints, true, processed.ctx);
        analyserNode = processed.analyser;
      } catch (dspErr) {
        console.warn('WebAudio DSP pipeline unavailable, falling back to raw LiveKit mic:', dspErr);
        cleanupLocalAudioPipeline({ closeContext: false });
        audioTrack = await createLocalAudioTrack({
          deviceId: selectedAudioInput || undefined,
          echoCancellation: ecEnabled,
          noiseSuppression: mode !== 'raw' && mode !== 'bypass',
          autoGainControl: true,
        });
      }

      localAudioTrackRef.current = audioTrack;

      await lkRoom.localParticipant.publishTrack(audioTrack, {
        audioBitrate: studioAudioMode ? 128000 : 64000,
        dtx: false,
      });

      setupAnalyser(analyserNode || audioTrack.mediaStreamTrack);

      isVoiceConnectedRef.current = true;
      setIsVoiceConnected(true);
      isMutedRef.current = false;
      setIsMuted(false);

      socketRef.current?.emit('voice:join', { hasAudio: true, hasVideo: false });
      socketRef.current?.emit('voice:track_state', { isMuted: false, hasVideo: false });

      refreshMediaDevices();
      playAudioChirp('unmute');
      showToast('Microphone live', <Mic size={15} color="var(--pink-primary)" />);
    } catch (err) {
      console.warn('Microphone start error:', err);
      cleanupLocalAudioPipeline({ closeContext: false });
      setShowMicPermissionModal(true);
      setMicPermissionErrorMsg(err.message || 'Microphone access denied. Please allow permissions in browser or system settings.');
      showToast('Microphone access blocked', <AlertCircle size={15} color="#ef4444" />);
    }
  }

  const startMicrophone = () => publishLocalMic();

  function leaveVoiceChat() {
    if (livekitRoomRef.current) {
      try { livekitRoomRef.current.disconnect(); } catch { }
      livekitRoomRef.current = null;
    }
    if (localAudioTrackRef.current) {
      try { localAudioTrackRef.current.stop(); } catch { }
      localAudioTrackRef.current = null;
    }
    if (localVideoTrackRef.current) {
      try { localVideoTrackRef.current.stop(); } catch { }
      localVideoTrackRef.current = null;
    }
    setLocalVideoTrack(null);
    setIsCameraEnabled(false);
    setRemoteVideoTracks(new Map());
    remoteAudioElementsRef.current.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
        if (el.parentNode) el.parentNode.removeChild(el);
      } catch { }
    });
    remoteAudioElementsRef.current.clear();

    peerGainNodesRef.current.forEach((entry) => {
      try {
        if (entry.source) entry.source.disconnect();
        if (entry.gainNode) entry.gainNode.disconnect();
        if (entry.merger) entry.merger.disconnect();
        if (entry.ctx && entry.ctx.state !== 'closed') entry.ctx.close().catch(() => { });
      } catch { }
    });
    peerGainNodesRef.current.clear();

    if (audioAnalyserIntervalRef.current) {
      clearInterval(audioAnalyserIntervalRef.current);
      audioAnalyserIntervalRef.current = null;
    }
    cleanupLocalAudioPipeline({ closeContext: true });
    isVoiceConnectedRef.current = false;
    setIsVoiceConnected(false);
    isMutedRef.current = true;
    setIsMuted(true);
    setIsLocalSpeaking(false);
    isLocalSpeakingRef.current = false;
    setMicLevel(0);
    setIsNoiseGateOpen(false);
    setRemotePeers(new Map());
    socketRef.current?.emit('voice:leave');
    playAudioChirp('disconnect');
    showToast('Microphone disconnected', <MicOff size={15} color="#9ca3af" />);
  }

  const joinVoiceChat = startMicrophone;

  // Toggle Mute without disconnecting: partners can always hear each other
  async function handleToggleMute() {
    if (!localAudioTrackRef.current) {
      await publishLocalMic();
      return;
    }

    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    if (localAudioTrackRef.current) {
      if (nextMuted) {
        await localAudioTrackRef.current.mute().catch(() => { });
      } else {
        await localAudioTrackRef.current.unmute().catch(() => { });
      }
    }
    socketRef.current?.emit('voice:track_state', { isMuted: nextMuted, hasVideo: !!isCameraEnabledRef.current });
    playAudioChirp(nextMuted ? 'mute' : 'unmute');
    showToast(nextMuted ? 'Microphone Muted' : 'Microphone Live', nextMuted ? <MicOff size={15} color="#ef4444" /> : <Mic size={15} color="var(--pink-primary)" />);
  }

  const isCameraEnabledRef = useRef(false);
  isCameraEnabledRef.current = isCameraEnabled;

  // Toggle Camera / Webcam Live Video
  async function toggleCamera() {
    if (isCameraStarting) return;
    if (isCameraEnabled) {
      setIsCameraStarting(true);
      try {
        if (localVideoTrackRef.current) {
          if (livekitRoomRef.current?.localParticipant) {
            try {
              await livekitRoomRef.current.localParticipant.unpublishTrack(localVideoTrackRef.current);
            } catch (unpubErr) {
              console.warn('Error unpublishing camera track:', unpubErr);
            }
          }
          localVideoTrackRef.current.stop();
          localVideoTrackRef.current = null;
        }
        setLocalVideoTrack(null);
        setIsCameraEnabled(false);
        socketRef.current?.emit('voice:track_state', { isMuted: isMutedRef.current, hasVideo: false });
        showToast('Webcam turned off', <VideoOff size={15} color="#9ca3af" />);
      } catch (err) {
        console.warn('Error turning off camera:', err);
      } finally {
        setIsCameraStarting(false);
      }
    } else {
      setIsCameraStarting(true);
      try {
        if (!livekitRoomRef.current || livekitRoomRef.current.state !== 'connected') {
          await publishLocalMic();
        }

        const lkRoom = livekitRoomRef.current;
        if (!lkRoom || lkRoom.state !== 'connected') {
          throw new Error('Voice & Video room is not connected.');
        }

        const vTrack = await createLocalVideoTrack({
          facingMode: 'user',
          resolution: VideoPresets.h540,
        });

        localVideoTrackRef.current = vTrack;
        setLocalVideoTrack(vTrack);

        await lkRoom.localParticipant.publishTrack(vTrack, {
          simulcast: true,
          videoCodec: 'vp8',
        });

        setIsCameraEnabled(true);
        socketRef.current?.emit('voice:track_state', { isMuted: isMutedRef.current, hasVideo: true });
        showToast('Webcam live', <Video size={15} color="var(--pink-primary)" />);
      } catch (err) {
        console.warn('Camera start error:', err);
        if (localVideoTrackRef.current) {
          try { localVideoTrackRef.current.stop(); } catch { }
          localVideoTrackRef.current = null;
        }
        setLocalVideoTrack(null);
        setIsCameraEnabled(false);
        const denied = err.name === 'NotAllowedError' || (err.message && err.message.toLowerCase().includes('permission'));
        showToast(denied ? 'Camera permission blocked in browser' : 'Unable to access camera', <AlertCircle size={15} color="#ef4444" />);
      } finally {
        setIsCameraStarting(false);
      }
    }
  }

  function handleMicButtonClick() {
    if (!localAudioTrackRef.current) {
      publishLocalMic();
    } else {
      handleToggleMute();
    }
  }

  async function switchAudioInput(deviceId) {
    setSelectedAudioInput(deviceId);
    localStorage.setItem('wt_pref_mic', deviceId);

    if (!isVoiceConnectedRef.current || !localAudioTrackRef.current) return;

    try {
      await rebuildLiveProcessedMicTrack({ deviceId: deviceId || undefined });
      showToast('Switched microphone source', <Sliders size={15} color="var(--pink-primary)" />);
    } catch (err) {
      console.warn('Failed to switch audio input:', err);
      showToast('Failed to switch microphone: ' + (err.message || 'Error'), <AlertCircle size={15} color="#ef4444" />);
    }
  }

  function switchAudioOutput(sinkId) {
    setSelectedAudioOutput(sinkId);
    localStorage.setItem('wt_pref_sink', sinkId);

    remoteAudioElementsRef.current.forEach((el) => {
      if (typeof el.setSinkId === 'function') {
        el.setSinkId(sinkId).catch((err) => console.warn('setSinkId failed:', err));
      }
    });
    showToast('Switched audio output', <Headphones size={15} color="var(--pink-primary)" />);
  }

  function toggleStudioAudioMode(enabled) {
    setStudioAudioMode(enabled);
    localStorage.setItem('wt_studio_mode', String(enabled));
    if (isVoiceConnectedRef.current) {
      showToast(enabled ? 'Studio Mode Enabled (128kbps)' : 'Standard Audio Mode', <Radio size={15} color="var(--pink-primary)" />);
      switchAudioInput(selectedAudioInput);
    }
  }

  function toggleNoiseSuppression(enabled) {
    const mode = enabled ? 'rnnoise' : 'raw';
    setNoiseSuppressionMode(mode);
    noiseSuppressionModeRef.current = mode;
    localStorage.setItem('wt_noise_supp_mode', mode);
    if (isVoiceConnectedRef.current) {
      showToast(enabled ? 'Noise Suppression Active' : 'Noise Suppression Off', <ShieldCheck size={15} color="var(--pink-primary)" />);
      switchAudioInput(selectedAudioInput);
    }
  }

  // Camera Drag Event Handlers
  const isTextEntryElement = (el) => {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
    if (tag === 'INPUT') {
      const t = (el.getAttribute?.('type') || el.type || 'text').toLowerCase();
      return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'image'].includes(t);
    }
    return false;
  };

  const isInteractiveActivationElement = (el) => {
    if (!el || !el.closest) return false;
    return Boolean(el.closest('button, a[href], summary, [role="button"], [role="menuitem"], [role="tab"], [role="option"], [role="switch"]'));
  };

  const pttKeyHeldRef = useRef(false);
  const pttHandlersRef = useRef({ down: () => { }, up: () => { } });

  // Push-to-Talk Hotkey Listener (ONLY Hold 'V' — 'M' mute shortcut removed; capture-phase & blur-safe)
  useEffect(() => {
    const startPtt = () => {
      if (pttKeyHeldRef.current) return;
      pttKeyHeldRef.current = true;

      if (!isVoiceConnectedRef.current) {
        startMicrophone().then(() => {
          if (!pttKeyHeldRef.current) {
            if (localAudioTrackRef.current) {
              isPushToTalkingRef.current = false;
              setIsPushToTalking(false);
              localAudioTrackRef.current.mute().catch(() => { });
              isMutedRef.current = true;
              setIsMuted(true);
              socketRef.current?.emit('voice:track_state', { isMuted: true, hasVideo: false });
            }
            return;
          }
          if (localAudioTrackRef.current) {
            isPushToTalkingRef.current = true;
            setIsPushToTalking(true);
            localAudioTrackRef.current.unmute().catch(() => { });
            isMutedRef.current = false;
            setIsMuted(false);
            playAudioChirp('unmute');
            socketRef.current?.emit('voice:track_state', { isMuted: false, hasVideo: false });
            showToast('Push-to-Talk (Mic Live)', <Mic size={15} color="var(--pink-primary)" />);
          }
        }).catch(() => {
          pttKeyHeldRef.current = false;
        });
        return;
      }

      if (localAudioTrackRef.current) {
        isPushToTalkingRef.current = true;
        setIsPushToTalking(true);
        localAudioTrackRef.current.unmute().catch(() => { });
        isMutedRef.current = false;
        setIsMuted(false);
        playAudioChirp('unmute');
        socketRef.current?.emit('voice:track_state', { isMuted: false, hasVideo: false });
        showToast('Push-to-Talk (Mic Live)', <Mic size={15} color="var(--pink-primary)" />);
      }
    };

    const stopPtt = () => {
      if (!pttKeyHeldRef.current && !isPushToTalkingRef.current) return;
      pttKeyHeldRef.current = false;
      if (isPushToTalkingRef.current && localAudioTrackRef.current) {
        isPushToTalkingRef.current = false;
        setIsPushToTalking(false);
        isMutedRef.current = true;
        setIsMuted(true);
        localAudioTrackRef.current.mute().catch(() => { });
        playAudioChirp('mute');
        socketRef.current?.emit('voice:track_state', { isMuted: true, hasVideo: false });
        showToast('Push-to-Talk ended (Muted)', <MicOff size={15} color="#9ca3af" />);
      }
    };

    pttHandlersRef.current = { down: startPtt, up: stopPtt };

    function handleKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const typing = isTextEntryElement(document.activeElement) || isTextEntryElement(e.target);
      if (typing) return;

      const isV = e.code === 'KeyV' || e.key?.toLowerCase() === 'v';
      if (isV && !e.repeat) {
        e.preventDefault();
        startPtt();
      }
    }

    function handleKeyUp(e) {
      const isV = e.code === 'KeyV' || e.key?.toLowerCase() === 'v';
      if (isV) {
        stopPtt();
      }
    }

    function handleVisibilityRelease() {
      if (document.hidden) stopPtt();
    }

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', stopPtt);
    document.addEventListener('visibilitychange', handleVisibilityRelease);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', stopPtt);
      document.removeEventListener('visibilitychange', handleVisibilityRelease);
    };
  }, [socket]);

  // Autoplay Unlocker: Unmutes & resumes remote audio on first user gesture
  function unlockAudio() {
    peerGainNodesRef.current.forEach((entry) => {
      if (entry && entry.ctx && entry.ctx.state === 'suspended') {
        entry.ctx.resume().catch(() => { });
      }
    });
    remoteAudioElementsRef.current.forEach((el) => {
      if (el && el.srcObject) {
        el.play().catch(() => { });
      }
    });
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => { });
    }
    setNeedsVoiceAudioUnlock(false);
  }

  useEffect(() => {
    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Unified Player Interface
  // Unified Player Interface (Direct HTML5 Native Video + YouTube)
  const UnifiedPlayer = {
    play() {
      if (activePlayerType === 'youtube') {
        try { ytPlayerRef.current?.playVideo?.(); } catch { }
      } else {
        const v = document.querySelector('.pouf-player-container video');
        const a = document.querySelector('.pouf-player-container audio');
        if (v && v.paused) {
          v.play().catch(async (err) => {
            if (err && err.name === 'NotAllowedError') {
              try {
                v.muted = true;
                await v.play();
              } catch (e2) {
                setNeedsUserClickToPlay(true);
              }
            }
          });
        }
        if (a && a.src && a.paused) {
          a.play().catch(() => { });
        }
      }
    },
    pause() {
      if (activePlayerType === 'youtube') {
        try { ytPlayerRef.current?.pauseVideo?.(); } catch { }
      } else {
        const v = document.querySelector('.pouf-player-container video');
        const a = document.querySelector('.pouf-player-container audio');
        if (v && !v.paused) v.pause();
        if (a && a.src && !a.paused) a.pause();
      }
    },
    seek(seconds) {
      if (activePlayerType === 'youtube') {
        try { ytPlayerRef.current?.seekTo?.(seconds, true); } catch { }
      } else {
        const v = document.querySelector('.pouf-player-container video');
        const a = document.querySelector('.pouf-player-container audio');
        isSeekingRef.current = true;
        if (v) {
          v.currentTime = seconds;
        }
        if (a && a.src) {
          a.currentTime = seconds;
        }
        setTimeout(() => { isSeekingRef.current = false; }, 200);
      }
    },
    getTime() {
      if (activePlayerType === 'youtube') {
        try {
          return ytPlayerRef.current?.getCurrentTime ? ytPlayerRef.current.getCurrentTime() : 0;
        } catch {
          return 0;
        }
      }
      const v = document.querySelector('.pouf-player-container video');
      return v ? v.currentTime : (serverSyncStateRef.current.currentTime || 0);
    },
    setRate(rate) {
      if (activePlayerType === 'youtube') {
        try { ytPlayerRef.current?.setPlaybackRate?.(rate); } catch { }
      } else {
        const v = document.querySelector('.pouf-player-container video');
        const a = document.querySelector('.pouf-player-container audio');
        if (v) v.playbackRate = rate;
        if (a && a.src) a.playbackRate = rate;
      }
    },
    getRate() {
      if (activePlayerType === 'youtube') {
        try { return ytPlayerRef.current?.getPlaybackRate?.() || 1.0; } catch { return 1.0; }
      }
      const v = document.querySelector('.pouf-player-container video');
      return v ? v.playbackRate : 1.0;
    }
  };

  // Authoritative Video Sync Protocol (Eliminates 1-2s drift across all remote viewers)
  function getAuthoritativeTime() {
    const sync = serverSyncStateRef.current;
    if (!sync.isPlaying) return sync.currentTime;
    const elapsed = (Date.now() - sync.receivedAt) / 1000;
    return sync.currentTime + (elapsed * (sync.playbackRate || 1.0));
  }

  function evaluateSyncDrift() {
    if (isRemoteActionRef.current || isBufferingRef.current || isSeekingRef.current) return;
    if (activePlayerType === 'neko') return;

    const authTime = getAuthoritativeTime();
    const clientTime = UnifiedPlayer.getTime();
    if (typeof clientTime !== 'number' || isNaN(clientTime) || clientTime < 0) return;

    // Solo viewer with no remote sync activity: local playback is master
    const currentUsers = connectedUsersRef.current && connectedUsersRef.current.length > 0
      ? connectedUsersRef.current
      : connectedUsers;
    if (currentUsers.length <= 1 && !serverSyncStateRef.current.receivedAt) return;

    // If server state is paused but local is playing, pause to align
    if (!serverSyncStateRef.current.isPlaying) {
      const v = document.querySelector('.pouf-player-container video');
      if (v && !v.paused) {
        UnifiedPlayer.pause();
      }
      return;
    }

    const drift = Math.abs(clientTime - authTime);

    // Relaxed 4.0s natural co-watching window: within 4 seconds, let both players play smoothly at 1.0x with zero frame chops
    if (drift <= 4.0) {
      if (UnifiedPlayer.getRate() !== 1.0) {
        UnifiedPlayer.setRate(1.0);
      }
      setSyncStatus('In Sync');
      return;
    }

    // Only re-align if drift is genuinely large (> 4.0 seconds)
    setRemoteLock(1500);
    isSeekingRef.current = true;
    UnifiedPlayer.seek(authTime);
    UnifiedPlayer.setRate(1.0);
    setTimeout(() => { isSeekingRef.current = false; }, 1500);
    setSyncStatus('In Sync');
  }

  // Continuous Metronome Drift Watchdog Timer
  useEffect(() => {
    const driftTimer = setInterval(() => {
      evaluateSyncDrift();
    }, 1200);
    return () => clearInterval(driftTimer);
  }, [activePlayerType]);

  // Dynamically apply subtitle font size and position styling to Artplayer
  function applySubtitleStyle(size = subtitleSize, pos = subtitlePos) {
    const art = artInstanceRef.current;
    if (!art) return;

    let bottomVal = '36px';
    let topVal = 'auto';

    if (pos === 'top') {
      bottomVal = 'auto';
      topVal = '36px';
    } else if (pos === 'raised') {
      bottomVal = '80px';
      topVal = 'auto';
    } else {
      bottomVal = '36px';
      topVal = 'auto';
    }

    const styleObj = {
      fontSize: `${size}px`,
      bottom: bottomVal,
      top: topVal,
      color: '#ffffff',
      fontWeight: '700',
      textShadow: '0 2px 4px rgba(0,0,0,0.95), 0 0 4px #000, 0 0 10px rgba(0,0,0,0.8)'
    };

    if (art.subtitle) {
      try {
        art.subtitle.style(styleObj);
      } catch { }
    }

    if (art.template?.$subtitle) {
      art.template.$subtitle.style.fontSize = `${size}px`;
      art.template.$subtitle.style.bottom = bottomVal;
      art.template.$subtitle.style.top = topVal;
    }
  }

  // Update Artplayer's setting menu dynamically so probed tracks are always visible & selectable
  function updateArtplayerSettings(art, aTracks, sTracks, curAudioIdx, curSubIdx, curSize, curPos, curOffset) {
    if (!art || !art.setting || !Array.isArray(art.setting.option)) return;

    try {
      const currentAudioTitle = aTracks[curAudioIdx]?.title || (aTracks.length > 0 ? (aTracks[0].title || 'Track 1') : 'Default Audio');
      const audioSelector = aTracks.length > 0 ? aTracks.map((t, idx) => ({
        default: curAudioIdx === (t.index ?? idx),
        html: t.title || `Track ${idx + 1}`,
        index: t.index ?? idx
      })) : [
        { default: true, html: 'Default Audio (Track 1)', index: 0 }
      ];

      const currentSubTitle = curSubIdx === -1 ? 'Off' : (sTracks[curSubIdx]?.title || (sTracks.length > 0 ? sTracks[0].title : 'Off'));
      const subSelector = [
        { default: curSubIdx === -1, html: 'Off (No Subtitles)', index: -1 },
        ...sTracks.map((t, idx) => ({
          default: curSubIdx === idx,
          html: t.title || `Track ${idx + 1}`,
          index: idx
        })),
        { html: 'Upload External (.srt / .vtt)', upload: true }
      ];

      const sizeLabels = { 18: 'Small (18px)', 24: 'Medium (24px)', 30: 'Large (30px)', 38: 'Extra Large (38px)' };
      const posLabels = { bottom: 'Bottom (Default)', raised: 'Raised (Above Bar)', top: 'Top of Screen' };

      const audioItem = art.setting.option.find((o) => o.name === 'audio-tracks');
      if (audioItem) {
        audioItem.tooltip = currentAudioTitle;
        audioItem.selector = audioSelector;
      }

      const subItem = art.setting.option.find((o) => o.name === 'subtitles');
      if (subItem) {
        subItem.tooltip = currentSubTitle;
        subItem.selector = subSelector;
      }

      const sizeItem = art.setting.option.find((o) => o.name === 'subtitle-size');
      if (sizeItem) {
        sizeItem.tooltip = sizeLabels[curSize] || `${curSize}px`;
        sizeItem.selector = [
          { html: 'Small (18px)', size: 18, default: curSize === 18 },
          { html: 'Medium (24px)', size: 24, default: curSize === 24 || !curSize },
          { html: 'Large (30px)', size: 30, default: curSize === 30 },
          { html: 'Extra Large (38px)', size: 38, default: curSize === 38 }
        ];
      }

      const posItem = art.setting.option.find((o) => o.name === 'subtitle-position');
      if (posItem) {
        posItem.tooltip = posLabels[curPos] || 'Bottom';
        posItem.selector = [
          { html: 'Bottom (Default)', pos: 'bottom', default: curPos === 'bottom' || !curPos },
          { html: 'Raised (Above Bar)', pos: 'raised', default: curPos === 'raised' },
          { html: 'Top of Screen', pos: 'top', default: curPos === 'top' }
        ];
      }

      const delayItem = art.setting.option.find((o) => o.name === 'subtitle-delay');
      if (delayItem) {
        delayItem.tooltip = `${curOffset > 0 ? `+${curOffset}` : curOffset}s`;
      }
    } catch (err) {
      console.warn('updateArtplayerSettings error:', err);
    }
  }

  // Fetch track metadata for MKV/MP4/HLS files & instantly feed to player settings
  async function loadMediaTracks(url) {
    const isStreamUrl = url && url.startsWith('/api/media/stream/');
    const isHlsUrl = url && url.startsWith('/api/media/hls/');

    if (!url || (!isStreamUrl && !isHlsUrl)) {
      setAudioTracks([]);
      setSubtitleTracks([]);
      setActiveSubtitleIndex(-1);
      if (artInstanceRef.current) {
        updateArtplayerSettings(artInstanceRef.current, [], [], 0, -1, subtitleSize, subtitlePos, subtitleOffset);
      }
      return;
    }

    try {
      let filename = '';
      if (isHlsUrl) {
        filename = decodeURIComponent(url.replace('/api/media/hls/', '').split('/master.m3u8')[0].split('?')[0]);
      } else {
        filename = decodeURIComponent(url.replace('/api/media/stream/', '').split('?')[0]);
      }

      const res = await fetch(`/api/media/info/${encodeURIComponent(filename)}`);
      if (res.ok) {
        const data = await res.json();
        const aTracks = data.audioTracks || [];
        const sTracks = data.subtitles || [];
        setAudioTracks(aTracks);
        setSubtitleTracks(sTracks);

        // With dual-track audio engine, direct streaming is always preferred!

        const initialSubIdx = sTracks.length > 0 ? 0 : -1;
        setActiveSubtitleIndex(initialSubIdx);

        if (artInstanceRef.current) {
          updateArtplayerSettings(
            artInstanceRef.current,
            aTracks,
            sTracks,
            0,
            initialSubIdx,
            subtitleSize,
            subtitlePos,
            subtitleOffset
          );

          if (initialSubIdx >= 0 && sTracks[0]?.url) {
            artInstanceRef.current.subtitle.switch(sTracks[0].url, { name: sTracks[0].title }).then(() => {
              artInstanceRef.current.subtitle.show = true;
              applySubtitleStyle(subtitleSize, subtitlePos);
            }).catch(() => { });
          }
        }
      } else {
        if (res.status === 404) {
          console.warn('Media file does not exist on server storage (404):', filename);
          showToast('Media file not found on server storage', <AlertCircle size={15} color="#ef4444" />);
          setSyncStatus('File Missing');
          isBufferingRef.current = false;
          isSeekingRef.current = false;
        }
      }
    } catch (err) {
      console.warn('loadMediaTracks error:', err);
      setAudioTracks([]);
      setSubtitleTracks([]);
    }
  }

  // Keep Artplayer settings menu in sync whenever tracks or subtitle state change
  useEffect(() => {
    if (artInstanceRef.current) {
      updateArtplayerSettings(
        artInstanceRef.current,
        audioTracks,
        subtitleTracks,
        activeAudioIndex,
        activeSubtitleIndex,
        subtitleSize,
        subtitlePos,
        subtitleOffset
      );
    }
  }, [audioTracks, subtitleTracks, activeAudioIndex, activeSubtitleIndex, subtitleSize, subtitlePos, subtitleOffset]);

  // Provide globally-accessible handlers for ArtPlayer custom controls bar
  useEffect(() => {
    window.__wt_toggle_subs = () => {
      setShowSubtitlePopover((prev) => !prev);
      setShowAudioPopover(false);
    };
    window.__wt_toggle_audio = () => {
      setShowAudioPopover((prev) => !prev);
      setShowSubtitlePopover(false);
    };
    return () => {
      delete window.__wt_toggle_subs;
      delete window.__wt_toggle_audio;
    };
  }, []);



  // 1. Socket.IO Setup (Using Firewall-Bypassing /api/v1/sync Path)
  useEffect(() => {
    const s = io({
      path: '/api/v1/sync',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 25,
      reconnectionDelay: 1000
    });
    setSocket(s);
    socketRef.current = s;

    const cleanName = (currentProfile?.name || 'Guest')
      .replace(/^(jotaro|jolyne|joyeline)\s+/i, '')
      .trim() || 'Guest';

    s.emit('room:join', {
      roomId,
      username: cleanName,
      color: currentProfile.color,
      avatar: currentProfile.avatar
    });

    s.on('room:initial_state', (state) => {
      setIsHost(state.currentUser?.isHost || false);
      if (state.users) {
        setConnectedUsers(state.users);
        connectedUsersRef.current = state.users;
      }
      if (state.messages) setChatMessages(state.messages);
      if (state.lastSeen) setRoomLastSeen(state.lastSeen);

      if (state.playback) {
        const initTime = state.playback.currentTime || 0;
        const initPlaying = Boolean(state.playback.isPlaying);
        serverSyncStateRef.current = {
          currentTime: initTime,
          isPlaying: initPlaying,
          playbackRate: state.playback.playbackRate || 1.0,
          receivedAt: Date.now()
        };
        setRoomPlaybackState({
          currentTime: initTime,
          isPlaying: initPlaying
        });
      }

      // Lock local broadcasts during initial join sync so joining user does not interrupt others
      setRemoteLock(4000);

      // ALWAYS synchronize to the active room media first!
      if (state.media && state.media.url) {
        applyMedia(state.media, state.playback);
        onConsumeInitialMedia?.();
      } else if (initialMedia) {
        // Only launch initialMedia if room is idle
        s.emit('media:change', { url: initialMedia, title: initialTitle || 'Media', type: initialType });
        onConsumeInitialMedia?.();
      }
      showToast('Connected to Lounge', <Sparkles size={15} color="var(--pink-primary)" />);
      // Auto-connect to lounge LiveKit room as subscriber so you hear anyone talking with zero refresh
      connectVoiceRoom({ publishMic: false }).catch(() => { });
    });

    s.on('user:joined', ({ user, users }) => {
      if (users) {
        setConnectedUsers(users);
        connectedUsersRef.current = users;
      }
      showToast(`${user.username} joined`, <Users size={15} color="var(--pink-primary)" />);
    });

    s.on('user:left', ({ userId, username, users }) => {
      if (users) {
        setConnectedUsers(users);
        connectedUsersRef.current = users;
      }
      showToast(`${username || 'User'} left the lounge`, <LogOut size={15} color="#9ca3af" />);
    });

    s.on('player:sync_heartbeat', ({ currentTime, isPlaying, playbackRate }) => {
      // CRITICAL: NEVER overwrite client state while user or remote partner is seeking or remote action is locked!
      if (isSeekingRef.current || isRemoteActionRef.current) return;

      serverSyncStateRef.current = {
        currentTime,
        isPlaying: Boolean(isPlaying),
        playbackRate: playbackRate || 1.0,
        receivedAt: Date.now()
      };

      const clientTime = UnifiedPlayer.getTime();
      const authTime = getAuthoritativeTime();
      const drift = Math.abs(clientTime - authTime);

      setRoomPlaybackState((prev) => {
        // Relaxed 4s tolerance window: only force-align if play/pause state changed or drift > 4.0s
        if (prev.isPlaying !== Boolean(isPlaying) || drift > 4.0) {
          return { currentTime: authTime, isPlaying: Boolean(isPlaying) };
        }
        return prev;
      });

      // If remote room is actively playing and local direct video is paused, resume smoothly
      if (isPlaying && activePlayerType !== 'neko') {
        const v = document.querySelector('.pouf-player-container video');
        if (v && v.paused && drift < 30) {
          UnifiedPlayer.play();
        }
      }

      evaluateSyncDrift();
    });

    s.on('chat:seen_update', ({ username, timestamp }) => {
      setRoomLastSeen((prev) => ({ ...prev, [username]: timestamp }));
    });

    s.on('player:sync_play', ({ currentTime, sender }) => {
      serverSyncStateRef.current = { currentTime, isPlaying: true, playbackRate: 1.0, receivedAt: Date.now() };
      setRoomPlaybackState({ currentTime, isPlaying: true });
      setRemoteLock(800);
      showToast(`${sender} resumed`, <Play size={14} color="var(--pink-primary)" fill="currentColor" />);
      const clientTime = UnifiedPlayer.getTime();
      if (typeof currentTime === 'number' && Math.abs(clientTime - currentTime) > 2.0) {
        UnifiedPlayer.seek(currentTime);
      }
      UnifiedPlayer.play();
    });

    s.on('player:sync_pause', ({ currentTime, sender }) => {
      serverSyncStateRef.current = { currentTime, isPlaying: false, playbackRate: 1.0, receivedAt: Date.now() };
      setRoomPlaybackState({ currentTime, isPlaying: false });
      setRemoteLock(800);
      showToast(`${sender} paused`, <Pause size={14} color="var(--pink-primary)" fill="currentColor" />);
      UnifiedPlayer.pause();
    });

    // Synchronized Seek Barrier (Ready Gate: eliminates freezes, lag, and desync across long seeks)
    s.on('player:sync_barrier_seek', ({ currentTime, wasPlaying, sender, totalUsers, readyCount }) => {
      setBarrierState({
        active: true,
        targetTime: currentTime,
        wasPlaying,
        sender,
        readyCount: readyCount || 0,
        totalUsers: totalUsers || 2
      });

      isSeekingRef.current = true;
      setRemoteLock(8000);

      const v = document.querySelector('.pouf-player-container video');

      // 1. Pause playback while buffering to prevent desynced sound or frame jumps
      UnifiedPlayer.pause();

      // 2. Seek video & secondary audio to the requested target time
      UnifiedPlayer.seek(currentTime);

      let reported = false;
      let safetyTimer = null;

      function reportReady() {
        if (reported) return;
        reported = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        if (v) {
          v.removeEventListener('seeked', checkReady);
          v.removeEventListener('canplay', checkReady);
          v.removeEventListener('canplaythrough', checkReady);
        }
        if (s) {
          s.emit('player:client_ready', { currentTime });
        }
      }

      function checkReady() {
        if (!v) {
          reportReady();
          return;
        }
        // Client is genuinely ready when the video is not seeking, is positioned near the target, and has frame data
        const isNear = typeof currentTime === 'number' ? Math.abs(v.currentTime - currentTime) < 1.0 : true;
        if (!v.seeking && isNear && v.readyState >= 2) {
          reportReady();
        }
      }

      if (v) {
        v.addEventListener('seeked', checkReady);
        v.addEventListener('canplay', checkReady);
        v.addEventListener('canplaythrough', checkReady);
        safetyTimer = setTimeout(reportReady, 6500);
        // Immediate check in case target frame is already in memory buffer
        checkReady();
      } else {
        reportReady();
      }
    });

    s.on('player:barrier_progress', ({ readyCount, totalUsers }) => {
      setBarrierState((prev) => prev ? { ...prev, readyCount, totalUsers } : null);
    });

    s.on('player:barrier_release', ({ currentTime, isPlaying }) => {
      setBarrierState(null);
      isSeekingRef.current = false;
      isRemoteActionRef.current = false;
      if (remoteActionTimeoutRef.current) clearTimeout(remoteActionTimeoutRef.current);

      serverSyncStateRef.current = {
        currentTime,
        isPlaying: Boolean(isPlaying),
        playbackRate: 1.0,
        receivedAt: Date.now()
      };
      setRoomPlaybackState({ currentTime, isPlaying: Boolean(isPlaying) });

      // Tight alignment check: ensure video & secondary audio are right on target frame
      const v = document.querySelector('.pouf-player-container video');
      const a = document.querySelector('.pouf-player-container audio');
      if (v && typeof currentTime === 'number' && Math.abs(v.currentTime - currentTime) > 0.6) {
        v.currentTime = currentTime;
      }
      if (a && a.src && typeof currentTime === 'number' && Math.abs(a.currentTime - currentTime) > 0.6) {
        a.currentTime = currentTime;
      }

      if (isPlaying) {
        UnifiedPlayer.play();
      } else {
        UnifiedPlayer.pause();
      }
    });

    s.on('player:sync_seek', ({ currentTime, isPlaying, sender }) => {
      serverSyncStateRef.current = { currentTime, isPlaying: Boolean(isPlaying), playbackRate: 1.0, receivedAt: Date.now() };
      setRoomPlaybackState({ currentTime, isPlaying: Boolean(isPlaying) });
      setRemoteLock();
      showToast(`${sender} scrubbed to ${formatTime(currentTime)}`, <FastForward size={14} color="var(--pink-primary)" />);
      UnifiedPlayer.seek(currentTime);
      if (isPlaying) UnifiedPlayer.play();
      else UnifiedPlayer.pause();
    });

    s.on('player:sync_rate', ({ playbackRate }) => {
      serverSyncStateRef.current.playbackRate = playbackRate || 1.0;
      setRemoteLock();
      UnifiedPlayer.setRate(playbackRate);
    });

    // Synchronized Audio Track Switch (Keeps BOTH users locked on same second)
    s.on('player:audio_track_changed', ({ audioTrack, currentTime, isPlaying, changedBy }) => {
      setActiveAudioIndex(audioTrack);
      serverSyncStateRef.current = {
        currentTime,
        isPlaying: Boolean(isPlaying),
        playbackRate: 1.0,
        receivedAt: Date.now()
      };
      setRemoteLock(800);
      showToast(`Switched Audio: Track #${audioTrack + 1} (${changedBy})`, <Volume2 size={15} color="var(--pink-primary)" />);
    });

    s.on('media:changed', ({ media, playback, changedBy }) => {
      if (playback) {
        serverSyncStateRef.current = {
          currentTime: playback.currentTime || 0,
          isPlaying: Boolean(playback.isPlaying),
          playbackRate: playback.playbackRate || 1.0,
          receivedAt: Date.now()
        };
      }
      showToast(`${changedBy} loaded "${media.title}"`, <Film size={15} color="var(--pink-primary)" />);
      applyMedia(media, playback);
    });

    s.on('player:sync_forced', ({ currentTime, isPlaying, syncedBy }) => {
      serverSyncStateRef.current = { currentTime, isPlaying: Boolean(isPlaying), playbackRate: 1.0, receivedAt: Date.now() };
      setRoomPlaybackState({ currentTime, isPlaying: Boolean(isPlaying) });
      setRemoteLock();
      UnifiedPlayer.seek(currentTime);
      if (isPlaying) UnifiedPlayer.play();
      else UnifiedPlayer.pause();
      showToast(`Synced both to ${formatTime(currentTime)}`, <Sparkles size={15} color="#fbbf24" />);
      setSyncStatus('In Sync');
    });

    // Chat System: update full history + in-video dynamic fade + seen tracking
    s.on('chat:new_message', (msg) => {
      if (!msg) return;

      // Always append to persistent chat history for the Sidebar Drawer
      setChatMessages((prev) => [...prev.slice(-150), msg]);

      // If chat is visible, mark seen immediately; otherwise increment unread badge
      const isChatVisible = (isChitChatModeRef.current && !isChatCollapsedRef.current) || isChatSidebarOpenRef.current;
      if (!isChatVisible) {
        setUnreadChatCount((c) => c + 1);
      } else {
        s.emit('chat:seen', {
          roomId,
          username: currentProfile.name,
          timestamp: Date.now()
        });
      }

      // In-video floating chat pills (for non-system user messages, supports text and GIFs)
      if (!msg.isSystem && msg.sender !== 'System' && (msg.text || msg.image)) {
        const messageId = msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const item = { ...msg, id: messageId, fading: false };
        setRecentMessages((prev) => [...prev.slice(-3), item]);

        const charCount = (msg.text || '').length;
        // Dynamic reading delay: GIFs stay visible longer for reaction appreciation
        const fadeDelay = msg.image ? 6500 : Math.min(12000, Math.max(2600, 2000 + (charCount * 95)));
        const removeDelay = fadeDelay + 600;

        setTimeout(() => {
          setRecentMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, fading: true } : m));
        }, fadeDelay);

        setTimeout(() => {
          setRecentMessages((prev) => prev.filter((m) => m.id !== messageId));
        }, removeDelay);
      }
    });

    // LiveKit SFU handles media routing directly
    s.on('voice:speaking', ({ peerId, isSpeaking }) => {
      setRemotePeers((prev) => {
        const next = new Map(prev);
        const peer = next.get(peerId);
        if (peer) {
          next.set(peerId, { ...peer, isSpeaking: !!isSpeaking });
        }
        return next;
      });
    });

    s.on('voice:track_state', ({ peerId, isMuted: peerMuted, hasVideo: peerVideo }) => {
      setRemotePeers((prev) => {
        const next = new Map(prev);
        const peer = next.get(peerId);
        if (peer) {
          next.set(peerId, {
            ...peer,
            isMuted: typeof peerMuted === 'boolean' ? peerMuted : peer.isMuted,
            hasVideo: typeof peerVideo === 'boolean' ? peerVideo : peer.hasVideo
          });
        }
        return next;
      });
    });

    s.on('voice:peer_left', ({ peerId, username }) => {
      console.log(`Peer left voice: ${peerId}`);
      if (username) showToast(`${username} left Voice Chat`, <MicOff size={15} color="#9ca3af" />);
    });

    return () => {
      leaveVoiceChat();
      remoteAudioElementsRef.current.forEach((el) => {
        try {
          el.pause();
          el.srcObject = null;
          if (el.parentNode) el.parentNode.removeChild(el);
        } catch { }
      });
      remoteAudioElementsRef.current.clear();
      s.disconnect();
    };
  }, [roomId]);

  // Respond immediately when user selects new media
  useEffect(() => {
    if (initialMedia && socket) {
      socket.emit('media:change', {
        url: initialMedia,
        title: initialTitle || 'Media',
        type: initialType || (extractYouTubeId(initialMedia) ? 'youtube' : 'direct')
      });
      onConsumeInitialMedia?.();
    }
  }, [initialMedia, initialTitle, initialType, socket]);

  // Apply Media Changes cleanly
  function applyMedia(media, playback) {
    if (!media || !media.url) return;

    const resolvedType = media.type || (
      extractYouTubeId(media.url) ? 'youtube' :
        media.url.includes('.m3u8') ? 'hls' : 'direct'
    );

    setCurrentTitle(media.title || media.url);
    setCurrentUrl(media.url);
    setActivePlayerType(resolvedType);
    pendingPlaybackRef.current = playback || null;
    setActiveAudioIndex(typeof media.audioTrack === 'number' ? media.audioTrack : 0);

    setRemoteLock(1500);
    loadMediaTracks(media.url);

    if (resolvedType === 'neko') {
      if (artInstanceRef.current) artInstanceRef.current.pause();
      if (ytPlayerRef.current?.stopVideo) ytPlayerRef.current.stopVideo();
    } else if (resolvedType === 'youtube') {
      if (artInstanceRef.current) artInstanceRef.current.pause();
      const vid = media.videoId || extractYouTubeId(media.url);
      if (ytPlayerRef.current?.loadVideoById && vid) {
        ytPlayerRef.current.loadVideoById(vid);
      }
    } else {
      if (ytPlayerRef.current?.stopVideo) ytPlayerRef.current.stopVideo();
      if (artInstanceRef.current) {
        artInstanceRef.current.switchUrl(media.url, media.title || 'Video');
      }
    }

    if (playback) {
      const targetTime = playback.currentTime || 0;
      const shouldPlay = Boolean(playback.isPlaying);

      setRoomPlaybackState({
        currentTime: targetTime,
        isPlaying: shouldPlay
      });

      if (resolvedType === 'youtube') {
        setTimeout(() => {
          const currentAuth = getAuthoritativeTime();
          UnifiedPlayer.seek(currentAuth);
          if (shouldPlay) UnifiedPlayer.play();
          else UnifiedPlayer.pause();
        }, 500);
      } else if (resolvedType !== 'neko') {
        isBufferingRef.current = true;
        setSyncStatus('Buffering...');

        const syncDirect = () => {
          const v = document.querySelector('.pouf-player-container video');
          const a = document.querySelector('.pouf-player-container audio');
          const currentAuth = getAuthoritativeTime() || targetTime;
          if (v) {
            if (v.readyState >= 1) {
              if (Math.abs(v.currentTime - currentAuth) > 1.0) {
                v.currentTime = currentAuth;
              }
            }
            if (shouldPlay && v.paused) {
              v.play().catch(async () => {
                try {
                  v.muted = true;
                  await v.play();
                } catch (e2) { }
              });
            } else if (!shouldPlay && !v.paused) {
              v.pause();
            }
          }
          if (a && a.src) {
            if (a.readyState >= 1) {
              if (Math.abs(a.currentTime - currentAuth) > 1.0) {
                a.currentTime = currentAuth;
              }
            }
            if (shouldPlay && a.paused) {
              a.play().catch(() => { });
            } else if (!shouldPlay && !a.paused) {
              a.pause();
            }
          }
          isBufferingRef.current = false;
          setSyncStatus('In Sync');
        };

        // Attempt immediate sync and check at intervals as the media element buffers
        setTimeout(syncDirect, 150);
        setTimeout(syncDirect, 500);
        setTimeout(syncDirect, 1200);
      }
    }
  }

  // YouTube Setup
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag?.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  }, []);

  useEffect(() => {
    if (activePlayerType !== 'youtube') return;

    const vid = extractYouTubeId(currentUrl) || '5qap5aO4i9A';
    let isCancelled = false;

    function checkAndMountYT() {
      if (isCancelled) return;
      if (!window.YT || !window.YT.Player) {
        setTimeout(checkAndMountYT, 150);
        return;
      }

      const container = document.getElementById('react-yt-player');
      if (!container) {
        setTimeout(checkAndMountYT, 100);
        return;
      }

      if (ytPlayerRef.current && ytPlayerRef.current.loadVideoById) {
        try {
          ytPlayerRef.current.loadVideoById(vid);
          return;
        } catch { }
      }

      try {
        ytPlayerRef.current = new window.YT.Player('react-yt-player', {
          videoId: vid,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            fs: 1,
            origin: window.location.origin
          },
          events: {
            onReady: (event) => {
              if (pendingPlaybackRef.current) {
                event.target.seekTo(pendingPlaybackRef.current.currentTime || 0, true);
                if (pendingPlaybackRef.current.isPlaying) {
                  event.target.playVideo();
                } else {
                  event.target.pauseVideo();
                }
                pendingPlaybackRef.current = null;
              }
            },
            onStateChange: (event) => {
              if (isRemoteActionRef.current || !socket) return;
              const currentTime = event.target.getCurrentTime ? event.target.getCurrentTime() : 0;
              if (event.data === 1) {
                socket.emit('player:play', { currentTime });
              } else if (event.data === 2) {
                socket.emit('player:pause', { currentTime });
              }
            }
          }
        });
      } catch (err) {
        console.warn('YouTube Player error:', err);
      }
    }

    checkAndMountYT();
    return () => { isCancelled = true; };
  }, [activePlayerType, currentUrl, socket]);

  // Artplayer HTML5 & MKV Engine
  useEffect(() => {
    if (!artContainerRef.current) return;
    if (activePlayerType === 'youtube' || activePlayerType === 'neko') {
      if (artInstanceRef.current) {
        artInstanceRef.current.destroy(false);
        artInstanceRef.current = null;
        setArtPlayerDomEl(null);
      }
      return;
    }

    if (!currentUrl) return;

    if (artInstanceRef.current) {
      artInstanceRef.current.switchUrl(currentUrl, currentTitle);
      return;
    }

    const isHls = currentUrl.includes('.m3u8') || activePlayerType === 'hls';

    const artConfig = {
      container: artContainerRef.current,
      url: currentUrl,
      type: isHls ? 'm3u8' : (currentUrl.includes('.mkv') ? 'mkv' : 'auto'),
      title: currentTitle,
      poster: '',
      volume: 0.85,
      isLive: false,
      muted: false,
      autoplay: true,
      pip: true,
      autoSize: false,
      autoMini: false,
      screenshot: true,
      setting: true,
      loop: false,
      flip: false,
      playbackRate: true,
      aspectRatio: false,
      fullscreen: true,
      fullscreenWeb: false,
      subtitleOffset: false,
      miniProgressBar: true,
      mutex: true,
      backdrop: false,
      playsInline: true,
      autoPlayback: false,
      theme: '#ec4899',
      moreVideoAttr: {
        crossOrigin: 'anonymous',
      },
      subtitle: {
        url: '',
        type: 'vtt',
        escape: false,
        style: {
          color: '#ffffff',
          fontSize: `${subtitleSize}px`,
          fontWeight: '700',
          textShadow: '0 2px 4px rgba(0,0,0,0.95), 0 0 4px #000, 0 0 10px rgba(0,0,0,0.8)',
          bottom: subtitlePos === 'top' ? 'auto' : (subtitlePos === 'raised' ? '80px' : '36px'),
          top: subtitlePos === 'top' ? '36px' : 'auto'
        },
        encoding: 'utf-8'
      },
      settings: [
        {
          name: 'audio-tracks',
          width: 280,
          html: 'Audio Track',
          tooltip: audioTracks[activeAudioIndex]?.title || 'Default Audio',
          selector: audioTracks.length > 0 ? audioTracks.map((t, idx) => ({
            default: activeAudioIndex === (t.index ?? idx),
            html: t.title || `Track ${idx + 1}`,
            index: t.index ?? idx
          })) : [
            { default: true, html: 'Default Audio (Track 1)', index: 0 }
          ],
          onSelect: function (item) {
            if (typeof item.index === 'number') {
              handleSwitchAudioTrack(item.index);
            }
            return item.html;
          }
        },
        {
          name: 'subtitles',
          width: 290,
          html: 'Subtitles',
          tooltip: activeSubtitleIndex === -1 ? 'Off' : (subtitleTracks[activeSubtitleIndex]?.title || 'Off'),
          selector: [
            { default: activeSubtitleIndex === -1, html: 'Off (No Subtitles)', index: -1 },
            ...subtitleTracks.map((t, idx) => ({
              default: activeSubtitleIndex === idx,
              html: t.title || `Track ${idx + 1}`,
              index: idx
            })),
            { html: 'Upload External (.srt / .vtt)', upload: true }
          ],
          onSelect: function (item) {
            if (item.upload) {
              subtitleFileInputRef.current?.click();
              return false;
            }
            handleSwitchSubtitle(item.index);
            return item.html;
          }
        },
        {
          name: 'subtitle-size',
          width: 240,
          html: 'Subtitle Size',
          tooltip: `${subtitleSize}px`,
          selector: [
            { html: 'Small (18px)', size: 18, default: subtitleSize === 18 },
            { html: 'Medium (24px)', size: 24, default: subtitleSize === 24 },
            { html: 'Large (30px)', size: 30, default: subtitleSize === 30 },
            { html: 'Extra Large (38px)', size: 38, default: subtitleSize === 38 }
          ],
          onSelect: function (item) {
            if (item.size) {
              handleChangeSubtitleSize(item.size);
            }
            return item.html;
          }
        },
        {
          name: 'subtitle-position',
          width: 240,
          html: 'Subtitle Position',
          tooltip: subtitlePos === 'top' ? 'Top' : (subtitlePos === 'raised' ? 'Raised' : 'Bottom'),
          selector: [
            { html: 'Bottom (Default)', pos: 'bottom', default: subtitlePos === 'bottom' },
            { html: 'Raised (Above Bar)', pos: 'raised', default: subtitlePos === 'raised' },
            { html: 'Top of Screen', pos: 'top', default: subtitlePos === 'top' }
          ],
          onSelect: function (item) {
            if (item.pos) {
              handleChangeSubtitlePos(item.pos);
            }
            return item.html;
          }
        },
        {
          name: 'subtitle-delay',
          width: 240,
          html: 'Subtitle Delay ⏱️',
          tooltip: `${subtitleOffset > 0 ? `+${subtitleOffset}` : subtitleOffset}s`,
          selector: [
            { html: '-2.0s', offset: -2.0, default: subtitleOffset === -2.0 },
            { html: '-1.0s', offset: -1.0, default: subtitleOffset === -1.0 },
            { html: '-0.5s', offset: -0.5, default: subtitleOffset === -0.5 },
            { html: '0s (Default)', offset: 0, default: subtitleOffset === 0 },
            { html: '+0.5s', offset: 0.5, default: subtitleOffset === 0.5 },
            { html: '+1.0s', offset: 1.0, default: subtitleOffset === 1.0 },
            { html: '+2.0s', offset: 2.0, default: subtitleOffset === 2.0 }
          ],
          onSelect: function (item) {
            adjustSubtitleOffset(item.offset - subtitleOffset);
            return item.html;
          }
        }
      ],
      customType: {
        m3u8: function (video, url, artObj) {
          if (Hls.isSupported()) {
            if (artObj.hls) artObj.hls.destroy();
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: false,
              backBufferLength: 90,
              maxBufferLength: 30,
              maxMaxBufferLength: 60,
              fragLoadingTimeOut: 30000,
              fragLoadingMaxRetry: 5,
              fragLoadingRetryDelay: 1000,
              manifestLoadingTimeOut: 20000,
              manifestLoadingMaxRetry: 5,
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.warn('HLS network error, recovering...', data);
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.warn('HLS media error, recovering...', data);
                    hls.recoverMediaError();
                    break;
                  default:
                    console.error('Fatal HLS error, destroying...', data);
                    hls.destroy();
                    break;
                }
              }
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            artObj.hls = hls;
            artObj.on('destroy', () => hls.destroy());
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
          }
        },
        mkv: function (video, url) {
          video.src = url;
        }
      },
      controls: [
        {
          position: 'right',
          index: 4,
          html: '<button id="art-sub-btn" style="background:rgba(255,255,255,0.12);color:#fff;font-weight:700;border:1px solid rgba(244,114,182,0.3);border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px;margin-right:4px;">Subs</button>',
          tooltip: 'Subtitle Tracks (List & Settings)',
          click: function () {
            window.__wt_toggle_subs?.();
          }
        },
        {
          position: 'right',
          index: 5,
          html: '<button id="art-sync-btn" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#170f20;font-weight:800;border:none;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;box-shadow:0 0 10px rgba(245,158,11,0.5);margin-right:6px;">Sync</button>',
          tooltip: 'Force Sync Room',
          click: function () {
            handleForceSync();
          },
        }
      ]
    };

    const art = new Artplayer(artConfig);

    art.on('video:waiting', () => {
      if (art.video?.error) return;
      isBufferingRef.current = true;
      setSyncStatus('Buffering...');
    });

    art.on('video:seeking', () => {
      isSeekingRef.current = true;
    });

    art.on('video:seeked', () => {
      isSeekingRef.current = false;
      setTimeout(() => {
        isBufferingRef.current = false;
      }, 250);
    });

    art.on('video:canplay', () => {
      isBufferingRef.current = false;
      isSeekingRef.current = false;
    });

    art.on('video:playing', () => {
      isBufferingRef.current = false;
      isSeekingRef.current = false;
      setSyncStatus('In Sync');
    });

    art.on('video:error', (err) => {
      console.warn('Artplayer video error:', err);
      isBufferingRef.current = false;
      isSeekingRef.current = false;
      setSyncStatus('File Missing');
      showToast('Media failed to load (file not found or unsupported)', <AlertCircle size={15} />);
    });

    art.on('error', (err) => {
      console.warn('Artplayer error:', err);
      isBufferingRef.current = false;
      isSeekingRef.current = false;
      setSyncStatus('Playback Error');
      showToast('Playback error encountered', <AlertCircle size={15} />);
    });

    art.on('ready', () => {
      setArtPlayerDomEl(art.template.$player);

      applySubtitleStyle(subtitleSize, subtitlePos);
      updateArtplayerSettings(art, audioTracks, subtitleTracks, activeAudioIndex, activeSubtitleIndex, subtitleSize, subtitlePos, subtitleOffset);

      if (activeSubtitleIndex >= 0 && subtitleTracks[activeSubtitleIndex]?.url) {
        art.subtitle.switch(subtitleTracks[activeSubtitleIndex].url, { name: subtitleTracks[activeSubtitleIndex].title }).then(() => {
          art.subtitle.show = true;
          applySubtitleStyle(subtitleSize, subtitlePos);
        }).catch(() => { });
      }

      if (pendingPlaybackRef.current) {
        const pb = pendingPlaybackRef.current;
        pendingPlaybackRef.current = null;
        const targetTime = pb.currentTime || 0;
        const shouldPlay = pb.isPlaying;

        isBufferingRef.current = true;
        setSyncStatus('Buffering...');
        art.currentTime = targetTime;

        const onBuffered = () => {
          art.off('canplay', onBuffered);
          art.off('seeked', onBuffered);
          isBufferingRef.current = false;
          isSeekingRef.current = false;
          initialBufferDoneRef.current = true;
          setSyncStatus('In Sync');
          if (shouldPlay) {
            art.play().catch(() => setNeedsUserClickToPlay(true));
          } else {
            art.pause();
          }
        };

        if (art.video && art.video.readyState >= 3) {
          onBuffered();
        } else {
          art.once('canplay', onBuffered);
          art.once('seeked', onBuffered);
          setTimeout(() => {
            if (isBufferingRef.current) {
              isBufferingRef.current = false;
              isSeekingRef.current = false;
              if (shouldPlay) art.play().catch(() => setNeedsUserClickToPlay(true));
            }
          }, 3500);
        }
      }
    });

    art.on('play', () => {
      setNeedsUserClickToPlay(false);
      if (!isRemoteActionRef.current && !isBufferingRef.current && socket) {
        socket.emit('player:play', { currentTime: art.currentTime });
      }
    });

    art.on('pause', () => {
      if (!isRemoteActionRef.current && !isBufferingRef.current && socket) {
        socket.emit('player:pause', { currentTime: art.currentTime });
      }
    });

    art.on('seek', (currentTime) => {
      if (!isRemoteActionRef.current && !isBufferingRef.current && socket) {
        socket.emit('player:seek', { currentTime });
      }
    });

    art.on('video:ratechange', () => {
      if (!isRemoteActionRef.current && socket) {
        socket.emit('player:rate', { playbackRate: art.playbackRate });
      }
    });

    artInstanceRef.current = art;

    return () => {
      if (artInstanceRef.current) {
        artInstanceRef.current.destroy(false);
        artInstanceRef.current = null;
        setArtPlayerDomEl(null);
      }
    };
  }, [activePlayerType, currentUrl, socket]);

  // Dynamically attach subtitles
  useEffect(() => {
    if (!artInstanceRef.current) return;
    if (activeSubtitleIndex >= 0 && subtitleTracks[activeSubtitleIndex]?.url) {
      try {
        const track = subtitleTracks[activeSubtitleIndex];
        artInstanceRef.current.subtitle.switch(track.url, { name: track.title }).then(() => {
          artInstanceRef.current.subtitle.show = true;
          applySubtitleStyle(subtitleSize, subtitlePos);
        });
      } catch (err) {
        console.warn('Subtitle switch error:', err);
      }
    } else if (activeSubtitleIndex === -1 && artInstanceRef.current.subtitle) {
      artInstanceRef.current.subtitle.show = false;
    }
  }, [activeSubtitleIndex, subtitleTracks]);

  // Switch Audio Track (Synchronized across BOTH users with Dual-Track Range Engine)
  function handleSwitchAudioTrack(trackIndex, explicitTime, explicitPlaying) {
    setActiveAudioIndex(trackIndex);
    const video = document.querySelector('.pouf-player-container video');
    const timeToKeep = typeof explicitTime === 'number' ? explicitTime : (video?.currentTime || serverSyncStateRef.current.currentTime || 0);
    const playingToKeep = typeof explicitPlaying === 'boolean' ? explicitPlaying : (serverSyncStateRef.current.isPlaying || (video ? !video.paused : false));

    serverSyncStateRef.current.currentTime = timeToKeep;
    serverSyncStateRef.current.isPlaying = playingToKeep;

    // Emit to room so other viewers switch audio tracks simultaneously!
    if (socket) {
      socket.emit('player:change_audio_track', {
        audioTrack: trackIndex,
        currentTime: timeToKeep,
        isPlaying: playingToKeep
      });
    }

    showToast(`Switched Audio: ${audioTracks[trackIndex]?.title || `Track ${trackIndex + 1}`}`, <Volume2 size={15} />);
  }


  // Switch Subtitle Track
  function handleSwitchSubtitle(index) {
    setActiveSubtitleIndex(index);
    const art = artInstanceRef.current;

    if (index === -1) {
      showToast('Subtitles Off', <Type size={15} />);
      if (art?.subtitle) {
        art.subtitle.show = false;
      }
    } else {
      const track = subtitleTracks[index];
      showToast(`Subtitles: ${track?.title || `Track ${index + 1}`}`, <Type size={15} />);
      if (art?.subtitle && track?.url) {
        art.subtitle.switch(track.url, { name: track.title }).then(() => {
          art.subtitle.show = true;
          applySubtitleStyle(subtitleSize, subtitlePos);
        }).catch(() => {
          art.subtitle.show = true;
        });
      }
    }

    if (art) {
      updateArtplayerSettings(art, audioTracks, subtitleTracks, activeAudioIndex, index, subtitleSize, subtitlePos, subtitleOffset);
    }
  }

  // Subtitle Font Size Customization
  function handleChangeSubtitleSize(newSize) {
    setSubtitleSize(newSize);
    localStorage.setItem('wt_sub_size', String(newSize));
    applySubtitleStyle(newSize, subtitlePos);
    showToast(`Subtitle Size: ${newSize}px`, <Type size={15} />);
    if (artInstanceRef.current) {
      updateArtplayerSettings(artInstanceRef.current, audioTracks, subtitleTracks, activeAudioIndex, activeSubtitleIndex, newSize, subtitlePos, subtitleOffset);
    }
  }

  // Subtitle Position Customization
  function handleChangeSubtitlePos(newPos) {
    setSubtitlePos(newPos);
    localStorage.setItem('wt_sub_pos', newPos);
    applySubtitleStyle(subtitleSize, newPos);
    const label = newPos === 'top' ? 'Top' : (newPos === 'raised' ? 'Raised' : 'Bottom');
    showToast(`Subtitle Position: ${label}`, <Sliders size={15} />);
    if (artInstanceRef.current) {
      updateArtplayerSettings(artInstanceRef.current, audioTracks, subtitleTracks, activeAudioIndex, activeSubtitleIndex, subtitleSize, newPos, subtitleOffset);
    }
  }

  // Custom Subtitle Upload (Cleans HTML/ASS tags and ensures WebVTT format)
  async function handleCustomSubtitleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rawText = await file.text();
      let cleaned = rawText.replace(/\{[\\\/][^}]*\}/g, '');
      cleaned = cleaned.replace(/<\/?[a-zA-Z][^>]*>/g, '');
      cleaned = cleaned.replace(/[\u200E\u200F\u202A-\u202E]/g, '');

      // Convert SRT timestamp format to WebVTT if needed
      if (!cleaned.startsWith('WEBVTT') && file.name.endsWith('.srt')) {
        cleaned = 'WEBVTT\n\n' + cleaned.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }

      const blob = new Blob([cleaned], { type: 'text/vtt;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const newTrack = {
        streamIndex: `custom-${Date.now()}`,
        title: `${file.name.replace(/\.[^/.]+$/, '')} [Uploaded]`,
        language: 'Custom',
        url: blobUrl
      };

      const updatedTracks = [newTrack, ...subtitleTracks];
      setSubtitleTracks(updatedTracks);
      setActiveSubtitleIndex(0);
      showToast(`Loaded Subtitle: ${file.name}`, <Type size={15} />);

      const art = artInstanceRef.current;
      if (art?.subtitle) {
        art.subtitle.switch(blobUrl, { name: newTrack.title }).then(() => {
          art.subtitle.show = true;
          applySubtitleStyle(subtitleSize, subtitlePos);
        });
        updateArtplayerSettings(art, audioTracks, updatedTracks, activeAudioIndex, 0, subtitleSize, subtitlePos, subtitleOffset);
      }
    } catch (err) {
      console.warn('Error reading subtitle file:', err);
    }
  }

  // Subtitle timing offset adjuster (+/- 0.5s)
  function adjustSubtitleOffset(delta) {
    const newOffset = Math.round((subtitleOffset + delta) * 10) / 10;
    setSubtitleOffset(newOffset);
    const art = artInstanceRef.current;
    if (art?.subtitle) {
      art.subtitle.offset = newOffset;
    }
    showToast(`Subtitle Offset: ${newOffset > 0 ? `+${newOffset}` : newOffset}s`, <Zap size={15} />);
    if (art) {
      updateArtplayerSettings(art, audioTracks, subtitleTracks, activeAudioIndex, activeSubtitleIndex, subtitleSize, subtitlePos, newOffset);
    }
  }

  // Force Sync
  function handleForceSync() {
    if (!socket) return;
    const currentTime = UnifiedPlayer.getTime();
    let isPlaying = false;
    if (activePlayerType === 'youtube') {
      try { isPlaying = ytPlayerRef.current?.getPlayerState?.() === 1; } catch { }
    } else {
      const v = document.querySelector('.pouf-player-container video');
      isPlaying = v ? !v.paused : (serverSyncStateRef.current.isPlaying || false);
    }

    socket.emit('player:force_sync_all', { currentTime, isPlaying });
    showToast(`Syncing both to ${formatTime(currentTime)}`, <Sparkles size={15} />);
  }

  function resetChatInactivityTimer() {
    if (chatFadeTimerRef.current) clearTimeout(chatFadeTimerRef.current);
    chatFadeTimerRef.current = setTimeout(() => {
      const wasInChatInput = document.activeElement === chatInputRef.current;
      setChatOpen(false);
      setChatInputText('');
      if (wasInChatInput) {
        setTimeout(() => focusTheaterStage(), 10);
      }
    }, 4500);
  }

  // Neko Lifecycle Management (Warm-up readiness check & controls)
  const [isNekoReady, setIsNekoReady] = useState(false);
  const [nekoIframeKey, setNekoIframeKey] = useState(1);
  const [nekoStatusMsg, setNekoStatusMsg] = useState('Checking browser readiness...');
  const [isTheaterFullscreen, setIsTheaterFullscreen] = useState(false);
  const [isTopBarHovered, setIsTopBarHovered] = useState(false);
  const nekoIframeRef = useRef(null);

  // Synchronize Theater Fullscreen State (HTML5 Element & F11 Window Fullscreen)
  const captureFsMorphSource = useCallback((dir) => {
    const wrapperEl = theaterWrapperRef.current;
    if (!wrapperEl) return;
    if (fsDeckTimerRef.current) clearTimeout(fsDeckTimerRef.current);
    if (dir === 'in') {
      wrapperEl.classList.add('fs-deck-fading');
    } else {
      wrapperEl.classList.remove('fs-deck-fading');
    }
  }, []);

  const playFsMorphTransition = useCallback((enteringFs) => {
    const wrapperEl = theaterWrapperRef.current;
    const curtainEl = fsCurtainRef.current;
    const deckEl = theaterDeckRef.current;

    fsStageAnimRef.current?.cancel?.();
    fsDeckAnimRef.current?.cancel?.();
    fsAuxAnimsRef.current.forEach((a) => a?.cancel?.());
    fsAuxAnimsRef.current = [];

    if (!enteringFs && wrapperEl) {
      if (fsDeckTimerRef.current) clearTimeout(fsDeckTimerRef.current);
      wrapperEl.classList.remove('fs-deck-fading');
    }

    const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReduced) {
      wrapperEl?.classList.remove('fs-deck-fading');
      if (curtainEl && typeof curtainEl.animate === 'function') {
        fsStageAnimRef.current = curtainEl.animate(
          [{ opacity: 0.7 }, { opacity: 0 }],
          { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'none' }
        );
      }
      return;
    }

    // Soft cinema veil across OS fullscreen flash — zero video scaling or distortion
    if (curtainEl && typeof curtainEl.animate === 'function') {
      fsStageAnimRef.current = curtainEl.animate(
        [
          { opacity: 0.94 },
          { opacity: 0.88, offset: 0.16 },
          { opacity: 0 }
        ],
        {
          duration: enteringFs ? 420 : 380,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
          fill: 'none'
        }
      );
    }

    // Deck slides/fades away on fullscreen-in and glides upward back in on exit
    if (enteringFs && wrapperEl && deckEl && typeof deckEl.animate === 'function') {
      wrapperEl.classList.add('fs-deck-fading');
      if (fsDeckTimerRef.current) clearTimeout(fsDeckTimerRef.current);
      fsDeckAnimRef.current = deckEl.animate(
        [
          { transform: 'translate3d(0, 0px, 0)', opacity: 1 },
          { transform: 'translate3d(0, 18px, 0)', opacity: 0 }
        ],
        {
          duration: 320,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
          fill: 'forwards'
        }
      );
      fsDeckAnimRef.current.onfinish = () => {
        wrapperEl.classList.remove('fs-deck-fading');
        fsDeckAnimRef.current?.cancel?.();
      };
      fsDeckTimerRef.current = setTimeout(() => {
        wrapperEl.classList.remove('fs-deck-fading');
      }, 360);
    } else if (!enteringFs && deckEl && typeof deckEl.animate === 'function') {
      window.requestAnimationFrame(() => {
        fsDeckAnimRef.current = deckEl.animate(
          [
            { transform: 'translate3d(0, 18px, 0)', opacity: 0 },
            { transform: 'translate3d(0, 0px, 0)', opacity: 1 }
          ],
          {
            duration: 360,
            delay: 40,
            easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
            fill: 'backwards'
          }
        );
      });
    }

    // Gently fade peripheral controls instead of snapping in
    const auxEls = wrapperEl?.querySelectorAll('.pouf-hud-overlay:not(.is-hidden), .clay-docked-chat-trigger, .floating-chat-overlay');
    if (auxEls?.length) {
      auxEls.forEach((el) => {
        if (typeof el.animate !== 'function') return;
        const anim = el.animate(
          [
            { opacity: 0, transform: 'translate3d(0, 6px, 0)' },
            { opacity: 1, transform: 'translate3d(0, 0px, 0)' }
          ],
          {
            duration: 320,
            delay: 110,
            easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
            fill: 'backwards'
          }
        );
        fsAuxAnimsRef.current.push(anim);
      });
    }
  }, []);

  useEffect(() => {
    function checkFullscreen() {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      const isF11 = (window.innerHeight >= (screen.height - 4) && window.innerWidth >= (screen.width - 4));
      const isFs = !!fsEl || isF11;
      const prevFs = fsWasActiveRef.current;
      fsWasActiveRef.current = isFs;
      setIsTheaterFullscreen(isFs);

      if (prevFs !== isFs) {
        playFsMorphTransition(isFs);
      }

      if (!isFs) {
        if ('keyboard' in navigator && navigator.keyboard?.unlock) {
          navigator.keyboard.unlock();
        }
      }

      // Inform Neko iframe of fullscreen state
      try {
        const iframeDoc = nekoIframeRef.current?.contentDocument;
        if (iframeDoc) {
          iframeDoc.dispatchEvent(new Event('fullscreenchange', { bubbles: true }));
        }
      } catch (err) { }
    }

    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    window.addEventListener('resize', checkFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen);
      document.removeEventListener('webkitfullscreenchange', checkFullscreen);
      window.removeEventListener('resize', checkFullscreen);
      if (fsDeckTimerRef.current) clearTimeout(fsDeckTimerRef.current);
      fsStageAnimRef.current?.cancel?.();
      fsDeckAnimRef.current?.cancel?.();
      fsAuxAnimsRef.current.forEach((a) => a?.cancel?.());
    };
  }, [playFsMorphTransition]);

  // Real-time Last-Bottom-Pixels Blurred Ambient Renderer (Zero React re-renders; paints matching seam + deck canvases)
  useEffect(() => {
    const stageEl = theaterCanvasRef.current?.parentElement;
    if (!stageEl) return;

    const W = 64;
    const H = 1;
    const PX_COUNT = W * H;

    if (!isAmbientActive) {
      stageEl.style.setProperty('--amb-avg', 'rgb(18, 12, 22)');
      ambientDeckCanvasRef.current?.getContext?.('2d')?.clearRect(0, 0, W, H);
      return;
    }

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = W;
    sampleCanvas.height = H;
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!ctx) return;

    const currentBuf = new Float32Array(PX_COUNT * 3);
    const targetBuf = new Float32Array(PX_COUNT * 3);
    for (let i = 0; i < PX_COUNT; i++) {
      const o = i * 3;
      currentBuf[o] = 12; currentBuf[o + 1] = 10; currentBuf[o + 2] = 16;
      targetBuf[o] = 12; targetBuf[o + 1] = 10; targetBuf[o + 2] = 16;
    }
    const outImg = new ImageData(W, H);

    let rafId = 0;
    let lastSampleAt = 0;
    let corsTainted = false;

    const enhanceRgb = (r, g, b) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const boost = 1.24;
      let er = lum + (r - lum) * boost;
      let eg = lum + (g - lum) * boost;
      let eb = lum + (b - lum) * boost;
      const maxC = Math.max(er, eg, eb);
      if (maxC > 228) {
        const s = 224 / maxC;
        er *= s;
        eg *= s;
        eb *= s;
      }
      return [
        Math.max(8, Math.min(240, er)),
        Math.max(8, Math.min(240, eg)),
        Math.max(8, Math.min(240, eb))
      ];
    };

    const getSourceElement = () => {
      if (activePlayerType === 'neko') {
        try {
          const doc = nekoIframeRef.current?.contentDocument;
          if (!doc) return null;
          const vid = doc.querySelector('video');
          if (vid && vid.readyState >= 2 && vid.videoWidth > 0) return vid;
          const cvs = doc.querySelector('canvas');
          if (cvs && cvs.width > 0 && cvs.height > 0) return cvs;
        } catch {
          return null;
        }
        return null;
      }
      if (activePlayerType === 'youtube') return null;
      const vid = theaterCanvasRef.current?.querySelector('.pouf-player-container video');
      return vid && vid.readyState >= 2 && vid.videoWidth > 0 ? vid : null;
    };

    const tick = (now) => {
      if (now - lastSampleAt >= 48) {
        lastSampleAt = now;
        const srcEl = corsTainted ? null : getSourceElement();
        if (srcEl) {
          const sw = srcEl.videoWidth || srcEl.width || 0;
          const sh = srcEl.videoHeight || srcEl.height || 0;
          if (sw > 4 && sh > 4) {
            try {
              // Sample ONLY the last bottom 5–10 px edge strip into a 1D horizontal gradient
              const sBand = Math.min(10, Math.max(5, Math.min(8, Math.floor(sh))));
              const sy = Math.max(0, sh - sBand);
              ctx.drawImage(srcEl, 0, sy, sw, sBand, 0, 0, W, H);
              const data = ctx.getImageData(0, 0, W, H).data;
              for (let i = 0; i < PX_COUNT; i++) {
                const di = i * 4;
                const ti = i * 3;
                const [er, eg, eb] = enhanceRgb(data[di], data[di + 1], data[di + 2]);
                targetBuf[ti] = er;
                targetBuf[ti + 1] = eg;
                targetBuf[ti + 2] = eb;
              }
            } catch {
              corsTainted = true;
            }
          }
        } else if (activePlayerType === 'youtube' || corsTainted) {
          const t = now * 0.0011;
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const ti = (y * W + x) * 3;
              const u = x / (W - 1);
              targetBuf[ti] = 26 + Math.sin(t + u * 3.4) * 14;
              targetBuf[ti + 1] = 16 + Math.cos(t * 0.8 + u * 2.7) * 8;
              targetBuf[ti + 2] = 28 + Math.sin(t * 1.1 - u * 3.1) * 14;
            }
          }
        }
      }

      const alpha = 0.18;
      let ar = 0;
      let ag = 0;
      let ab = 0;
      const out = outImg.data;
      for (let i = 0; i < PX_COUNT; i++) {
        const ti = i * 3;
        const oi = i * 4;
        const nr = currentBuf[ti] + (targetBuf[ti] - currentBuf[ti]) * alpha;
        const ng = currentBuf[ti + 1] + (targetBuf[ti + 1] - currentBuf[ti + 1]) * alpha;
        const nb = currentBuf[ti + 2] + (targetBuf[ti + 2] - currentBuf[ti + 2]) * alpha;
        currentBuf[ti] = nr;
        currentBuf[ti + 1] = ng;
        currentBuf[ti + 2] = nb;
        ar += nr;
        ag += ng;
        ab += nb;
        out[oi] = Math.round(nr);
        out[oi + 1] = Math.round(ng);
        out[oi + 2] = Math.round(nb);
        out[oi + 3] = 255;
      }

      const deckCtx = ambientDeckCanvasRef.current?.getContext?.('2d', { alpha: false });
      if (deckCtx) deckCtx.putImageData(outImg, 0, 0);

      stageEl.style.setProperty(
        '--amb-avg',
        `rgb(${Math.round(ar / PX_COUNT)}, ${Math.round(ag / PX_COUNT)}, ${Math.round(ab / PX_COUNT)})`
      );

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [isAmbientActive, isLoungeScreen, activePlayerType, isNekoReady, currentUrl]);

  // Hook Neko Iframe for Fullscreen Interception and Quick Chat Focus
  const handleNekoIframeLoad = () => {
    try {
      const iframe = nekoIframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win) return;

      // Auto-click any connect/play/join overlay button inside Neko if present
      const autoClickOverlay = () => {
        try {
          if (!doc) return;
          const overlayBtn = doc.querySelector('.neko-video-overlay button, .video-overlay button, [data-action="play"]');
          if (overlayBtn) {
            overlayBtn.click();
          }
        } catch { }
      };
      setTimeout(autoClickOverlay, 600);
      setTimeout(autoClickOverlay, 1500);

      const triggerTheaterFullscreen = (options) => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          const targetEl = theaterWrapperRef.current || theaterCanvasRef.current || document.documentElement;
          if (targetEl?.requestFullscreen) {
            return targetEl.requestFullscreen(options);
          } else if (targetEl?.webkitRequestFullscreen) {
            targetEl.webkitRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            return document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
        }
        return Promise.resolve();
      };

      // 1. Intercept requestFullscreen calls inside Neko to always use our Theater Fullscreen with chat
      if (win.Element && win.Element.prototype) {
        win.Element.prototype.requestFullscreen = function (options) {
          return triggerTheaterFullscreen(options);
        };
        win.Element.prototype.webkitRequestFullscreen = function (options) {
          return triggerTheaterFullscreen(options);
        };
      }
      if (doc.documentElement) {
        doc.documentElement.requestFullscreen = triggerTheaterFullscreen;
        doc.documentElement.webkitRequestFullscreen = triggerTheaterFullscreen;
      }
      if (doc.body) {
        doc.body.requestFullscreen = triggerTheaterFullscreen;
      }

      // 2. Intercept exitFullscreen inside Neko
      doc.exitFullscreen = function () {
        if (document.exitFullscreen) {
          return document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
        return Promise.resolve();
      };

      // 3. Make doc.fullscreenElement reflect parent theater fullscreen state
      try {
        Object.defineProperty(doc, 'fullscreenElement', {
          get: () => {
            const parentFs = document.fullscreenElement || document.webkitFullscreenElement;
            const isF11 = (window.innerHeight >= (screen.height - 4) && window.innerWidth >= (screen.width - 4));
            return (parentFs || isF11) ? doc.body : null;
          },
          configurable: true
        });
      } catch (e) { }

      // 4. Capture click on Neko's fullscreen button directly (useCapture: true)
      doc.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('button, [role="button"], li');
        if (!btn) return;
        const label = (
          btn.getAttribute('aria-label') ||
          btn.getAttribute('title') ||
          btn.innerText ||
          ''
        ).toLowerCase();

        const hasFullscreenIcon = btn.querySelector('svg')?.innerHTML?.toLowerCase()?.includes('fullscreen') ||
          btn.getAttribute('data-testid')?.toLowerCase()?.includes('fullscreen') ||
          btn.className?.toLowerCase?.()?.includes('fullscreen');

        if (label.includes('fullscreen') || hasFullscreenIcon) {
          e.preventDefault();
          e.stopPropagation();
          triggerTheaterFullscreen();
        }
      }, true);

      // 5. Forward only supported room shortcuts (Hold V, F, C) & Escape from inside Neko
      win.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const activeInside = doc.activeElement;
        const isTyping = isTextEntryElement(activeInside) || isTextEntryElement(e.target);

        if (e.key === 'Escape') {
          setChatOpen(false);
          const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
          if (fsEl && document.exitFullscreen) {
            document.exitFullscreen().catch(() => { });
          }
        } else if ((e.code === 'KeyF' || e.key?.toLowerCase() === 'f') && !isTyping && !e.repeat) {
          e.preventDefault();
          e.stopPropagation();
          triggerTheaterFullscreen();
        } else if ((e.code === 'KeyC' || e.key?.toLowerCase() === 'c') && !isTyping && !e.repeat) {
          e.preventDefault();
          e.stopPropagation();
          handleToggleSideChat();
        } else if ((e.code === 'KeyV' || e.key?.toLowerCase() === 'v') && !isTyping && !e.repeat) {
          e.preventDefault();
          pttHandlersRef.current?.down?.();
        }
      }, true);

      win.addEventListener('keyup', (e) => {
        if (e.code === 'KeyV' || e.key?.toLowerCase() === 'v') {
          pttHandlersRef.current?.up?.();
        }
      }, true);

      win.addEventListener('blur', () => {
        pttHandlersRef.current?.up?.();
      });
    } catch (err) {
      console.warn('handleNekoIframeLoad note:', err);
    }
  };

  useEffect(() => {
    let active = true;

    async function checkAndWarmNeko() {
      if (activePlayerType !== 'neko') {
        setIsNekoReady(false);
        return;
      }
      if (appConfig?.modules?.neko === false) {
        setIsNekoReady(false);
        setNekoStatusMsg('Shared Browser (Neko) module is disabled in Admin Settings.');
        return;
      }

      setNekoStatusMsg('Connecting to Virtual Shared Browser (Neko)...');
      try {
        const res = await fetch('/api/neko/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status' })
        });
        const data = await res.json();
        if (data.status !== 'running') {
          setNekoStatusMsg('Launching Chromium instance & WebRTC engine...');
          await fetch('/api/neko/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' })
          });
          let retries = 8;
          while (retries-- > 0 && active) {
            await new Promise(r => setTimeout(r, 1200));
            const check = await fetch('/api/neko/control', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'status' })
            }).then(r => r.json()).catch(() => ({ status: 'unknown' }));
            if (check.status === 'running') break;
          }
        }
        if (active) {
          setIsNekoReady(true);
        }
      } catch (e) {
        if (active) setIsNekoReady(true);
      }
    }

    checkAndWarmNeko();

    return () => {
      active = false;
    };
  }, [activePlayerType]);

  const handleReloadNeko = () => {
    showToast('Reloading browser frame...', <RotateCcw size={15} />);
    setNekoIframeKey(k => k + 1);
  };

  const handleStopNeko = async () => {
    try {
      showToast('Stopping Shared Browser & freeing server CPU...', <Power size={15} />);
      await fetch('/api/neko/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      if (socket) {
        socket.emit('media:change', { url: '', title: '', type: 'direct' });
      }
      setActivePlayerType('direct');
      setCurrentUrl('');
      setCurrentTitle('');
      setIsNekoReady(false);
      showToast('Shared Browser stopped. Server CPU freed.', <Check size={15} />);
    } catch (err) {
      console.warn('Error stopping neko:', err);
    }
  };

  const handleResetNeko = async () => {
    try {
      showToast('Resetting browser tabs...', <RotateCcw size={15} />);
      await fetch('/api/neko/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      setNekoIframeKey(k => k + 1);
      showToast('Browser tabs reset to blank state.', <Check size={15} />);
    } catch (err) {
      console.warn('Error resetting neko:', err);
    }
  };

  const getFullscreenEl = () => (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null
  );

  const focusTheaterStage = () => {
    const active = document.activeElement;
    if (active && active !== document.body && active.blur) {
      if (isTextEntryElement(active) || active.tagName === 'BUTTON' || active.tagName === 'INPUT') {
        active.blur();
      }
    }
    try {
      theaterWrapperRef.current?.focus({ preventScroll: true });
    } catch { /* ignore */ }
  };

  // Cinema Video Fullscreen (hardened: no double-fire, cleans focus, webkit/ms safe + FLIP morph)
  const toggleVideoFullscreen = useCallback(async () => {
    const fsEl = getFullscreenEl();
    const targetEl = theaterWrapperRef.current || theaterCanvasRef.current || document.documentElement;
    if (!fsEl) {
      captureFsMorphSource('in');
      try {
        if (targetEl.requestFullscreen) {
          try {
            await targetEl.requestFullscreen({ navigationUI: 'hide' });
          } catch {
            await targetEl.requestFullscreen();
          }
          if ('keyboard' in navigator && navigator.keyboard?.lock) {
            navigator.keyboard.lock(['Escape']).catch(() => { });
          }
        } else if (targetEl.webkitRequestFullscreen) {
          targetEl.webkitRequestFullscreen();
        } else if (targetEl.msRequestFullscreen) {
          targetEl.msRequestFullscreen();
        }
      } catch { /* ignore gesture lock rejections */ }
      focusTheaterStage();
    } else {
      captureFsMorphSource('out');
      try {
        if ('keyboard' in navigator && navigator.keyboard?.unlock) {
          navigator.keyboard.unlock();
        }
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
      } catch { /* ignore */ }
      focusTheaterStage();
    }
  }, [captureFsMorphSource]);

  // Toggle Chat Sidebar cleanly (hardened C shortcut: preserves fullscreen & restores stage focus on close)
  const handleToggleSideChat = useCallback(() => {
    if (isChatSidebarOpenRef.current) {
      setIsChatSidebarOpen(false);
      setTimeout(() => focusTheaterStage(), 10);
      return;
    }

    const fsEl = getFullscreenEl();
    if (!fsEl) {
      captureFsMorphSource('in');
      const targetEl = theaterWrapperRef.current || theaterCanvasRef.current || document.documentElement;
      if (targetEl.requestFullscreen) {
        targetEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => targetEl.requestFullscreen?.().catch(() => { }));
      } else if (targetEl.webkitRequestFullscreen) {
        targetEl.webkitRequestFullscreen();
      }
    }
    setIsChatSidebarOpen(true);
    handleMarkChatSeen();
    setUnreadChatCount(0);
  }, [handleMarkChatSeen, captureFsMorphSource]);

  // Unified Capture-Phase Room Shortcuts (ONLY Hold V, F, C; Escape closes popovers/chat/fullscreen)
  useEffect(() => {
    function handleGlobalKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const activeEl = document.activeElement;
      const isTyping = isTextEntryElement(activeEl) || isTextEntryElement(e.target);

      // Escape: close popovers/floating chat/sidechat, or blur text field first before exiting fullscreen
      if (e.key === 'Escape') {
        if (showFloatingGiphy) {
          e.preventDefault();
          e.stopPropagation();
          setShowFloatingGiphy(false);
          return;
        }
        if (chatOpen) {
          e.preventDefault();
          e.stopPropagation();
          setChatOpen(false);
          setChatInputText('');
          focusTheaterStage();
          return;
        }
        if (isTyping && activeEl?.blur) {
          e.preventDefault();
          e.stopPropagation();
          activeEl.blur();
          focusTheaterStage();
          return;
        }
        if (showAudioPopover || showSubtitlePopover || showVoiceSettings) {
          e.preventDefault();
          e.stopPropagation();
          setShowAudioPopover(false);
          setShowSubtitlePopover(false);
          setShowVoiceSettings(false);
          return;
        }
        if (isChatSidebarOpenRef.current) {
          e.preventDefault();
          e.stopPropagation();
          setIsChatSidebarOpen(false);
          focusTheaterStage();
          return;
        }
        const fsEl = getFullscreenEl();
        if (fsEl) {
          e.preventDefault();
          e.stopPropagation();
          captureFsMorphSource('out');
          if ('keyboard' in navigator && navigator.keyboard?.unlock) {
            navigator.keyboard.unlock();
          }
          if (document.exitFullscreen) document.exitFullscreen().catch(() => { });
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          return;
        }
      }

      if (isTyping) {
        if (chatOpen) resetChatInactivityTimer();
        return;
      }

      if (e.repeat) return;

      // 'Enter' opens instant floating in-video bubble chat when sidebar is closed
      if (e.key === 'Enter' || e.code === 'NumpadEnter') {
        if (isInteractiveActivationElement(activeEl) || isInteractiveActivationElement(e.target)) {
          return;
        }
        const isSidebarActive = (isChitChatModeRef.current && !isChatCollapsedRef.current) || isChatSidebarOpenRef.current;
        if (!isSidebarActive && !chatOpen) {
          e.preventDefault();
          e.stopPropagation();
          setChatOpen(true);
          resetChatInactivityTimer();
          setTimeout(() => {
            chatInputRef.current?.focus();
          }, 40);
          return;
        }
      }

      // 'C' toggles Chat Sidebar cleanly
      if (e.code === 'KeyC' || e.key?.toLowerCase() === 'c') {
        e.preventDefault();
        e.stopPropagation();
        handleToggleSideChat();
        return;
      }

      // 'F' toggles Fullscreen cleanly
      if (e.code === 'KeyF' || e.key?.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        toggleVideoFullscreen();
        return;
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      if (chatFadeTimerRef.current) clearTimeout(chatFadeTimerRef.current);
    };
  }, [handleToggleSideChat, toggleVideoFullscreen, captureFsMorphSource, showFloatingGiphy, chatOpen, showAudioPopover, showSubtitlePopover, showVoiceSettings]);

  function handleSendChat(e, gifUrl = null) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    if (chatFadeTimerRef.current) clearTimeout(chatFadeTimerRef.current);
    const text = chatInputText.trim();
    if ((!text && !gifUrl) || !socket) {
      setTimeout(() => {
        setChatOpen(false);
        setShowFloatingGiphy(false);
        setChatInputText('');
      }, 50);
      if (activePlayerType === 'neko') {
        setTimeout(() => nekoIframeRef.current?.focus?.(), 50);
      } else {
        setTimeout(() => focusTheaterStage(), 50);
      }
      return;
    }

    socket.emit('chat:send_message', { text, image: gifUrl || null });
    setTimeout(() => {
      setChatInputText('');
      setChatOpen(false);
      setShowFloatingGiphy(false);
      if (activePlayerType === 'neko') {
        setTimeout(() => nekoIframeRef.current?.focus?.(), 50);
      } else {
        setTimeout(() => focusTheaterStage(), 50);
      }
    }, 80);
  }

  async function handlePlayNow() {
    if (!mediaInput.trim() || !socket) return;
    const raw = mediaInput.trim();
    showToast('Resolving media stream...', '⏳');

    try {
      const res = await fetch('/api/media/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: raw })
      });
      const data = await res.json();
      if (data.success && data.streamUrl) {
        socket.emit('media:change', {
          url: data.streamUrl,
          title: data.title || raw,
          type: data.type,
          videoId: data.videoId
        });
      } else {
        socket.emit('media:change', { url: raw, title: raw });
      }
    } catch {
      socket.emit('media:change', { url: raw, title: raw });
    }
    setMediaInput('');
  }

  async function openLibrary() {
    if (onNavigate) {
      onNavigate('library');
      return;
    }
    try {
      const res = await fetch('/api/library');
      const data = await res.json();
      setLibraryFiles(Array.isArray(data) ? data : (data.files || []));
      setLibraryModalOpen(true);
    } catch {
      alert('Could not fetch library files');
    }
  }

  function formatTime(sec) {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const remS = s % 60;
    return `${m}:${remS.toString().padStart(2, '0')}`;
  }

  // Floating Party Webcam Video Tile
  function PartyWebcamCard({ track, isLocal, name, avatar, isMuted, isSpeaking, onToggleCamera }) {
    const videoRef = useRef(null);

    useEffect(() => {
      if (!track || !videoRef.current) return;
      const el = videoRef.current;
      track.attach(el);
      return () => {
        try { track.detach(el); } catch { }
      };
    }, [track]);

    return (
      <div className={`wt-webcam-card ${isSpeaking ? 'is-speaking' : ''}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="wt-webcam-video"
          style={{ transform: isLocal ? 'scaleX(-1)' : 'none' }}
        />
        <div className="wt-webcam-badge">
          <UserAvatar user={{ name, avatar }} size={16} showBorder={false} />
          <span className="wt-webcam-name">{name}</span>
          {isMuted && <MicOff size={11} color="#fca5a5" />}
        </div>
        {isLocal && onToggleCamera && (
          <button
            type="button"
            onClick={onToggleCamera}
            className="wt-webcam-close-btn"
            title="Turn off webcam"
          >
            <X size={11} />
          </button>
        )}
      </div>
    );
  }

  // Floating Party Webcam Grid Dock
  function renderPartyWebcamGrid() {
    const hasLocalVideo = isCameraEnabled && localVideoTrack;
    const hasRemoteVideos = remoteVideoTracks.size > 0;
    if (!hasLocalVideo && !hasRemoteVideos) return null;

    return (
      <div className="wt-webcam-dock" onClick={(e) => e.stopPropagation()}>
        {hasLocalVideo && (
          <PartyWebcamCard
            track={localVideoTrack}
            isLocal={true}
            name={currentProfile?.name || 'You'}
            avatar={currentProfile?.avatar}
            isMuted={isMuted}
            isSpeaking={isLocalSpeaking}
            onToggleCamera={toggleCamera}
          />
        )}
        {Array.from(remoteVideoTracks.entries()).map(([peerId, track]) => {
          const peer = remotePeers.get(peerId);
          const user = connectedUsers.find((u) => u.id === peerId);
          return (
            <PartyWebcamCard
              key={peerId}
              track={track}
              isLocal={false}
              name={peer?.username || user?.username || 'Partner'}
              avatar={peer?.avatar || user?.avatar}
              isMuted={peer?.isMuted}
              isSpeaking={peer?.isSpeaking}
            />
          );
        })}
      </div>
    );
  }

  // Floating in-video chat overlay (hidden if chat sidebar is open)
  function renderChatOverlay() {
    const isSidebarActive = (isChitChatMode && !isChatCollapsed) || isChatSidebarOpen;
    if (isSidebarActive) return null;

    const overlay = (
      <div
        className="floating-chat-overlay"
        onClick={(e) => e.stopPropagation()}
        style={{
          bottom: (isTheaterFullscreen || activePlayerType === 'neko')
            ? (chatOpen ? '104px' : '64px')
            : (chatOpen ? '112px' : '72px')
        }}
      >
        <div className="floating-chat-bubbles-stack">
          {recentMessages.map((m) => (
            m.image ? (
              <div
                key={m.id}
                className={`floating-chat-media-card ${m.fading ? 'fading' : ''}`}
                onClick={() => {
                  setIsChatSidebarOpen(true);
                  setUnreadChatCount(0);
                }}
                title="Click to view full chat history in sidebar"
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserAvatar user={{ name: m.sender, avatar: m.avatar }} size={18} showBorder={false} />
                  <span className="fc-sender" style={{ fontSize: '0.8rem' }}>
                    {m.sender}
                  </span>
                </div>
                <img
                  src={m.image}
                  alt="GIF"
                  className="floating-chat-media-img"
                />
              </div>
            ) : (
              <div
                key={m.id}
                className={`floating-chat-pill ${m.fading ? 'fading' : ''}`}
                onClick={() => {
                  setIsChatSidebarOpen(true);
                  setUnreadChatCount(0);
                }}
                title="Click to view full chat history in sidebar"
                style={{ cursor: 'pointer' }}
              >
                <UserAvatar user={{ name: m.sender, avatar: m.avatar }} size={20} showBorder={false} />
                <span className="fc-sender">
                  {m.sender}:
                </span>
                <span className="fc-text">{m.text}</span>
              </div>
            )
          ))}
        </div>

        {/* Floating In-Video GIPHY Picker popup (Anchored Upwards) */}
        {showFloatingGiphy && chatOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 14px)',
              left: '0',
              width: '320px',
              pointerEvents: 'auto',
              zIndex: 1002,
              filter: 'drop-shadow(0 14px 30px rgba(0, 0, 0, 0.32)) drop-shadow(0 0 12px rgba(236, 72, 153, 0.2))'
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <GiphyPicker
              onSelectGif={(gifUrl) => {
                handleSendChat(null, gifUrl);
                setShowFloatingGiphy(false);
              }}
              onClose={() => setShowFloatingGiphy(false)}
              isDarkTheme={true}
            />
          </div>
        )}

        {renderFloatingChat && (
          <form onSubmit={handleSendChat} className={`wfb-p3 wfb-v1 ${isFloatingChatClosing ? 'is-closing' : ''}`}>
                <UserAvatar user={currentProfile} size={24} showBorder={true} />
                <button
                  type="button"
                  className={`wfb-gif-pill ${showFloatingGiphy ? 'active' : ''}`}
                  onClick={() => setShowFloatingGiphy((prev) => !prev)}
                  title="Send GIF"
                >
                  GIF
                </button>
                <div className="wfb-emoji-rack" title="Top 3 side-chat reactions">
                  {quickBubbleEmojis.map((em) => (
                    <button key={em} type="button" className="wfb-emoji-chip" onClick={() => handleFloatingEmojiTap(em)} title={`React ${em}`}>
                      {em}
                    </button>
                  ))}
                </div>
                <span className="wfb-divider" />
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInputText}
                  onChange={(e) => {
                    setChatInputText(e.target.value);
                    resetChatInactivityTimer();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      closeFloatingBubbleChat();
                    }
                  }}
                  placeholder="Message room..."
                  className="floating-chat-input"
                  autoFocus
                />
                <div className="wfb-actions">
                  <button
                    type="submit"
                    className={`wfb-send ${chatInputText.trim() ? 'ready' : ''}`}
                    title={chatInputText.trim() ? 'Send (Enter)' : 'Close (Enter)'}
                  >
                    <Send size={13} />
                  </button>
                  <button type="button" className="wfb-close" onClick={closeFloatingBubbleChat} title="Close (Esc)">
                    <X size={13} />
                  </button>
                </div>
              </form>

        )}
      </div>
    );

    return overlay;
  }

  // Floating Popover for Subtitle & Audio Track Switching
  function renderTrackPopovers() {
    if (!showSubtitlePopover && !showAudioPopover) return null;

    const popovers = (
      <>
        {/* Subtitle Tracks Popover */}
        {showSubtitlePopover && (
          <div
            className="track-popover-menu subtitle-popover-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: '72px',
              right: '16px',
              maxHeight: '440px',
              width: '320px',
              overflowY: 'auto',
              zIndex: 999,
              background: 'rgba(23, 15, 32, 0.96)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(244, 114, 182, 0.35)',
              borderRadius: '16px',
              padding: '0.9rem',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7), 0 0 24px rgba(244, 114, 182, 0.25)',
              color: '#fff'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.92rem', color: '#f472b6' }}>
                <ClaySubtitles size={18} />
                <span>Subtitles ({subtitleTracks.length})</span>
              </div>
              <button
                onClick={() => setShowSubtitlePopover(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '2px', display: 'flex' }}
              >
                <ClayClose size={14} />
              </button>
            </div>

            {/* Track selection list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '0.9rem' }}>
              {/* Off Option */}
              <button
                onClick={() => {
                  handleSwitchSubtitle(-1);
                  setShowSubtitlePopover(false);
                }}
                className={`track-popover-item ${activeSubtitleIndex === -1 ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '8px',
                  background: activeSubtitleIndex === -1 ? 'rgba(244, 114, 182, 0.22)' : 'rgba(255, 255, 255, 0.05)',
                  color: activeSubtitleIndex === -1 ? '#f472b6' : '#e5e7eb',
                  border: activeSubtitleIndex === -1 ? '1px solid rgba(244, 114, 182, 0.45)' : '1px solid transparent',
                  cursor: 'pointer',
                  fontWeight: activeSubtitleIndex === -1 ? 700 : 500,
                  fontSize: '0.84rem'
                }}
              >
                <span>Off (No Subtitles)</span>
                {activeSubtitleIndex === -1 && <ClayCheck size={14} />}
              </button>

              {/* Available Subtitle Tracks */}
              {subtitleTracks.map((track, idx) => {
                const isActive = activeSubtitleIndex === idx;
                return (
                  <button
                    key={track.url || idx}
                    onClick={() => {
                      handleSwitchSubtitle(idx);
                      setShowSubtitlePopover(false);
                    }}
                    className={`track-popover-item ${isActive ? 'active' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      background: isActive ? 'rgba(244, 114, 182, 0.22)' : 'rgba(255, 255, 255, 0.05)',
                      color: isActive ? '#f472b6' : '#e5e7eb',
                      border: isActive ? '1px solid rgba(244, 114, 182, 0.45)' : '1px solid transparent',
                      cursor: 'pointer',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: '0.84rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textAlign: 'left' }}>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'rgba(244, 114, 182, 0.3)',
                        color: '#f9a8d4'
                      }}>
                        {(track.language || 'SUB').toUpperCase()}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {track.title || `Track ${idx + 1}`}
                      </span>
                    </div>
                    {isActive && <ClayCheck size={14} />}
                  </button>
                );
              })}

              {/* Upload External Subtitle */}
              <button
                onClick={() => {
                  subtitleFileInputRef.current?.click();
                  setShowSubtitlePopover(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '8px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#fbbf24',
                  border: '1px dashed rgba(245, 158, 11, 0.45)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  marginTop: '4px'
                }}
              >
                <ClayUpload size={16} />
                <span>Upload External Subtitle (.srt / .vtt)</span>
              </button>
            </div>

            {/* Subtitle Appearance Settings */}
            <div style={{ paddingTop: '0.65rem', borderTop: '1px solid rgba(255, 255, 255, 0.12)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {/* Font Size */}
              <div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Font Size
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                  {[18, 24, 30, 38].map((size) => (
                    <button
                      key={size}
                      onClick={() => handleChangeSubtitleSize(size)}
                      style={{
                        padding: '4px 0',
                        borderRadius: '6px',
                        background: subtitleSize === size ? 'var(--pink-primary)' : 'rgba(255, 255, 255, 0.08)',
                        color: subtitleSize === size ? '#fff' : '#d1d5db',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}
                    >
                      {size === 18 ? 'S' : size === 24 ? 'M' : size === 30 ? 'L' : 'XL'} ({size}px)
                    </button>
                  ))}
                </div>
              </div>

              {/* Position */}
              <div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Position
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  {[
                    { id: 'bottom', label: 'Bottom' },
                    { id: 'raised', label: 'Raised' },
                    { id: 'top', label: 'Top' }
                  ].map((pos) => (
                    <button
                      key={pos.id}
                      onClick={() => handleChangeSubtitlePos(pos.id)}
                      style={{
                        padding: '4px 0',
                        borderRadius: '6px',
                        background: subtitlePos === pos.id ? 'var(--pink-primary)' : 'rgba(255, 255, 255, 0.08)',
                        color: subtitlePos === pos.id ? '#fff' : '#d1d5db',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timing Delay */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#9ca3af', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <span>Timing Sync</span>
                  <span style={{ color: '#f472b6' }}>{subtitleOffset > 0 ? `+${subtitleOffset}` : subtitleOffset}s</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                  {[-1.0, -0.5, 0, 0.5, 1.0].map((off) => (
                    <button
                      key={off}
                      onClick={() => adjustSubtitleOffset(off - subtitleOffset)}
                      style={{
                        padding: '4px 0',
                        borderRadius: '6px',
                        background: subtitleOffset === off ? 'var(--pink-primary)' : 'rgba(255, 255, 255, 0.08)',
                        color: subtitleOffset === off ? '#fff' : '#d1d5db',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.74rem',
                        fontWeight: 700
                      }}
                    >
                      {off === 0 ? '0s' : off > 0 ? `+${off}s` : `${off}s`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audio Tracks Popover */}
        {showAudioPopover && (
          <div
            className="track-popover-menu audio-popover-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: '72px',
              right: '80px',
              maxHeight: '380px',
              width: '280px',
              overflowY: 'auto',
              zIndex: 999,
              background: 'rgba(23, 15, 32, 0.96)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(244, 114, 182, 0.35)',
              borderRadius: '16px',
              padding: '0.9rem',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7), 0 0 24px rgba(244, 114, 182, 0.25)',
              color: '#fff'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.92rem', color: '#f472b6' }}>
                <ClayHeadphones size={18} />
                <span>Audio Tracks ({audioTracks.length || 1})</span>
              </div>
              <button
                onClick={() => setShowAudioPopover(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '2px', display: 'flex' }}
              >
                <ClayClose size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {audioTracks.length === 0 ? (
                <button
                  className="track-popover-item active"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '8px',
                    background: 'rgba(244, 114, 182, 0.22)',
                    color: '#f472b6',
                    border: '1px solid rgba(244, 114, 182, 0.45)',
                    cursor: 'default',
                    fontWeight: 700,
                    fontSize: '0.84rem'
                  }}
                >
                  <span>Default Audio (Stereo)</span>
                  <ClayCheck size={14} />
                </button>
              ) : (
                audioTracks.map((track, idx) => {
                  const trackIdx = track.index ?? idx;
                  const isActive = activeAudioIndex === trackIdx;
                  const trackStatus = audioStatusData?.tracks?.find((st) => st.index === trackIdx);
                  const isReady = trackIdx === 0 || trackStatus?.isReady;
                  const isProcessing = trackStatus?.isProcessing;

                  return (
                    <button
                      key={trackIdx}
                      onClick={() => {
                        handleSwitchAudioTrack(trackIdx);
                        setShowAudioPopover(false);
                      }}
                      className={`track-popover-item ${isActive ? 'active' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '8px',
                        background: isActive ? 'rgba(244, 114, 182, 0.22)' : 'rgba(255, 255, 255, 0.05)',
                        color: isActive ? '#f472b6' : '#e5e7eb',
                        border: isActive ? '1px solid rgba(244, 114, 182, 0.45)' : '1px solid transparent',
                        cursor: 'pointer',
                        fontWeight: isActive ? 700 : 500,
                        fontSize: '0.84rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textAlign: 'left' }}>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: 'rgba(244, 114, 182, 0.3)',
                          color: '#f9a8d4',
                          flexShrink: 0
                        }}>
                          {(track.language || 'AUDIO').toUpperCase()}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {track.title || `Track ${idx + 1}`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        {isReady ? (
                          <span style={{ fontSize: '0.66rem', padding: '2px 6px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.18)', color: '#34d399', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Check size={10} /> Ready
                          </span>
                        ) : isProcessing ? (
                          <span style={{ fontSize: '0.66rem', padding: '2px 6px', borderRadius: '6px', background: 'rgba(251, 191, 36, 0.18)', color: '#fbbf24', fontWeight: 700 }}>
                            Extracting...
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.66rem', padding: '2px 6px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.08)', color: '#9ca3af', fontWeight: 600 }}>
                            Instant Stream
                          </span>
                        )}
                        {isActive && <ClayCheck size={14} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Audio Processing Status Bar & One-Click Button */}
            {audioTracks.length > 1 && (
              <div style={{
                marginTop: '10px',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                  <span style={{ color: '#9ca3af', fontWeight: 600 }}>Audio Processing Status:</span>
                  <span style={{ color: audioStatusData?.allReady ? '#34d399' : '#f472b6', fontWeight: 700 }}>
                    {audioStatusData?.percent !== undefined ? `${audioStatusData.percent}% Cached` : '100% Ready'}
                  </span>
                </div>

                {/* Status Bar */}
                <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
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
                      padding: '7px 12px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #f472b6, #ec4899)',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.75rem',
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
                    <ClaySparkle size={13} />
                    {isProcessingAudio ? 'Processing in Background...' : 'Process All Audio Tracks'}
                  </button>
                ) : (
                  <div style={{ fontSize: '0.70rem', color: '#34d399', textAlign: 'center', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                    <Check size={12} color="#34d399" />
                    <span>All tracks cached for 0ms instant zero-lag switching!</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </>
    );

    const mountTarget = (artPlayerDomEl && activePlayerType !== 'youtube' && activePlayerType !== 'neko')
      ? artPlayerDomEl
      : theaterCanvasRef.current;

    if (mountTarget) {
      return ReactDOM.createPortal(popovers, mountTarget);
    }
    return popovers;
  }

  // Voice & Mic Settings Popover (Compact YouTube/Obsidian Style + Discord Per-Peer Controls)
  function renderVoiceSettingsPopover() {
    if (!showVoiceSettings) return null;

    const myName = (currentProfile?.name || currentProfile?.username || '').toLowerCase();
    const otherPeers = connectedUsers.filter(
      (u) => (u.username || u.name || '').toLowerCase() !== myName
    );

    const popover = (
      <div data-impeccable-variants="949c7b3c" data-impeccable-variant-count="3" style={{ display: "contents" }}>
        {/* impeccable-variants-start 949c7b3c */}
        {/* Original */}
        <div data-impeccable-variant="original">
          <div className="pouf-popover-shell voice-studio-deck" onClick={(e) => e.stopPropagation()}>
            <div className="voice-studio-topbar">
              <div aria-hidden="true" />
              <div className="voice-studio-pill-row" role="tablist" aria-label="Voice settings tabs">
                <button type="button" role="tab" aria-selected={voiceSettingsTab === 'mic'} onClick={() => setVoiceSettingsTab('mic')} className={`voice-studio-pill voice-studio-btn ${voiceSettingsTab === 'mic' ? 'active' : ''}`}>
                  {isVoiceConnected && !isMuted && <span className="vst-live-dot" aria-hidden="true" />}
                  <span>My Mic</span>
                </button>
                <button type="button" role="tab" aria-selected={voiceSettingsTab === 'peers'} onClick={() => setVoiceSettingsTab('peers')} className={`voice-studio-pill voice-studio-btn ${voiceSettingsTab === 'peers' ? 'active' : ''}`}>
                  <span>Member Mics ({otherPeers.length})</span>
                </button>
              </div>
              <button type="button" onClick={() => setShowVoiceSettings(false)} className="voice-studio-close voice-studio-btn" title="Close" aria-label="Close voice settings">
                <X size={14} />
              </button>
            </div>

            {voiceSettingsTab === 'mic' ? (
              <div className="voice-studio-cols">
                <div className="voice-studio-col">
                  <div className="voice-studio-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.73rem', fontWeight: 800 }}>Microphone</span>
                      <button type="button" onClick={refreshMediaDevices} className="voice-studio-btn" style={{ background: 'transparent', border: 'none', color: '#ec4899', fontSize: '0.69rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                        <RotateCcw size={10} /> Rescan
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '115px', overflowY: 'auto' }}>
                      {audioInputDevices.length === 0 ? (
                        <div style={{ fontSize: '0.74rem', opacity: 0.75, padding: '4px' }}>Default System Mic</div>
                      ) : (
                        audioInputDevices.map((dev, idx) => {
                          const isSelected = dev.deviceId === selectedAudioInput;
                          return (
                            <button
                              key={dev.deviceId || idx}
                              type="button"
                              onClick={() => switchAudioInput(dev.deviceId)}
                              className="voice-studio-btn"
                              style={{
                                textAlign: 'left',
                                padding: '6px 9px',
                                borderRadius: '10px',
                                border: isSelected ? '1.5px solid #ec4899' : '1px solid rgba(244,114,182,0.22)',
                                background: isSelected ? 'rgba(236, 72, 153, 0.14)' : 'transparent',
                                color: 'inherit',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer'
                              }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev.label || `Mic ${idx + 1}`}</span>
                              {isSelected && <Check size={13} color="#ec4899" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="voice-studio-box" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.73rem', fontWeight: 800 }}>Echo Cancellation</div>
                      <div style={{ fontSize: '0.66rem', opacity: 0.75 }}>{isEchoCancellationEnabled ? 'Speaker safe' : 'Headphones mode'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleEchoCancellationToggle}
                      className="voice-studio-btn"
                      style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        border: 'none',
                        background: isEchoCancellationEnabled ? '#ec4899' : 'rgba(148, 163, 184, 0.35)',
                        color: '#fff',
                        fontSize: '0.69rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      {isEchoCancellationEnabled ? 'On' : 'Off'}
                    </button>
                  </div>

                  {isVoiceConnected ? (
                    <button type="button" onClick={leaveVoiceChat} className="voice-studio-disconnect voice-studio-btn">
                      <MicOff size={14} /> Disconnect Mic
                    </button>
                  ) : (
                    <button type="button" onClick={() => startMicrophone()} className="voice-studio-connect voice-studio-btn">
                      <Mic size={14} /> Connect Mic
                    </button>
                  )}
                </div>

                <div className="voice-studio-col">
                  <div className="voice-studio-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.73rem', fontWeight: 800 }}>Suppression Engine</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#ec4899' }}>{noiseSuppressionMode.toUpperCase()}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                      {[
                        { id: 'rnnoise', label: 'AI Neural' },
                        { id: 'speex', label: 'Acoustic' },
                        { id: 'raw', label: 'Bypass' }
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => handleNoiseModeChange(mode.id)}
                          className="voice-studio-btn"
                          style={{
                            padding: '6px 3px',
                            borderRadius: '9px',
                            border: noiseSuppressionMode === mode.id ? '1.5px solid #ec4899' : '1px solid rgba(244,114,182,0.25)',
                            background: noiseSuppressionMode === mode.id ? '#ec4899' : 'transparent',
                            color: noiseSuppressionMode === mode.id ? '#fff' : 'inherit',
                            fontSize: '0.69rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="voice-studio-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.73rem', fontWeight: 800 }}>Noise Gate</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: noiseIntensity === 0 ? '#a7f3d0' : isNoiseGateOpen ? '#10b981' : '#f472b6' }}>
                        {noiseIntensity === 0 ? 'Off (Open)' : `${isNoiseGateOpen ? 'Open' : 'Gated'} · ${noiseIntensity}%`}
                      </span>
                    </div>
                    <div className="voice-gate-meter" title={`Gate threshold: ${noiseIntensity === 0 ? 0 : Math.max(1, Math.round(noiseIntensity * 0.55))}%`}>
                      <div
                        className="voice-gate-fill"
                        style={{
                          width: `${Math.min(100, micLevel)}%`,
                          background: isNoiseGateOpen ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #ec4899, #f472b6)',
                          boxShadow: isNoiseGateOpen ? '0 0 8px rgba(16, 185, 129, 0.45)' : 'none',
                        }}
                      />
                      {noiseIntensity > 0 && (
                        <div
                          className="voice-gate-threshold"
                          style={{ left: `${Math.max(1, Math.round(noiseIntensity * 0.55))}%` }}
                        />
                      )}
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={noiseIntensity}
                      aria-label="Noise Gate threshold"
                      className="voice-studio-range"
                      onChange={(e) => handleNoiseIntensityChange(Number(e.target.value))}
                    />
                  </div>

                  <div className="voice-studio-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.73rem', fontWeight: 800 }}>Mic Sensitivity</span>
                      <span style={{ fontSize: '0.69rem', fontWeight: 700, color: '#f472b6' }}>
                        {micGain}% ({micGain === 100 ? '0 dB' : `${((micGain - 100) * 0.12) > 0 ? '+' : ''}${((micGain - 100) * 0.12).toFixed(1)} dB`})
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="200"
                      step="5"
                      value={micGain}
                      aria-label="Mic Sensitivity"
                      className="voice-studio-range"
                      onChange={(e) => handleMicGainChange(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="voice-studio-box voice-studio-panel-anim" style={{ maxHeight: '210px', overflowY: 'auto' }}>
                {otherPeers.length === 0 ? (
                  <div style={{ textAlign: 'center', fontSize: '0.78rem', padding: '16px', opacity: 0.75 }}>No other members in voice</div>
                ) : (
                  otherPeers.map((user) => {
                    const pId = user.id || user.peerId || user.socketId;
                    const peerVol = peerVolumes.get(pId) ?? 100;
                    const isMuted = peerVol === 0;
                    return (
                      <div key={pId || user.username} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px', borderBottom: '1px solid rgba(244,114,182,0.16)' }}>
                        <UserAvatar avatar={user.avatar || 'jojo-star'} size="20px" />
                        <span style={{ fontSize: '0.77rem', fontWeight: 700, flex: 1 }}>{user.username || user.name || 'Friend'}</span>
                        <input type="range" min="0" max="200" step="5" value={peerVol} onChange={(e) => handlePeerVolume(pId, e.target.value)} style={{ width: '120px', accentColor: '#ec4899' }} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, minWidth: '36px', textAlign: 'right' }}>{peerVol}%</span>
                        <button type="button" onClick={() => handlePeerVolume(pId, isMuted ? 100 : 0)} className="voice-studio-btn" style={{ background: 'none', border: 'none', color: '#ec4899', cursor: 'pointer', display: 'flex' }}>
                          {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
        {/* Variants: insert below this line */}
        <style data-impeccable-css="949c7b3c">{`
          @keyframes vs949Beacon {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55); }
            50% { transform: scale(1.12); box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
          }
          @keyframes vs949Enter {
            from { opacity: 0; transform: translate3d(-50%, 8px, 0) scale(0.97); }
            to { opacity: 1; transform: translate3d(-50%, 0, 0) scale(1); }
          }

          @scope ([data-impeccable-variant="1"]) {
            :scope > .vs949-v1 {
              position: absolute;
              bottom: calc(100% + 12px);
              left: 50%;
              transform: translate3d(-50%, 0, 0);
              width: min(444px, calc(100vw - 24px));
              max-height: 360px;
              overflow: hidden;
              padding: 11px 12px;
              border-radius: 20px;
              background: linear-gradient(160deg, rgba(255, 182, 222, 0.19) 0%, rgba(88, 20, 60, 0.54) 30%, rgba(20, 8, 22, 0.86) 100%);
              border: 1px solid rgba(244, 114, 182, 0.36);
              box-shadow: 0 24px 56px rgba(0, 0, 0, 0.72), 0 0 34px rgba(236, 72, 153, 0.22), inset 0 1px 0 rgba(255, 232, 245, 0.46), inset 0 -1px 0 rgba(236, 72, 153, 0.30);
              backdrop-filter: blur(16px) saturate(195%);
              -webkit-backdrop-filter: blur(16px) saturate(195%);
              color: #fdf2f8;
              z-index: 1000;
              display: flex;
              flex-direction: column;
              gap: 9px;
              animation: vs949Enter 190ms cubic-bezier(0.22, 1, 0.36, 1) both;
            }
            :scope[data-p-shell-tint="deep-noir"] > .vs949-v1 {
              background: linear-gradient(160deg, rgba(255, 210, 236, 0.09) 0%, rgba(24, 11, 26, 0.88) 100%);
              border-color: rgba(251, 207, 232, 0.24);
            }
            :scope[data-p-compactness="cozy"] > .vs949-v1 {
              width: min(468px, calc(100vw - 24px));
              padding: 13px 14px;
              gap: 11px;
            }

            :scope > .vs949-v1 .vs-head {
              display: flex;
              align-items: center;
              gap: 8px;
              padding-bottom: 8px;
              border-bottom: 1px solid rgba(251, 207, 232, 0.16);
            }
            :scope > .vs949-v1 .vs-tabs {
              flex: 1;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 4px;
              padding: 3px;
              border-radius: 11px;
              background: rgba(255, 226, 242, 0.06);
              border: 1px solid rgba(251, 207, 232, 0.16);
            }
            :scope > .vs949-v1 .vs-tab {
              border: none;
              border-radius: 8px;
              padding: 5px 8px;
              font-size: 0.72rem;
              font-weight: 700;
              cursor: pointer;
              background: transparent;
              color: rgba(253, 228, 242, 0.72);
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              transition: background 180ms ease, color 180ms ease, transform 140ms ease;
            }
            :scope > .vs949-v1 .vs-tab.is-on {
              background: rgba(244, 114, 182, 0.28);
              color: #fdf2f8;
              box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.26), inset 0 0 0 1px rgba(251, 207, 232, 0.36);
            }
            :scope > .vs949-v1 .vs-dot {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: #10b981;
              animation: vs949Beacon 1.8s ease-in-out infinite;
            }
            :scope > .vs949-v1 .vs-close {
              width: 28px;
              height: 28px;
              border-radius: 9999px;
              border: 1px solid rgba(251, 207, 232, 0.22);
              background: rgba(255, 228, 244, 0.08);
              color: #fbcfe8;
              display: grid;
              place-items: center;
              cursor: pointer;
              transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background 160ms ease, border-color 160ms ease, color 160ms ease;
            }
            :scope > .vs949-v1 .vs-close:hover {
              background: rgba(236, 72, 153, 0.28);
              border-color: rgba(251, 207, 232, 0.48);
              color: #ffffff;
              transform: rotate(90deg) scale(1.06);
            }
            :scope > .vs949-v1 .vs-close:active { transform: rotate(90deg) scale(0.92); }

            :scope > .vs949-v1 .vs-cols {
              display: grid;
              grid-template-columns: 1.05fr 1fr;
              gap: 12px;
              align-items: stretch;
            }
            :scope > .vs949-v1 .vs-col {
              display: flex;
              flex-direction: column;
              gap: 8px;
              min-width: 0;
            }
            :scope > .vs949-v1 .vs-col-right {
              padding-left: 11px;
              border-left: 1px solid rgba(251, 207, 232, 0.14);
            }
            :scope > .vs949-v1 .vs-sec-head {
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 0.7rem;
              font-weight: 800;
              color: #fce7f3;
            }
            :scope > .vs949-v1 .vs-rescan {
              background: transparent;
              border: none;
              color: #f472b6;
              font-size: 0.68rem;
              font-weight: 700;
              display: inline-flex;
              align-items: center;
              gap: 3px;
              cursor: pointer;
              padding: 2px 5px;
              border-radius: 6px;
              transition: background 150ms ease, color 150ms ease;
            }
            :scope > .vs949-v1 .vs-rescan:hover { background: rgba(244, 114, 182, 0.16); color: #ffffff; }

            :scope > .vs949-v1 .vs-mic-list {
              display: flex;
              flex-direction: column;
              gap: 4px;
              min-height: 68px;
              max-height: 112px;
              overflow-y: auto;
              padding-right: 2px;
            }
            :scope > .vs949-v1 .vs-mic-row {
              text-align: left;
              padding: 5px 8px;
              border-radius: 9px;
              border: 1px solid rgba(251, 207, 232, 0.14);
              background: rgba(255, 228, 244, 0.05);
              color: #fce7f3;
              font-size: 0.71rem;
              font-weight: 700;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 6px;
              cursor: pointer;
              transition: background 150ms ease, border-color 150ms ease, transform 140ms ease;
            }
            :scope > .vs949-v1 .vs-mic-row:hover {
              background: rgba(244, 114, 182, 0.16);
              border-color: rgba(251, 207, 232, 0.32);
            }
            :scope > .vs949-v1 .vs-mic-row.is-on {
              background: rgba(236, 72, 153, 0.24);
              border-color: rgba(244, 114, 182, 0.65);
              color: #ffffff;
            }

            :scope > .vs949-v1 .vs-action-pair {
              display: grid;
              grid-template-columns: 1fr 1.15fr;
              gap: 6px;
              margin-top: auto;
            }
            :scope > .vs949-v1 .vs-anim-btn {
              position: relative;
              height: 30px;
              padding: 0 9px;
              border-radius: 10px;
              border: 1px solid rgba(251, 207, 232, 0.2);
              background: rgba(255, 228, 244, 0.07);
              color: #fce7f3;
              font-size: 0.69rem;
              font-weight: 800;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              cursor: pointer;
              white-space: nowrap;
              transition: transform 170ms cubic-bezier(0.22, 1, 0.36, 1), background 170ms ease, border-color 170ms ease, box-shadow 170ms ease;
            }
            :scope > .vs949-v1 .vs-anim-btn:hover { transform: translateY(-1px); background: rgba(244, 114, 182, 0.18); border-color: rgba(251, 207, 232, 0.42); }
            :scope > .vs949-v1 .vs-anim-btn:active { transform: translateY(1px) scale(0.96); }
            :scope > .vs949-v1 .vs-anim-btn.is-echo-on {
              background: rgba(236, 72, 153, 0.26);
              border-color: rgba(244, 114, 182, 0.58);
              color: #ffffff;
              box-shadow: 0 4px 12px rgba(236, 72, 153, 0.25);
            }
            :scope > .vs949-v1 .vs-anim-btn.is-connect {
              background: linear-gradient(135deg, #f472b6, #db2777);
              border-color: rgba(255, 255, 255, 0.35);
              color: #ffffff;
              box-shadow: 0 5px 14px rgba(236, 72, 153, 0.36);
            }
            :scope > .vs949-v1 .vs-anim-btn.is-disconnect {
              background: rgba(239, 68, 68, 0.2);
              border-color: rgba(248, 113, 113, 0.46);
              color: #fecaca;
            }

            :scope > .vs949-v1 .vs-seg3 {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 3px;
              padding: 3px;
              border-radius: 10px;
              background: rgba(255, 226, 242, 0.06);
              border: 1px solid rgba(251, 207, 232, 0.14);
            }
            :scope > .vs949-v1 .vs-seg-btn {
              border: none;
              border-radius: 7px;
              padding: 4px 2px;
              font-size: 0.67rem;
              font-weight: 700;
              cursor: pointer;
              background: transparent;
              color: rgba(253, 232, 243, 0.78);
              transition: background 150ms ease, color 150ms ease;
            }
            :scope > .vs949-v1 .vs-seg-btn.is-on {
              background: rgba(236, 72, 153, 0.34);
              color: #ffffff;
              box-shadow: inset 0 0 0 1px rgba(251, 207, 232, 0.36);
            }

            :scope > .vs949-v1 .vs-meter {
              position: relative;
              width: 100%;
              height: 5px;
              border-radius: 9999px;
              background: rgba(255, 224, 240, 0.14);
              overflow: visible;
            }
            :scope > .vs949-v1 .vs-meter-fill {
              height: 100%;
              border-radius: 9999px;
              transition: width 70ms linear, background 150ms ease;
            }
            :scope > .vs949-v1 .vs-meter-mark {
              position: absolute;
              top: -2px;
              bottom: -2px;
              width: 2px;
              border-radius: 9999px;
              background: #fdf2f8;
              transform: translateX(-50%);
              pointer-events: none;
            }

            :scope > .vs949-v1 .vs-range {
              -webkit-appearance: none;
              appearance: none;
              width: 100%;
              height: 5px;
              border-radius: 9999px;
              background: linear-gradient(90deg, #f472b6 var(--pct, 50%), rgba(255, 224, 240, 0.16) var(--pct, 50%));
              outline: none;
              cursor: pointer;
            }
            :scope > .vs949-v1 .vs-range::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 13px;
              height: 13px;
              border-radius: 50%;
              background: #ffffff;
              border: 2px solid #ec4899;
              box-shadow: 0 2px 8px rgba(236, 72, 153, 0.55);
              cursor: pointer;
              transition: transform 140ms ease, box-shadow 140ms ease;
            }
            :scope > .vs949-v1 .vs-range::-webkit-slider-thumb:hover {
              transform: scale(1.18);
              box-shadow: 0 0 0 4px rgba(236, 72, 153, 0.28);
            }

            :scope > .vs949-v1 .vs-peers {
              max-height: 190px;
              overflow-y: auto;
              display: flex;
              flex-direction: column;
              gap: 6px;
            }
            :scope > .vs949-v1 .vs-peer-row {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 6px 8px;
              border-radius: 11px;
              background: rgba(255, 228, 244, 0.05);
              border: 1px solid rgba(251, 207, 232, 0.14);
            }
            :scope > .vs949-v1 .vs-peer-mute {
              width: 26px;
              height: 26px;
              border-radius: 9999px;
              border: 1px solid rgba(251, 207, 232, 0.18);
              background: rgba(255, 228, 244, 0.06);
              color: #f472b6;
              display: grid;
              place-items: center;
              cursor: pointer;
              transition: background 150ms ease, transform 140ms ease;
            }
            :scope > .vs949-v1 .vs-peer-mute:hover { background: rgba(236, 72, 153, 0.22); transform: scale(1.06); }
          }

          @scope ([data-impeccable-variant="2"]) {
            :scope > .vs949-v2 {
              position: absolute;
              bottom: calc(100% + 12px);
              left: 50%;
              transform: translate3d(-50%, 0, 0);
              width: min(calc(var(--p-drawer-width, 340) * 1px), calc(100vw - 24px));
              max-height: 410px;
              overflow-y: auto;
              padding: 10px 12px;
              border-radius: 20px;
              background: linear-gradient(160deg, rgba(255, 182, 222, 0.19) 0%, rgba(88, 20, 60, 0.54) 30%, rgba(20, 8, 22, 0.85) 100%);
              border: 1px solid rgba(244, 114, 182, 0.36);
              box-shadow: 0 24px 56px rgba(0, 0, 0, 0.72), 0 0 34px rgba(236, 72, 153, 0.22), inset 0 1px 0 rgba(255, 232, 245, 0.46), inset 0 -1px 0 rgba(236, 72, 153, 0.30);
              backdrop-filter: blur(calc(var(--p-glass-blur, 16) * 1px)) saturate(195%);
              -webkit-backdrop-filter: blur(calc(var(--p-glass-blur, 16) * 1px)) saturate(195%);
              color: #fdf2f8;
              z-index: 1000;
              display: flex;
              flex-direction: column;
              gap: 8px;
              animation: vs949Enter 190ms cubic-bezier(0.22, 1, 0.36, 1) both;
            }
            :scope > .vs949-v2 .vs-head {
              display: flex;
              align-items: center;
              gap: 8px;
              padding-bottom: 6px;
              border-bottom: 1px solid rgba(251, 207, 232, 0.18);
            }
            :scope > .vs949-v2 .vs-tabs {
              flex: 1;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 4px;
              padding: 3px;
              border-radius: 10px;
              background: rgba(255, 226, 242, 0.06);
              border: 1px solid rgba(251, 207, 232, 0.16);
            }
            :scope > .vs949-v2 .vs-tab {
              border: none;
              border-radius: 7px;
              padding: 4px 6px;
              font-size: 0.71rem;
              font-weight: 700;
              cursor: pointer;
              background: transparent;
              color: rgba(253, 228, 242, 0.72);
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              transition: background 160ms ease, color 160ms ease;
            }
            :scope > .vs949-v2 .vs-tab.is-on {
              background: rgba(244, 114, 182, 0.28);
              color: #fdf2f8;
              box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.26), inset 0 0 0 1px rgba(251, 207, 232, 0.36);
            }
            :scope > .vs949-v2 .vs-dot {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: #10b981;
              animation: vs949Beacon 1.8s ease-in-out infinite;
            }
            :scope > .vs949-v2 .vs-close {
              width: 26px;
              height: 26px;
              border-radius: 9999px;
              border: 1px solid rgba(251, 207, 232, 0.2);
              background: rgba(255, 228, 244, 0.07);
              color: #fbcfe8;
              display: grid;
              place-items: center;
              cursor: pointer;
              transition: transform 170ms cubic-bezier(0.22, 1, 0.36, 1), background 160ms ease, color 160ms ease;
            }
            :scope > .vs949-v2 .vs-close:hover { background: rgba(236, 72, 153, 0.28); color: #ffffff; transform: scale(1.08); }
            :scope > .vs949-v2 .vs-mic-list {
              display: flex;
              flex-direction: column;
              gap: 4px;
              max-height: 92px;
              overflow-y: auto;
            }
            :scope > .vs949-v2 .vs-mic-row {
              padding: 5px 8px;
              border-radius: 9px;
              border: 1px solid rgba(251, 207, 232, 0.14);
              background: rgba(255, 228, 244, 0.05);
              color: #fce7f3;
              font-size: 0.71rem;
              font-weight: 700;
              display: flex;
              align-items: center;
              justify-content: space-between;
              cursor: pointer;
              transition: background 150ms ease, border-color 150ms ease;
            }
            :scope > .vs949-v2 .vs-mic-row.is-on {
              background: rgba(236, 72, 153, 0.24);
              border-color: rgba(244, 114, 182, 0.62);
              color: #ffffff;
            }
            :scope > .vs949-v2 .vs-pair {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 6px;
            }
            :scope > .vs949-v2 .vs-anim-btn {
              height: 29px;
              padding: 0 8px;
              border-radius: 9999px;
              border: 1px solid rgba(251, 207, 232, 0.2);
              background: rgba(255, 228, 244, 0.07);
              color: #fce7f3;
              font-size: 0.69rem;
              font-weight: 800;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              cursor: pointer;
              transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1), background 160ms ease, border-color 160ms ease;
            }
            :scope > .vs949-v2 .vs-anim-btn:hover { transform: translateY(-1px); background: rgba(244, 114, 182, 0.18); }
            :scope > .vs949-v2 .vs-anim-btn:active { transform: scale(0.95); }
            :scope > .vs949-v2 .vs-anim-btn.is-echo-on { background: rgba(236, 72, 153, 0.26); border-color: rgba(244, 114, 182, 0.56); color: #ffffff; }
            :scope > .vs949-v2 .vs-anim-btn.is-connect { background: linear-gradient(135deg, #f472b6, #db2777); border-color: rgba(255, 255, 255, 0.34); color: #ffffff; }
            :scope > .vs949-v2 .vs-anim-btn.is-disconnect { background: rgba(239, 68, 68, 0.2); border-color: rgba(248, 113, 113, 0.44); color: #fecaca; }

            :scope > .vs949-v2 .vs-seg3 {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 3px;
              padding: 3px;
              border-radius: 9px;
              background: rgba(255, 226, 242, 0.06);
              border: 1px solid rgba(251, 207, 232, 0.14);
            }
            :scope > .vs949-v2 .vs-seg-btn {
              border: none;
              border-radius: 6px;
              padding: 4px 2px;
              font-size: 0.67rem;
              font-weight: 700;
              cursor: pointer;
              background: transparent;
              color: rgba(253, 232, 243, 0.76);
            }
            :scope > .vs949-v2 .vs-seg-btn.is-on {
              background: rgba(236, 72, 153, 0.32);
              color: #ffffff;
            }
            :scope > .vs949-v2 .vs-range {
              -webkit-appearance: none;
              appearance: none;
              width: 100%;
              height: 5px;
              border-radius: 9999px;
              background: linear-gradient(90deg, #f472b6 var(--pct, 50%), rgba(255, 224, 240, 0.16) var(--pct, 50%));
              outline: none;
              cursor: pointer;
            }
            :scope > .vs949-v2 .vs-range::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 13px;
              height: 13px;
              border-radius: 50%;
              background: #ffffff;
              border: 2px solid #ec4899;
              box-shadow: 0 2px 7px rgba(236, 72, 153, 0.5);
              cursor: pointer;
            }
            :scope > .vs949-v2 .vs-meter {
              position: relative;
              width: 100%;
              height: 4px;
              border-radius: 9999px;
              background: rgba(255, 224, 240, 0.14);
            }
            :scope > .vs949-v2 .vs-meter-fill { height: 100%; border-radius: 9999px; transition: width 70ms linear; }
            :scope > .vs949-v2 .vs-meter-mark { position: absolute; top: -2px; bottom: -2px; width: 2px; border-radius: 9999px; background: #fdf2f8; transform: translateX(-50%); }
          }

          @scope ([data-impeccable-variant="3"]) {
            :scope > .vs949-v3 {
              position: absolute;
              bottom: calc(100% + 12px);
              left: 50%;
              transform: translate3d(-50%, 0, 0);
              width: min(466px, calc(100vw - 24px));
              max-height: 350px;
              overflow: hidden;
              padding: 10px 12px;
              border-radius: 20px;
              background: linear-gradient(160deg, rgba(255, 182, 222, 0.16) 0%, rgba(72, 18, 52, 0.56) 34%, rgba(16, 8, 20, 0.88) 100%);
              border: 1px solid rgba(244, 114, 182, 0.34);
              box-shadow: 0 24px 56px rgba(0, 0, 0, 0.74), 0 0 calc(36px * var(--p-accent-glow, 0.75)) rgba(236, 72, 153, 0.28), inset 0 1px 0 rgba(255, 232, 245, 0.44);
              backdrop-filter: blur(16px) saturate(190%);
              -webkit-backdrop-filter: blur(16px) saturate(190%);
              color: #fdf2f8;
              z-index: 1000;
              display: flex;
              flex-direction: column;
              gap: 8px;
              animation: vs949Enter 190ms cubic-bezier(0.22, 1, 0.36, 1) both;
            }
            :scope > .vs949-v3 .vs-head {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
            }
            :scope > .vs949-v3 .vs-tabs {
              display: inline-flex;
              align-items: center;
              gap: 3px;
              padding: 3px;
              border-radius: 9999px;
              background: rgba(255, 226, 242, 0.06);
              border: 1px solid rgba(251, 207, 232, 0.16);
            }
            :scope > .vs949-v3 .vs-tab {
              border: none;
              border-radius: 9999px;
              padding: 4px 12px;
              font-size: 0.71rem;
              font-weight: 700;
              cursor: pointer;
              background: transparent;
              color: rgba(253, 228, 242, 0.72);
              display: inline-flex;
              align-items: center;
              gap: 5px;
              transition: background 170ms ease, color 170ms ease;
            }
            :scope > .vs949-v3 .vs-tab.is-on {
              background: rgba(236, 72, 153, 0.34);
              color: #ffffff;
              box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), inset 0 0 0 1px rgba(251, 207, 232, 0.38);
            }
            :scope > .vs949-v3 .vs-dot {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: #10b981;
              animation: vs949Beacon 1.8s ease-in-out infinite;
            }
            :scope > .vs949-v3 .vs-close {
              width: 28px;
              height: 28px;
              border-radius: 9999px;
              border: 1px solid rgba(251, 207, 232, 0.2);
              background: rgba(255, 228, 244, 0.07);
              color: #fbcfe8;
              display: grid;
              place-items: center;
              cursor: pointer;
              transition: background 160ms ease, border-color 160ms ease, transform 170ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms ease;
            }
            :scope > .vs949-v3 .vs-close:hover {
              background: rgba(236, 72, 153, 0.28);
              border-color: rgba(251, 207, 232, 0.5);
              color: #ffffff;
              transform: scale(1.08);
            }

            :scope > .vs949-v3 .vs-split {
              display: grid;
              grid-template-columns: 1fr 1.05fr;
              gap: 10px;
              align-items: stretch;
            }
            :scope > .vs949-v3 .vs-zone {
              padding: 8px 10px;
              border-radius: 14px;
              background: rgba(255, 228, 244, 0.045);
              border: 1px solid rgba(251, 207, 232, 0.14);
              display: flex;
              flex-direction: column;
              gap: 7px;
              min-width: 0;
            }
            :scope > .vs949-v3 .vs-mic-list {
              display: flex;
              flex-direction: column;
              gap: 4px;
              min-height: 70px;
              max-height: 112px;
              overflow-y: auto;
            }
            :scope > .vs949-v3 .vs-mic-row {
              padding: 5px 8px;
              border-radius: 8px;
              border: 1px solid rgba(251, 207, 232, 0.12);
              background: rgba(255, 255, 255, 0.03);
              color: #fce7f3;
              font-size: 0.7rem;
              font-weight: 700;
              display: flex;
              align-items: center;
              justify-content: space-between;
              cursor: pointer;
              transition: background 140ms ease, border-color 140ms ease;
            }
            :scope > .vs949-v3 .vs-mic-row.is-on {
              background: rgba(236, 72, 153, 0.22);
              border-color: rgba(244, 114, 182, 0.58);
              color: #ffffff;
            }

            :scope > .vs949-v3 .vs-dock-pair {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 6px;
              margin-top: auto;
            }
            :scope > .vs949-v3 .vs-dock-btn {
              height: 30px;
              padding: 0 8px;
              border-radius: 9999px;
              border: 1px solid rgba(251, 207, 232, 0.18);
              background: rgba(255, 228, 244, 0.07);
              color: #fce7f3;
              font-size: 0.68rem;
              font-weight: 800;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              cursor: pointer;
              transition: transform 170ms cubic-bezier(0.22, 1, 0.36, 1), background 170ms ease, border-color 170ms ease, box-shadow 170ms ease;
            }
            :scope > .vs949-v3 .vs-dock-btn:hover { transform: translateY(-1px); background: rgba(244, 114, 182, 0.18); }
            :scope > .vs949-v3 .vs-dock-btn:active { transform: scale(0.95); }
            :scope > .vs949-v3 .vs-dock-btn.is-echo-on {
              background: rgba(236, 72, 153, 0.24);
              border-color: rgba(244, 114, 182, 0.56);
              color: #ffffff;
            }
            :scope > .vs949-v3 .vs-dock-btn.is-connect {
              background: linear-gradient(135deg, #f472b6, #db2777);
              border-color: rgba(255, 255, 255, 0.34);
              color: #ffffff;
              box-shadow: 0 4px 12px rgba(236, 72, 153, 0.35);
            }
            :scope > .vs949-v3 .vs-dock-btn.is-disconnect {
              background: rgba(239, 68, 68, 0.2);
              border-color: rgba(248, 113, 113, 0.44);
              color: #fecaca;
            }

            :scope > .vs949-v3 .vs-seg3 {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 3px;
              padding: 3px;
              border-radius: 9px;
              background: rgba(255, 226, 242, 0.05);
              border: 1px solid rgba(251, 207, 232, 0.14);
            }
            :scope > .vs949-v3 .vs-seg-btn {
              border: none;
              border-radius: 6px;
              padding: 4px 2px;
              font-size: 0.66rem;
              font-weight: 700;
              cursor: pointer;
              background: transparent;
              color: rgba(253, 232, 243, 0.76);
            }
            :scope > .vs949-v3 .vs-seg-btn.is-on {
              background: rgba(236, 72, 153, 0.32);
              color: #ffffff;
            }

            :scope > .vs949-v3 .vs-range {
              -webkit-appearance: none;
              appearance: none;
              width: 100%;
              height: 5px;
              border-radius: 9999px;
              background: linear-gradient(90deg, #f472b6 var(--pct, 50%), rgba(255, 224, 240, 0.16) var(--pct, 50%));
              outline: none;
              cursor: pointer;
            }
            :scope[data-p-slider-style="minimal"] > .vs949-v3 .vs-range {
              height: 3px;
              background: rgba(255, 224, 240, 0.2);
            }
            :scope > .vs949-v3 .vs-range::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 13px;
              height: 13px;
              border-radius: 50%;
              background: #ffffff;
              border: 2px solid #ec4899;
              box-shadow: 0 2px 8px rgba(236, 72, 153, 0.55);
              cursor: pointer;
            }
            :scope > .vs949-v3 .vs-meter {
              position: relative;
              width: 100%;
              height: 5px;
              border-radius: 9999px;
              background: rgba(255, 224, 240, 0.14);
            }
            :scope > .vs949-v3 .vs-meter-fill { height: 100%; border-radius: 9999px; transition: width 70ms linear; }
            :scope > .vs949-v3 .vs-meter-mark { position: absolute; top: -2px; bottom: -2px; width: 2px; border-radius: 9999px; background: #fdf2f8; transform: translateX(-50%); }
          }
        `}</style>

        <div
          data-impeccable-variant="1"
          data-impeccable-params='[{"id":"shell-tint","kind":"steps","default":"rose-obsidian","label":"Glass tint","options":[{"value":"rose-obsidian","label":"Rose Glass"},{"value":"deep-noir","label":"Obsidian"}]},{"id":"compactness","kind":"steps","default":"tight","label":"Density","options":[{"value":"tight","label":"Compact"},{"value":"cozy","label":"Cozy"}]}]'
        >
          <div className="vs949-v1" onClick={(e) => e.stopPropagation()}>
            <div className="vs-head">
              <div className="vs-tabs" role="tablist" aria-label="Voice settings tabs">
                <button type="button" role="tab" aria-selected={voiceSettingsTab === 'mic'} onClick={() => setVoiceSettingsTab('mic')} className={`vs-tab ${voiceSettingsTab === 'mic' ? 'is-on' : ''}`}>
                  {isVoiceConnected && !isMuted && <span className="vs-dot" aria-hidden="true" />}
                  <span>My Mic</span>
                </button>
                <button type="button" role="tab" aria-selected={voiceSettingsTab === 'peers'} onClick={() => setVoiceSettingsTab('peers')} className={`vs-tab ${voiceSettingsTab === 'peers' ? 'is-on' : ''}`}>
                  <span>Member Mics ({otherPeers.length})</span>
                </button>
              </div>
              <button type="button" onClick={() => setShowVoiceSettings(false)} className="vs-close" title="Close" aria-label="Close voice settings">
                <X size={13} />
              </button>
            </div>

            {voiceSettingsTab === 'mic' ? (
              <div className="vs-cols">
                <div className="vs-col">
                  <div className="vs-sec-head">
                    <span>Microphone ({audioInputDevices.length || 1})</span>
                    <button type="button" onClick={refreshMediaDevices} className="vs-rescan">
                      <RotateCcw size={10} /> Rescan
                    </button>
                  </div>
                  <div className="vs-mic-list">
                    {audioInputDevices.length === 0 ? (
                      <div style={{ fontSize: '0.71rem', opacity: 0.72, padding: '6px' }}>Default System Mic</div>
                    ) : (
                      audioInputDevices.map((dev, idx) => {
                        const isSelected = dev.deviceId === selectedAudioInput;
                        return (
                          <button
                            key={dev.deviceId || idx}
                            type="button"
                            onClick={() => switchAudioInput(dev.deviceId)}
                            className={`vs-mic-row ${isSelected ? 'is-on' : ''}`}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev.label || `Mic ${idx + 1}`}</span>
                            {isSelected && <Check size={12} color="#f472b6" style={{ flexShrink: 0 }} />}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="vs-action-pair">
                    <button
                      type="button"
                      onClick={handleEchoCancellationToggle}
                      className={`vs-anim-btn ${isEchoCancellationEnabled ? 'is-echo-on' : ''}`}
                      title={isEchoCancellationEnabled ? 'Echo Cancellation: On (Speaker safe)' : 'Echo Cancellation: Off (Headphones mode)'}
                    >
                      <span>{isEchoCancellationEnabled ? 'Echo: On' : 'Echo: Off'}</span>
                    </button>
                    {isVoiceConnected ? (
                      <button type="button" onClick={leaveVoiceChat} className="vs-anim-btn is-disconnect">
                        <MicOff size={12} /> <span>Disconnect</span>
                      </button>
                    ) : (
                      <button type="button" onClick={() => startMicrophone()} className="vs-anim-btn is-connect">
                        <Mic size={12} /> <span>Connect</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="vs-col vs-col-right">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="vs-sec-head">
                      <span>Suppression</span>
                      <span style={{ fontSize: '0.65rem', color: '#f472b6' }}>{noiseSuppressionMode.toUpperCase()}</span>
                    </div>
                    <div className="vs-seg3">
                      {[{ id: 'rnnoise', label: 'AI Neural' }, { id: 'speex', label: 'Acoustic' }, { id: 'raw', label: 'Bypass' }].map((mode) => (
                        <button key={mode.id} type="button" onClick={() => handleNoiseModeChange(mode.id)} className={`vs-seg-btn ${noiseSuppressionMode === mode.id ? 'is-on' : ''}`}>
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div className="vs-sec-head">
                      <span>Noise Gate</span>
                      <span style={{ fontSize: '0.65rem', color: noiseIntensity === 0 ? '#a7f3d0' : isNoiseGateOpen ? '#10b981' : '#f472b6' }}>
                        {noiseIntensity === 0 ? 'Off' : `${isNoiseGateOpen ? 'Open' : 'Gated'} · ${noiseIntensity}%`}
                      </span>
                    </div>
                    <div className="vs-meter">
                      <div
                        className="vs-meter-fill"
                        style={{
                          width: `${Math.min(100, micLevel)}%`,
                          background: isNoiseGateOpen ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #ec4899, #f472b6)',
                        }}
                      />
                      {noiseIntensity > 0 && <div className="vs-meter-mark" style={{ left: `${Math.max(1, Math.round(noiseIntensity * 0.55))}%` }} />}
                    </div>
                    <input
                      type="range" min="0" max="100" step="5" value={noiseIntensity}
                      aria-label="Noise Gate threshold"
                      className="vs-range"
                      style={{ '--pct': `${noiseIntensity}%` }}
                      onChange={(e) => handleNoiseIntensityChange(Number(e.target.value))}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div className="vs-sec-head">
                      <span>Mic Sensitivity</span>
                      <span style={{ fontSize: '0.65rem', color: '#f472b6' }}>
                        {micGain}% ({micGain === 100 ? '0 dB' : `${((micGain - 100) * 0.12) > 0 ? '+' : ''}${((micGain - 100) * 0.12).toFixed(1)} dB`})
                      </span>
                    </div>
                    <input
                      type="range" min="50" max="200" step="5" value={micGain}
                      aria-label="Mic Sensitivity"
                      className="vs-range"
                      style={{ '--pct': `${Math.round(((micGain - 50) / 150) * 100)}%` }}
                      onChange={(e) => handleMicGainChange(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="vs-peers">
                {otherPeers.length === 0 ? (
                  <div style={{ textAlign: 'center', fontSize: '0.74rem', padding: '18px 8px', color: 'rgba(253, 228, 242, 0.72)' }}>
                    No other members connected in voice yet
                  </div>
                ) : (
                  otherPeers.map((user) => {
                    const pId = user.id || user.peerId || user.socketId;
                    const peerVol = peerVolumes.get(pId) ?? 100;
                    const isPeerMuted = peerVol === 0;
                    return (
                      <div key={pId || user.username} className="vs-peer-row">
                        <UserAvatar avatar={user.avatar || 'jojo-star'} size="20px" />
                        <span style={{ fontSize: '0.73rem', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username || user.name || 'Friend'}</span>
                        <input
                          type="range" min="0" max="200" step="5" value={peerVol}
                          onChange={(e) => handlePeerVolume(pId, e.target.value)}
                          className="vs-range"
                          style={{ width: '104px', '--pct': `${Math.round((peerVol / 200) * 100)}%` }}
                        />
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, minWidth: '34px', textAlign: 'right', color: '#fbcfe8' }}>{peerVol}%</span>
                        <button type="button" onClick={() => handlePeerVolume(pId, isPeerMuted ? 100 : 0)} className="vs-peer-mute" title={isPeerMuted ? 'Unmute member' : 'Mute member'}>
                          {isPeerMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <div
          data-impeccable-variant="2"
          style={{ display: 'none' }}
          data-impeccable-params='[{"id":"drawer-width","kind":"range","min":310,"max":390,"step":20,"default":340,"label":"Panel width (px)"},{"id":"glass-blur","kind":"range","min":10,"max":24,"step":2,"default":16,"label":"Blur (px)"}]'
        >
          <div className="vs949-v2" onClick={(e) => e.stopPropagation()}>
            <div className="vs-head">
              <div className="vs-tabs" role="tablist" aria-label="Voice settings tabs">
                <button type="button" role="tab" aria-selected={voiceSettingsTab === 'mic'} onClick={() => setVoiceSettingsTab('mic')} className={`vs-tab ${voiceSettingsTab === 'mic' ? 'is-on' : ''}`}>
                  {isVoiceConnected && !isMuted && <span className="vs-dot" aria-hidden="true" />}
                  <span>My Mic</span>
                </button>
                <button type="button" role="tab" aria-selected={voiceSettingsTab === 'peers'} onClick={() => setVoiceSettingsTab('peers')} className={`vs-tab ${voiceSettingsTab === 'peers' ? 'is-on' : ''}`}>
                  <span>Members ({otherPeers.length})</span>
                </button>
              </div>
              <button type="button" onClick={() => setShowVoiceSettings(false)} className="vs-close" title="Close" aria-label="Close voice settings">
                <X size={13} />
              </button>
            </div>

            {voiceSettingsTab === 'mic' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                  <span>Microphone</span>
                  <button type="button" onClick={refreshMediaDevices} style={{ background: 'none', border: 'none', color: '#f472b6', fontSize: '0.67rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                    <RotateCcw size={10} /> Rescan
                  </button>
                </div>
                <div className="vs-mic-list">
                  {audioInputDevices.length === 0 ? (
                    <div style={{ fontSize: '0.7rem', opacity: 0.75, padding: '4px' }}>Default System Mic</div>
                  ) : (
                    audioInputDevices.map((dev, idx) => {
                      const isSelected = dev.deviceId === selectedAudioInput;
                      return (
                        <button key={dev.deviceId || idx} type="button" onClick={() => switchAudioInput(dev.deviceId)} className={`vs-mic-row ${isSelected ? 'is-on' : ''}`}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev.label || `Mic ${idx + 1}`}</span>
                          {isSelected && <Check size={12} color="#f472b6" />}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="vs-pair">
                  <button type="button" onClick={handleEchoCancellationToggle} className={`vs-anim-btn ${isEchoCancellationEnabled ? 'is-echo-on' : ''}`}>
                    <span>{isEchoCancellationEnabled ? 'Echo: On' : 'Echo: Off'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleCamera}
                    className={`vs-anim-btn ${isCameraEnabled ? 'is-echo-on' : ''}`}
                    title={isCameraEnabled ? 'Turn off webcam' : 'Turn on webcam'}
                  >
                    {isCameraEnabled ? <Video size={12} /> : <VideoOff size={12} />}
                    <span>{isCameraEnabled ? 'Cam On' : 'Cam Off'}</span>
                  </button>
                  {isVoiceConnected ? (
                    <button type="button" onClick={leaveVoiceChat} className="vs-anim-btn is-disconnect">
                      <MicOff size={12} /> <span>Disconnect</span>
                    </button>
                  ) : (
                    <button type="button" onClick={() => startMicrophone()} className="vs-anim-btn is-connect">
                      <Mic size={12} /> <span>Connect Mic</span>
                    </button>
                  )}
                </div>

                <div className="vs-seg3">
                  {[{ id: 'rnnoise', label: 'AI Neural' }, { id: 'speex', label: 'Acoustic' }, { id: 'raw', label: 'Bypass' }].map((mode) => (
                    <button key={mode.id} type="button" onClick={() => handleNoiseModeChange(mode.id)} className={`vs-seg-btn ${noiseSuppressionMode === mode.id ? 'is-on' : ''}`}>
                      {mode.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 700 }}>
                    <span>Noise Gate</span>
                    <span style={{ color: noiseIntensity === 0 ? '#a7f3d0' : isNoiseGateOpen ? '#10b981' : '#f472b6' }}>
                      {noiseIntensity === 0 ? 'Off' : `${isNoiseGateOpen ? 'Open' : 'Gated'} · ${noiseIntensity}%`}
                    </span>
                  </div>
                  <div className="vs-meter">
                    <div className="vs-meter-fill" style={{ width: `${Math.min(100, micLevel)}%`, background: isNoiseGateOpen ? '#10b981' : '#ec4899' }} />
                    {noiseIntensity > 0 && <div className="vs-meter-mark" style={{ left: `${Math.max(1, Math.round(noiseIntensity * 0.55))}%` }} />}
                  </div>
                  <input type="range" min="0" max="100" step="5" value={noiseIntensity} aria-label="Noise Gate threshold" className="vs-range" style={{ '--pct': `${noiseIntensity}%` }} onChange={(e) => handleNoiseIntensityChange(Number(e.target.value))} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 700 }}>
                    <span>Mic Sensitivity</span>
                    <span style={{ color: '#f472b6' }}>{micGain}%</span>
                  </div>
                  <input type="range" min="50" max="200" step="5" value={micGain} aria-label="Mic Sensitivity" className="vs-range" style={{ '--pct': `${Math.round(((micGain - 50) / 150) * 100)}%` }} onChange={(e) => handleMicGainChange(Number(e.target.value))} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '190px', overflowY: 'auto' }}>
                {otherPeers.length === 0 ? (
                  <div style={{ textAlign: 'center', fontSize: '0.73rem', padding: '16px 8px', opacity: 0.75 }}>No other members in voice</div>
                ) : (
                  otherPeers.map((user) => {
                    const pId = user.id || user.peerId || user.socketId;
                    const peerVol = peerVolumes.get(pId) ?? 100;
                    const isPeerMuted = peerVol === 0;
                    return (
                      <div key={pId || user.username} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 6px', borderRadius: '9px', background: 'rgba(255,228,244,0.05)' }}>
                        <UserAvatar avatar={user.avatar || 'jojo-star'} size="18px" />
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username || user.name || 'Friend'}</span>
                        <input type="range" min="0" max="200" step="5" value={peerVol} onChange={(e) => handlePeerVolume(pId, e.target.value)} className="vs-range" style={{ width: '84px', '--pct': `${Math.round((peerVol / 200) * 100)}%` }} />
                        <span style={{ fontSize: '0.67rem', fontWeight: 800, minWidth: '32px', textAlign: 'right' }}>{peerVol}%</span>
                        <button type="button" onClick={() => handlePeerVolume(pId, isPeerMuted ? 100 : 0)} style={{ background: 'none', border: 'none', color: '#f472b6', cursor: 'pointer', display: 'flex' }}>
                          {isPeerMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <div
          data-impeccable-variant="3"
          style={{ display: 'none' }}
          data-impeccable-params='[{"id":"accent-glow","kind":"range","min":0,"max":1,"step":0.25,"default":0.75,"label":"Rose glow"},{"id":"slider-style","kind":"steps","default":"filled","label":"Slider style","options":[{"value":"filled","label":"Filled Track"},{"value":"minimal","label":"Minimal Hairline"}]}]'
        >
          <div className="vs949-v3" onClick={(e) => e.stopPropagation()}>
            <div className="vs-head">
              <div className="vs-tabs" role="tablist" aria-label="Voice settings tabs">
                <button type="button" role="tab" aria-selected={voiceSettingsTab === 'mic'} onClick={() => setVoiceSettingsTab('mic')} className={`vs-tab ${voiceSettingsTab === 'mic' ? 'is-on' : ''}`}>
                  {isVoiceConnected && !isMuted && <span className="vs-dot" aria-hidden="true" />}
                  <span>My Mic</span>
                </button>
                <button type="button" role="tab" aria-selected={voiceSettingsTab === 'peers'} onClick={() => setVoiceSettingsTab('peers')} className={`vs-tab ${voiceSettingsTab === 'peers' ? 'is-on' : ''}`}>
                  <span>Member Mics ({otherPeers.length})</span>
                </button>
              </div>
              <button type="button" onClick={() => setShowVoiceSettings(false)} className="vs-close" title="Close" aria-label="Close voice settings">
                <X size={13} />
              </button>
            </div>

            {voiceSettingsTab === 'mic' ? (
              <div className="vs-split">
                <div className="vs-zone">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                    <span>Microphones</span>
                    <button type="button" onClick={refreshMediaDevices} style={{ background: 'none', border: 'none', color: '#f472b6', fontSize: '0.67rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                      <RotateCcw size={10} /> Rescan
                    </button>
                  </div>
                  <div className="vs-mic-list">
                    {audioInputDevices.length === 0 ? (
                      <div style={{ fontSize: '0.7rem', opacity: 0.72, padding: '6px' }}>Default System Mic</div>
                    ) : (
                      audioInputDevices.map((dev, idx) => {
                        const isSelected = dev.deviceId === selectedAudioInput;
                        return (
                          <button key={dev.deviceId || idx} type="button" onClick={() => switchAudioInput(dev.deviceId)} className={`vs-mic-row ${isSelected ? 'is-on' : ''}`}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev.label || `Mic ${idx + 1}`}</span>
                            {isSelected && <Check size={12} color="#f472b6" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="vs-dock-pair">
                    <button type="button" onClick={handleEchoCancellationToggle} className={`vs-dock-btn ${isEchoCancellationEnabled ? 'is-echo-on' : ''}`}>
                      <span>{isEchoCancellationEnabled ? 'Echo On' : 'Echo Off'}</span>
                    </button>
                    {isVoiceConnected ? (
                      <button type="button" onClick={leaveVoiceChat} className="vs-dock-btn is-disconnect">
                        <MicOff size={12} /> <span>Leave</span>
                      </button>
                    ) : (
                      <button type="button" onClick={() => startMicrophone()} className="vs-dock-btn is-connect">
                        <Mic size={12} /> <span>Connect</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="vs-zone">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.69rem', fontWeight: 800 }}>
                      <span>Suppression</span>
                      <span style={{ color: '#f472b6' }}>{noiseSuppressionMode.toUpperCase()}</span>
                    </div>
                    <div className="vs-seg3">
                      {[{ id: 'rnnoise', label: 'AI Neural' }, { id: 'speex', label: 'Acoustic' }, { id: 'raw', label: 'Bypass' }].map((mode) => (
                        <button key={mode.id} type="button" onClick={() => handleNoiseModeChange(mode.id)} className={`vs-seg-btn ${noiseSuppressionMode === mode.id ? 'is-on' : ''}`}>
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.69rem', fontWeight: 800 }}>
                      <span>Noise Gate</span>
                      <span style={{ color: noiseIntensity === 0 ? '#a7f3d0' : isNoiseGateOpen ? '#10b981' : '#f472b6' }}>
                        {noiseIntensity === 0 ? 'Off' : `${isNoiseGateOpen ? 'Open' : 'Gated'} · ${noiseIntensity}%`}
                      </span>
                    </div>
                    <div className="vs-meter">
                      <div className="vs-meter-fill" style={{ width: `${Math.min(100, micLevel)}%`, background: isNoiseGateOpen ? '#10b981' : '#ec4899' }} />
                      {noiseIntensity > 0 && <div className="vs-meter-mark" style={{ left: `${Math.max(1, Math.round(noiseIntensity * 0.55))}%` }} />}
                    </div>
                    <input type="range" min="0" max="100" step="5" value={noiseIntensity} aria-label="Noise Gate threshold" className="vs-range" style={{ '--pct': `${noiseIntensity}%` }} onChange={(e) => handleNoiseIntensityChange(Number(e.target.value))} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.69rem', fontWeight: 800 }}>
                      <span>Sensitivity</span>
                      <span style={{ color: '#f472b6' }}>
                        {micGain}% ({micGain === 100 ? '0 dB' : `${((micGain - 100) * 0.12) > 0 ? '+' : ''}${((micGain - 100) * 0.12).toFixed(1)} dB`})
                      </span>
                    </div>
                    <input type="range" min="50" max="200" step="5" value={micGain} aria-label="Mic Sensitivity" className="vs-range" style={{ '--pct': `${Math.round(((micGain - 50) / 150) * 100)}%` }} onChange={(e) => handleMicGainChange(Number(e.target.value))} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="vs-zone" style={{ maxHeight: '185px', overflowY: 'auto' }}>
                {otherPeers.length === 0 ? (
                  <div style={{ textAlign: 'center', fontSize: '0.73rem', padding: '16px 8px', opacity: 0.72 }}>No other members in voice</div>
                ) : (
                  otherPeers.map((user) => {
                    const pId = user.id || user.peerId || user.socketId;
                    const peerVol = peerVolumes.get(pId) ?? 100;
                    const isPeerMuted = peerVol === 0;
                    return (
                      <div key={pId || user.username} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 2px', borderBottom: '1px solid rgba(251, 207, 232, 0.12)' }}>
                        <UserAvatar avatar={user.avatar || 'jojo-star'} size="19px" />
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username || user.name || 'Friend'}</span>
                        <input type="range" min="0" max="200" step="5" value={peerVol} onChange={(e) => handlePeerVolume(pId, e.target.value)} className="vs-range" style={{ width: '108px', '--pct': `${Math.round((peerVol / 200) * 100)}%` }} />
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, minWidth: '34px', textAlign: 'right', color: '#fbcfe8' }}>{peerVol}%</span>
                        <button type="button" onClick={() => handlePeerVolume(pId, isPeerMuted ? 100 : 0)} style={{ background: 'none', border: 'none', color: '#f472b6', cursor: 'pointer', display: 'flex' }}>
                          {isPeerMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
        {/* impeccable-variants-end 949c7b3c */}
      </div>
    );

    return popover;
  }

  return (
    <div ref={theaterWrapperRef} tabIndex={-1} style={{ outline: 'none' }} className={`theater-view-wrapper ${isChatSidebarOpen ? 'chat-expanded' : ''}`}>
      {/* Non-scaling Cinema Transition Curtain for smooth native Fullscreen enter/exit */}
      <div ref={fsCurtainRef} className="wt-fs-curtain" aria-hidden="true" />
      {/* Hidden WebRTC Remote Audio Hub */}
      <div id="wt-remote-audio-hub" style={{ display: 'none' }} aria-hidden="true" />

      {/* Left Column: Video Stage + Bottom Control Deck */}
      <div className="theater-stage-column" data-ambient={isAmbientActive ? 'on' : 'off'}>
        {/* Video Canvas */}
        <div
          ref={theaterCanvasRef}
          className="theater-canvas"
          onClick={() => {
            setChatOpen(false);
            setShowSubtitlePopover(false);
            setShowAudioPopover(false);
          }}
        >

          {/* Video Toast Notification */}
          <div className={`player-toast ${isToastActive ? 'active' : ''}`}>
            {toastContent.icon && (
              <span className="toast-icon-wrap" style={{ display: 'inline-flex', alignItems: 'center' }}>
                {toastContent.icon}
              </span>
            )}
            <span>{toastContent.text}</span>
          </div>

          {/* Mobile Voice Audio Unlock Pill */}
          {needsVoiceAudioUnlock && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                unlockAudio();
              }}
              style={{
                position: 'absolute',
                top: '18px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 90,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: '9999px',
                background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: 700,
                border: 'none',
                boxShadow: '0 4px 16px rgba(236, 72, 153, 0.5)',
                cursor: 'pointer'
              }}
              title="Tap to listen to voice chat"
            >
              <Volume2 size={15} color="#ffffff" />
              <span>Tap to enable voice audio</span>
            </button>
          )}

          {/* Browser Autoplay Block Overlay removed in favor of in-player muted playback & tap-to-unmute pill */}

          {/* Neko Virtual Shared Browser Container */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: '#0e0813', zIndex: 3, display: activePlayerType === 'neko' ? 'flex' : 'none', flexDirection: 'column' }}>
            {activePlayerType === 'neko' && (
              <>
                {/* Invisible Top Hover Trigger in Fullscreen to reveal controls */}
                {isTheaterFullscreen && (
                  <div
                    onMouseEnter={() => setIsTopBarHovered(true)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '20px',
                      zIndex: 99,
                      cursor: 'default'
                    }}
                  />
                )}

                {/* Neko Management Header Bar (Auto-hides in True Fullscreen, slides down on top hover) */}
                <div
                  onMouseEnter={() => setIsTopBarHovered(true)}
                  onMouseLeave={() => setIsTopBarHovered(false)}
                  style={{
                    position: isTheaterFullscreen ? 'absolute' : 'relative',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '42px',
                    background: 'rgba(23, 15, 32, 0.95)',
                    backdropFilter: 'blur(14px)',
                    borderBottom: '1px solid rgba(244, 114, 182, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 1rem',
                    zIndex: 100,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                    transform: (isTheaterFullscreen && !isTopBarHovered) ? 'translateY(-100%)' : 'translateY(0)',
                    opacity: (isTheaterFullscreen && !isTopBarHovered) ? 0 : 1,
                    transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease',
                    pointerEvents: (isTheaterFullscreen && !isTopBarHovered) ? 'none' : 'auto'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Globe size={14} color="var(--gold-primary)" />
                      <span>Virtual Shared Browser (Neko)</span>
                    </span>
                    <span style={{ fontSize: '10px', background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                      Active • Synchronized
                    </span>
                    {isTheaterFullscreen && (
                      <span style={{ fontSize: '10px', background: 'rgba(244, 114, 182, 0.2)', color: '#f472b6', border: '1px solid rgba(244, 114, 182, 0.4)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                        True Cinema Fullscreen
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={handleReloadNeko}
                      className="pink-btn-icon"
                      style={{ fontSize: '11px', padding: '3px 8px', height: '28px', gap: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
                      title="Reload browser frame"
                    >
                      <RotateCcw size={12} />
                      <span>Reload</span>
                    </button>
                    <button
                      onClick={handleResetNeko}
                      className="pink-btn-icon"
                      style={{ fontSize: '11px', padding: '3px 8px', height: '28px', gap: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
                      title="Clear heavy runaway tabs and reset Chromium to blank page"
                    >
                      <span>Reset Tabs</span>
                    </button>
                    <button
                      onClick={toggleVideoFullscreen}
                      className="pink-btn-icon"
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        height: '28px',
                        gap: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        color: isTheaterFullscreen ? '#f472b6' : 'var(--text-muted)',
                        border: isTheaterFullscreen ? '1px solid rgba(244, 114, 182, 0.35)' : 'none'
                      }}
                      title={isTheaterFullscreen ? "Exit Fullscreen (Esc or F)" : "True Cinema Fullscreen (F)"}
                    >
                      {isTheaterFullscreen ? <Minimize size={12} /> : <Maximize size={12} />}
                      <span>{isTheaterFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
                    </button>
                    <button
                      onClick={handleStopNeko}
                      style={{
                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '3px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)'
                      }}
                      title="Close browser and immediately stop background CPU & audio usage"
                    >
                      <Power size={12} />
                      <span>Exit & Stop Browser</span>
                    </button>
                  </div>
                </div>
                {!isNekoReady ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: '#0e0813', padding: '1rem', overflow: 'hidden' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', border: '3px solid rgba(244, 114, 182, 0.2)', borderTopColor: '#ec4899', animation: 'spin 0.8s linear infinite' }} />
                    <div style={{ color: '#f472b6', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.3px' }}>{nekoStatusMsg}</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Warming up Chromium engine & WebRTC audio/video feeds</div>
                  </div>
                ) : (
                  <iframe
                    ref={nekoIframeRef}
                    onLoad={handleNekoIframeLoad}
                    key={nekoIframeKey}
                    src={`/neko/?usr=${encodeURIComponent(currentProfile?.username || currentProfile?.name || 'Viewer')}&pwd=admin&embed=1`}
                    title="Shared Virtual Browser (Neko)"
                    allow="autoplay; camera; microphone; fullscreen; clipboard-read; clipboard-write; display-capture;"
                    style={{
                      width: '100%',
                      height: isTheaterFullscreen ? '100%' : 'calc(100% - 42px)',
                      border: 'none',
                      display: 'block'
                    }}
                  />
                )}
              </>
            )}
          </div>

          {/* YouTube Container */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: activePlayerType === 'youtube' ? 'block' : 'none', zIndex: 2 }}>
            <div id="react-yt-player" style={{ width: '100%', height: '100%' }}></div>
          </div>

          {/* PoufPlayer Container (MKV, MP4, HLS, WebM) - Mounted only for direct media */}
          {activePlayerType !== 'youtube' && activePlayerType !== 'neko' && (
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2 }}>
              <PoufPlayer
                socket={socket}
                url={currentUrl}
                title={currentTitle}
                type={activePlayerType === 'hls' || currentUrl.includes('.m3u8') ? 'hls' : 'direct'}
                audioTracks={audioTracks}
                activeAudioIndex={activeAudioIndex}
                onAudioTrackChange={(idx) => handleSwitchAudioTrack(idx)}
                subtitleTracks={subtitleTracks}
                activeSubtitleIndex={activeSubtitleIndex}
                onSubtitleChange={(idx) => handleSwitchSubtitle(idx)}
                onAddSubtitleTrack={(newTrack) => {
                  setSubtitleTracks((prev) => [newTrack, ...prev]);
                  setActiveSubtitleIndex(0);
                  showToast(`Loaded Subtitle: ${newTrack.title}`, <Type size={15} />);
                }}
                subtitleSize={subtitleSize}
                subtitlePos={subtitlePos}
                onSubtitleSizeChange={(sz) => handleChangeSubtitleSize(sz)}
                onSubtitlePosChange={(pos) => handleChangeSubtitlePos(pos)}
                isPlaying={roomPlaybackState.isPlaying}
                currentTime={roomPlaybackState.currentTime}
                onPlay={(t) => {
                  isRemoteActionRef.current = false;
                  if (remoteActionTimeoutRef.current) clearTimeout(remoteActionTimeoutRef.current);

                  const video = document.querySelector('.pouf-player-container video');
                  const curTime = typeof t === 'number' && !isNaN(t) ? t : (video ? video.currentTime : (serverSyncStateRef.current.currentTime || 0));
                  serverSyncStateRef.current = {
                    currentTime: curTime,
                    isPlaying: true,
                    playbackRate: 1.0,
                    receivedAt: Date.now()
                  };
                  setRoomPlaybackState({ currentTime: curTime, isPlaying: true });
                  setRemoteLock(300);
                  if (socket) {
                    socket.emit('player:play', { currentTime: curTime });
                  }
                }}
                onPause={(t) => {
                  isRemoteActionRef.current = false;
                  if (remoteActionTimeoutRef.current) clearTimeout(remoteActionTimeoutRef.current);

                  const video = document.querySelector('.pouf-player-container video');
                  const curTime = typeof t === 'number' && !isNaN(t) ? t : (video ? video.currentTime : (serverSyncStateRef.current.currentTime || 0));
                  serverSyncStateRef.current = {
                    currentTime: curTime,
                    isPlaying: false,
                    playbackRate: 1.0,
                    receivedAt: Date.now()
                  };
                  setRoomPlaybackState({ currentTime: curTime, isPlaying: false });
                  setRemoteLock(300);
                  if (socket) {
                    socket.emit('player:pause', { currentTime: curTime });
                  }
                }}
                onSeek={(t) => {
                  isRemoteActionRef.current = false;
                  if (remoteActionTimeoutRef.current) clearTimeout(remoteActionTimeoutRef.current);

                  const targetTime = typeof t === 'number' && !isNaN(t) ? t : 0;
                  isSeekingRef.current = true;
                  if (socket) {
                    socket.emit('player:seek', { currentTime: targetTime, wasPlaying: roomPlaybackState.isPlaying });
                  }
                }}
                barrierState={barrierState}
                onForceSyncAll={() => handleForceSync()}
                viewerCount={connectedUsers.length || 1}
                isHost={isHost}
                canControl={true}
                isChitChatMode={isChitChatMode}
                isCameraEnabled={isCameraEnabled}
                onToggleCamera={toggleCamera}
                onToggleChat={handleToggleSideChat}
                onToggleFullscreen={toggleVideoFullscreen}
                onEnterChat={() => {
                  const isSidebarActive = (isChitChatMode && !isChatCollapsed) || isChatSidebarOpen;
                  if (!isSidebarActive) {
                    setChatOpen(true);
                    resetChatInactivityTimer();
                    setTimeout(() => {
                      if (chatInputRef.current) chatInputRef.current.focus();
                    }, 40);
                  }
                }}
              >
                {renderChatOverlay()}
                {renderPartyWebcamGrid()}
              </PoufPlayer>
            </div>
          )}

          {/* Floating Chat Overlay for YouTube / Neko (Rendered outside when PoufPlayer is not mounted) */}
          {(activePlayerType === 'youtube' || activePlayerType === 'neko') && renderChatOverlay()}
          {(activePlayerType === 'youtube' || activePlayerType === 'neko') && renderPartyWebcamGrid()}

          {/* Floating Quick Chat Pill for Neko (visible when chatOpen is false) */}
          {activePlayerType === 'neko' && !isChitChatMode && !chatOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setChatOpen(true);
                resetChatInactivityTimer();
                setTimeout(() => {
                  chatInputRef.current?.focus();
                }, 40);
              }}
              className="pouf-btn-tactile"
              style={{
                position: 'absolute',
                bottom: isTheaterFullscreen ? '20px' : '16px',
                left: '20px',
                zIndex: 999,
                background: 'rgba(23, 15, 32, 0.88)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(244, 114, 182, 0.45)',
                borderRadius: '9999px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5), 0 0 12px rgba(244, 114, 182, 0.25)',
                transition: 'all 0.2s ease',
                pointerEvents: 'auto'
              }}
              title="Open In-Video Chat (or press Enter)"
            >
              <MessageSquare size={13} color="#f472b6" />
              <span>Chat (Enter)</span>
              {unreadChatCount > 0 && (
                <span style={{
                  background: '#f472b6',
                  color: '#fff',
                  fontSize: '10px',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontWeight: 800
                }}>
                  {unreadChatCount}
                </span>
              )}
            </button>
          )}

          {/* Floating Subtitle & Audio Popovers */}
          {renderTrackPopovers()}

          {/* Push-to-Talk HUD Banner */}
          {isPushToTalking && (
            <div style={{
              position: 'absolute',
              top: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 65,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 20px',
              borderRadius: '999px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))',
              color: '#fff',
              fontWeight: 800,
              fontSize: '0.86rem',
              boxShadow: '0 0 24px rgba(16, 185, 129, 0.7), 0 8px 16px rgba(0,0,0,0.4)',
              pointerEvents: 'none',
              letterSpacing: '0.04em'
            }}>
              <Radio size={16} />
              <span>TRANSMITTING (HOLDING 'V')</span>
            </div>
          )}

          {/* Minimal Docked Arrow Button when Chat is Closed */}
          {!isChatSidebarOpen && (
            <button
              type="button"
              onClick={handleToggleSideChat}
              className="clay-docked-chat-trigger"
              title="Open Chat (Shortcut: C)"
              aria-label="Open Chat"
            >
              <ChevronLeft size={18} strokeWidth={2.4} />
              {unreadChatCount > 0 && (
                <span className="clay-chat-compact-badge">
                  {unreadChatCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Glittering Pink Theater Control Deck (Bottom bar) */}
        <div ref={theaterDeckRef} className="theater-deck" data-ambient={isAmbientActive ? 'on' : 'off'}>
          <div className="amb-blur-backdrop" aria-hidden="true">
            <canvas ref={ambientDeckCanvasRef} width={64} height={1} className="amb-blur-canvas" />
          </div>
          <div className="amb-row">
            <div className="amb-dock-group">
              <button
                onClick={handleForceSync}
                className="btn-gold-shimmer amb-sync-cta"
                title="Snap both users to exact timestamp"
              >
                <ClaySparkle size={15} />
                <span>Sync Both</span>
              </button>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="btn-pink-secondary amb-btn-sm"
              >
                <ClayPopcorn size={15} />
                <span>Change Media</span>
              </button>
              <button
                onClick={openLibrary}
                className="btn-pink-secondary amb-btn-sm"
              >
                <ClayFolder size={15} />
                <span>Library</span>
              </button>
            </div>

            <div className="amb-dock-group">
              <div className="amb-voice-dock">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMicButtonClick();
                  }}
                  className="amb-voice-btn"
                  style={{
                    background: !isVoiceConnected
                      ? undefined
                      : isLocalSpeaking && !isMuted
                        ? 'rgba(236, 72, 153, 0.38)'
                        : isMuted
                          ? 'rgba(239, 68, 68, 0.26)'
                          : 'rgba(236, 72, 153, 0.24)',
                    color: !isVoiceConnected ? '#fff5fa' : (isMuted ? '#fca5a5' : '#ffffff')
                  }}
                  title={!isVoiceConnected ? "Turn Mic On (Hold V for Push-to-Talk)" : (isMuted ? "Unmute Mic (Hold V for Push-to-Talk)" : "Mute Mic")}
                >
                  {!isVoiceConnected ? (
                    <>
                      <Mic size={13} color="#f472b6" />
                      <span>Mic Off</span>
                    </>
                  ) : isMuted ? (
                    <>
                      <MicOff size={13} color="#ef4444" />
                      <span>Muted</span>
                    </>
                  ) : (
                    <>
                      <Mic size={13} color="#34d399" />
                      <span>Live</span>
                    </>
                  )}
                </button>
                <div className="amb-dock-divider" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowVoiceSettings((prev) => {
                      const next = !prev;
                      if (next) refreshMediaDevices();
                      return next;
                    });
                    setShowSubtitlePopover(false);
                    setShowAudioPopover(false);
                  }}
                  className="amb-voice-btn"
                  style={{
                    background: showVoiceSettings ? 'rgba(244, 114, 182, 0.28)' : undefined,
                    color: '#fff5fa',
                    maxWidth: '150px'
                  }}
                  title="Voice & Audio Settings"
                >
                  <Sliders size={12} color="var(--pink-primary)" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {audioInputDevices.find((d) => d.deviceId === selectedAudioInput)?.label?.split('(')[0]?.trim() || 'Select Mic'}
                  </span>
                  <ChevronDown size={11} color="var(--pink-primary)" style={{ transform: showVoiceSettings ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
                </button>
                {renderVoiceSettingsPopover()}
              </div>
            </div>

            <div className="amb-dock-group">
              <input
                ref={subtitleFileInputRef}
                type="file"
                accept=".srt,.vtt,.ass"
                style={{ display: 'none' }}
                onChange={handleCustomSubtitleUpload}
              />

              {isVoiceConnected && (
                <span
                  onClick={() => setShowVoiceSettings(true)}
                  className="amb-status-pill"
                  style={{
                    background: isMuted ? 'rgba(239, 68, 68, 0.14)' : 'rgba(16, 185, 129, 0.14)',
                    border: isMuted ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(16, 185, 129, 0.35)',
                    color: isMuted ? '#f87171' : 'var(--emerald-accent)',
                    cursor: 'pointer'
                  }}
                  title="Click to open Voice Hardware Settings"
                >
                  <span className="status-dot" style={{ background: isMuted ? '#ef4444' : 'var(--emerald-accent)' }}></span>
                  <span className="amb-status-text">{isMuted ? 'Muted' : 'Voice'}</span>
                </span>
              )}

              {Array.from(remotePeers.entries()).map(([pId, p]) => (
                <span
                  key={pId}
                  className="amb-status-pill"
                  style={{
                    background: p.isSpeaking ? 'rgba(16, 185, 129, 0.22)' : 'rgba(255, 255, 255, 0.08)',
                    border: p.isSpeaking ? `1px solid ${p.color || '#10b981'}` : '1px solid rgba(255, 255, 255, 0.14)',
                    color: '#fff'
                  }}
                  title={p.isSpeaking ? `${p.username} is speaking` : `${p.username} in voice`}
                >
                  <UserAvatar user={{ name: p.username, avatar: p.avatar }} size={14} showBorder={false} />
                  <span className="amb-status-text">{p.username}</span>
                  {p.isMuted ? <MicOff size={10} color="#f87171" /> : p.isSpeaking ? <Radio size={10} color="#10b981" /> : <Mic size={10} color="#fbcfe8" />}
                </span>
              ))}

              <span
                className="amb-status-pill"
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.34)',
                  color: 'var(--emerald-accent)'
                }}
                title={syncStatus}
              >
                <span className="status-dot" style={{ background: 'var(--emerald-accent)' }}></span>
                <span className="amb-status-text">{syncStatus}</span>
              </span>

              <div className="amb-dock-divider" />

              <button
                onClick={handleToggleSideChat}
                className={`${isChatSidebarOpen ? 'btn-pink-primary' : 'btn-pink-secondary'} amb-btn-sm`}
                style={{ position: 'relative' }}
                title="Toggle Chit Chat Split Screen (Shortcut: C)"
              >
                <ClayChat size={15} />
                <span>Chit Chat</span>
                {unreadChatCount > 0 && !isChatSidebarOpen && (
                  <span className="clay-unread-badge" style={{ marginLeft: '2px' }}>
                    {unreadChatCount}
                  </span>
                )}
              </button>

              {isLoungeScreen && (
                <button
                  type="button"
                  aria-pressed={ambientEnabled}
                  aria-label="Toggle Ambient Glow"
                  data-active={ambientEnabled ? 'true' : 'false'}
                  onClick={toggleAmbientMode}
                  className="amb-icon-keycap"
                  title={ambientEnabled ? 'Ambient Glow: On' : 'Ambient Glow: Off'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4" y="6" width="16" height="12" rx="3" fill={ambientEnabled ? 'currentColor' : 'none'} fillOpacity={ambientEnabled ? '0.24' : '0'} />
                    <path d="M8 2.75h8M8 21.25h8M1.75 9.5v5M22.25 9.5v5" />
                  </svg>
                </button>
              )}

              <button
                onClick={toggleVideoFullscreen}
                className="btn-pink-secondary amb-btn-sm"
                title="Toggle Fullscreen (Shortcut: F)"
              >
                <Maximize size={13} color="var(--pink-primary)" />
                <span>Fullscreen</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Split-Screen Chat Sidebar in ALL scenarios */}
      {renderChatSidebar && (
        <div className={`theater-chat-sidebar-container ${isChatClosing ? 'is-closing' : 'is-open'}`}>
          <ChatSidebar
            isOpen={true}
            isClosing={isChatClosing}
            onClose={() => {
              setIsChatSidebarOpen(false);
              setTimeout(() => focusTheaterStage(), 10);
            }}
            messages={chatMessages}
            onSendMessage={(text, image) => {
              socket?.emit('chat:send_message', { text, image, isDanmaku: true });
            }}
            currentProfile={currentProfile}
            connectedUsers={connectedUsers}
            lastSeen={roomLastSeen}
            onMarkSeen={handleMarkChatSeen}
            onOpenAvatarModal={onOpenAvatarModal}
          />
        </div>
      )}



      {/* Library Selection Modal */}
      {libraryModalOpen && (
        <div className="pink-modal-backdrop" onClick={() => setLibraryModalOpen(false)}>
          <div className="pink-modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Folder size={18} color="var(--pink-primary)" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Select from Server Storage</h3>
              </div>
              <button onClick={() => setLibraryModalOpen(false)} className="pink-btn-icon"><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '360px', overflowY: 'auto' }}>
              {libraryFiles.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: '0.85rem' }}>
                  No media files in server storage. Admins can download MKVs or episodes via Server Downloader!
                </div>
              ) : (
                libraryFiles.map((f) => (
                  <div
                    key={f.filename}
                    onClick={() => {
                      socket?.emit('media:change', {
                        url: f.streamUrl,
                        title: f.filename,
                        type: f.mediaType || (f.streamUrl?.includes('.m3u8') ? 'hls' : 'direct')
                      });
                      setLibraryModalOpen(false);
                    }}
                    className="holographic-card"
                    style={{ padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.86rem' }}>{f.filename}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        {f.sizeFormatted} • {f.subtitles?.length ? `${f.subtitles.length} Subs` : 'Native'}
                      </div>
                    </div>
                    <Play size={14} fill="currentColor" color="var(--gold-primary)" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Choose / Change Media Modal */}
      <CreateRoomModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        appConfig={appConfig}
        onLaunchMedia={(mediaConfig) => {
          socket?.emit('media:change', {
            url: mediaConfig.url,
            title: mediaConfig.title,
            type: mediaConfig.type,
            videoId: mediaConfig.videoId
          });
        }}
        defaultRoom={roomId}
      />

      {/* 1. Microphone Permission Help Modal */}
      {showMicPermissionModal && (
        <div className="pink-modal-backdrop" onClick={() => setShowMicPermissionModal(false)}>
          <div className="pink-modal-card" style={{ maxWidth: '480px', padding: '1.75rem' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1.5px solid rgba(239, 68, 68, 0.4)'
              }}>
                <MicOff size={22} color="#ef4444" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-main)' }}>Microphone Access Blocked</h3>
                <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 700 }}>Permission Required</span>
              </div>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.45', margin: '0 0 1.25rem 0' }}>
              Your browser or Windows has blocked microphone permissions for Watch Together. Follow these quick steps so everyone in the lounge can hear you:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(244, 114, 182, 0.08)', borderRadius: '14px', padding: '14px', border: '1px solid rgba(244, 114, 182, 0.2)' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ background: 'var(--pink-primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, flexShrink: 0 }}>1</span>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: '1.3' }}>
                  Look at your browser address bar at the top (near <strong>https://...</strong>). Click the <strong>🔒 Lock icon</strong> or <strong>🎙️ Camera/Mic icon</strong>.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ background: 'var(--pink-primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, flexShrink: 0 }}>2</span>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: '1.3' }}>
                  Switch <strong>Microphone</strong> from <em>Block</em> to <strong>Allow</strong>.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ background: 'var(--pink-primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, flexShrink: 0 }}>3</span>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: '1.3' }}>
                  <strong>Windows Laptops:</strong> Open Windows Settings → <em>Privacy & Security</em> → <em>Microphone</em> → Turn on <em>"Let apps access your microphone"</em>.
                </span>
              </div>
            </div>

            {micPermissionErrorMsg && (
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '10px', wordBreak: 'break-word' }}>
                Technical error: {micPermissionErrorMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="pink-btn-secondary"
                onClick={() => setShowMicPermissionModal(false)}
                style={{ padding: '0.55rem 1.1rem', fontSize: '0.88rem' }}
              >
                Close
              </button>
              <button
                type="button"
                className="pink-btn-primary"
                onClick={() => {
                  setShowMicPermissionModal(false);
                  startMicrophone();
                }}
                style={{ padding: '0.55rem 1.25rem', fontSize: '0.88rem' }}
              >
                Try Again Now 🎙️
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Zero-Input Mic Silence Warning Banner */}
      {isVoiceConnected && isMicSilentWarning && (
        <div
          style={{
            position: 'fixed',
            bottom: '72px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(23, 15, 32, 0.94)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            borderRadius: '16px',
            padding: '12px 18px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.6), 0 0 20px rgba(245, 158, 11, 0.25)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            maxWidth: '520px',
            width: 'calc(100% - 32px)',
            animation: 'slideUpSmooth 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertCircle size={20} color="#f59e0b" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-main)' }}>
              No Audio Detected from Mic 🔇
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: '1.25' }}>
              Your mic is unmuted, but input level is zero. Check your laptop physical mute button (Fn key) or switch mic device.
            </div>
            {/* Live Meter Bar */}
            <div style={{ width: '100%', height: '4px', background: 'rgba(0,0,0,0.08)', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, micLevel * 2)}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #f59e0b)', transition: 'width 0.1s ease' }} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowVoiceSettings(true);
              refreshMediaDevices();
            }}
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, var(--pink-primary), var(--pink-hover))',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Fix & Test Mic
          </button>
          <button
            type="button"
            onClick={() => {
              setDismissedSilenceWarning(true);
              setIsMicSilentWarning(false);
            }}
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px' }}
            title="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
