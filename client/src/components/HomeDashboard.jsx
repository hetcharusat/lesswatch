import React, { useState, useEffect } from 'react';
import { CreateRoomModal } from './CreateRoomModal';
import { UserAvatar } from './JojoAvatar';
import {
  ClayTv,
  ClayFilm,
  ClayFolder,
  ClayDownload,
  ClayPlay,
  ClaySparkle,
  ClayPopcorn
} from './ClayIcons';

export function HomeDashboard({ currentUser, onNavigate, onLaunchMedia, liveData: propLiveData, onOpenAvatarModal }) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [liveData, setLiveData] = useState(propLiveData || null);
  const isAdmin = currentUser?.role === 'admin' || currentUser?.name?.toLowerCase() === 'het';

  useEffect(() => {
    if (propLiveData !== undefined) {
      setLiveData(propLiveData);
    }
  }, [propLiveData]);

  function handleModalLaunch(mediaConfig) {
    if (onLaunchMedia) {
      onLaunchMedia(mediaConfig);
    } else {
      onNavigate('room', mediaConfig.roomId || 'lounge', mediaConfig.url, mediaConfig.title, mediaConfig.type);
    }
  }

  const isRoomActive = liveData?.isWatching;
  const isOtherUserInRoom = liveData?.watchers?.some((w) => w.name?.toLowerCase() !== currentUser?.name?.toLowerCase());

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto', width: '100%', padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* 1. Pinterest Aesthetic Welcome Card */}
      <div className="holographic-card" style={{ padding: '2rem 2.25rem', background: '#ffffff', border: '1.5px solid rgba(244, 114, 182, 0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div
              onClick={onOpenAvatarModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.3rem 0.85rem',
                borderRadius: '9999px',
                background: 'rgba(244,114,182,0.15)',
                border: '1.5px solid var(--border-pink)',
                marginBottom: '0.75rem',
                cursor: 'pointer',
                transition: 'transform 0.15s ease'
              }}
              title="Click to customize profile picture"
            >
              <UserAvatar user={currentUser} size={20} showBorder={true} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#be185d' }}>
                {currentUser?.name || 'Friend'}
              </span>
            </div>

            <h1 style={{
              fontSize: '2.1rem',
              fontWeight: 800,
              color: '#831843',
              margin: '0 0 0.4rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              letterSpacing: '-0.02em'
            }}>
              <span>Hiee, {currentUser?.name || 'Friend'}</span>
              <ClaySparkle size={26} />
            </h1>

            <p style={{ fontSize: '0.92rem', color: '#78345c', margin: 0, maxWidth: '620px', lineHeight: 1.5, fontWeight: 500 }}>
              Your synchronized cinema is ready. Watch together in real-time, stream from cloud storage, or browse with the shared browser.
            </p>
          </div>
        </div>
      </div>

      {/* 2. REAL-TIME COMMON ROOM STATE CARD */}
      <div
        className="holographic-card"
        style={{
          padding: '1.75rem 2rem',
          border: isRoomActive ? '1.5px solid #ec4899' : '1.5px solid rgba(244, 114, 182, 0.35)',
          background: isRoomActive
            ? 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(251,207,232,0.55) 100%)'
            : '#ffffff',
          boxShadow: isRoomActive ? 'var(--shadow-glitter)' : '0 4px 16px rgba(244, 114, 182, 0.12)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1, minWidth: '260px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: isRoomActive
                ? 'linear-gradient(135deg, rgba(236,72,153,0.2), rgba(244,114,182,0.3))'
                : 'rgba(244,114,182,0.1)',
              border: isRoomActive ? '1.5px solid var(--pink-rose)' : '1px solid var(--border-pink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isRoomActive ? '0 0 16px rgba(236,72,153,0.3)' : 'none'
            }}>
              <ClayTv size={32} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                <span className={isRoomActive ? 'pink-pulse-dot' : 'status-dot'} style={{ background: isRoomActive ? '#ec4899' : '#a25d88' }} />
                <span style={{
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: isRoomActive ? '#be185d' : '#78345c'
                }}>
                  {isRoomActive ? 'Live in Common Room' : 'Common Room Idle'}
                </span>
              </div>

              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: '#3b142d',
                margin: '0 0 0.35rem 0'
              }}>
                {isRoomActive ? (liveData?.title || 'Active Movie/Video') : 'Nothing currently playing'}
              </h2>

              {isRoomActive && liveData?.watchers && liveData.watchers.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.76rem', color: '#78345c', fontWeight: 600 }}>Watching now:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {liveData.watchers.map((w, idx) => (
                      <span
                        key={idx}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: 'rgba(244, 114, 182, 0.15)',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: '#831843'
                        }}
                      >
                        <UserAvatar user={w} size={15} showBorder={false} />
                        <span>{w.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            {isRoomActive ? (
              <button
                onClick={() => onNavigate('room', 'lounge')}
                className="btn-pink-primary"
                style={{ padding: '0.75rem 1.6rem', fontSize: '0.92rem', fontWeight: 800, gap: '8px' }}
              >
                <ClayPlay size={18} />
                <span>Join Stream</span>
              </button>
            ) : (
              <button
                onClick={() => setCreateModalOpen(true)}
                className="btn-gold-shimmer"
                style={{ padding: '0.75rem 1.6rem', fontSize: '0.92rem', fontWeight: 800, gap: '8px' }}
              >
                <ClayPopcorn size={18} />
                <span>Start Watch Party</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Navigation Cards (Media Library & Downloads) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isAdmin ? 'repeat(2, 1fr)' : '1fr',
        gap: '1.25rem'
      }}>
        {/* Card 1: Cloud Media Library */}
        <div className="holographic-card" style={{ padding: '1.6rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#ffffff', border: '1.5px solid rgba(244, 114, 182, 0.35)' }}>
          <div>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(251,191,36,0.18), rgba(245,158,11,0.22))',
              border: '1px solid var(--gold-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <ClayFilm size={26} />
            </div>
            <h3 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#831843', margin: '0 0 0.35rem 0' }}>
              Media Library
            </h3>
            <p style={{ fontSize: '0.84rem', color: '#78345c', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
              Organize movie and anime files in folders, rename, delete, and launch any MKV/MP4 with multi-audio and subtitles into the Common Room.
            </p>
          </div>

          <button
            onClick={() => onNavigate('library')}
            className="btn-pink-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem', padding: '0.7rem', gap: '8px' }}
          >
            <ClayFolder size={18} />
            <span>Open Media Library</span>
          </button>
        </div>

        {/* Card 2: Server Downloader (Admin Het Only) */}
        {isAdmin && (
          <div className="holographic-card" style={{ padding: '1.6rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#ffffff', border: '1.5px solid rgba(244, 114, 182, 0.35)' }}>
            <div>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(52,211,153,0.22))',
                border: '1px solid rgba(16,185,129,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem'
              }}>
                <ClayDownload size={26} />
              </div>
              <h3 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#831843', margin: '0 0 0.35rem 0' }}>
                Server Downloader
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#78345c', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
                High-speed torrent and HTTP downloader on AWS EC2. Add magnet links or direct URLs and monitor live progress.
              </p>
            </div>

            <button
              onClick={() => onNavigate('downloads')}
              className="btn-pink-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem', padding: '0.7rem', gap: '8px' }}
            >
              <ClayDownload size={18} />
              <span>Open Server Downloader</span>
            </button>
          </div>
        )}
      </div>

      {/* Choose What to Watch Modal */}
      <CreateRoomModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onLaunchMedia={handleModalLaunch}
        defaultRoom="lounge"
      />
    </div>
  );
}

export default HomeDashboard;
