import React from 'react';
import '../styles/theater-glass.css';

// Static highlights preserve the glass appearance without filtering each video
// frame, allocating SVG render targets, or remounting material on resize.
export function GlassSurface({ variant = 'dock', className = '', children, ...props }) {
  return (
    <div {...props} className={`${className} cinema-glass-surface cinema-glass-${variant}`}>
      {children}
    </div>
  );
}
