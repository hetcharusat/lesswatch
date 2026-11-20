import React, { lazy, Suspense, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, X } from 'lucide-react';

const MediaLibrary = lazy(() => import('./MediaLibrary'));

class LibraryContentBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p className="lounge-library-loading" role="alert">The library could not load. Your lounge is still connected.</p> : this.props.children;
  }
}

export function LoungeLibraryModal({ currentUser, onClose, onPlayMedia }) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('button')?.focus({ preventScroll: true });
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<div className="lounge-library-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="lounge-library-dialog" data-lounge-library role="dialog" aria-modal="true" aria-labelledby="lounge-library-title">
      <header className="lounge-library-header"><FolderOpen size={20} /><div><h2 id="lounge-library-title">Your library</h2><p>Pick the next watch. You’re still in the lounge.</p></div><button type="button" onClick={onClose} aria-label="Close library"><X size={20} /></button></header>
      <div className="lounge-library-content"><LibraryContentBoundary><Suspense fallback={<p className="lounge-library-loading" role="status">Opening your library…</p>}><MediaLibrary currentUser={currentUser} onPlayMedia={onPlayMedia} /></Suspense></LibraryContentBoundary></div>
    </section>
  </div>, document.fullscreenElement || document.webkitFullscreenElement || document.body);
}
