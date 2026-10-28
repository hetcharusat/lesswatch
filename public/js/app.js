// Watch Together - Core Application & Synchronization Engine

(function () {
  'use strict';

  // 1. Extract Room ID from pathname (/room/:roomId) or query parameter
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let roomId = 'default';
  if (pathParts.length >= 2 && pathParts[0] === 'room') {
    roomId = pathParts[1].toLowerCase();
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    roomId = (urlParams.get('room') || 'party').toLowerCase();
  }

  // 2. User Identity Setup (Nickname & Color)
  const storedName = localStorage.getItem('wt_username');
  const storedColor = localStorage.getItem('wt_color');
  const defaultColors = ['#38bdf8', '#ec4899', '#a855f7', '#10b981', '#f59e0b', '#6366f1'];
  
  let currentUsername = storedName || `Friend-${Math.floor(100 + Math.random() * 900)}`;
  let userColor = storedColor || defaultColors[Math.floor(Math.random() * defaultColors.length)];
  localStorage.setItem('wt_username', currentUsername);
  localStorage.setItem('wt_color', userColor);

  // DOM Elements
  const roomNameDisplay = document.getElementById('room-name-display');
  const usernameDisplay = document.getElementById('username-display');
  const avatarDot = document.getElementById('avatar-dot');
  const syncStatus = document.getElementById('sync-status');
  const syncStatusText = document.getElementById('sync-status-text');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnTheater = document.getElementById('btn-theater');
  const appContainer = document.getElementById('app-container');
  const mediaUrlInput = document.getElementById('media-url-input');
  const btnPlayNow = document.getElementById('btn-play-now');
  const btnAddQueue = document.getElementById('btn-add-queue');
  const btnManualSync = document.getElementById('btn-manual-sync');
  const currentMediaTitle = document.getElementById('current-media-title');
  const currentMediaType = document.getElementById('current-media-type');
  const reactionsOverlay = document.getElementById('reactions-overlay');
  const playerToast = document.getElementById('player-toast');
  const toastMessage = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');
  const globalToast = document.getElementById('global-toast');
  const toastText = document.getElementById('toast-text');

  // Sidebar & Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const queueList = document.getElementById('queue-list');
  const queueBadge = document.getElementById('queue-badge');
  const userCountBadge = document.getElementById('user-count-badge');
  const usersList = document.getElementById('users-list');
  const btnToggleHost = document.getElementById('btn-toggle-host');
  const hostModeStatus = document.getElementById('host-mode-status');
  const btnPlayNext = document.getElementById('btn-play-next');

  // Nickname Modal
  const userBadge = document.getElementById('user-badge');
  const nameModal = document.getElementById('name-modal');
  const modalNameInput = document.getElementById('modal-name-input');
  const btnSaveName = document.getElementById('btn-save-name');

  // Player Containers
  const ytPlayerContainer = document.getElementById('yt-player-container');
  const html5PlayerContainer = document.getElementById('html5-player-container');
  const html5Video = document.getElementById('html5-video');

  // Update Top Navigation
  roomNameDisplay.textContent = roomId;
  updateUserUI();

  function updateUserUI() {
    usernameDisplay.textContent = currentUsername;
    avatarDot.textContent = currentUsername.charAt(0).toUpperCase();
    avatarDot.style.backgroundColor = userColor;
  }

  // 3. Connect to Socket.IO
  const socket = io({
    path: '/api/v1/sync',
    transports: ['websocket', 'polling']
  });

  // State flags & trackers
  let isRemoteAction = false;
  let remoteActionTimer = null;
  let activePlayerType = 'youtube'; // 'youtube' | 'direct' | 'hls'
  let ytPlayer = null;
  let isYtReady = false;
  let hlsInstance = null;
  let currentRoomState = null;
  let isHost = false;

  // Set anti-loop lock when executing remote player commands
  function setRemoteActionLock(duration = 600) {
    isRemoteAction = true;
    if (remoteActionTimer) clearTimeout(remoteActionTimer);
    remoteActionTimer = setTimeout(() => {
      isRemoteAction = false;
    }, duration);
  }

  // Toast alert on top of video player
  let toastTimer = null;
  function showPlayerToast(text, icon = '⚡') {
    if (!playerToast) return;
    toastMessage.textContent = text;
    toastIcon.textContent = icon;
    playerToast.classList.add('active');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      playerToast.classList.remove('active');
    }, 2800);
  }

  // Global bottom toast notification
  let globalToastTimer = null;
  function showGlobalToast(text, icon = '✅') {
    if (!globalToast) return;
    toastText.textContent = text;
    globalToast.classList.add('show');
    if (globalToastTimer) clearTimeout(globalToastTimer);
    globalToastTimer = setTimeout(() => {
      globalToast.classList.remove('show');
    }, 3000);
  }

  // 4. Initialize Players (YouTube & HTML5 Video)

  // YouTube IFrame API initialization
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
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange
      }
    });
  };

  // Load YouTube script dynamically if not present
  if (!window.YT) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }

  function onPlayerReady() {
    isYtReady = true;
    console.log('🎬 YouTube player ready');
    if (currentRoomState && currentRoomState.media.type === 'youtube') {
      applyMediaChange(currentRoomState.media, currentRoomState.playback);
    }
  }

  function onPlayerStateChange(event) {
    if (isRemoteAction) return;

    if (event.data === YT.PlayerState.PLAYING) {
      const time = ytPlayer.getCurrentTime();
      socket.emit('player:play', { currentTime: time });
    } else if (event.data === YT.PlayerState.PAUSED) {
      const time = ytPlayer.getCurrentTime();
      socket.emit('player:pause', { currentTime: time });
    } else if (event.data === YT.PlayerState.ENDED) {
      // Auto trigger next video in queue
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

  // 5. Unified Player Interface Methods
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

  // Switch Active Player (YouTube vs HTML5 / HLS)
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
      if (isYtReady && ytPlayer && ytPlayer.stopVideo) {
        ytPlayer.stopVideo();
      }

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
        // Direct MP4 / WebM video
        if (hlsInstance) {
          hlsInstance.destroy();
          hlsInstance = null;
        }
        html5Video.src = media.url;
      }
    }
  }

  // Apply Media Change
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
        if (playback.isPlaying) {
          UnifiedPlayer.play();
        } else {
          UnifiedPlayer.pause();
        }
      }
    }, 400);
  }

  // 6. Socket Synchronization Event Handlers

  // Join Room
  socket.emit('room:join', {
    roomId,
    username: currentUsername,
    color: userColor
  });

  // Initial Full Room State
  socket.on('room:initial_state', (state) => {
    currentRoomState = state;
    isHost = state.currentUser?.isHost || false;
    updateSettingsUI(state.settings, state.users);
    renderQueue(state.queue);
    renderMessages(state.messages);

    applyMediaChange(state.media, state.playback);
    showPlayerToast(`Connected to room "${state.roomId}"`, '✨');
  });

  // User Joined
  socket.on('user:joined', ({ user, users }) => {
    updateSettingsUI(currentRoomState?.settings, users);
    showPlayerToast(`${user.username} joined!`, '👋');
  });

  // User Left
  socket.on('user:left', ({ username, users }) => {
    updateSettingsUI(currentRoomState?.settings, users);
    if (username) showPlayerToast(`${username} left`, '🚪');
  });

  // Host Changed
  socket.on('host:changed', ({ newHostId, newHostName }) => {
    isHost = (socket.id === newHostId);
    showPlayerToast(`${newHostName} is now room host`, '👑');
  });

  // Remote Play Event
  socket.on('player:sync_play', ({ currentTime, sender }) => {
    setRemoteActionLock();
    showPlayerToast(`${sender} resumed playback`, '▶️');
    if (typeof currentTime === 'number') {
      const current = UnifiedPlayer.getCurrentTime();
      if (Math.abs(current - currentTime) > 0.8) {
        UnifiedPlayer.seekTo(currentTime);
      }
    }
    UnifiedPlayer.play();
  });

  // Remote Pause Event
  socket.on('player:sync_pause', ({ currentTime, sender }) => {
    setRemoteActionLock();
    showPlayerToast(`${sender} paused video`, '⏸️');
    if (typeof currentTime === 'number') {
      UnifiedPlayer.seekTo(currentTime);
    }
    UnifiedPlayer.pause();
  });

  // Remote Seek Event
  socket.on('player:sync_seek', ({ currentTime, isPlaying, sender }) => {
    setRemoteActionLock();
    showPlayerToast(`${sender} jumped to ${formatTime(currentTime)}`, '⏩');
    UnifiedPlayer.seekTo(currentTime);
    if (isPlaying) {
      UnifiedPlayer.play();
    } else {
      UnifiedPlayer.pause();
    }
  });

  // Remote Playback Rate Event
  socket.on('player:sync_rate', ({ playbackRate }) => {
    setRemoteActionLock();
    UnifiedPlayer.setPlaybackRate(playbackRate);
    showPlayerToast(`Speed set to ${playbackRate}x`, '⚡');
  });

  // Media Changed Event
  socket.on('media:changed', ({ media, playback, changedBy }) => {
    showPlayerToast(`${changedBy} loaded new video`, '🎬');
    applyMediaChange(media, playback);
  });

  // Heartbeat Drift Sync
  socket.on('sync:drift', ({ currentTime, isPlaying }) => {
    const localTime = UnifiedPlayer.getCurrentTime();
    const drift = Math.abs(localTime - currentTime);

    // Update Sync Pill indicator
    if (drift < 0.5) {
      syncStatusText.textContent = `In Sync (<0.5s)`;
      syncStatus.querySelector('.status-dot').className = 'status-dot';
    } else if (drift < 1.5) {
      syncStatusText.textContent = `Drift: ${drift.toFixed(1)}s`;
      syncStatus.querySelector('.status-dot').className = 'status-dot';
    } else {
      // Meaningful desync detected: smoothly seek to catch up
      syncStatusText.textContent = `Syncing (${drift.toFixed(1)}s)...`;
      syncStatus.querySelector('.status-dot').className = 'status-dot syncing';
      
      setRemoteActionLock();
      UnifiedPlayer.seekTo(currentTime);
      if (isPlaying) UnifiedPlayer.play();
    }
  });

  // Forced Manual Sync Response
  socket.on('player:sync_forced', ({ currentTime, isPlaying }) => {
    setRemoteActionLock();
    UnifiedPlayer.seekTo(currentTime);
    if (isPlaying) UnifiedPlayer.play();
    showPlayerToast(`Snapped to room time (${formatTime(currentTime)})`, '🎯');
    syncStatusText.textContent = 'In Sync';
  });

  // Settings Updated Event
  socket.on('room:settings_updated', (settings) => {
    if (currentRoomState) currentRoomState.settings = settings;
    updateHostButton(settings.hostOnlyControls);
  });

  // 7. Interactive Controls & UI Bindings

  // Play Now Button
  btnPlayNow.addEventListener('click', () => {
    const url = mediaUrlInput.value.trim();
    if (!url) return;
    socket.emit('media:change', { url, title: '' });
    mediaUrlInput.value = '';
  });

  mediaUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnPlayNow.click();
    }
  });

  // Add to Queue Button
  btnAddQueue.addEventListener('click', () => {
    const url = mediaUrlInput.value.trim();
    if (!url) return;
    socket.emit('queue:add', { url, title: '' });
    mediaUrlInput.value = '';
    showGlobalToast('Added video to queue! 📋');
  });

  // Quick Preset Chips
  document.querySelectorAll('.chip-btn').forEach((chip) => {
    chip.addEventListener('click', () => {
      const url = chip.getAttribute('data-url');
      const title = chip.getAttribute('data-title');
      socket.emit('media:change', { url, title });
    });
  });

  // Manual Resync Button & Pill
  function triggerResync() {
    socket.emit('sync:request');
    showGlobalToast('Resyncing playback with room...');
  }
  btnManualSync.addEventListener('click', triggerResync);
  syncStatus.addEventListener('click', triggerResync);

  // Copy Room Link
  btnCopyLink.addEventListener('click', () => {
    const roomUrl = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(roomUrl).then(() => {
      showGlobalToast('Room link copied! Send it to your friend 🍿');
    }).catch(() => {
      // Fallback
      prompt('Copy your room link:', roomUrl);
    });
  });

  // Theater Mode Toggle
  btnTheater.addEventListener('click', () => {
    document.body.classList.toggle('theater-mode');
  });

  // Tab Navigation
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      tabPanels.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(`panel-${tabId}`).classList.add('active');
    });
  });

  // Chat Submission
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit('chat:send_message', { text });
    chatInput.value = '';
  });

  socket.on('chat:new_message', (msg) => {
    appendChatMessage(msg);
  });

  function renderMessages(messages) {
    chatMessages.innerHTML = '';
    if (messages && messages.length) {
      messages.forEach(appendChatMessage);
    }
  }

  function appendChatMessage(msg) {
    if (msg.isSystem) {
      const sysDiv = document.createElement('div');
      sysDiv.className = 'system-msg';
      sysDiv.textContent = msg.text;
      chatMessages.appendChild(sysDiv);
    } else {
      const isOwn = (msg.sender === currentUsername);
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${isOwn ? 'own' : ''}`;

      const meta = document.createElement('div');
      meta.className = 'chat-meta';
      meta.innerHTML = `<span class="chat-sender" style="color: ${msg.color || 'var(--primary)'}">${escapeHtml(msg.sender)}</span> <span>${formatMsgTime(msg.timestamp)}</span>`;

      const text = document.createElement('div');
      text.className = 'msg-text';
      text.textContent = msg.text;

      bubble.appendChild(meta);
      bubble.appendChild(text);
      chatMessages.appendChild(bubble);
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Floating Reactions
  document.querySelectorAll('.react-btn').forEach((btn) => {
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

    // Randomize horizontal trajectory across bottom
    const randomLeft = 15 + Math.random() * 70;
    el.style.left = `${randomLeft}%`;

    reactionsOverlay.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 2500);
  }

  // Queue Handling
  socket.on('queue:updated', (queue) => {
    renderQueue(queue);
  });

  function renderQueue(queue) {
    queueBadge.textContent = queue.length;
    if (!queue || queue.length === 0) {
      queueList.innerHTML = '<div class="queue-empty">No videos in queue.<br>Paste a link and click "+ Queue"!</div>';
      return;
    }

    queueList.innerHTML = '';
    queue.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'queue-item';

      const info = document.createElement('div');
      info.className = 'queue-info';
      info.innerHTML = `
        <div class="queue-title">${index + 1}. ${escapeHtml(item.title)}</div>
        <div class="queue-by">Added by ${escapeHtml(item.addedBy)} • ${item.type.toUpperCase()}</div>
      `;

      const actions = document.createElement('div');
      actions.className = 'queue-actions';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-icon';
      removeBtn.innerHTML = '✕';
      removeBtn.title = 'Remove from queue';
      removeBtn.onclick = () => socket.emit('queue:remove', { itemId: item.id });

      actions.appendChild(removeBtn);
      row.appendChild(info);
      row.appendChild(actions);
      queueList.appendChild(row);
    });
  }

  btnPlayNext.addEventListener('click', () => {
    socket.emit('queue:play_next');
  });

  // Settings & Host Controls UI
  btnToggleHost.addEventListener('click', () => {
    if (!isHost) {
      showGlobalToast('Only room host can change control settings!', '⚠️');
      return;
    }
    socket.emit('room:toggle_host_only');
  });

  function updateHostButton(hostOnly) {
    if (hostOnly) {
      hostModeStatus.textContent = 'Mode: 🔒 Host Only';
      btnToggleHost.style.borderColor = 'var(--accent-amber)';
    } else {
      hostModeStatus.textContent = 'Mode: 🔓 Free (Anyone can control)';
      btnToggleHost.style.borderColor = 'var(--border-subtle)';
    }
  }

  function updateSettingsUI(settings, users) {
    if (settings) updateHostButton(settings.hostOnlyControls);
    if (users) {
      userCountBadge.textContent = users.length;
      usersList.innerHTML = '';
      users.forEach((u) => {
        const row = document.createElement('div');
        row.className = 'user-row';
        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div class="avatar-circle" style="background-color: ${u.color}; width: 20px; height: 20px; font-size: 0.65rem;">
              ${u.username.charAt(0).toUpperCase()}
            </div>
            <span>${escapeHtml(u.username)} ${u.id === socket.id ? '(You)' : ''}</span>
          </div>
          ${u.isHost ? '<span class="host-badge">HOST</span>' : ''}
        `;
        usersList.appendChild(row);
      });
    }
  }

  // Nickname Modal
  userBadge.addEventListener('click', () => {
    modalNameInput.value = currentUsername;
    nameModal.classList.add('open');
    modalNameInput.focus();
  });

  btnSaveName.addEventListener('click', () => {
    const val = modalNameInput.value.trim();
    if (val) {
      currentUsername = val;
      localStorage.setItem('wt_username', currentUsername);
      updateUserUI();
      socket.emit('room:join', { roomId, username: currentUsername, color: userColor });
    }
    nameModal.classList.remove('open');
  });

  nameModal.addEventListener('click', (e) => {
    if (e.target === nameModal) nameModal.classList.remove('open');
  });

  // Helpers
  function formatTime(seconds) {
    const s = Math.floor(seconds || 0);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const remM = m % 60;
    const remS = s % 60;
    if (h > 0) {
      return `${h}:${remM.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`;
    }
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
