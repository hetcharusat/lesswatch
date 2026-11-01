import React, { useState, useEffect, useRef } from 'react';
import { UserAvatar } from './JojoAvatar';
import { ClayChat, ClayClose, ClayCheck, ClayClock, ClayArrow, ClayHeart } from './ClayIcons';
import { Send, Smile, Users, MessageSquare, Check, CheckCheck } from 'lucide-react';

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
        background: '#ffffff',
        borderRadius: '24px',
        border: '1.5px solid rgba(244, 114, 182, 0.35)',
        boxShadow: '0 12px 32px rgba(244, 114, 182, 0.16)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* 1. Header Tabs: Chat & Users (Matches User's Reference Screenshot) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1.5px solid rgba(244, 114, 182, 0.2)',
          background: 'linear-gradient(180deg, #ffffff 0%, #fff7fb 100%)'
        }}
      >
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(244, 114, 182, 0.12)', padding: '3px', borderRadius: '9999px' }}>
          <button
            onClick={() => setActiveTab('chat')}
            style={{
              padding: '6px 18px',
              borderRadius: '9999px',
              background: activeTab === 'chat' ? 'linear-gradient(135deg, #fbcfe8 0%, #f472b6 100%)' : 'transparent',
              color: activeTab === 'chat' ? '#831843' : '#78345c',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.84rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'chat' ? '0 2px 6px rgba(244, 114, 182, 0.3)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '6px 18px',
              borderRadius: '9999px',
              background: activeTab === 'users' ? 'linear-gradient(135deg, #fbcfe8 0%, #f472b6 100%)' : 'transparent',
              color: activeTab === 'users' ? '#831843' : '#78345c',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.84rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'users' ? '0 2px 6px rgba(244, 114, 182, 0.3)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Users ({connectedUsers.length || 1})
          </button>
        </div>

        {isCollapsible && (
          <button
            onClick={onToggleCollapse}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Collapse Sidebar"
          >
            <ClayArrow direction="right" size={16} />
          </button>
        )}
      </div>

      {/* 2. Chat Feed Tab */}
      {activeTab === 'chat' && (
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            background: 'linear-gradient(180deg, #fff7fb 0%, #ffffff 100%)',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '4rem', fontSize: '0.86rem', fontWeight: 600 }}>
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
                        marginBottom: '4px',
                        flexDirection: isMe ? 'row-reverse' : 'row'
                      }}
                    >
                      <UserAvatar
                        avatar={msg.avatar || (isMe ? currentProfile?.avatar : 'jojo-star')}
                        size="24px"
                      />
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: isMe ? '#831843' : '#1e1b4b' }}>
                        {senderName}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <span>{timeStr}</span>
                        {isMe && (
                          <span
                            style={{
                              color: isSeen ? '#38bdf8' : '#9ca3af',
                              display: 'inline-flex',
                              alignItems: 'center',
                              marginLeft: '2px'
                            }}
                            title={isSeen ? `Seen by ${partnerEntry?.[0] || 'partner'}` : 'Delivered'}
                          >
                            {isSeen ? <CheckCheck size={13} /> : <Check size={13} />}
                          </span>
                        )}
                      </span>
                    </div>

                  {/* Message Bubble */}
                  <div
                    style={{
                      maxWidth: '82%',
                      padding: '9px 14px',
                      borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isMe
                        ? 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)'
                        : '#fdf2f8',
                      border: isMe
                        ? '1.5px solid rgba(244, 114, 182, 0.45)'
                        : '1px solid rgba(244, 114, 182, 0.25)',
                      color: isMe ? '#831843' : '#3b142d',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      lineHeight: 1.4,
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {connectedUsers.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '3rem', fontSize: '0.86rem' }}>
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
                    background: isMe ? 'rgba(244, 114, 182, 0.15)' : 'rgba(255, 255, 255, 0.6)',
                    border: '1px solid rgba(244, 114, 182, 0.2)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <UserAvatar avatar={u.avatar || 'jojo-star'} size="30px" />
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#831843' }}>
                        {uName} {isMe && '(You)'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700 }}>
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

      {/* 4. Bottom Input Bar (Exact Match to User's Mockup) */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '12px 14px',
          borderTop: '1.5px solid rgba(244, 114, 182, 0.2)',
          background: '#ffffff',
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
            background: '#fff9fc',
            borderRadius: '9999px',
            padding: '6px 14px',
            border: '1.5px solid rgba(244, 114, 182, 0.45)',
            boxShadow: 'inset 0 1px 3px rgba(244, 114, 182, 0.1)'
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
              fontSize: '0.86rem',
              fontWeight: 600,
              color: '#831843'
            }}
          />
          <button
            type="button"
            onClick={() => setInputText(prev => prev + ' 🌸')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
            title="Add emote"
          >
            <Smile size={18} color="var(--pink-primary)" />
          </button>
        </div>

        {/* Hot Pink Circular Send Button */}
        <button
          type="submit"
          disabled={!inputText.trim()}
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: inputText.trim()
              ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)'
              : 'rgba(244, 114, 182, 0.35)',
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
          <Send size={15} color="#ffffff" style={{ transform: 'translateX(1px)' }} />
        </button>
      </form>
    </div>
  );
}

export default ChatSidebar;
