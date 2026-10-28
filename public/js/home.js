// Watch Together - Home & Watch Planner Engine

(function () {
  'use strict';

  // 1. Profile State
  const profileSelect = document.getElementById('profile-select');
  const storedUser = localStorage.getItem('wt_profile') || 'prince';
  if (profileSelect) {
    profileSelect.value = storedUser;
    profileSelect.addEventListener('change', () => {
      localStorage.setItem('wt_profile', profileSelect.value);
      const selected = profileSelect.options[profileSelect.selectedIndex];
      localStorage.setItem('wt_username', selected.text.split(' ')[1] || 'User');
      localStorage.setItem('wt_avatar', selected.getAttribute('data-avatar') || '👑');
      localStorage.setItem('wt_color', selected.getAttribute('data-color') || '#6366f1');
    });
    // Trigger initial store
    profileSelect.dispatchEvent(new Event('change'));
  }

  // 2. Tab Navigation
  const tabButtons = document.querySelectorAll('.home-tab-btn');
  const tabPanels = document.querySelectorAll('.home-tab-panel');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      tabPanels.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      const targetPanel = document.getElementById(`tab-${tabId}`);
      if (targetPanel) targetPanel.classList.add('active');

      if (tabId === 'library') loadLibrary();
      if (tabId === 'downloader') loadDownloads();
    });
  });

  // 3. Live Presence Banner Polling
  const liveBanner = document.getElementById('live-banner');
  const liveMovieTitle = document.getElementById('live-movie-title');
  const liveWatchersInfo = document.getElementById('live-watchers-info');
  const liveJoinBtn = document.getElementById('live-join-btn');

  async function checkLiveStatus() {
    try {
      const res = await fetch('/api/live-status');
      const data = await res.json();

      if (data.isWatching && data.activeRoom) {
        liveMovieTitle.textContent = data.activeTitle || 'Movie Watch Party';
        const watcherNames = data.watchers.map((w) => `${w.avatar} ${w.name}`).join(', ');
        liveWatchersInfo.textContent = `${watcherNames} currently watching in room "${data.activeRoom}"`;
        liveJoinBtn.href = `/room/${data.activeRoom}`;
        liveBanner.style.display = 'flex';
      } else {
        liveBanner.style.display = 'none';
      }
    } catch (e) {
      console.warn('Presence check notice:', e);
    }
  }
  checkLiveStatus();
  setInterval(checkLiveStatus, 5000);

  // 4. Quick Room Form
  const joinRoomForm = document.getElementById('join-room-form');
  const customRoomInput = document.getElementById('custom-room-input');
  if (joinRoomForm) {
    joinRoomForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = customRoomInput.value.trim() || 'main';
      window.location.href = `/room/${encodeURIComponent(code)}`;
    });
  }

  // 5. Watch Planner & Calendar
  const addPlanForm = document.getElementById('add-plan-form');
  const plannerList = document.getElementById('planner-list');
  const planCountText = document.getElementById('plan-count-text');

  // Set today's date as default in date picker
  const planDateInput = document.getElementById('plan-date');
  if (planDateInput) {
    planDateInput.value = new Date().toISOString().split('T')[0];
  }

  async function loadPlanner() {
    try {
      const res = await fetch('/api/planner');
      const plans = await res.json();
      renderPlanner(plans);
    } catch (e) {
      plannerList.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 2rem;">Failed to load planner.</div>';
    }
  }

  function renderPlanner(plans) {
    planCountText.textContent = `${plans.length} movie dates planned`;
    if (!plans || plans.length === 0) {
      plannerList.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 3rem;">No upcoming watch dates yet. Add one on the left! 🍿</div>';
      return;
    }

    plannerList.innerHTML = '';
    plans.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'plan-item-card';

      const statusClass = p.status || 'planned';
      const statusLabel = p.status ? p.status.toUpperCase() : 'PLANNED';

      card.innerHTML = `
        <div class="plan-item-top">
          <div>
            <div class="plan-title">${escapeHtml(p.title)}</div>
            <div class="plan-meta">
              <span>📅 ${p.date} at ${p.time}</span>
              <span>🏷️ ${p.sourceType ? p.sourceType.toUpperCase() : 'STREAM'}</span>
            </div>
          </div>
          <span class="plan-status-badge ${statusClass}">${statusLabel}</span>
        </div>
        ${p.notes ? `<div class="plan-notes">💬 ${escapeHtml(p.notes)}</div>` : ''}
        <div class="plan-actions">
          <button class="btn-primary" style="padding: 0.45rem 0.85rem; font-size: 0.8rem;" onclick="startWatchParty('${encodeURIComponent(p.title)}', '${encodeURIComponent(p.sourceUrl || '')}')">
            <span>🍿 Watch Now in Room</span>
          </button>
          ${p.sourceUrl && p.status !== 'ready' ? `
            <button class="btn-secondary" style="padding: 0.45rem 0.85rem; font-size: 0.8rem;" onclick="triggerDownload('${p.id}')">
              <span>⚡ Download File</span>
            </button>
          ` : ''}
          <button class="btn-icon" title="Delete" style="margin-left: auto;" onclick="deletePlan('${p.id}')">🗑️</button>
        </div>
      `;

      plannerList.appendChild(card);
    });
  }

  if (addPlanForm) {
    addPlanForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('plan-title').value.trim();
      const date = document.getElementById('plan-date').value;
      const time = document.getElementById('plan-time').value;
      const sourceUrl = document.getElementById('plan-url').value.trim();
      const notes = document.getElementById('plan-notes').value.trim();
      const autoDownload = document.getElementById('plan-auto-download').checked;

      try {
        const res = await fetch('/api/planner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, date, time, sourceUrl, notes })
        });
        const created = await res.json();

        if (autoDownload && sourceUrl) {
          await fetch(`/api/planner/${created.id}/download`, { method: 'POST' });
        }

        addPlanForm.reset();
        document.getElementById('plan-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('plan-time').value = '21:00';
        loadPlanner();
      } catch (err) {
        alert('Failed to save watch plan');
      }
    });
  }

  window.deletePlan = async function (id) {
    if (!confirm('Remove this planned watch date?')) return;
    await fetch(`/api/planner/${id}`, { method: 'DELETE' });
    loadPlanner();
  };

  window.triggerDownload = async function (id) {
    const res = await fetch(`/api/planner/${id}/download`, { method: 'POST' });
    const data = await res.json();
    alert(data.success ? 'Download started on EC2 via Aria2!' : 'Download failed');
    loadPlanner();
  };

  window.startWatchParty = function (title, url) {
    const roomUrl = `/room/main?title=${title}&media=${url}`;
    window.location.href = roomUrl;
  };

  // 6. Media Library
  const libraryList = document.getElementById('library-list');
  const libraryCountBadge = document.getElementById('library-count-badge');
  const btnRefreshLibrary = document.getElementById('btn-refresh-library');
  const mediaUploadInput = document.getElementById('media-upload-input');

  async function loadLibrary() {
    try {
      const res = await fetch('/api/library');
      const files = await res.json();
      renderLibrary(files);
    } catch (e) {
      libraryList.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 2rem;">Could not load library.</div>';
    }
  }

  function renderLibrary(files) {
    libraryCountBadge.textContent = files.length;
    if (!files || files.length === 0) {
      libraryList.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-dim);">No downloaded media files on EC2 yet.<br>Download a torrent or upload a video!</div>';
      return;
    }

    libraryList.innerHTML = '';
    files.forEach((file) => {
      const card = document.createElement('div');
      card.className = 'media-card';
      card.innerHTML = `
        <div style="font-size: 2rem;">🎬</div>
        <div class="media-card-title">${escapeHtml(file.filename)}</div>
        <div class="media-card-info">
          <span>📦 ${file.sizeFormatted}</span>
          ${file.subtitleUrl ? '<span>🔤 Subs Available</span>' : ''}
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: auto;">
          <button class="btn-primary" style="flex: 1; justify-content: center; font-size: 0.82rem;" onclick="watchLocalFile('${encodeURIComponent(file.filename)}')">
            <span>🍿 Watch in Room</span>
          </button>
        </div>
      `;
      libraryList.appendChild(card);
    });
  }

  if (btnRefreshLibrary) btnRefreshLibrary.addEventListener('click', loadLibrary);

  if (mediaUploadInput) {
    mediaUploadInput.addEventListener('change', async () => {
      const file = mediaUploadInput.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('mediaFile', file);

      try {
        const res = await fetch('/api/media/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          alert(`File "${file.name}" uploaded successfully!`);
          loadLibrary();
        }
      } catch (err) {
        alert('Upload failed: ' + err.message);
      }
    });
  }

  window.watchLocalFile = function (filename) {
    const streamUrl = `/api/media/stream/${filename}`;
    window.location.href = `/room/main?title=${filename}&media=${encodeURIComponent(streamUrl)}`;
  };

  // 7. Downloader / Aria2
  const downloadAddForm = document.getElementById('download-add-form');
  const downloadUrlInput = document.getElementById('download-url-input');
  const activeDownloadsList = document.getElementById('active-downloads-list');
  const downloadsCountBadge = document.getElementById('downloads-count-badge');

  async function loadDownloads() {
    try {
      const res = await fetch('/api/downloads/active');
      const data = await res.json();
      renderDownloads(data.active || []);
    } catch (e) {
      console.warn('Downloads check notice:', e);
    }
  }

  function renderDownloads(activeList) {
    downloadsCountBadge.textContent = activeList.length;
    if (!activeList || activeList.length === 0) {
      activeDownloadsList.innerHTML = '<div class="queue-empty">No active downloads running currently.</div>';
      return;
    }

    activeDownloadsList.innerHTML = '';
    activeList.forEach((task) => {
      const completed = parseInt(task.completedLength || 0, 10);
      const total = parseInt(task.totalLength || 0, 10);
      const percent = total > 0 ? Math.floor((completed / total) * 100) : 0;
      const speed = (parseInt(task.downloadSpeed || 0, 10) / (1024 * 1024)).toFixed(2);
      const title = (task.bittorrent && task.bittorrent.info && task.bittorrent.info.name) ||
                    (task.files && task.files[0] && task.files[0].path) || `Task ${task.gid}`;

      const card = document.createElement('div');
      card.className = 'download-task-card';
      card.innerHTML = `
        <div class="download-task-header">
          <strong>${escapeHtml(title)}</strong>
          <span>${percent}%</span>
        </div>
        <div class="download-progress-bar">
          <div class="download-progress-fill" style="width: ${percent}%;"></div>
        </div>
        <div class="download-stats">
          <span>Speed: ${speed} MB/s</span>
          <span>${(completed / (1024 * 1024)).toFixed(1)} / ${(total / (1024 * 1024)).toFixed(1)} MB</span>
        </div>
      `;
      activeDownloadsList.appendChild(card);
    });
  }

  if (downloadAddForm) {
    downloadAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = downloadUrlInput.value.trim();
      if (!url) return;

      try {
        const res = await fetch('/api/downloads/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.success) {
          alert('Download task queued in Aria2! 🚀');
          downloadUrlInput.value = '';
          loadDownloads();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (err) {
        alert('Failed to connect to download daemon: ' + err.message);
      }
    });
  }

  // Initial load
  loadPlanner();

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
