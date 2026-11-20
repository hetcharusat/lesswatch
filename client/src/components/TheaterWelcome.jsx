import React from 'react';
import { Film, Globe, FolderOpen, ArrowUpRight, Heart } from 'lucide-react';

export function TheaterWelcome({ onChooseMedia, onLaunchBrowser, onOpenLibrary, browserEnabled = true, connected = true }) {
  return <section className="theater-welcome" aria-label="Your theatre is ready">
    <div className="theater-welcome-art" aria-hidden="true"><Film size={40} strokeWidth={1.25} /><span><Heart size={14} fill="currentColor" /></span></div>
    <h1>Hieeee, fellas<span aria-hidden="true">.</span></h1>
    <p>The best part hasn’t started yet.<br />Pick something to watch, or wander the web together.</p>
    <div className="theater-welcome-actions">
      <button type="button" className="theater-welcome-primary" onClick={onChooseMedia}><Film size={17} />Choose media<ArrowUpRight size={16} /></button>
      {browserEnabled && <button type="button" disabled={!connected} onClick={onLaunchBrowser}><Globe size={17} />Launch browser<ArrowUpRight size={16} /></button>}
    </div>
    <button type="button" className="theater-welcome-library" onClick={onOpenLibrary}><FolderOpen size={15} />Browse your library</button>
    {!connected && <small role="status">Connecting to your room…</small>}
  </section>;
}
