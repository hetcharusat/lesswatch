import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { LiveBanner } from './components/LiveBanner';
import { HomeDashboard } from './components/HomeDashboard';
import { TheaterRoom } from './components/TheaterRoom';
import { MediaLibrary } from './components/MediaLibrary';
import { MediaStudio } from './components/MediaStudio';
import { DownloadsPage } from './components/DownloadsPage';
import { AuthGate } from './components/AuthGate';
import { AvatarUploadModal } from './components/AvatarUploadModal';
import { io } from 'socket.io-client';
import './styles/pink.css';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('wt_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u.name) {
          u.name = u.name.replace(/^(jotaro|jolyne|joyeline)\s+/i, '').replace(/^riaa$/i, 'Ria').trim();
        }
        return u;
      }
      return null;
    } catch {
      return null;
    }
  });

  const [activeView, setActiveView] = useState(() => {
    const path = window.location.pathname;
    if (path.startsWith('/room/')) return 'room';
    if (path === '/library' || path === '/media' || path === '/media-manager') return 'library';
    if (path === '/studio') return 'studio';
    if (path === '/downloads') return 'downloads';
    return 'home';
  });

  const [activeRoomId, setActiveRoomId] = useState(() => {
    const path = window.location.pathname;
    if (path.startsWith('/room/')) {
      return path.split('/')[2] || 'lounge';
    }
    return 'lounge';
  });

  const [initialMedia, setInitialMedia] = useState(null);
  const [initialTitle, setInitialTitle] = useState(null);
  const [initialType, setInitialType] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [liveData, setLiveData] = useState(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);

  const handleAvatarUpdated = (newAvatar) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, avatar: newAvatar };
      localStorage.setItem('wt_user', JSON.stringify(updated));
      localStorage.setItem('wt_avatar', newAvatar);
      return updated;
    });
  };

  useEffect(() => {
    const socket = io({ path: '/api/v1/sync/' });
    socket.on('user:avatar_changed', ({ username, avatar }) => {
      setCurrentUser((prev) => {
        if (!prev) return prev;
        if (prev.name?.toLowerCase() === username?.toLowerCase()) {
          const updated = { ...prev, avatar };
          localStorage.setItem('wt_user', JSON.stringify(updated));
          localStorage.setItem('wt_avatar', avatar);
          return updated;
        }
        return prev;
      });
    });
    return () => socket.disconnect();
  }, []);

  // Sync browser back/forward buttons with active view
  useEffect(() => {
    function handlePopState() {
      const path = window.location.pathname;
      if (path.startsWith('/room/')) {
        setActiveView('room');
        setActiveRoomId(path.split('/')[2] || 'lounge');
      } else if (path === '/library' || path === '/media' || path === '/media-manager') {
        setActiveView('library');
      } else if (path === '/studio') {
        setActiveView('studio');
      } else if (path === '/downloads') {
        setActiveView('downloads');
      } else {
        setActiveView('home');
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('wt_user', JSON.stringify(currentUser));
      localStorage.setItem('wt_username', currentUser.name);
      localStorage.setItem('wt_avatar', currentUser.avatar);
      localStorage.setItem('wt_color', currentUser.color);
    }
  }, [currentUser]);

  // Global real-time listener for live status
  useEffect(() => {
    let isMounted = true;
    async function checkLive() {
      try {
        const res = await fetch('/api/live-status');
        const data = await res.json();
        if (isMounted) setLiveData(data);
      } catch {}
    }
    checkLive();

    const socket = io({
      path: '/api/v1/sync',
      transports: ['websocket', 'polling']
    });
    socket.on('live:update', (data) => {
      if (isMounted) setLiveData(data);
    });

    const interval = setInterval(checkLive, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  function handleLogout() {
    localStorage.removeItem('wt_token');
    localStorage.removeItem('wt_user');
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setCurrentUser(null);
    setActiveView('home');
  }

  function handleNavigate(view, roomId = 'lounge', media = null, title = null, type = null) {
    setActiveView(view);
    setActiveRoomId(roomId || 'lounge');
    if (media) {
      setInitialMedia(media);
      const determinedType = type || (
        media.includes('youtube') || media.includes('youtu.be') ? 'youtube' :
        media.includes('neko') ? 'neko' :
        media.includes('.m3u8') ? 'hls' : 'direct'
      );
      setInitialType(determinedType);
      if (title) setInitialTitle(title);
    } else {
      setInitialMedia(null);
      setInitialTitle(null);
      setInitialType(null);
    }

    const targetUrl = view === 'room' ? `/room/${roomId || 'lounge'}` : (view === 'library' ? '/library' : (view === 'studio' ? '/studio' : (view === 'downloads' ? '/downloads' : '/')));
    window.history.pushState({}, '', targetUrl);
  }

  function handleLaunchMedia({ type, url, title, roomId = 'lounge' }) {
    const resolvedType = type || (url?.includes('.m3u8') ? 'hls' : (url?.includes('youtube.com') || url?.includes('youtu.be') ? 'youtube' : 'direct'));
    setInitialType(resolvedType);
    setInitialMedia(url);
    setInitialTitle(title);
    setActiveRoomId(roomId || 'lounge');
    setActiveView('room');
    window.history.pushState({}, '', `/room/${roomId || 'lounge'}`);
  }

  function handleConsumeInitialMedia() {
    setInitialMedia(null);
    setInitialTitle(null);
    setInitialType(null);
  }

  if (!currentUser) {
    return <AuthGate onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        onNavigate={handleNavigate}
        activeView={activeView}
        activeRoom={activeRoomId}
        onLogout={handleLogout}
        onOpenAvatarModal={() => setAvatarModalOpen(true)}
      />

      {/* Secure HTTPS / Custom Domain Notice Banner */}
      {window.location.protocol === 'http:' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('letswatch.atmyhome.tech') && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.95), rgba(168, 85, 247, 0.95))',
          color: '#fff',
          padding: '7px 16px',
          fontSize: '0.8rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 15px rgba(236, 72, 153, 0.35)',
          zIndex: 99
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔒</span>
            <span><strong>Domain Ready:</strong> Point <code>letswatch.atmyhome.tech</code> to <code>35.154.133.16</code> for automated SSL, zero firewall bans, and full Mic/Cam!</span>
          </div>
          <a
            href={`https://letswatch.atmyhome.tech${window.location.pathname}${window.location.search}`}
            className="btn-gold-shimmer"
            style={{
              padding: '4px 12px',
              fontSize: '0.78rem',
              borderRadius: '999px',
              textDecoration: 'none',
              color: '#fff',
              whiteSpace: 'nowrap'
            }}
          >
            Open letswatch.atmyhome.tech ⚡
          </a>
        </div>
      )}

      {/* Home Dashboard */}
      {activeView === 'home' && (
        <main className="home-wrapper" style={{ paddingBottom: '3rem' }}>
          <HomeDashboard
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onLaunchMedia={handleLaunchMedia}
            liveData={liveData}
            onOpenAvatarModal={() => setAvatarModalOpen(true)}
          />
        </main>
      )}

      {/* Dedicated Media Library Page */}
      {activeView === 'library' && (
        <main style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '1rem 1rem 3rem' }}>
          <MediaLibrary
            currentUser={currentUser}
            onPlayMedia={(file) => handleLaunchMedia({
              type: file.mediaType || (file.streamUrl?.includes('.m3u8') ? 'hls' : 'direct'),
              url: file.streamUrl,
              title: file.filename,
              roomId: 'lounge'
            })}
          />
        </main>
      )}

      {/* Dedicated Media Studio & Web Optimizer Page */}
      {activeView === 'studio' && (
        <main>
          <MediaStudio
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onPlayMedia={handleLaunchMedia}
          />
        </main>
      )}

      {/* Dedicated Server Downloads Page (Admin Het) */}
      {activeView === 'downloads' && (
        <DownloadsPage onNavigate={handleNavigate} />
      )}

      {/* Synchronized Common Theater Room */}
      {activeView === 'room' && (
        <TheaterRoom
          roomId={activeRoomId}
          currentProfile={currentUser}
          initialMedia={initialMedia}
          initialTitle={initialTitle}
          initialType={initialType}
          onNavigate={handleNavigate}
          onConsumeInitialMedia={handleConsumeInitialMedia}
          onOpenAvatarModal={() => setAvatarModalOpen(true)}
        />
      )}

      {/* Custom Web-Ready Profile Picture Upload Modal */}
      <AvatarUploadModal
        isOpen={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        currentUser={currentUser}
        onAvatarUpdated={handleAvatarUpdated}
      />
    </div>
  );
}
