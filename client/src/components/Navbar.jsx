import React from 'react';
import { LogOut, Shield, Home, Tv, FolderOpen, Sparkles, Download } from 'lucide-react';
import { UserAvatar } from './JojoAvatar';
import { PinkPopcornLogo } from './PinkPopcornLogo';

export function Navbar({ currentUser, appConfig, onNavigate, activeView, onLogout, onOpenAvatarModal }) {
  const isAdmin = currentUser?.role === 'admin';
  const isRoomView = activeView === 'room';
  const showStudio = appConfig?.modules?.mediaStudio !== false;
  const showDownloader = isAdmin && appConfig?.modules?.downloader !== false;

  const brandName = appConfig?.instanceName || 'Watch Together';

  return (
    <header className={`pink-navbar ${isRoomView ? 'theater-navbar-cinema' : ''}`}>
      {!isRoomView && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('home'); }} className="pink-brand">
            <PinkPopcornLogo size={36} />
            <div className="pink-brand-text">
              {brandName === 'Watch Together' ? <>Watch<span>Together</span></> : brandName}
            </div>
          </a>
        </div>
      )}

      <nav className={`nv2-track ${isRoomView ? 'is-cinema' : ''}`} aria-label="Main navigation">
        <button type="button" onClick={() => onNavigate('home')} aria-current={activeView === 'home' ? 'page' : undefined} className={`nv2-btn ${activeView === 'home' ? 'active' : ''}`}>
          <Home className="nv-duotone dt-home" />
          <span>Home</span>
        </button>
        <button type="button" onClick={() => onNavigate('room', 'lounge')} aria-current={activeView === 'room' ? 'page' : undefined} className={`nv2-btn ${activeView === 'room' ? 'active' : ''}`}>
          <Tv className="nv-duotone dt-room" />
          <span>Common Room</span>
        </button>
        <button type="button" onClick={() => onNavigate('library')} aria-current={activeView === 'library' ? 'page' : undefined} className={`nv2-btn tone-library ${activeView === 'library' ? 'active' : ''}`}>
          <FolderOpen className="nv-duotone dt-library" />
          <span>Media Library</span>
        </button>
        {showStudio && (
          <button type="button" onClick={() => onNavigate('studio')} aria-current={activeView === 'studio' ? 'page' : undefined} className={`nv2-btn ${activeView === 'studio' ? 'active' : ''}`}>
            <Sparkles className="nv-duotone dt-studio" />
            <span>Media Studio</span>
          </button>
        )}
        {showDownloader && (
          <button type="button" onClick={() => onNavigate('downloads')} aria-current={activeView === 'downloads' ? 'page' : undefined} className={`nv2-btn tone-downloads ${activeView === 'downloads' ? 'active' : ''}`}>
            <Download className="nv-duotone dt-downloads" />
            <span>Downloads</span>
          </button>
        )}
        {isAdmin && (
          <button type="button" onClick={() => onNavigate('admin')} aria-current={activeView === 'admin' ? 'page' : undefined} className={`nv2-btn tone-library ${activeView === 'admin' ? 'active' : ''}`}>
            <Shield className="nv-duotone dt-admin" />
            <span>Admin</span>
          </button>
        )}
      </nav>

      {isRoomView && <div className="nv2-notch theater-nav-notch-hint" aria-hidden="true" />}

      {!isRoomView && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div onClick={onOpenAvatarModal} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface)', border: '1.5px solid var(--border-pink)', borderRadius: '9999px', padding: '4px 12px', fontSize: '0.82rem', color: '#3b142d', fontWeight: 800, boxShadow: '0 2px 8px rgba(244, 114, 182, 0.12)', cursor: 'pointer' }} title="Click to customize profile picture">
            <UserAvatar user={currentUser} size={22} showBorder={true} />
            <span>{currentUser?.name || 'User'}</span>
          </div>
          <button type="button" onClick={onLogout} title="Sign Out" className="pink-btn-icon" style={{ width: '36px', height: '36px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogOut size={16} color="var(--text-muted)" />
          </button>
        </div>
      )}
    </header>
  );
}

export default Navbar;
