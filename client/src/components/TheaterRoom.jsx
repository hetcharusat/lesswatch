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
  AudioPresets,
} from 'livekit-client';
import {
  Play, Pause, Zap, MessageSquare, Maximize, Minimize,
  Link as LinkIcon, Send, X, Film, Folder, Sparkles, Volume2, VolumeX, Users,
  Check, Upload, Type, Mic, MicOff, Settings, Radio, Headphones,
  RotateCcw, Power, Sliders, ChevronDown, ChevronLeft, Smile, AlertCircle, Globe, LogOut, ShieldCheck, FastForward
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
  } catch {}
}

export function TheaterRoom({ roomId = 'lounge', currentProfile, initialMedia, initialTitle, initialType, onNavigate, onConsumeInitialMedia, onOpenAvatarModal }) {
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
    } catch {}
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
      await fetch(`/api/media/process-audio/${encodeURIComponent(clean)}`, { method: 'POST' });
      fetchAudioStatus();
    } catch {}
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
  const remoteAudioElementsRef = useRef(new Map()); // participantIdentity -> HTMLAudioElement
  const audioContextRef = useRef(null);
  const audioAnalyserIntervalRef = useRef(null);
  const isVoiceConnectedRef = useRef(false);
  const isMutedRef = useRef(false);
  const isPushToTalkingRef = useRef(false);
  const isLocalSpeakingRef = useRef(false);

  // Chat System: Floating In-Video Overlay + Chit Chat Mode Split Screen + Persistent Sidebar
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(false);
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
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
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
  const [chatInputText, setChatInputText] = useState('');
  const [showFloatingGiphy, setShowFloatingGiphy] = useState(false);
  const [recentMessages, setRecentMessages] = useState([]);

  // Refs
  const theaterWrapperRef = useRef(null);
  const theaterCanvasRef = useRef(null);
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
  function setupAnalyser(mediaStreamTrack) {
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
        ctx.resume().catch(() => {});
      }

      const stream = new MediaStream([mediaStreamTrack]);
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.25;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let speakingTicks = 0;
      let silentTicks = 0;

      audioAnalyserIntervalRef.current = setInterval(() => {
        if (!isVoiceConnectedRef.current || isMutedRef.current) {
          silentTicks = 0;
          setIsMicSilentWarning(false);
          if (isLocalSpeakingRef.current) {
            isLocalSpeakingRef.current = false;
            setIsLocalSpeaking(false);
            socketRef.current?.emit('voice:speaking', { isSpeaking: false });
          }
          setMicLevel(0);
          setIsNoiseGateOpen(false);
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const levelPct = Math.min(100, Math.round((avg / 120) * 100));
        setMicLevel(levelPct);
        setIsNoiseGateOpen(levelPct > 8);

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

        const isSpeakingNow = avg > 14;
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
      }, 60);
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
        await localAudioTrackRef.current.restartTrack({
          echoCancellation: isEchoCancellationEnabledRef.current,
          noiseSuppression: newMode !== 'raw' && newMode !== 'bypass',
          autoGainControl: true,
        });
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

  async function handleEchoCancellationToggle() {
    const nextVal = !isEchoCancellationEnabled;
    setIsEchoCancellationEnabled(nextVal);
    isEchoCancellationEnabledRef.current = nextVal;
    localStorage.setItem('wt_echo_cancellation', String(nextVal));
    if (isVoiceConnectedRef.current && localAudioTrackRef.current) {
      try {
        await localAudioTrackRef.current.restartTrack({
          echoCancellation: nextVal,
        });
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
        await audioContextRef.current.resume().catch(() => {});
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
        try { livekitRoomRef.current.disconnect(); } catch {}
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
                  ctx.resume().catch(() => {});
                }
                // Mute raw audio element to avoid unbalanced echo
                audioEl.volume = 0;
              } else {
                gainEntry.gainNode.gain.value = vol / 100;
                if (gainEntry.ctx && gainEntry.ctx.state === 'suspended') {
                  gainEntry.ctx.resume().catch(() => {});
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
            audioEl.setSinkId(selectedAudioOutput).catch(() => {});
          }

          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn('Remote audio waiting for interaction:', err);
              setNeedsVoiceAudioUnlock(true);
              const unlock = () => {
                audioEl.play().then(() => setNeedsVoiceAudioUnlock(false)).catch(() => {});
                const entry = peerGainNodesRef.current.get(participant.identity);
                if (entry && entry.ctx && entry.ctx.state === 'suspended') {
                  entry.ctx.resume().catch(() => {});
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
        }
      });

      lkRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        track.detach();
        const el = remoteAudioElementsRef.current.get(participant.identity);
        if (el) {
          try {
            el.pause();
            el.srcObject = null;
            if (el.parentNode) el.parentNode.removeChild(el);
          } catch {}
          remoteAudioElementsRef.current.delete(participant.identity);
        }
        const gainEntry = peerGainNodesRef.current.get(participant.identity);
        if (gainEntry) {
          try {
            if (gainEntry.source) gainEntry.source.disconnect();
            if (gainEntry.gainNode) gainEntry.gainNode.disconnect();
            if (gainEntry.merger) gainEntry.merger.disconnect();
            if (gainEntry.ctx && gainEntry.ctx.state !== 'closed') gainEntry.ctx.close().catch(() => {});
          } catch {}
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
          } catch {}
          remoteAudioElementsRef.current.delete(participant.identity);
        }
        const gainEntry = peerGainNodesRef.current.get(participant.identity);
        if (gainEntry) {
          try {
            if (gainEntry.source) gainEntry.source.disconnect();
            if (gainEntry.gainNode) gainEntry.gainNode.disconnect();
            if (gainEntry.merger) gainEntry.merger.disconnect();
            if (gainEntry.ctx && gainEntry.ctx.state !== 'closed') gainEntry.ctx.close().catch(() => {});
          } catch {}
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

      // 6. Create and publish local high-definition audio track
      const audioTrack = await createLocalAudioTrack({
        deviceId: selectedAudioInput || undefined,
        echoCancellation: isEchoCancellationEnabledRef.current,
        noiseSuppression: (noiseSuppressionModeRef.current || 'rnnoise') !== 'raw' && (noiseSuppressionModeRef.current || 'rnnoise') !== 'bypass',
        autoGainControl: true,
      });
      localAudioTrackRef.current = audioTrack;

      await lkRoom.localParticipant.publishTrack(audioTrack, {
        audioBitrate: studioAudioMode ? 128000 : 64000,
        dtx: false,
      });

      // 7. Setup VU Meter Analyser
      setupAnalyser(audioTrack.mediaStreamTrack);

      isVoiceConnectedRef.current = true;
      setIsVoiceConnected(true);
      isMutedRef.current = false;
      setIsMuted(false);

      // Notify Socket.IO room of voice state
      socketRef.current?.emit('voice:join', { hasAudio: true, hasVideo: false });
      socketRef.current?.emit('voice:track_state', { isMuted: false, hasVideo: false });

      refreshMediaDevices();
      playAudioChirp('unmute');
      showToast('Microphone live', <Mic size={15} color="var(--pink-primary)" />);
    } catch (err) {
      console.warn('Microphone start error:', err);
      setShowMicPermissionModal(true);
      setMicPermissionErrorMsg(err.message || 'Microphone access denied. Please allow permissions in browser or system settings.');
      showToast('Microphone access blocked', <AlertCircle size={15} color="#ef4444" />);
    }
  }

  const startMicrophone = () => publishLocalMic();

  function leaveVoiceChat() {
    if (livekitRoomRef.current) {
      try { livekitRoomRef.current.disconnect(); } catch {}
      livekitRoomRef.current = null;
    }
    if (localAudioTrackRef.current) {
      try { localAudioTrackRef.current.stop(); } catch {}
      localAudioTrackRef.current = null;
    }
    remoteAudioElementsRef.current.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
        if (el.parentNode) el.parentNode.removeChild(el);
      } catch {}
    });
    remoteAudioElementsRef.current.clear();

    peerGainNodesRef.current.forEach((entry) => {
      try {
        if (entry.source) entry.source.disconnect();
        if (entry.gainNode) entry.gainNode.disconnect();
        if (entry.merger) entry.merger.disconnect();
        if (entry.ctx && entry.ctx.state !== 'closed') entry.ctx.close().catch(() => {});
      } catch {}
    });
    peerGainNodesRef.current.clear();

    if (audioAnalyserIntervalRef.current) {
      clearInterval(audioAnalyserIntervalRef.current);
      audioAnalyserIntervalRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
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
        await localAudioTrackRef.current.mute().catch(() => {});
      } else {
        await localAudioTrackRef.current.unmute().catch(() => {});
      }
    }
    socketRef.current?.emit('voice:track_state', { isMuted: nextMuted, hasVideo: false });
    playAudioChirp(nextMuted ? 'mute' : 'unmute');
    showToast(nextMuted ? 'Microphone Muted' : 'Microphone Live', nextMuted ? <MicOff size={15} color="#ef4444" /> : <Mic size={15} color="var(--pink-primary)" />);
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
      await localAudioTrackRef.current.restartTrack({
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: isEchoCancellationEnabledRef.current,
        noiseSuppression: (noiseSuppressionModeRef.current || 'rnnoise') !== 'raw' && (noiseSuppressionModeRef.current || 'rnnoise') !== 'bypass',
        autoGainControl: true,
      });
      setupAnalyser(localAudioTrackRef.current.mediaStreamTrack);
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
  // Hotkeys Listener (Hold 'V' for Push-to-Talk, 'M' to Toggle Mute)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.isContentEditable) return;

      // Toggle Mic Mute with 'M'
      if ((e.key === 'm' || e.key === 'M') && !e.repeat) {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      // Push-To-Talk: Hold 'V'
      if ((e.key === 'v' || e.key === 'V') && !e.repeat) {
        e.preventDefault();
        if (!isVoiceConnectedRef.current) {
          startMicrophone().then(() => {
            if (localAudioTrackRef.current) {
              isPushToTalkingRef.current = true;
              setIsPushToTalking(true);
              localAudioTrackRef.current.unmute().catch(() => {});
              isMutedRef.current = false;
              setIsMuted(false);
              playAudioChirp('unmute');
              socketRef.current?.emit('voice:track_state', { isMuted: false, hasVideo: false });
              showToast('Push-to-Talk (Mic Live)', <Mic size={15} color="var(--pink-primary)" />);
            }
          }).catch(() => {});
          return;
        }
        if (localAudioTrackRef.current) {
          isPushToTalkingRef.current = true;
          setIsPushToTalking(true);
          localAudioTrackRef.current.unmute().catch(() => {});
          isMutedRef.current = false;
          setIsMuted(false);
          playAudioChirp('unmute');
          socketRef.current?.emit('voice:track_state', { isMuted: false, hasVideo: false });
          showToast('Push-to-Talk (Mic Live)', <Mic size={15} color="var(--pink-primary)" />);
        }
      }
    }

    function handleKeyUp(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.isContentEditable) return;

      // Release Push-To-Talk: 'V'
      if (e.key === 'v' || e.key === 'V') {
        if (isPushToTalkingRef.current && localAudioTrackRef.current) {
          isPushToTalkingRef.current = false;
          setIsPushToTalking(false);
          isMutedRef.current = true;
          setIsMuted(true);
          localAudioTrackRef.current.mute().catch(() => {});
          playAudioChirp('mute');
          socketRef.current?.emit('voice:track_state', { isMuted: true, hasVideo: false });
          showToast('Push-to-Talk ended (Muted)', <MicOff size={15} color="#9ca3af" />);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [socket]);

  // Autoplay Unlocker: Unmutes & resumes remote audio on first user gesture
  function unlockAudio() {
    peerGainNodesRef.current.forEach((entry) => {
      if (entry && entry.ctx && entry.ctx.state === 'suspended') {
        entry.ctx.resume().catch(() => {});
      }
    });
    remoteAudioElementsRef.current.forEach((el) => {
      if (el && el.srcObject) {
        el.play().catch(() => {});
      }
    });
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
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
        try { ytPlayerRef.current?.playVideo?.(); } catch {}
      } else {
        const v = document.querySelector('.pouf-player-container video');
        const a = document.querySelector('.pouf-player-container audio');
        if (v && v.paused) {
          v.play().catch(async () => {
            try {
              v.muted = true;
              await v.play();
            } catch (e2) {
              setNeedsUserClickToPlay(true);
            }
          });
        }
        if (a && a.src && a.paused) {
          a.play().catch(() => {});
        }
      }
    },
    pause() {
      if (activePlayerType === 'youtube') {
        try { ytPlayerRef.current?.pauseVideo?.(); } catch {}
      } else {
        const v = document.querySelector('.pouf-player-container video');
        const a = document.querySelector('.pouf-player-container audio');
        if (v && !v.paused) v.pause();
        if (a && a.src && !a.paused) a.pause();
      }
    },
    seek(seconds) {
      if (activePlayerType === 'youtube') {
        try { ytPlayerRef.current?.seekTo?.(seconds, true); } catch {}
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
        try { ytPlayerRef.current?.setPlaybackRate?.(rate); } catch {}
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
      } catch {}
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
            }).catch(() => {});
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

    const cleanName = (currentProfile.name || 'Het')
      .replace(/^(jotaro|jolyne|joyeline)\s+/i, '')
      .replace(/^riaa$/i, 'Ria')
      .trim();

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
      connectVoiceRoom({ publishMic: false }).catch(() => {});
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
        readyCount: readyCount || 1,
        totalUsers: totalUsers || 2
      });

      isSeekingRef.current = true;
      setRemoteLock(1200);

      const v = document.querySelector('.pouf-player-container video');
      const isAlreadyNear = v && typeof currentTime === 'number' && Math.abs(v.currentTime - currentTime) < 0.5;

      // Pause playback while buffering
      UnifiedPlayer.pause();
      if (!isAlreadyNear) {
        UnifiedPlayer.seek(currentTime);
      }

      let reported = false;
      function checkAndReportReady() {
        if (reported) return;
        reported = true;
        if (s) {
          s.emit('player:client_ready', { currentTime });
        }
      }

      if (isAlreadyNear || !v || v.readyState >= 2 || v.seeking === false) {
        checkAndReportReady();
      } else {
        const onReadyEvent = () => {
          v.removeEventListener('seeked', onReadyEvent);
          v.removeEventListener('canplay', onReadyEvent);
          checkAndReportReady();
        };
        v.addEventListener('seeked', onReadyEvent, { once: true });
        v.addEventListener('canplay', onReadyEvent, { once: true });

        // Snappy safety fallback: report ready within 350ms max
        setTimeout(checkAndReportReady, 350);
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

      const clientTime = UnifiedPlayer.getTime();
      if (typeof currentTime === 'number' && Math.abs(clientTime - currentTime) > 2.0) {
        UnifiedPlayer.seek(currentTime);
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
        } catch {}
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
        } catch {}
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
        }).catch(() => {});
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
      try { isPlaying = ytPlayerRef.current?.getPlayerState?.() === 1; } catch {}
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
      setChatOpen(false);
      setChatInputText('');
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
  useEffect(() => {
    function checkFullscreen() {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      const isF11 = (window.innerHeight >= (screen.height - 4) && window.innerWidth >= (screen.width - 4));
      const isFs = !!fsEl || isF11;
      setIsTheaterFullscreen(isFs);

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
      } catch (err) {}
    }

    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    window.addEventListener('resize', checkFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen);
      document.removeEventListener('webkitfullscreenchange', checkFullscreen);
      window.removeEventListener('resize', checkFullscreen);
    };
  }, []);

  // Hook Neko Iframe for Fullscreen Interception and Quick Chat Focus
  const handleNekoIframeLoad = () => {
    try {
      const iframe = nekoIframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win) return;

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
        win.Element.prototype.requestFullscreen = function(options) {
          return triggerTheaterFullscreen(options);
        };
        win.Element.prototype.webkitRequestFullscreen = function(options) {
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
      doc.exitFullscreen = function() {
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
      } catch (e) {}

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

      // 5. Forward keyboard shortcuts from inside Neko
      win.addEventListener('keydown', (e) => {
        const activeInside = doc.activeElement;
        const isTyping = activeInside && (
          activeInside.tagName === 'INPUT' ||
          activeInside.tagName === 'TEXTAREA' ||
          activeInside.isContentEditable
        );

        // Enter opens in-video floating chat if not typing inside a webpage form in Neko
        if (e.key === 'Enter' && !isTyping) {
          e.preventDefault();
          e.stopPropagation();
          setChatOpen(true);
          resetChatInactivityTimer();
          setTimeout(() => {
            if (chatInputRef.current) chatInputRef.current.focus();
          }, 40);
        } else if (e.key === 'Escape') {
          setChatOpen(false);
          if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
        } else if ((e.key === 'f' || e.key === 'F') && !isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          triggerTheaterFullscreen();
        }
      }, true);
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

  // Cinema Video Fullscreen (fullscreen the entire theater wrapper edge-to-edge)
  function toggleVideoFullscreen() {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const targetEl = theaterWrapperRef.current || theaterCanvasRef.current || document.documentElement;
    if (!isFs) {
      if (targetEl.requestFullscreen) {
        targetEl.requestFullscreen().then(() => {
          if ('keyboard' in navigator && navigator.keyboard?.lock) {
            navigator.keyboard.lock(['Escape']).catch(() => {});
          }
        }).catch(() => {});
      } else if (targetEl.webkitRequestFullscreen) {
        targetEl.webkitRequestFullscreen();
      }
    } else {
      if ('keyboard' in navigator && navigator.keyboard?.unlock) {
        navigator.keyboard.unlock();
      }
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  }

  // Toggle Chat Sidebar cleanly (C shortcut & minimal docked trigger)
  // If sidebar is open: closes it cleanly without exiting fullscreen
  // If sidebar is closed: enters true cinema fullscreen on theater wrapper (if not already) and opens sidebar
  const handleToggleSideChat = useCallback(() => {
    if (isChatSidebarOpenRef.current) {
      setIsChatSidebarOpen(false);
      return;
    }

    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFs) {
      const targetEl = theaterWrapperRef.current || theaterCanvasRef.current || document.documentElement;
      if (targetEl.requestFullscreen) {
        targetEl.requestFullscreen().catch(() => {});
      } else if (targetEl.webkitRequestFullscreen) {
        targetEl.webkitRequestFullscreen();
      }
    }
    setIsChatSidebarOpen(true);
    handleMarkChatSeen();
    setUnreadChatCount(0);
  }, [handleMarkChatSeen]);

  useEffect(() => {
    function handleGlobalKeyDown(e) {
      const activeEl = document.activeElement;
      const isInInput = (
        (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) ||
        (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable))
      );

      // ESCAPE key logic: closes modals, GIF picker, floating chat, or exits chitchat FIRST before browser exits fullscreen!
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
          if (activeEl && isInInput) activeEl.blur();
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
          return;
        }
        // If nothing else is open, exit fullscreen cleanly if currently in fullscreen
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl) {
          e.preventDefault();
          e.stopPropagation();
          if ('keyboard' in navigator && navigator.keyboard?.unlock) {
            navigator.keyboard.unlock();
          }
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          return;
        }
      }

      if (isInInput) {
        resetChatInactivityTimer();
        return;
      }

      // 'c' or 'C' toggles sidechat (c to open, c to close)
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleToggleSideChat();
        return;
      }

      // 'f' or 'F' toggles fullscreen
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleVideoFullscreen();
        return;
      }

      // Space toggles play/pause
      if (e.key === ' ') {
        e.preventDefault();
        if (activePlayerType === 'youtube') {
          try {
            const st = ytPlayerRef.current?.getPlayerState?.();
            if (st === 1) UnifiedPlayer.pause();
            else UnifiedPlayer.play();
          } catch {}
        } else if (artInstanceRef.current) {
          artInstanceRef.current.toggle();
        }
        return;
      }

      // Enter opens floating chat typing input (if sidebar is not open)
      if (e.key === 'Enter') {
        const isSidebarActive = (isChitChatModeRef.current && !isChatCollapsedRef.current) || isChatSidebarOpenRef.current;
        if (!isSidebarActive) {
          e.preventDefault();
          e.stopPropagation();
          setChatOpen(true);
          resetChatInactivityTimer();
          setTimeout(() => {
            if (chatInputRef.current) {
              chatInputRef.current.focus();
            }
          }, 40);
        }
        return;
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (chatFadeTimerRef.current) clearTimeout(chatFadeTimerRef.current);
    };
  }, [activePlayerType, handleToggleSideChat, showFloatingGiphy, chatOpen, showAudioPopover, showSubtitlePopover, showVoiceSettings]);

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

  // Floating in-video chat overlay (hidden if chat sidebar is open)
  function renderChatOverlay() {
    const isSidebarActive = (isChitChatMode && !isChatCollapsed) || isChatSidebarOpen;
    if (isSidebarActive) return null;

    const overlay = (
      <div
        className="floating-chat-overlay"
        onClick={(e) => e.stopPropagation()}
        style={{
          bottom: (isTheaterFullscreen || activePlayerType === 'neko') ? (chatOpen ? '72px' : '64px') : '72px'
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
                  <span style={{ color: 'var(--pink-primary)', fontWeight: 800, fontSize: '0.78rem' }}>
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
                <span style={{ color: 'var(--pink-primary)', fontWeight: 800 }}>
                  {m.sender}:
                </span>
                <span>{m.text}</span>
              </div>
            )
          ))}
        </div>

        {/* Floating In-Video GIPHY Picker popup */}
        {showFloatingGiphy && chatOpen && (
          <div
            style={{ width: '310px', marginBottom: '8px', pointerEvents: 'auto', zIndex: 1002 }}
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

        {chatOpen && (
          <form onSubmit={handleSendChat} className="floating-glass-chat-bar">
            <UserAvatar user={currentProfile} size={24} showBorder={true} />

            {/* Quick GIF Button */}
            <button
              type="button"
              onClick={() => setShowFloatingGiphy((prev) => !prev)}
              style={{
                background: showFloatingGiphy ? 'linear-gradient(135deg, #ec4899, #db2777)' : 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(244, 114, 182, 0.35)',
                borderRadius: '6px',
                padding: '2px 5px',
                cursor: 'pointer',
                lineHeight: 1
              }}
              title="Send GIF"
            >
              <span style={{ fontSize: '0.62rem', fontWeight: 900, color: showFloatingGiphy ? '#ffffff' : '#f472b6' }}>
                GIF
              </span>
            </button>

            {/* Quick Emoji Reactions */}
            {['❤️', '😂', '🍿'].map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setChatInputText((prev) => prev + em)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.92rem', padding: '1px 2px', lineHeight: 1 }}
                title={`Insert ${em}`}
              >
                {em}
              </button>
            ))}

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
                  setChatOpen(false);
                  setShowFloatingGiphy(false);
                  setChatInputText('');
                  chatInputRef.current?.blur();
                }
              }}
              placeholder={`Chat with ${currentProfile.name === 'Het' ? 'Ria' : 'Het'}... (Enter to send, Esc to close)`}
              className="floating-chat-input"
              autoFocus
            />
            <button type="submit" className="floating-chat-send-btn" title="Send (Enter)">
              <Send size={13} />
            </button>
            <button
              type="button"
              onClick={() => {
                setChatOpen(false);
                setShowFloatingGiphy(false);
                setChatInputText('');
                if (activePlayerType === 'neko') {
                  setTimeout(() => nekoIframeRef.current?.focus?.(), 50);
                }
              }}
              className="floating-chat-close-btn"
              title="Close (Esc)"
            >
              <X size={14} />
            </button>
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
      <div
        className="pouf-popover-shell"
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 10px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '310px',
          maxHeight: '380px',
          overflowY: 'auto',
          background: 'rgba(15, 10, 22, 0.98)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1.5px solid rgba(244, 114, 182, 0.35)',
          borderRadius: '16px',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.95), 0 0 25px rgba(244, 114, 182, 0.18)',
          padding: '12px 14px',
          zIndex: 1000,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 800, fontSize: '0.88rem', color: '#fbcfe8' }}>
            <Headphones size={15} color="var(--pink-primary)" />
            <span>Voice Controls</span>
          </div>
          <button
            onClick={() => setShowVoiceSettings(false)}
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '2px', display: 'flex' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Mini Tab Switcher */}
        <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '2px', gap: '3px' }}>
          <button
            type="button"
            onClick={() => setVoiceSettingsTab('mic')}
            style={{
              flex: 1,
              padding: '5px 0',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: voiceSettingsTab === 'mic' ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' : 'transparent',
              color: voiceSettingsTab === 'mic' ? '#ffffff' : '#9ca3af',
              transition: 'all 0.18s ease'
            }}
          >
            My Mic
          </button>
          <button
            type="button"
            onClick={() => setVoiceSettingsTab('peers')}
            style={{
              flex: 1,
              padding: '5px 0',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: voiceSettingsTab === 'peers' ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' : 'transparent',
              color: voiceSettingsTab === 'peers' ? '#ffffff' : '#9ca3af',
              transition: 'all 0.18s ease'
            }}
          >
            Room Voice ({otherPeers.length})
          </button>
        </div>

        {voiceSettingsTab === 'mic' ? (
          <>
            {/* Microphone Sourcing List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.70rem', fontWeight: 700, color: '#fbcfe8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Active Mic
                </span>
                <button
                  type="button"
                  onClick={refreshMediaDevices}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--pink-primary)',
                    fontSize: '0.68rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                  title="Rescan microphones"
                >
                  <RotateCcw size={10} /> Rescan
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '110px', overflowY: 'auto' }}>
                {audioInputDevices.length === 0 ? (
                  <div style={{ fontSize: '0.76rem', color: '#9ca3af', padding: '6px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                    Default System Mic
                  </div>
                ) : (
                  audioInputDevices.map((dev, idx) => {
                    const isSelected = dev.deviceId === selectedAudioInput;
                    const cleanLabel = dev.label || `Mic ${idx + 1}`;
                    return (
                      <div
                        key={dev.deviceId || idx}
                        onClick={() => switchAudioInput(dev.deviceId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(236, 72, 153, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                          border: isSelected ? '1px solid rgba(236, 72, 153, 0.45)' : '1px solid transparent',
                          fontSize: '0.76rem',
                          color: isSelected ? '#ffffff' : '#d1d5db'
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>
                          {cleanLabel}
                        </span>
                        {isSelected && <Check size={13} color="#f472b6" />}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Multi-Engine Noise Cancellation (Deep AI vs Speex DSP vs Raw) */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(244, 114, 182, 0.18)',
              borderRadius: '10px',
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.70rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#fbcfe8' }}>
                  Suppression Engine
                </span>
                <span style={{ fontSize: '0.64rem', color: '#f472b6', fontWeight: 700 }}>
                  {noiseSuppressionMode === 'rnnoise' ? 'AI Neural' : noiseSuppressionMode === 'speex' ? 'DSP Filter' : 'Raw Bypass'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                {[
                  { id: 'rnnoise', label: 'AI Neural', desc: 'RNNoise' },
                  { id: 'speex', label: 'Acoustic', desc: 'Speex DSP' },
                  { id: 'raw', label: 'Studio Raw', desc: 'Bypass' }
                ].map((mode) => {
                  const isAct = noiseSuppressionMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => handleNoiseModeChange(mode.id)}
                      style={{
                        padding: '5px 2px',
                        borderRadius: '7px',
                        border: isAct ? '1.5px solid var(--pink-primary)' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: isAct ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.35), rgba(219, 39, 119, 0.25))' : 'rgba(255, 255, 255, 0.04)',
                        color: isAct ? '#ffffff' : '#9ca3af',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1.15,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ fontSize: '0.68rem', fontWeight: isAct ? 800 : 600 }}>{mode.label}</span>
                      <span style={{ fontSize: '0.58rem', opacity: 0.75 }}>{mode.desc}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: '0.64rem', color: '#9ca3af' }}>
                {noiseSuppressionMode === 'rnnoise'
                  ? 'Deep RNN suppresses background fans, keyboard clicks & TV noise.'
                  : noiseSuppressionMode === 'speex'
                  ? 'Fast acoustic DSP noise suppression with ultra-low latency.'
                  : 'Bypasses AI/DSP noise suppression for uncolored studio audio.'}
              </div>
            </div>

            {/* Studio Noise Gate & Intensity */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(244, 114, 182, 0.18)',
              borderRadius: '10px',
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.70rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#fbcfe8' }}>
                  Noise Gate
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isNoiseGateOpen ? '#34d399' : '#f472b6' }}>
                  {noiseIntensity === 0 ? 'Off (Open)' : isNoiseGateOpen ? 'Open' : 'Gated'}
                </span>
              </div>

              {/* Live VU meter */}
              <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '9999px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, micLevel)}%`,
                    background: isNoiseGateOpen ? '#34d399' : '#ec4899',
                    transition: 'width 0.06s ease'
                  }}
                />
              </div>

              {/* Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={noiseIntensity}
                  onChange={(e) => handleNoiseIntensityChange(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#ec4899', height: '4px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f472b6', minWidth: '32px', textAlign: 'right' }}>
                  {noiseIntensity}%
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
                {noiseIntensity === 0 ? 'Gate is off: 100% full speech transmission' : 'Silences room rumble & fan noise between words'}
              </div>
            </div>

            {/* Mic Input Gain / Sensitivity Boost */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(244, 114, 182, 0.18)',
              borderRadius: '10px',
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.70rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#fbcfe8' }}>
                  Mic Sensitivity
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#f472b6' }}>
                  {micGain}%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="range"
                  min="50"
                  max="200"
                  step="5"
                  value={micGain}
                  onChange={(e) => handleMicGainChange(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#ec4899', height: '4px', cursor: 'pointer' }}
                />
              </div>
              <div style={{ fontSize: '0.64rem', color: '#9ca3af' }}>
                {micGain > 100 ? 'Boosts quiet microphones before WebRTC transmission' : 'Normal sensitivity level'}
              </div>
            </div>

            {/* Echo Cancellation Mode Toggle */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(244, 114, 182, 0.18)',
              borderRadius: '10px',
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f1f5f9' }}>
                  Echo Cancellation
                </span>
                <span style={{ fontSize: '0.64rem', color: '#9ca3af' }}>
                  {isEchoCancellationEnabled ? 'On (Safe for Speakers)' : 'Off (Studio Mode for Headphones)'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleEchoCancellationToggle}
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  border: isEchoCancellationEnabled ? '1px solid rgba(236, 72, 153, 0.5)' : '1px solid rgba(255, 255, 255, 0.15)',
                  background: isEchoCancellationEnabled ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' : 'rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  fontSize: '0.70rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {isEchoCancellationEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            {/* Mic Toggle Button */}
            {isVoiceConnected ? (
              <button
                onClick={leaveVoiceChat}
                style={{
                  padding: '7px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.76rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <MicOff size={13} color="#fca5a5" />
                <span>Disconnect Mic</span>
              </button>
            ) : (
              <button
                onClick={() => startMicrophone()}
                style={{
                  padding: '7px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.76rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(236,72,153,0.35)'
                }}
              >
                <Mic size={13} color="#ffffff" />
                <span>Connect Mic</span>
              </button>
            )}
          </>
        ) : (
          /* Tab 2: Discord-Style Per-Peer Volume Controls */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
            {otherPeers.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.78rem', padding: '16px 8px' }}>
                No other members in room
              </div>
            ) : (
              otherPeers.map((user) => {
                const pId = user.id || user.peerId || user.socketId;
                const peerVol = peerVolumes.get(pId) ?? 100;
                const isMuted = peerVol === 0;

                return (
                  <div
                    key={pId || user.username}
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '10px',
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    {/* User Info Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <UserAvatar avatar={user.avatar || 'jojo-star'} size="20px" />
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fce7f3' }}>
                          {user.username || user.name || 'Friend'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            color: peerVol > 100 ? '#f59e0b' : '#34d399',
                            fontFamily: 'monospace'
                          }}
                        >
                          {peerVol}% {peerVol > 100 ? '⚡' : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => handlePeerVolume(pId, isMuted ? 100 : 0)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px',
                            color: isMuted ? '#f87171' : '#f472b6',
                            display: 'flex'
                          }}
                          title={isMuted ? 'Unmute' : 'Mute'}
                        >
                          {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Discord-Style Volume Slider (0% - 200% Boost) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        step="5"
                        value={peerVol}
                        onChange={(e) => handlePeerVolume(pId, e.target.value)}
                        style={{
                          flex: 1,
                          accentColor: peerVol > 100 ? '#f59e0b' : '#ec4899',
                          height: '4px',
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );

    return popover;
  }

  return (
    <div ref={theaterWrapperRef} className={`theater-view-wrapper ${isChatSidebarOpen ? 'chat-expanded' : ''}`}>
      {/* Hidden WebRTC Remote Audio Hub */}
      <div id="wt-remote-audio-hub" style={{ display: 'none' }} aria-hidden="true" />

      {/* Left Column: Video Stage + Bottom Control Deck */}
      <div className="theater-stage-column">
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', background: '#0e0813' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', border: '4px solid rgba(244,114,182,0.2)', borderTopColor: '#f472b6', animation: 'spin 0.8s linear infinite' }} />
                  <div style={{ color: '#f472b6', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.3px' }}>{nekoStatusMsg}</div>
                  <div style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Warming up Chromium engine & WebRTC audio/video feeds</div>
                </div>
              ) : (
                <iframe
                  ref={nekoIframeRef}
                  onLoad={handleNekoIframeLoad}
                  key={nekoIframeKey}
                  src={`/neko/?usr=${encodeURIComponent(currentProfile?.name || 'Viewer')}&pwd=${(currentProfile?.role === 'admin' || currentProfile?.name?.toLowerCase() === 'het' || currentProfile?.name?.toLowerCase() === 'ria' || currentProfile?.name?.toLowerCase() === 'riaa') ? 'admin' : 'neko'}&embed=1`}
                  title="Shared Virtual Browser (Neko)"
                  allow="autoplay; camera; microphone; fullscreen; clipboard-read; clipboard-write;"
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
          </PoufPlayer>
        </div>
        )}

        {/* Floating Chat Overlay for YouTube / Neko (Rendered outside when PoufPlayer is not mounted) */}
        {(activePlayerType === 'youtube' || activePlayerType === 'neko') && renderChatOverlay()}

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
      <div className="theater-deck">
        <div className="theater-deck-row" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Group 1: Media & Sync Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Main Force Sync Button */}
            <button
              onClick={handleForceSync}
              className="btn-gold-shimmer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.48rem 1.05rem',
                fontSize: '0.82rem',
                fontWeight: 800
              }}
              title="Snap both users to exact timestamp"
            >
              <ClaySparkle size={17} />
              <span>Sync Both</span>
            </button>

            {/* Choose / Change Media */}
            <button
              onClick={() => setCreateModalOpen(true)}
              className="btn-pink-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.48rem 0.92rem', fontSize: '0.80rem' }}
            >
              <ClayPopcorn size={16} />
              <span>Change Media</span>
            </button>

            {/* Media Library */}
            <button
              onClick={openLibrary}
              className="btn-pink-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.48rem 0.90rem', fontSize: '0.80rem' }}
            >
              <ClayFolder size={16} />
              <span>Library</span>
            </button>
          </div>

          {/* Group 2: Unified Voice & Hardware Dock */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '12px', border: '1px solid rgba(244, 114, 182, 0.22)', padding: '2px', backdropFilter: 'blur(12px)' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMicButtonClick();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.46rem 0.85rem',
                fontSize: '0.80rem',
                fontWeight: 700,
                borderRadius: '10px',
                cursor: 'pointer',
                border: 'none',
                background: !isVoiceConnected
                  ? 'transparent'
                  : isLocalSpeaking && !isMuted
                    ? 'rgba(236, 72, 153, 0.35)'
                    : isMuted
                      ? 'rgba(239, 68, 68, 0.22)'
                      : 'rgba(236, 72, 153, 0.2)',
                color: !isVoiceConnected ? '#cbd5e1' : (isMuted ? '#fca5a5' : '#ffffff'),
                transition: 'all 0.2s ease'
              }}
              title={!isVoiceConnected ? "Turn Mic On (Press 'M')" : (isMuted ? "Unmute Mic (M)" : "Mute Mic (M)")}
            >
              {!isVoiceConnected ? (
                <>
                  <Mic size={14} color="#f472b6" />
                  <span>Mic Off</span>
                </>
              ) : isMuted ? (
                <>
                  <MicOff size={14} color="#ef4444" />
                  <span>Muted</span>
                </>
              ) : (
                <>
                  <Mic size={14} color="#34d399" />
                  <span>Live</span>
                </>
              )}
            </button>

            <div style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.12)', margin: '0 2px' }} />

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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0.46rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '10px',
                border: 'none',
                background: showVoiceSettings ? 'rgba(244, 114, 182, 0.25)' : 'transparent',
                color: '#fbcfe8',
                cursor: 'pointer',
                maxWidth: '180px',
                transition: 'all 0.2s ease'
              }}
              title="Voice & Audio Settings"
            >
              <Sliders size={13} color="var(--pink-primary)" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {audioInputDevices.find((d) => d.deviceId === selectedAudioInput)?.label?.split('(')[0]?.trim() || 'Select Mic'}
              </span>
              <ChevronDown size={12} color="var(--pink-primary)" style={{ transform: showVoiceSettings ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
            </button>

            {/* Docked Microphone Settings Popover directly above button */}
            {renderVoiceSettingsPopover()}
          </div>

          {/* Group 3: Lounge Social & Viewport Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Hidden File Input for External Subtitle Upload from Player Settings */}
            <input
              ref={subtitleFileInputRef}
              type="file"
              accept=".srt,.vtt,.ass"
              style={{ display: 'none' }}
              onChange={handleCustomSubtitleUpload}
            />

            {/* CHIT CHAT MODE TOGGLE BUTTON */}
            <button
              onClick={handleToggleSideChat}
              className={isChatSidebarOpen ? 'btn-pink-primary' : 'btn-pink-secondary'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.48rem 0.95rem',
                fontSize: '0.80rem',
                position: 'relative'
              }}
              title="Toggle Chit Chat Split Screen (Shortcut: C)"
            >
              <ClayChat size={16} />
              <span>Chit Chat Mode</span>
              {unreadChatCount > 0 && !isChatSidebarOpen && (
                <span className="clay-unread-badge" style={{ marginLeft: '4px' }}>
                  {unreadChatCount}
                </span>
              )}
            </button>

            {/* SINGLE Theater Fullscreen Button (Clean & Aesthetic) */}
            <button
              onClick={toggleVideoFullscreen}
              className="btn-pink-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.48rem 0.90rem', fontSize: '0.80rem' }}
              title="Toggle Fullscreen (Shortcut: F)"
            >
              <Maximize size={14} color="var(--pink-primary)" />
              <span>Fullscreen</span>
            </button>
          </div>
        </div>

        {/* Deck Bottom Status Bar - Voice Presence Only (Removed duplicate bottom title text) */}
        <div className="theater-deck-between" style={{ marginTop: '2px', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {/* Live Voice Indicator and Connected Peers */}
            {isVoiceConnected && (
              <span
                onClick={() => setShowVoiceSettings(true)}
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  background: isMuted ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.14)',
                  border: isMuted ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(16, 185, 129, 0.35)',
                  color: isMuted ? '#f87171' : 'var(--emerald-accent)',
                  cursor: 'pointer'
                }}
                title="Click to open Voice Hardware Settings"
              >
                <span className="status-dot" style={{ background: isMuted ? '#ef4444' : 'var(--emerald-accent)' }}></span>
                <span>{isMuted ? 'Voice Muted (M)' : 'Studio Voice (128k)'}</span>
              </span>
            )}

            {/* Remote Peer Voice Status */}
            {Array.from(remotePeers.entries()).map(([pId, p]) => (
              <span
                key={pId}
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 9px',
                  borderRadius: '999px',
                  background: p.isSpeaking ? 'rgba(16, 185, 129, 0.22)' : 'rgba(255, 255, 255, 0.08)',
                  border: p.isSpeaking ? `1px solid ${p.color || '#10b981'}` : '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#fff',
                  boxShadow: p.isSpeaking ? `0 0 10px ${p.color || '#10b981'}` : undefined
                }}
                title={p.isSpeaking ? `${p.username} is speaking` : `${p.username} in voice`}
              >
                <UserAvatar user={{ name: p.username, avatar: p.avatar }} size={16} showBorder={false} />
                <span>{p.username}</span>
                {p.isMuted ? <MicOff size={11} color="#f87171" /> : p.isSpeaking ? <Radio size={11} color="#10b981" /> : <Mic size={11} color="#9ca3af" />}
              </span>
            ))}

            <span style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '999px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: 'var(--emerald-accent)'
            }}>
              <span className="status-dot" style={{ background: 'var(--emerald-accent)' }}></span>
              <span>{syncStatus}</span>
            </span>
          </div>
        </div>
      </div>
      </div>

      {/* Dedicated Split-Screen Chat Sidebar in ALL scenarios */}
      {isChatSidebarOpen && (
        <div className="theater-chat-sidebar-container">
          <ChatSidebar
            isOpen={true}
            onClose={() => setIsChatSidebarOpen(false)}
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
                  No media files in server storage. Het can download MKVs or episodes via Server Downloader!
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
