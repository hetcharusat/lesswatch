import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft } from 'lucide-react';

export function PlayerMenu({ title, onBack, onClose, children, footer, portalRoot }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const panel = <section ref={ref} tabIndex={-1} className="player-menu" role="dialog" aria-label={title}
    onClick={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    }}>
    <header className="player-menu-head">
      {onBack && <button type="button" className="player-menu-icon" onClick={onBack} aria-label="Back"><ChevronLeft size={17} /></button>}
      <h3>{title}</h3>
      <button type="button" className="player-menu-icon" onClick={onClose} aria-label={`Close ${title}`}><X size={17} /></button>
    </header>
    <div className="player-menu-body">{children}</div>
    {footer && <footer className="player-menu-footer">{footer}</footer>}
  </section>;
  return portalRoot ? createPortal(panel, portalRoot) : panel;
}

export function PlayerSlider({ label, value, min, max, step = 1, suffix = '', onChange, disabled = false }) {
  return <label className="player-setting-slider"><span>{label}<output>{value}{suffix}</output></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
      disabled={disabled} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}
