import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, Sparkles } from 'lucide-react';

const GIPHY_API_KEY = 'OfSdj93n17Z8eODuSQMenefVnOput8Wi';

const QUICK_TAGS = [
  'Trending',
  'Anime',
  'Love',
  'Popcorn',
  'Laugh',
  'Dance',
  'Cat',
  'Hype',
  'Reaction',
  'Sad'
];

export function GiphyPicker({ onSelectGif, onClose, isDarkTheme = true }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [gifs, setGifs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTag, setActiveTag] = useState('Trending');
  const debounceTimerRef = useRef(null);
  const containerRef = useRef(null);

  // Fetch GIFs (Trending or Search)
  const fetchGifs = async (query = '') => {
    setIsLoading(true);
    try {
      const endpoint = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query.trim())}&limit=28&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=28&rating=g`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGifs(data.data || []);
    } catch (err) {
      console.warn('Giphy fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchGifs();
  }, []);

  // Handle typing search with debounce
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    if (activeTag !== '') setActiveTag('');

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchGifs(val);
    }, 380);
  };

  // Handle Tag click
  const handleTagClick = (tag) => {
    setActiveTag(tag);
    setSearchTerm('');
    if (tag === 'Trending') {
      fetchGifs('');
    } else {
      fetchGifs(tag);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: '100%',
        maxHeight: '360px',
        display: 'flex',
        flexDirection: 'column',
        background: isDarkTheme ? 'rgba(18, 12, 26, 0.98)' : '#ffffff',
        border: isDarkTheme ? '1.5px solid rgba(244, 114, 182, 0.35)' : '1px solid rgba(244, 114, 182, 0.3)',
        borderRadius: '16px',
        boxShadow: isDarkTheme ? '0 12px 36px rgba(0, 0, 0, 0.7), 0 0 20px rgba(236, 72, 153, 0.25)' : '0 12px 30px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
        zIndex: 100,
        animation: 'poufPopIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both'
      }}
    >
      {/* Header with Search and Close */}
      <div
        style={{
          padding: '10px 12px 8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderBottom: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)'
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: isDarkTheme ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.04)',
            borderRadius: '9999px',
            padding: '5px 12px',
            border: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)'
          }}
        >
          <Search size={14} color={isDarkTheme ? '#f472b6' : '#ec4899'} />
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search GIPHY..."
            autoFocus
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: isDarkTheme ? '#ffffff' : '#1e293b',
              fontSize: '0.80rem',
              fontWeight: 500
            }}
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                fetchGifs('');
                setActiveTag('Trending');
              }}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: isDarkTheme ? '#e2e8f0' : '#475569',
              transition: 'background 0.15s ease'
            }}
            title="Close GIF Picker"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Quick Tag Pills */}
      <div
        style={{
          display: 'flex',
          gap: '5px',
          padding: '6px 12px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          whiteSpace: 'nowrap',
          borderBottom: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.04)'
        }}
      >
        {QUICK_TAGS.map((tag) => {
          const isActive = activeTag === tag;
          return (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              style={{
                background: isActive
                  ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)'
                  : (isDarkTheme ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'),
                color: isActive ? '#ffffff' : (isDarkTheme ? '#cbd5e1' : '#64748b'),
                border: 'none',
                borderRadius: '9999px',
                padding: '3px 10px',
                fontSize: '0.68rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                flexShrink: 0
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {/* GIFs Grid */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '6px',
          minHeight: '180px'
        }}
      >
        {isLoading ? (
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 0',
              color: '#f472b6',
              gap: '6px'
            }}
          >
            <Loader2 size={22} className="animate-spin" />
            <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Loading GIFs...</span>
          </div>
        ) : gifs.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              color: '#9ca3af',
              padding: '30px 0',
              fontSize: '0.76rem'
            }}
          >
            No GIFs found. Try another search!
          </div>
        ) : (
          gifs.map((g) => {
            const previewUrl = g.images?.fixed_height_small?.url || g.images?.fixed_height?.url;
            const fullUrl = g.images?.fixed_height?.url || g.images?.original?.url;
            if (!previewUrl) return null;

            return (
              <div
                key={g.id}
                onClick={() => onSelectGif(fullUrl, g.title)}
                style={{
                  position: 'relative',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  aspectRatio: '16/10',
                  background: isDarkTheme ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                  transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(236, 72, 153, 0.4)';
                  e.currentTarget.style.zIndex = '5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.zIndex = '1';
                }}
              >
                <img
                  src={previewUrl}
                  alt={g.title || 'GIF'}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Powered by Giphy Footer */}
      <div
        style={{
          padding: '4px 10px',
          background: isDarkTheme ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.02)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          borderTop: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.04)' : '1px solid rgba(0, 0, 0, 0.04)'
        }}
      >
        <span style={{ fontSize: '0.60rem', color: '#9ca3af', fontWeight: 600, letterSpacing: '0.04em' }}>
          POWERED BY GIPHY
        </span>
      </div>
    </div>
  );
}

export default GiphyPicker;
