// Watch Together - Room Synchronization, Danmaku, WebRTC Voice & Media Engine

(function () {
  'use strict';

  // 1. Room ID & User Identity
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let roomId = 'main';
  if (pathParts.length >= 2 && pathParts[0] === 'room') {
    roomId = pathParts[1].toLowerCase();
  }

  // Parse query params (e.g. ?media=...&title=...)
  const urlParams = new URLSearchParams(window.location.search);
  const initialMediaParam = urlParams.get('media');
  const initialTitleParam = urlParams.get('title');

  const currentUsername = localStorage.getItem('wt_username') || 'Prince';
  const userAvatar = localStorage.getItem('wt_avatar') || '👑';
  const userColor = localStorage.getItem('wt_color') || '#6366f1';

  // DOM Elements
  const roomNameDisplay = document.getElementById('room-name-display');
  const usernameDisplay = document.getElementById('username-display');
  const avatarDot = document.getElementById('avatar-dot');
  const syncStatus = document.getElementById('sync-status');
  const syncStatusText = document.getElementById('sync-status-text');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const mediaUrlInput = document.getElementById('media-url-input');
  const btnPlayNow = document.getElementById('btn-play-now');
  const btnAddQueue = document.getElementById('btn-add-queue');
  const btnManualSync = document.getElementById('btn-manual-sync');
  const currentMediaTitle = document.getElementById('current-media-title');
  const currentMediaType = document.getElementById('current-media-type');
  const danmakuContainer = document.getElementById('danmaku-container');
  const reactionsOverlay = document.getElementById('reactions-overlay');
  const playerToast = document.getElementById('player-toast');
  const toastMessage = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');
  const globalToast = document.getElementById('global-toast');
  const toastText = document.getElementById('toast-text');

  // Controls & Toggles
  const btnToggleDanmaku = document.getElementById('btn-toggle-danmaku');
  const btnToggleChat = document.getElementById('btn-toggle-chat');
  const chatUnreadBadge = document.getElementById('chat-unread-badge');
  const btnScreenshot = document.getElementById('btn-screenshot');
  const btnToggleHost = document.getElementById('btn-toggle-host');
  const hostModeLabel = document.getElementById('host-mode-label');

  // WebRTC Voice
  const btnToggleVoice = document.getElementById('btn-toggle-voice');
  const voiceIcon = document.getElementById('voice-icon');
  const voiceLabel = document.getElementById('voice-label');
  const voicePeersIndicator = document.getElementById('voice-peers-indicator');
  const voicePeerName = document.getElementById('voice-peer-name');

  // Slide Drawer
  const slideDrawer = document.getElementById('slide-drawer');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const drawerTabButtons = document.querySelectorAll('.drawer-tab-btn');
  const drawerContents = document.querySelectorAll('.drawer-content');
  const chatFeed = document.getElementById('chat-feed');
  const drawerChatForm = document.getElementById('drawer-chat-form');
  const drawerChatInput = document.getElementById('drawer-chat-input');
  const drawerQueueList = document.getElementById('drawer-queue-list');
  const queueCount = document.getElementById('queue-count');
  const userCount = document.getElementById('user-count');
  const drawerUsersList = document.getElementById('drawer-users-list');
  const btnSkipNext = document.getElementById('btn-skip-next');

  // Players
  const ytPlayerContainer = document.getElementById('yt-player-container');
  const html5PlayerContainer = document.getElementById('html5-player-container');
  const html5Video = document.getElementById('html5-video');
  const html5SubtitleTrack = document.getElementById('html5-subtitle-track');
  const subFileInput = document.getElementById('sub-file-input');

  // Modals
  const screenshotModal = document.getElementById('screenshot-modal');
  const screenshotImg = document.getElementById('screenshot-img');
  const btnCloseScreenshot = document.getElementById('btn-close-screenshot');
  const btnDownloadScreenshot = document.getElementById('btn-download-screenshot');
  const btnShareScreenshot = document.getElementById('btn-share-screenshot');

  const libraryPickerModal = document.getElementById('library-picker-modal');
  const libraryPickerList = document.getElementById('library-picker-list');
  const btnOpenLibraryModal = document.getElementById('btn-open-library-modal');
  const btnCloseLibraryModal = document.getElementById('btn-close-library-modal');

  // Update Top Nav
  roomNameDisplay.textContent = roomId;
  usernameDisplay.textContent = currentUsername;
  avatarDot.textContent = userAvatar;
  avatarDot.style.backgroundColor = userColor;

  // 2. Connect to Socket.IO
  const socket = io({
    path: '/api/v1/sync',
    transports: ['websocket', 'polling']
  });

  // State Variables
  let isRemoteAction = false;
  let remoteActionTimer = null;
  let activePlayerType = 'youtube'; // 'youtube' | 'direct' | 'hls'
  let ytPlayer = null;
  let isYtReady = false;
  let hlsInstance = null;
  let currentRoomState = null;
  let isHost = false;
  let danmakuEnabled = true;
  let currentScreenshotData = null;

  // WebRTC Voice State
  let localStream = null;
  let peerConnection = null;
  let remoteAudio = null;
  let isInVoice = false;

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  function setRemoteActionLock(duration = 700) {
    isRemoteAction = true;
    if (remoteActionTimer) clearTimeout(remoteActionTimer);
    remoteActionTimer = setTimeout(() => {
      isRemoteAction = false;
    }, duration);
  }

  function showPlayerToast(text, icon = '⚡') {
    if (!playerToast) return;
    toastMessage.textContent = text;
    toastIcon.textContent = icon;
    playerToast.classList.add('active');
    setTimeout(() => {
      playerToast.classList.remove('active');
    }, 2800);
  }

  function showGlobalToast(text) {
    if (!globalToast) return;
    toastText.textContent = text;
    globalToast.classList.add('show');
    setTimeout(() => {
      globalToast.classList.remove('show');
    }, 2500);
  }

  // 3. YouTube Player Setup
  window.onYouTubeIframeAPIReady = function () {
    ytPlayer = new YT.Player('yt-player', {
      height: '100%',
      width: '100%',
      videoId: '5qap5aO4i9A',
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: onYtReady,
        onStateChange: onYtStateChange
      }
    });
  };

  if (!window.YT) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  function onYtReady() {
    isYtReady = true;
    if (currentRoomState && currentRoomState.media.type === 'youtube') {
      applyMediaChange(currentRoomState.media, currentRoomState.playback);
    }
  }

  function onYtStateChange(event) {
    if (isRemoteAction) return;

    if (event.data === YT.PlayerState.PLAYING) {
      socket.emit('player:play', { currentTime: ytPlayer.getCurrentTime() });
    } else if (event.data === YT.PlayerState.PAUSED) {
      socket.emit('player:pause', { currentTime: ytPlayer.getCurrentTime() });
    } else if (event.data === YT.PlayerState.ENDED) {
      socket.emit('queue:play_next');
    }
  }

  // HTML5 Video Player Listeners
  html5Video.addEventListener('play', () => {
    if (activePlayerType !== 'youtube' && !isRemoteAction) {
      socket.emit('player:play', { currentTime: html5Video.currentTime });
    }
  });

  html5Video.addEventListener('pause', () => {
    if (activePlayerType !== 'youtube' && !isRemoteAction) {
      socket.emit('player:pause', { currentTime: html5Video.currentTime });
    }
  });

  html5Video.addEventListener('seeked', () => {
    if (activePlayerType !== 'youtube' && !isRemoteAction) {
      socket.emit('player:seek', { currentTime: html5Video.currentTime });
    }
  });

  html5Video.addEventListener('ended', () => {
    if (activePlayerType !== 'youtube' && !isRemoteAction) {
      socket.emit('queue:play_next');
    }
  });

  // Unified Player Interface
  const UnifiedPlayer = {
    play() {
      if (activePlayerType === 'youtube') {
        if (isYtReady && ytPlayer && ytPlayer.playVideo) ytPlayer.playVideo();
      } else {
        html5Video.play().catch(() => {});
      }
    },
    pause() {
      if (activePlayerType === 'youtube') {
        if (isYtReady && ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
      } else {
        html5Video.pause();
      }
    },
    seekTo(seconds) {
      if (activePlayerType === 'youtube') {
        if (isYtReady && ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(seconds, true);
      } else {
        html5Video.currentTime = seconds;
      }
    },
    getCurrentTime() {
      if (activePlayerType === 'youtube') {
        return (isYtReady && ytPlayer && ytPlayer.getCurrentTime) ? ytPlayer.getCurrentTime() : 0;
      } else {
        return html5Video.currentTime || 0;
      }
    },
    setPlaybackRate(rate) {
      if (activePlayerType === 'youtube') {
        if (isYtReady && ytPlayer && ytPlayer.setPlaybackRate) ytPlayer.setPlaybackRate(rate);
      } else {
        html5Video.playbackRate = rate;
      }
    }
  };

  // Switch Active Player
  function switchPlayerType(type, media) {
    activePlayerType = type;
    if (type === 'youtube') {
      html5PlayerContainer.style.display = 'none';
      ytPlayerContainer.style.display = 'block';
      html5Video.pause();
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
      if (isYtReady && ytPlayer && media.videoId) {
        ytPlayer.loadVideoById(media.videoId);
      }
    } else {
      ytPlayerContainer.style.display = 'none';
      html5PlayerContainer.style.display = 'block';
      if (isYtReady && ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();

      if (type === 'hls') {
        if (Hls.isSupported()) {
          if (hlsInstance) hlsInstance.destroy();
          hlsInstance = new Hls({ enableWorker: true });
          hlsInstance.loadSource(media.url);
          hlsInstance.attachMedia(html5Video);
        } else if (html5Video.canPlayType('application/vnd.apple.mpegurl')) {
          html5Video.src = media.url;
        }
      } else {
        if (hlsInstance) {
          hlsInstance.destroy();
          hlsInstance = null;
        }
        html5Video.src = media.url;
      }
    }
  }

  function applyMediaChange(media, playback) {
    if (!media) return;
    currentMediaType.textContent = media.type.toUpperCase();
    currentMediaType.className = `media-type-tag ${media.type}`;
    currentMediaTitle.textContent = media.title || media.url;

    setRemoteActionLock(1200);
    switchPlayerType(media.type, media);

    setTimeout(() => {
      if (playback) {
        UnifiedPlayer.seekTo(playback.currentTime || 0);
        if (playback.isPlaying) UnifiedPlayer.play();
        else UnifiedPlayer.pause();
      }
    }, 400);
  }

  // 4. Join Room & Socket Handlers
  socket.emit('room:join', {
    roomId,
    username: currentUsername,
    color: userColor,
    avatar: userAvatar
  });

  socket.on('room:initial_state', (state) => {
    currentRoomState = state;
    isHost = state.currentUser?.isHost || false;
    updateHostUI(state.settings?.hostOnlyControls);
    renderUsers(state.users);
    renderQueue(state.queue);
    renderMessages(state.messages);

    // If initial query params provided by Home page, apply them
    if (initialMediaParam) {
      socket.emit('media:change', { url: initialMediaParam, title: initialTitleParam || 'Selected Media' });
    } else {
      applyMediaChange(state.media, state.playback);
    }

    showPlayerToast(`Joined room "${state.roomId}" 🍿`, '✨');
  });

  socket.on('user:joined', ({ user, users }) => {
    renderUsers(users);
    showPlayerToast(`${user.avatar} ${user.username} joined!`, '👋');
  });

  socket.on('user:left', ({ username, users }) => {
    renderUsers(users);
    if (username) showPlayerToast(`${username} left`, '🚪');
  });

  socket.on('host:changed', ({ newHostId, newHostName }) => {
    isHost = (socket.id === newHostId);
    showPlayerToast(`${newHostName} is now host`, '👑');
  });

  socket.on('player:sync_play', ({ currentTime, sender }) => {
    setRemoteActionLock();
    showPlayerToast(`${sender} resumed`, '▶️');
    if (typeof currentTime === 'number') {
      const current = UnifiedPlayer.getCurrentTime();
      if (Math.abs(current - currentTime) > 0.8) UnifiedPlayer.seekTo(currentTime);
    }
    UnifiedPlayer.play();
  });

  socket.on('player:sync_pause', ({ currentTime, sender }) => {
    setRemoteActionLock();
    showPlayerToast(`${sender} paused`, '⏸️');
    if (typeof currentTime === 'number') UnifiedPlayer.seekTo(currentTime);
    UnifiedPlayer.pause();
  });

  socket.on('player:sync_seek', ({ currentTime, isPlaying, sender }) => {
    setRemoteActionLock();
    showPlayerToast(`${sender} scrubbed to ${formatTime(currentTime)}`, '⏩');
    UnifiedPlayer.seekTo(currentTime);
    if (isPlaying) UnifiedPlayer.play();
    else UnifiedPlayer.pause();
  });

  socket.on('player:sync_rate', ({ playbackRate }) => {
    setRemoteActionLock();
    UnifiedPlayer.setPlaybackRate(playbackRate);
    showPlayerToast(`Speed: ${playbackRate}x`, '⚡');
  });

  socket.on('media:changed', ({ media, playback, changedBy }) => {
    showPlayerToast(`${changedBy} loaded: "${media.title}"`, '🎬');
    applyMediaChange(media, playback);
  });

  socket.on('sync:drift', ({ currentTime, isPlaying }) => {
    const local = UnifiedPlayer.getCurrentTime();
    const drift = Math.abs(local - currentTime);

    if (drift < 0.5) {
      syncStatusText.textContent = 'In Sync';
      syncStatus.querySelector('.status-dot').className = 'status-dot';
    } else if (drift < 1.4) {
      syncStatusText.textContent = `Drift: ${drift.toFixed(1)}s`;
      syncStatus.querySelector('.status-dot').className = 'status-dot';
    } else {
      syncStatusText.textContent = `Syncing (${drift.toFixed(1)}s)...`;
      syncStatus.querySelector('.status-dot').className = 'status-dot syncing';
      setRemoteActionLock();
      UnifiedPlayer.seekTo(currentTime);
      if (isPlaying) UnifiedPlayer.play();
    }
  });

  socket.on('player:sync_forced', ({ currentTime, isPlaying }) => {
    setRemoteActionLock();
    UnifiedPlayer.seekTo(currentTime);
    if (isPlaying) UnifiedPlayer.play();
    showPlayerToast(`Snapped to ${formatTime(currentTime)}`, '🎯');
    syncStatusText.textContent = 'In Sync';
  });

  // 5. Danmaku / Bullet Comments Engine
  function createDanmakuBullet(text, sender, color) {
    if (!danmakuEnabled || !danmakuContainer || !text) return;

    const el = document.createElement('div');
    el.className = 'danmaku-bullet';
    el.style.color = color || '#fff';
    el.textContent = `${sender}: ${text}`;

    // Random vertical tier across top 30% of video
    const randomTop = 8 + Math.floor(Math.random() * 24);
    el.style.top = `${randomTop}%`;

    danmakuContainer.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 8500);
  }

  btnToggleDanmaku.addEventListener('click', () => {
    danmakuEnabled = !danmakuEnabled;
    btnToggleDanmaku.classList.toggle('active-icon', danmakuEnabled);
    showGlobalToast(danmakuEnabled ? 'Danmaku enabled 💬' : 'Danmaku disabled 🔕');
  });

  // 6. Floating Emoji Reactions Spam Physics Engine
  document.querySelectorAll('.spam-emoji-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      socket.emit('reaction:send', { emoji });
    });
  });

  socket.on('reaction:received', ({ emoji }) => {
    createFloatingReaction(emoji);
  });

  function createFloatingReaction(emoji) {
    if (!reactionsOverlay) return;
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = emoji;

    // Randomize trajectory across the bottom
    const randomLeft = 10 + Math.random() * 80;
    el.style.left = `${randomLeft}%`;

    reactionsOverlay.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 2600);
  }

  // 7. Slide-Over Chat & Drawer
  function toggleDrawer(open) {
    if (typeof open === 'boolean') {
      slideDrawer.classList.toggle('open', open);
    } else {
      slideDrawer.classList.toggle('open');
    }
    if (slideDrawer.classList.contains('open')) {
      chatUnreadBadge.style.display = 'none';
      drawerChatInput.focus();
    }
  }

  btnToggleChat.addEventListener('click', () => toggleDrawer());
  btnCloseDrawer.addEventListener('click', () => toggleDrawer(false));

  // Hotkey 'C' for chat drawer
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      toggleDrawer();
    }
    if (e.key === ' ') {
      // Space for play/pause
      e.preventDefault();
      if (UnifiedPlayer.getCurrentTime() > 0) {
        if (html5Video.paused || (ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === 2)) {
          UnifiedPlayer.play();
        } else {
          UnifiedPlayer.pause();
        }
      }
    }
  });

  drawerTabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      drawerTabButtons.forEach((b) => b.classList.remove('active'));
      drawerContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(`drawer-tab-${tabId}`).classList.add('active');
    });
  });

  drawerChatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = drawerChatInput.value.trim();
    if (!text) return;
    socket.emit('chat:send_message', { text, isDanmaku: true });
    drawerChatInput.value = '';
  });

  socket.on('chat:new_message', (msg) => {
    appendChatMessage(msg);
    if (!msg.isSystem && msg.text) {
      createDanmakuBullet(msg.text, msg.sender, msg.color);
    }
    if (!slideDrawer.classList.contains('open')) {
      chatUnreadBadge.style.display = 'block';
    }
  });

  function renderMessages(messages) {
    chatFeed.innerHTML = '';
    if (messages) messages.forEach(appendChatMessage);
  }

  function appendChatMessage(msg) {
    if (msg.isSystem) {
      const sysDiv = document.createElement('div');
      sysDiv.className = 'system-msg';
      sysDiv.textContent = msg.text;
      chatFeed.appendChild(sysDiv);
    } else {
      const isOwn = (msg.sender === currentUsername);
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${isOwn ? 'own' : ''}`;

      const meta = document.createElement('div');
      meta.className = 'chat-meta';
      meta.innerHTML = `<span class="chat-sender" style="color: ${msg.color || 'var(--primary)'}">${msg.avatar || '🍿'} ${escapeHtml(msg.sender)}</span> <span>${formatMsgTime(msg.timestamp)}</span>`;

      const text = document.createElement('div');
      text.className = 'msg-text';
      if (msg.text) text.textContent = msg.text;

      if (msg.image) {
        const img = document.createElement('img');
        img.src = msg.image;
        img.className = 'msg-screenshot-preview';
        text.appendChild(img);
      }

      bubble.appendChild(meta);
      bubble.appendChild(text);
      chatFeed.appendChild(bubble);
    }
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  // 8. Stream Resolver & Play Now
  btnPlayNow.addEventListener('click', async () => {
    const rawUrl = mediaUrlInput.value.trim();
    if (!rawUrl) return;

    showPlayerToast('Resolving stream...', '⏳');

    // Use /api/media/resolve for anime streaming sites & direct streams
    try {
      const res = await fetch('/api/media/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl })
      });
      const data = await res.json();

      if (data.success && data.streamUrl) {
        socket.emit('media:change', {
          url: data.streamUrl,
          title: data.title || rawUrl,
          type: data.type
        });
      } else {
        socket.emit('media:change', { url: rawUrl, title: rawUrl });
      }
    } catch (e) {
      socket.emit('media:change', { url: rawUrl, title: rawUrl });
    }

    mediaUrlInput.value = '';
  });

  mediaUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnPlayNow.click();
  });

  btnAddQueue.addEventListener('click', () => {
    const url = mediaUrlInput.value.trim();
    if (!url) return;
    socket.emit('queue:add', { url, title: '' });
    mediaUrlInput.value = '';
    showGlobalToast('Added to queue! 📋');
  });

  // 9. Screenshot Tool
  btnScreenshot.addEventListener('click', () => {
    if (activePlayerType === 'youtube') {
      showGlobalToast('Screenshots only supported on Direct & HLS videos');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = html5Video.videoWidth || 1920;
      canvas.height = html5Video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(html5Video, 0, 0, canvas.width, canvas.height);

      currentScreenshotData = canvas.toDataURL('image/png');
      screenshotImg.src = currentScreenshotData;
      screenshotModal.classList.add('open');
    } catch (err) {
      showGlobalToast('Screenshot error: ' + err.message);
    }
  });

  btnCloseScreenshot.addEventListener('click', () => {
    screenshotModal.classList.remove('open');
  });

  btnDownloadScreenshot.addEventListener('click', () => {
    if (!currentScreenshotData) return;
    const a = document.createElement('a');
    a.href = currentScreenshotData;
    a.download = `watch_together_${Date.now()}.png`;
    a.click();
  });

  btnShareScreenshot.addEventListener('click', () => {
    if (!currentScreenshotData) return;
    socket.emit('chat:send_message', { text: '📸 Captured frame:', image: currentScreenshotData });
    screenshotModal.classList.remove('open');
    showGlobalToast('Shared screenshot in chat! 💬');
  });

  // 10. Subtitles Handler
  subFileInput.addEventListener('change', () => {
    const file = subFileInput.files[0];
    if (!file) return;

    const vttUrl = URL.createObjectURL(file);
    html5SubtitleTrack.src = vttUrl;
    html5SubtitleTrack.mode = 'showing';
    showGlobalToast(`Loaded subtitles: ${file.name}`);
  });

  // Drag & Drop Subtitles directly onto video
  const videoWrapper = document.getElementById('video-theater-wrapper');
  videoWrapper.addEventListener('dragover', (e) => e.preventDefault());
  videoWrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (/\.(vtt|srt)$/i.test(file.name)) {
        const vttUrl = URL.createObjectURL(file);
        html5SubtitleTrack.src = vttUrl;
        html5SubtitleTrack.mode = 'showing';
        showGlobalToast(`Loaded subtitle: ${file.name} 🔤`);
      }
    }
  });

  // 11. WebRTC Voice Chat (Peer-to-Peer Mic)
  btnToggleVoice.addEventListener('click', async () => {
    if (!isInVoice) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isInVoice = true;
        btnToggleVoice.classList.add('connected');
        voiceIcon.textContent = '🔊';
        voiceLabel.textContent = 'Leave Voice';

        socket.emit('voice:join');
        showGlobalToast('Voice connected! 🎙️');
      } catch (err) {
        alert('Microphone access denied or not available: ' + err.message);
      }
    } else {
      // Leave voice
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        localStream = null;
      }
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      isInVoice = false;
      btnToggleVoice.classList.remove('connected');
      voiceIcon.textContent = '🎙️';
      voiceLabel.textContent = 'Join Voice';
      voicePeersIndicator.style.display = 'none';

      socket.emit('voice:leave');
      showGlobalToast('Voice disconnected');
    }
  });

  socket.on('voice:peer_joined', async ({ peerId, username }) => {
    voicePeersIndicator.style.display = 'flex';
    voicePeerName.textContent = `${username} in Voice`;

    if (!localStream) return;

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('voice:signal', { targetPeerId: peerId, signalData: { candidate: e.candidate } });
      }
    };

    peerConnection.ontrack = (e) => {
      if (!remoteAudio) {
        remoteAudio = document.createElement('audio');
        remoteAudio.autoplay = true;
        document.body.appendChild(remoteAudio);
      }
      remoteAudio.srcObject = e.streams[0];
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('voice:signal', { targetPeerId: peerId, signalData: { desc: offer } });
  });

  socket.on('voice:signal', async ({ senderPeerId, signalData }) => {
    if (!peerConnection && localStream) {
      peerConnection = new RTCPeerConnection(rtcConfig);
      localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

      peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('voice:signal', { targetPeerId: senderPeerId, signalData: { candidate: e.candidate } });
        }
      };

      peerConnection.ontrack = (e) => {
        if (!remoteAudio) {
          remoteAudio = document.createElement('audio');
          remoteAudio.autoplay = true;
          document.body.appendChild(remoteAudio);
        }
        remoteAudio.srcObject = e.streams[0];
      };
    }

    if (signalData.desc) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData.desc));
      if (signalData.desc.type === 'offer') {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('voice:signal', { targetPeerId: senderPeerId, signalData: { desc: answer } });
      }
    } else if (signalData.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(signalData.candidate));
    }
  });

  socket.on('voice:peer_left', () => {
    voicePeersIndicator.style.display = 'none';
  });

  // 12. Library Modal Picker
  btnOpenLibraryModal.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/library');
      const files = await res.json();
      renderLibraryPicker(files);
      libraryPickerModal.classList.add('open');
    } catch (e) {
      alert('Could not fetch library files');
    }
  });

  btnCloseLibraryModal.addEventListener('click', () => {
    libraryPickerModal.classList.remove('open');
  });

  function renderLibraryPicker(files) {
    if (!files || files.length === 0) {
      libraryPickerList.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 2rem;">No media files on EC2 yet. Add torrents in Planner!</div>';
      return;
    }
    libraryPickerList.innerHTML = '';
    files.forEach((f) => {
      const item = document.createElement('div');
      item.className = 'picker-item';
      item.innerHTML = `
        <div>
          <div style="font-weight: 600;">${escapeHtml(f.filename)}</div>
          <div style="font-size: 0.78rem; color: var(--text-dim);">📦 ${f.sizeFormatted}</div>
        </div>
        <button class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Play</button>
      `;
      item.onclick = () => {
        socket.emit('media:change', { url: f.streamUrl, title: f.filename, type: 'direct' });
        libraryPickerModal.classList.remove('open');
      };
      libraryPickerList.appendChild(item);
    });
  }

  // 13. Queue Handling
  socket.on('queue:updated', (queue) => renderQueue(queue));

  function renderQueue(queue) {
    queueCount.textContent = queue.length;
    if (!queue || queue.length === 0) {
      drawerQueueList.innerHTML = '<div class="queue-empty">Queue is empty.<br>Add videos above!</div>';
      return;
    }
    drawerQueueList.innerHTML = '';
    queue.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'picker-item';
      el.innerHTML = `
        <div>
          <div style="font-weight: 600; font-size: 0.85rem;">${idx + 1}. ${escapeHtml(item.title)}</div>
          <div style="font-size: 0.72rem; color: var(--text-dim);">Added by ${escapeHtml(item.addedBy)}</div>
        </div>
        <button class="btn-icon" onclick="removeQueueItem('${item.id}')">✕</button>
      `;
      drawerQueueList.appendChild(el);
    });
  }

  window.removeQueueItem = function (itemId) {
    socket.emit('queue:remove', { itemId });
  };

  btnSkipNext.addEventListener('click', () => {
    socket.emit('queue:play_next');
  });

  // 14. Users UI & Host Controls
  function renderUsers(users) {
    userCount.textContent = users.length;
    drawerUsersList.innerHTML = '';
    users.forEach((u) => {
      const el = document.createElement('div');
      el.className = 'picker-item';
      el.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <div class="avatar-circle" style="background-color: ${u.color};">${u.avatar || '🍿'}</div>
          <span>${escapeHtml(u.username)} ${u.id === socket.id ? '(You)' : ''}</span>
        </div>
        ${u.isHost ? '<span style="font-size: 0.72rem; font-weight: 700; color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); padding: 0.1rem 0.4rem; border-radius: 4px;">HOST</span>' : ''}
      `;
      drawerUsersList.appendChild(el);
    });
  }

  btnToggleHost.addEventListener('click', () => {
    if (!isHost) {
      showGlobalToast('Only room host can change control permissions!');
      return;
    }
    socket.emit('room:toggle_host_only');
  });

  function updateHostUI(hostOnly) {
    if (hostOnly) {
      hostModeLabel.textContent = '🔒 Host Only';
      btnToggleHost.style.borderColor = 'var(--accent-amber)';
    } else {
      hostModeLabel.textContent = '🔓 Free Mode';
      btnToggleHost.style.borderColor = 'var(--border-subtle)';
    }
  }

  socket.on('room:settings_updated', (settings) => {
    updateHostUI(settings.hostOnlyControls);
  });

  // Resync
  btnManualSync.addEventListener('click', () => {
    socket.emit('sync:request');
    showGlobalToast('Resyncing playback with room...');
  });
  syncStatus.addEventListener('click', () => {
    socket.emit('sync:request');
    showGlobalToast('Resyncing playback with room...');
  });

  // Copy Room Link
  btnCopyLink.addEventListener('click', () => {
    const roomUrl = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(roomUrl).then(() => {
      showGlobalToast('Room link copied! Send to your friend 🍿');
    });
  });

  // Helpers
  function formatTime(seconds) {
    const s = Math.floor(seconds || 0);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const remM = m % 60;
    const remS = s % 60;
    if (h > 0) return `${h}:${remM.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`;
    return `${remM}:${remS.toString().padStart(2, '0')}`;
  }

  function formatMsgTime(ts) {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
