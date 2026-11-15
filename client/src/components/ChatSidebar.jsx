import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { UserAvatar } from './JojoAvatar';
import { ClayChat, ClayUsers, ClayClose, ClayCheck, ClayClock, ClayArrow, ClayHeart, ClaySparkle } from './ClayIcons';
import { Send, Smile, Sun, Moon, PanelRightClose, X, Check, CheckCheck, Plus, Minus, RotateCcw } from 'lucide-react';
import { GiphyPicker } from './GiphyPicker';

const DEFAULT_QUICK_EMOJIS = ['❤️', '🔥', '😂', '🥺', '👏', '🎉', '🍿', '😍', '💀', '✨', '😭', '💯'];

const EXTENDED_EMOJIS = [
  '😀', '😂', '🤣', '😍', '🥰', '😘', '😜', '😎', '🥳', '🥺', '😭', '😤',
  '🤯', '😱', '🤫', '😴', '🙄', '💀', '🤡', '👻', '👀', '🔥', '✨', '⭐',
  '❤️', '💖', '💔', '💯', '👍', '👎', '👏', '🙌', '🙏', '🍿', '🍕', '🍻',
  '🎉', '🚀', '🎬', '📺', '🎧', '🎮', '💡', '⚡', '🌙', '💤', '🌹', '🌈'
];

export function ChatSidebar({
  isOpen = true,
  isClosing = false,
  onClose,
  messages = [],
  onSendMessage,
  currentProfile,
  connectedUsers = [],
  lastSeen = {},
  onMarkSeen,
  isCollapsible = false,
  isCollapsed = false,
  onToggleCollapse,
  onOpenAvatarModal
}) {
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'users'
  const [showGiphy, setShowGiphy] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [expandedSysGroups, setExpandedSysGroups] = useState({});
  const [quickEmojis, setQuickEmojis] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('wt_quick_emojis') || 'null');
      if (Array.isArray(saved) && saved.length > 0) {
        return saved.filter((item) => typeof item === 'string' && item.trim().length > 0);
      }
    } catch {}
    return DEFAULT_QUICK_EMOJIS;
  });
  const [showQuickEmojiManager, setShowQuickEmojiManager] = useState(false);
  const [customQuickEmojiInput, setCustomQuickEmojiInput] = useState('');
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

  const scrollFeedToBottomInstant = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  // Synchronously snap to newest messages before first paint when opening chat or switching to Chat tab
  useLayoutEffect(() => {
    if (isOpen && !isCollapsed && activeTab === 'chat') {
      onMarkSeen?.();
      isNearBottomRef.current = true;
      prevMsgCountRef.current = messages.length;
      scrollFeedToBottomInstant();
    }
  }, [isOpen, isCollapsed, activeTab]);

  // Safety post-layout snap so GIFs/animations never leave scroll short of newest messages
  useEffect(() => {
    if (isOpen && !isCollapsed && activeTab === 'chat') {
      scrollFeedToBottomInstant();
      const rafId = requestAnimationFrame(scrollFeedToBottomInstant);
      const settleTimer = setTimeout(scrollFeedToBottomInstant, 140);
      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(settleTimer);
      };
    }
    return undefined;
  }, [isOpen, isCollapsed, activeTab]);

  // Auto-mark seen and smart scroll for incoming messages
  useEffect(() => {
    if (isOpen && !isCollapsed) {
      const prevCount = prevMsgCountRef.current;
      prevMsgCountRef.current = messages.length;

      // Only auto-scroll down if user was already near the bottom or it's their own newly sent message
      if (messages.length > prevCount) {
        onMarkSeen?.();
        const lastMsg = messages[messages.length - 1];
        const isMyMsg = (lastMsg?.sender || '').toLowerCase() === (currentProfile?.name || '').toLowerCase();
        if (isNearBottomRef.current || isMyMsg) {
          const el = chatContainerRef.current;
          if (el) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          } else {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }
      }
    }
  }, [messages.length, isOpen, isCollapsed]);

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
    try {
      const counts = JSON.parse(localStorage.getItem('wt_quick_emoji_usage') || '{}');
      counts[emoji] = (Number(counts[emoji]) || 0) + 1;
      localStorage.setItem('wt_quick_emoji_usage', JSON.stringify(counts));
      window.dispatchEvent(new Event('wt_quick_emojis_updated'));
    } catch {}
    inputRef.current?.focus();
  }

  function extractFirstGrapheme(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const segs = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed));
      return segs[0]?.segment || '';
    }
    return Array.from(trimmed)[0] || '';
  }

  function writeQuickEmojisStorage(next) {
    try {
      localStorage.setItem('wt_quick_emojis', JSON.stringify(next));
      window.dispatchEvent(new Event('wt_quick_emojis_updated'));
    } catch {}
  }

  function persistQuickEmojis(next) {
    setQuickEmojis(next);
    writeQuickEmojisStorage(next);
  }

  function addQuickEmoji(rawEmoji) {
    const token = extractFirstGrapheme(rawEmoji);
    if (!token) return;
    setQuickEmojis((prev) => {
      if (prev.includes(token)) return prev;
      const next = [...prev, token];
      writeQuickEmojisStorage(next);
      return next;
    });
    setCustomQuickEmojiInput('');
  }

  function removeQuickEmoji(emoji) {
    setQuickEmojis((prev) => {
      const next = prev.filter((item) => item !== emoji);
      writeQuickEmojisStorage(next);
      return next;
    });
  }

  function toggleQuickEmoji(emoji) {
    setQuickEmojis((prev) => {
      const exists = prev.includes(emoji);
      const next = exists ? prev.filter((item) => item !== emoji) : [...prev, emoji];
      writeQuickEmojisStorage(next);
      return next;
    });
  }

  function resetQuickEmojis() {
    persistQuickEmojis(DEFAULT_QUICK_EMOJIS);
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

  const themeClass = isDarkTheme ? 'wchat-dark' : 'wchat-light';
  const closingClass = isClosing ? 'is-closing' : 'is-open';
  const closeHandler = isCollapsible ? onToggleCollapse : onClose;

  // Group consecutive system events & consecutive same-sender messages cleanly
  const timelineEntries = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (msg.isSystem) {
      const run = [msg];
      while (i + 1 < messages.length && messages[i + 1].isSystem) {
        i += 1;
        run.push(messages[i]);
      }
      const uniqueTexts = Array.from(new Set(run.map((item) => item.text).filter(Boolean)));
      const latestText = run[run.length - 1]?.text || '';
      const summaryLabel =
        run.length === 1
          ? latestText
          : uniqueTexts.length === 1
            ? `${uniqueTexts[0]} ×${run.length}`
            : `${latestText} · +${run.length - 1}`;
      timelineEntries.push({
        kind: 'system-group',
        id: `sys-${run[0].id || i}`,
        items: run,
        summaryLabel
      });
      continue;
    }

    const prev = i > 0 && !messages[i - 1].isSystem ? messages[i - 1] : null;
    const next = i + 1 < messages.length && !messages[i + 1].isSystem ? messages[i + 1] : null;
    const senderLower = (msg.sender || '').toLowerCase();
    const prevSame =
      prev &&
      (prev.sender || '').toLowerCase() === senderLower &&
      Math.abs((msg.timestamp || 0) - (prev.timestamp || 0)) < 120000;
    const nextSame =
      next &&
      (next.sender || '').toLowerCase() === senderLower &&
      Math.abs((next.timestamp || 0) - (msg.timestamp || 0)) < 120000;

    timelineEntries.push({
      kind: 'message',
      id: msg.id || `msg-${i}`,
      msg,
      isMe: senderLower === (currentUsername || '').toLowerCase(),
      isGroupStart: !prevSame,
      isGroupEnd: !nextSame
    });
  }

  function toggleSysGroup(groupId) {
    setExpandedSysGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }

  function handleFeedScroll(e) {
    const el = e.currentTarget;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function renderUsersPanel() {
    if (connectedUsers.length === 0) {
      return (
        <div className="wchat-users-empty">
          No other users in this room yet.
        </div>
      );
    }
    return connectedUsers.map((u) => {
      const isCurrent = (u.username || u.name || '').toLowerCase() === (currentUsername || '').toLowerCase();
      const displayName = u.username || u.name;
      return (
        <div key={u.id || displayName} className="wchat-user-row">
          <div className="wchat-user-meta">
            <div className="wchat-avatar-wrap">
              <UserAvatar user={{ name: displayName, avatar: u.avatar }} size={30} showBorder={false} />
              <span className="wchat-online-dot" />
            </div>
            <div className="wchat-user-copy">
              <div className="wchat-user-name">
                {displayName} {isCurrent && <span className="wchat-you-tag">(You)</span>}
              </div>
              <div className="wchat-user-role">
                {u.isHost ? 'Room Host' : 'Viewer'}
              </div>
            </div>
          </div>
          {isCurrent && onOpenAvatarModal && (
            <button
              type="button"
              className="wchat-avatar-btn"
              onClick={onOpenAvatarModal}
              title="Change Profile Picture"
            >
              Change Photo
            </button>
          )}
        </div>
      );
    });
  }

  function renderFloatingPickers() {
    return (
      <>
        {showGiphy && (
          <div className="wchat-popover-anchor">
            <GiphyPicker
              onSelectGif={handleSelectGif}
              onClose={() => setShowGiphy(false)}
              isDarkTheme={isDarkTheme}
            />
          </div>
        )}
        {showEmojiPicker && (
          <div className="wchat-emoji-popover" onClick={(e) => e.stopPropagation()}>
            <div className="wchat-emoji-popover-head">
              <span>Select Emoji</span>
              <button type="button" onClick={() => setShowEmojiPicker(false)} aria-label="Close emoji picker">
                <X size={14} />
              </button>
            </div>
            <div className="wchat-emoji-grid">
              {EXTENDED_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleInsertEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
        {showQuickEmojiManager && renderQuickStudioOverlay()}
      </>
    );
  }

  function renderQuickStudioOverlay() {
    if (!showQuickEmojiManager) return null;
    return (
      <div className="qeb-studio-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#f472b6', letterSpacing: '0.03em' }}>
            Quick Reaction Studio
          </span>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={resetQuickEmojis}
              style={{ background: 'none', border: 'none', color: isDarkTheme ? '#f9a8d4' : '#db2777', fontSize: '0.67rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              Restore defaults
            </button>
            <button
              type="button"
              onClick={() => setShowQuickEmojiManager(false)}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="text"
            value={customQuickEmojiInput}
            onChange={(e) => setCustomQuickEmojiInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addQuickEmoji(customQuickEmojiInput);
              }
            }}
            placeholder="Paste any emoji..."
            style={{
              flex: 1,
              minWidth: 0,
              padding: '5px 9px',
              borderRadius: '9px',
              border: isDarkTheme ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(236,72,153,0.22)',
              background: isDarkTheme ? 'rgba(255,255,255,0.06)' : '#fff7fb',
              color: isDarkTheme ? '#fdf2f8' : '#3b142d',
              fontSize: '0.76rem',
              outline: 'none'
            }}
          />
          <button
            type="button"
            onClick={() => addQuickEmoji(customQuickEmojiInput)}
            style={{
              padding: '5px 10px',
              borderRadius: '9px',
              border: 'none',
              background: 'linear-gradient(135deg, #ec4899, #db2777)',
              color: '#fff',
              fontSize: '0.72rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            + Pin
          </button>
        </div>

        <div>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, opacity: 0.72, marginBottom: '4px' }}>
            In Your Bar ({quickEmojis.length}) — click to remove
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '64px', overflowY: 'auto' }}>
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => removeQuickEmoji(emoji)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 7px',
                  borderRadius: '8px',
                  border: '1px solid rgba(244, 114, 182, 0.3)',
                  background: 'rgba(244, 114, 182, 0.12)',
                  color: 'inherit',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
                title={`Remove ${emoji}`}
              >
                <span>{emoji}</span>
                <Minus size={10} color="#fca5a5" />
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, opacity: 0.72, marginBottom: '4px' }}>
            Suggested Additions — click + to pin
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '3px', maxHeight: '84px', overflowY: 'auto' }}>
            {EXTENDED_EMOJIS.filter((em) => !quickEmojis.includes(em)).map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => addQuickEmoji(emoji)}
                style={{
                  padding: '3px',
                  borderRadius: '7px',
                  border: '1px solid transparent',
                  background: 'rgba(255,255,255,0.04)',
                  fontSize: '0.98rem',
                  cursor: 'pointer',
                  lineHeight: 1.1
                }}
                title={`Pin ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`chat-sidebar-drawer wchat-v2 ${themeClass} ${closingClass} ${isCollapsed ? 'collapsed' : ''}`}
      onClick={(e) => e.stopPropagation()}
      style={{ display: isCollapsed ? 'none' : 'flex' }}
    >
      <div className="wchat-header">
        <div className="wchat-seg">
          <button type="button" className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>
            <ClayChat size={14} />
            <span>Chat</span>
          </button>
          <button type="button" className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>
            <ClayUsers size={14} />
            <span>Users ({connectedUsers.length || 1})</span>
          </button>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button type="button" className="wchat-ghost-icon" onClick={toggleTheme} title={isDarkTheme ? 'Light Theme' : 'Dark Mode'}>
            {isDarkTheme ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          {(isCollapsible || onClose) && (
            <button type="button" className="wchat-ghost-icon" onClick={closeHandler} title="Close Sidebar (C)">
              <PanelRightClose size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="wchat-stage">
        {activeTab === 'chat' ? (
          <div ref={chatContainerRef} className="wchat-feed" onScroll={handleFeedScroll}>
            {messages.length === 0 ? (
              <div className="wchat-users-empty">
                <ClayHeart size={32} />
                <div style={{ marginTop: '8px', fontWeight: 600 }}>No messages yet</div>
              </div>
            ) : (
              timelineEntries.map((entry) => {
                if (entry.kind === 'system-group') {
                  const isExpanded = !!expandedSysGroups[entry.id];
                  return (
                    <div key={entry.id} className="wchat-sys-badge-wrap">
                      <button
                        type="button"
                        className="wchat-sys-badge"
                        onClick={() => entry.items.length > 1 && toggleSysGroup(entry.id)}
                      >
                        {entry.summaryLabel}
                      </button>
                      <div className={`wchat-sys-expanded ${isExpanded ? 'is-expanded' : ''}`}>
                        {entry.items.map((item) => (
                          <span key={item.id}>{item.text}</span>
                        ))}
                      </div>
                    </div>
                  );
                }
                const { msg, isMe, isGroupStart, isGroupEnd } = entry;
                const isSeen = msg.timestamp && partnerSeenTimestamp && msg.timestamp <= partnerSeenTimestamp;
                return (
                  <div key={entry.id} className={`wchat-msg-group ${isMe ? 'me' : 'other'} ${isGroupStart ? 'group-start' : ''}`}>
                    {isGroupStart && !isMe && <div className="wchat-sender-tag">{msg.sender}</div>}
                    <div className={`wchat-bubble ${msg.image ? 'has-img' : ''}`}>
                      {msg.image && (
                        <img
                          src={msg.image}
                          alt="GIF"
                          loading="lazy"
                          onLoad={() => {
                            if (isNearBottomRef.current) scrollFeedToBottomInstant();
                          }}
                        />
                      )}
                      {msg.text && <div style={{ padding: msg.image ? '4px 6px 2px' : 0 }}>{msg.text}</div>}
                    </div>
                    {isGroupEnd && (
                      <div className="wchat-end-meta">
                        <span>{formatTime(msg.timestamp)}</span>
                        {isMe && (
                          <span style={{ color: isSeen ? '#38bdf8' : '#7d7290', display: 'inline-flex' }}>
                            {isSeen ? <CheckCheck size={12} /> : <Check size={12} />}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} className="wchat-end" />
          </div>
        ) : (
          <div className="wchat-panel-users">{renderUsersPanel()}</div>
        )}
      </div>

      {renderFloatingPickers()}

      <div className="wchat-dock">
        <div className={`qeb-shell ${isDarkTheme ? 'qeb-is-dark' : 'qeb-is-light'}`}>
          <div className="qeb-strip">
            {quickEmojis.map((emoji) => (
              <button key={emoji} type="button" className="qeb-emoji-btn" onClick={() => handleInsertEmoji(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
          <div className="qeb-dock">
            <button
              type="button"
              className={`qeb-dock-btn ${showQuickEmojiManager ? 'open' : ''}`}
              onClick={() => {
                setShowQuickEmojiManager((prev) => !prev);
                setShowEmojiPicker(false);
                setShowGiphy(false);
              }}
            >
              {showQuickEmojiManager ? <Check size={13} /> : <Plus size={13} />}
            </button>
          </div>
        </div>
        <form className="wchat-composer" onSubmit={handleSubmit}>
          <div className="wchat-input-capsule">
            <button
              type="button"
              className={`wchat-gif-btn ${showGiphy ? 'active' : ''}`}
              onClick={() => {
                setShowGiphy((prev) => !prev);
                setShowEmojiPicker(false);
              }}
            >
              GIF
            </button>
            <button
              type="button"
              className={`wchat-tool-btn ${showEmojiPicker ? 'active' : ''}`}
              onClick={() => {
                setShowEmojiPicker((prev) => !prev);
                setShowGiphy(false);
              }}
            >
              <Smile size={15} />
            </button>
            <input
              ref={inputRef}
              type="text"
              className="wchat-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Message room..."
            />
            <button type="button" className="wchat-tool-btn" onClick={() => handleInsertEmoji('❤️')}>
              <ClayHeart size={15} />
            </button>
          </div>
          <button type="submit" disabled={!inputText.trim()} className={`wchat-send-btn ${inputText.trim() ? 'ready' : ''}`}>
            {inputText.trim() ? <ClayArrow direction="up" size={14} /> : <Send size={13} />}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatSidebar;
