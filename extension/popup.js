document.addEventListener('DOMContentLoaded', () => {
  const roomInput = document.getElementById('input-room');
  const serverInput = document.getElementById('input-server');
  const saveBtn = document.getElementById('btn-save');
  const statusText = document.getElementById('status-text');

  const pillPrince = document.getElementById('pill-prince');
  const pillFriend = document.getElementById('pill-friend');

  let selectedUser = { name: 'Prince', avatar: '👑', color: '#ff2a85' };

  // Load saved settings
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['wt_server', 'wt_room', 'wt_user'], (data) => {
      if (data.wt_server) serverInput.value = data.wt_server;
      if (data.wt_room) roomInput.value = data.wt_room;
      if (data.wt_user) {
        selectedUser = data.wt_user;
        setUserPill(data.wt_user.name);
      }
    });
  }

  function setUserPill(name) {
    if (name === 'Prince') {
      pillPrince.classList.add('active');
      pillFriend.classList.remove('active');
      selectedUser = { name: 'Prince', avatar: '👑', color: '#ff2a85' };
    } else {
      pillFriend.classList.add('active');
      pillPrince.classList.remove('active');
      selectedUser = { name: 'Friend', avatar: '🌸', color: '#f472b6' };
    }
  }

  pillPrince.addEventListener('click', () => setUserPill('Prince'));
  pillFriend.addEventListener('click', () => setUserPill('Friend'));

  saveBtn.addEventListener('click', () => {
    const room = roomInput.value.trim() || 'lounge';
    const server = serverInput.value.trim() || 'http://35.154.133.16';

    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        wt_server: server,
        wt_room: room,
        wt_user: selectedUser
      }, () => {
        statusText.textContent = 'Settings saved! Reload anime tab 🌸';
        statusText.style.color = '#ff2a85';
        setTimeout(() => {
          window.close();
        }, 1200);
      });
    } else {
      statusText.textContent = 'Saved!';
    }
  });
});
