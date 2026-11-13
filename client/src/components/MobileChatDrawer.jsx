import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, MicOff, X, Image as ImageIcon, Smile, ChevronDown } from 'lucide-react';
import { UserAvatar } from './JojoAvatar';

export function MobileChatDrawer({
  isOpen = false,
  onClose,
  messages = [],
  onSendMessage,
  currentProfile,
  connectedUsers = []
}) {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Initialize Web Speech API for voice dictation
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInputText(prev => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Auto scroll to bottom on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const toggleVoiceDictation = () => {
    if (!recognitionRef.current) {
      alert('Speech-to-text is not supported in this browser engine.');
      return;
    }

    if (navigator.vibrate) navigator.vibrate(25);

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        setIsListening(false);
      }
    }
  };

  const handleSend = (e) => {
    e?.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;
    if (navigator.vibrate) navigator.vibrate(15);
    onSendMessage?.(trimmed, null);
    setInputText('');
  };

  const sendQuickEmoji = (emoji) => {
    if (navigator.vibrate) navigator.vibrate(15);
    onSendMessage?.(emoji, null);
  };

  const emojis = ['❤️', '😂', '🥺', '🍿', '🔥', '✨', '👏', '👀'];

  return (
    <div className="mobile-chat-drawer-backdrop" onClick={onClose}>
      <div className="mobile-chat-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drag handle & header */}
        <div className="mobile-chat-drawer-handle-bar">
          <div className="mobile-chat-drag-handle" />
        </div>

        <div className="mobile-chat-drawer-header">
          <div className="mobile-chat-title-info">
            <h3>Lounge Chit-Chat</h3>
            <span className="online-count-pill">{connectedUsers.length} in room</span>
          </div>
          <button className="mobile-chat-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Message list */}
        <div className="mobile-chat-messages-container">
          {messages.length === 0 ? (
            <div className="mobile-chat-empty">
              <Smile size={28} className="text-pink-400 mb-2" />
              <p>No messages yet. Say hi to your party!</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMe = msg.username === currentProfile?.username;
              return (
                <div
                  key={msg.id || index}
                  className={`mobile-chat-bubble-row ${isMe ? 'outgoing' : 'incoming'}`}
                >
                  {!isMe && (
                    <div className="bubble-avatar-wrap">
                      <UserAvatar
                        avatarId={msg.avatar || 'josuke'}
                        customImage={msg.customAvatar}
                        size={28}
                      />
                    </div>
                  )}

                  <div className={`mobile-chat-bubble ${isMe ? 'mine' : 'theirs'}`}>
                    {!isMe && <span className="bubble-sender-name">{msg.name || msg.username}</span>}
                    <div className="bubble-text">{msg.text}</div>
                    {msg.image && (
                      <img src={msg.image} alt="uploaded" className="bubble-img-attachment" />
                    )}
                    <span className="bubble-time">
                      {msg.timestamp
                        ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Reaction Emoji Row */}
        <div className="mobile-chat-emoji-row">
          {emojis.map((em) => (
            <button
              key={em}
              type="button"
              className="quick-emoji-chip"
              onClick={() => sendQuickEmoji(em)}
            >
              {em}
            </button>
          ))}
        </div>

        {/* Input Bar with Voice Dictation */}
        <form className="mobile-chat-input-form" onSubmit={handleSend}>
          <button
            type="button"
            className={`mobile-voice-dictate-btn ${isListening ? 'listening' : ''}`}
            onClick={toggleVoiceDictation}
            title={isListening ? 'Stop listening' : 'Voice to Text Dictation'}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <input
            type="text"
            className="mobile-chat-input"
            placeholder={isListening ? 'Listening... Speak now...' : 'Message lounge...'}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          <button
            type="submit"
            className="mobile-chat-send-btn"
            disabled={!inputText.trim()}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default MobileChatDrawer;

