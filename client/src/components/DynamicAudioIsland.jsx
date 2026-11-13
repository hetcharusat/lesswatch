import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Radio, Sparkles, ChevronDown } from 'lucide-react';

export function DynamicAudioIsland({
  isMicMuted = true,
  isDeafened = false,
  onToggleMic,
  onToggleDeafen,
  isLocalSpeaking = false,
  speakingUsers = {},
  connectedUsers = [],
  currentProfile,
  onOpenRadialMenu
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hiFiActive, setHiFiActive] = useState(true);

  // Check Android Audio Bridge status if available
  useEffect(() => {
    if (window.AndroidAudioBridge?.getAudioStatus) {
      try {
        const raw = window.AndroidAudioBridge.getAudioStatus();
        const parsed = JSON.parse(raw);
        setHiFiActive(!parsed.isBluetoothScoOn);
      } catch (e) {}
    }
  }, [isMicMuted]);

  // Determine who is currently speaking
  const remoteSpeakingList = connectedUsers.filter(u => u.username !== currentProfile?.username && speakingUsers[u.username]);
  const isAnyRemoteSpeaking = remoteSpeakingList.length > 0;
  const isAnyoneSpeaking = isLocalSpeaking || isAnyRemoteSpeaking;

  return (
    <div
      className={`dynamic-audio-island-root ${isExpanded ? 'expanded' : ''} ${isAnyoneSpeaking ? 'speaking-active' : ''}`}
      onClick={() => setIsExpanded(prev => !prev)}
      role="region"
      aria-label="Audio Island HUD"
    >
      <div className="dynamic-island-capsule">
        {/* Left Side: Mic state indicator */}
        <button
          className={`island-mic-btn ${isMicMuted ? 'muted' : 'active'} ${isLocalSpeaking ? 'pulse-speaking' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (navigator.vibrate) navigator.vibrate(15);
            onToggleMic?.();
          }}
          title={isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
        >
          {isMicMuted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>

        {/* Center: Live Waveform or Status Pill */}
        <div className="island-center-display">
          {isAnyoneSpeaking ? (
            <div className="island-waveform-bars">
              <span className="wave-bar bar-1" />
              <span className="wave-bar bar-2" />
              <span className="wave-bar bar-3" />
              <span className="wave-bar bar-4" />
              <span className="wave-bar bar-5" />
            </div>
          ) : (
            <div className="island-idle-label">
              <span className="island-pulse-dot" />
              <span className="island-text">
                {remoteSpeakingList[0]?.name ? `${remoteSpeakingList[0].name} speaking` : (isMicMuted ? 'Mic Muted' : 'Voice Live')}
              </span>
            </div>
          )}
        </div>

        {/* Right Side: Hi-Fi Shield Badge or Remote Speaker Indicator */}
        <div className="island-right-info">
          {hiFiActive ? (
            <span className="island-badge-hifi" title="A2DP Hi-Fi Audio Active (Phone mic used so Bluetooth earbuds stay in full stereo)">
              <Radio size={11} className="spin-slow" />
              <span>Hi-Fi</span>
            </span>
          ) : (
            <span className="island-badge-sco">
              <span>SCO</span>
            </span>
          )}
        </div>
      </div>

      {/* Expanded Quick Drawer */}
      {isExpanded && (
        <div className="dynamic-island-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="island-drawer-row">
            <div className="island-user-chips">
              {connectedUsers.slice(0, 4).map(u => (
                <div key={u.username} className={`island-user-chip ${speakingUsers[u.username] ? 'speaking' : ''}`}>
                  <span className="chip-avatar">{u.name?.charAt(0) || 'U'}</span>
                  <span className="chip-name">{u.name || u.username}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="island-actions-row">
            <button
              className={`island-action-pill ${isMicMuted ? 'off' : 'on'}`}
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(20);
                onToggleMic?.();
              }}
            >
              {isMicMuted ? <MicOff size={14} /> : <Mic size={14} />}
              <span>{isMicMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            <button
              className={`island-action-pill ${isDeafened ? 'off' : 'on'}`}
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(20);
                onToggleDeafen?.();
              }}
            >
              {isDeafened ? <VolumeX size={14} /> : <Volume2 size={14} />}
              <span>{isDeafened ? 'Deafened' : 'Sound On'}</span>
            </button>

            {onOpenRadialMenu && (
              <button
                className="island-action-pill special"
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(25);
                  setIsExpanded(false);
                  onOpenRadialMenu();
                }}
              >
                <Sparkles size={14} />
                <span>Controls</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DynamicAudioIsland;

