import React, { useState, useEffect } from 'react';
import {
  Volume2,
  Subtitles,
  Gauge,
  Mic,
  Heart,
  Maximize2,
  X,
  Radio,
  Check
} from 'lucide-react';

export function MobileRadialWheel({
  isOpen = false,
  onClose,
  position = { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  audioTracks = [],
  currentAudioTrack = 0,
  onSelectAudioTrack,
  subtitleTracks = [],
  currentSubtitleTrack = -1,
  onSelectSubtitleTrack,
  playbackSpeed = 1,
  onChangePlaybackSpeed,
  isMicMuted = false,
  onToggleMic,
  onSendReaction
}) {
  const [activeSubmenu, setActiveSubmenu] = useState(null); // null | 'audio' | 'subtitles' | 'speed' | 'audioRoute'
  const [hiFiActive, setHiFiActive] = useState(true);

  useEffect(() => {
    if (window.AndroidAudioBridge?.getAudioStatus) {
      try {
        const raw = window.AndroidAudioBridge.getAudioStatus();
        const parsed = JSON.parse(raw);
        setHiFiActive(!parsed.isBluetoothScoOn);
      } catch (e) {}
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Toggle Hi-Fi Mode via native Android Bridge
  const handleToggleHiFi = (e) => {
    e.stopPropagation();
    if (navigator.vibrate) navigator.vibrate(25);
    if (window.AndroidAudioBridge?.forcePhoneMicForA2DP) {
      if (hiFiActive) {
        window.AndroidAudioBridge.resetAudioRouting();
        setHiFiActive(false);
      } else {
        window.AndroidAudioBridge.forcePhoneMicForA2DP();
        setHiFiActive(true);
      }
    } else {
      setHiFiActive(prev => !prev);
    }
  };

  const handleSendHeart = (e) => {
    e.stopPropagation();
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    onSendReaction?.('❤️');
  };

  const speeds = [0.75, 1, 1.25, 1.5, 2];

  // Calculate items around center
  const menuItems = [
    {
      id: 'audio',
      label: 'Audio',
      icon: <Volume2 size={20} />,
      onClick: () => setActiveSubmenu('audio')
    },
    {
      id: 'subtitles',
      label: 'Subtitles',
      icon: <Subtitles size={20} />,
      onClick: () => setActiveSubmenu('subtitles')
    },
    {
      id: 'speed',
      label: `${playbackSpeed}x`,
      icon: <Gauge size={20} />,
      onClick: () => setActiveSubmenu('speed')
    },
    {
      id: 'hifi',
      label: hiFiActive ? 'Hi-Fi 🎧' : 'SCO 📞',
      icon: <Radio size={20} className={hiFiActive ? 'text-pink-400' : ''} />,
      onClick: handleToggleHiFi
    },
    {
      id: 'mic',
      label: isMicMuted ? 'Unmute' : 'Mute',
      icon: <Mic size={20} className={!isMicMuted ? 'text-emerald-400' : ''} />,
      onClick: (e) => {
        e.stopPropagation();
        if (navigator.vibrate) navigator.vibrate(20);
        onToggleMic?.();
      }
    },
    {
      id: 'spark',
      label: 'Love',
      icon: <Heart size={20} className="text-pink-500 fill-pink-500" />,
      onClick: handleSendHeart
    }
  ];

  const total = menuItems.length;
  const radius = 105; // radius in px

  return (
    <div className="mobile-radial-overlay" onClick={onClose}>
      <div
        className="mobile-radial-center"
        style={{
          left: `${Math.min(Math.max(position.x, 130), window.innerWidth - 130)}px`,
          top: `${Math.min(Math.max(position.y, 130), window.innerHeight - 130)}px`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Center Close / Radial Core */}
        <button
          className="radial-core-button"
          onClick={() => {
            if (activeSubmenu) {
              setActiveSubmenu(null);
            } else {
              if (navigator.vibrate) navigator.vibrate(15);
              onClose();
            }
          }}
          title="Close Menu"
        >
          {activeSubmenu ? <X size={20} /> : <div className="radial-core-glow" />}
        </button>

        {/* Outer Wheel Nodes */}
        {!activeSubmenu &&
          menuItems.map((item, index) => {
            // Distribute evenly around 360 degrees, starting from top (-90 deg)
            const angle = (index * (360 / total) - 90) * (Math.PI / 180);
            const x = Math.round(Math.cos(angle) * radius);
            const y = Math.round(Math.sin(angle) * radius);

            return (
              <button
                key={item.id}
                className="radial-node-button"
                style={{
                  transform: `translate(${x}px, ${y}px)`
                }}
                onClick={(e) => {
                  if (navigator.vibrate) navigator.vibrate(15);
                  item.onClick(e);
                }}
              >
                <div className="radial-node-icon">{item.icon}</div>
                <span className="radial-node-label">{item.label}</span>
              </button>
            );
          })}

        {/* Submenu Popover for Audio Tracks */}
        {activeSubmenu === 'audio' && (
          <div className="radial-submenu-card">
            <div className="radial-submenu-header">
              <Volume2 size={16} />
              <span>Select Audio Track</span>
            </div>
            <div className="radial-submenu-list">
              {audioTracks.length === 0 ? (
                <div className="radial-empty-tip">Default Stereo Stream</div>
              ) : (
                audioTracks.map((track, i) => (
                  <button
                    key={i}
                    className={`radial-submenu-item ${currentAudioTrack === i ? 'active' : ''}`}
                    onClick={() => {
                      if (navigator.vibrate) navigator.vibrate(20);
                      onSelectAudioTrack?.(i);
                      setActiveSubmenu(null);
                    }}
                  >
                    <span>{track.name || track.label || `Track ${i + 1}`}</span>
                    {currentAudioTrack === i && <Check size={14} className="text-pink-400" />}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Submenu Popover for Subtitles */}
        {activeSubmenu === 'subtitles' && (
          <div className="radial-submenu-card">
            <div className="radial-submenu-header">
              <Subtitles size={16} />
              <span>Select Subtitles</span>
            </div>
            <div className="radial-submenu-list">
              <button
                className={`radial-submenu-item ${currentSubtitleTrack === -1 ? 'active' : ''}`}
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(20);
                  onSelectSubtitleTrack?.(-1);
                  setActiveSubmenu(null);
                }}
              >
                <span>Off</span>
                {currentSubtitleTrack === -1 && <Check size={14} className="text-pink-400" />}
              </button>
              {subtitleTracks.map((sub, i) => (
                <button
                  key={i}
                  className={`radial-submenu-item ${currentSubtitleTrack === i ? 'active' : ''}`}
                  onClick={() => {
                    if (navigator.vibrate) navigator.vibrate(20);
                    onSelectSubtitleTrack?.(i);
                    setActiveSubmenu(null);
                  }}
                >
                  <span>{sub.label || sub.name || `Sub ${i + 1}`}</span>
                  {currentSubtitleTrack === i && <Check size={14} className="text-pink-400" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submenu Popover for Speed */}
        {activeSubmenu === 'speed' && (
          <div className="radial-submenu-card">
            <div className="radial-submenu-header">
              <Gauge size={16} />
              <span>Playback Speed</span>
            </div>
            <div className="radial-speed-grid">
              {speeds.map(s => (
                <button
                  key={s}
                  className={`radial-speed-pill ${playbackSpeed === s ? 'active' : ''}`}
                  onClick={() => {
                    if (navigator.vibrate) navigator.vibrate(20);
                    onChangePlaybackSpeed?.(s);
                    setActiveSubmenu(null);
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MobileRadialWheel;

