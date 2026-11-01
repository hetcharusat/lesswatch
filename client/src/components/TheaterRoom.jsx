import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { io } from 'socket.io-client';
import Hls from 'hls.js';
import {
  Play, Pause, Zap, MessageSquare, Maximize, Minimize,
  Link as LinkIcon, Send, X, Film, Folder, Sparkles, Volume2, Users,
  Check, Upload, Type, Mic, MicOff, Settings, Radio, Headphones,
  RotateCcw, Power, Sliders, ChevronDown, Smile, AlertCircle, Globe, LogOut, ShieldCheck, FastForward
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

// Studio Opus SDP modifier (Forces 128kbps stereo transmission, eliminates robotic artifacts)
function boostOpusSDP(sdp) {
  if (!sdp) return sdp;
  return sdp.replace(/a=fmtp:(\d+)(.*)/g, (match, pt, rest) => {
    if (sdp.includes(`a=rtpmap:${pt} opus/48000`)) {
      let params = rest.trim();
      if (!params.includes('maxaveragebitrate')) {
        params += ';maxaveragebitrate=128000';
      }
      if (!params.includes('stereo=')) {
        params += ';stereo=1;sprop-stereo=1';
      }
      if (!params.includes('cbr=')) {
        params += ';cbr=1';
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

export function TheaterRoom({ roomId = 'lounge', currentProfile, initialMedia, initialTitle, initialType, onNavigate, onConsumeInitialMedia }) {
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
  const [noiseSuppression, setNoiseSuppression] = useState(() => localStorage.getItem('wt_noise_supp') === 'true');
  const [noiseIntensity, setNoiseIntensity] = useState(() => {
    const saved = localStorage.getItem('wt_noise_intensity');
    return saved !== null ? parseInt(saved, 10) : 40;
  });
  const [micLevel, setMicLevel] = useState(0);
  const [isNoiseGateOpen, setIsNoiseGateOpen] = useState(false);
  const noiseIntensityRef = useRef(noiseIntensity);
  const rawHardwareStreamRef = useRef(null);
  const audioNodesRef = useRef(null);

  // WebRTC Hardware Refs (Native WebRTC Mesh + Anti-Bluetooth Degradation Guard)
  const socketRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // peerId -> RTCPeerConnection
  const remoteAudioElementsRef = useRef(new Map()); // peerId -> HTMLAudioElement
  const pendingCandidatesRef = useRef(new Map()); // peerId -> RTCIceCandidate[]
  const localStreamRef = useRef(null);
  const localAudioTrackRef = useRef(null);
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
  const [isChitChatMode, setIsChitChatMode] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [roomLastSeen, setRoomLastSeen] = useState({});
  const isChitChatModeRef = useRef(false);
  const isChatCollapsedRef = useRef(false);

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

  const handleEnterChitChat = async () => {
    setIsChitChatMode(true);
    document.body.classList.add('in-chit-chat-mode');
    setIsChatCollapsed(false);
    setIsChatSidebarOpen(false);
    handleMarkChatSeen();
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request blocked or not supported:', err);
    }
  };

  const handleExitChitChat = async () => {
    setIsChitChatMode(false);
    document.body.classList.remove('in-chit-chat-mode');
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {}
  };

  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement && isChitChatModeRef.current) {
        setIsChitChatMode(false);
        document.body.classList.remove('in-chit-chat-mode');
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.body.classList.remove('in-chit-chat-mode');
    };
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
  const [recentMessages, setRecentMessages] = useState([]);

  // Refs
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

  // Safe Microphone Stream Acquisition (Mobile-hardened & Bluetooth-friendly)
  async function acquireMicStream() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let constraints;

    if (isMobile) {
      // Safe mobile constraints: NEVER pass exact deviceId or sampleRate on mobile
      constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      };
    } else {
      // Desktop constraints with selected safe input
      constraints = {
        audio: {
          deviceId: selectedAudioInput ? { ideal: selectedAudioInput } : undefined,
          echoCancellation: true,
          noiseSuppression: noiseSuppression,
          autoGainControl: true
        },
        video: false
      };
    }

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (isMobile) {
        console.warn('High-spec mobile constraints failed, using basic audio fallback:', err);
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      throw err;
    }
  }

  // Web Audio Noise Gate & DSP Filter Pipeline
  function setupAudioProcessing(rawStream) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    try {
      if (audioAnalyserIntervalRef.current) {
        clearInterval(audioAnalyserIntervalRef.current);
        audioAnalyserIntervalRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      audioNodesRef.current = null;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return rawStream;

      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaStreamSource(rawStream);

      // On mobile devices (iOS Safari and Android):
      // Mobile OS hardware chips handle echo cancellation & noise suppression.
      // Passing through createMediaStreamDestination() triggers WebKit bug #216460 (silence on WebRTC).
      // We connect the analyser purely for UI VU-meter & speaking state, and stream rawStream directly!
      if (isMobile) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.25;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let speakingTicks = 0;

        audioAnalyserIntervalRef.current = setInterval(() => {
          if (!isVoiceConnectedRef.current || !localAudioTrackRef.current || isMutedRef.current) {
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

          const isSpeakingNow = avg > 14;
          if (isSpeakingNow) {
            speakingTicks = Math.min(speakingTicks + 1, 6);
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

        return rawStream;
      }

      // Low rumble filter (Cuts desk vibrations, AC hum, laptop fan roar under 90Hz)
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 90;

      // Gentle high cut (Removes harsh RF hiss and sharp sibilance above 8.5kHz)
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 8500;

      // Dynamic Noise Gate Gain Node
      const gateGain = ctx.createGain();
      gateGain.gain.value = 1.0;

      // Create destination for WebRTC output
      const destination = ctx.createMediaStreamDestination();

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(gateGain);
      gateGain.connect(destination);

      // Analyser connected to filtered audio for speaking & level detection
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.25;
      highpass.connect(analyser);

      audioNodesRef.current = { source, highpass, lowpass, gateGain, destination, analyser };

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let speakingTicks = 0;
      let gateHoldTicks = 0;

      audioAnalyserIntervalRef.current = setInterval(() => {
        if (!isVoiceConnectedRef.current || !localAudioTrackRef.current || isMutedRef.current) {
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

        const intensity = noiseIntensityRef.current;
        if (intensity === 0) {
          // Filter disabled: wide open
          gateGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.02);
          setIsNoiseGateOpen(true);
        } else {
          // Threshold scale: at intensity 50%, threshold is ~19
          const gateThreshold = 3 + (intensity * 0.32);
          if (avg > gateThreshold) {
            gateGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.015);
            gateHoldTicks = 5; // ~300ms hold time prevents chopped words
            setIsNoiseGateOpen(true);
          } else {
            if (gateHoldTicks > 0) {
              gateHoldTicks--;
              gateGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.02);
              setIsNoiseGateOpen(true);
            } else {
              gateGain.gain.setTargetAtTime(0.001, ctx.currentTime, 0.04);
              setIsNoiseGateOpen(false);
            }
          }
        }

        const isSpeakingNow = avg > 14;
        if (isSpeakingNow) {
          speakingTicks = Math.min(speakingTicks + 1, 6);
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

      return destination.stream;
    } catch (err) {
      console.warn('Audio processing setup error, falling back to raw stream:', err);
      return rawStream;
    }
  }

  function handleNoiseIntensityChange(val) {
    const num = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
    setNoiseIntensity(num);
    noiseIntensityRef.current = num;
    localStorage.setItem('wt_noise_intensity', String(num));
    if (audioNodesRef.current?.gateGain && audioContextRef.current) {
      if (num === 0) {
        audioNodesRef.current.gateGain.gain.setTargetAtTime(1.0, audioContextRef.current.currentTime, 0.02);
        setIsNoiseGateOpen(true);
      }
    }
  }

  // Remote Audio Management (Attached on-demand, prevents Neko iframe ducking)
  function playRemoteAudio(peerId, remoteStream) {
    let audioEl = remoteAudioElementsRef.current.get(peerId);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `remote-audio-${peerId}`;
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.setAttribute('playsinline', '');
      audioEl.setAttribute('webkit-playsinline', '');
      audioEl.setAttribute('autoplay', '');

      let hub = document.getElementById('wt-remote-audio-hub');
      if (!hub) {
        hub = document.createElement('div');
        hub.id = 'wt-remote-audio-hub';
        hub.style.display = 'none';
        hub.setAttribute('aria-hidden', 'true');
        document.body.appendChild(hub);
      }
      hub.appendChild(audioEl);

      if (selectedAudioOutput && typeof audioEl.setSinkId === 'function') {
        audioEl.setSinkId(selectedAudioOutput).catch(() => {});
      }
      remoteAudioElementsRef.current.set(peerId, audioEl);
    }

    audioEl.srcObject = remoteStream;
    audioEl.volume = 1.0;
    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('Remote audio waiting for interaction on mobile:', err);
        setNeedsVoiceAudioUnlock(true);
      });
    }

    setRemotePeers((prev) => {
      const next = new Map(prev);
      const user = connectedUsersRef.current.find((u) => u.id === peerId);
      next.set(peerId, {
        username: user?.username || 'Partner',
        avatar: user?.avatar || 'jojo-star',
        color: user?.color || '#f472b6',
        isSpeaking: false,
        isMuted: false,
        stream: remoteStream
      });
      return next;
    });
  }

  function stopRemoteAudio(peerId) {
    const audioEl = remoteAudioElementsRef.current.get(peerId);
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.srcObject = null;
        if (audioEl.parentNode) audioEl.parentNode.removeChild(audioEl);
      } catch {}
      remoteAudioElementsRef.current.delete(peerId);
    }
    setRemotePeers((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }

  // WebRTC Peer Connection Factory (Native Socket.IO Mesh - On Demand Only)
  function getOrCreatePeerConnection(peerId, isInitiator = false) {
    if (peerConnectionsRef.current.has(peerId)) {
      return peerConnectionsRef.current.get(peerId);
    }

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current.set(peerId, pc);

    // Attach local microphone tracks if active
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // ICE Candidate Exchange
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('voice:signal', {
          targetPeerId: peerId,
          signalData: { candidate: event.candidate }
        });
      }
    };

    // Remote Audio Track Received
    pc.ontrack = (event) => {
      console.log(`📡 Remote audio track received from ${peerId}:`, event.track.kind);
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      playRemoteAudio(peerId, remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(peerId);
      }
    };

    if (isInitiator) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false })
        .then((offer) => {
          offer.sdp = boostOpusSDP(offer.sdp);
          return pc.setLocalDescription(offer);
        })
        .then(() => {
          socketRef.current?.emit('voice:signal', {
            targetPeerId: peerId,
            signalData: { desc: pc.localDescription }
          });
        })
        .catch((err) => console.warn('WebRTC offer error:', err));
    }

    return pc;
  }

  function cleanupPeer(peerId) {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      try { pc.close(); } catch {}
      peerConnectionsRef.current.delete(peerId);
    }
    stopRemoteAudio(peerId);
    pendingCandidatesRef.current.delete(peerId);
  }

  // 4. Voice Chat Handlers (Direct, High Quality, Non-Blocking)
  async function startMicrophone() {
    try {
      showToast('Connecting microphone...', <Mic size={15} color="var(--pink-primary)" />);
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume().catch(() => {});
      }

      const rawStream = await acquireMicStream();
      rawHardwareStreamRef.current = rawStream;

      const processedStream = setupAudioProcessing(rawStream);
      localStreamRef.current = processedStream;

      const audioTrack = processedStream.getAudioTracks()[0] || rawStream.getAudioTracks()[0];
      if (audioTrack) {
        localAudioTrackRef.current = audioTrack;
        audioTrack.enabled = true;
      }

      isVoiceConnectedRef.current = true;
      setIsVoiceConnected(true);
      isMutedRef.current = false;
      setIsMuted(false);

      // Notify the room that we are live in voice
      socketRef.current?.emit('voice:join', { hasAudio: true, hasVideo: false });
      socketRef.current?.emit('voice:track_state', { isMuted: false, hasVideo: false });

      // Initiate WebRTC connections to all other connected peers
      const targets = connectedUsersRef.current && connectedUsersRef.current.length > 0
        ? connectedUsersRef.current
        : connectedUsers;
      targets.forEach((u) => {
        if (u.id && u.id !== socketRef.current?.id) {
          getOrCreatePeerConnection(u.id, true);
        }
      });

      refreshMediaDevices();

      playAudioChirp('unmute');
      showToast('Microphone live', <Mic size={15} color="var(--pink-primary)" />);
    } catch (err) {
      console.warn('Microphone start error:', err);
      showToast('Microphone access denied: ' + (err.message || err.name || 'Check permissions'), <AlertCircle size={15} color="#ef4444" />);
    }
  }

  function leaveVoiceChat() {
    // 1. Close all active peer connections
    peerConnectionsRef.current.forEach((pc) => {
      try { pc.close(); } catch {}
    });
    peerConnectionsRef.current.clear();

    // 2. Stop audio analyser interval
    if (audioAnalyserIntervalRef.current) {
      clearInterval(audioAnalyserIntervalRef.current);
      audioAnalyserIntervalRef.current = null;
    }

    // 3. Completely stop hardware microphone tracks so Windows releases mic
    // (This guarantees Bluetooth earphones stay in 48kHz A2DP stereo!)
    if (rawHardwareStreamRef.current) {
      rawHardwareStreamRef.current.getTracks().forEach((track) => track.stop());
      rawHardwareStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    localAudioTrackRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    audioNodesRef.current = null;

    // 4. Clean up remote audio elements
    remoteAudioElementsRef.current.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
        if (el.parentNode) el.parentNode.removeChild(el);
      } catch {}
    });
    remoteAudioElementsRef.current.clear();
    pendingCandidatesRef.current.clear();

    isVoiceConnectedRef.current = false;
    setIsVoiceConnected(false);
    setIsLocalSpeaking(false);
    isLocalSpeakingRef.current = false;
    setMicLevel(0);
    setIsNoiseGateOpen(false);

    socketRef.current?.emit('voice:leave');
    socketRef.current?.emit('voice:track_state', { isMuted: true, hasVideo: false });
    playAudioChirp('mute');
    showToast('Microphone off', <MicOff size={15} color="#9ca3af" />);
  }

  const joinVoiceChat = startMicrophone;

  function handleToggleMute() {
    if (!isVoiceConnectedRef.current || !localAudioTrackRef.current) {
      startMicrophone();
      return;
    }

    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.enabled = !nextMuted;
    }
    if (rawHardwareStreamRef.current) {
      rawHardwareStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !nextMuted; });
    }

    playAudioChirp(nextMuted ? 'mute' : 'unmute');
    showToast(
      nextMuted ? 'Microphone muted' : 'Microphone live',
      nextMuted ? <MicOff size={15} color="#ef4444" /> : <Mic size={15} color="var(--pink-primary)" />
    );

    socketRef.current?.emit('voice:track_state', {
      isMuted: nextMuted,
      hasVideo: false
    });
  }

  function handleMicButtonClick() {
    if (!isVoiceConnected) {
      startMicrophone();
    } else {
      handleToggleMute();
    }
  }

  async function switchAudioInput(deviceId) {
    setSelectedAudioInput(deviceId);
    localStorage.setItem('wt_pref_mic', deviceId);

    if (!isVoiceConnectedRef.current) return;

    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: isMobile
          ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          : {
              deviceId: deviceId ? { ideal: deviceId } : undefined,
              echoCancellation: true,
              noiseSuppression: noiseSuppression,
              autoGainControl: true
            },
        video: false
      });

      if (rawHardwareStreamRef.current) {
        rawHardwareStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      rawHardwareStreamRef.current = newStream;

      const processedStream = setupAudioProcessing(newStream);
      localStreamRef.current = processedStream;

      const newAudioTrack = processedStream.getAudioTracks()[0] || newStream.getAudioTracks()[0];
      newAudioTrack.enabled = !isMutedRef.current;
      localAudioTrackRef.current = newAudioTrack;

      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
        if (sender) {
          sender.replaceTrack(newAudioTrack).catch(() => {});
        } else {
          try { pc.addTrack(newAudioTrack, processedStream); } catch {}
        }
      });

      showToast('Switched microphone source', <Sliders size={15} color="var(--pink-primary)" />);
    } catch (err) {
      console.warn('Failed to switch audio input:', err);
      showToast('Failed to switch mic: ' + err.message, <AlertCircle size={15} color="#ef4444" />);
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
    setNoiseSuppression(enabled);
    localStorage.setItem('wt_noise_supp', String(enabled));
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
        if (isVoiceConnectedRef.current && localAudioTrackRef.current) {
          if (isMutedRef.current) {
            isPushToTalkingRef.current = true;
            setIsPushToTalking(true);
            localAudioTrackRef.current.enabled = true;
            playAudioChirp('unmute');
            socket?.emit('voice:track_state', { isMuted: false, hasVideo: false });
          }
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
          if (isMutedRef.current) {
            localAudioTrackRef.current.enabled = false;
            playAudioChirp('mute');
            socket?.emit('voice:track_state', { isMuted: true, hasVideo: false });
          }
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
          v.play().catch(() => setNeedsUserClickToPlay(true));
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
        if (v) {
          isSeekingRef.current = true;
          v.currentTime = seconds;
          if (a && a.src) {
            a.currentTime = seconds;
          }
          setTimeout(() => { isSeekingRef.current = false; }, 200);
        }
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

    const drift = clientTime - authTime;

    // Sub-second precision threshold matrix
    if (Math.abs(drift) <= 0.35) {
      if (UnifiedPlayer.getRate() !== 1.0) {
        UnifiedPlayer.setRate(1.0);
      }
      setSyncStatus('In Sync');
      return;
    }

    if (Math.abs(drift) <= 1.8) {
      // Gentle micro rate nudging (4% speed difference) - smooth, imperceptible, zero frame skips!
      if (drift < 0) {
        UnifiedPlayer.setRate(1.04);
        setSyncStatus('Catching Up');
      } else {
        UnifiedPlayer.setRate(0.96);
        setSyncStatus('Aligning');
      }
    } else {
      // Significant drift (> 1.8s): Re-align to authoritative timestamp
      setRemoteLock(800);
      UnifiedPlayer.seek(authTime);
      UnifiedPlayer.setRate(1.0);
      setSyncStatus('In Sync');
    }
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
    });

    s.on('user:joined', ({ user, users }) => {
      if (users) {
        setConnectedUsers(users);
        connectedUsersRef.current = users;
      }
      if (isVoiceConnectedRef.current && localStreamRef.current && user && user.id !== s.id) {
        getOrCreatePeerConnection(user.id, true);
      }
      showToast(`${user.username} joined`, <Users size={15} color="var(--pink-primary)" />);
    });

    s.on('user:left', ({ userId, username, users }) => {
      if (users) {
        setConnectedUsers(users);
        connectedUsersRef.current = users;
      }
      if (userId) {
        cleanupPeer(userId);
      }
      showToast(`${username || 'User'} left the lounge`, <LogOut size={15} color="#9ca3af" />);
    });

    s.on('player:sync_heartbeat', ({ currentTime, isPlaying, playbackRate }) => {
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
        if (prev.isPlaying !== Boolean(isPlaying) || drift > 1.5) {
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
      setRemoteLock();
      showToast(`${sender} resumed`, <Play size={14} color="var(--pink-primary)" fill="currentColor" />);
      UnifiedPlayer.seek(currentTime);
      UnifiedPlayer.play();
    });

    s.on('player:sync_pause', ({ currentTime, sender }) => {
      serverSyncStateRef.current = { currentTime, isPlaying: false, playbackRate: 1.0, receivedAt: Date.now() };
      setRoomPlaybackState({ currentTime, isPlaying: false });
      setRemoteLock();
      showToast(`${sender} paused`, <Pause size={14} color="var(--pink-primary)" fill="currentColor" />);
      UnifiedPlayer.seek(currentTime);
      UnifiedPlayer.pause();
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

      // In-video floating chat pills (for non-system user messages)
      if (!msg.isSystem && msg.sender !== 'System' && msg.text) {
        const messageId = msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const item = { ...msg, id: messageId, fading: false };
        setRecentMessages((prev) => [...prev.slice(-3), item]);

        const charCount = (msg.text || '').length;
        // Dynamic reading delay: short messages fade promptly, longer sentences stay long enough to read
        const fadeDelay = Math.min(12000, Math.max(2200, 1800 + (charCount * 95)));
        const removeDelay = fadeDelay + 600;

        setTimeout(() => {
          setRecentMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, fading: true } : m));
        }, fadeDelay);

        setTimeout(() => {
          setRecentMessages((prev) => prev.filter((m) => m.id !== messageId));
        }, removeDelay);
      }
    });

    // ------------------------------------------------------------------------
    // WebRTC Native Socket.IO Mesh Signaling Handlers
    // ------------------------------------------------------------------------
    s.on('voice:peer_joined', ({ peerId, username, hasAudio }) => {
      console.log(`🎙️ Peer joined voice: ${username} (${peerId})`);
      if (isVoiceConnectedRef.current && localStreamRef.current) {
        getOrCreatePeerConnection(peerId, true);
      }
    });

    s.on('voice:signal', async ({ senderPeerId, signalData }) => {
      if (!senderPeerId || !signalData) return;
      try {
        if (signalData.desc) {
          const { desc } = signalData;
          if (desc.type === 'offer') {
            const pc = getOrCreatePeerConnection(senderPeerId, false);
            await pc.setRemoteDescription(new RTCSessionDescription(desc));

            const queued = pendingCandidatesRef.current.get(senderPeerId) || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
            pendingCandidatesRef.current.delete(senderPeerId);

            const answer = await pc.createAnswer();
            answer.sdp = boostOpusSDP(answer.sdp);
            await pc.setLocalDescription(answer);

            s.emit('voice:signal', {
              targetPeerId: senderPeerId,
              signalData: { desc: pc.localDescription }
            });
          } else if (desc.type === 'answer') {
            const pc = peerConnectionsRef.current.get(senderPeerId);
            if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription(desc));
              const queued = pendingCandidatesRef.current.get(senderPeerId) || [];
              for (const cand of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              }
              pendingCandidatesRef.current.delete(senderPeerId);
            }
          }
        } else if (signalData.candidate) {
          const pc = peerConnectionsRef.current.get(senderPeerId);
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate)).catch(() => {});
          } else {
            const list = pendingCandidatesRef.current.get(senderPeerId) || [];
            list.push(signalData.candidate);
            pendingCandidatesRef.current.set(senderPeerId, list);
          }
        }
      } catch (err) {
        console.warn('WebRTC signal handling error:', err);
      }
    });

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
      cleanupPeer(peerId);
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
    setActiveAudioIndex(0);

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
          const currentAuth = getAuthoritativeTime() || targetTime;
          if (v) {
            if (v.readyState >= 1) {
              if (Math.abs(v.currentTime - currentAuth) > 0.35) {
                v.currentTime = currentAuth;
              }
            }
            if (shouldPlay && v.paused) {
              v.play().catch(() => setNeedsUserClickToPlay(true));
            } else if (!shouldPlay && !v.paused) {
              v.pause();
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
          if (theaterCanvasRef.current?.requestFullscreen) {
            return theaterCanvasRef.current.requestFullscreen(options);
          } else if (theaterCanvasRef.current?.webkitRequestFullscreen) {
            theaterCanvasRef.current.webkitRequestFullscreen();
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

  // Cinema Video Fullscreen (fullscreen only the video canvas / player)
  function toggleVideoFullscreen() {
    if (activePlayerType === 'youtube') {
      const el = document.getElementById('react-yt-player') || theaterCanvasRef.current;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    } else if (artInstanceRef.current && activePlayerType !== 'neko') {
      try {
        if (typeof artInstanceRef.current.fullscreenToggle === 'function') {
          artInstanceRef.current.fullscreenToggle();
        } else if (typeof artInstanceRef.current.fullscreen === 'boolean') {
          artInstanceRef.current.fullscreen = !artInstanceRef.current.fullscreen;
        } else {
          const playerEl = artInstanceRef.current.template?.$player || artContainerRef.current;
          if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (playerEl?.requestFullscreen) playerEl.requestFullscreen().catch(() => {});
            else if (playerEl?.webkitRequestFullscreen) playerEl.webkitRequestFullscreen();
          } else {
            if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          }
        }
      } catch {
        const playerEl = artInstanceRef.current.template?.$player || artContainerRef.current || theaterCanvasRef.current;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          if (playerEl?.requestFullscreen) playerEl.requestFullscreen().catch(() => {});
          else if (playerEl?.webkitRequestFullscreen) playerEl.webkitRequestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
      }
    } else {
      const el = theaterCanvasRef.current;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    }
  }

  useEffect(() => {
    function handleGlobalKeyDown(e) {
      const activeEl = document.activeElement;
      const isInInput = activeEl && (
        activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable
      );

      if (isInInput) {
        resetChatInactivityTimer();
        if (e.key === 'Escape') {
          e.preventDefault();
          setChatOpen(false);
          setChatInputText('');
          setShowAudioPopover(false);
          setShowSubtitlePopover(false);
          activeEl.blur();
        }
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
          setChatOpen(true);
          resetChatInactivityTimer();
          setTimeout(() => {
            if (chatInputRef.current) chatInputRef.current.focus();
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
  }, [activePlayerType]);

  function handleSendChat(e) {
    if (e) e.preventDefault();
    if (chatFadeTimerRef.current) clearTimeout(chatFadeTimerRef.current);
    const text = chatInputText.trim();
    if (!text || !socket) {
      setChatOpen(false);
      setChatInputText('');
      if (activePlayerType === 'neko') {
        setTimeout(() => nekoIframeRef.current?.focus?.(), 50);
      }
      return;
    }

    socket.emit('chat:send_message', { text });
    setChatInputText('');
    setChatOpen(false);
    if (activePlayerType === 'neko') {
      setTimeout(() => nekoIframeRef.current?.focus?.(), 50);
    }
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
          bottom: (isTheaterFullscreen || activePlayerType === 'neko') ? (chatOpen ? '20px' : '64px') : '72px'
        }}
      >
        <div className="floating-chat-bubbles-stack">
          {recentMessages.map((m) => (
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
          ))}
        </div>

        {chatOpen && (
          <form onSubmit={handleSendChat} className="floating-glass-chat-bar">
            <UserAvatar user={currentProfile} size={24} showBorder={true} />
            <input
              ref={chatInputRef}
              type="text"
              value={chatInputText}
              onChange={(e) => {
                setChatInputText(e.target.value);
                resetChatInactivityTimer();
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

    if (artPlayerDomEl && activePlayerType !== 'youtube' && activePlayerType !== 'neko') {
      return ReactDOM.createPortal(overlay, artPlayerDomEl);
    }
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

  // Voice & Mic Settings Popover (Obsidian Neon HUD Studio Panel)
  function renderVoiceSettingsPopover() {
    if (!showVoiceSettings) return null;

    const popover = (
      <div
        className="pouf-popover-shell"
        style={{
          position: 'absolute',
          bottom: '76px',
          right: '80px',
          width: '380px',
          maxHeight: '82vh',
          overflowY: 'auto',
          background: 'rgba(14, 11, 20, 0.96)',
          backdropFilter: 'blur(28px)',
          border: '1px solid rgba(244, 114, 182, 0.28)',
          borderRadius: '20px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85), 0 0 24px rgba(244, 114, 182, 0.12)',
          padding: '1.2rem',
          zIndex: 65,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.65rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.95rem', color: '#fbcfe8' }}>
            <Settings size={16} color="var(--pink-primary)" />
            <span>Voice & Audio Studio</span>
          </div>
          <button
            onClick={() => setShowVoiceSettings(false)}
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '2px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Bluetooth Headphone Notice (The exact fix for user's problem) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05))',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          borderRadius: '12px',
          padding: '10px 12px',
          fontSize: '0.78rem',
          color: '#fef3c7'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#fbbf24', marginBottom: '4px' }}>
            <Headphones size={15} color="#fbbf24" />
            <span>Bluetooth Headphone Pro-Tip:</span>
          </div>
          <p style={{ margin: 0, lineHeight: 1.45, color: '#f3f4f6' }}>
            To keep crystal-clear stereo movie sound, choose your <strong>Laptop or USB Mic</strong> below instead of your Bluetooth headset mic. This prevents Windows from switching your headphones to low-bitrate telephone audio!
          </p>
        </div>

        {/* Microphone Sourcing List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#fbcfe8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Select Active Microphone
            </label>
            <button
              type="button"
              onClick={refreshMediaDevices}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--pink-primary)',
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Rescan microphones"
            >
              <RotateCcw size={11} /> Rescan
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
            {audioInputDevices.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                Default System Microphone
              </div>
            ) : (
              audioInputDevices.map((dev, idx) => {
                const isSelected = dev.deviceId === selectedAudioInput;
                const cleanLabel = dev.label || `Microphone ${idx + 1}`;
                return (
                  <div
                    key={dev.deviceId || idx}
                    onClick={() => switchAudioInput(dev.deviceId)}
                    className={`pouf-item-card ${isSelected ? 'active' : ''}`}
                    style={{ cursor: 'pointer', padding: '8px 12px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <Mic size={14} color={isSelected ? 'var(--pink-primary)' : 'rgba(255,255,255,0.5)'} />
                      <span style={{ fontSize: '0.82rem', fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cleanLabel}
                      </span>
                    </div>
                    {isSelected ? (
                      <span className="pouf-badge-active">ACTIVE</span>
                    ) : (
                      <span className="pouf-badge-codec">SELECT</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Audio Output Dropdown (Headphones / Speakers) */}
        {audioOutputDevices.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Voice Audio Output (Headphones / Speakers)
            </label>
            <select
              value={selectedAudioOutput}
              onChange={(e) => switchAudioOutput(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#fff',
                border: '1px solid rgba(244, 114, 182, 0.3)',
                fontSize: '0.82rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {audioOutputDevices.map((dev, idx) => (
                <option key={dev.deviceId} value={dev.deviceId} style={{ background: '#170f20', color: '#fff' }}>
                  {dev.label || `Speaker/Headphone ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Studio Noise Gate & Filter (with Intensity Slider & VU Meter) */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(244, 114, 182, 0.2)',
          borderRadius: '14px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {/* Noise Section Header & Dynamic Gate Status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sliders size={13} color="var(--pink-primary)" />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#fbcfe8' }}>
                Noise Filter & Gate
              </span>
            </div>
            <span className={noiseIntensity === 0 ? 'pouf-badge-codec' : isNoiseGateOpen ? 'pouf-badge-active' : 'pouf-badge-ready'}>
              {noiseIntensity === 0 ? 'BYPASS (0%)' : isNoiseGateOpen ? 'GATE OPEN' : 'GATE MUTED'}
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#9ca3af', lineHeight: 1.35 }}>
            Silences laptop fan roar, AC rumble, and room hiss when you are not speaking.
          </div>

          {/* Live VU Audio Level Meter with Threshold Marker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem', color: 'rgba(255,255,255,0.6)' }}>
              <span>Live Mic Energy</span>
              <span style={{ fontFamily: 'monospace', color: isNoiseGateOpen ? '#34d399' : '#94a3b8' }}>
                {Math.round(micLevel)}%
              </span>
            </div>
            <div className="pouf-vu-track" style={{ position: 'relative' }}>
              <div
                className="pouf-vu-fill"
                style={{
                  width: `${Math.min(100, micLevel)}%`,
                  background: isNoiseGateOpen
                    ? 'linear-gradient(90deg, #10b981 0%, #34d399 50%, #f472b6 85%, #ec4899 100%)'
                    : 'linear-gradient(90deg, #64748b 0%, #94a3b8 100%)'
                }}
              />
              {noiseIntensity > 0 && (
                <div
                  className="pouf-vu-threshold"
                  style={{ left: `${noiseIntensity}%` }}
                  title={`Threshold: ${noiseIntensity}%`}
                />
              )}
            </div>
          </div>

          {/* Intensity Slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem' }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Filter Intensity:</span>
              <span style={{ color: 'var(--pink-primary)', fontWeight: 800, fontFamily: 'monospace' }}>
                {noiseIntensity === 0 ? '0% (Disabled)' : `${noiseIntensity}%`}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={noiseIntensity}
              onChange={(e) => handleNoiseIntensityChange(e.target.value)}
              className="pouf-slider-pink"
            />
          </div>

          {/* Quick Preset Buttons */}
          <div className="pouf-tab-bar" style={{ display: 'flex', gap: '4px', width: '100%', marginTop: '2px' }}>
            {[
              { label: 'Off', val: 0 },
              { label: 'Light', val: 25 },
              { label: 'Standard', val: 50 },
              { label: 'Max', val: 85 }
            ].map((p) => (
              <button
                key={p.val}
                type="button"
                onClick={() => handleNoiseIntensityChange(p.val)}
                className={`pouf-tab-item ${noiseIntensity === p.val ? 'active' : ''}`}
                style={{ flex: 1, padding: '5px 0', fontSize: '0.72rem' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Audio Quality Preset Toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Voice Transmission Profile
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={studioAudioMode}
              onChange={(e) => toggleStudioAudioMode(e.target.checked)}
              style={{ accentColor: 'var(--pink-primary)', width: '16px', height: '16px' }}
            />
            <div>
              <span style={{ fontWeight: 700, color: '#fff' }}>Studio Opus (128 kbps)</span>
              <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Broadcast-grade high bitrate voice codec for natural warmth.</div>
            </div>
          </label>
        </div>

        {/* Hotkeys Cheatsheet */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '10px',
          padding: '8px 12px',
          fontSize: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <div style={{ fontWeight: 800, color: '#fbbf24', marginBottom: '2px' }}>Hotkeys:</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#d1d5db' }}>Hold Key <strong>'V'</strong>:</span>
            <span style={{ color: '#34d399', fontWeight: 700 }}>Push-to-Talk</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#d1d5db' }}>Press Key <strong>'M'</strong>:</span>
            <span style={{ color: '#fbcfe8', fontWeight: 700 }}>Toggle Mute</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#d1d5db' }}>Press Key <strong>'C'</strong>:</span>
            <span style={{ color: '#fbcfe8', fontWeight: 700 }}>Lounge Chat</span>
          </div>
        </div>

        {/* Connect / Disconnect Voice Button */}
        {isVoiceConnected ? (
          <button
            onClick={leaveVoiceChat}
            style={{
              padding: '8px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              color: '#fca5a5',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <MicOff size={14} color="#fca5a5" />
            <span>Turn Off Microphone</span>
          </button>
        ) : (
          <button
            onClick={() => startMicrophone()}
            className="btn-pink-primary"
            style={{ padding: '8px', fontSize: '0.82rem', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Mic size={14} color="#ffffff" />
            <span>Turn On Microphone</span>
          </button>
        )}
      </div>
    );

    const mountTarget = (artPlayerDomEl && activePlayerType !== 'youtube' && activePlayerType !== 'neko')
      ? artPlayerDomEl
      : theaterCanvasRef.current;

    if (mountTarget) {
      return ReactDOM.createPortal(popover, mountTarget);
    }
    return popover;
  }

  return (
    <div className={`theater-view-wrapper ${isChitChatMode ? 'chit-chat-mode' : (isChatSidebarOpen ? 'chat-expanded' : '')} ${isChatCollapsed ? 'chat-collapsed' : ''}`}>
      {/* Hidden WebRTC Remote Audio Hub */}
      <div id="wt-remote-audio-hub" style={{ display: 'none' }} aria-hidden="true" />

      {/* Left Column: Video Stage + Bottom Control Deck */}
      <div className={`theater-stage-column ${(isChitChatMode && isChatCollapsed) ? 'full-width' : ''}`}>
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

        {/* Floating Exit Chit Chat Mode Button */}
        {isChitChatMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleExitChitChat();
            }}
            className="chit-chat-exit-pill"
            title="Exit Chit Chat Mode (or press Esc)"
          >
            <Minimize size={14} color="#f472b6" />
            <span>Exit Chit Chat</span>
          </button>
        )}

        {/* Browser Autoplay Block Overlay */}
        {needsUserClickToPlay && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setNeedsUserClickToPlay(false);
              setRemoteLock(3000);
              const targetTime = getAuthoritativeTime();
              UnifiedPlayer.seek(targetTime);
              UnifiedPlayer.play();
              if (socket) {
                socket.emit('sync:request');
              }
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(255, 240, 246, 0.75)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99,
              cursor: 'pointer'
            }}
          >
            <div className="btn-gold-shimmer" style={{ padding: '1rem 2.25rem', fontSize: '1.05rem', borderRadius: '9999px', gap: '10px' }}>
              <Play size={22} fill="currentColor" />
              <span>Tap to start watching in sync with {currentProfile.name === 'Het' ? 'Ria' : 'Het'}</span>
            </div>
          </div>
        )}

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
            onPlay={() => {
              if (isRemoteActionRef.current) return;
              if (socket) {
                const video = document.querySelector('.pouf-player-container video');
                const t = video ? video.currentTime : (serverSyncStateRef.current.currentTime || 0);
                socket.emit('player:play', { currentTime: t });
              }
            }}
            onPause={() => {
              if (isRemoteActionRef.current) return;
              if (socket) {
                const video = document.querySelector('.pouf-player-container video');
                const t = video ? video.currentTime : (serverSyncStateRef.current.currentTime || 0);
                socket.emit('player:pause', { currentTime: t });
              }
            }}
            onSeek={(t) => {
              if (isRemoteActionRef.current) return;
              if (socket) {
                socket.emit('player:seek', { currentTime: t });
              }
            }}
            onForceSyncAll={() => handleForceSync()}
            onToggleChat={() => {
              setIsChitChatMode((prev) => {
                const next = !prev;
                if (next) {
                  setIsChatCollapsed(false);
                  setIsChatSidebarOpen(false);
                  handleMarkChatSeen();
                }
                return next;
              });
            }}
            viewerCount={connectedUsers.length || 1}
            isHost={isHost}
            canControl={true}
          />
        </div>
        )}

        {/* Floating Chat Overlay (auto-fades in 5s) */}
        {renderChatOverlay()}

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

        {/* Voice Settings Popover renders inside canvas */}

        {renderVoiceSettingsPopover()}
      </div>

      {/* Glittering Pink Theater Control Deck (Bottom bar) */}
      <div className="theater-deck">
        <div className="theater-deck-row" style={{ position: 'relative' }}>
          {/* Main Force Sync Button */}
          <button
            onClick={handleForceSync}
            className="btn-gold-shimmer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '0.52rem 1.15rem',
              fontSize: '0.84rem',
              fontWeight: 800
            }}
            title="Snap both users to exact timestamp"
          >
            <ClaySparkle size={18} />
            <span>Sync Both</span>
          </button>

          {/* Choose / Change Media */}
          <button
            onClick={() => setCreateModalOpen(true)}
            className="btn-pink-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '0.52rem 1rem', fontSize: '0.82rem' }}
          >
            <ClayPopcorn size={18} />
            <span>Change Media</span>
          </button>

          {/* Media Library */}
          <button
            onClick={openLibrary}
            className="btn-pink-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '0.52rem 0.95rem', fontSize: '0.82rem' }}
          >
            <ClayFolder size={18} />
            <span>Library</span>
          </button>

          {/* Subtitles Button */}
          <button
            onClick={() => {
              setShowSubtitlePopover((prev) => !prev);
              setShowAudioPopover(false);
              setShowVoiceSettings(false);
            }}
            className={`btn-pink-secondary ${showSubtitlePopover ? 'active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.52rem 0.95rem',
              fontSize: '0.82rem',
              background: showSubtitlePopover ? 'rgba(244, 114, 182, 0.25)' : undefined,
              borderColor: showSubtitlePopover ? 'var(--pink-primary)' : undefined
            }}
            title="Subtitle Tracks & Settings"
          >
            <Type size={14} color="var(--pink-primary)" />
            <span>Subs {subtitleTracks.length > 0 ? `(${subtitleTracks.length})` : ''}</span>
          </button>

          {/* Audio Tracks Button */}
          <button
            onClick={() => {
              setShowAudioPopover((prev) => !prev);
              setShowSubtitlePopover(false);
              setShowVoiceSettings(false);
            }}
            className={`btn-pink-secondary ${showAudioPopover ? 'active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.52rem 0.95rem',
              fontSize: '0.82rem',
              background: showAudioPopover ? 'rgba(244, 114, 182, 0.25)' : undefined,
              borderColor: showAudioPopover ? 'var(--pink-primary)' : undefined
            }}
            title="Audio Tracks"
          >
            <Volume2 size={14} color="var(--pink-primary)" />
            <span>Audio {audioTracks.length > 0 ? `(${audioTracks.length})` : ''}</span>
          </button>

          {/* Smart Voice / Microphone Button */}
          <button
            onClick={handleMicButtonClick}
            className={`btn-pink-secondary ${isVoiceConnected && !isMuted ? 'active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.52rem 0.95rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              background: !isVoiceConnected
                ? 'rgba(244, 114, 182, 0.08)'
                : isLocalSpeaking && !isMuted
                  ? 'rgba(236, 72, 153, 0.35)'
                  : isMuted
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(236, 72, 153, 0.2)',
              borderColor: !isVoiceConnected
                ? 'rgba(244, 114, 182, 0.25)'
                : isLocalSpeaking && !isMuted
                  ? 'var(--pink-primary)'
                  : isMuted
                    ? 'rgba(239, 68, 68, 0.5)'
                    : 'var(--pink-primary)',
              color: !isVoiceConnected
                ? '#f472b6'
                : isMuted
                  ? '#fca5a5'
                  : '#fff',
              boxShadow: isLocalSpeaking && !isMuted
                ? '0 0 16px rgba(236, 72, 153, 0.6)'
                : (isVoiceConnected && !isMuted)
                  ? '0 0 10px rgba(236, 72, 153, 0.3)'
                  : undefined
            }}
            title={
              !isVoiceConnected
                ? "Turn Mic On (Press 'M')"
                : isMuted
                  ? "Microphone Muted - Click or Press 'M' to Speak (or hold 'V')"
                  : "Microphone Live - Click or Press 'M' to Mute"
            }
          >
            {!isVoiceConnected ? (
              <>
                <Mic size={14} color="#f472b6" />
                <span>Mic Off (M)</span>
              </>
            ) : isMuted ? (
              <>
                <MicOff size={14} color="#ef4444" />
                <span>Muted (M)</span>
              </>
            ) : (
              <>
                <Mic size={14} color="#ec4899" />
                <span>{isLocalSpeaking ? 'Speaking' : 'Mic Live'}</span>
              </>
            )}
          </button>

          {/* Dedicated Mic Device Pill & Audio Settings */}
          <button
            onClick={() => {
              setShowVoiceSettings((prev) => {
                const next = !prev;
                if (next) refreshMediaDevices();
                return next;
              });
              setShowSubtitlePopover(false);
              setShowAudioPopover(false);
            }}
            className={`btn-pink-secondary ${showVoiceSettings ? 'active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.52rem 0.85rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: showVoiceSettings ? 'rgba(244, 114, 182, 0.25)' : undefined,
              borderColor: showVoiceSettings ? 'var(--pink-primary)' : undefined,
              maxWidth: '220px'
            }}
            title="Click to Choose / Switch Microphone (Audio Hardware & Bluetooth Quality)"
          >
            <Sliders size={13} color="var(--pink-primary)" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {audioInputDevices.find((d) => d.deviceId === selectedAudioInput)?.label?.split('(')[0]?.trim() || 'Select Mic'}
            </span>
            <ChevronDown size={12} color="var(--pink-primary)" />
          </button>

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
            onClick={handleEnterChitChat}
            className={isChitChatMode ? 'btn-pink-primary' : 'btn-pink-secondary'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '0.52rem 1.05rem',
              fontSize: '0.84rem',
              position: 'relative'
            }}
            title="Toggle Chit Chat Split Screen (Video + Full Chat Sidebar)"
          >
            <ClayChat size={18} />
            <span>Chit Chat Mode</span>
            {unreadChatCount > 0 && (
              <span className="clay-unread-badge" style={{ marginLeft: '4px' }}>
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* SINGLE Theater Fullscreen Button (Clean & Aesthetic) */}
          <button
            onClick={toggleVideoFullscreen}
            className="btn-pink-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.52rem 0.95rem', fontSize: '0.82rem' }}
            title="Toggle Fullscreen (Shortcut: F)"
          >
            <Maximize size={14} color="var(--pink-primary)" />
            <span>Fullscreen (F)</span>
          </button>
        </div>

        {/* Deck Bottom Status Bar */}
        <div className="theater-deck-between" style={{ marginTop: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden', maxWidth: '70%' }}>
            <span className="btn-pink-chip" style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--pink-primary)', fontWeight: 800 }}>
              {activePlayerType}
            </span>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentTitle}
            </span>
          </div>

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

      {/* CHIT CHAT MODE: Full-Height Dedicated Sidebar Beside Video Screen */}
      {isChitChatMode && !isChatCollapsed && (
        <div className="theater-chat-sidebar-container">
          <ChatSidebar
            isOpen={true}
            isCollapsible={true}
            isCollapsed={false}
            onToggleCollapse={() => setIsChatCollapsed(true)}
            messages={chatMessages}
            onSendMessage={(text) => {
              socket?.emit('chat:send_message', { text, isDanmaku: true });
            }}
            currentProfile={currentProfile}
            connectedUsers={connectedUsers}
            lastSeen={roomLastSeen}
            onMarkSeen={handleMarkChatSeen}
          />
        </div>
      )}

      {/* Floating Re-open Tab when Chit Chat is Collapsed */}
      {isChitChatMode && isChatCollapsed && (
        <button
          onClick={() => {
            setIsChatCollapsed(false);
            handleMarkChatSeen();
          }}
          className="clay-chat-reopen-tab"
          title="Open Chit Chat"
        >
          <ClayArrow direction="left" size={16} />
          <span>Chat</span>
          {unreadChatCount > 0 && (
            <span className="clay-unread-badge" style={{ marginLeft: '4px' }}>
              {unreadChatCount}
            </span>
          )}
        </button>
      )}

      {/* Non-Chit Chat Mode: Standard Drawer Sidebar */}
      {!isChitChatMode && isChatSidebarOpen && (
        <ChatSidebar
          isOpen={isChatSidebarOpen}
          onClose={() => setIsChatSidebarOpen(false)}
          messages={chatMessages}
          onSendMessage={(text) => {
            socket?.emit('chat:send_message', { text, isDanmaku: true });
          }}
          currentProfile={currentProfile}
          connectedUsers={connectedUsers}
          lastSeen={roomLastSeen}
          onMarkSeen={handleMarkChatSeen}
        />
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
    </div>
  );
}
