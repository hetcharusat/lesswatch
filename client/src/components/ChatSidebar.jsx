import React, { useState, useEffect, useRef } from 'react';
import { UserAvatar } from './JojoAvatar';
import { ClayChat, ClayClose, ClayCheck, ClayClock, ClayArrow, ClayHeart } from './ClayIcons';
import { Send, Smile, Users, MessageSquare, Check, CheckCheck, Sun, Moon, PanelRightClose } from 'lucide-react';

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

      if (prevCount === 0) {
        // Initial open: snap to bottom immediately
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      } else if (messages.length > prevCount) {
        // Only scroll down if the user was already near the bottom!
        if (isNearBottomRef.current) {
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
        borderRadius: '24px',
        border: isDarkTheme ? '1.5px solid rgba(244, 114, 182, 0.22)' : '1.5px solid rgba(244, 114, 182, 0.35)',
        boxShadow: isDarkTheme ? '0 16px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(244, 114, 182, 0.08)' : '0 12px 32px rgba(244, 114, 182, 0.16)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'background 0.25s ease, border-color 0.25s ease'
      }}
    >
      {/* 1. Header Tabs: Chat, Users, Theme Mode Toggle & Noticeable Collapse Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid rgba(244, 114, 182, 0.2)',
          background: isDarkTheme ? 'linear-gradient(180deg, #140f1f 0%, #0d0a14 100%)' : 'linear-gradient(180deg, #ffffff 0%, #fff7fb 100%)',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', gap: '6px', background: isDarkTheme ? 'rgba(255, 255, 255, 0.06)' : 'rgba(244, 114, 182, 0.12)', padding: '3px', borderRadius: '9999px' }}>
          <button
            onClick={() => setActiveTab('chat')}
            style={{
              padding: '5px 14px',
              borderRadius: '9999px',
              background: activeTab === 'chat' ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' : 'transparent',
              color: activeTab === 'chat' ? '#ffffff' : (isDarkTheme ? '#cbd5e1' : '#78345c'),
              border: 'none',
              fontWeight: 800,
              fontSize: '0.80rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'chat' ? '0 2px 6px rgba(236, 72, 153, 0.4)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '5px 14px',
              borderRadius: '9999px',
              background: activeTab === 'users' ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' : 'transparent',
              color: activeTab === 'users' ? '#ffffff' : (isDarkTheme ? '#cbd5e1' : '#78345c'),
              border: 'none',
              fontWeight: 800,
              fontSize: '0.80rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'users' ? '0 2px 6px rgba(236, 72, 153, 0.4)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Users ({connectedUsers.length || 1})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Night Dark Mode / Light Mode Toggle ("Colour Change Mode") */}
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              background: isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(244, 114, 182, 0.15)',
              border: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(244, 114, 182, 0.3)',
              borderRadius: '9999px',
              padding: '4px 8px',
              color: isDarkTheme ? '#f472b6' : '#831843',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              transition: 'all 0.2s ease'
            }}
            title={isDarkTheme ? 'Switch to Light Theme' : 'Switch to Dark Cinema Mode (Prevents eye flash)'}
          >
            {isDarkTheme ? <Sun size={12} color="#f472b6" /> : <Moon size={12} color="#831843" />}
            <span>{isDarkTheme ? 'Dark' : 'Light'}</span>
          </button>

          {/* Highly Noticeable Collapse Pill Button */}
          {isCollapsible && (
            <button
              onClick={onToggleCollapse}
              style={{
                background: isDarkTheme ? 'rgba(236, 72, 153, 0.2)' : 'rgba(244, 114, 182, 0.25)',
                border: isDarkTheme ? '1px solid rgba(236, 72, 153, 0.45)' : '1px solid rgba(244, 114, 182, 0.4)',
                borderRadius: '9999px',
                color: isDarkTheme ? '#f472b6' : '#831843',
                cursor: 'pointer',
                padding: '4px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.72rem',
                fontWeight: 800,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                transition: 'all 0.2s ease'
              }}
              title="Collapse Sidebar"
            >
              <span>Hide</span>
              <PanelRightClose size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Chat Feed Tab */}
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
            background: isDarkTheme ? '#0a0710' : 'linear-gradient(180deg, #fff7fb 0%, #ffffff 100%)',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '4rem', fontSize: '0.84rem', fontWeight: 600 }}>
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMe = (msg.username || msg.sender) === currentUsername;
              const senderName = msg.username || msg.sender || 'Anonymous';
              const timeStr = formatTime(msg.timestamp || Date.now());
              const isSeen = isMe && (partnerSeenTimestamp >= (msg.timestamp || 0));

              return (
                <div
                  key={msg.id || idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isMe ? 'flex-end' : 'flex-start',
                    width: '100%'
                  }}
                >
                  {/* Sender Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '3px',
                      flexDirection: isMe ? 'row-reverse' : 'row'
                    }}
                  >
                    <UserAvatar
                      avatar={msg.avatar || (isMe ? currentProfile?.avatar : 'jojo-star')}
                      size="22px"
                    />
                    <span style={{ fontSize: '0.76rem', fontWeight: 800, color: isMe ? '#f472b6' : (isDarkTheme ? '#e2e8f0' : '#1e1b4b') }}>
                      {senderName}
                    </span>
                    <span style={{ fontSize: '0.70rem', color: isDarkTheme ? '#94a3b8' : '#9ca3af', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <span>{timeStr}</span>
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

                  {/* Message Bubble */}
                  <div
                    style={{
                      maxWidth: '84%',
                      padding: '8px 12px',
                      borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
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
                      wordBreak: 'break-word'
                    }}
                  >
                    {msg.text}
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
              Only you in the lounge right now
            </div>
          ) : (
            connectedUsers.map((u, idx) => {
              const uName = u.username || u.name;
              const isMe = uName === currentUsername;
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    background: isDarkTheme
                      ? (isMe ? 'rgba(236, 72, 153, 0.18)' : 'rgba(255, 255, 255, 0.04)')
                      : (isMe ? 'rgba(244, 114, 182, 0.15)' : 'rgba(255, 255, 255, 0.6)'),
                    border: isDarkTheme
                      ? '1px solid rgba(255, 255, 255, 0.08)'
                      : '1px solid rgba(244, 114, 182, 0.2)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <UserAvatar avatar={u.avatar || 'jojo-star'} size="28px" />
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 800, color: isDarkTheme ? '#fce7f3' : '#831843' }}>
                        {uName} {isMe && '(You)'}
                      </div>
                      <div style={{ fontSize: '0.70rem', color: '#10b981', fontWeight: 700 }}>
                        ● Online
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 4. Bottom Input Bar */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '10px 12px',
          borderTop: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid rgba(244, 114, 182, 0.2)',
          background: isDarkTheme ? '#0d0a14' : '#ffffff',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: isDarkTheme ? '#150f1f' : '#fff9fc',
            borderRadius: '9999px',
            padding: '6px 12px',
            border: isDarkTheme ? '1px solid rgba(244, 114, 182, 0.35)' : '1.5px solid rgba(244, 114, 182, 0.45)',
            boxShadow: isDarkTheme ? 'inset 0 1px 3px rgba(0, 0, 0, 0.5)' : 'inset 0 1px 3px rgba(244, 114, 182, 0.1)'
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '0.84rem',
              fontWeight: 500,
              color: isDarkTheme ? '#fdf2f8' : '#831843'
            }}
          />
          <button
            type="button"
            onClick={() => setInputText((prev) => prev + ' 🌸')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
            title="Add emote"
          >
            <Smile size={17} color="var(--pink-primary)" />
          </button>
        </div>

        {/* Hot Pink Circular Send Button */}
        <button
          type="submit"
          disabled={!inputText.trim()}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: inputText.trim()
              ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)'
              : (isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(244, 114, 182, 0.35)'),
            border: 'none',
            color: '#ffffff',
            boxShadow: inputText.trim() ? '0 4px 12px rgba(236, 72, 153, 0.4)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: inputText.trim() ? 'pointer' : 'default',
            transition: 'all 0.2s ease'
          }}
          title="Send message"
        >
          <Send size={14} color="#ffffff" style={{ transform: 'translateX(1px)' }} />
        </button>
      </form>
    </div>
  );
}

export default ChatSidebar;
