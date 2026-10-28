import React from 'react';
import { ClayDownload } from './ClayIcons';
import { Downloader } from './Downloader';

export function DownloadsPage() {
  return (
    <main style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '1rem 1rem 3rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 16px',
            borderRadius: '9999px',
            background: 'linear-gradient(180deg, #fce7f3 0%, #fbcfe8 100%)',
            border: '1.5px solid rgba(236, 72, 153, 0.35)',
            boxShadow: '0 4px 12px rgba(236, 72, 153, 0.15)',
            fontWeight: 800,
            fontSize: '0.88rem',
            color: '#be185d'
          }}
        >
          <ClayDownload size={18} />
          <span>Server Downloads & Torrents</span>
        </div>
      </div>

      {/* Downloader Management Component */}
      <Downloader />
    </main>
  );
}

export default DownloadsPage;
