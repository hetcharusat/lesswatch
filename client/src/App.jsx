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
    instanceName: 'Watch Together',
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#09090f', color: '#f9a8d4', fontWeight: 600 }}>
        Loading Watch Together...
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
        <>
          {/* impeccable-variants-start 429a1a05 */}
          <div data-impeccable-variants="429a1a05" data-impeccable-variant-count="3" style={{ display: 'contents' }}>
            <div data-impeccable-variant="original">
              <main style={{ width: '100%', paddingBottom: '3rem' }}>
                <AdminPanel
                  authToken={authToken}
                  currentUser={currentUser}
                  appConfig={appConfig}
                  onConfigUpdated={setAppConfig}
                  onNavigate={handleNavigate}
                />
              </main>
            </div>
            {/* Variants: insert below this line */}
            <style data-impeccable-css="429a1a05">{`
              @scope ([data-impeccable-variant="1"]) {
                :scope > main {
                  --v1-tint: var(--p-blush-depth, 0.55);
                  width: 100%;
                  padding: 24px 20px 56px;
                  font-family: 'Outfit', 'Poppins', sans-serif;
                  color: #3b142d;
                }
                :scope .v1-shell {
                  max-width: 1120px;
                  margin: 0 auto;
                  display: flex;
                  flex-direction: column;
                  gap: 20px;
                }
                :scope .v1-topbar {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  flex-wrap: wrap;
                  gap: 14px;
                  padding: 16px 20px;
                  border-radius: 26px;
                  background: linear-gradient(155deg, rgba(255,255,255,0.97) 0%, rgba(255,240,248,0.95) 60%, rgba(253,224,240, calc(0.55 + 0.35 * var(--v1-tint))) 100%);
                  border: 1.5px solid rgba(255,255,255,0.96);
                  box-shadow: 0 14px 32px -10px rgba(244,114,182,0.3), inset 0 2px 4px rgba(255,255,255,0.98), inset 0 -3px 6px rgba(244,114,182,0.16);
                }
                :scope .v1-brand-row { display: flex; align-items: center; gap: 14px; }
                :scope .v1-title { margin: 0; font-size: 1.4rem; font-weight: 800; color: #3b142d; letter-spacing: -0.02em; display: flex; align-items: center; gap: 9px; }
                :scope .v1-sub { font-size: 0.84rem; color: #78345c; font-weight: 500; margin-top: 2px; }
                :scope .v1-tabs {
                  display: inline-flex;
                  gap: 6px;
                  padding: 5px;
                  border-radius: 999px;
                  background: rgba(251, 207, 232, 0.42);
                  border: 1.5px solid rgba(244, 114, 182, 0.28);
                  box-shadow: inset 0 2px 5px rgba(236, 72, 153, 0.12);
                }
                :scope .v1-tab {
                  display: inline-flex; align-items: center; gap: 7px;
                  padding: 8px 16px; border-radius: 999px; border: none;
                  font-family: inherit; font-size: 0.83rem; font-weight: 700; cursor: pointer;
                  background: transparent; color: #78345c; transition: all 0.18s cubic-bezier(0.34,1.56,0.64,1);
                }
                :scope .v1-tab.active {
                  background: linear-gradient(160deg, #ff5db0 0%, #ec4899 55%, #db2777 100%);
                  color: #fff;
                  box-shadow: 0 4px 0 #9d1366, 0 6px 14px rgba(236,72,153,0.38), inset 0 1px 0 rgba(255,255,255,0.4);
                  transform: translateY(-1px);
                }
                :scope .v1-clay-card {
                  border-radius: 26px;
                  padding: 20px 22px;
                  background: linear-gradient(155deg, rgba(255,255,255,0.98) 0%, rgba(255,242,249,0.95) 55%, rgba(254,226,242, calc(0.6 + 0.32 * var(--v1-tint))) 100%);
                  border: 1.5px solid rgba(255,255,255,0.98);
                  box-shadow: 0 16px 36px -8px rgba(244,114,182,0.28), 0 6px 14px -3px rgba(236,72,153,0.14), inset 0 2px 5px rgba(255,255,255,0.98), inset 0 -3px 6px rgba(244,114,182,0.18);
                  transition: transform 0.18s ease, box-shadow 0.18s ease;
                }
                :scope[data-p-bevel="soft"] .v1-clay-card {
                  box-shadow: 0 10px 24px -8px rgba(244,114,182,0.22), inset 0 1px 3px rgba(255,255,255,0.95), inset 0 -2px 3px rgba(244,114,182,0.12);
                }
                :scope[data-p-bevel="pillowy"] .v1-clay-card {
                  box-shadow: 0 22px 44px -8px rgba(236,72,153,0.34), 0 8px 0 rgba(244,114,182,0.22), inset 0 3px 8px #ffffff, inset 0 -5px 10px rgba(244,114,182,0.24);
                }
                :scope .v1-vault-bar {
                  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;
                }
                :scope .v1-row {
                  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;
                }
                :scope .v1-user-meta { display: flex; align-items: center; gap: 14px; }
                :scope .v1-avatar {
                  width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 1.15rem;
                  background: linear-gradient(155deg, #fbcfe8, #f472b6); color: #fff;
                  border: 2.5px solid #fff; box-shadow: 0 4px 12px rgba(236,72,153,0.32);
                }
                :scope .v1-name-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
                :scope .v1-name { font-weight: 800; font-size: 1rem; color: #3b142d; }
                :scope .v1-role { font-size: 0.7rem; font-weight: 800; padding: 3px 10px; border-radius: 999px; letter-spacing: 0.04em; text-transform: uppercase; }
                :scope .v1-role.admin { background: #fef3c7; color: #b45309; border: 1px solid rgba(245,158,11,0.45); }
                :scope .v1-role.member { background: #fce7f3; color: #be185d; border: 1px solid rgba(244,114,182,0.45); }
                :scope .v1-you { font-size: 0.74rem; font-weight: 800; color: #059669; }
                :scope .v1-sessions { font-size: 0.78rem; color: #78345c; font-weight: 600; }
                :scope .v1-email { font-size: 0.82rem; color: #a25d88; margin-top: 2px; font-weight: 500; }
                :scope .v1-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
                :scope .v1-btn-mint {
                  background: linear-gradient(160deg, #ecfdf5 0%, #d1fae5 100%);
                  border: 1.5px solid rgba(16,185,129,0.45); color: #047857;
                  padding: 6px 12px; border-radius: 12px; font-family: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer;
                  box-shadow: 0 3px 0 rgba(16,185,129,0.22), inset 0 1px 0 #fff;
                }
                :scope .v1-btn-amber {
                  background: linear-gradient(160deg, #fffbeb 0%, #fef3c7 100%);
                  border: 1.5px solid rgba(245,158,11,0.45); color: #b45309;
                  padding: 6px 11px; border-radius: 12px; font-family: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer;
                  display: inline-flex; align-items: center; gap: 5px;
                  box-shadow: 0 3px 0 rgba(245,158,11,0.22), inset 0 1px 0 #fff;
                }
                :scope .v1-btn-rose-danger {
                  background: linear-gradient(160deg, #fff1f2 0%, #ffe4e6 100%);
                  border: 1.5px solid rgba(244,63,94,0.4); color: #be123c;
                  padding: 6px 11px; border-radius: 12px; font-family: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer;
                  display: inline-flex; align-items: center; gap: 5px;
                  box-shadow: 0 3px 0 rgba(244,63,94,0.2), inset 0 1px 0 #fff;
                }
                :scope .v1-reveal-strip {
                  margin-top: 14px; padding: 11px 14px; border-radius: 14px;
                  background: linear-gradient(135deg, #fff8fc, #fce7f3);
                  border: 1.5px solid rgba(244,114,182,0.4);
                  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;
                }
                :scope .v1-pw-pill {
                  background: #fff; border: 1px solid rgba(236,72,153,0.3); color: #9d174d;
                  padding: 3px 10px; border-radius: 8px; font-weight: 700; font-size: 0.84rem;
                }
              }

              @scope ([data-impeccable-variant="2"]) {
                :scope > main {
                  --v2-frost: var(--p-frost-opacity, 0.92);
                  width: 100%;
                  padding: 24px 20px 56px;
                  font-family: 'Outfit', 'Poppins', sans-serif;
                  color: #3b142d;
                }
                :scope .v2-layout {
                  max-width: 1180px;
                  margin: 0 auto;
                  display: grid;
                  grid-template-columns: 270px minmax(0, 1fr);
                  gap: 20px;
                  align-items: start;
                }
                @media (max-width: 860px) {
                  :scope .v2-layout { grid-template-columns: 1fr; }
                }
                :scope .v2-sidebar {
                  position: sticky;
                  top: 84px;
                  border-radius: 26px;
                  padding: 20px;
                  background: linear-gradient(160deg, rgba(255,255,255, var(--v2-frost)) 0%, rgba(254,226,242, var(--v2-frost)) 100%);
                  border: 1.5px solid rgba(255,255,255,0.98);
                  box-shadow: 0 18px 36px -10px rgba(244,114,182,0.3), inset 0 2px 5px #fff, inset 0 -4px 8px rgba(244,114,182,0.16);
                  display: flex; flex-direction: column; gap: 16px;
                }
                :scope .v2-nav-stack { display: flex; flex-direction: column; gap: 8px; }
                :scope .v2-nav-item {
                  display: flex; align-items: center; justify-content: space-between; gap: 8px;
                  padding: 10px 14px; border-radius: 15px; border: 1.5px solid rgba(244,114,182,0.28);
                  background: rgba(255,255,255,0.75); color: #78345c;
                  font-family: inherit; font-weight: 700; font-size: 0.85rem; cursor: pointer;
                  box-shadow: 0 3px 0 rgba(244,114,182,0.16);
                }
                :scope .v2-nav-item.active {
                  background: linear-gradient(160deg, #ff5db0 0%, #ec4899 55%, #db2777 100%);
                  color: #fff; border-color: transparent;
                  box-shadow: 0 5px 0 #9d1366, 0 8px 18px rgba(236,72,153,0.35), inset 0 1px 0 rgba(255,255,255,0.35);
                }
                :scope .v2-content { display: flex; flex-direction: column; gap: 16px; }
                :scope .v2-vault-hero {
                  border-radius: 26px; padding: 20px 22px;
                  background: linear-gradient(145deg, rgba(255,255,255,0.98), rgba(252,231,243,0.92), rgba(243,232,255,0.85));
                  border: 1.5px solid rgba(255,255,255,0.98);
                  box-shadow: 0 14px 32px -8px rgba(244,114,182,0.26), inset 0 2px 5px #fff;
                  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
                }
                :scope .v2-grid {
                  display: grid;
                  grid-template-columns: repeat(2, minmax(0, 1fr));
                  gap: 16px;
                }
                :scope[data-p-grid-cols="1col"] .v2-grid { grid-template-columns: 1fr; }
                @media (max-width: 720px) {
                  :scope .v2-grid { grid-template-columns: 1fr; }
                }
                :scope .v2-member-card {
                  border-radius: 26px; padding: 20px;
                  background: linear-gradient(160deg, rgba(255,255,255,0.97) 0%, rgba(255,240,248,0.94) 100%);
                  border: 1.5px solid rgba(255,255,255,0.98);
                  box-shadow: 0 16px 32px -10px rgba(244,114,182,0.28), inset 0 2px 6px #fff, inset 0 -3px 7px rgba(244,114,182,0.16);
                  display: flex; flex-direction: column; gap: 14px;
                }
                :scope .v2-card-head { display: flex; align-items: center; gap: 13px; }
                :scope .v2-avatar-lg {
                  width: 54px; height: 54px; border-radius: 18px; display: grid; place-items: center; font-weight: 800; font-size: 1.35rem;
                  background: linear-gradient(150deg, #f9a8d4, #ec4899); color: #fff;
                  border: 2px solid #fff; box-shadow: 0 5px 0 rgba(190,24,93,0.3), 0 8px 16px rgba(236,72,153,0.25);
                }
                :scope .v2-chip-grid {
                  display: flex; flex-wrap: wrap; gap: 8px; padding-top: 10px;
                  border-top: 1.5px dashed rgba(244,114,182,0.28);
                }
              }

              @scope ([data-impeccable-variant="3"]) {
                :scope > main {
                  width: 100%;
                  padding: 24px 20px 56px;
                  font-family: 'Outfit', 'Poppins', sans-serif;
                  color: #3b142d;
                }
                :scope .v3-shell { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
                :scope .v3-header-strip {
                  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
                }
                :scope .v3-tray {
                  border-radius: 28px;
                  overflow: hidden;
                  background: linear-gradient(160deg, #fffdf9 0%, #fff4fa 55%, #fef3c7 140%);
                  border: 1.5px solid rgba(245,158,11,0.34);
                  box-shadow: 0 18px 40px -10px rgba(236,72,153,0.24), 0 4px 16px rgba(245,158,11,0.14), inset 0 2px 6px #fff;
                }
                :scope[data-p-gold-trim="subtle"] .v3-tray {
                  background: linear-gradient(160deg, #ffffff 0%, #fff6fa 75%, #fce7f3 100%);
                  border-color: rgba(244,114,182,0.38);
                }
                :scope .v3-tray-head {
                  padding: 20px 24px;
                  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
                  background: linear-gradient(90deg, rgba(253,242,248,0.9), rgba(254,243,199,0.55));
                  border-bottom: 1.5px solid rgba(244,114,182,0.22);
                }
                :scope .v3-gold-cta {
                  background: linear-gradient(155deg, #fbbf24 0%, #ec4899 65%, #db2777 100%);
                  color: #fff; border: none; padding: 10px 18px; border-radius: 15px;
                  font-family: inherit; font-weight: 800; font-size: 0.85rem; cursor: pointer;
                  display: inline-flex; align-items: center; gap: 7px;
                  box-shadow: 0 5px 0 #9d174d, 0 8px 18px rgba(236,72,153,0.35), inset 0 1px 0 rgba(255,255,255,0.45);
                }
                :scope .v3-row {
                  padding: 18px 24px;
                  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;
                  border-bottom: 1px solid rgba(244,114,182,0.2);
                }
                :scope[data-p-row-density="compact"] .v3-row { padding: 12px 22px; }
                :scope .v3-row:last-child { border-bottom: none; }
                :scope .v3-row:hover { background: rgba(253,242,248,0.55); }
              }
            `}</style>

            {/* VARIANT 1: Marshmallow Clay Ribbon */}
            <div
              data-impeccable-variant="1"
              data-impeccable-params='[{"id":"bevel","kind":"steps","default":"plump","label":"Clay Puffy Depth","options":[{"value":"soft","label":"Soft"},{"value":"plump","label":"Plump"},{"value":"pillowy","label":"Pillowy"}]},{"id":"blush-depth","kind":"range","min":0,"max":1,"step":0.05,"default":0.55,"label":"Blush Saturation"}]'
            >
              <main>
                <div className="v1-shell">
                  <div className="v1-topbar">
                    <div className="v1-brand-row">
                      <button type="button" className="btn-pink-secondary" onClick={() => onNavigate?.('home')}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                        Back
                      </button>
                      <div>
                        <h1 className="v1-title">
                          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
                          Admin Control Center
                        </h1>
                        <div className="v1-sub">Manage users, encrypted credential vault, login policies, modules, and host diagnostics</div>
                      </div>
                    </div>
                    <div className="v1-tabs">
                      <button type="button" className="v1-tab active">Users &amp; Vault</button>
                      <button type="button" className="v1-tab">Auth &amp; Modules</button>
                      <button type="button" className="v1-tab">Diagnostics</button>
                    </div>
                  </div>

                  <div className="v1-clay-card v1-vault-bar">
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#3b142d' }}>Accounts &amp; AES-256-GCM Credential Vault (2)</div>
                      <div style={{ fontSize: '0.84rem', color: '#78345c', marginTop: 3 }}>Passwords are salted &amp; hashed for login verification and stored encrypted so admins can recover or share credentials.</div>
                    </div>
                    <button type="button" className="btn-pink-primary">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
                      Create Member
                    </button>
                  </div>

                  <div className="v1-clay-card">
                    <div className="v1-row">
                      <div className="v1-user-meta">
                        <div className="v1-avatar">H</div>
                        <div>
                          <div className="v1-name-line">
                            <span className="v1-name">het</span>
                            <span className="v1-role admin">Admin</span>
                            <span className="v1-you">(You)</span>
                            <span className="v1-sessions">2 active session(s)</span>
                          </div>
                          <div className="v1-email">admin</div>
                        </div>
                      </div>
                      <div className="v1-actions">
                        <button type="button" className="v1-btn-mint">Quick-Login: Shown</button>
                        <button type="button" className="btn-pink-chip active">Hide Password</button>
                        <button type="button" className="btn-pink-secondary">Edit / Reset</button>
                      </div>
                    </div>
                    <div className="v1-reveal-strip">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.83rem' }}>
                        <span style={{ color: '#78345c', fontWeight: 600 }}>Decrypted Password:</span>
                        <code className="v1-pw-pill">••••••••</code>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="v1-btn-mint">Copy Password</button>
                        <button type="button" className="btn-pink-chip">Copy Login Info</button>
                      </div>
                    </div>
                  </div>

                  <div className="v1-clay-card">
                    <div className="v1-row">
                      <div className="v1-user-meta">
                        <div className="v1-avatar">R</div>
                        <div>
                          <div className="v1-name-line">
                            <span className="v1-name">riu</span>
                            <span className="v1-role member">Member</span>
                            <span className="v1-sessions">0 active session(s)</span>
                          </div>
                          <div className="v1-email">riu</div>
                        </div>
                      </div>
                      <div className="v1-actions">
                        <button type="button" className="v1-btn-mint">Quick-Login: Shown</button>
                        <button type="button" className="btn-pink-chip">Reveal Password</button>
                        <button type="button" className="btn-pink-secondary">Edit / Reset</button>
                        <button type="button" className="v1-btn-amber">Revoke</button>
                        <button type="button" className="v1-btn-rose-danger">Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            </div>

            {/* VARIANT 2: Boudoir Command Studio (Sidebar + Card Grid) */}
            <div
              data-impeccable-variant="2"
              style={{ display: 'none' }}
              data-impeccable-params='[{"id":"grid-cols","kind":"steps","default":"2col","label":"Card Columns","options":[{"value":"2col","label":"2 Columns"},{"value":"1col","label":"1 Column"}]},{"id":"frost-opacity","kind":"range","min":0.7,"max":1,"step":0.05,"default":0.92,"label":"Marshmallow Frost"}]'
            >
              <main>
                <div className="v2-layout">
                  <aside className="v2-sidebar">
                    <button type="button" className="btn-pink-secondary" onClick={() => onNavigate?.('home')} style={{ alignSelf: 'flex-start' }}>
                      &larr; Back to Home
                    </button>
                    <div>
                      <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#3b142d', letterSpacing: '-0.02em' }}>Admin Control Center</h1>
                      <div style={{ fontSize: '0.8rem', color: '#78345c', marginTop: 4, lineHeight: 1.4 }}>Credential vault, login policies, modules &amp; diagnostics</div>
                    </div>
                    <div className="v2-nav-stack">
                      <button type="button" className="v2-nav-item active"><span>Users &amp; Vault</span><span>2</span></button>
                      <button type="button" className="v2-nav-item"><span>Auth &amp; Modules</span><span>4</span></button>
                      <button type="button" className="v2-nav-item"><span>Diagnostics</span><span>Live</span></button>
                    </div>
                    <button type="button" className="btn-pink-primary" style={{ justifyContent: 'center', width: '100%' }}>
                      + Create Member
                    </button>
                  </aside>

                  <section className="v2-content">
                    <div className="v2-vault-hero">
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#3b142d' }}>Accounts &amp; AES-256-GCM Credential Vault</div>
                        <div style={{ fontSize: '0.83rem', color: '#78345c', marginTop: 3 }}>Salted login hashes paired with AES-256-GCM encrypted recovery for invited companions.</div>
                      </div>
                      <span className="btn-pink-chip active">2 Accounts Active</span>
                    </div>

                    <div className="v2-grid">
                      <div className="v2-member-card">
                        <div className="v2-card-head">
                          <div className="v2-avatar-lg">H</div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800, fontSize: '1.02rem', color: '#3b142d' }}>het</span>
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fef3c7', color: '#b45309' }}>ADMIN</span>
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#059669' }}>(You)</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#78345c', marginTop: 2 }}>admin &middot; 2 active session(s)</div>
                          </div>
                        </div>
                        <div className="v2-chip-grid">
                          <button type="button" className="btn-pink-chip">Quick-Login: Shown</button>
                          <button type="button" className="btn-pink-chip active">Reveal Password</button>
                          <button type="button" className="btn-pink-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.76rem' }}>Edit / Reset</button>
                        </div>
                      </div>

                      <div className="v2-member-card">
                        <div className="v2-card-head">
                          <div className="v2-avatar-lg">R</div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800, fontSize: '1.02rem', color: '#3b142d' }}>riu</span>
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fce7f3', color: '#be185d' }}>MEMBER</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#78345c', marginTop: 2 }}>riu &middot; 0 active session(s)</div>
                          </div>
                        </div>
                        <div className="v2-chip-grid">
                          <button type="button" className="btn-pink-chip">Quick-Login: Shown</button>
                          <button type="button" className="btn-pink-chip active">Reveal Password</button>
                          <button type="button" className="btn-pink-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.76rem' }}>Edit / Reset</button>
                          <button type="button" className="btn-pink-chip" style={{ color: '#b45309', borderColor: 'rgba(245,158,11,0.4)' }}>Revoke</button>
                          <button type="button" className="btn-pink-chip" style={{ color: '#be123c', borderColor: 'rgba(244,63,94,0.4)' }}>Delete</button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </main>
            </div>

            {/* VARIANT 3: Rosewater & Gold Jewelry Box */}
            <div
              data-impeccable-variant="3"
              style={{ display: 'none' }}
              data-impeccable-params='[{"id":"gold-trim","kind":"steps","default":"luxe","label":"Gold Shimmer","options":[{"value":"subtle","label":"Rose Only"},{"value":"luxe","label":"Champagne Gold"}]},{"id":"row-density","kind":"steps","default":"cozy","label":"Row Density","options":[{"value":"cozy","label":"Cozy"},{"value":"compact","label":"Compact"}]}]'
            >
              <main>
                <div className="v3-shell">
                  <div className="v3-header-strip">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button type="button" className="btn-pink-secondary" onClick={() => onNavigate?.('home')}>&larr; Back</button>
                      <div>
                        <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#3b142d', letterSpacing: '-0.02em' }}>Admin Control Center</h1>
                        <div style={{ fontSize: '0.83rem', color: '#78345c' }}>Manage users, encrypted credential vault, login policies, modules, and host diagnostics</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn-pink-primary">Users &amp; Vault</button>
                      <button type="button" className="btn-pink-secondary">Auth &amp; Modules</button>
                      <button type="button" className="btn-pink-secondary">Diagnostics</button>
                    </div>
                  </div>

                  <div className="v3-tray">
                    <div className="v3-tray-head">
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1.04rem', color: '#3b142d' }}>Accounts &amp; AES-256-GCM Credential Vault (2)</div>
                        <div style={{ fontSize: '0.82rem', color: '#78345c', marginTop: 2 }}>Passwords are salted &amp; hashed for verification and AES-256-GCM encrypted for instant sharing.</div>
                      </div>
                      <button type="button" className="v3-gold-cta">+ Create Member</button>
                    </div>

                    <div className="v3-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, background: 'linear-gradient(135deg, #fbbf24, #ec4899)', color: '#fff', border: '2px solid #fff', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>H</div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ fontSize: '0.98rem', color: '#3b142d' }}>het</strong>
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fef3c7', color: '#b45309' }}>ADMIN</span>
                            <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#059669' }}>(You)</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#78345c' }}>admin &middot; 2 active session(s)</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="btn-pink-chip">Quick-Login: Shown</button>
                        <button type="button" className="btn-pink-chip active">Reveal Password</button>
                        <button type="button" className="btn-pink-secondary">Edit / Reset</button>
                      </div>
                    </div>

                    <div className="v3-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, background: 'linear-gradient(135deg, #f9a8d4, #ec4899)', color: '#fff', border: '2px solid #fff', boxShadow: '0 4px 12px rgba(236,72,153,0.3)' }}>R</div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ fontSize: '0.98rem', color: '#3b142d' }}>riu</strong>
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fce7f3', color: '#be185d' }}>MEMBER</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#78345c' }}>riu &middot; 0 active session(s)</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="btn-pink-chip">Quick-Login: Shown</button>
                        <button type="button" className="btn-pink-chip active">Reveal Password</button>
                        <button type="button" className="btn-pink-secondary">Edit / Reset</button>
                        <button type="button" className="btn-pink-chip" style={{ color: '#b45309' }}>Revoke</button>
                        <button type="button" className="btn-pink-chip" style={{ color: '#be123c' }}>Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </div>
          {/* impeccable-variants-end 429a1a05 */}
        </>
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
