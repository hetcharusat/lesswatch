import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Cpu, HardDrive, ShieldCheck, ShieldAlert, AlertTriangle,
  CheckCircle2, XCircle, RefreshCw, Wifi, Lock, Terminal, Copy, Check, Globe, Power
} from 'lucide-react';

const PROXY_SNIPPETS = {
  nginx: `# Nginx reverse proxy for Watch Together (WebSockets + HTTPS + LiveKit)
server {
    listen 443 ssl http2;
    server_name watch.example.com;

    ssl_certificate     /etc/letsencrypt/live/watch.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/watch.example.com/privkey.pem;
    client_max_body_size 0;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}`,
  caddy: `# Caddyfile (Automatic Let's Encrypt HTTPS + WebSockets built-in)
watch.example.com {
    reverse_proxy watch-together:3000 {
        flush_interval -1
    }
}`,
  traefik: `# Docker Compose labels for Traefik v2/v3
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.watchtogether.rule=Host(\`watch.example.com\`)"
  - "traefik.http.routers.watchtogether.entrypoints=websecure"
  - "traefik.http.routers.watchtogether.tls.certresolver=letsencrypt"
  - "traefik.http.services.watchtogether.loadbalancer.server.port=3000"`,
  cloudflare: `# Cloudflare Tunnel / Proxy Checklist
# 1. Point Public Hostname service to: http://watch-together:3000 (or http://localhost:3000)
# 2. In Cloudflare Dashboard -> Network: Ensure "WebSockets" is toggled ON.
# 3. SSL/TLS Mode: Use "Full" or "Full (strict)" (never Flexible with HTTPS redirect).
# 4. Under Access / Caching: Bypass cache for /api/* and /livekit/* so streams & WS are not buffered.`
};

function StatusBadge({ status }) {
  if (status === 'ok') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: '#d1fae5', border: '1px solid rgba(16,185,129,0.4)', color: '#047857', fontSize: 12, fontWeight: 700 }}>
        <CheckCircle2 size={13} /> Ready
      </span>
    );
  }
  if (status === 'warn') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: '#fef3c7', border: '1px solid rgba(245,158,11,0.4)', color: '#b45309', fontSize: 12, fontWeight: 700 }}>
        <AlertTriangle size={13} /> Warning
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: '#fce7f3', border: '1px solid rgba(244,114,182,0.4)', color: '#be185d', fontSize: 12, fontWeight: 700 }}>
        <RefreshCw size={13} className="spin" /> Testing...
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: '#ffe4e6', border: '1px solid rgba(244,63,94,0.4)', color: '#be123c', fontSize: 12, fontWeight: 700 }}>
      <XCircle size={13} /> Action Needed
    </span>
  );
}

export default function DiagnosticsPanel({
  authToken = null,
  isSetupMode = false,
  nekoEnabled = true,
  onToggleNeko = null,
  onDiagnosticsLoaded = null
}) {
  const [serverDiag, setServerDiag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState('');

  const [browserChecks, setBrowserChecks] = useState({
    secureContext: { status: 'pending', detail: 'Checking browser context...' },
    syncWs: { status: 'pending', detail: 'Probing /api/v1/sync WebSocket...' },
    livekitWs: { status: 'pending', detail: 'Probing /livekit SFU signaling...' }
  });

  const [proxyTab, setProxyTab] = useState('nginx');
  const [showProxyHelp, setShowProxyHelp] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const checksRunningRef = useRef(false);

  const onDiagnosticsLoadedRef = useRef(onDiagnosticsLoaded);
  useEffect(() => {
    onDiagnosticsLoadedRef.current = onDiagnosticsLoaded;
  }, [onDiagnosticsLoaded]);

  const probeWebSocket = useCallback((url, timeoutMs = 4500) => {
    return new Promise((resolve) => {
      let settled = false;
      const start = performance.now();
      let ws;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { ws?.close(); } catch { }
          resolve({ ok: false, error: 'WebSocket connection timed out (proxy may be blocking Upgrade headers).' });
        }
      }, timeoutMs);

      try {
        ws = new WebSocket(url);
        ws.onopen = () => {
          const latency = Math.round(performance.now() - start);
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch { }
            resolve({ ok: true, latency });
          }
        };
        ws.onerror = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({ ok: false, error: 'WebSocket handshake rejected or blocked by reverse proxy.' });
          }
        };
      } catch (err) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, error: err.message });
      }
    });
  }, []);

  const runAllChecks = useCallback(async () => {
    if (checksRunningRef.current) return;
    checksRunningRef.current = true;
    setLoading(true);
    setServerError('');

    const headers = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    // 1. Server hardware, storage, binary, Docker & LiveKit check
    let diagData = null;
    try {
      const res = await fetch('/api/system/diagnostics', { headers, signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      diagData = data;
      setServerDiag(data);
      if (onDiagnosticsLoadedRef.current) onDiagnosticsLoadedRef.current(data);
    } catch (err) {
      setServerError(err.message || 'Failed to fetch server diagnostics');
    }

    // 2. Real browser HTTPS / Secure Context & getUserMedia availability
    const isSecure = !!window.isSecureContext;
    const hasMedia = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
    const secureStatus = isSecure && hasMedia
      ? { status: 'ok', detail: `HTTPS / Secure Context active (${window.location.origin}). Microphone & camera APIs enabled.` }
      : {
          status: 'error',
          detail: !isSecure
            ? `Running on insecure HTTP (${window.location.origin}). Browsers block microphone/camera permissions unless served over HTTPS or localhost.`
            : 'navigator.mediaDevices.getUserMedia is unavailable in this browser.'
        };

    // 3. Real Sync Engine WebSocket handshake test (/api/v1/sync)
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const syncUrl = `${wsProto}://${window.location.host}/api/v1/sync/?EIO=4&transport=websocket`;
    const syncProbe = await probeWebSocket(syncUrl);
    const syncStatus = syncProbe.ok
      ? { status: 'ok', detail: `Socket.IO WebSocket upgrade succeeded in ${syncProbe.latency} ms.` }
      : { status: 'error', detail: `${syncProbe.error} Ensure your proxy passes Upgrade & Connection headers for /api/v1/sync (and /socket.io/).` };

    // 4. Real LiveKit WebSocket signaling test (/livekit)
    let lkStatus = { status: 'warn', detail: 'Skipped (LiveKit credentials missing on server).' };
    if (diagData?.livekit?.moduleEnabled === false) {
      lkStatus = { status: 'warn', detail: 'Skipped (LiveKit Voice SFU module is disabled in settings).' };
    } else if (diagData?.livekit?.configured && diagData?.livekit?.reachable) {
      try {
        const tokRes = await fetch('/api/system/diagnostics/livekit-token', { headers, signal: AbortSignal.timeout(10000) });
        const tokData = await tokRes.json();
        if (!tokRes.ok || !tokData.token) {
          lkStatus = { status: 'error', detail: tokData.error || 'Could not obtain LiveKit test token.' };
        } else {
          const baseWs = (tokData.url || `${wsProto}://${window.location.host}/livekit`).replace(/\/+$/, '');
          const probeUrl = `${baseWs}/rtc?access_token=${encodeURIComponent(tokData.token)}&protocol=15`;
          const lkWsProbe = await probeWebSocket(probeUrl, 5000);
          lkStatus = lkWsProbe.ok
            ? { status: 'ok', detail: `LiveKit signaling WebSocket connected (${baseWs}) in ${lkWsProbe.latency} ms.` }
            : { status: 'error', detail: `Server reached LiveKit internally, but browser WebSocket to ${baseWs} failed: ${lkWsProbe.error}` };
        }
      } catch (err) {
        lkStatus = { status: 'error', detail: `LiveKit probe failed: ${err.message}` };
      }
    } else if (diagData && !diagData.livekit?.reachable) {
      lkStatus = {
        status: 'error',
        detail: `LiveKit SFU unreachable from app container (${diagData.livekit?.error || 'check livekit service'}).`
      };
    }

    setBrowserChecks({
      secureContext: secureStatus,
      syncWs: syncStatus,
      livekitWs: lkStatus
    });

    if (secureStatus.status !== 'ok' || syncStatus.status !== 'ok' || lkStatus.status === 'error') {
      setShowProxyHelp(true);
    }
    checksRunningRef.current = false;
    setLoading(false);
  }, [authToken, probeWebSocket]);

  useEffect(() => {
    runAllChecks();
  }, [runAllChecks]);

  const copySnippet = () => {
    navigator.clipboard?.writeText(PROXY_SNIPPETS[proxyTab]);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 1800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="diag-clay-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={20} color="#ec4899" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-main)' }}>System, Module &amp; Network Diagnostics</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Live host hardware, Docker permissions, binaries, and real browser WebSocket/HTTPS checks
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={runAllChecks}
          disabled={loading}
          className="btn-pink-secondary"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Re-run Diagnostics
        </button>
      </div>

      {serverError && (
        <div className="diag-clay-card" style={{
          borderColor: 'rgba(244,63,94,0.45)',
          background: 'linear-gradient(160deg, #fff1f2, #ffe4e6)',
          color: '#be123c',
          fontSize: 13,
          fontWeight: 600
        }}>
          Could not load server diagnostics: {serverError}
        </div>
      )}

      {/* Neko Readiness Banner / One-click Disable */}
      {serverDiag && !serverDiag.neko?.capable && nekoEnabled && (
        <div className="diag-clay-card" style={{
          borderColor: 'rgba(245,158,11,0.5)',
          background: 'linear-gradient(155deg, #fffbeb 0%, #fef3c7 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b45309', fontWeight: 800, fontSize: 14 }}>
              <AlertTriangle size={18} />
              Shared Browser (Neko) cannot run on this host
            </div>
            {onToggleNeko && (
              <button
                type="button"
                onClick={() => onToggleNeko(false)}
                className="btn-pink-primary"
                style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              >
                <Power size={14} /> Disable Neko &amp; Continue With Other Features
              </button>
            )}
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: '#78350f', lineHeight: 1.55, fontWeight: 500 }}>
            {(serverDiag.neko?.errors || []).map((err, i) => <li key={i}>{err}</li>)}
          </ul>
          <div style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>
            Synced Media Library, YouTube, Direct Links, Anime/Stream Links, Downloads, Media Studio, and Voice Chat do not need Neko and will continue working normally.
          </div>
        </div>
      )}

      {/* Downloader / aria2c Readiness Banner */}
      {serverDiag && !serverDiag.binaries?.aria2c?.installed && (
        <div className="diag-clay-card" style={{
          borderColor: 'rgba(245,158,11,0.45)',
          background: 'linear-gradient(155deg, #fffbeb 0%, #fef3c7 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b45309', fontWeight: 800, fontSize: 13.5 }}>
              <AlertTriangle size={18} />
              aria2c binary not detected on this server
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(245,158,11,0.2)', color: '#92400e' }}>
              Optional • Fallback Active
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: '#78350f', lineHeight: 1.5 }}>
            Without the <code>aria2c</code> daemon, torrent downloads fall back to HTTP/WebTorrent. Synced video, YouTube, anime, and voice chat are unaffected.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingTop: 2 }}>
            <span style={{ fontSize: 11.5, color: '#92400e', fontWeight: 700 }}>Quick Fixes:</span>
            <code style={{ background: 'rgba(0,0,0,0.06)', padding: '4px 9px', borderRadius: 6, fontSize: 12, color: '#831843', fontWeight: 700 }}>
              winget install aria2.aria2
            </code>
            <span style={{ fontSize: 11.5, color: '#92400e' }}>or run full container stack:</span>
            <code style={{ background: 'rgba(0,0,0,0.06)', padding: '4px 9px', borderRadius: 6, fontSize: 12, color: '#831843', fontWeight: 700 }}>
              docker compose up -d --build
            </code>
          </div>
        </div>
      )}

      {serverDiag && !nekoEnabled && (
        <div className="diag-clay-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: 'var(--text-main)', fontWeight: 500 }}>
            <strong>Shared Browser (Neko)</strong> is disabled. All Watch Together core players, downloads, Media Studio, and LiveKit voice remain active.
          </div>
          {onToggleNeko && serverDiag.neko?.capable && (
            <button
              type="button"
              onClick={() => onToggleNeko(true)}
              className="admin-pill-mint"
            >
              Re-enable Neko
            </button>
          )}
        </div>
      )}

      {/* Server Hardware, Storage, Binaries */}
      {serverDiag && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
          <div className="diag-clay-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 800, color: '#be185d', fontSize: 13.5 }}>
              <Cpu size={16} /> Host CPU &amp; Memory
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div><strong>CPU:</strong> {serverDiag.cpu.cores} cores ({serverDiag.cpu.arch}, {serverDiag.cpu.platform})</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{serverDiag.cpu.model}</div>
              <div><strong>RAM:</strong> {serverDiag.memory.free} free / {serverDiag.memory.total} total</div>
              {serverDiag.memory.cgroupLimitBytes && (
                <div style={{ fontSize: 11.5, color: '#b45309', fontWeight: 700 }}>Docker container cgroup memory cap active</div>
              )}
            </div>
          </div>

          <div className="diag-clay-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 800, color: '#be185d', fontSize: 13.5 }}>
              <HardDrive size={16} /> Storage &amp; Write Permissions
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <strong>Data Dir:</strong> {serverDiag.storage.dataDir.free} free / {serverDiag.storage.dataDir.total}{' '}
                <span style={{ color: serverDiag.storage.dataDir.writable ? '#047857' : '#be123c', fontWeight: 700 }}>
                  ({serverDiag.storage.dataDir.writable ? 'Writable' : `Read-only: ${serverDiag.storage.dataDir.error}`})
                </span>
              </div>
              <div>
                <strong>Downloads Dir:</strong> {serverDiag.storage.downloadsDir.free} free / {serverDiag.storage.downloadsDir.total}{' '}
                <span style={{ color: serverDiag.storage.downloadsDir.writable ? '#047857' : '#be123c', fontWeight: 700 }}>
                  ({serverDiag.storage.downloadsDir.writable ? 'Writable' : `Error: ${serverDiag.storage.downloadsDir.error}`})
                </span>
              </div>
            </div>
          </div>

          <div className="diag-clay-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 800, color: '#be185d', fontSize: 13.5 }}>
              <Terminal size={16} /> Bundled Media Binaries
            </div>
            <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {Object.entries(serverDiag.binaries).map(([name, info]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{name}</span>
                  <span style={{ color: info.installed ? '#047857' : '#be123c', fontWeight: 600, fontSize: 11.5, textAlign: 'right', maxWidth: '68%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={info.version || info.error}>
                    {info.installed ? info.version : info.error}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Module Readiness Verdicts */}
      {serverDiag?.verdicts && (
        <div className="diag-clay-card">
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-main)', marginBottom: 10 }}>Feature Module Readiness</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
            {[
              { key: 'neko', label: 'Shared Browser (Neko)' },
              { key: 'transcoding', label: 'Media Studio Transcoding' },
              { key: 'downloader', label: 'Torrent & URL Downloader' },
              { key: 'livekit', label: 'LiveKit Voice/Video SFU' }
            ].map(({ key, label }) => {
              const v = serverDiag.verdicts[key];
              return (
                <div key={key} className="admin-subpanel">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text-main)' }}>{label}</span>
                    <StatusBadge status={v?.status || 'error'} />
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{v?.summary}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Real Browser Network & Secure Context Checks */}
      <div className="diag-clay-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: 'var(--text-main)' }}>
            <Globe size={16} color="#ec4899" /> Browser Network, WebSocket &amp; HTTPS Checks
          </div>
          <button
            type="button"
            onClick={() => setShowProxyHelp(s => !s)}
            className="btn-pink-chip"
          >
            {showProxyHelp ? 'Hide Reverse Proxy Templates' : 'Show Reverse Proxy Templates'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { icon: Lock, title: 'HTTPS & Microphone Permission Context', check: browserChecks.secureContext },
            { icon: Wifi, title: 'Real-Time Sync WebSocket (/api/v1/sync)', check: browserChecks.syncWs },
            { icon: ShieldCheck, title: 'Voice/Video SFU Signaling (/livekit)', check: browserChecks.livekitWs }
          ].map(({ icon: Icon, title, check }, idx) => (
            <div key={idx} className="admin-subpanel" style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              background: check.status === 'error' ? 'rgba(255,228,230,0.65)' : 'rgba(255,255,255,0.75)',
              borderColor: check.status === 'error' ? 'rgba(244,63,94,0.38)' : 'rgba(244,114,182,0.24)'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 220 }}>
                <Icon size={16} style={{ marginTop: 2, color: check.status === 'ok' ? '#047857' : '#ec4899', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-main)' }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.45 }}>{check.detail}</div>
                </div>
              </div>
              <StatusBadge status={check.status} />
            </div>
          ))}
        </div>

        {showProxyHelp && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1.5px dashed rgba(244,114,182,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#be185d' }}>
                Reverse Proxy &amp; WebSocket Setup Examples
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.keys(PROXY_SNIPPETS).map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setProxyTab(key)}
                    className={`btn-pink-chip ${proxyTab === key ? 'active' : ''}`}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {key}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={copySnippet}
                  className="admin-pill-mint"
                >
                  {copiedSnippet ? <Check size={12} /> : <Copy size={12} />} {copiedSnippet ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <pre className="diag-pre-box">
              {PROXY_SNIPPETS[proxyTab]}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

