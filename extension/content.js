// Watch Together - Pink Edition Content Script
(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__WT_INJECTED__) return;
  window.__WT_INJECTED__ = true;

  console.log('%c[Watch Together] Pink Edition Active 🌸🍿', 'color: #ff2a85; font-weight: bold; font-size: 14px;');

  const DEFAULT_SERVER = 'http://35.154.133.16';
  let serverUrl = DEFAULT_SERVER;
  let roomId = 'lounge';
  let currentUser = { name: 'Prince', avatar: '👑', color: '#ff2a85' };

  let socket = null;
  let activeVideo = null;
  let isRemoteAction = false;
  let remoteActionTimer = null;
  let drawerOpen = false;
  let unreadCount = 0;

  // 1. Load saved settings from Chrome Storage
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['wt_server', 'wt_room', 'wt_user'], (data) => {
      if (data.wt_server) serverUrl = data.wt_server;
      if (data.wt_room) roomId = data.wt_room;
      if (data.wt_user) currentUser = data.wt_user;
      init();
    });
  } else {
    init();
  }

  function setRemoteLock() {
    isRemoteAction = true;
    if (remoteActionTimer) clearTimeout(remoteActionTimer);
    remoteActionTimer = setTimeout(() => {
      isRemoteAction = false;
    }, 600);
  }

  function init() {
    setupUI();
    observeVideoElements();
    connectSocket();
  }

  // 2. Observe and attach to <video> tags
  function findVideo() {
    const videos = Array.from(document.querySelectorAll('video')).filter(v => {
      // Must be visible and have duration or src
      const rect = v.getBoundingClientRect();
      return rect.width > 100 && rect.height > 100;
    });
    return videos[0] || document.querySelector('video');
  }

  function attachVideoEvents(video) {
    if (!video || video.__wt_attached__) return;
    video.__wt_attached__ = true;
    activeVideo = video;
    console.log('[Watch Together] Hooked video element 🎬', video);

    video.addEventListener('play', () => {
      if (isRemoteAction || !socket) return;
      socket.emit('player:sync_play', {
        roomId,
        currentTime: video.currentTime,
        isPlaying: true,
        sender: currentUser.name
      });
      showToast('You resumed playback ▶️');
    });

    video.addEventListener('pause', () => {
      if (isRemoteAction || !socket) return;
      socket.emit('player:sync_pause', {
        roomId,
        currentTime: video.currentTime,
        isPlaying: false,
        sender: currentUser.name
      });
      showToast('You paused playback ⏸️');
    });

    video.addEventListener('seeked', () => {
      if (isRemoteAction || !socket) return;
      socket.emit('player:sync_seek', {
        roomId,
        currentTime: video.currentTime,
        isPlaying: !video.paused,
        sender: currentUser.name
      });
      showToast(`Scrubbed to ${formatTime(video.currentTime)} ⏩`);
    });

    video.addEventListener('ratechange', () => {
      if (isRemoteAction || !socket) return;
      socket.emit('player:sync_rate', {
        roomId,
        playbackRate: video.playbackRate
      });
    });
  }

  function observeVideoElements() {
    const current = findVideo();
    if (current) attachVideoEvents(current);

    const observer = new MutationObserver(() => {
      const v = findVideo();
      if (v && v !== activeVideo) {
        attachVideoEvents(v);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 3. Connect to WebSocket Server on EC2
  function connectSocket() {
    if (typeof io === 'undefined') {
      console.warn('[Watch Together] Socket.io not yet loaded');
      return;
    }

    try {
      socket = io(serverUrl, { transports: ['websocket', 'polling'] });

      socket.on('connect', () => {
        console.log('[Watch Together] Connected to EC2 WebSocket Server 🌸');
        updateStatus(true);
        socket.emit('room:join', {
          roomId,
          username: currentUser.name,
          color: currentUser.color,
          avatar: currentUser.avatar
        });
      });

      socket.on('disconnect', () => {
        updateStatus(false);
      });

      // Synchronized Actions from Peer
      socket.on('player:sync_play', ({ currentTime, sender }) => {
        if (!activeVideo) return;
        setRemoteLock();
        showToast(`${sender} resumed ▶️`);
        if (Math.abs(activeVideo.currentTime - currentTime) > 0.4) {
          activeVideo.currentTime = currentTime;
        }
        activeVideo.play().catch(() => {});
      });

      socket.on('player:sync_pause', ({ currentTime, sender }) => {
        if (!activeVideo) return;
        setRemoteLock();
        showToast(`${sender} paused ⏸️`);
        if (Math.abs(activeVideo.currentTime - currentTime) > 0.4) {
          activeVideo.currentTime = currentTime;
        }
        activeVideo.pause();
      });

      socket.on('player:sync_seek', ({ currentTime, isPlaying, sender }) => {
        if (!activeVideo) return;
        setRemoteLock();
        showToast(`${sender} jumped to ${formatTime(currentTime)} ⏩`);
        activeVideo.currentTime = currentTime;
        if (isPlaying) activeVideo.play().catch(() => {});
        else activeVideo.pause();
      });

      socket.on('player:sync_rate', ({ playbackRate }) => {
        if (!activeVideo) return;
        setRemoteLock();
        activeVideo.playbackRate = playbackRate;
      });

      socket.on('chat:received', (msg) => {
        appendChatMessage(msg);
        if (!drawerOpen) {
          unreadCount++;
          const badge = document.querySelector('.wt-unread-badge');
          if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = 'inline-block';
          }
        }
      });

      socket.on('danmaku:received', ({ text, color }) => {
        spawnDanmakuBullet(text, color);
      });

      socket.on('reaction:received', ({ emoji }) => {
        spawnFloatingEmoji(emoji);
      });

    } catch (e) {
      console.error('[Watch Together] Socket connect error:', e);
    }
  }

  // 4. Injected UI (Floating Pill, Drawer, Danmaku)
  function setupUI() {
    // Floating Pill
    const pill = document.createElement('div');
    pill.id = 'wt-floating-pill';
    pill.innerHTML = `
      <div class="wt-status-dot"></div>
      <span>Watch Together 🌸</span>
      <span class="wt-unread-badge">0</span>
    `;
    pill.addEventListener('click', toggleDrawer);
    document.body.appendChild(pill);

    // Slide-Over Chat Drawer
    const drawer = document.createElement('div');
    drawer.id = 'wt-chat-drawer';
    drawer.innerHTML = `
      <div class="wt-drawer-header">
        <div class="wt-drawer-title">
          <span>🍿 Watch Together</span>
          <span style="font-size: 11px; opacity: 0.8; font-weight: normal;">(Room: ${roomId})</span>
        </div>
        <button class="wt-close-btn" id="wt-close-drawer">✕</button>
      </div>
      <div class="wt-room-info">
        <span>Logged in as <b>${currentUser.avatar} ${currentUser.name}</b></span>
        <span id="wt-connection-label" style="color: #10b981;">Online</span>
      </div>
      <div class="wt-chat-messages" id="wt-chat-list">
        <div class="wt-msg-bubble wt-peer" style="background: rgba(255,42,133,0.15); border-color: rgba(255,42,133,0.3);">
          ✨ Connected! You and your friend are synced. Hotkey [C] toggles chat.
        </div>
      </div>
      <div class="wt-emoji-bar">
        <button class="wt-emoji-btn" data-emoji="🌸">🌸</button>
        <button class="wt-emoji-btn" data-emoji="💖">💖</button>
        <button class="wt-emoji-btn" data-emoji="🍿">🍿</button>
        <button class="wt-emoji-btn" data-emoji="✨">✨</button>
        <button class="wt-emoji-btn" data-emoji="🥺">🥺</button>
        <button class="wt-emoji-btn" data-emoji="🔥">🔥</button>
      </div>
      <div class="wt-chat-input-area">
        <input type="text" class="wt-chat-input" id="wt-chat-text" placeholder="Type a message or bullet comment..." />
        <button class="wt-send-btn" id="wt-send-msg">Send</button>
      </div>
    `;
    document.body.appendChild(drawer);

    // Danmaku container
    const danmakuContainer = document.createElement('div');
    danmakuContainer.id = 'wt-danmaku-container';
    document.body.appendChild(danmakuContainer);

    // Event Listeners
    document.getElementById('wt-close-drawer').addEventListener('click', toggleDrawer);

    const sendBtn = document.getElementById('wt-send-msg');
    const input = document.getElementById('wt-chat-text');

    function sendChat() {
      const text = input.value.trim();
      if (!text || !socket) return;
      input.value = '';

      socket.emit('chat:send', { roomId, text });
      socket.emit('danmaku:send', { roomId, text, color: currentUser.color });

      appendChatMessage({
        sender: currentUser.name,
        avatar: currentUser.avatar,
        text,
        timestamp: Date.now()
      }, true);

      spawnDanmakuBullet(text, currentUser.color);
    }

    sendBtn.addEventListener('click', sendChat);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChat();
    });

    // Emoji reaction buttons
    document.querySelectorAll('.wt-emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.getAttribute('data-emoji');
        if (socket) socket.emit('reaction:send', { roomId, emoji });
        spawnFloatingEmoji(emoji);
      });
    });

    // Global Hotkey 'C' for chat drawer
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key.toLowerCase() === 'c') {
        toggleDrawer();
      }
    });
  }

  function toggleDrawer() {
    drawerOpen = !drawerOpen;
    const drawer = document.getElementById('wt-chat-drawer');
    if (drawer) {
      drawer.classList.toggle('wt-open', drawerOpen);
      if (drawerOpen) {
        unreadCount = 0;
        const badge = document.querySelector('.wt-unread-badge');
        if (badge) badge.style.display = 'none';
        const input = document.getElementById('wt-chat-text');
        if (input) setTimeout(() => input.focus(), 150);
      }
    }
  }

  function updateStatus(online) {
    const dot = document.querySelector('#wt-floating-pill .wt-status-dot');
    const label = document.getElementById('wt-connection-label');
    if (dot) {
      dot.style.background = online ? '#10b981' : '#ef4444';
      dot.style.boxShadow = online ? '0 0 8px #10b981' : '0 0 8px #ef4444';
    }
    if (label) {
      label.textContent = online ? 'Online' : 'Disconnected';
      label.style.color = online ? '#10b981' : '#ef4444';
    }
  }

  function appendChatMessage(msg, isSelf = false) {
    const list = document.getElementById('wt-chat-list');
    if (!list) return;

    const bubble = document.createElement('div');
    bubble.className = `wt-msg-bubble ${isSelf ? 'wt-self' : 'wt-peer'}`;
    bubble.innerHTML = `
      <div class="wt-msg-sender">${escapeHtml(msg.sender || 'Friend')}</div>
      <div class="wt-msg-text">${escapeHtml(msg.text)}</div>
    `;
    list.appendChild(bubble);
    list.scrollTop = list.scrollHeight;
  }

  function spawnDanmakuBullet(text, color = '#ff2a85') {
    const container = document.getElementById('wt-danmaku-container');
    if (!container) return;

    const bullet = document.createElement('div');
    bullet.className = 'wt-danmaku-bullet';
    bullet.textContent = text;
    bullet.style.top = `${Math.floor(Math.random() * 65 + 10)}%`;
    bullet.style.color = color || '#fff';

    container.appendChild(bullet);
    setTimeout(() => bullet.remove(), 8500);
  }

  function spawnFloatingEmoji(emoji) {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        const span = document.createElement('span');
        span.className = 'wt-floating-emoji';
        span.textContent = emoji;
        span.style.left = `${Math.floor(Math.random() * 80 + 10)}%`;
        document.body.appendChild(span);
        setTimeout(() => span.remove(), 3200);
      }, i * 140);
    }
  }

  function showToast(text) {
    // Non-intrusive console + pill pulse
    const pill = document.getElementById('wt-floating-pill');
    if (pill) {
      const orig = pill.querySelector('span').textContent;
      pill.querySelector('span').textContent = text;
      setTimeout(() => {
        pill.querySelector('span').textContent = 'Watch Together 🌸';
      }, 2500);
    }
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

})();
