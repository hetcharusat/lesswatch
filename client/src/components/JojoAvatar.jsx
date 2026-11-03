import React from 'react';

/**
 * JoJo's Bizarre Adventure Custom Anime Avatars
 * - Het -> Jotaro Kujo (Stardust Crusaders)
 * - Ria -> Jolyne Cujoh (Stone Ocean)
 */

export function JojoAvatar({ name = '', avatar = '', size = 32, className = '', style = {}, showBorder = true }) {
  const [imgError, setImgError] = React.useState(false);
  const cleanName = (name || '').trim().toLowerCase();
  const rawAvatar = (avatar || '').trim();
  const cleanAvatar = rawAvatar.toLowerCase();

  React.useEffect(() => {
    setImgError(false);
  }, [rawAvatar]);

  const isCustomImage = !imgError && (
    rawAvatar.startsWith('data:') ||
    rawAvatar.startsWith('/api/avatars') ||
    rawAvatar.startsWith('/') ||
    rawAvatar.startsWith('http://') ||
    rawAvatar.startsWith('https://')
  );

  const isJotaro =
    !isCustomImage && (
      cleanAvatar === 'jotaro' ||
      cleanAvatar === '👑' ||
      cleanName.includes('het') ||
      cleanName === 'jotaro'
    );

  const isJolyne =
    !isCustomImage && (
      cleanAvatar === 'jolyne' ||
      cleanAvatar === '🌸' ||
      cleanName.includes('ria') ||
      cleanName === 'jolyne'
    );

  const s = typeof size === 'number' ? `${size}px` : size;

  const containerStyle = {
    width: s,
    height: s,
    minWidth: s,
    minHeight: s,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    boxShadow: showBorder
      ? isJotaro
        ? '0 0 10px rgba(245, 158, 11, 0.45), 0 2px 6px rgba(0,0,0,0.5)'
        : '0 0 10px rgba(244, 114, 182, 0.5), 0 2px 6px rgba(0,0,0,0.5)'
      : 'none',
    border: showBorder
      ? isJotaro
        ? '1.5px solid #fbbf24'
        : '1.5px solid #f472b6'
      : 'none',
    background: isJotaro
      ? 'radial-gradient(circle at 40% 30%, #312e81 0%, #1e1b4b 60%, #0f172a 100%)'
      : 'radial-gradient(circle at 40% 30%, #4c1d95 0%, #3b0764 60%, #111827 100%)',
    ...style
  };

  if (isCustomImage) {
    return (
      <div className={`jojo-avatar custom-user-avatar ${className}`} style={containerStyle} title={name}>
        <img
          src={rawAvatar}
          alt={name}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
        />
      </div>
    );
  }

  if (isJotaro) {
    // Jotaro Kujo (Stardust Crusaders) - Iconic black cap with gold hand/star plate, high collar, gold chain, intense anime eyes
    return (
      <div className={`jojo-avatar jojo-jotaro ${className}`} style={containerStyle} title="Het">
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="jotaroCoat" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e1b4b" />
              <stop offset="100%" stopColor="#09090b" />
            </linearGradient>
            <linearGradient id="jotaroGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
            <linearGradient id="jotaroSkin" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fed7aa" />
              <stop offset="100%" stopColor="#fba779" />
            </linearGradient>
            <linearGradient id="starAura" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>

          {/* Star Platinum Aura Glow */}
          <circle cx="50" cy="50" r="48" fill="none" stroke="url(#starAura)" strokeWidth="3" opacity="0.45" />

          {/* High Collar & Jacket */}
          <path d="M12 98 L24 72 L36 82 L50 86 L64 82 L76 72 L88 98 Z" fill="url(#jotaroCoat)" />
          {/* Collar Lapels */}
          <path d="M24 72 L38 58 L46 76 Z" fill="#18181b" stroke="#312e81" strokeWidth="1.5" />
          <path d="M76 72 L62 58 L54 76 Z" fill="#18181b" stroke="#312e81" strokeWidth="1.5" />

          {/* Jotaro's Iconic Gold Chain across collar */}
          <path d="M26 74 Q38 88 52 82 Q64 78 72 74" fill="none" stroke="url(#jotaroGold)" strokeWidth="3.2" strokeLinecap="round" strokeDasharray="5,2" />
          <circle cx="27" cy="74" r="3" fill="url(#jotaroGold)" />

          {/* Neck & Jaw */}
          <polygon points="40,58 60,58 56,76 44,76" fill="#fba779" />
          {/* Face */}
          <polygon points="32,42 68,42 64,65 50,75 36,65" fill="url(#jotaroSkin)" />

          {/* Sharp JoJo Jaw Shading Lines */}
          <line x1="40" y1="62" x2="45" y2="67" stroke="#ea580c" strokeWidth="1" opacity="0.6" />
          <line x1="55" y1="67" x2="60" y2="62" stroke="#ea580c" strokeWidth="1" opacity="0.6" />
          {/* Determined Mouth */}
          <line x1="44" y1="66" x2="56" y2="66" stroke="#451a03" strokeWidth="1.8" strokeLinecap="round" />

          {/* Piercing Anime Eyes */}
          {/* Left Eye */}
          <polygon points="37,49 46,47 44,52 38,52" fill="#fff" />
          <circle cx="42" cy="50" r="2" fill="#0284c7" />
          {/* Right Eye */}
          <polygon points="54,47 63,49 62,52 56,52" fill="#fff" />
          <circle cx="58" cy="50" r="2" fill="#0284c7" />

          {/* Intense Brow Shadow */}
          <polygon points="34,44 48,43 47,46 35,47" fill="#1c1917" />
          <polygon points="52,43 66,44 65,47 53,46" fill="#1c1917" />

          {/* Jotaro's Cap (Hair seamlessly fusing into back of the visor) */}
          {/* Hair sides and spiky fusion back */}
          <path d="M28 42 L24 54 L32 50 L28 42 Z" fill="#09090b" />
          <path d="M72 42 L76 54 L68 50 L72 42 Z" fill="#09090b" />
          <path d="M68 28 L84 26 L76 38 L88 36 L74 46 Z" fill="#09090b" />

          {/* Cap Crown */}
          <path d="M26 34 Q50 18 74 34 L72 42 Q50 32 28 42 Z" fill="#18181b" />
          {/* Cap Visor with Shadow */}
          <path d="M24 40 Q50 34 76 40 L78 44 Q50 38 22 44 Z" fill="#09090b" />

          {/* Golden Hand / Star Badge on Cap */}
          <circle cx="50" cy="31" r="7" fill="url(#jotaroGold)" stroke="#78350f" strokeWidth="1" />
          {/* Star symbol inside badge */}
          <path d="M50 26 L51.8 30 L56 30 L52.5 32.5 L54 36.5 L50 34 L46 36.5 L47.5 32.5 L44 30 L48.2 30 Z" fill="#18181b" />
          <rect x="58" y="29" width="8" height="4" rx="1.5" fill="url(#jotaroGold)" />
        </svg>
      </div>
    );
  }

  if (isJolyne) {
    // Jolyne Cujoh (Stone Ocean) - Iconic double hair buns in lime/black, butterfly chest motif, turquoise/fuchsia anime styling
    return (
      <div className={`jojo-avatar jojo-jolyne ${className}`} style={containerStyle} title="Ria">
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="jolyneLime" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#bef264" />
              <stop offset="60%" stopColor="#84cc16" />
              <stop offset="100%" stopColor="#4d7c0f" />
            </linearGradient>
            <linearGradient id="jolyneHairDark" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <linearGradient id="jolyneSkin" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffe4e6" />
              <stop offset="100%" stopColor="#fecdd3" />
            </linearGradient>
            <linearGradient id="jolynePink" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f472b6" />
              <stop offset="100%" stopColor="#db2777" />
            </linearGradient>
          </defs>

          {/* Stone Free String / Aura Glow */}
          <circle cx="50" cy="50" r="48" fill="none" stroke="url(#jolyneLime)" strokeWidth="3" opacity="0.5" strokeDasharray="6,3" />

          {/* Jolyne's Iconic Double Braided Loop Buns (Top Left & Top Right) */}
          {/* Left Hair Bun Loop */}
          <circle cx="27" cy="22" r="14" fill="url(#jolyneLime)" stroke="#1e293b" strokeWidth="2.5" />
          <circle cx="27" cy="22" r="6" fill="#1e293b" />
          {/* Right Hair Bun Loop */}
          <circle cx="73" cy="22" r="14" fill="url(#jolyneLime)" stroke="#1e293b" strokeWidth="2.5" />
          <circle cx="73" cy="22" r="6" fill="#1e293b" />

          {/* Base Dark Hair */}
          <path d="M22 34 Q50 14 78 34 Q82 60 76 66 L70 54 Q50 36 30 54 L24 66 Q18 60 22 34 Z" fill="url(#jolyneHairDark)" />

          {/* Halter Top & Shoulder with Butterfly Emblem */}
          <path d="M18 98 L32 76 L50 82 L68 76 L82 98 Z" fill="#0f172a" stroke="#84cc16" strokeWidth="1.2" />
          {/* Butterfly Emblem on Chest */}
          <path d="M50 86 Q42 78 40 84 Q46 88 50 90 Q54 88 60 84 Q58 78 50 86 Z" fill="url(#jolynePink)" />
          <circle cx="50" cy="87" r="1.5" fill="#fef08a" />

          {/* Slender Neck & Jaw */}
          <polygon points="43,62 57,62 55,78 45,78" fill="#fda4af" />
          {/* Face */}
          <polygon points="34,44 66,44 62,64 50,76 38,64" fill="url(#jolyneSkin)" />

          {/* Lime Green Braided Bangs framing forehead */}
          <path d="M28 36 Q38 48 50 38 Q62 48 72 36 Q50 28 28 36 Z" fill="url(#jolyneLime)" stroke="#365314" strokeWidth="1" />

          {/* Anime Eyes with fierce, beautiful winged eyeliner */}
          {/* Left Eye */}
          <polygon points="38,51 46,49 45,54 39,54" fill="#fff" />
          <circle cx="43" cy="52" r="2.2" fill="#06b6d4" />
          <path d="M36 50 Q43 47 47 49" fill="none" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
          {/* Winged Lash */}
          <line x1="36" y1="50" x2="33" y2="48" stroke="#0f172a" strokeWidth="1.8" />

          {/* Right Eye */}
          <polygon points="54,49 62,51 61,54 55,54" fill="#fff" />
          <circle cx="57" cy="52" r="2.2" fill="#06b6d4" />
          <path d="M53 49 Q57 47 64 50" fill="none" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
          {/* Winged Lash */}
          <line x1="64" y1="50" x2="67" y2="48" stroke="#0f172a" strokeWidth="1.8" />

          {/* Cute Nose and Glossy Pink Lips */}
          <circle cx="50" cy="62" r="0.8" fill="#e11d48" />
          <path d="M45 68 Q50 71 55 68" fill="none" stroke="url(#jolynePink)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // Fallback for any other user
  return (
    <div className={`user-fallback-avatar ${className}`} style={containerStyle}>
      <span style={{ fontSize: `calc(${s} * 0.55)` }}>{avatar || '🍿'}</span>
    </div>
  );
}

export function UserAvatar(props) {
  const { user, ...rest } = props;
  const name = user?.name || user?.username || props.name || '';
  const avatar = user?.avatar || props.avatar || '';
  return <JojoAvatar name={name} avatar={avatar} {...rest} />;
}
