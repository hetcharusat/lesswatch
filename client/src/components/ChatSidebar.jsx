import React, { useState, useEffect, useRef } from 'react';
import { UserAvatar } from './JojoAvatar';
import { ClayChat, ClayUsers, ClayClose, ClayCheck, ClayClock, ClayArrow, ClayHeart, ClaySparkle } from './ClayIcons';
import { Send, Smile, Sun, Moon, PanelRightClose, X, Check, CheckCheck } from 'lucide-react';
import { GiphyPicker } from './GiphyPicker';

const QUICK_EMOJIS = ['❤️', '🔥', '😂', '🥺', '👏', '🎉', '🍿', '😍', '💀', '✨', '😭', '💯'];

const EXTENDED_EMOJIS = [
  '😀', '😂', '🤣', '😍', '🥰', '😘', '😜', '😎', '🥳', '🥺', '😭', '😤',
  '🤯', '😱', '🤫', '😴', '🙄', '💀', '🤡', '👻', '👀', '🔥', '✨', '⭐',
  '❤️', '💖', '💔', '💯', '👍', '👎', '👏', '🙌', '🙏', '🍿', '🍕', '🍻',
  '🎉', '🚀', '🎬', '📺', '🎧', '🎮', '💡', '⚡', '🌙', '💤', '🌹', '🌈'
];

export function ChatSidebar({
  isOpen = true,
  onClose,
  messages = [],
  onSendMessage,
  currentProfile,
  connectedUsers = [],
  lastSeen = {},
  onMarkSeen,
  isCollapsible = false,
  isCollapsed = false,
  onToggleCollapse
}) {
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'users'
  const [showGiphy, setShowGiphy] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    return localStorage.getItem('wt_chat_theme') !== 'light'; // Default to dark cinema mode!
  });

  const toggleTheme = () => {
    setIsDarkTheme((prev) => {
      const next = !prev;
      localStorage.setItem('wt_chat_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);
  const prevMsgCountRef = useRef(0);
  const isNearBottomRef = useRef(true);

  // Track if user is scrolling up to read history or staying at the bottom
  const handleScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceToBottom < 120;
  };

  // Auto-mark seen and smart scroll (Never yank the user down if they scrolled up to read history!)
  useEffect(() => {
    if (isOpen && !isCollapsed) {
      onMarkSeen?.();
      const prevCount = prevMsgCountRef.current;
      prevMsgCountRef.current = messages.length;

      // Only auto-scroll down if user was already near the bottom or it's their own newly sent message
      if (messages.length > prevCount) {
        const lastMsg = messages[messages.length - 1];
        const isMyMsg = (lastMsg?.sender || '').toLowerCase() === (currentProfile?.name || '').toLowerCase();
        if (isNearBottomRef.current || isMyMsg) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }, [isOpen, isCollapsed, messages.length]);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputText('');
    setShowGiphy(false);
    setShowEmojiPicker(false);
  }

  function handleSelectGif(gifUrl, title) {
    onSendMessage(title ? '' : '', gifUrl);
    setShowGiphy(false);
  }

  function handleInsertEmoji(emoji) {
    setInputText((prev) => prev + emoji);
    inputRef.current?.focus();
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    try {
      const d = new Date(timestamp);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  if (!isOpen) return null;

  const currentUsername = currentProfile?.name || currentProfile?.username || 'You';

  // Partner's last seen timestamp for WhatsApp-style double blue ticks
  const partnerEntry = Object.entries(lastSeen || {}).find(([user]) => {
    return user.toLowerCase() !== (currentUsername || '').toLowerCase();
  });
  const partnerSeenTimestamp = partnerEntry ? partnerEntry[1] : 0;

  return (
    <div
      className={`chat-sidebar-drawer ${isCollapsed ? 'collapsed' : ''}`}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: isCollapsed ? 'none' : 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: isDarkTheme ? '#0d0a14' : '#ffffff',
        borderRadius: '20px',
        border: 'none',
        outline: 'none',
        boxShadow: isDarkTheme ? '0 16px 40px rgba(0, 0, 0, 0.8)' : '0 12px 32px rgba(0, 0, 0, 0.08)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'background 0.25s ease'
      }}
    >
      {/* 1. Header Tabs: Chat, Users, Theme Mode Toggle & Noticeable Collapse Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
          background: isDarkTheme ? '#120d1c' : '#ffffff',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', gap: '5px', background: isDarkTheme ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)', padding: '3px', borderRadius: '9999px' }}>
          <button
            onClick={() => setActiveTab('chat')}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              background: activeTab === 'chat' ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' : 'transparent',
              color: activeTab === 'chat' ? '#ffffff' : (isDarkTheme ? '#cbd5e1' : '#64748b'),
              border: 'none',
              fontWeight: 800,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'chat' ? '0 2px 8px rgba(236, 72, 153, 0.45)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <ClayChat size={15} />
            <span>Chat</span>
          </button>
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              background: activeTab === 'users' ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' : 'transparent',
              color: activeTab === 'users' ? '#ffffff' : (isDarkTheme ? '#cbd5e1' : '#64748b'),
              border: 'none',
              fontWeight: 800,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'users' ? '0 2px 8px rgba(236, 72, 153, 0.45)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <ClayUsers size={15} />
            <span>Users ({connectedUsers.length || 1})</span>
          </button>
        </div>

        {/* Clean, Uniform Icon-Only Header Buttons (No Text!) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Night Dark Mode / Light Mode Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              border: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid rgba(0, 0, 0, 0.08)',
              color: isDarkTheme ? '#f472b6' : '#831843',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isDarkTheme ? '0 2px 6px rgba(0, 0, 0, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.04)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            title={isDarkTheme ? 'Switch to Light Theme' : 'Switch to Dark Cinema Mode'}
          >
            {isDarkTheme ? <Sun size={15} color="#f472b6" /> : <Moon size={15} color="#831843" />}
          </button>

          {/* Clean Circular Collapse Button */}
          {isCollapsible && (
            <button
              type="button"
              onClick={onToggleCollapse}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: isDarkTheme ? 'rgba(236, 72, 153, 0.22)' : 'rgba(244, 114, 182, 0.25)',
                border: isDarkTheme ? '1px solid rgba(236, 72, 153, 0.45)' : '1px solid rgba(244, 114, 182, 0.4)',
                color: isDarkTheme ? '#f472b6' : '#831843',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isDarkTheme ? '0 2px 8px rgba(236, 72, 153, 0.3)' : '0 2px 6px rgba(244, 114, 182, 0.25)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              title="Hide Sidebar"
            >
              <PanelRightClose size={15} color={isDarkTheme ? '#f472b6' : '#831843'} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Messages List Tab */}
      {activeTab === 'chat' && (
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: isDarkTheme ? '#0d0a14' : '#ffffff'
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDarkTheme ? '#64748b' : '#94a3b8',
                gap: '8px',
                padding: '2rem 1rem'
              }}
            >
              <ClayHeart size={36} />
              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>No messages yet</div>
              <div style={{ fontSize: '0.74rem', textAlign: 'center' }}>
                Say hello, send a GIF, or drop a reaction!
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = (msg.sender || '').toLowerCase() === (currentUsername || '').toLowerCase();
              const isSystem = msg.isSystem;

              if (isSystem) {
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: 'center',
                      background: isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : '#fdf2f8',
                      border: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(244, 114, 182, 0.25)',
                      borderRadius: '9999px',
                      padding: '4px 12px',
                      fontSize: '0.70rem',
                      color: isDarkTheme ? '#94a3b8' : '#831843',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <ClaySparkle size={12} />
                    <span>{msg.text}</span>
                  </div>
                );
              }

              // WhatsApp-Style Double Blue Ticks calculation:
              const isSeen = msg.timestamp && partnerSeenTimestamp && msg.timestamp <= partnerSeenTimestamp;

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    alignItems: isMe ? 'flex-end' : 'flex-start'
                  }}
                >
                  {/* Sender Header & Time */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '3px',
                      padding: '0 4px'
                    }}
                  >
                    {!isMe && (
                      <span style={{ fontSize: '0.70rem', fontWeight: 800, color: '#f472b6' }}>
                        {msg.sender}
                      </span>
                    )}
                    <span style={{ fontSize: '0.62rem', color: isDarkTheme ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {formatTime(msg.timestamp)}
                      {/* WhatsApp Double Blue Ticks for own sent messages */}
                      {isMe && (
                        <span
                          style={{
                            color: isSeen ? '#38bdf8' : (isDarkTheme ? '#64748b' : '#9ca3af'),
                            display: 'inline-flex',
                            alignItems: 'center',
                            marginLeft: '2px'
                          }}
                          title={isSeen ? `Seen by ${partnerEntry?.[0] || 'partner'}` : 'Delivered'}
                        >
                          {isSeen ? <CheckCheck size={12} /> : <Check size={12} />}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Message Bubble (Supports Text & Giphy GIFs) */}
                  <div
                    style={{
                      maxWidth: '100%',
                      padding: msg.image ? '5px' : '8px 12px',
                      borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isMe
                        ? (isDarkTheme ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.28) 0%, rgba(219, 39, 119, 0.38) 100%)' : 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)')
                        : (isDarkTheme ? 'rgba(255, 255, 255, 0.06)' : '#fdf2f8'),
                      border: isMe
                        ? (isDarkTheme ? '1px solid rgba(244, 114, 182, 0.5)' : '1.5px solid rgba(244, 114, 182, 0.45)')
                        : (isDarkTheme ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(244, 114, 182, 0.25)'),
                      color: isMe ? (isDarkTheme ? '#fce7f3' : '#831843') : (isDarkTheme ? '#f1f5f9' : '#3b142d'),
                      fontSize: '0.86rem',
                      fontWeight: 500,
                      lineHeight: 1.4,
                      boxShadow: isDarkTheme ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 6px rgba(0, 0, 0, 0.04)',
                      wordBreak: 'break-word',
                      overflow: 'hidden'
                    }}
                  >
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="GIF"
                        loading="lazy"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '180px',
                          borderRadius: '12px',
                          display: 'block'
                        }}
                      />
                    )}
                    {msg.text && (
                      <div style={{ marginTop: msg.image ? '5px' : 0, padding: msg.image ? '2px 6px 4px' : 0 }}>
                        {msg.text}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* 3. Users List Tab */}
      {activeTab === 'users' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', background: isDarkTheme ? '#0a0710' : '#ffffff' }}>
          {connectedUsers.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '3rem', fontSize: '0.84rem' }}>
              No other users in this room yet.
            </div>
          ) : (
            connectedUsers.map((u) => {
              const isCurrent = (u.username || u.name || '').toLowerCase() === (currentUsername || '').toLowerCase();
              return (
                <div
                  key={u.id || u.username}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    background: isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : '#fdf2f8',
                    border: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(244, 114, 182, 0.2)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ position: 'relative' }}>
                      <UserAvatar user={{ name: u.username || u.name, avatar: u.avatar }} size={32} showBorder={false} />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: '9px',
                          height: '9px',
                          borderRadius: '50%',
                          background: '#10b981',
                          border: '1.5px solid #0d0a14'
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: isDarkTheme ? '#f1f5f9' : '#1e293b' }}>
                        {u.username || u.name} {isCurrent && '(You)'}
                      </div>
                      <div style={{ fontSize: '0.66rem', color: isDarkTheme ? '#94a3b8' : '#64748b' }}>
                        {u.isHost ? 'Room Host' : 'Viewer'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 4. GIPHY Picker Floating Popover */}
      {showGiphy && (
        <div
          style={{
            position: 'absolute',
            bottom: '72px',
            left: '10px',
            right: '10px',
            zIndex: 150
          }}
        >
          <GiphyPicker
            onSelectGif={handleSelectGif}
            onClose={() => setShowGiphy(false)}
            isDarkTheme={isDarkTheme}
          />
        </div>
      )}

      {/* 5. Extended Emoji Picker Floating Popover */}
      {showEmojiPicker && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: '72px',
            left: '10px',
            right: '10px',
            padding: '10px',
            background: isDarkTheme ? 'rgba(16, 12, 22, 0.98)' : '#ffffff',
            border: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '16px',
            boxShadow: isDarkTheme ? '0 16px 40px rgba(0, 0, 0, 0.85)' : '0 12px 32px rgba(0, 0, 0, 0.12)',
            backdropFilter: 'blur(20px)',
            zIndex: 150,
            animation: 'poufPopIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '4px', borderBottom: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Select Emoji
            </span>
            <button
              onClick={() => setShowEmojiPicker(false)}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <X size={14} />
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              gap: '6px',
              maxHeight: '160px',
              overflowY: 'auto'
            }}
          >
            {EXTENDED_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleInsertEmoji(emoji)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  transition: 'transform 0.15s ease',
                  userSelect: 'none'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.3)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 6. Quick Reaction Emoji Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 14px 2px 14px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          gap: '4px',
          background: isDarkTheme ? '#100c18' : '#fff7fb',
          borderTop: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 0, 0, 0.04)'
        }}
      >
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleInsertEmoji(emoji)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.05rem',
              padding: '2px 3px',
              borderRadius: '6px',
              transition: 'transform 0.15s ease',
              userSelect: 'none',
              lineHeight: 1
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.3)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            title={`Add ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* 7. Input Bar (Text, GIF button, Emoji button, Send button) */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '8px 12px 12px 12px',
          borderTop: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
          background: isDarkTheme ? '#100c18' : '#ffffff',
          display: 'flex',
          alignItems: 'center',
          gap: '7px'
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: isDarkTheme ? '#181224' : '#f8fafc',
            borderRadius: '9999px',
            padding: '6px 12px',
            border: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.08)',
            boxShadow: isDarkTheme ? 'inset 0 1px 3px rgba(0, 0, 0, 0.6)' : 'inset 0 1px 3px rgba(0, 0, 0, 0.04)'
          }}
        >
          {/* GIF Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setShowGiphy((prev) => !prev);
              setShowEmojiPicker(false);
            }}
            style={{
              background: showGiphy ? 'linear-gradient(135deg, #ec4899, #db2777)' : (isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'),
              border: showGiphy ? '1px solid #ec4899' : '1px solid rgba(244, 114, 182, 0.3)',
              borderRadius: '6px',
              padding: '2px 5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1
            }}
            title="Search & Send GIFs (Powered by GIPHY)"
          >
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 900,
                color: showGiphy ? '#ffffff' : '#f472b6',
                letterSpacing: '0.04em'
              }}
            >
              GIF
            </span>
          </button>

          {/* Emoji Picker Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker((prev) => !prev);
              setShowGiphy(false);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              color: showEmojiPicker ? '#ec4899' : (isDarkTheme ? '#94a3b8' : '#64748b')
            }}
            title="Emoji Picker"
          >
            <Smile size={16} />
          </button>

          {/* Text Input */}
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '0.84rem',
              fontWeight: 500,
              color: isDarkTheme ? '#fdf2f8' : '#1e293b'
            }}
          />

          {/* Fast Heart Button */}
          <button
            type="button"
            onClick={() => handleInsertEmoji('❤️')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
            title="Heart"
          >
            <ClayHeart size={16} />
          </button>
        </div>

        {/* 3D Puffy Clay Send Button */}
        <button
          type="submit"
          disabled={!inputText.trim()}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: inputText.trim()
              ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)'
              : (isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'),
            border: 'none',
            color: '#ffffff',
            boxShadow: inputText.trim() ? '0 4px 14px rgba(236, 72, 153, 0.45)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: inputText.trim() ? 'pointer' : 'default',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            transform: inputText.trim() ? 'scale(1.04)' : 'scale(1)',
            flexShrink: 0
          }}
          title="Send message"
        >
          {inputText.trim() ? (
            <ClayArrow direction="up" size={15} />
          ) : (
            <Send size={14} color={isDarkTheme ? '#6b7280' : '#94a3b8'} style={{ transform: 'translateX(1px)' }} />
          )}
        </button>
      </form>
    </div>
  );
}

export default ChatSidebar;
