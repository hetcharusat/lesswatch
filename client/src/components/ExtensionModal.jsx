import React from 'react';
import { Download, Sparkles, X, ExternalLink, CheckCircle2, ShieldCheck, Video } from 'lucide-react';

export function ExtensionModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="pink-modal-backdrop" onClick={onClose}>
      <div
        className="pink-modal-card"
        style={{ maxWidth: '580px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pink-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: 'rgba(255,42,133,0.15)', padding: '8px', borderRadius: '10px' }}>
              <Sparkles size={20} color="var(--pink-sakura)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Watch HiAnime & Any Site Together</h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                Direct browser sync: 1080p native quality, 0% video lag, 0% CPU strain
              </p>
            </div>
          </div>
          <button onClick={onClose} className="pink-btn-icon">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Why this is professional & better */}
          <div style={{
            background: 'rgba(255, 42, 133, 0.06)',
            border: '1px solid rgba(255, 42, 133, 0.25)',
            borderRadius: '12px',
            padding: '1rem',
            fontSize: '0.84rem',
            lineHeight: 1.5
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--pink-sakura)', marginBottom: '0.4rem' }}>
              <ShieldCheck size={16} />
              <span>How it works (Zero Simulation, Pure Client Sync)</span>
            </div>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Sites like <strong>HiAnime</strong> and Netflix use Cloudflare bot protection and block iframe embeds.
              Our lightweight extension runs right in your browser, syncing playback (play/pause/seek), floating Danmaku bullet comments, and emoji showers across your Watch Together server with <strong style={{ color: '#fff' }}>sub-50ms latency</strong>.
            </p>
          </div>

          {/* Download Button */}
          <div style={{ textAlign: 'center' }}>
            <a
              href="/api/extension/download"
              download="watch-together-extension.zip"
              className="btn-pink-primary"
              style={{
                display: 'inline-flex',
                padding: '0.75rem 1.75rem',
                fontSize: '0.95rem',
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 8px 24px rgba(255, 42, 133, 0.45)'
              }}
            >
              <Download size={18} />
              <span>Download Chrome / Edge Extension (.zip)</span>
            </a>
          </div>

          {/* Quick Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              3-Step 1-Minute Setup:
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <span style={{
                background: 'var(--pink-primary)',
                color: '#fff',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 800,
                flexShrink: 0
              }}>1</span>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Download the zip above and extract it into a folder on your computer.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <span style={{
                background: 'var(--pink-primary)',
                color: '#fff',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 800,
                flexShrink: 0
              }}>2</span>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Open <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', color: 'var(--pink-sakura)' }}>chrome://extensions</code> (or <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', color: 'var(--pink-sakura)' }}>edge://extensions</code>), toggle <strong>Developer mode</strong> ON in top-right, and click <strong>Load unpacked</strong>. Select the unzipped folder.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <span style={{
                background: 'var(--pink-primary)',
                color: '#fff',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 800,
                flexShrink: 0
              }}>3</span>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Both you and your friend open any anime on <strong>HiAnime</strong> (or Netflix/YouTube). The Hot Pink Watch Together bubble will automatically appear on the page, synced to room <strong style={{ color: '#fff' }}>"lounge"</strong>!
              </div>
            </div>
          </div>

          {/* Quick launch link */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '0.75rem',
            borderTop: '1px solid rgba(255,255,255,0.08)'
          }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Ready to watch?</span>
            <a
              href="https://hianime.to"
              target="_blank"
              rel="noreferrer"
              className="btn-pink-secondary"
              style={{ padding: '0.45rem 1rem', fontSize: '0.82rem', textDecoration: 'none' }}
            >
              <span>Open HiAnime.to</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
