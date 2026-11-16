import React, { useLayoutEffect, useRef, useState } from 'react';
import LiquidGlass from 'liquid-glass-react';
import { gsap } from 'gsap';
import '../styles/theater-glass.css';

// One material palette and motion vocabulary for both theater and player.
const MATERIALS = {
  dock: { displacementScale: 24, blurAmount: 0.2, saturation: 135, aberrationIntensity: 0.7, cornerRadius: 999 },
  panel: { displacementScale: 16, blurAmount: 0.4, saturation: 125, aberrationIntensity: 0.4, cornerRadius: 20 },
};
const STILL_POINTER = { x: 0, y: 0 };

export function GlassSurface({ variant = 'dock', className = '', children, ...props }) {
  const surfaceRef = useRef(null);
  const [materialSize, setMaterialSize] = useState('initial');

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const filter = surface.querySelector('.cinema-glass-material filter');
    // Apply the library's generated displacement to the surface backdrop.
    // A nested filtered span cannot reliably sample composited video in Chrome.
    // Safari/Firefox retain the CSS blur fallback (no SVG backdrop support).
    if (filter && /Chrome|Chromium|Edg\//.test(navigator.userAgent)) {
      surface.style.setProperty('--cinema-glass-refraction', `url("#${filter.id}")`);
    }
    return () => surface.style.removeProperty('--cinema-glass-refraction');
  }, [materialSize, variant]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    // The library measures only on mount/window resize. Re-measure its material
    // when a menu changes height or the theater resizes after opening chat.
    let frame;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setMaterialSize(`${Math.round(entry.contentRect.width)}:${Math.round(entry.contentRect.height)}`);
      });
    });
    observer.observe(surface);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', (context) => {
      if (variant === 'panel') {
        gsap.fromTo(surface, { opacity: 0, y: 6 }, {
          opacity: 1, y: 0, duration: 0.2, ease: 'power2.out', clearProps: 'opacity,transform',
        });
      }
      let pressedButton;
      context.add('press', (event) => {
        if (event.button !== 0) return;
        const button = event.target.closest('button');
        if (!button || button.disabled || !surface.contains(button)) return;
        pressedButton = button;
        gsap.to(button, { scale: 0.96, duration: 0.1, ease: 'power2.out', overwrite: 'auto' });
      });
      context.add('release', () => {
        if (!pressedButton) return;
        gsap.to(pressedButton, {
          scale: 1, duration: 0.22, ease: 'back.out(1.4)', overwrite: 'auto', clearProps: 'transform',
        });
        pressedButton = null;
      });
      surface.addEventListener('pointerdown', context.press);
      window.addEventListener('pointerup', context.release);
      window.addEventListener('pointercancel', context.release);
      window.addEventListener('blur', context.release);
      return () => {
        surface.removeEventListener('pointerdown', context.press);
        window.removeEventListener('pointerup', context.release);
        window.removeEventListener('pointercancel', context.release);
        window.removeEventListener('blur', context.release);
      };
    });
    return () => media.revert();
  }, [variant]);

  return (
    <div {...props} ref={surfaceRef} className={`${className} cinema-glass-surface cinema-glass-${variant}`}>
      <div className="cinema-glass-material" aria-hidden="true">
        <LiquidGlass
          key={materialSize}
          {...MATERIALS[variant]}
          className="cinema-glass-lens"
          padding="0"
          mode="standard"
          elasticity={0}
          globalMousePos={STILL_POINTER}
          mouseOffset={STILL_POINTER}
          style={{ position: 'absolute', top: '50%', left: '50%', width: '100%', height: '100%' }}
        >
          {null}
        </LiquidGlass>
      </div>
      {children}
    </div>
  );
}
