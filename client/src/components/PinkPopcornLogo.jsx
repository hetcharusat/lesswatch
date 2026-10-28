import React from 'react';

/**
 * PinkPopcornLogo - Cute Glittering Pink Clay Popcorn Cinema Icon
 * Transparent background, 3D puffy clay curves, golden heart badge & sparkles!
 */
export function PinkPopcornLogo({ size = 36, className = '', style = {} }) {
  const s = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={`pink-popcorn-logo-wrap ${className}`}
      style={{
        width: s,
        height: s,
        minWidth: s,
        minHeight: s,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        filter: 'drop-shadow(0 4px 10px rgba(236, 72, 153, 0.45))',
        ...style
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        style={{ overflow: 'visible', display: 'block' }}
      >
        <defs>
          {/* Popcorn Bucket Gradient (Cute Strawberry Pink Clay) */}
          <linearGradient id="bucketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff70ba" />
            <stop offset="45%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#be185d" />
          </linearGradient>

          {/* Bucket Stripes (Milky Pink) */}
          <linearGradient id="stripeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#ffe4f1" />
          </linearGradient>

          {/* Golden Heart & Rim (Rose Gold Clay) */}
          <linearGradient id="goldRim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>

          {/* Fluffy Marshmallow Popcorn Clusters (Pastel Pink) */}
          <linearGradient id="popcornGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#fbcfe8" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>

          <linearGradient id="popcornGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fff0f8" />
            <stop offset="100%" stopColor="#f9a8d4" />
          </linearGradient>

          {/* Sparkle Glow */}
          <radialGradient id="sparkleGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="1" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* --- Fluffy Marshmallow Popcorn Top --- */}
        {/* Back clusters */}
        <circle cx="34" cy="38" r="13" fill="url(#popcornGrad2)" />
        <circle cx="66" cy="38" r="13" fill="url(#popcornGrad2)" />
        <circle cx="50" cy="30" r="14" fill="url(#popcornGrad1)" />

        {/* Front cute puffy popcorn cloud */}
        <circle cx="26" cy="44" r="11" fill="url(#popcornGrad1)" />
        <circle cx="40" cy="40" r="12" fill="#ffffff" />
        <circle cx="60" cy="40" r="12" fill="#ffffff" />
        <circle cx="74" cy="44" r="11" fill="url(#popcornGrad1)" />
        <circle cx="50" cy="42" r="11" fill="url(#popcornGrad2)" />

        {/* Cute Popcorn Butter Heart Highlights */}
        <circle cx="38" cy="36" r="3.5" fill="#fef08a" opacity="0.85" />
        <circle cx="62" cy="36" r="3.5" fill="#fef08a" opacity="0.85" />
        <circle cx="50" cy="28" r="4" fill="#fef08a" opacity="0.9" />

        {/* --- Bucket Upper Golden Rim (Clay Pill) --- */}
        <rect
          x="18"
          y="46"
          width="64"
          height="10"
          rx="5"
          fill="url(#goldRim)"
          stroke="#b45309"
          strokeWidth="0.8"
        />

        {/* --- Popcorn Bucket Body --- */}
        <path
          d="M22 55 L28 88 Q29 93 34 93 L66 93 Q71 93 72 88 L78 55 Z"
          fill="url(#bucketGrad)"
          stroke="#9d174d"
          strokeWidth="0.8"
        />

        {/* Milky Cute Stripes */}
        <path d="M36 55 L38 93 L44 93 L42 55 Z" fill="url(#stripeGrad)" opacity="0.9" />
        <path d="M58 55 L56 93 L62 93 L64 55 Z" fill="url(#stripeGrad)" opacity="0.9" />

        {/* Center Golden Heart Clay Badge */}
        <g transform="translate(50, 72) scale(0.95)">
          <path
            d="M0 -7 C-6 -14, -14 -7, -14 0 C-14 8, -4 14, 0 17 C4 14, 14 8, 14 0 C14 -7, 6 -14, 0 -7 Z"
            fill="url(#goldRim)"
            stroke="#78350f"
            strokeWidth="0.8"
          />
          <circle cx="-4" cy="-3" r="2" fill="#ffffff" opacity="0.8" />
        </g>

        {/* --- Twinkling Gold & Pink Sparkles --- */}
        {/* Top-Right Sparkle */}
        <path
          d="M84 20 L86 26 L92 28 L86 30 L84 36 L82 30 L76 28 L82 26 Z"
          fill="#fef08a"
          stroke="#f59e0b"
          strokeWidth="0.5"
        />
        {/* Top-Left Tiny Sparkle */}
        <path
          d="M16 28 L17.5 32 L21.5 33.5 L17.5 35 L16 39 L14.5 35 L10.5 33.5 L14.5 32 Z"
          fill="#ff85c8"
          stroke="#fff"
          strokeWidth="0.5"
        />
        {/* Bottom Sparkle */}
        <circle cx="82" cy="78" r="2.5" fill="#fef08a" />
      </svg>
    </div>
  );
}
export default PinkPopcornLogo;
