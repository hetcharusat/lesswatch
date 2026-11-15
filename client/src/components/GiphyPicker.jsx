import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

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
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query.trim())}&limit=30&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=30&rating=g`;

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

  useEffect(() => {
    fetchGifs();
  }, []);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    if (activeTag !== '') setActiveTag('');

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchGifs(val);
    }, 350);
  };

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
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: '100%',
        height: '340px',
        maxHeight: '340px',
        display: 'flex',
        flexDirection: 'column',
        background: isDarkTheme
          ? 'rgba(255, 255, 255, 0.22)'
          : 'rgba(255, 255, 255, 0.95)',
        border: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.38)' : '1px solid rgba(236, 72, 153, 0.2)',
        borderRadius: '20px',
        boxShadow: isDarkTheme
          ? '0 8px 32px rgba(0, 0, 0, 0.14), 0 2px 10px rgba(236, 72, 153, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.65), inset 0 -1px 0 rgba(255, 255, 255, 0.15), inset 0 0 20px 2px rgba(255, 255, 255, 0.2)'
          : '0 16px 36px rgba(236, 72, 153, 0.12), inset 0 1px 1px #ffffff',
        backdropFilter: 'blur(6px) saturate(160%)',
        WebkitBackdropFilter: 'blur(6px) saturate(160%)',
        overflow: 'hidden',
        zIndex: 120,
        boxSizing: 'border-box',
        pointerEvents: 'auto'
      }}
    >
      {/* Search Bar & Close */}
      <div
        style={{
          padding: '10px 12px 6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderBottom: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.06)',
          flexShrink: 0
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.04)',
            borderRadius: '9999px',
            padding: '6px 12px',
            border: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.18)' : '1px solid rgba(0, 0, 0, 0.08)'
          }}
        >
          <Search size={14} color={isDarkTheme ? '#f472b6' : '#ec4899'} />
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
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
              type="button"
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
            type="button"
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
              transition: 'background 0.15s ease',
              flexShrink: 0
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
          borderBottom: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.04)',
          flexShrink: 0
        }}
      >
        {QUICK_TAGS.map((tag) => {
          const isActive = activeTag === tag;
          return (
            <button
              key={tag}
              type="button"
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

      {/* GIFs Grid with Fixed Row Track Height to prevent CSS grid overlap */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridAutoRows: '115px',
          gap: '8px',
          minHeight: '140px'
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
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectGif(fullUrl, g.title);
                }}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '115px',
                  maxHeight: '115px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: isDarkTheme ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                  boxSizing: 'border-box',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(236, 72, 153, 0.45)';
                  e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.6)';
                  e.currentTarget.style.zIndex = '5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
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
          background: isDarkTheme ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.02)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          borderTop: isDarkTheme ? '1px solid rgba(255, 255, 255, 0.04)' : '1px solid rgba(0, 0, 0, 0.04)',
          flexShrink: 0
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
