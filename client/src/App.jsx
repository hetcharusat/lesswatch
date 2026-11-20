import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HomeDashboard } from './components/HomeDashboard';
import { TheaterRoom } from './components/TheaterRoom';
import { MediaLibrary } from './components/MediaLibrary';
import { MediaStudio } from './components/MediaStudio';
import { DownloadsPage } from './components/DownloadsPage';
import { AuthGate } from './components/AuthGate';
import { AvatarUploadModal } from './components/AvatarUploadModal';
import SetupWizard from './components/SetupWizard';
import AdminPanel from './components/AdminPanel';
import { io } from 'socket.io-client';
import './styles/pink.css';

function pathToView(path) {
  if (path.startsWith('/room/')) return 'room';
  if (path === '/library' || path === '/media' || path === '/media-manager') return 'library';
  if (path === '/studio') return 'studio';
  if (path === '/downloads') return 'downloads';
  if (path === '/admin') return 'admin';
  if (path === '/setup') return 'setup';
  return 'home';
}

export default function App() {
  const [bootLoading, setBootLoading] = useState(true);
  const [appConfig, setAppConfig] = useState({
    setupCompleted: true,
    instanceName: 'LESSWATCH',
    allowPublicSignup: false,
    quickLoginEnabled: true,
    quickLoginMode: 'autofill',
    modules: { neko: true, downloader: true, mediaStudio: true, livekit: true }
  });
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('wt_token') || null);
  const [currentUser, setCurrentUser] = useState(null);
  const [dismissHttpNotice, setDismissHttpNotice] = useState(false);

  const [activeView, setActiveView] = useState(() => pathToView(window.location.pathname));
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
  const [liveData, setLiveData] = useState(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);

  // Boot check: fetch setup status + validate stored Bearer token via /api/auth/me
  useEffect(() => {
    let active = true;
    async function boot() {
      try {
        const statusRes = await fetch('/api/setup/status');
        const cfg = await statusRes.json();
        if (!active) return;
        setAppConfig(cfg);
        if (cfg?.instanceName) {
          document.title = `${cfg.instanceName} 🍿`;
        }

        const storedToken = localStorage.getItem('wt_token');
        if (cfg.setupCompleted && storedToken) {
          const meRes = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${storedToken}` }
          });
          if (meRes.ok) {
            const meData = await meRes.json();
            if (!active) return;
            setAuthToken(storedToken);
            setCurrentUser(meData.user);
            if (meData.config) setAppConfig(meData.config);
          } else {
            localStorage.removeItem('wt_token');
            localStorage.removeItem('wt_user');
            if (active) {
              setAuthToken(null);
              setCurrentUser(null);
            }
          }
        } else if (!cfg.setupCompleted) {
          localStorage.removeItem('wt_token');
          localStorage.removeItem('wt_user');
          if (active) {
            setAuthToken(null);
            setCurrentUser(null);
          }
        }
      } catch (err) {
        console.warn('Bootstrap error:', err);
      } finally {
        if (active) setBootLoading(false);
      }
    }
    boot();
    return () => { active = false; };
  }, []);

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
    socket.on('config:updated', (nextCfg) => {
      if (nextCfg) {
        setAppConfig(nextCfg);
        if (nextCfg.instanceName) {
          document.title = `${nextCfg.instanceName} 🍿`;
        }
      }
    });
    socket.on('auth:session_revoked', ({ userId }) => {
      setCurrentUser((prev) => {
        if (prev && prev.id === userId) {
          localStorage.removeItem('wt_token');
          localStorage.removeItem('wt_user');
          setAuthToken(null);
          setActiveView('home');
          return null;
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
      setActiveView(pathToView(path));
      if (path.startsWith('/room/')) {
        setActiveRoomId(path.split('/')[2] || 'lounge');
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
      } catch { }
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
    const token = authToken || localStorage.getItem('wt_token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => { });
    }
    localStorage.removeItem('wt_token');
    localStorage.removeItem('wt_user');
    setAuthToken(null);
    setCurrentUser(null);
    setActiveView('home');
    window.history.pushState({}, '', '/');
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

    const targetUrl =
      view === 'room' ? `/room/${roomId || 'lounge'}` :
        view === 'library' ? '/library' :
          view === 'studio' ? '/studio' :
            view === 'downloads' ? '/downloads' :
              view === 'admin' ? '/admin' : '/';
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

  if (bootLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#09090f' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2.5px solid rgba(244, 114, 182, 0.18)', borderTopColor: '#ec4899', animation: 'lwBootSpin 0.7s linear infinite' }} />
        <style>{`@keyframes lwBootSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const isSetupRequested = activeView === 'setup' || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('setup'));

  if (!appConfig?.setupCompleted || isSetupRequested) {
    return (
      <SetupWizard
        initialConfig={appConfig}
        isPreview={isSetupRequested && !!appConfig?.setupCompleted}
        onExitPreview={() => {
          window.history.pushState({}, '', '/');
          setActiveView('home');
        }}
        onComplete={(token, user, config) => {
          if (isSetupRequested && appConfig?.setupCompleted) {
            window.history.pushState({}, '', '/');
            setActiveView('home');
            return;
          }
          localStorage.setItem('wt_token', token);
          localStorage.setItem('wt_user', JSON.stringify(user));
          setAuthToken(token);
          setAppConfig(config);
          setCurrentUser(user);
          if (config?.instanceName) {
            document.title = `${config.instanceName} 🍿`;
          }
          window.history.pushState({}, '', '/');
          setActiveView('home');
        }}
      />
    );
  }

  if (!currentUser) {
    return (
      <AuthGate
        appConfig={appConfig}
        onAuthenticated={(user, token) => {
          setAuthToken(token || localStorage.getItem('wt_token'));
          setCurrentUser(user);
        }}
      />
    );
  }

  const isAdmin = currentUser?.role === 'admin';
  const downloaderEnabled = appConfig?.modules?.downloader !== false;
  const studioEnabled = appConfig?.modules?.mediaStudio !== false;
  const resolvedView =
    (activeView === 'admin' && !isAdmin) ? 'home' :
      (activeView === 'downloads' && (!isAdmin || !downloaderEnabled)) ? 'home' :
        (activeView === 'studio' && !studioEnabled) ? 'home' :
          (['home', 'library', 'studio', 'downloads', 'admin', 'room'].includes(activeView) ? activeView : 'home');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        currentUser={currentUser}
        appConfig={appConfig}
        onNavigate={handleNavigate}
        activeView={resolvedView}
        activeRoom={activeRoomId}
        onLogout={handleLogout}
        onOpenAvatarModal={() => setAvatarModalOpen(true)}
      />

      {/* Generic HTTPS / Secure Context Warning Banner */}
      {!window.isSecureContext && !dismissHttpNotice && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.92), rgba(168, 85, 247, 0.92))',
          color: '#fff',
          padding: '7px 16px',
          fontSize: '0.8rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          boxShadow: '0 4px 15px rgba(236, 72, 153, 0.25)',
          zIndex: 99
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🔒</span>
            <span>
              <strong>HTTPS Recommended:</strong> Browsers block microphone and camera permissions on plain HTTP origins. Place this app behind Caddy/Nginx/Traefik/Cloudflare with HTTPS for voice chat.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {currentUser?.role === 'admin' && (
              <button
                type="button"
                onClick={() => handleNavigate('admin')}
                className="btn-gold-shimmer"
                style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: 999, border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                Open Diagnostics
              </button>
            )}
            <button
              type="button"
              onClick={() => setDismissHttpNotice(true)}
              style={{ background: 'rgba(0,0,0,0.25)', border: 'none', color: '#fff', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {resolvedView === 'home' && (
        <main className="home-wrapper" style={{ paddingBottom: '3rem' }}>
          <HomeDashboard
            currentUser={currentUser}
            appConfig={appConfig}
            onNavigate={handleNavigate}
            onLaunchMedia={handleLaunchMedia}
            liveData={liveData}
            onOpenAvatarModal={() => setAvatarModalOpen(true)}
          />
        </main>
      )}

      {resolvedView === 'library' && (
        <main style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '1rem 1rem 3rem' }}>
          <MediaLibrary
            currentUser={currentUser}
            authToken={authToken}
            onPlayMedia={(file) => handleLaunchMedia({
              type: file.mediaType || (file.streamUrl?.includes('.m3u8') ? 'hls' : 'direct'),
              url: file.streamUrl,
              title: file.filename,
              roomId: 'lounge'
            })}
          />
        </main>
      )}

      {resolvedView === 'studio' && (
        <main>
          <MediaStudio
            currentUser={currentUser}
            authToken={authToken}
            onNavigate={handleNavigate}
            onPlayMedia={handleLaunchMedia}
          />
        </main>
      )}

      {resolvedView === 'downloads' && (
        <DownloadsPage onNavigate={handleNavigate} />
      )}

      {resolvedView === 'admin' && (
        <main style={{ width: '100%', paddingBottom: '3rem' }}>
          <AdminPanel
            authToken={authToken}
            currentUser={currentUser}
            appConfig={appConfig}
            onConfigUpdated={setAppConfig}
            onNavigate={handleNavigate}
          />
        </main>
      )}

      {resolvedView === 'room' && (
        <TheaterRoom
          roomId={activeRoomId}
          currentProfile={currentUser}
          appConfig={appConfig}
          initialMedia={initialMedia}
          initialTitle={initialTitle}
          initialType={initialType}
          onNavigate={handleNavigate}
          onConsumeInitialMedia={handleConsumeInitialMedia}
          onOpenAvatarModal={() => setAvatarModalOpen(true)}
        />
      )}

      <AvatarUploadModal
        isOpen={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        currentUser={currentUser}
        onAvatarUpdated={handleAvatarUpdated}
      />
    </div>
  );
}
