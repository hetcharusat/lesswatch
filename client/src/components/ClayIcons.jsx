import React from 'react';

/**
 * 3D Claymorphic Aesthetic Icons (Puffy, glossy, marshmallow clay with dual-shade depth & highlights)
 * Designed for Watch Together Pink Edition.
 * NO NORMAL ICONS - All bespoke 3D puffy clay SVG assets.
 */

// 1. 3D Clay Popcorn Cinema Icon
export function ClayPopcorn({ size = 24, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 3px 6px rgba(236,72,153,0.35))', ...style }}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="cp_bucket" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="50%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#be185d" />
          </linearGradient>
          <linearGradient id="cp_rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="60%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="cp_puff" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#fbcfe8" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
        </defs>
        <circle cx="15" cy="15" r="5" fill="url(#cp_puff)" />
        <circle cx="25" cy="15" r="5" fill="url(#cp_puff)" />
        <circle cx="20" cy="11" r="5.5" fill="#ffffff" />
        <circle cx="11" cy="17" r="4" fill="url(#cp_puff)" />
        <circle cx="29" cy="17" r="4" fill="url(#cp_puff)" />
        <circle cx="19" cy="15" r="5" fill="#ffffff" />
        <circle cx="20" cy="11" r="1.5" fill="#fef08a" />
        <rect x="7" y="19" width="26" height="4.5" rx="2.2" fill="url(#cp_rim)" stroke="#b45309" strokeWidth="0.5" />
        <path d="M9 23 L12 36 Q13 38 15 38 L25 38 Q27 38 28 36 L31 23 Z" fill="url(#cp_bucket)" stroke="#9d174d" strokeWidth="0.5" />
        <path d="M15 23 L16.5 38 L19 38 L18 23 Z" fill="#ffffff" opacity="0.9" />
        <path d="M23 23 L22 38 L24.5 38 L26 23 Z" fill="#ffffff" opacity="0.9" />
        <circle cx="20.5" cy="30.5" r="2.8" fill="url(#cp_rim)" />
      </svg>
    </span>
  );
}

// 2. 3D Clay Folder Icon
export function ClayFolder({ size = 24, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 3px 6px rgba(244,114,182,0.35))', ...style }}>
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <defs>
          <linearGradient id="cf_back" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f472b6" />
            <stop offset="100%" stopColor="#db2777" />
          </linearGradient>
          <linearGradient id="cf_front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#ffe4f1" />
            <stop offset="100%" stopColor="#fbcfe8" />
          </linearGradient>
          <linearGradient id="cf_tab" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <rect x="5" y="11" width="30" height="23" rx="5" fill="url(#cf_back)" />
        <path d="M5 14 Q5 11 8 11 L16 11 L19 14 Z" fill="url(#cf_tab)" />
        <rect x="8" y="13" width="24" height="10" rx="3" fill="#ffffff" opacity="0.95" />
        <path d="M4 17 Q4 15 7 15 L33 15 Q36 15 36 17 L34.5 32 Q34 35 31 35 L9 35 Q6 35 5.5 32 Z" fill="url(#cf_front)" stroke="rgba(255,255,255,0.9)" strokeWidth="1" />
        <circle cx="20" cy="24" r="2.5" fill="#f43f5e" />
      </svg>
    </span>
  );
}

// 3. 3D Clay TV / Common Room Screen Icon
export function ClayTv({ size = 24, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 3px 6px rgba(236,72,153,0.35))', ...style }}>
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <defs>
          <linearGradient id="ctv_body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="100%" stopColor="#c2185b" />
          </linearGradient>
          <linearGradient id="ctv_screen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e1028" />
            <stop offset="100%" stopColor="#0a050f" />
          </linearGradient>
          <linearGradient id="ctv_knob" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <line x1="14" y1="5" x2="19" y2="10" stroke="#ff70ba" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="26" y1="5" x2="21" y2="10" stroke="#ff70ba" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="14" cy="5" r="2" fill="url(#ctv_knob)" />
        <circle cx="26" cy="5" r="2" fill="url(#ctv_knob)" />
        <rect x="4" y="10" width="32" height="23" rx="6" fill="url(#ctv_body)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
        <rect x="7" y="13" width="21" height="17" rx="3.5" fill="url(#ctv_screen)" stroke="rgba(244,114,182,0.4)" strokeWidth="0.8" />
        <path d="M8 15 L20 15 L15 28 L8 28 Z" fill="#ffffff" opacity="0.12" />
        <circle cx="31.5" cy="17" r="2.2" fill="url(#ctv_knob)" />
        <circle cx="31.5" cy="23" r="2.2" fill="url(#ctv_knob)" />
        <rect x="30" y="27" width="3" height="1.5" rx="0.75" fill="#fbcfe8" />
        <path d="M10 33 L8 36" stroke="#c2185b" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M30 33 L32 36" stroke="#c2185b" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// 4. 3D Clay Cinema Film Reel Icon
export function ClayFilm({ size = 24, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 3px 6px rgba(245,158,11,0.35))', ...style }}>
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <defs>
          <linearGradient id="cfilm_gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="16" fill="url(#cfilm_gold)" stroke="#78350f" strokeWidth="1" />
        <circle cx="20" cy="20" r="13" fill="#ffffff" opacity="0.25" />
        <circle cx="20" cy="20" r="5" fill="#78350f" />
        <circle cx="20" cy="20" r="2.5" fill="#fef08a" />
        <circle cx="12" cy="14" r="3" fill="#ffffff" />
        <circle cx="28" cy="14" r="3" fill="#ffffff" />
        <circle cx="12" cy="26" r="3" fill="#ffffff" />
        <circle cx="28" cy="26" r="3" fill="#ffffff" />
      </svg>
    </span>
  );
}

// 5. 3D Clay Sparkles Icon
export function ClaySparkle({ size = 24, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 5px rgba(244,114,182,0.4))', ...style }}>
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <defs>
          <linearGradient id="csp_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="30%" stopColor="#fef08a" />
            <stop offset="70%" stopColor="#ff70ba" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <path d="M20 3 C20 12, 23 15, 32 15 C23 15, 20 18, 20 27 C20 18, 17 15, 8 15 C17 15, 20 12, 20 3 Z" fill="url(#csp_grad)" stroke="#ffffff" strokeWidth="0.8" />
        <path d="M29 25 C29 28, 30 29, 34 29 C30 29, 29 30, 29 34 C29 30, 28 29, 24 29 C28 29, 29 28, 29 25 Z" fill="#fef08a" />
        <circle cx="11" cy="29" r="2" fill="#ffffff" />
      </svg>
    </span>
  );
}

// 6. 3D Clay Chat Bubble Icon
export function ClayChat({ size = 24, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 3px 6px rgba(236,72,153,0.35))', ...style }}>
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <defs>
          <linearGradient id="cchat_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="50%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#be185d" />
          </linearGradient>
        </defs>
        <path d="M8 10 Q8 6 13 6 L27 6 Q32 6 32 10 L32 24 Q32 28 27 28 L15 28 L9 34 Q7 35 7 32 L7 28 Q4 28 4 24 L4 10 Q4 6 8 10 Z" fill="url(#cchat_grad)" stroke="#ffffff" strokeWidth="1" />
        <circle cx="13" cy="17" r="2.2" fill="#ffffff" />
        <circle cx="19" cy="17" r="2.2" fill="#ffffff" />
        <circle cx="25" cy="17" r="2.2" fill="#ffffff" />
      </svg>
    </span>
  );
}

// 7. 3D Clay Download Cloud Icon
export function ClayDownload({ size = 24, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 3px 6px rgba(16,185,129,0.35))', ...style }}>
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <defs>
          <linearGradient id="cdl_cloud" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#d1fae5" />
          </linearGradient>
          <linearGradient id="cdl_arrow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <path d="M12 28 Q8 28 6 24 Q4 20 8 17 Q8 12 14 10 Q19 7 24 10 Q28 8 32 13 Q35 17 33 22 Q36 26 31 28 Z" fill="url(#cdl_cloud)" stroke="rgba(16,185,129,0.5)" strokeWidth="1.2" />
        <path d="M19 16 L21 16 L21 24 L25 24 L20 30 L15 24 L19 24 Z" fill="url(#cdl_arrow)" stroke="#047857" strokeWidth="0.8" />
      </svg>
    </span>
  );
}

// 8. 3D Clay Play Pill Icon
export function ClayPlay({ size = 24, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 3px 6px rgba(236,72,153,0.35))', ...style }}>
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <defs>
          <linearGradient id="cplay_bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="100%" stopColor="#db2777" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="16" fill="url(#cplay_bg)" stroke="#ffffff" strokeWidth="1.2" />
        <polygon points="16,12 28,20 16,28" fill="#ffffff" />
      </svg>
    </span>
  );
}

// 9. 3D Clay Collapsible Arrow Icon
export function ClayArrow({ direction = 'right', size = 20, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  const rot = direction === 'left' ? 180 : direction === 'up' ? -90 : direction === 'down' ? 90 : 0;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', transform: `rotate(${rot}deg)`, filter: 'drop-shadow(0 2px 5px rgba(236,72,153,0.35))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="carr_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="100%" stopColor="#db2777" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10.5" fill="url(#carr_grad)" stroke="#ffffff" strokeWidth="1.2" />
        <path d="M10 7.5 L15 12 L10 16.5" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

// 10. 3D Clay Home Icon
export function ClayHome({ size = 24, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 3px 6px rgba(244,114,182,0.35))', ...style }}>
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <defs>
          <linearGradient id="chome_roof" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          <linearGradient id="chome_wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#ffe4f1" />
          </linearGradient>
        </defs>
        <polygon points="20,7 6,18 9,20 20,11 31,20 34,18" fill="url(#chome_roof)" stroke="#be185d" strokeWidth="0.8" />
        <rect x="9" y="17" width="22" height="17" rx="4" fill="url(#chome_wall)" stroke="#f472b6" strokeWidth="1" />
        <path d="M17 34 L17 24 Q17 22 20 22 Q23 22 23 24 L23 34 Z" fill="#ec4899" />
        <circle cx="20" cy="15" r="2.2" fill="#fef08a" />
      </svg>
    </span>
  );
}

// 11. 3D Clay Heart Icon
export function ClayHeart({ size = 20, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 5px rgba(239,68,68,0.4))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="cheart_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff4d88" />
            <stop offset="60%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
        </defs>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="url(#cheart_grad)" stroke="#ffffff" strokeWidth="0.8" />
        <circle cx="7" cy="7" r="1.5" fill="#ffffff" opacity="0.8" />
      </svg>
    </span>
  );
}

// 12. 3D Clay Checkmark / Double Check (Seen Receipts)
export function ClayCheck({ double = false, size = 18, color = '#10b981', className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: `drop-shadow(0 1px 3px ${color}55)`, ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <path d="M4 12.5 L9 17.5 L20 6.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {double && (
          <path d="M8 12.5 L12 16.5 L22 6.5" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        )}
      </svg>
    </span>
  );
}

// 13. 3D Clay Clock Icon
export function ClayClock({ size = 18, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 4px rgba(244,114,182,0.3))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="cclk_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fdf2f8" />
            <stop offset="100%" stopColor="#fbcfe8" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10" fill="url(#cclk_grad)" stroke="#ec4899" strokeWidth="1.5" />
        <polyline points="12 6 12 12 16 14" fill="none" stroke="#be185d" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1.5" fill="#be185d" />
      </svg>
    </span>
  );
}

// 14. 3D Clay Close X Button Icon
export function ClayClose({ size = 18, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 4px rgba(239,68,68,0.35))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="ccls_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10.5" fill="url(#ccls_grad)" stroke="#ffffff" strokeWidth="1.2" />
        <path d="M8 8 L16 16 M16 8 L8 16" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// 15. 3D Clay Plus Button Icon
export function ClayPlus({ size = 20, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 5px rgba(236,72,153,0.35))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="cpls_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10.5" fill="url(#cpls_grad)" stroke="#ffffff" strokeWidth="1.2" />
        <path d="M12 7 L12 17 M7 12 L17 12" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// 16. 3D Clay Trash Delete Icon
export function ClayTrash({ size = 20, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 4px rgba(239,68,68,0.3))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="ctrs_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fda4af" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <rect x="5" y="8" width="14" height="13" rx="3" fill="url(#ctrs_grad)" stroke="#ffffff" strokeWidth="1" />
        <path d="M4 6 L20 6" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M9 4 Q9 3 10 3 L14 3 Q15 3 15 4 L15 6 L9 6 Z" fill="#f43f5e" />
        <line x1="9" y1="11" x2="9" y2="17" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="15" y1="11" x2="15" y2="17" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// 17. 3D Clay Edit Pencil Icon
export function ClayEdit({ size = 20, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 4px rgba(245,158,11,0.3))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="cedt_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <path d="M16 3 L21 8 L8 21 L3 21 L3 16 Z" fill="url(#cedt_grad)" stroke="#b45309" strokeWidth="1" />
        <path d="M13 6 L18 11" stroke="#ffffff" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

// 18. 3D Clay Search Icon
export function ClaySearch({ size = 20, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 4px rgba(244,114,182,0.3))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <circle cx="10" cy="10" r="6.5" fill="rgba(255,255,255,0.7)" stroke="#ec4899" strokeWidth="2.5" />
        <line x1="15" y1="15" x2="20" y2="20" stroke="#be185d" strokeWidth="3" strokeLinecap="round" />
        <circle cx="8" cy="8" r="1.5" fill="#ffffff" />
      </svg>
    </span>
  );
}

// 19. 3D Clay Refresh Icon
export function ClayRefresh({ size = 20, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 4px rgba(244,114,182,0.3))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <path d="M20 11 A8 8 0 1 0 18 16" fill="none" stroke="#ec4899" strokeWidth="2.8" strokeLinecap="round" />
        <polyline points="20 7 20 11 16 11" fill="none" stroke="#be185d" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

// 20. 3D Clay Upload Cloud Icon
export function ClayUpload({ size = 20, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 4px rgba(244,114,182,0.3))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="cup_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f472b6" />
            <stop offset="100%" stopColor="#db2777" />
          </linearGradient>
        </defs>
        <path d="M12 16 L12 7 M8 11 L12 7 L16 11" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17 Q4 20 8 20 L16 20 Q20 20 20 17" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// 21. 3D Clay Seen Eye Icon (Receipts)
export function ClayEye({ size = 18, color = '#ec4899', className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: `drop-shadow(0 1px 3px ${color}55)`, ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="#ffffff" stroke={color} strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.5" fill={color} />
        <circle cx="13" cy="11" r="1.2" fill="#ffffff" />
      </svg>
    </span>
  );
}

// 22. 3D Clay Pause Icon
export function ClayPause({ size = 24, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 3px 6px rgba(236,72,153,0.35))', ...style }}>
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <defs>
          <linearGradient id="cpause_bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="100%" stopColor="#db2777" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="16" fill="url(#cpause_bg)" stroke="#ffffff" strokeWidth="1.2" />
        <rect x="14" y="13" width="4" height="14" rx="2" fill="#ffffff" />
        <rect x="22" y="13" width="4" height="14" rx="2" fill="#ffffff" />
      </svg>
    </span>
  );
}

// 23. 3D Clay Volume Icon
export function ClayVolume({ size = 22, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 5px rgba(236,72,153,0.3))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="cvol_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <path d="M4 9 L8 9 L13 5 L13 19 L8 15 L4 15 Z" fill="url(#cvol_grad)" stroke="#ffffff" strokeWidth="0.8" />
        <path d="M16 8 Q19 12 16 16" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M18.5 5.5 Q22.5 12 18.5 18.5" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// 24. 3D Clay Mute Icon
export function ClayMute({ size = 22, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 5px rgba(239,68,68,0.35))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="cmute_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        <path d="M4 9 L8 9 L13 5 L13 19 L8 15 L4 15 Z" fill="url(#cmute_grad)" stroke="#ffffff" strokeWidth="0.8" />
        <line x1="16" y1="9" x2="21" y2="15" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="21" y1="9" x2="16" y2="15" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// 25. 3D Clay Fullscreen Icon
export function ClayFullscreen({ size = 22, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 5px rgba(236,72,153,0.3))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <path d="M3 8 L3 4 Q3 3 4 3 L8 3" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M16 3 L20 3 Q21 3 21 4 L21 8" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M21 16 L21 20 Q21 21 20 21 L16 21" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M8 21 L4 21 Q3 21 3 20 L3 16" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// 26. 3D Clay Compress (Exit Fullscreen) Icon
export function ClayCompress({ size = 22, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 5px rgba(236,72,153,0.3))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <path d="M8 3 L8 7 Q8 8 7 8 L3 8" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M16 3 L16 7 Q16 8 17 8 L21 8" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M16 21 L16 17 Q16 16 17 16 L21 16" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M8 21 L8 17 Q8 16 7 16 L3 16" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// 27. 3D Clay Headphones (Audio Tracks) Icon
export function ClayHeadphones({ size = 22, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 5px rgba(236,72,153,0.35))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="chp_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="100%" stopColor="#db2777" />
          </linearGradient>
        </defs>
        <path d="M3 13 A9 9 0 0 1 21 13" fill="none" stroke="url(#chp_grad)" strokeWidth="3" strokeLinecap="round" />
        <rect x="2" y="12" width="4.5" height="8" rx="2.2" fill="url(#chp_grad)" stroke="#ffffff" strokeWidth="0.8" />
        <rect x="17.5" y="12" width="4.5" height="8" rx="2.2" fill="url(#chp_grad)" stroke="#ffffff" strokeWidth="0.8" />
      </svg>
    </span>
  );
}

// 28. 3D Clay Subtitles (CC) Icon
export function ClaySubtitles({ size = 22, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 5px rgba(236,72,153,0.35))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <defs>
          <linearGradient id="csub_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="100%" stopColor="#db2777" />
          </linearGradient>
        </defs>
        <rect x="2" y="4" width="20" height="16" rx="4" fill="url(#csub_grad)" stroke="#ffffff" strokeWidth="1" />
        <rect x="6" y="8" width="5" height="3" rx="1" fill="#ffffff" />
        <rect x="13" y="8" width="5" height="3" rx="1" fill="#ffffff" />
        <rect x="6" y="13" width="12" height="3" rx="1" fill="#ffffff" />
      </svg>
    </span>
  );
}

// 29. 3D Clay Rewind -5s Icon
export function ClayRewind({ size = 22, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 4px rgba(236,72,153,0.3))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <polygon points="11,6 3,12 11,18" fill="#ffffff" />
        <polygon points="20,6 12,12 20,18" fill="#ffffff" />
      </svg>
    </span>
  );
}

// 30. 3D Clay Forward +5s Icon
export function ClayForward({ size = 22, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 4px rgba(236,72,153,0.3))', ...style }}>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <polygon points="13,6 21,12 13,18" fill="#ffffff" />
        <polygon points="4,6 12,12 4,18" fill="#ffffff" />
      </svg>
    </span>
  );
}

// 31. 3D Clay Move / Relocate Icon
export function ClayMove({ size = 20, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 3px 6px rgba(168,85,247,0.35))', ...style }}>
      <svg viewBox="0 0 32 32" width="100%" height="100%">
        <defs>
          <linearGradient id="clayMoveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#9333ea" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="14" fill="url(#clayMoveGrad)" />
        <path d="M16 7 L12 11 H14 V14 H11 V12 L7 16 L11 20 V18 H14 V21 H12 L16 25 L20 21 H18 V18 H21 V20 L25 16 L21 12 V14 H18 V11 H20 Z" fill="#ffffff" />
      </svg>
    </span>
  );
}

// 32. 3D Clay Folder Plus Icon
export function ClayFolderPlus({ size = 22, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className={`clay-icon ${className}`} style={{ display: 'inline-flex', width: s, height: s, minWidth: s, minHeight: s, alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 3px 6px rgba(245,158,11,0.35))', ...style }}>
      <svg viewBox="0 0 32 32" width="100%" height="100%">
        <defs>
          <linearGradient id="clayFoldPlusGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <path d="M4 8 C4 6 5.5 5 7.5 5 L12 5 L14.5 8 L24.5 8 C26.5 8 28 9.5 28 11.5 L28 23.5 C28 25.5 26.5 27 24.5 27 L7.5 27 C5.5 27 4 25.5 4 23.5 Z" fill="url(#clayFoldPlusGrad)" />
        <rect x="14" y="14" width="4" height="9" rx="2" fill="#ffffff" />
        <rect x="11.5" y="16.5" width="9" height="4" rx="2" fill="#ffffff" />
      </svg>
    </span>
  );
}

export default {
  ClayMove,
  ClayFolderPlus,
  ClayPopcorn,
  ClayFolder,
  ClayTv,
  ClayFilm,
  ClaySparkle,
  ClayChat,
  ClayDownload,
  ClayPlay,
  ClayPause,
  ClayArrow,
  ClayHome,
  ClayHeart,
  ClayCheck,
  ClayClock,
  ClayClose,
  ClayPlus,
  ClayTrash,
  ClayEdit,
  ClaySearch,
  ClayRefresh,
  ClayUpload,
  ClayEye,
  ClayVolume,
  ClayMute,
  ClayFullscreen,
  ClayCompress,
  ClayHeadphones,
  ClaySubtitles,
  ClayRewind,
  ClayForward
};

