import React, { useState, useEffect, useRef } from 'react';
import { LogOut } from 'lucide-react';
import { UserAvatar } from './JojoAvatar';
import { PinkPopcornLogo } from './PinkPopcornLogo';
import { ClayHome, ClayTv, ClayFolder, ClayDownload, ClaySparkle } from './ClayIcons';

export function Navbar({ currentUser, onNavigate, activeView, activeRoom, onLogout, onOpenAvatarModal }) {
  const isAdmin = currentUser?.role === 'admin' || currentUser?.name?.toLowerCase() === 'het';
  const isRoomView = activeView === 'room';

  const navRef = useRef(null);
  const btnRefs = useRef({});
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });

  useEffect(() => {
    const activeKey = activeView === 'room' ? 'room' : activeView;
    const activeEl = btnRefs.current[activeKey];
    if (activeEl && navRef.current) {
      const navRect = navRef.current.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      setIndicatorStyle({
        left: elRect.left - navRect.left,
        width: elRect.width,
        opacity: 1
      });
    }
  }, [activeView, isRoomView]);

  return (
    <header className={`pink-navbar ${isRoomView ? 'theater-navbar-cinema' : ''}`}>
      {/* Brand (Hidden in theater room to blend seamlessly with player) */}
      {!isRoomView && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('home');
            }}
            className="pink-brand"
          >
            <PinkPopcornLogo size={36} />
            <div className="pink-brand-text">
              Watch<span>Together</span>
            </div>
          </a>
        </div>
      )}

      {/* Center Nav Links with Sliding Apple-smooth Indicator */}
      <nav
        ref={navRef}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          background: isRoomView ? 'rgba(18, 12, 26, 0.88)' : 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          padding: '5px 8px',
          borderRadius: '9999px',
          border: isRoomView ? '1.5px solid rgba(244, 114, 182, 0.25)' : '1.5px solid var(--border-pink)',
          boxShadow: isRoomView ? '0 4px 20px rgba(0, 0, 0, 0.6)' : '0 4px 16px rgba(244, 114, 182, 0.16)'
        }}
      >
        {/* Sliding Capsule Pill */}
        <div
          style={{
            position: 'absolute',
            top: '5px',
            bottom: '5px',
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
            borderRadius: '9999px',
            background: activeView === 'room'
              ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)'
              : activeView === 'library'
              ? 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.35))'
              : activeView === 'downloads'
              ? 'linear-gradient(135deg, rgba(16,185,129,0.22), rgba(52,211,153,0.32))'
              : 'linear-gradient(135deg, rgba(236,72,153,0.22), rgba(244,114,182,0.32))',
            boxShadow: activeView === 'room' ? '0 4px 14px rgba(236, 72, 153, 0.45)' : 'none',
            border: activeView === 'room' ? 'none' : '1.5px solid rgba(244, 114, 182, 0.45)',
            opacity: indicatorStyle.opacity,
            transition: 'left 0.35s cubic-bezier(0.32, 0.72, 0, 1), width 0.35s cubic-bezier(0.32, 0.72, 0, 1), background 0.3s ease',
            pointerEvents: 'none',
            zIndex: 1
          }}
        />

        <button
          ref={(el) => (btnRefs.current['home'] = el)}
          onClick={() => onNavigate('home')}
          style={{
            position: 'relative',
            zIndex: 2,
            background: 'transparent',
            border: 'none',
            color: activeView === 'home' ? '#be185d' : (isRoomView ? '#cbd5e1' : 'var(--text-muted)'),
            padding: '5px 14px',
            borderRadius: '9999px',
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'color 0.25s ease'
          }}
        >
          <ClayHome size={18} />
          <span>Home</span>
        </button>

        <button
          ref={(el) => (btnRefs.current['room'] = el)}
          onClick={() => onNavigate('room', 'lounge')}
          style={{
            position: 'relative',
            zIndex: 2,
            background: 'transparent',
            border: 'none',
            color: activeView === 'room' ? '#ffffff' : (isRoomView ? '#cbd5e1' : 'var(--text-muted)'),
            padding: '6px 16px',
            borderRadius: '9999px',
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'color 0.25s ease'
          }}
        >
          <ClayTv size={18} />
          <span>Common Room</span>
        </button>

        <button
          ref={(el) => (btnRefs.current['library'] = el)}
          onClick={() => onNavigate('library')}
          style={{
            position: 'relative',
            zIndex: 2,
            background: 'transparent',
            border: 'none',
            color: activeView === 'library' ? '#b45309' : (isRoomView ? '#cbd5e1' : 'var(--text-muted)'),
            padding: '5px 14px',
            borderRadius: '9999px',
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'color 0.25s ease'
          }}
        >
          <ClayFolder size={18} />
          <span>Media Library</span>
        </button>

        <button
          ref={(el) => (btnRefs.current['studio'] = el)}
          onClick={() => onNavigate('studio')}
          style={{
            position: 'relative',
            zIndex: 2,
            background: 'transparent',
            border: 'none',
            color: activeView === 'studio' ? '#be185d' : (isRoomView ? '#cbd5e1' : 'var(--text-muted)'),
            padding: '5px 14px',
            borderRadius: '9999px',
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'color 0.25s ease'
          }}
        >
          <ClaySparkle size={18} color={activeView === 'studio' ? '#ec4899' : undefined} />
          <span>Media Studio</span>
        </button>

        {isAdmin && (
          <button
            ref={(el) => (btnRefs.current['downloads'] = el)}
            onClick={() => onNavigate('downloads')}
            style={{
              position: 'relative',
              zIndex: 2,
              background: 'transparent',
              border: 'none',
              color: activeView === 'downloads' ? '#047857' : (isRoomView ? '#cbd5e1' : 'var(--text-muted)'),
              padding: '5px 14px',
              borderRadius: '9999px',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.25s ease'
            }}
          >
            <ClayDownload size={18} />
            <span>Downloads</span>
          </button>
        )}
      </nav>

      {/* Floating Cinema Pull Notch */}
      {isRoomView && (
        <div
          className="theater-nav-notch-hint"
          style={{
            position: 'absolute',
            bottom: '2px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '32px',
            height: '3px',
            borderRadius: '9999px',
            background: 'rgba(244, 114, 182, 0.5)',
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Right Controls (Hidden in theater room to eliminate clutter and blend with player) */}
      {!isRoomView && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            onClick={onOpenAvatarModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--bg-surface)',
              border: '1.5px solid var(--border-pink)',
              borderRadius: '9999px',
              padding: '4px 12px',
              fontSize: '0.82rem',
              color: '#3b142d',
              fontWeight: 800,
              boxShadow: '0 2px 8px rgba(244, 114, 182, 0.12)',
              cursor: 'pointer',
              transition: 'transform 0.15s ease'
            }}
            title="Click to customize profile picture"
          >
            <UserAvatar user={currentUser} size={22} showBorder={true} />
            <span>{currentUser?.name || 'User'}</span>
          </div>

          <button
            onClick={onLogout}
            title="Sign Out"
            className="pink-btn-icon"
            style={{ width: '36px', height: '36px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <LogOut size={16} color="var(--text-muted)" />
          </button>
        </div>
      )}
    </header>
  );
}

export default Navbar;
