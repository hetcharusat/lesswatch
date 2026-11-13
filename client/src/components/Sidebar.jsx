import React from 'react';
import { LogOut, Shield } from 'lucide-react';
import { UserAvatar } from './JojoAvatar';
import { PinkPopcornLogo } from './PinkPopcornLogo';
import { ClayHome, ClayTv, ClayFolder, ClayDownload, ClayClose, ClayPlay, ClaySparkle } from './ClayIcons';

export function Sidebar({ isOpen, onClose, activeView, onNavigate, currentUser, appConfig, onLogout, liveData }) {
  const isAdmin = currentUser?.role === 'admin';
  const showStudio = appConfig?.modules?.mediaStudio !== false;
  const showDownloader = isAdmin && appConfig?.modules?.downloader !== false;
  const brandName = appConfig?.instanceName || 'Watch Together';

  function handleNav(view) {
    onNavigate(view);
    if (onClose) onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`pink-sidebar-backdrop ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className={`pink-sidebar-drawer ${isOpen ? 'open' : ''}`} style={{ background: '#ffffff', borderRight: '1.5px solid rgba(244, 114, 182, 0.35)' }}>
        {/* Header */}
        <div className="pink-sidebar-header" style={{ borderBottom: '1.5px solid rgba(244, 114, 182, 0.25)' }}>
          <div className="pink-brand" style={{ cursor: 'pointer' }} onClick={() => handleNav('home')}>
            <PinkPopcornLogo size={32} />
            <div className="pink-brand-text">
              {brandName === 'Watch Together' ? <>Watch<span>Together</span></> : brandName}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }} title="Close Menu">
            <ClayClose size={20} />
          </button>
        </div>

        {/* Live Lounge Pulse Notice (if active) */}
        {liveData?.isWatching && (
          <div
            onClick={() => handleNav('room')}
            style={{
              margin: '0.75rem 1rem',
              padding: '0.75rem 0.9rem',
              background: 'linear-gradient(135deg, rgba(236,72,153,0.12), rgba(244,114,182,0.18))',
              border: '1.5px solid var(--pink-pastel)',
              borderRadius: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 3px 10px rgba(244,114,182,0.15)',
              transition: 'all 0.2s ease'
            }}
          >
            <span className="pink-pulse-dot" style={{ width: '9px', height: '9px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#be185d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                LIVE IN ROOM
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#3b142d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {liveData.activeTitle || 'Movie Stream'}
              </div>
            </div>
            <span style={{ fontSize: '0.76rem', color: '#be185d', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ClayPlay size={14} />
              <span>Join</span>
            </span>
          </div>
        )}

        {/* Navigation Section */}
        <div style={{ padding: '0.75rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#78345c', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.4rem 0.6rem' }}>
            Menu
          </div>

          {/* Home Link */}
          <button
            onClick={() => handleNav('home')}
            className={`pink-sidebar-link ${activeView === 'home' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, color: activeView === 'home' ? '#be185d' : '#3b142d' }}
          >
            <ClayHome size={20} />
            <span>Home</span>
          </button>

          {/* Common Room Link */}
          <button
            onClick={() => handleNav('room')}
            className={`pink-sidebar-link ${activeView === 'room' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, color: activeView === 'room' ? '#be185d' : '#3b142d' }}
          >
            <ClayTv size={20} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>Common Room</span>
              <span style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: '9999px',
                background: liveData?.isWatching ? 'rgba(236,72,153,0.18)' : 'rgba(244,114,182,0.12)',
                color: liveData?.isWatching ? '#be185d' : '#78345c',
                fontWeight: 700
              }}>
                {liveData?.isWatching ? 'Live' : 'Lounge'}
              </span>
            </div>
          </button>

          {/* Media Library Link */}
          <button
            onClick={() => handleNav('library')}
            className={`pink-sidebar-link ${activeView === 'library' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, color: activeView === 'library' ? '#b45309' : '#3b142d' }}
          >
            <ClayFolder size={20} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>Media Library</span>
            </div>
          </button>

          {/* Media Studio & Web Optimizer Link */}
          {showStudio && (
            <button
              onClick={() => handleNav('studio')}
              className={`pink-sidebar-link ${activeView === 'studio' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, color: activeView === 'studio' ? '#be185d' : '#3b142d' }}
            >
              <ClaySparkle size={20} color={activeView === 'studio' ? '#ec4899' : undefined} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span>Media Studio</span>
                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '6px', background: 'rgba(236,72,153,0.18)', color: '#be185d', fontWeight: 800 }}>
                  Optimizer
                </span>
              </div>
            </button>
          )}

          {/* Downloads Link (Admin Only) */}
          {showDownloader && (
            <button
              onClick={() => handleNav('downloads')}
              className={`pink-sidebar-link ${activeView === 'downloads' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, color: activeView === 'downloads' ? '#047857' : '#3b142d' }}
            >
              <ClayDownload size={20} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span>Server Downloads</span>
              </div>
            </button>
          )}

          {/* Admin Control Center Link */}
          {isAdmin && (
            <button
              onClick={() => handleNav('admin')}
              className={`pink-sidebar-link ${activeView === 'admin' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, color: activeView === 'admin' ? '#b45309' : '#3b142d' }}
            >
              <Shield size={18} color={activeView === 'admin' ? '#d97706' : '#78345c'} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span>Admin Panel</span>
              </div>
            </button>
          )}
        </div>

        {/* Footer User Profile Card */}
        <div className="pink-sidebar-footer" style={{ borderTop: '1.5px solid rgba(244, 114, 182, 0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UserAvatar user={currentUser} size={36} showBorder={true} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#3b142d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentUser?.name || 'User'}
              </div>
            </div>
            <button
              onClick={onLogout}
              title="Sign Out"
              style={{ width: '34px', height: '34px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <LogOut size={16} color="var(--text-muted)" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
