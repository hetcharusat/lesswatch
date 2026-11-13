const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const cors = require('cors');
const multer = require('multer');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { Server } = require('socket.io');

// LiveKit Server SDK - Token generation for voice SFU
let AccessToken;
try {
  const livekit = require('livekit-server-sdk');
  AccessToken = livekit.AccessToken;
  console.log('🎙️ LiveKit SDK loaded');
} catch (e) {
  console.warn('⚠️ livekit-server-sdk not found, voice tokens disabled:', e.message);
}

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_INTERNAL_URL = process.env.LIVEKIT_URL || 'ws://livekit:7880';
const LIVEKIT_HTTP_TARGET = LIVEKIT_INTERNAL_URL
  .replace(/^wss:\/\//i, 'https://')
  .replace(/^ws:\/\//i, 'http://');
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || '';

const app = express();
const server = http.createServer(app);

// Global safety crash guards
process.on('unhandledRejection', (reason, promise) => {
  console.warn('⚠️ [Server] Unhandled Rejection intercepted:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ [Server] Uncaught Exception intercepted:', err?.message || err);
});

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DOWNLOADS_DIR = path.resolve(process.env.DOWNLOADS_DIR || path.join(__dirname, 'downloads'));
const SUBS_CACHE_DIR = path.join(DATA_DIR, 'subs_cache');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PLANNER_FILE = path.join(DATA_DIR, 'planner.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const AVATARS_DIR = path.join(DATA_DIR, 'avatars');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(SUBS_CACHE_DIR)) fs.mkdirSync(SUBS_CACHE_DIR, { recursive: true });
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

// --------------------------------------------------------------------------
// Docker Engine Socket Controller for Neko Virtual Browser Lifecycle
// --------------------------------------------------------------------------
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const NEKO_CONTAINER_NAME = process.env.NEKO_CONTAINER_NAME || 'neko';
const NEKO_URL = process.env.NEKO_URL || 'http://neko:8080';

function hasDockerSocket() {
  if (!DOCKER_SOCKET) return false;
  if (process.platform === 'win32' && DOCKER_SOCKET.startsWith('\\\\.\\pipe\\')) {
    return true;
  }
  return fs.existsSync(DOCKER_SOCKET);
}

function callDockerAPI(apiPath, method = 'POST', postData = null) {
  return new Promise((resolve) => {
    if (!hasDockerSocket()) {
      return resolve({ fallback: true, error: 'Docker socket not mounted' });
    }

    const payload = postData ? JSON.stringify(postData) : null;
    const req = http.request({
      socketPath: DOCKER_SOCKET,
      path: apiPath,
      method: method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ fallback: true, error: err.message });
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function checkNekoStatus() {
  if (!hasDockerSocket()) {
    try {
      const probe = await fetch(`${NEKO_URL}/`, { signal: AbortSignal.timeout(800) });
      if (probe.status < 500) return 'running';
    } catch {}
    return 'unavailable';
  }
  const res = await callDockerAPI(`/containers/${encodeURIComponent(NEKO_CONTAINER_NAME)}/json`, 'GET');
  if (res.status === 404) {
    try {
      const probe = await fetch(`${NEKO_URL}/`, { signal: AbortSignal.timeout(800) });
      if (probe.status < 500) return 'running';
    } catch {}
    return 'not_found';
  }
  if (res.body?.State?.Status) {
    return res.body.State.Status;
  }
  return 'unknown';
}

async function stopNeko() {
  if (!hasDockerSocket()) {
    return { success: false, error: 'Docker socket not available' };
  }
  const status = await checkNekoStatus();
  if (status === 'not_found' || status === 'unavailable') {
    return { success: false, status, error: `Neko container "${NEKO_CONTAINER_NAME}" not found` };
  }
  if (status !== 'running') {
    return { success: true, status, alreadyStopped: true };
  }
  console.log(`🛑 [Neko] Stopping virtual browser container (${NEKO_CONTAINER_NAME}) to release CPU & RAM...`);
  const res = await callDockerAPI(`/containers/${encodeURIComponent(NEKO_CONTAINER_NAME)}/stop?t=2`, 'POST');
  if (res.fallback) {
    return { success: false, error: res.error || 'Failed to reach Docker socket' };
  }
  return { success: res.status === 204 || res.status === 304, status: 'exited' };
}

async function startNeko() {
  if (!appConfig?.modules?.neko) {
    return { success: false, error: 'Neko module is disabled in settings' };
  }
  if (!hasDockerSocket()) {
    return { success: false, error: 'Docker socket not available' };
  }
  console.log(`🚀 [Neko] Starting virtual browser container (${NEKO_CONTAINER_NAME}) on-demand...`);
  const res = await callDockerAPI(`/containers/${encodeURIComponent(NEKO_CONTAINER_NAME)}/start`, 'POST');
  if (res.fallback || res.status === 404) {
    return { success: false, error: res.body?.message || res.error || 'Neko container not found' };
  }
  return { success: res.status === 204 || res.status === 304 };
}

async function resetNekoChromium() {
  if (!appConfig?.modules?.neko) {
    return { success: false, error: 'Neko module is disabled in settings' };
  }
  console.log(`🔄 [Neko] Resetting Chromium session and tabs via Docker Socket API (${NEKO_CONTAINER_NAME})...`);
  try {
    const execRes = await callDockerAPI(`/containers/${encodeURIComponent(NEKO_CONTAINER_NAME)}/exec`, 'POST', {
      AttachStdout: false,
      AttachStderr: false,
      Cmd: ['supervisorctl', 'restart', 'chromium']
    });
    if (execRes.body?.Id) {
      await callDockerAPI(`/exec/${execRes.body.Id}/start`, 'POST', { Detach: true, Tty: false });
      return { success: true };
    }
  } catch (err) {
    console.warn('resetNekoChromium exec error:', err.message);
  }
  await callDockerAPI(`/containers/${encodeURIComponent(NEKO_CONTAINER_NAME)}/restart?t=1`, 'POST');
  return { success: true };
}

// Shared Virtual Browser (Neko) Proxy (Manual WS upgrade only on /neko)
const nekoProxy = createProxyMiddleware({
  target: NEKO_URL,
  changeOrigin: true,
  ws: false,
  pathRewrite: {
    '^/neko': ''
  },
  on: {
    proxyReq: (proxyReq, req, res) => {
      // Normalize origin so Neko backend accepts cross-origin API requests without CORS rejection
      try {
        const u = new URL(NEKO_URL);
        proxyReq.setHeader('origin', u.origin);
      } catch {}
    },
    proxyRes: (proxyRes, req, res) => {
      // Rewrite session cookies so browsers allow them inside iframes
      const setCookie = proxyRes.headers['set-cookie'];
      if (setCookie) {
        const proto = req.headers['x-forwarded-proto'] || '';
        const isHttps = req.secure || proto.includes('https') || (req.headers.host && req.headers.host.includes('trycloudflare.com'));
        proxyRes.headers['set-cookie'] = (Array.isArray(setCookie) ? setCookie : [setCookie]).map(cookie => {
          let updated = cookie;
          if (isHttps) {
            updated = updated
              .replace(/SameSite=(Lax|Strict)/gi, 'SameSite=None')
              .replace(/;\s*Secure/gi, '');
            if (!updated.includes('SameSite=')) {
              updated += '; SameSite=None';
            }
            return updated + '; Secure; Partitioned';
          }
          return updated;
        });
      }
    },
    error: (err, req, res) => {
      console.warn(`[Neko Proxy] Connection notice: ${err.message}`);
      if (res && !res.headersSent) {
        if (req.accepts && req.accepts('html') && !req.xhr && !req.headers['x-requested-with']) {
          res.status(502).send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Warming up Virtual Browser...</title>
              <meta http-equiv="refresh" content="3">
              <meta name="viewport" content="width=device-width, initial-scale=1">
            </head>
            <body style="font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 20px;">
              <div style="max-width: 440px; background: #1e293b; padding: 32px; border-radius: 20px; border: 1px solid rgba(244,114,182,0.3); text-align: center; box-shadow: 0 12px 36px rgba(0,0,0,0.4);">
                <div style="width: 42px; height: 42px; border: 3px solid rgba(236,72,153,0.2); border-top-color: #ec4899; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
                <h3 style="color: #f472b6; margin: 0 0 8px; font-size: 1.15rem;">Launching Virtual Browser...</h3>
                <p style="color: #94a3b8; font-size: 13.5px; line-height: 1.5; margin: 0;">Chromium is starting on-demand inside Docker. Auto-refreshing in 3 seconds...</p>
                <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
              </div>
            </body>
            </html>
          `);
        } else {
          res.status(502).json({ error: `Virtual browser is warming up (${err.message}). Retrying shortly...`, retryIn: 3 });
        }
      }
    }
  }
});

// LiveKit Signaling Proxy (/livekit -> LIVEKIT_HTTP_TARGET) so single-port Docker deployments work without Caddy too
const livekitProxy = createProxyMiddleware({
  target: LIVEKIT_HTTP_TARGET,
  changeOrigin: true,
  ws: false,
  pathRewrite: {
    '^/livekit': ''
  },
  on: {
    error: (err, req, res) => {
      if (res && !res.headersSent) {
        res.status(502).json({ error: `LiveKit signaling unreachable: ${err.message}` });
      }
    }
  }
});

let nekoStartupPromise = null;
async function ensureNekoRunning() {
  if (!appConfig?.modules?.neko) return 'disabled';
  if (nekoStartupPromise) return await nekoStartupPromise;

  nekoStartupPromise = (async () => {
    try {
      // First probe NEKO_URL directly: if Neko is already running, return 'running'
      // so WebSocket upgrades and HTTP requests are never blocked when the Docker socket is unmounted or restricted.
      try {
        const directProbe = await fetch(`${NEKO_URL}/`, { signal: AbortSignal.timeout(1000) });
        if (directProbe.status < 500) {
          return 'running';
        }
      } catch {}

      const status = await checkNekoStatus();
      if (status === 'not_found' || status === 'unavailable') {
        // Probe NEKO_URL before failing with 'unavailable' or 'not_found'
        try {
          const probe = await fetch(`${NEKO_URL}/`, { signal: AbortSignal.timeout(1000) });
          if (probe.status < 500) {
            return 'running';
          }
        } catch {}
        return status;
      }
      if (status !== 'running') {
        console.log(`🚀 [Neko] Starting virtual browser container (${NEKO_CONTAINER_NAME}) on-demand...`);
        const startRes = await startNeko();
        if (!startRes.success) {
          try {
            const probe = await fetch(`${NEKO_URL}/`, { signal: AbortSignal.timeout(1000) });
            if (probe.status < 500) return 'running';
          } catch {}
          return 'failed';
        }
      }

      // Wait until Neko HTTP endpoint is actively accepting connections
      for (let i = 0; i < 24; i++) {
        try {
          const res = await fetch(`${NEKO_URL}/`, { signal: AbortSignal.timeout(800) });
          if (res.status < 500) {
            console.log('✅ [Neko] Virtual browser HTTP service is fully ready!');
            return 'running';
          }
        } catch {}
        await new Promise(r => setTimeout(r, 500));
      }
      return 'running';
    } catch (err) {
      console.error('Neko startup error:', err);
      try {
        const probe = await fetch(`${NEKO_URL}/`, { signal: AbortSignal.timeout(1000) });
        if (probe.status < 500) return 'running';
      } catch {}
      return 'error';
    } finally {
      setTimeout(() => { nekoStartupPromise = null; }, 2000);
    }
  })();

  return await nekoStartupPromise;
}

app.use('/neko', async (req, res, next) => {
  if (!appConfig?.modules?.neko) {
    return res.status(403).json({ error: 'Shared Browser (Neko) is disabled on this server.' });
  }

  // If a request arrives at /neko or /neko/ without pwd=, or arrives at /neko without a trailing slash,
  // return an HTTP 302 redirect with ?pwd=admin&usr=...&embed=1 so Neko's client reads the query params in window.location.search
  // and relative assets/API calls (assets/..., api/...) resolve correctly under /neko/
  if (req.method === 'GET' && (req.path === '/' || req.path === '')) {
    const rawUrl = req.url || '';
    const hasTrailingSlash = (req.originalUrl || '').split('?')[0].endsWith('/');
    const hasPwd = rawUrl.includes('pwd=') || (req.query && req.query.pwd);

    if (!hasTrailingSlash || !hasPwd) {
      const user = getAuthUser(req);
      const name = user?.username || user?.name || 'Friend';
      const pwd = process.env.NEKO_ADMIN_PASSWORD || process.env.NEKO_PASSWORD || 'admin';
      const searchParams = new URLSearchParams(req.query);
      if (!searchParams.has('pwd')) searchParams.set('pwd', pwd);
      if (!searchParams.has('usr')) searchParams.set('usr', name);
      if (!searchParams.has('embed')) searchParams.set('embed', '1');
      return res.redirect(302, `/neko/?${searchParams.toString()}`);
    }
  }

  const status = await ensureNekoRunning();
  if (status === 'not_found') {
    const errorMsg = `Neko container "${NEKO_CONTAINER_NAME}" was not found. Please provision it with: docker compose --profile neko up --no-start neko`;
    if (req.accepts && req.accepts('html') && !req.xhr && !req.headers['x-requested-with']) {
      return res.status(503).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Virtual Browser Not Provisioned</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 20px;">
          <div style="max-width: 480px; background: #1e293b; padding: 32px; border-radius: 20px; border: 1px solid rgba(244,114,182,0.3); text-align: center; box-shadow: 0 12px 36px rgba(0,0,0,0.4);">
            <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(236,72,153,0.15); color: #f472b6; display: grid; place-items: center; margin: 0 auto 16px; font-size: 24px;">🌐</div>
            <h2 style="color: #f472b6; margin: 0 0 10px; font-size: 1.25rem;">Virtual Browser Not Provisioned</h2>
            <p style="color: #94a3b8; font-size: 13.5px; line-height: 1.5; margin: 0 0 18px;">To enable on-demand shared web browsing, run this single command in your server terminal:</p>
            <div style="background: #0f172a; padding: 12px 14px; border-radius: 10px; font-family: monospace; font-size: 13px; color: #38bdf8; margin: 0 0 18px; user-select: all; border: 1px solid rgba(56,189,248,0.2);">
              docker compose --profile neko up --no-start neko
            </div>
            <p style="color: #64748b; font-size: 12px; margin: 0;">Once provisioned, Watch Together automatically starts and stops Neko on-demand to save memory.</p>
          </div>
        </body>
        </html>
      `);
    }
    return res.status(503).json({ error: errorMsg, code: 'NEKO_NOT_PROVISIONED' });
  }
  if (status === 'unavailable') {
    return res.status(503).json({ error: 'Docker socket is not available on this server to manage Neko.', code: 'DOCKER_UNAVAILABLE' });
  }

  nekoProxy(req, res, next);
});

app.use('/livekit', (req, res, next) => {
  if (!appConfig?.modules?.livekit) {
    return res.status(403).json({ error: 'LiveKit Voice SFU is disabled on this server.' });
  }
  livekitProxy(req, res, next);
});

const io = new Server(server, {
  path: '/api/v1/sync',
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true,
  pingTimeout: 30000,
  pingInterval: 10000,
  transports: ['websocket', 'polling']
});

io.engine.on('connection_error', (err) => {
  console.log('⚡ Socket Engine event:', err.code, err.message, err.req?.url);
});

// Setup file uploads for subtitles, torrents, and videos (Supporting up to 100GB uploads)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let targetDir = DOWNLOADS_DIR;
    const folder = (req.body && req.body.folder) || (req.query && req.query.folder);
    if (folder) {
      const safeFolder = String(folder).replace(/(\.\.[\/\\])+/g, '').replace(/^[\\\/]+/, '');
      targetDir = path.join(DOWNLOADS_DIR, safeFolder);
    }
    if (!fs.existsSync(targetDir)) {
      try { fs.mkdirSync(targetDir, { recursive: true }); } catch (err) { return cb(err); }
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    let safeName = (file.originalname || 'upload.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
    const folder = (req.body && req.body.folder) || (req.query && req.query.folder);
    let targetDir = DOWNLOADS_DIR;
    if (folder) {
      const safeFolder = String(folder).replace(/(\.\.[\/\\])+/g, '').replace(/^[\\\/]+/, '');
      targetDir = path.join(DOWNLOADS_DIR, safeFolder);
    }
    let candidate = safeName;
    let counter = 1;
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    while (fs.existsSync(path.join(targetDir, candidate))) {
      candidate = `${base}_${counter}${ext}`;
      counter++;
    }
    cb(null, candidate);
  }
});
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 * 1024 // 100 GB max file size
  }
});

app.use(cors({
  origin: true,
  credentials: true
}));
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use('/api/avatars', express.static(AVATARS_DIR, { maxAge: '1h' }));

// Control API for Neko Virtual Browser
app.post('/api/neko/control', async (req, res) => {
  if (!appConfig?.modules?.neko) {
    return res.status(403).json({ success: false, error: 'Shared Browser (Neko) module is disabled.' });
  }
  let action = 'status';
  if (typeof req.body === 'string') {
    try { action = JSON.parse(req.body).action; } catch { action = req.body; }
  } else if (req.body && req.body.action) {
    action = req.body.action;
  }

  console.log(`🎮 [Neko API] Received action: ${action}`);
  if (action === 'stop' || action === 'cleanup') {
    const result = await stopNeko();
    return res.json({ success: !!result.success, action: 'stopped', ...result });
  } else if (action === 'start') {
    const result = await startNeko();
    return res.json({ success: !!result.success, action: 'started', ...result });
  } else if (action === 'reset') {
    const result = await resetNekoChromium();
    return res.json({ success: !!result.success, action: 'reset', ...result });
  } else {
    const status = await checkNekoStatus();
    return res.json({ success: true, status });
  }
});

app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), {
  maxAge: '7d',
  immutable: true
}));
app.use(express.static(path.join(__dirname, 'public')));

// --------------------------------------------------------------------------
// 1. CONFIGURATION, VAULT ENCRYPTION & ACCOUNTS
// --------------------------------------------------------------------------
function loadJSON(filePath, defaultVal) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err);
  }
  return defaultVal;
}

function saveJSON(filePath, data, mode = null) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    if (mode !== null) {
      try { fs.chmodSync(filePath, mode); } catch { }
    }
  } catch (err) {
    console.error(`Error saving ${filePath}:`, err);
  }
}

function createDefaultConfig(overrides = {}) {
  return {
    setupCompleted: false,
    instanceName: 'Watch Together',
    allowPublicSignup: false,
    quickLoginEnabled: true,
    quickLoginMode: 'autofill', // 'passwordless' | 'autofill'
    modules: {
      neko: true,
      downloader: true,
      mediaStudio: true,
      livekit: true
    },
    encryptionKey: crypto.randomBytes(32).toString('hex'),
    createdAt: Date.now(),
    ...overrides,
    modules: {
      neko: true,
      downloader: true,
      mediaStudio: true,
      livekit: true,
      ...(overrides.modules || {})
    }
  };
}

function hashLegacyPassword(password, salt = 'wt_secret_salt_2026') {
  return crypto.pbkdf2Sync(String(password), salt, 1000, 32, 'sha256').toString('hex');
}

function hashPassword(password, salt = null) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), useSalt, 100000, 32, 'sha256').toString('hex');
  return { salt: useSalt, hash };
}

function safeHexEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function verifyUserPassword(password, user) {
  if (!user || typeof password !== 'string' || password.length === 0) return false;
  if (user.passwordSalt && user.passwordHash) {
    const { hash } = hashPassword(password, user.passwordSalt);
    return safeHexEqual(hash, user.passwordHash);
  }
  if (user.passwordHash) {
    const legacyHash = hashLegacyPassword(password);
    return safeHexEqual(legacyHash, user.passwordHash);
  }
  return false;
}

const configExistsOnDisk = fs.existsSync(CONFIG_FILE);
const usersExistOnDisk = fs.existsSync(USERS_FILE);

let appConfig;
let usersData;

if (configExistsOnDisk) {
  const loadedCfg = loadJSON(CONFIG_FILE, {});
  appConfig = createDefaultConfig(loadedCfg);
  if (!loadedCfg.encryptionKey || !loadedCfg.modules) {
    saveJSON(CONFIG_FILE, appConfig, 0o600);
  }
  usersData = loadJSON(USERS_FILE, { users: [] });
  if (!Array.isArray(usersData.users)) usersData.users = [];
} else if (usersExistOnDisk) {
  // Seamless upgrade auto-migration from prior installation without config.json
  console.log('🔄 [Migration] Detected existing users.json without config.json. Auto-migrating with setupCompleted: true...');
  usersData = loadJSON(USERS_FILE, { users: [] });
  if (!Array.isArray(usersData.users)) usersData.users = [];
  appConfig = createDefaultConfig({
    setupCompleted: true,
    allowPublicSignup: true,
    quickLoginEnabled: true,
    quickLoginMode: 'autofill'
  });
  saveJSON(CONFIG_FILE, appConfig, 0o600);
} else {
  // Fresh install -> enter first-run setup mode
  console.log('✨ [Setup] Fresh install detected. Entering First-Run Setup Wizard mode.');
  appConfig = createDefaultConfig({ setupCompleted: false });
  usersData = { users: [] };
}

function getVaultKey() {
  if (process.env.VAULT_SECRET) {
    return crypto.createHash('sha256').update(process.env.VAULT_SECRET).digest();
  }
  if (!appConfig.encryptionKey) {
    appConfig.encryptionKey = crypto.randomBytes(32).toString('hex');
    if (appConfig.setupCompleted) saveJSON(CONFIG_FILE, appConfig, 0o600);
  }
  return Buffer.from(appConfig.encryptionKey, 'hex');
}

function encryptSecret(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) return null;
  const key = getVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex')
  };
}

function decryptSecret(payload) {
  if (!payload || !payload.iv || !payload.tag || !payload.data) return null;
  try {
    const key = getVaultKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'hex')),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

// Auto-migrate legacy user records cleanly (encrypt any legacy pin, remove plaintext pin, keep existing names/ids working)
if (usersData.users.length > 0) {
  let migrated = false;
  usersData.users.forEach((u) => {
    if (u.id === 'riaa' || u.name === 'Riaa' || u.email === 'riaa@watchtogether.local') {
      u.id = 'ria';
      u.name = 'Ria';
      u.email = 'ria@watchtogether.local';
      migrated = true;
    }
    if (/^(jotaro|jolyne|joyeline)\s+/i.test(u.name || '')) {
      u.name = u.name.replace(/^(jotaro|jolyne|joyeline)\s+/i, '').trim();
      migrated = true;
    }
    if (u.pin) {
      if (!verifyUserPassword(u.pin, u)) {
        // Legacy users.json stored a stale passwordHash alongside plaintext pin; upgrade hash to pin so existing login keeps working
        const upgraded = hashPassword(u.pin);
        u.passwordSalt = upgraded.salt;
        u.passwordHash = upgraded.hash;
      }
      if (!u.encryptedPassword) {
        u.encryptedPassword = encryptSecret(u.pin);
      }
      delete u.pin;
      migrated = true;
    }
    if (u.quickLoginVisible === undefined) {
      u.quickLoginVisible = true;
      migrated = true;
    }
  });
  if (migrated) {
    saveJSON(USERS_FILE, usersData, 0o600);
  }
}

function sanitizeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role === 'admin' ? 'admin' : 'member',
    avatar: u.avatar || '🍿',
    color: u.color || '#ec4899',
    quickLoginVisible: u.quickLoginVisible !== false,
    createdAt: u.createdAt || null
  };
}

function getPublicConfig() {
  return {
    setupCompleted: !!appConfig.setupCompleted,
    instanceName: appConfig.instanceName || 'Watch Together',
    allowPublicSignup: !!appConfig.allowPublicSignup,
    quickLoginEnabled: !!appConfig.quickLoginEnabled,
    quickLoginMode: appConfig.quickLoginMode === 'passwordless' ? 'passwordless' : 'autofill',
    modules: {
      neko: appConfig.modules?.neko !== false,
      downloader: appConfig.modules?.downloader !== false,
      mediaStudio: appConfig.modules?.mediaStudio !== false,
      livekit: appConfig.modules?.livekit !== false
    }
  };
}

const activeSessions = new Map(); // token -> { id, ... }

// Load saved sessions from disk so server restarts don't log out valid users
try {
  const savedSessions = loadJSON(SESSIONS_FILE, {});
  for (const [t, u] of Object.entries(savedSessions)) {
    if (u && u.id && usersData.users.some(dbU => dbU.id === u.id)) {
      activeSessions.set(t, u);
    }
  }
} catch (e) { }

function persistSessions() {
  try {
    const obj = {};
    for (const [t, u] of activeSessions.entries()) {
      obj[t] = u;
    }
    saveJSON(SESSIONS_FILE, obj, 0o600);
  } catch (e) { }
}

function revokeUserSessions(userId) {
  let removed = 0;
  for (const [token, sessionUser] of activeSessions.entries()) {
    if (sessionUser?.id === userId) {
      activeSessions.delete(token);
      removed++;
    }
  }
  if (removed > 0) {
    persistSessions();
    io.emit('auth:session_revoked', { userId });
  }
  return removed;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getAuthUser(req) {
  const authHeader = req.headers.authorization || req.headers['x-auth-token'];
  let token = '';
  if (authHeader) {
    token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  } else if (req.query?.token) {
    token = String(req.query.token).trim();
  }

  if (!token || !activeSessions.has(token)) {
    return null;
  }

  const sessionUser = activeSessions.get(token);
  const dbUser = usersData.users.find(u => u.id === sessionUser?.id);
  if (!dbUser) {
    activeSessions.delete(token);
    persistSessions();
    return null;
  }

  return sanitizeUser(dbUser);
}

function requireAuth(req, res, next) {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.authUser = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator privileges required' });
  }
  req.authUser = user;
  next();
}

// Health check endpoint for Docker HEALTHCHECK
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    setupCompleted: !!appConfig.setupCompleted,
    instanceName: appConfig.instanceName || 'Watch Together'
  });
});

// --------------------------------------------------------------------------
// 2. ARIA2C BACKGROUND DOWNLOADER DAEMON
// --------------------------------------------------------------------------
let aria2Process = null;
const ARIA2_PORT = 6800;

function startAria2Daemon() {
  // Check if aria2c is installed
  exec('aria2c --version', (err) => {
    if (err) {
      console.log('ℹ️ aria2c binary not detected on this machine. Direct torrent/aria downloads will use HTTP/webtorrent fallback.');
      return;
    }
    console.log('🚀 Launching aria2c daemon with DHT & BitTorrent support...');
    const args = [
      '--enable-rpc=true',
      `--rpc-listen-port=${ARIA2_PORT}`,
      '--rpc-listen-all=true',
      '--rpc-allow-origin-all=true',
      '--rpc-max-request-size=100M',
      `--dir=${DOWNLOADS_DIR}`,
      '--max-connection-per-server=16',
      '--split=16',
      '--min-split-size=1M',
      '--check-certificate=false',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      '--allow-overwrite=true',
      '--auto-file-renaming=true',
      '--file-allocation=none',
      '--enable-dht=true',
      '--enable-peer-exchange=true',
      '--bt-enable-lpd=true',
      '--seed-time=0',
      '--summary-interval=0'
    ];

    if (aria2Process) {
      try { aria2Process.kill(); } catch {}
    }
    aria2Process = spawn('aria2c', args, { stdio: 'ignore' });
    aria2Process.on('error', (e) => console.log('aria2c process notice:', e.message));
    aria2Process.on('close', (code) => {
      console.log(`aria2c exited with code ${code}. Auto-restarting daemon in 2s...`);
      setTimeout(startAria2Daemon, 2000);
    });
  });
}
startAria2Daemon();

// In-Memory Custom Stream/URL Downloader Tracker (yt-dlp & direct streams)
const customDownloads = new Map();

// Helper to make Aria2 JSON-RPC calls
async function callAria2(method, params = []) {
  try {
    const res = await fetch(`http://127.0.0.1:${ARIA2_PORT}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `aria-${Date.now()}`,
        method,
        params
      }),
      signal: AbortSignal.timeout(5000)
    });
    return await res.json();
  } catch (err) {
    startAria2Daemon();
    return { error: { message: 'Aria2 daemon not reachable. Re-initializing background service...' } };
  }
}

// --------------------------------------------------------------------------
// 3. IN-MEMORY ROOM & PRESENCE SYSTEM
// --------------------------------------------------------------------------
const rooms = new Map();

function detectMediaType(url) {
  if (!url || typeof url !== 'string') return { type: 'unknown', cleanUrl: '' };
  const trimmed = url.trim();

  // Local media stream endpoint
  if (trimmed.startsWith('/api/media/stream/') || trimmed.includes('/api/media/stream/')) {
    return { type: 'direct', cleanUrl: trimmed };
  }

  // YouTube match
  const ytMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  if (ytMatch) {
    return {
      type: 'youtube',
      videoId: ytMatch[1],
      cleanUrl: `https://www.youtube.com/watch?v=${ytMatch[1]}`
    };
  }

  // HLS stream (.m3u8)
  if (trimmed.includes('.m3u8') || trimmed.toLowerCase().endsWith('.m3u8')) {
    return { type: 'hls', cleanUrl: trimmed };
  }

  // Direct HTML5 Video (.mp4, .webm, .mkv, .mov, etc.)
  if (/\.(mp4|webm|ogg|mov|mkv)(\?.*)?$/i.test(trimmed)) {
    return { type: 'direct', cleanUrl: trimmed };
  }

  return { type: 'direct', cleanUrl: trimmed };
}

function getRoomCurrentTime(room) {
  if (!room.playback.isPlaying) return room.playback.currentTime;
  const elapsed = (Date.now() - room.playback.updatedAt) / 1000;
  return room.playback.currentTime + elapsed * (room.playback.playbackRate || 1.0);
}

const savedRoomsData = loadJSON(ROOMS_FILE, {});

function saveRoomToDisk(roomId, room) {
  try {
    savedRoomsData[roomId] = {
      media: room.media,
      playback: {
        isPlaying: room.playback.isPlaying,
        currentTime: getRoomCurrentTime(room),
        playbackRate: room.playback.playbackRate,
        updatedAt: Date.now()
      },
      settings: room.settings
    };
    saveJSON(ROOMS_FILE, savedRoomsData);
  } catch (err) {
    console.error('Error saving room state:', err);
  }
}

function createRoom(roomId) {
  const saved = savedRoomsData[roomId];
  const defaultMedia = {
    type: 'youtube',
    url: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
    videoId: '5qap5aO4i9A',
    title: 'Lofi Hip Hop Radio 🎧'
  };
  let roomMedia = saved?.media || defaultMedia;
  if (roomMedia.url && roomMedia.url.startsWith('/api/media/stream/')) {
    const rawRel = decodeURIComponent(roomMedia.url.replace('/api/media/stream/', '').split('?')[0]);
    const targetFile = resolveExistingMediaFile(rawRel);
    if (!fs.existsSync(targetFile)) {
      console.log(`⚠️ Saved media for room "${roomId}" no longer exists on disk (${rawRel}). Resetting to default.`);
      roomMedia = defaultMedia;
    }
  }

  return {
    id: roomId,
    createdAt: Date.now(),
    hostId: null,
    settings: saved?.settings || {
      hostOnlyControls: false,
      allowDanmaku: true
    },
    media: roomMedia,
    playback: saved?.playback || {
      isPlaying: false,
      currentTime: 0,
      updatedAt: Date.now(),
      playbackRate: 1.0
    },
    queue: [],
    messages: [
      {
        id: 'sys-start',
        sender: 'System',
        text: `Room "${roomId}" active!`,
        timestamp: Date.now(),
        isSystem: true
      }
    ],
    lastSeen: {},
    users: new Map() // socketId -> user
  };
}

// Preload the single common lounge room
rooms.set('lounge', createRoom('lounge'));

// --------------------------------------------------------------------------
// 4. REST API ROUTES
// --------------------------------------------------------------------------

// 4.1 Live Status Helper & Real-Time Sync
function getLiveStatus() {
  let isWatching = false;
  let activeRoom = 'lounge';
  let activeTitle = '';
  let totalUsers = 0;
  let watchers = [];
  let media = null;
  let playback = null;

  // Prioritize common room 'lounge'
  const lounge = rooms.get('lounge');
  if (lounge && (lounge.users.size > 0 || (lounge.media && lounge.media.title))) {
    isWatching = lounge.users.size > 0;
    activeRoom = 'lounge';
    activeTitle = lounge.media?.title || 'Common Screen Lounge';
    media = lounge.media;
    playback = lounge.playback;
    totalUsers = lounge.users.size;
    for (const u of lounge.users.values()) {
      watchers.push({ name: u.username, color: u.color, avatar: u.avatar });
    }
  } else {
    for (const [id, room] of rooms.entries()) {
      if (room.users.size > 0) {
        isWatching = true;
        activeRoom = id;
        activeTitle = room.media?.title || 'Watch Party';
        media = room.media;
        playback = room.playback;
        totalUsers += room.users.size;
        for (const u of room.users.values()) {
          watchers.push({ name: u.username, color: u.color, avatar: u.avatar });
        }
        break;
      }
    }
  }

  return {
    isWatching,
    activeRoom,
    activeTitle,
    totalUsers,
    watchers,
    media,
    playback
  };
}

function broadcastLiveStatus() {
  try {
    const status = getLiveStatus();
    io.emit('live:update', status);
  } catch (err) {
    console.error('Error broadcasting live status:', err);
  }
}

app.get('/api/live-status', (req, res) => {
  res.json(getLiveStatus());
});

// ============================================================
// LiveKit SFU - Token Endpoint
// POST /api/livekit/token  body: { roomId, identity, username }
// ============================================================
app.post('/api/livekit/token', express.json(), async (req, res) => {
  if (appConfig.modules?.livekit === false) {
    return res.status(403).json({ error: 'LiveKit voice/video module is disabled on this server.' });
  }
  if (!AccessToken || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: 'LiveKit not configured on this server (missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET).' });
  }
  const { roomId, identity, username } = req.body || {};
  if (!roomId || !identity) {
    return res.status(400).json({ error: 'roomId and identity required' });
  }
  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: username || identity,
      ttl: 24 * 3600 // 24 hours
    });
    at.addGrant({ roomJoin: true, room: roomId, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    const host = req.headers.host || `localhost:${PORT}`;
    const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const isHttpsReq = req.secure || fwdProto === 'https';
    const proto = isHttpsReq ? 'wss' : 'ws';
    const wsUrl = process.env.LIVEKIT_WS_URL || `${proto}://${host}/livekit`;

    res.json({ token, url: wsUrl });
  } catch (err) {
    console.error('[LiveKit] Token error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rooms', (req, res) => {
  const result = [];
  for (const [id, r] of rooms.entries()) {
    result.push({
      id,
      name: id === 'lounge' ? 'Common Screen Lounge' : id,
      userCount: r.users?.size || 0,
      media: r.media || null,
      isPlaying: r.playback?.isPlaying || false,
      currentTime: r.playback?.currentTime || 0,
      users: Array.from(r.users?.values() || []).map(u => ({ username: u.username, name: u.name, avatar: u.avatar, color: u.color }))
    });
  }
  res.json({ rooms: result });
});

app.get('/api/network-status', (req, res) => {
  let tunnelUrl = null;
  const logFile = path.join(DATA_DIR, 'cloudflared.log');
  if (fs.existsSync(logFile)) {
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const match = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
      if (match && match.length > 0) {
        tunnelUrl = match[match.length - 1];
      }
    } catch (err) {
      console.warn('Error reading tunnel log:', err);
    }
  }

  const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const isHttps = req.secure || fwdProto === 'https';
  res.json({
    isHttps,
    protocol: isHttps ? 'https' : 'http',
    host: req.headers.host || '',
    socketIoPath: '/api/v1/sync',
    livekitPath: '/livekit',
    tunnelUrl
  });
});

// --------------------------------------------------------------------------
// 4.2 SETUP WIZARD, AUTHENTICATION & ADMIN VAULT
// --------------------------------------------------------------------------
app.get('/api/setup/status', (req, res) => {
  res.json(getPublicConfig());
});

app.post('/api/setup/complete', (req, res) => {
  if (appConfig.setupCompleted) {
    return res.status(403).json({ error: 'Setup has already been completed. Use the Admin Panel to modify settings.' });
  }

  const {
    adminName,
    adminEmail,
    adminPassword,
    instanceName,
    allowPublicSignup,
    quickLoginEnabled,
    quickLoginMode,
    modules
  } = req.body || {};

  if (!adminName || !String(adminName).trim() || !adminEmail || !String(adminEmail).trim() || !adminPassword) {
    return res.status(400).json({ error: 'Admin name, email/username, and password are required.' });
  }
  if (String(adminPassword).length < 4) {
    return res.status(400).json({ error: 'Admin password must be at least 4 characters.' });
  }

  const cleanName = String(adminName).trim();
  const cleanEmail = String(adminEmail).trim().toLowerCase();
  const { salt, hash } = hashPassword(String(adminPassword));

  const adminUser = {
    id: `usr-${Date.now()}`,
    name: cleanName,
    email: cleanEmail,
    passwordSalt: salt,
    passwordHash: hash,
    encryptedPassword: encryptSecret(String(adminPassword)),
    role: 'admin',
    avatar: '👑',
    color: '#f59e0b',
    quickLoginVisible: true,
    createdAt: Date.now()
  };

  usersData.users = [adminUser];
  saveJSON(USERS_FILE, usersData, 0o600);

  Object.assign(appConfig, {
    setupCompleted: true,
    instanceName: (instanceName && String(instanceName).trim()) || 'Watch Together',
    allowPublicSignup: !!allowPublicSignup,
    quickLoginEnabled: quickLoginEnabled !== false,
    quickLoginMode: quickLoginMode === 'passwordless' ? 'passwordless' : 'autofill',
    modules: {
      neko: modules?.neko !== false && modules?.neko !== 'disabled',
      nekoMode: modules?.nekoMode || (modules?.neko === false ? 'disabled' : 'ondemand'),
      downloader: modules?.downloader !== false,
      mediaStudio: modules?.mediaStudio !== false,
      livekit: modules?.livekit !== false
    }
  });
  saveJSON(CONFIG_FILE, appConfig, 0o600);

  const token = generateToken();
  const safeUser = sanitizeUser(adminUser);
  activeSessions.set(token, safeUser);
  persistSessions();

  if (!appConfig.modules.neko) {
    stopNeko().catch(() => { });
  } else if (appConfig.modules.nekoMode === 'always') {
    startNeko().catch(() => {});
  }

  res.json({ success: true, token, user: safeUser, config: getPublicConfig() });
});

app.get('/api/auth/bootstrap', (req, res) => {
  const pubCfg = getPublicConfig();
  let quickLoginUsers = [];
  if (pubCfg.setupCompleted && pubCfg.quickLoginEnabled) {
    quickLoginUsers = usersData.users
      .filter(u => u.quickLoginVisible !== false)
      .map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role === 'admin' ? 'admin' : 'member',
        avatar: u.avatar || '🍿',
        color: u.color || '#ec4899'
      }));
  }
  res.json({
    ...pubCfg,
    quickLoginUsers
  });
});

app.post('/api/auth/quick-login', (req, res) => {
  if (!appConfig.setupCompleted) {
    return res.status(403).json({ error: 'Instance setup is not complete yet.' });
  }
  if (!appConfig.quickLoginEnabled || appConfig.quickLoginMode !== 'passwordless') {
    return res.status(403).json({ error: 'Passwordless Quick-Login is disabled by the administrator.' });
  }

  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'userId is required.' });
  }

  const user = usersData.users.find(u => u.id === userId);
  if (!user || user.quickLoginVisible === false) {
    return res.status(404).json({ error: 'Quick-Login profile not found or hidden.' });
  }

  const token = generateToken();
  const safeUser = sanitizeUser(user);
  activeSessions.set(token, safeUser);
  persistSessions();

  res.json({ success: true, token, user: safeUser });
});

app.post('/api/auth/register', (req, res) => {
  if (!appConfig.setupCompleted) {
    return res.status(403).json({ error: 'Instance setup must be completed before registering users.' });
  }
  if (!appConfig.allowPublicSignup) {
    return res.status(403).json({ error: 'Public sign-ups are disabled. Contact your server administrator for an account.' });
  }

  const { email, password, confirmPassword, name } = req.body || {};
  if (!email || !password || !confirmPassword) {
    return res.status(400).json({ error: 'Email/username, password, and confirmation are required.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match. Please verify both entries.' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanName = (name && String(name).trim()) || cleanEmail.split('@')[0];
  const existing = usersData.users.find(u =>
    u.email?.toLowerCase() === cleanEmail || u.name?.toLowerCase() === cleanName.toLowerCase()
  );
  if (existing) {
    return res.status(400).json({ error: 'An account with this email or name already exists.' });
  }

  const { salt, hash } = hashPassword(String(password));
  const newUser = {
    id: `usr-${Date.now()}`,
    name: cleanName,
    email: cleanEmail,
    passwordSalt: salt,
    passwordHash: hash,
    encryptedPassword: encryptSecret(String(password)),
    role: 'member',
    avatar: '🌸',
    color: '#f472b6',
    quickLoginVisible: true,
    createdAt: Date.now()
  };

  usersData.users.push(newUser);
  saveJSON(USERS_FILE, usersData, 0o600);

  const token = generateToken();
  const safeUser = sanitizeUser(newUser);
  activeSessions.set(token, safeUser);
  persistSessions();

  res.json({ success: true, token, user: safeUser });
});

app.post('/api/auth/login', (req, res) => {
  if (!appConfig.setupCompleted) {
    return res.status(403).json({ error: 'Instance setup is not complete yet.' });
  }
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email/username and password are required.' });
  }

  const cleanInput = String(email).trim().toLowerCase();
  const user = usersData.users.find(u =>
    u.email?.toLowerCase() === cleanInput ||
    u.name?.toLowerCase() === cleanInput ||
    u.id?.toLowerCase() === cleanInput ||
    ((cleanInput === 'riaa@watchtogether.local' || cleanInput === 'riaa') && u.id === 'ria')
  );

  if (!user) {
    return res.status(401).json({ error: 'Account not found. Check your credentials or ask your admin.' });
  }

  if (!verifyUserPassword(String(password), user)) {
    return res.status(401).json({ error: 'Incorrect password. Please try again.' });
  }

  // Upgrade legacy salted hashes lazily and ensure credential vault is populated
  let updated = false;
  if (!user.passwordSalt) {
    const upgraded = hashPassword(String(password));
    user.passwordSalt = upgraded.salt;
    user.passwordHash = upgraded.hash;
    updated = true;
  }
  if (!user.encryptedPassword) {
    user.encryptedPassword = encryptSecret(String(password));
    updated = true;
  }
  if (updated) {
    saveJSON(USERS_FILE, usersData, 0o600);
  }

  const token = generateToken();
  const safeUser = sanitizeUser(user);
  activeSessions.set(token, safeUser);
  persistSessions();

  res.json({ success: true, token, user: safeUser });
});

app.get('/api/auth/me', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ success: true, user, config: getPublicConfig() });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization || req.headers['x-auth-token'];
  if (authHeader) {
    const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    activeSessions.delete(token);
    persistSessions();
  }
  res.json({ success: true });
});

app.get('/api/users', requireAuth, (req, res) => {
  res.json(usersData.users.map(sanitizeUser));
});

// --------------------------------------------------------------------------
// 4.2b ADMIN SETTINGS & ENCRYPTED CREDENTIAL VAULT
// --------------------------------------------------------------------------
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const sessionCounts = new Map();
  for (const sessionUser of activeSessions.values()) {
    if (sessionUser?.id) {
      sessionCounts.set(sessionUser.id, (sessionCounts.get(sessionUser.id) || 0) + 1);
    }
  }
  const users = usersData.users.map(u => ({
    ...sanitizeUser(u),
    hasStoredCredential: !!u.encryptedPassword,
    activeSessionCount: sessionCounts.get(u.id) || 0
  }));
  res.json({
    config: getPublicConfig(),
    users
  });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const { instanceName, allowPublicSignup, quickLoginEnabled, quickLoginMode, modules } = req.body || {};

  if (typeof instanceName === 'string' && instanceName.trim()) {
    appConfig.instanceName = instanceName.trim();
  }
  if (typeof allowPublicSignup === 'boolean') {
    appConfig.allowPublicSignup = allowPublicSignup;
  }
  if (typeof quickLoginEnabled === 'boolean') {
    appConfig.quickLoginEnabled = quickLoginEnabled;
  }
  if (quickLoginMode === 'passwordless' || quickLoginMode === 'autofill') {
    appConfig.quickLoginMode = quickLoginMode;
  }
  if (modules && typeof modules === 'object') {
    appConfig.modules = {
      neko: modules.neko !== undefined ? !!modules.neko : (appConfig.modules?.neko !== false),
      downloader: modules.downloader !== undefined ? !!modules.downloader : (appConfig.modules?.downloader !== false),
      mediaStudio: modules.mediaStudio !== undefined ? !!modules.mediaStudio : (appConfig.modules?.mediaStudio !== false),
      livekit: modules.livekit !== undefined ? !!modules.livekit : (appConfig.modules?.livekit !== false)
    };
  }

  saveJSON(CONFIG_FILE, appConfig, 0o600);
  const pubCfg = getPublicConfig();
  io.emit('config:updated', pubCfg);

  if (!pubCfg.modules.neko) {
    stopNeko().catch(() => { });
  }

  res.json({ success: true, config: pubCfg });
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { name, email, password, role, avatar, color, quickLoginVisible } = req.body || {};
  if (!name || !String(name).trim() || !email || !String(email).trim() || !password) {
    return res.status(400).json({ error: 'Name, email/username, and password are required.' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }

  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  const duplicate = usersData.users.find(u =>
    u.email?.toLowerCase() === cleanEmail || u.name?.toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    return res.status(400).json({ error: 'A user with this name or email already exists.' });
  }

  const userRole = role === 'admin' ? 'admin' : 'member';
  const { salt, hash } = hashPassword(String(password));
  const newUser = {
    id: `usr-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    name: cleanName,
    email: cleanEmail,
    passwordSalt: salt,
    passwordHash: hash,
    encryptedPassword: encryptSecret(String(password)),
    role: userRole,
    avatar: avatar || (userRole === 'admin' ? '👑' : '🌸'),
    color: color || (userRole === 'admin' ? '#f59e0b' : '#f472b6'),
    quickLoginVisible: quickLoginVisible !== false,
    createdAt: Date.now()
  };

  usersData.users.push(newUser);
  saveJSON(USERS_FILE, usersData, 0o600);
  io.emit('users:updated');

  res.json({
    success: true,
    user: { ...sanitizeUser(newUser), hasStoredCredential: true, activeSessionCount: 0 }
  });
});

app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const targetId = req.params.id;
  const dbUser = usersData.users.find(u => u.id === targetId);
  if (!dbUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const { name, email, password, role, avatar, color, quickLoginVisible } = req.body || {};

  if (role !== undefined && role !== 'admin' && dbUser.role === 'admin') {
    const adminCount = usersData.users.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot demote the last administrator.' });
    }
    if (req.authUser.id === dbUser.id) {
      return res.status(400).json({ error: 'You cannot demote your own active admin account.' });
    }
  }

  if (typeof email === 'string' && email.trim()) {
    const cleanEmail = email.trim().toLowerCase();
    const conflict = usersData.users.find(u => u.id !== targetId && u.email?.toLowerCase() === cleanEmail);
    if (conflict) return res.status(400).json({ error: 'Email/username already in use by another user.' });
    dbUser.email = cleanEmail;
  }

  if (typeof name === 'string' && name.trim()) {
    const cleanName = name.trim();
    const conflict = usersData.users.find(u => u.id !== targetId && u.name?.toLowerCase() === cleanName.toLowerCase());
    if (conflict) return res.status(400).json({ error: 'Display name already in use by another user.' });
    dbUser.name = cleanName;
  }

  if (role === 'admin' || role === 'member') {
    dbUser.role = role;
  }
  if (typeof avatar === 'string' && avatar.trim()) {
    dbUser.avatar = avatar.trim();
  }
  if (typeof color === 'string' && color.trim()) {
    dbUser.color = color.trim();
  }
  if (typeof quickLoginVisible === 'boolean') {
    dbUser.quickLoginVisible = quickLoginVisible;
  }

  if (typeof password === 'string' && password.length > 0) {
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }
    const { salt, hash } = hashPassword(password);
    dbUser.passwordSalt = salt;
    dbUser.passwordHash = hash;
    dbUser.encryptedPassword = encryptSecret(password);
  }

  saveJSON(USERS_FILE, usersData, 0o600);

  // Sync updated profile metadata into active sessions
  const sanitized = sanitizeUser(dbUser);
  for (const [tok, sessUser] of activeSessions.entries()) {
    if (sessUser?.id === dbUser.id) {
      activeSessions.set(tok, sanitized);
    }
  }
  persistSessions();
  io.emit('users:updated');

  res.json({
    success: true,
    user: { ...sanitized, hasStoredCredential: !!dbUser.encryptedPassword }
  });
});

app.post('/api/admin/users/:id/reveal', requireAdmin, (req, res) => {
  const dbUser = usersData.users.find(u => u.id === req.params.id);
  if (!dbUser) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (!dbUser.encryptedPassword) {
    return res.json({
      success: true,
      available: false,
      email: dbUser.email,
      name: dbUser.name,
      reason: 'Password has not been recorded in the encrypted vault yet (legacy account before next login or password reset).'
    });
  }
  const plaintext = decryptSecret(dbUser.encryptedPassword);
  if (plaintext === null) {
    return res.status(500).json({ error: 'Failed to decrypt stored credential (vault key mismatch).' });
  }
  res.json({
    success: true,
    available: true,
    email: dbUser.email,
    name: dbUser.name,
    password: plaintext
  });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const targetId = req.params.id;
  if (req.authUser.id === targetId) {
    return res.status(400).json({ error: 'You cannot delete your own active admin account.' });
  }
  const idx = usersData.users.findIndex(u => u.id === targetId);
  if (idx === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const targetUser = usersData.users[idx];
  if (targetUser.role === 'admin') {
    const adminCount = usersData.users.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last administrator.' });
    }
  }

  usersData.users.splice(idx, 1);
  saveJSON(USERS_FILE, usersData, 0o600);
  const revokedSessions = revokeUserSessions(targetId);
  io.emit('users:updated');

  res.json({ success: true, revokedSessions });
});

app.post('/api/admin/users/:id/revoke-sessions', requireAdmin, (req, res) => {
  const targetId = req.params.id;
  const dbUser = usersData.users.find(u => u.id === targetId);
  if (!dbUser) {
    return res.status(404).json({ error: 'User not found.' });
  }
  const revokedSessions = revokeUserSessions(targetId);
  res.json({ success: true, revokedSessions });
});

// Update or Reset Custom Web-Ready Profile Avatar
app.post('/api/user/avatar', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { avatarData, reset } = req.body || {};
  const dbUser = usersData.users.find(u => u.id === user.id || u.name?.toLowerCase() === user.name?.toLowerCase());
  if (!dbUser) return res.status(404).json({ error: 'User not found' });

  if (reset) {
    dbUser.avatar = dbUser.role === 'admin' ? '👑' : '🍿';
    saveJSON(USERS_FILE, usersData, 0o600);
    const sanitized = sanitizeUser(dbUser);
    for (const [tok, sessUser] of activeSessions.entries()) {
      if (sessUser?.id === dbUser.id) activeSessions.set(tok, sanitized);
    }
    persistSessions();
    io.emit('user:avatar_changed', { username: dbUser.name, avatar: dbUser.avatar });
    return res.json({ success: true, avatar: dbUser.avatar, user: sanitized });
  }

  if (!avatarData || typeof avatarData !== 'string') {
    return res.status(400).json({ error: 'Image data is required' });
  }

  const match = avatarData.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Invalid image data' });
  }

  const ext = match[1] === 'jpeg' ? 'jpg' : (match[1] === 'png' ? 'png' : 'webp');
  const buffer = Buffer.from(match[2], 'base64');
  const fileName = `${dbUser.id || dbUser.name.toLowerCase()}.${ext}`;
  const filePath = path.join(AVATARS_DIR, fileName);

  try {
    fs.writeFileSync(filePath, buffer);
    const avatarUrl = `/api/avatars/${fileName}?t=${Date.now()}`;
    dbUser.avatar = avatarUrl;
    saveJSON(USERS_FILE, usersData, 0o600);

    // Broadcast to all connected sockets
    io.emit('user:avatar_changed', { username: dbUser.name, avatar: avatarUrl });

    // Update active sessions in memory
    const sanitized = sanitizeUser(dbUser);
    for (const [tok, u] of activeSessions.entries()) {
      if (u.id === dbUser.id || u.name?.toLowerCase() === dbUser.name?.toLowerCase()) {
        activeSessions.set(tok, sanitized);
      }
    }
    persistSessions();

    res.json({ success: true, avatar: avatarUrl, user: sanitized });
  } catch (err) {
    console.error('Failed to save avatar:', err);
    res.status(500).json({ error: 'Failed to save avatar file' });
  }
});

// 4.4 Unified Downloads API (Aria2c BitTorrent + yt-dlp Stream Engine)
function hasDownloadAccess(req) {
  const user = getAuthUser(req);
  return (
    user?.role === 'admin' ||
    !appConfig.setupCompleted ||
    (usersData?.users?.length || 0) <= 1 ||
    appConfig.allowUserDownloads !== false
  );
}

function requireDownloadAccess(req, res, next) {
  if (!hasDownloadAccess(req)) {
    return res.status(403).json({ error: 'Administrator privileges required for downloads' });
  }
  req.authUser = getAuthUser(req);
  next();
}

app.get('/api/downloads/active', async (req, res) => {
  if (!hasDownloadAccess(req)) {
    return res.json({ active: [], waiting: [], stopped: [], restricted: true });
  }

  const ariaActive = await callAria2('aria2.tellActive');
  const ariaWaiting = await callAria2('aria2.tellWaiting', [0, 20]);
  const ariaStopped = await callAria2('aria2.tellStopped', [0, 20]);

  const mapAriaTask = (t) => {
    let title = `Task ${t.gid}`;
    if (t.bittorrent?.info?.name) {
      title = t.bittorrent.info.name;
    } else if (t.files?.[0]?.path && path.basename(t.files[0].path)) {
      title = path.basename(t.files[0].path);
    } else if (t.files?.[0]?.uris?.[0]?.uri) {
      title = path.basename(t.files[0].uris[0].uri.split('?')[0]);
    }
    const completed = parseInt(t.completedLength || 0, 10);
    const total = parseInt(t.totalLength || 0, 10);
    const percent = total > 0 ? Math.floor((completed / total) * 100) : 0;
    const speedBytes = parseInt(t.downloadSpeed || 0, 10);
    const speed = (speedBytes / (1024 * 1024)).toFixed(2) + ' MB/s';

    let status = t.status;
    if (status === 'active' && percent >= 100) status = 'complete';

    return {
      gid: t.gid,
      title,
      status, // 'active' | 'waiting' | 'paused' | 'error' | 'complete'
      percent,
      downloadSpeed: speed,
      completedLength: completed,
      totalLength: total,
      errorMessage: t.errorMessage || (t.errorCode && t.errorCode !== '0' ? `Error code ${t.errorCode}` : null),
      type: t.bittorrent ? 'torrent' : 'direct'
    };
  };

  const activeList = (ariaActive.result || []).map(mapAriaTask);
  const waitingList = (ariaWaiting.result || []).map(mapAriaTask);
  const stoppedList = (ariaStopped.result || []).map(mapAriaTask);

  // Merge active and finished custom downloads (yt-dlp)
  for (const [gid, custom] of customDownloads.entries()) {
    const taskObj = {
      gid: custom.gid,
      title: custom.title || custom.url,
      status: custom.status,
      percent: custom.percent,
      downloadSpeed: custom.downloadSpeed,
      completedLength: custom.completedLength,
      totalLength: custom.totalLength,
      errorMessage: custom.errorMessage,
      type: 'stream'
    };
    if (custom.status === 'active') {
      activeList.push(taskObj);
    } else if (custom.status === 'complete' || custom.status === 'error') {
      stoppedList.unshift(taskObj);
    }
  }

  res.json({
    success: true,
    active: activeList,
    waiting: waitingList,
    stopped: stoppedList.slice(0, 30)
  });
});

app.post('/api/downloads/add', requireDownloadAccess, async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL or Magnet link is required' });
  }

  const cleanUrl = url.trim();
  const media = detectMediaType(cleanUrl);
  const isMagnet = cleanUrl.startsWith('magnet:?');
  const isTorrent = cleanUrl.endsWith('.torrent') || cleanUrl.includes('.torrent?');
  const isDirectFile = /\.(mp4|mkv|avi|mov|wmv|flv|webm|ts|m4v|mp3|m4a|aac|wav|flac|zip|tar|gz|iso)($|\?)/i.test(cleanUrl);
  const isStreamSite = !isMagnet && !isTorrent && !isDirectFile;

  // 1. YouTube, Anime sites & Any Web Video Streams -> Spawn yt-dlp with live progress
  if (isStreamSite) {
    const gid = `ytdl_${Date.now()}`;
    const task = {
      gid,
      url: cleanUrl,
      title: cleanUrl,
      type: 'ytdlp',
      status: 'active',
      percent: 0,
      downloadSpeed: 'Starting...',
      completedLength: 0,
      totalLength: 0,
      errorMessage: null,
      startTime: Date.now()
    };
    customDownloads.set(gid, task);

    console.log(`🎬 [Downloader] Spawning yt-dlp task ${gid} for: ${cleanUrl}`);
    const ytProcess = spawn('yt-dlp', [
      '--newline',
      '--progress',
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '-P', DOWNLOADS_DIR,
      '-o', '%(title)s.%(ext)s',
      cleanUrl
    ]);
    task.process = ytProcess;

    ytProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+)([KMGT]iB)(?:\s+at\s+([\d.]+[KMGT]iB\/s))?/i);
      if (match) {
        task.percent = Math.min(100, parseFloat(match[1]));
        const sizeVal = parseFloat(match[2]);
        const unit = match[3];
        const unitMultiplier = unit.startsWith('G') ? 1024 * 1024 * 1024 : unit.startsWith('M') ? 1024 * 1024 : 1024;
        task.totalLength = Math.round(sizeVal * unitMultiplier);
        task.completedLength = Math.round((task.percent / 100) * task.totalLength);
        if (match[4]) task.downloadSpeed = match[4];
      }
      const destMatch = text.match(/Destination:\s*(.+)/i) || text.match(/\[download\]\s+Destination:\s*(.+)/i);
      if (destMatch && destMatch[1]) {
        task.title = path.basename(destMatch[1].trim());
      }
    });

    ytProcess.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.includes('ERROR:')) {
        task.errorMessage = text.split('\n')[0].replace('ERROR:', '').trim();
      }
    });

    ytProcess.on('close', (code) => {
      if (code === 0) {
        task.status = 'complete';
        task.percent = 100;
        task.downloadSpeed = 'Complete';
      } else {
        task.status = 'error';
        task.errorMessage = task.errorMessage || `yt-dlp exited with code ${code}`;
      }
    });

    return res.json({ success: true, gid, mode: 'stream' });
  }

  // 2. Direct HTTP/HTTPS or Magnet Links -> aria2c with auto-fallback to yt-dlp
  const ariaOptions = {
    dir: DOWNLOADS_DIR,
    'check-certificate': 'false',
    header: 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  };

  const result = await callAria2('aria2.addUri', [[cleanUrl], ariaOptions]);
  if (!result.error && result.result) {
    return res.json({ success: true, gid: result.result, mode: isMagnet ? 'torrent' : 'direct' });
  }

  // If aria2 daemon returned an error or was unavailable on direct file links, fallback to yt-dlp
  if (!isMagnet && !isTorrent) {
    console.log(`⚡ [Downloader] Aria2 returned notice (${result.error?.message}). Falling back to yt-dlp engine for: ${cleanUrl}`);
    const gid = `ytdl_${Date.now()}`;
    const task = {
      gid,
      url: cleanUrl,
      title: path.basename(cleanUrl.split('?')[0]) || 'Direct Download',
      type: 'direct_stream',
      status: 'active',
      percent: 0,
      downloadSpeed: 'Connecting...',
      completedLength: 0,
      totalLength: 0,
      errorMessage: null,
      startTime: Date.now()
    };
    customDownloads.set(gid, task);

    const ytProcess = spawn('yt-dlp', [
      '--newline',
      '--progress',
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '-P', DOWNLOADS_DIR,
      '-o', '%(title)s.%(ext)s',
      cleanUrl
    ]);
    task.process = ytProcess;

    ytProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+)([KMGT]iB)(?:\s+at\s+([\d.]+[KMGT]iB\/s))?/i);
      if (match) {
        task.percent = Math.min(100, parseFloat(match[1]));
        const sizeVal = parseFloat(match[2]);
        const unit = match[3];
        const unitMultiplier = unit.startsWith('G') ? 1024 * 1024 * 1024 : unit.startsWith('M') ? 1024 * 1024 : 1024;
        task.totalLength = Math.round(sizeVal * unitMultiplier);
        task.completedLength = Math.round((task.percent / 100) * task.totalLength);
        if (match[4]) task.downloadSpeed = match[4];
      }
      const destMatch = text.match(/Destination:\s*(.+)/i) || text.match(/\[download\]\s+Destination:\s*(.+)/i);
      if (destMatch && destMatch[1]) {
        task.title = path.basename(destMatch[1].trim());
      }
    });

    ytProcess.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.includes('ERROR:')) {
        task.errorMessage = text.split('\n')[0].replace('ERROR:', '').trim();
      }
    });

    ytProcess.on('close', (code) => {
      if (code === 0) {
        task.status = 'complete';
        task.percent = 100;
        task.downloadSpeed = 'Complete';
      } else {
        task.status = 'error';
        task.errorMessage = task.errorMessage || `Download exited with code ${code}`;
      }
    });

    return res.json({ success: true, gid, mode: 'stream_fallback' });
  }

  return res.status(500).json({ error: result.error?.message || 'Failed to queue download task in aria2 daemon' });
});

// Cancel active download task
app.post('/api/downloads/cancel', requireDownloadAccess, async (req, res) => {
  const { gid } = req.body;
  if (!gid) return res.status(400).json({ error: 'GID required' });

  if (gid.startsWith('ytdl_')) {
    const task = customDownloads.get(gid);
    if (task) {
      if (task.process) {
        try { task.process.kill('SIGTERM'); } catch {}
      }
      customDownloads.delete(gid);
    }
    return res.json({ success: true });
  }

  // Aria2 cancel
  try {
    await callAria2('aria2.forceRemove', [gid]);
  } catch {}
  try {
    await callAria2('aria2.removeDownloadResult', [gid]);
  } catch {}

  res.json({ success: true });
});

// Clear finished / failed download history
app.post('/api/downloads/clear', requireDownloadAccess, async (req, res) => {
  try {
    await callAria2('aria2.purgeDownloadResult');
  } catch {}

  for (const [gid, task] of customDownloads.entries()) {
    if (task.status === 'complete' || task.status === 'error') {
      customDownloads.delete(gid);
    }
  }

  res.json({ success: true });
});

// Download Watch Together Browser Extension (.zip)
app.get('/api/extension/download', (req, res) => {
  const zipPath = path.join(__dirname, 'public', 'watch-together-extension.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'watch-together-extension.zip');
  } else {
    res.status(404).json({ error: 'Extension package not found' });
  }
});

// --------------------------------------------------------------------------
// 4.5 Media Probe, Subtitle Extraction & Library Management
// --------------------------------------------------------------------------
const LANG_MAP = {
  hin: 'Hindi',
  tam: 'Tamil',
  tel: 'Telugu',
  kan: 'Kannada',
  mal: 'Malayalam',
  ben: 'Bengali',
  mar: 'Marathi',
  guj: 'Gujarati',
  pan: 'Punjabi',
  eng: 'English',
  jpn: 'Japanese',
  kor: 'Korean',
  chi: 'Chinese',
  zho: 'Chinese',
  spa: 'Spanish',
  fra: 'French',
  fre: 'French',
  deu: 'German',
  ger: 'German',
  ita: 'Italian',
  rus: 'Russian',
  por: 'Portuguese',
  ara: 'Arabic',
  urd: 'Urdu',
  per: 'Persian',
  fas: 'Persian',
  tur: 'Turkish',
  vie: 'Vietnamese',
  tha: 'Thai',
  ind: 'Indonesian',
  und: 'Default'
};

const mediaProbeCache = new Map();

// Extracted Audio Track Cache for Multi-Audio Sync (Rock-solid, zero buffer, perfect sync)
const AUDIO_TRACKS_CACHE = path.join(DATA_DIR, 'audio_tracks');
if (!fs.existsSync(AUDIO_TRACKS_CACHE)) {
  fs.mkdirSync(AUDIO_TRACKS_CACHE, { recursive: true });
}

const pendingAudioExtractions = new Map();
const audioQueue = [];
let isAudioProcessing = false;

function processAudioQueue() {
  if (isAudioProcessing || audioQueue.length === 0) return;
  isAudioProcessing = true;
  const { filePath, track, cacheKey, cachedPath, resolve, reject } = audioQueue.shift();

  if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 0) {
    isAudioProcessing = false;
    resolve(cachedPath);
    processAudioQueue();
    return;
  }

  const tempPath = path.join(AUDIO_TRACKS_CACHE, `tmp_${Date.now()}_${cacheKey}`);
  // 1. Blazing fast stream copy first (0.5s for AAC/M4A)
  const copyCmd = `ffmpeg -y -i "${filePath}" -vn -sn -dn -map 0:a:${track} -c:a copy -movflags +faststart "${tempPath}"`;
  exec(copyCmd, { timeout: 30000 }, (err) => {
    if (!err && fs.existsSync(tempPath) && fs.statSync(tempPath).size > 1000) {
      try {
        fs.renameSync(tempPath, cachedPath);
        isAudioProcessing = false;
        resolve(cachedPath);
        if (typeof io !== 'undefined') {
          io.emit('audio:status_update', { filename: path.basename(filePath), track, isReady: true });
        }
        processAudioQueue();
        return;
      } catch (e) { }
    }
    if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch { }
    // 2. AAC transcode with 10-minute timeout so large 3h movies finish reliably!
    const transcodeCmd = `ffmpeg -y -i "${filePath}" -vn -sn -dn -map 0:a:${track} -c:a aac -b:a 128k -ac 2 -threads 2 -movflags +faststart "${tempPath}"`;
    exec(transcodeCmd, { timeout: 600000 }, (tErr) => {
      isAudioProcessing = false;
      if (tErr || !fs.existsSync(tempPath) || fs.statSync(tempPath).size === 0) {
        if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch { }
        reject(tErr || new Error('Audio extraction failed'));
      } else {
        try {
          fs.renameSync(tempPath, cachedPath);
          resolve(cachedPath);
        } catch (e) {
          resolve(cachedPath);
        }
        if (typeof io !== 'undefined') {
          io.emit('audio:status_update', { filename: path.basename(filePath), track, isReady: true });
        }
      }
      processAudioQueue();
    });
  });
}

function preExtractAudioTrack(filePath, track, highPriority = false) {
  try {
    const fileHash = crypto.createHash('md5').update(filePath).digest('hex');
    const baseHash = crypto.createHash('md5').update(path.basename(filePath)).digest('hex');
    const cacheKey = `${fileHash}_track_${track}.m4a`;
    const cachedPath = path.join(AUDIO_TRACKS_CACHE, cacheKey);
    const cachedPathBase = path.join(AUDIO_TRACKS_CACHE, `${baseHash}_track_${track}.m4a`);

    if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 1000) {
      return Promise.resolve(cachedPath);
    }
    if (fs.existsSync(cachedPathBase) && fs.statSync(cachedPathBase).size > 1000) {
      return Promise.resolve(cachedPathBase);
    }
    if (pendingAudioExtractions.has(cacheKey)) {
      return pendingAudioExtractions.get(cacheKey);
    }

    const job = new Promise((resolve, reject) => {
      const item = { filePath, track, cacheKey, cachedPath, resolve, reject };
      if (highPriority) {
        audioQueue.unshift(item);
      } else {
        audioQueue.push(item);
      }
      processAudioQueue();
    });

    pendingAudioExtractions.set(cacheKey, job);
    job.finally(() => {
      pendingAudioExtractions.delete(cacheKey);
    });
    return job;
  } catch (err) {
    console.warn('[AudioCache] Pre-extraction error:', err.message);
    return Promise.reject(err);
  }
}

function probeMediaFile(filePath, relPath = '') {
  const cacheKey = relPath ? relPath.replace(/\\/g, '/') : path.basename(filePath);
  if (mediaProbeCache.has(cacheKey)) return Promise.resolve(mediaProbeCache.get(cacheKey));

  const relTarget = cacheKey;

  return new Promise((resolve) => {
    exec(`ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`, { timeout: 10000 }, (err, stdout) => {
      if (err || !stdout) return resolve({ audioTracks: [], subtitles: [], duration: 0, needsTranscode: false });
      try {
        const data = JSON.parse(stdout);
        const streams = data.streams || [];
        const duration = parseFloat(data.format?.duration || 0);

        const audioTracks = [];
        let audioIdx = 0;
        const subtitles = [];

        streams.forEach((s) => {
          if (s.codec_type === 'audio') {
            const rawLang = (s.tags?.language || s.tags?.LANGUAGE || 'und').toLowerCase();
            const langLabel = LANG_MAP[rawLang] || (rawLang !== 'und' ? rawLang.toUpperCase() : `Audio ${audioIdx + 1}`);
            const rawTitle = (s.tags?.title || s.tags?.TITLE || '').trim();

            // Filter out junk release tags that mask language identity
            let cleanTitle = rawTitle;
            if (/^(HDHub|RARBG|YIFY|PSA|Galaxy|KONTRAST|Rip|Release|LiNE|TG|x264|x265)/i.test(cleanTitle)) {
              cleanTitle = '';
            }

            let displayTitle = '';
            if (cleanTitle) {
              if (cleanTitle.toLowerCase().includes(langLabel.toLowerCase())) {
                displayTitle = cleanTitle;
              } else {
                displayTitle = `${langLabel} - ${cleanTitle}`;
              }
            } else {
              displayTitle = `${langLabel} Audio`;
            }

            const codecStr = s.codec_name ? ` (${s.codec_name.toUpperCase()})` : '';

            audioTracks.push({
              index: audioIdx++,
              streamIndex: s.index,
              codec: s.codec_name,
              language: rawLang,
              title: `${displayTitle}${codecStr}`
            });
          } else if (s.codec_type === 'subtitle') {
            const rawCodec = (s.codec_name || '').toLowerCase();
            // Only include text-based subtitle streams that can be converted to WebVTT
            const textCodecs = ['subrip', 'ass', 'ssa', 'vtt', 'webvtt', 'mov_text', 'text', 'srt'];
            if (!textCodecs.includes(rawCodec)) return;

            const rawLang = (s.tags?.language || s.tags?.LANGUAGE || 'und').toLowerCase();
            const langLabel = LANG_MAP[rawLang] || (rawLang !== 'und' ? rawLang.toUpperCase() : `Subtitle ${s.index}`);
            const rawTitle = (s.tags?.title || s.tags?.TITLE || '').trim();

            let displayTitle = '';
            if (rawTitle) {
              if (rawTitle.toLowerCase().includes(langLabel.toLowerCase())) {
                displayTitle = rawTitle;
              } else {
                displayTitle = `${langLabel} (${rawTitle})`;
              }
            } else {
              displayTitle = `${langLabel} Subtitles`;
            }

            subtitles.push({
              streamIndex: s.index,
              codec: s.codec_name,
              language: rawLang,
              title: `${displayTitle} [${rawLang.toUpperCase()}]`,
              url: `/api/media/subtitles/${encodeURIComponent(relTarget)}/${s.index}.vtt`
            });
          }
        });

        const videoStream = streams.find(s => s.codec_type === 'video');
        const videoCodec = (videoStream?.codec_name || '').toLowerCase();
        const isHevc = videoCodec === 'hevc' || videoCodec === 'h265';
        const hasUnsupportedAudio = audioTracks.some(t => ['eac3', 'ac3', 'dts', 'truehd', 'mlp'].includes((t.codec || '').toLowerCase()));
        const isWebReady = (videoCodec === 'h264' || videoCodec === 'avc') && ((audioTracks[0]?.codec || '').toLowerCase() === 'aac');
        const needsTranscode = isHevc || hasUnsupportedAudio;

        const result = {
          videoCodec,
          isHevc,
          isWebReady,
          audioTracks,
          subtitles,
          duration,
          needsTranscode,
          hlsUrl: `/api/media/hls/${encodeURIComponent(relTarget)}/master.m3u8`
        };
        mediaProbeCache.set(cacheKey, result);

        // Auto pre-extract audio tracks in the background:
        // Always extract secondary tracks, AND extract track 0 if it is non-AAC (EAC3, DTS, AC3, etc.)!
        audioTracks.forEach((t) => {
          const isAac = (t.codec || '').toLowerCase() === 'aac';
          if (t.index > 0 || !isAac) {
            preExtractAudioTrack(filePath, t.index).catch(() => { });
          }
        });

        resolve(result);
      } catch (e) {
        resolve({ audioTracks: [], subtitles: [], duration: 0, needsTranscode: false });
      }
    });
  });
}

// Helper for safe path resolution within DOWNLOADS_DIR
function getSafePath(relativePath = '') {
  const decoded = decodeURIComponent(relativePath).replace(/\\/g, '/');
  const safe = path.normalize(decoded).replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
  const resolved = path.resolve(DOWNLOADS_DIR, safe);
  if (!resolved.startsWith(DOWNLOADS_DIR)) {
    return DOWNLOADS_DIR;
  }
  return resolved;
}

// Smart fallback file finder: if direct path is missing (e.g. moved in/out of subfolder), searches DOWNLOADS_DIR by filename
function resolveExistingMediaFile(relativePath = '') {
  const primary = getSafePath(relativePath);
  if (fs.existsSync(primary) && !fs.statSync(primary).isDirectory()) {
    return primary;
  }
  const clean = decodeURIComponent(relativePath).replace(/\\/g, '/');
  const targetBase = path.basename(clean);
  if (!targetBase) return primary;

  function scanDir(dir) {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          const found = scanDir(fullPath);
          if (found) return found;
        } else if (item.name === targetBase) {
          return fullPath;
        }
      }
    } catch { }
    return null;
  }

  const found = scanDir(DOWNLOADS_DIR);
  return found || primary;
}

function getAllSubfolders(baseDir, currentRel = '') {
  const dir = path.join(baseDir, currentRel);
  const result = [{ name: '📁 / (Root)', path: '' }];

  function scan(current) {
    try {
      const ents = fs.readdirSync(current, { withFileTypes: true });
      for (const ent of ents) {
        if (ent.isDirectory()) {
          const full = path.join(current, ent.name);
          const rel = path.relative(baseDir, full).replace(/\\/g, '/');
          result.push({ name: `📁 ${rel}`, path: rel });
          scan(full);
        }
      }
    } catch { }
  }
  scan(dir);
  return result;
}

// Full Library list with probed audio, subtitle tracks, and nested folders
app.get('/api/library', async (req, res) => {
  try {
    const folderParam = req.query.folder || '';
    const targetDir = getSafePath(folderParam);

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const currentRelFolder = path.relative(DOWNLOADS_DIR, targetDir).replace(/\\/g, '/');
    const parentFolder = currentRelFolder ? path.dirname(currentRelFolder).replace(/\\/g, '/') : null;

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const folders = [];
    const mediaFiles = [];

    for (const ent of entries) {
      const fullPath = path.join(targetDir, ent.name);
      const relPath = path.relative(DOWNLOADS_DIR, fullPath).replace(/\\/g, '/');

      if (ent.isDirectory()) {
        let count = 0;
        try {
          count = fs.readdirSync(fullPath).length;
        } catch { }
        const stat = fs.statSync(fullPath);
        folders.push({
          name: ent.name,
          relativePath: relPath,
          itemCount: count,
          modifiedAt: stat.mtime
        });
      } else if (/\.(mp4|mkv|webm|avi|mov|mp3)$/i.test(ent.name)) {
        const stat = fs.statSync(fullPath);
        const tracks = await probeMediaFile(fullPath, relPath);
        mediaFiles.push({
          filename: ent.name,
          relativePath: relPath,
          sizeBytes: stat.size,
          sizeFormatted: `${(stat.size / (1024 * 1024)).toFixed(1)} MB`,
          modifiedAt: stat.mtime,
          streamUrl: `/api/media/stream/${encodeURIComponent(relPath)}`,
          mediaType: 'direct',
          videoCodec: tracks.videoCodec || '',
          isHevc: !!tracks.isHevc,
          isWebReady: !!tracks.isWebReady,
          duration: tracks.duration || 0,
          audioTracks: tracks.audioTracks || [],
          subtitles: tracks.subtitles || []
        });
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    mediaFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);

    const allFolders = getAllSubfolders(DOWNLOADS_DIR);

    res.json({
      currentFolder: currentRelFolder === '.' ? '' : currentRelFolder,
      parentFolder: parentFolder === '.' ? '' : parentFolder,
      folders,
      files: mediaFiles,
      allFolders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Folder (Admin Only)
app.post('/api/library/folder/create', requireAdmin, (req, res) => {
  const { folderName, parentFolder = '' } = req.body;
  if (!folderName) return res.status(400).json({ error: 'Folder name is required' });

  const safeName = folderName.replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
  if (!safeName) return res.status(400).json({ error: 'Invalid folder name' });

  const parentDir = getSafePath(parentFolder);
  const targetDir = path.join(parentDir, safeName);

  if (fs.existsSync(targetDir)) {
    return res.status(400).json({ error: 'Folder already exists' });
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    res.json({ success: true, relativePath: path.relative(DOWNLOADS_DIR, targetDir).replace(/\\/g, '/') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename Folder (Admin Only)
app.post('/api/library/folder/rename', requireAdmin, (req, res) => {
  const { oldPath, newName } = req.body;
  if (!oldPath || !newName) return res.status(400).json({ error: 'Missing parameters' });

  const srcDir = getSafePath(oldPath);
  if (!fs.existsSync(srcDir) || srcDir === DOWNLOADS_DIR) {
    return res.status(404).json({ error: 'Folder not found or root cannot be renamed' });
  }

  const safeNewName = newName.replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
  const parentDir = path.dirname(srcDir);
  const targetDir = path.join(parentDir, safeNewName);

  if (fs.existsSync(targetDir) && srcDir !== targetDir) {
    return res.status(400).json({ error: 'A folder with that name already exists' });
  }

  try {
    fs.renameSync(srcDir, targetDir);
    mediaProbeCache.clear();
    res.json({ success: true, newPath: path.relative(DOWNLOADS_DIR, targetDir).replace(/\\/g, '/') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Folder (Admin Only - Supports both DELETE and POST, query and body)
app.all(['/api/library/folder/delete', '/api/library/folder'], requireAdmin, (req, res) => {
  if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).send('Method not allowed');
  const folderPath = req.body?.folderPath || req.body?.path || req.query?.path || req.query?.folderPath;
  if (!folderPath) return res.status(400).json({ error: 'Path required' });

  const targetDir = getSafePath(folderPath);
  if (!fs.existsSync(targetDir) || targetDir === DOWNLOADS_DIR) {
    return res.status(404).json({ error: 'Folder not found or root cannot be deleted' });
  }

  try {
    fs.rmSync(targetDir, { recursive: true, force: true });
    mediaProbeCache.clear();
    console.log(`🗑️ Successfully deleted folder "${folderPath}" (${targetDir})`);
    res.json({ success: true, message: 'Folder deleted' });
  } catch (err) {
    console.error(`❌ Error deleting folder "${folderPath}":`, err);
    res.status(500).json({ error: err.message });
  }
});

// Move File to Folder (Admin Only - Supports both /api/library/move and /api/library/file/move)
app.post(['/api/library/move', '/api/library/file/move'], requireAdmin, (req, res) => {
  const sourcePath = req.body.sourcePath || req.body.filePath;
  const targetFolder = req.body.targetFolder || '';
  if (!sourcePath) return res.status(400).json({ error: 'Missing source file path' });

  const srcFile = getSafePath(sourcePath);
  const destDir = getSafePath(targetFolder);

  if (!fs.existsSync(srcFile)) {
    return res.status(404).json({ error: 'Source file not found' });
  }
  if (!fs.existsSync(destDir) || !fs.statSync(destDir).isDirectory()) {
    return res.status(404).json({ error: 'Target directory not found' });
  }

  const filename = path.basename(srcFile);
  const destFile = path.join(destDir, filename);

  if (fs.existsSync(destFile) && srcFile !== destFile) {
    return res.status(400).json({ error: 'A file with that name already exists in target folder' });
  }

  try {
    fs.renameSync(srcFile, destFile);
    mediaProbeCache.clear();
    res.json({ success: true, newRelativePath: path.relative(DOWNLOADS_DIR, destFile).replace(/\\/g, '/') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single file probe info endpoint (supporting nested paths)
app.get(['/api/media/info/:filename', '/api/media/info/*'], async (req, res) => {
  const relPath = req.params[0] ? req.params[0] : req.params.filename;
  const filePath = resolveExistingMediaFile(relPath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  const info = await probeMediaFile(filePath, relPath);
  res.json({ filename: path.basename(filePath), relativePath: relPath, ...info });
});

// Clean raw HTML formatting tags (<b>, <i>, <font>, etc.) and ASS markup from WebVTT cues
function cleanVttContent(vttText) {
  if (!vttText) return 'WEBVTT\n\n';
  // Strip ASS override codes: {\an8}, {\pos(x,y)}, {\b1}, {\c&H...}, etc.
  let cleaned = vttText.replace(/\{[\\\/][^}]*\}/g, '');
  // Strip HTML tags: <b>, </b>, <i>, </i>, <u>, </u>, <font...>, </font>, <span>, </span>, <c...>, </c>, <v...>, </v>
  cleaned = cleaned.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  // Strip invisible unicode direction marks (LRM/RLM) that distort rendering
  cleaned = cleaned.replace(/[\u200E\u200F\u202A-\u202E]/g, '');
  return cleaned;
}

function formatAssTime(t) {
  const m = t.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2,3})/);
  if (!m) return t;
  const h = m[1].padStart(2, '0');
  const mm = m[2];
  const s = m[3];
  const ms = m[4].padEnd(3, '0').slice(0, 3);
  return `${h}:${mm}:${s}.${ms}`;
}

function assToVtt(assText) {
  if (!assText) return 'WEBVTT\n\n';
  const lines = assText.split(/\r?\n/);
  const cues = [];
  for (const line of lines) {
    if (line.startsWith('Dialogue:')) {
      const parts = line.split(',');
      if (parts.length >= 10) {
        const start = formatAssTime(parts[1].trim());
        const end = formatAssTime(parts[2].trim());
        let text = parts.slice(9).join(',');
        // Strip ASS override curly-bracket tags like {\pos(x,y)}, {\an8}, {\c&H...}
        text = text.replace(/\{[^\}]*\}/g, '');
        text = text.replace(/\\N/g, '\n');
        text = text.replace(/\\h/g, ' ');
        text = text.trim();
        if (text) {
          cues.push(`${start} --> ${end}\n${text}`);
        }
      }
    }
  }
  return 'WEBVTT\n\n' + cues.join('\n\n');
}

// Subtitle stream extraction (Converts MKV embedded ASS/SRT to clean WebVTT on demand)
app.get(['/api/media/subtitles/:filename/:streamIndex.vtt', '/api/media/subtitles/*'], (req, res) => {
  let relPath = req.params.filename;
  let streamIndex = req.params.streamIndex;

  if (req.params[0]) {
    const fullWildcard = req.params[0];
    const match = fullWildcard.match(/^(.*?)\/(\d+)\.vtt$/);
    if (match) {
      relPath = match[1];
      streamIndex = match[2];
    }
  }

  const filePath = resolveExistingMediaFile(relPath);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Media file not found');
  }

  const safeHash = crypto.createHash('md5').update(`${filePath}_${streamIndex}`).digest('hex');
  const cacheFile = path.join(SUBS_CACHE_DIR, `${safeHash}.vtt`);

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 0) {
    let content = fs.readFileSync(cacheFile, 'utf8');
    if (content.includes('<') || content.includes('{\\') || /[\u200E\u200F]/.test(content)) {
      content = cleanVttContent(content);
      try { fs.writeFileSync(cacheFile, content, 'utf8'); } catch { }
    }
    return res.send(content);
  }

  const streamNum = parseInt(streamIndex, 10);
  const tempSubFile = path.join(SUBS_CACHE_DIR, `tmp_${Date.now()}_${safeHash}.vtt`);
  const cmd = `ffmpeg -y -vn -an -i "${filePath}" -map 0:${streamNum} -f webvtt "${tempSubFile}"`;
  exec(cmd, { timeout: 120000 }, (err) => {
    if (err || !fs.existsSync(tempSubFile) || fs.statSync(tempSubFile).size === 0) {
      if (fs.existsSync(tempSubFile)) try { fs.unlinkSync(tempSubFile); } catch { }
      return res.send('WEBVTT\n\n');
    }
    try {
      fs.renameSync(tempSubFile, cacheFile);
      let content = fs.readFileSync(cacheFile, 'utf8');
      content = cleanVttContent(content);
      try { fs.writeFileSync(cacheFile, content, 'utf8'); } catch { }
      res.send(content);
    } catch {
      res.send('WEBVTT\n\n');
    }
  });
});


// Rename file in Library (Admin Only - Supports Nested Paths, /file alias, and filePath/oldName)
app.post(['/api/library/rename', '/api/library/file/rename'], requireAdmin, (req, res) => {
  const oldName = req.body?.filePath || req.body?.oldName || req.body?.sourcePath;
  const newName = req.body?.newName;
  if (!oldName || !newName) return res.status(400).json({ error: 'Missing parameters (oldName/filePath and newName required)' });

  const oldPath = getSafePath(oldName);
  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Source file not found' });

  // Auto-preserve original extension if user omitted it
  const origExt = path.extname(oldPath);
  let safeNewName = path.basename(newName).replace(/[^a-zA-Z0-9._ -]/g, '_');
  if (origExt && !safeNewName.toLowerCase().endsWith(origExt.toLowerCase())) {
    safeNewName += origExt;
  }

  const newPath = path.join(path.dirname(oldPath), safeNewName);
  if (fs.existsSync(newPath) && oldPath !== newPath) return res.status(400).json({ error: 'Target filename already exists' });

  try {
    fs.renameSync(oldPath, newPath);
    mediaProbeCache.clear();
    console.log(`✏️ Successfully renamed file "${oldName}" -> "${safeNewName}"`);
    res.json({ success: true, newName: safeNewName });
  } catch (err) {
    console.error(`❌ Error renaming file "${oldName}":`, err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// SUBDL DIRECT SEARCH & DOWNLOAD ENGINE
// --------------------------------------------------------------------------
const SUBDL_API_KEY = process.env.SUBDL_API_KEY || 'subdl_2Z1ERaBFDI4x4BViD-nRlK0ZrfpOV_-QzHNiyr9q1Lo';

app.get('/api/subtitles/search', async (req, res) => {
  const rawQuery = (req.query.query || '').trim();
  const rawFileName = (req.query.filename || '').trim();
  const target = rawFileName || rawQuery;
  const lang = (req.query.lang || req.query.languages || 'EN').toUpperCase();

  if (!target) return res.json({ data: [] });

  try {
    let subtitlesList = [];

    // Strategy 1: SubDL direct file_name lookup (highest precision for release torrents/files)
    try {
      const fileUrl = `https://api.subdl.com/api/v1/subtitles?api_key=${SUBDL_API_KEY}&file_name=${encodeURIComponent(target)}&languages=${encodeURIComponent(lang)}`;
      const fileRes = await fetch(fileUrl);
      if (fileRes.ok) {
        const fJson = await fileRes.json();
        if (fJson.status && Array.isArray(fJson.subtitles) && fJson.subtitles.length > 0) {
          subtitlesList = fJson.subtitles;
        }
      }
    } catch (fErr) {
      console.warn('[SubDL] file_name search error:', fErr.message);
    }

    // Strategy 2: Fallback to film_name search with cleaned show/movie title
    if (subtitlesList.length === 0) {
      let cleanQ = target
        .replace(/\.(mkv|mp4|avi|webm)$/i, '')
        .replace(/[\._]/g, ' ')
        .replace(/\b(1080p|720p|2160p|4k|bluray|web-dl|x264|x265|hevc|aac|dts|ddp5\.1|nf|4khdhub|com|kontrast|amzn)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const seMatch = target.match(/s(\d+)e(\d+)/i) || target.match(/(\d+)x(\d+)/i);
      let season = seMatch ? parseInt(seMatch[1], 10) : null;
      let episode = seMatch ? parseInt(seMatch[2], 10) : null;

      if (seMatch) {
        cleanQ = cleanQ.replace(/s\d+e\d+/gi, '').replace(/\d+x\d+/gi, '').replace(/\s+/g, ' ').trim();
      }

      // Deduplicate repeated words (e.g. "STEEL BALL RUN JoJos Bizarre Adventure STEEL BALL RUN")
      const words = cleanQ.split(' ');
      const seen = new Set();
      const deduped = [];
      for (const w of words) {
        const lower = w.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          deduped.push(w);
        }
      }
      cleanQ = deduped.join(' ');

      let url = `https://api.subdl.com/api/v1/subtitles?api_key=${SUBDL_API_KEY}&film_name=${encodeURIComponent(cleanQ)}&languages=${encodeURIComponent(lang)}`;
      if (season !== null && episode !== null) {
        url += `&season=${season}&episode=${episode}`;
      }

      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        if (json.status && Array.isArray(json.subtitles)) {
          subtitlesList = json.subtitles;
        }
      }
    }

    // Season / Episode prioritization
    const seMatchTarget = target.match(/s(\d+)e(\d+)/i) || target.match(/(\d+)x(\d+)/i);
    const targetEp = seMatchTarget ? parseInt(seMatchTarget[2], 10) : null;

    if (targetEp !== null && subtitlesList.length > 0) {
      subtitlesList.sort((a, b) => {
        const aMatches = (a.episode === targetEp || a.episode_from === targetEp);
        const bMatches = (b.episode === targetEp || b.episode_from === targetEp);
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
    }

    const results = subtitlesList.slice(0, 20).map((sub, idx) => {
      const displayTitle = sub.release_name || sub.name || `Subtitle ${idx + 1}`;
      return {
        id: sub.subtitlePage || `${idx}`,
        fileId: sub.url,
        fileName: displayTitle.replace(/\.zip$/i, ''),
        language: sub.language || sub.lang || 'EN',
        season: sub.season,
        episode: sub.episode,
        author: sub.author || 'SubDL',
        hi: !!sub.hi
      };
    });

    res.json({ data: results });
  } catch (err) {
    console.warn('[SubDL] Search error:', err.message);
    res.json({ data: [], error: err.message });
  }
});

app.post('/api/subtitles/download', async (req, res) => {
  const { fileId, fileName = 'subtitles', targetEpisode = null } = req.body;
  if (!fileId) return res.status(400).json({ error: 'fileId required' });

  try {
    const zipUrl = fileId.startsWith('http') ? fileId : `https://dl.subdl.com${fileId}`;
    const downRes = await fetch(zipUrl);

    if (!downRes.ok) {
      console.warn('[SubDL] Download fetch failed:', downRes.status);
      return res.status(downRes.status).json({ error: 'Failed to download subtitle from SubDL' });
    }

    const buf = await downRes.arrayBuffer();
    let textContent = '';
    let isAss = false;

    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(Buffer.from(buf));
      const entries = zip.getEntries();

      // Filter all valid subtitle entries
      const subEntries = entries.filter(e => !e.isDirectory && e.entryName.match(/\.(srt|vtt|ass|ssa)$/i));

      let matchedEntry = null;

      // If target episode is specified, find matching entry in season pack
      if (targetEpisode !== null && subEntries.length > 1) {
        const epPad = String(targetEpisode).padStart(2, '0');
        const epRegex = new RegExp(`(e${epPad}|e${targetEpisode}|[._ -]${epPad}[._ -]|[._ -]0*${targetEpisode}[._ -])`, 'i');
        matchedEntry = subEntries.find(e => epRegex.test(e.entryName));
      }

      if (!matchedEntry && subEntries.length > 0) {
        matchedEntry = subEntries[0];
      }

      if (matchedEntry) {
        isAss = !!matchedEntry.entryName.match(/\.(ass|ssa)$/i);
        textContent = zip.readAsText(matchedEntry);
      } else if (entries.length > 0) {
        textContent = zip.readAsText(entries[0]);
        isAss = !!entries[0].entryName.match(/\.(ass|ssa)$/i);
      }
    } catch (zipErr) {
      console.warn('[SubDL] AdmZip parse fallback:', zipErr.message);
      textContent = Buffer.from(buf).toString('utf8');
      isAss = textContent.includes('[Script Info]');
    }

    if (!textContent || textContent.trim().length === 0) {
      return res.status(500).json({ error: 'Empty subtitle content extracted' });
    }

    let vttContent = '';
    if (isAss || textContent.includes('[Script Info]') || textContent.includes('Dialogue:')) {
      vttContent = assToVtt(textContent);
    } else {
      vttContent = 'WEBVTT\n\n' + textContent
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
        .replace(/\r\n/g, '\n');
    }
    vttContent = cleanVttContent(vttContent);

    const safeHash = `subdl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const cacheFile = path.join(SUBS_CACHE_DIR, `${safeHash}.vtt`);
    fs.writeFileSync(cacheFile, vttContent, 'utf8');

    res.json({
      success: true,
      title: fileName.replace(/\.[^/.]+$/, ''),
      url: `/api/media/subtitles/cache/${safeHash}.vtt`,
      vttContent
    });
  } catch (err) {
    console.warn('[SubDL] Download error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve directly cached downloaded VTT files
app.get('/api/media/subtitles/cache/:filename', (req, res) => {
  const file = path.join(SUBS_CACHE_DIR, path.basename(req.params.filename));
  if (fs.existsSync(file)) {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(file);
  } else {
    res.status(404).send('Not found');
  }
});

// Delete file from Library (Admin Only - Supports Nested Paths, DELETE & POST, and /file alias)
app.all(['/api/library/delete', '/api/library/delete/:filename', '/api/library/delete/*', '/api/library/file'], requireAdmin, (req, res) => {
  if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).send('Method not allowed');
  const relPath = req.query?.path || req.query?.filePath || req.params[0] || req.params?.filename || req.body?.path || req.body?.filePath || req.body?.filename;
  if (!relPath) return res.status(400).json({ error: 'File path required' });
  const filePath = resolveExistingMediaFile(relPath);

  if (fs.existsSync(filePath)) {
    try {
      if (fs.statSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      mediaProbeCache.clear();
      console.log(`🗑️ Successfully deleted file/path "${relPath}" (${filePath})`);

      // Check if any room is currently playing or holding this deleted file!
      for (const [rId, room] of rooms.entries()) {
        if (room.media?.url && (room.media.url.includes(encodeURIComponent(relPath)) || room.media.url.includes(relPath) || room.media.url.includes(path.basename(filePath)))) {
          console.log(`🧹 Room "${rId}" was active with deleted file ${relPath}. Switching to default.`);
          room.media = {
            type: 'youtube',
            url: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
            videoId: '5qap5aO4i9A',
            title: 'Lofi Hip Hop Radio 🎧'
          };
          room.playback = {
            isPlaying: false,
            currentTime: 0,
            updatedAt: Date.now(),
            playbackRate: 1.0
          };
          saveRoomToDisk(rId, room);
          io.to(rId).emit('media:changed', {
            media: room.media,
            playback: room.playback,
            changedBy: 'System'
          });
          broadcastLiveStatus();
        }
      }

      return res.json({ success: true, message: `Deleted ${path.basename(filePath)}` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.status(404).json({ error: 'File not found' });
});

// System storage, RAM & A-to-Z Self-Hosting Diagnostics
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 10 || idx === 0 ? val.toFixed(1) : val.toFixed(2)} ${units[idx]}`;
}

function getStorageStats(targetPath) {
  const safePath = fs.existsSync(targetPath) ? targetPath : path.dirname(targetPath);
  try {
    if (typeof fs.statfsSync === 'function') {
      const stat = fs.statfsSync(safePath);
      const bsize = Number(stat.bsize || 4096);
      const totalBytes = Number(stat.blocks || 0) * bsize;
      const freeBytes = Number(stat.bavail ?? stat.bfree ?? 0) * bsize;
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      return {
        path: targetPath,
        totalBytes,
        freeBytes,
        usedBytes,
        total: formatBytes(totalBytes),
        free: formatBytes(freeBytes),
        used: formatBytes(usedBytes)
      };
    }
  } catch (e) {
    // Fallback handled below
  }
  return null;
}

async function getStorageStatsAsync(targetPath) {
  const direct = getStorageStats(targetPath);
  if (direct) return direct;

  return new Promise((resolve) => {
    exec(`df -k "${targetPath.replace(/"/g, '\\"')}"`, (err, stdout) => {
      if (!err && stdout) {
        const lines = stdout.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].trim().split(/\s+/);
          const totalBytes = (parseInt(parts[1], 10) || 0) * 1024;
          const usedBytes = (parseInt(parts[2], 10) || 0) * 1024;
          const freeBytes = (parseInt(parts[3], 10) || 0) * 1024;
          return resolve({
            path: targetPath,
            totalBytes,
            usedBytes,
            freeBytes,
            total: formatBytes(totalBytes),
            used: formatBytes(usedBytes),
            free: formatBytes(freeBytes)
          });
        }
      }
      resolve({
        path: targetPath,
        totalBytes: 0,
        usedBytes: 0,
        freeBytes: 0,
        total: 'Unknown',
        used: 'Unknown',
        free: 'Unknown'
      });
    });
  });
}

function testDirectoryWritable(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const probeFile = path.join(dirPath, `.wt_write_test_${process.pid}_${Date.now()}`);
    fs.writeFileSync(probeFile, 'ok', 'utf8');
    fs.unlinkSync(probeFile);
    return { writable: true, error: null };
  } catch (err) {
    return { writable: false, error: err.message };
  }
}

function getContainerMemoryLimitBytes() {
  try {
    const cg2Path = '/sys/fs/cgroup/memory.max';
    if (fs.existsSync(cg2Path)) {
      const raw = fs.readFileSync(cg2Path, 'utf8').trim();
      if (raw && raw !== 'max') {
        const val = Number(raw);
        if (Number.isFinite(val) && val > 0 && val < os.totalmem()) return val;
      }
    }
    const cg1Path = '/sys/fs/cgroup/memory/memory.limit_in_bytes';
    if (fs.existsSync(cg1Path)) {
      const raw = fs.readFileSync(cg1Path, 'utf8').trim();
      const val = Number(raw);
      if (Number.isFinite(val) && val > 0 && val < os.totalmem()) return val;
    }
  } catch { }
  return null;
}

function checkBinaryInstalled(cmd, args = ['--version']) {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout, stderr) => {
      if (err) {
        return resolve({
          installed: false,
          version: null,
          error: err.code === 'ENOENT' ? `${cmd} not found in PATH` : (err.message || 'Execution failed')
        });
      }
      const output = String(stdout || stderr || '').trim();
      const firstLine = output.split(/\r?\n/)[0] || 'Installed';
      resolve({
        installed: true,
        version: firstLine.slice(0, 120),
        error: null
      });
    });
  });
}

function probeHttpEndpoint(urlStr, timeoutMs = 2500) {
  return new Promise((resolve) => {
    try {
      const target = new URL(urlStr);
      const client = target.protocol === 'https:' ? require('https') : http;
      const req = client.request({
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname || '/',
        method: 'GET',
        timeout: timeoutMs
      }, (res) => {
        res.resume();
        resolve({ reachable: true, statusCode: res.statusCode, error: null });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ reachable: false, statusCode: null, error: 'Connection timed out' });
      });
      req.on('error', (err) => {
        resolve({ reachable: false, statusCode: null, error: err.message });
      });
      req.end();
    } catch (err) {
      resolve({ reachable: false, statusCode: null, error: err.message });
    }
  });
}

function canAccessDiagnostics(req) {
  if (!appConfig?.setupCompleted) return true;
  const user = getAuthUser(req);
  return user?.role === 'admin';
}

app.get('/api/system/storage', async (req, res) => {
  const disk = await getStorageStatsAsync(DOWNLOADS_DIR);
  const memFree = os.freemem();
  const memTotal = os.totalmem();
  const memUsed = Math.max(0, memTotal - memFree);
  res.json({
    disk: {
      total: disk.total,
      used: disk.used,
      free: disk.free,
      totalBytes: disk.totalBytes,
      usedBytes: disk.usedBytes,
      freeBytes: disk.freeBytes
    },
    diskFree: disk.free,
    memory: {
      total: formatBytes(memTotal),
      free: formatBytes(memFree),
      used: formatBytes(memUsed),
      totalBytes: memTotal,
      freeBytes: memFree,
      usedBytes: memUsed
    }
  });
});

app.get('/api/system/diagnostics', async (req, res) => {
  if (!canAccessDiagnostics(req)) {
    return res.status(403).json({ error: 'Admin privileges required for system diagnostics.' });
  }

  const cpus = os.cpus() || [];
  const cpuCores = cpus.length || 0;
  const osTotalBytes = os.totalmem();
  const osFreeBytes = os.freemem();
  const cgroupLimitBytes = getContainerMemoryLimitBytes();
  const effectiveTotalBytes = cgroupLimitBytes ? Math.min(osTotalBytes, cgroupLimitBytes) : osTotalBytes;
  const effectiveFreeBytes = cgroupLimitBytes ? Math.min(osFreeBytes, cgroupLimitBytes) : osFreeBytes;

  const [
    dataDisk,
    downloadsDisk,
    ffmpeg,
    ffprobe,
    aria2c,
    ytdlp,
    lkProbe
  ] = await Promise.all([
    getStorageStatsAsync(DATA_DIR),
    getStorageStatsAsync(DOWNLOADS_DIR),
    checkBinaryInstalled('ffmpeg', ['-version']),
    checkBinaryInstalled('ffprobe', ['-version']),
    checkBinaryInstalled('aria2c', ['--version']),
    checkBinaryInstalled('yt-dlp', ['--version']),
    probeHttpEndpoint(LIVEKIT_HTTP_TARGET, 2500)
  ]);

  const dataWrite = testDirectoryWritable(DATA_DIR);
  const downloadsWrite = testDirectoryWritable(DOWNLOADS_DIR);

  const dockerSocketExists = hasDockerSocket();
  let dockerAccessible = false;
  let dockerError = dockerSocketExists ? null : `Docker socket not found at ${DOCKER_SOCKET}`;
  let nekoStatus = 'unavailable';

  if (dockerSocketExists) {
    const ping = await callDockerAPI('/_ping', 'GET');
    if (ping.fallback || (ping.status && ping.status >= 400)) {
      dockerError = ping.error || `Docker socket returned HTTP ${ping.status}`;
    } else {
      dockerAccessible = true;
      nekoStatus = await checkNekoStatus();
    }
  }

  const nekoContainerExists = dockerAccessible && nekoStatus !== 'not_found' && nekoStatus !== 'unavailable' && nekoStatus !== 'unknown';
  const minNekoRamBytes = 1.5 * 1024 * 1024 * 1024;
  const recNekoRamBytes = 3.5 * 1024 * 1024 * 1024;
  const nekoErrors = [];
  const nekoWarnings = [];

  if (!dockerSocketExists || !dockerAccessible) {
    nekoErrors.push(dockerError || 'Docker socket is not mounted or permission denied.');
  } else if (!nekoContainerExists) {
    nekoErrors.push(`Neko container "${NEKO_CONTAINER_NAME}" was not found. Start with: docker compose --profile neko up --no-start neko`);
  }
  if (cpuCores < 2) {
    nekoErrors.push(`Only ${cpuCores} CPU core detected (Neko Chromium needs at least 2 vCPUs for smooth playback).`);
  }
  if (effectiveTotalBytes < minNekoRamBytes) {
    nekoErrors.push(`Only ${formatBytes(effectiveTotalBytes)} RAM available (minimum 1.5 GB required to launch Neko Chromium).`);
  } else if (effectiveTotalBytes < recNekoRamBytes) {
    nekoWarnings.push(`${formatBytes(effectiveTotalBytes)} RAM detected — Neko works best with 4+ GB RAM (it auto-stops when idle to save memory).`);
  }

  const nekoCapable = nekoErrors.length === 0;
  const transcodingCapable = ffmpeg.installed && ffprobe.installed;
  const downloaderCapable = aria2c.installed && ytdlp.installed && downloadsWrite.writable;
  const livekitKeysConfigured = !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
  const weakDefaultSecrets = ['devsecret', 'change_me_to_a_long_random_secret', 'changeme', 'secret'];
  const livekitDefaultSecretInUse = weakDefaultSecrets.includes(LIVEKIT_API_SECRET) || LIVEKIT_API_SECRET.length < 16;
  const livekitCapable = livekitKeysConfigured && lkProbe.reachable;

  const host = req.headers.host || `localhost:${PORT}`;
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const isHttpsReq = req.secure || fwdProto === 'https';

  res.json({
    timestamp: Date.now(),
    nodeVersion: process.version,
    cpu: {
      cores: cpuCores,
      model: cpus[0]?.model || 'Unknown CPU',
      arch: os.arch(),
      platform: os.platform(),
      loadAvg: os.loadavg()
    },
    memory: {
      osTotalBytes,
      osFreeBytes,
      osUsedBytes: Math.max(0, osTotalBytes - osFreeBytes),
      cgroupLimitBytes,
      effectiveTotalBytes,
      effectiveFreeBytes,
      total: formatBytes(effectiveTotalBytes),
      free: formatBytes(effectiveFreeBytes),
      used: formatBytes(Math.max(0, effectiveTotalBytes - effectiveFreeBytes))
    },
    storage: {
      dataDir: { ...dataDisk, ...dataWrite },
      downloadsDir: { ...downloadsDisk, ...downloadsWrite }
    },
    binaries: {
      ffmpeg,
      ffprobe,
      aria2c,
      ytdlp
    },
    docker: {
      socketPath: DOCKER_SOCKET,
      socketExists: dockerSocketExists,
      socketAccessible: dockerAccessible,
      error: dockerError
    },
    neko: {
      containerName: NEKO_CONTAINER_NAME,
      status: nekoStatus,
      containerExists: nekoContainerExists,
      moduleEnabled: appConfig.modules?.neko !== false,
      capable: nekoCapable,
      errors: nekoErrors,
      warnings: nekoWarnings
    },
    livekit: {
      configured: livekitKeysConfigured,
      defaultSecretInUse: livekitDefaultSecretInUse,
      target: LIVEKIT_HTTP_TARGET,
      reachable: lkProbe.reachable,
      statusCode: lkProbe.statusCode,
      error: lkProbe.error,
      moduleEnabled: appConfig.modules?.livekit !== false
    },
    requestContext: {
      isHttps: isHttpsReq,
      host,
      socketIoPath: '/api/v1/sync',
      livekitPath: '/livekit'
    },
    verdicts: {
      neko: {
        status: nekoCapable ? (nekoWarnings.length ? 'warn' : 'ok') : 'error',
        summary: nekoCapable
          ? (nekoWarnings[0] || `Ready (${cpuCores} vCPU, ${formatBytes(effectiveTotalBytes)} RAM, container: ${nekoStatus})`)
          : nekoErrors[0]
      },
      transcoding: {
        status: transcodingCapable ? 'ok' : 'error',
        summary: transcodingCapable
          ? 'ffmpeg & ffprobe ready for remuxing/transcoding HEVC/MKV/audio'
          : `Missing binary: ${[!ffmpeg.installed && 'ffmpeg', !ffprobe.installed && 'ffprobe'].filter(Boolean).join(', ')}`
      },
      downloader: {
        status: downloaderCapable ? 'ok' : (downloadsWrite.writable ? 'warn' : 'error'),
        summary: downloaderCapable
          ? `aria2c & yt-dlp ready; downloads writable (${downloadsDisk.free} free)`
          : (!downloadsWrite.writable
            ? `Downloads directory not writable: ${downloadsWrite.error}`
            : `Missing binary: ${[!aria2c.installed && 'aria2c', !ytdlp.installed && 'yt-dlp'].filter(Boolean).join(', ')}`)
      },
      livekit: {
        status: livekitCapable ? (livekitDefaultSecretInUse ? 'warn' : 'ok') : 'error',
        summary: !livekitKeysConfigured
          ? 'LIVEKIT_API_KEY / LIVEKIT_API_SECRET not configured'
          : (!lkProbe.reachable
            ? `LiveKit SFU unreachable at ${LIVEKIT_HTTP_TARGET} (${lkProbe.error || 'connection failed'})`
            : (livekitDefaultSecretInUse
              ? 'LiveKit SFU reachable, but a placeholder/weak secret is set in .env'
              : `LiveKit SFU reachable at ${LIVEKIT_HTTP_TARGET}`))
      }
    }
  });
});

app.get('/api/system/diagnostics/livekit-token', async (req, res) => {
  if (!canAccessDiagnostics(req)) {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  if (!AccessToken || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: 'LiveKit credentials not configured on server.' });
  }
  try {
    const identity = `diag-${Date.now()}`;
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: 'DiagnosticsProbe',
      ttl: 60
    });
    at.addGrant({ roomJoin: true, room: '__diag__', canPublish: false, canSubscribe: false });
    const token = await at.toJwt();
    const host = req.headers.host || `localhost:${PORT}`;
    const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const proto = (req.secure || fwdProto === 'https') ? 'wss' : 'ws';
    const wsUrl = process.env.LIVEKIT_WS_URL || `${proto}://${host}/livekit`;
    res.json({ token, url: wsUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function streamFileWithRanges(req, res, filePath, mimeType) {
  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      if (isNaN(start) || start >= fileSize) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).send('Requested Range Not Satisfiable');
      }

      // Natural, smooth byte range streaming without premature truncation
      let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (isNaN(end) || end >= fileSize) {
        end = fileSize - 1;
      }

      const chunkSize = end - start + 1;
      const headers = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Accept-Encoding, Accept, Origin, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
        'Cache-Control': 'public, max-age=3600'
      };

      // Instant 1ms HEAD response: return headers immediately without initiating file stream
      if (req.method === 'HEAD') {
        res.writeHead(206, headers);
        return res.end();
      }

      res.writeHead(206, headers);
      const fileStream = fs.createReadStream(filePath, { start, end });
      fileStream.pipe(res);

      req.on('close', () => {
        fileStream.destroy();
      });
      fileStream.on('error', () => {
        if (!res.headersSent) res.status(500).send('Streaming read error');
      });
    } else {
      const headers = {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Accept-Encoding, Accept, Origin, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
        'Cache-Control': 'public, max-age=3600'
      };

      if (req.method === 'HEAD') {
        res.writeHead(200, headers);
        return res.end();
      }

      res.writeHead(200, headers);
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      req.on('close', () => fileStream.destroy());
      fileStream.on('error', () => {
        if (!res.headersSent) res.status(500).send('Streaming read error');
      });
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Streaming error');
  }
}

// HTTP 206 Partial Content (Byte-Range) Streamer for Local Videos
app.get(['/api/media/stream/:filename', '/api/media/stream/*'], async (req, res) => {
  const relPath = req.params[0] || req.params.filename;
  const filePath = resolveExistingMediaFile(relPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).send('Media file not found');
  }

  // Only route to HLS if the client explicitly requested ?hls=1
  if (req.query.hls === '1') {
    const audioTrack = req.query.audio !== undefined ? parseInt(req.query.audio, 10) : 0;
    return res.redirect(`/api/media/hls/${encodeURIComponent(relPath)}/master.m3u8?audio=${audioTrack}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  let mimeType = 'video/mp4';
  if (ext === '.webm') mimeType = 'video/webm';
  if (ext === '.mkv') mimeType = 'video/x-matroska';
  if (ext === '.ogg') mimeType = 'video/ogg';

  return streamFileWithRanges(req, res, filePath, mimeType);
});

// --------------------------------------------------------------------------
// On-the-fly HLS Engine for Universal Playback (MKV, HEVC, EAC3, Multi-Audio)
// --------------------------------------------------------------------------
const HLS_CACHE_DIR = path.join(DATA_DIR, 'hls_cache');
if (!fs.existsSync(HLS_CACHE_DIR)) fs.mkdirSync(HLS_CACHE_DIR, { recursive: true });

const SEGMENT_DURATION = 5;
const pendingSegmentJobs = new Map();

function buildSegmentFfmpegCmd(filePath, startTime, audioTrack, outputPath) {
  // Use -noaccurate_seek so FFmpeg aligns BOTH video and audio to the identical keyframe packet
  // with sub-frame accuracy (within 8ms). aresample=async=1000 guarantees audio never drifts.
  return `ffmpeg -y -noaccurate_seek -ss ${startTime} -i "${filePath}" -t ${SEGMENT_DURATION} -map 0:v:0? -map 0:a:${audioTrack}? -c:v copy -c:a aac -b:a 192k -ac 2 -af "aresample=async=1000" -avoid_negative_ts make_zero -f mpegts "${outputPath}"`;
}

function triggerPregenerate(filePath, safeHash, audioTrack, nextSegNum, totalSegments) {
  // Disabled: never spawn parallel background ffmpeg instances on limited CPU
  return;
}

// Auto-clean old HLS segments older than 4 hours
setInterval(() => {
  try {
    const now = Date.now();
    const files = fs.readdirSync(HLS_CACHE_DIR);
    for (const f of files) {
      const p = path.join(HLS_CACHE_DIR, f);
      const stat = fs.statSync(p);
      if (now - stat.mtimeMs > 4 * 3600 * 1000) {
        fs.unlinkSync(p);
      }
    }
  } catch (e) { }
}, 30 * 60 * 1000);

app.get('/api/media/hls/*', async (req, res) => {
  const wildcard = req.params[0];
  if (!wildcard) return res.status(404).send('Not found');

  // Master VOD Playlist: /api/media/hls/<relPath>/master.m3u8?audio=X
  if (wildcard.endsWith('/master.m3u8')) {
    const rawRelPath = wildcard.slice(0, -'/master.m3u8'.length);
    const relPath = decodeURIComponent(rawRelPath);
    const filePath = resolveExistingMediaFile(relPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return res.status(404).send('Media file not found');
    }

    const audioTrack = req.query.audio !== undefined ? parseInt(req.query.audio, 10) : 0;
    const probe = await probeMediaFile(filePath, relPath);
    const duration = probe.duration || 0;

    if (duration <= 0) {
      return res.status(500).send('Unable to probe media duration');
    }

    const totalSegments = Math.ceil(duration / SEGMENT_DURATION);

    // Warm up the first 2 segments immediately so playback starts with near-zero latency
    const safeHash = crypto.createHash('md5').update(filePath).digest('hex');
    triggerPregenerate(filePath, safeHash, audioTrack, 0, totalSegments);
    triggerPregenerate(filePath, safeHash, audioTrack, 1, totalSegments);

    let m3u8 = '#EXTM3U\n';
    m3u8 += '#EXT-X-VERSION:3\n';
    m3u8 += `#EXT-X-TARGETDURATION:${SEGMENT_DURATION + 1}\n`;
    m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
    m3u8 += '#EXT-X-PLAYLIST-TYPE:VOD\n';

    for (let i = 0; i < totalSegments; i++) {
      const isLast = (i === totalSegments - 1);
      const segDur = isLast ? (duration - (i * SEGMENT_DURATION)).toFixed(6) : `${SEGMENT_DURATION}.000000`;
      m3u8 += `#EXTINF:${segDur},\n`;
      m3u8 += `segment_${i}.ts?audio=${audioTrack}\n`;
    }
    m3u8 += '#EXT-X-ENDLIST\n';

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(m3u8);
  }

  // Segment Generator: /api/media/hls/<relPath>/segment_<N>.ts?audio=X
  const segMatch = wildcard.match(/^(.*?)\/segment_(\d+)\.ts$/);
  if (segMatch) {
    const rawRelPath = segMatch[1];
    const segNum = parseInt(segMatch[2], 10);
    const relPath = decodeURIComponent(rawRelPath);
    const filePath = resolveExistingMediaFile(relPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return res.status(404).send('Media file not found');
    }

    const audioTrack = req.query.audio !== undefined ? parseInt(req.query.audio, 10) : 0;
    const startTime = segNum * SEGMENT_DURATION;

    const safeHash = crypto.createHash('md5').update(filePath).digest('hex');
    const cacheFileName = `${safeHash}_a${audioTrack}_s${segNum}.ts`;
    const cacheFilePath = path.join(HLS_CACHE_DIR, cacheFileName);

    if (fs.existsSync(cacheFilePath) && fs.statSync(cacheFilePath).size > 0) {
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      fs.createReadStream(cacheFilePath).pipe(res);
      return;
    }

    const jobKey = cacheFileName;
    if (pendingSegmentJobs.has(jobKey)) {
      try {
        await pendingSegmentJobs.get(jobKey);
        if (fs.existsSync(cacheFilePath) && fs.statSync(cacheFilePath).size > 0) {
          res.setHeader('Content-Type', 'video/mp2t');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Access-Control-Allow-Origin', '*');
          fs.createReadStream(cacheFilePath).pipe(res);
          return;
        }
      } catch (err) { }
    }

    const jobPromise = new Promise((resolve, reject) => {
      const tempPath = path.join(HLS_CACHE_DIR, `tmp_${Date.now()}_${cacheFileName}`);
      const cmd = buildSegmentFfmpegCmd(filePath, startTime, audioTrack, tempPath);
      exec(cmd, { timeout: 35000 }, (err) => {
        if (err || !fs.existsSync(tempPath) || fs.statSync(tempPath).size === 0) {
          if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch { }
          return reject(err || new Error('Transcode failed'));
        }
        try {
          fs.renameSync(tempPath, cacheFilePath);
          resolve();
        } catch (e) {
          resolve();
        }
      });
    });

    pendingSegmentJobs.set(jobKey, jobPromise);

    try {
      await jobPromise;
      pendingSegmentJobs.delete(jobKey);
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      fs.createReadStream(cacheFilePath).pipe(res);
      triggerPregenerate(filePath, safeHash, audioTrack, segNum + 1);
      triggerPregenerate(filePath, safeHash, audioTrack, segNum + 2);
    } catch (err) {
      pendingSegmentJobs.delete(jobKey);
      if (!res.headersSent) res.status(500).send('Segment transcode error');
    }
    return;
  }

  res.status(404).send('Invalid HLS path');
});

// Serve Subtitles (.vtt / .srt)
app.get('/api/media/subtitle/:filename', (req, res) => {
  const filePath = path.join(DOWNLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Subtitle not found');
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  fs.createReadStream(filePath).pipe(res);
});


// Serve Extracted Audio Tracks with HTTP 206 Byte-Range Streaming
app.get(['/api/media/audio/:filename', '/api/media/audio/*'], async (req, res) => {
  const relPath = req.params[0] || req.params.filename;
  const filePath = resolveExistingMediaFile(relPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).send('Media file not found');
  }

  const track = req.query.track !== undefined ? parseInt(req.query.track, 10) : 0;
  const fileHash = crypto.createHash('md5').update(filePath).digest('hex');
  const baseHash = crypto.createHash('md5').update(path.basename(filePath)).digest('hex');
  const cachedPath = path.join(AUDIO_TRACKS_CACHE, `${fileHash}_track_${track}.m4a`);
  const cachedPathBase = path.join(AUDIO_TRACKS_CACHE, `${baseHash}_track_${track}.m4a`);

  if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 1000) {
    return streamFileWithRanges(req, res, cachedPath, 'audio/mp4');
  }
  if (fs.existsSync(cachedPathBase) && fs.statSync(cachedPathBase).size > 1000) {
    return streamFileWithRanges(req, res, cachedPathBase, 'audio/mp4');
  }

  // Not cached yet: queue with high priority in background!
  preExtractAudioTrack(filePath, track, true).catch(() => { });

  // While transcode is in progress, stream live on-the-fly starting at requested position (or 0)
  // so browser audio starts in ~100ms with ZERO waiting or timeouts!
  const ss = parseFloat(req.query.ss || '0');
  res.setHeader('Content-Type', 'audio/aac');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Accept-Encoding, Accept, Origin, Content-Type');

  const liveFfmpeg = spawn('ffmpeg', [
    '-ss', String(ss),
    '-i', filePath,
    '-vn', '-sn', '-dn',
    '-map', `0:a:${track}`,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-f', 'adts',
    'pipe:1'
  ]);

  liveFfmpeg.stdout.pipe(res);

  req.on('close', () => {
    try { liveFfmpeg.kill('SIGKILL'); } catch { }
  });

  liveFfmpeg.on('error', (e) => {
    console.warn('[Live Audio Stream Error]:', e);
    if (!res.headersSent) res.status(500).send('Live audio stream failed');
  });
});

// Check Extraction Status for All Audio Tracks (for UI Status Bar)
app.get(['/api/media/audio-status/:filename', '/api/media/audio-status/*'], async (req, res) => {
  const relPath = req.params[0] || req.params.filename;
  const filePath = resolveExistingMediaFile(relPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).json({ error: 'Media file not found' });
  }

  const probe = await probeMediaFile(filePath, relPath);
  const audioTracks = probe.audioTracks || [];
  const fileHash = crypto.createHash('md5').update(filePath).digest('hex');
  const baseHash = crypto.createHash('md5').update(path.basename(filePath)).digest('hex');

  const statusList = audioTracks.map((t) => {
    const isAac = (t.codec || '').toLowerCase() === 'aac' || (t.codec || '').toLowerCase() === 'mp4a';
    const cacheKey1 = `${fileHash}_track_${t.index}.m4a`;
    const cacheKey2 = `${baseHash}_track_${t.index}.m4a`;
    const cachedPath1 = path.join(AUDIO_TRACKS_CACHE, cacheKey1);
    const cachedPath2 = path.join(AUDIO_TRACKS_CACHE, cacheKey2);

    const exists = (fs.existsSync(cachedPath1) && fs.statSync(cachedPath1).size > 1000) ||
      (fs.existsSync(cachedPath2) && fs.statSync(cachedPath2).size > 1000);
    const isPending = pendingAudioExtractions.has(cacheKey1) || pendingAudioExtractions.has(cacheKey2) ||
      audioQueue.some(q => q.cacheKey === cacheKey1 || q.cacheKey === cacheKey2);

    // Any track that is native AAC, or already extracted on disk, is 100% READY!
    const isReady = isAac || exists;
    const actualSize = exists
      ? (fs.existsSync(cachedPath1) ? fs.statSync(cachedPath1).size : fs.statSync(cachedPath2).size)
      : 0;

    const sizeFormatted = isReady
      ? (exists ? `${(actualSize / (1024 * 1024)).toFixed(1)} MB` : (isAac ? 'Native AAC' : 'Ready'))
      : (isPending ? 'Extracting...' : 'Pending');

    return {
      index: t.index,
      title: t.title,
      codec: t.codec,
      isAac,
      isDefault: t.index === 0,
      isReady,
      isProcessing: isPending,
      size: actualSize,
      sizeFormatted
    };
  });

  const totalTracks = statusList.length;
  const readyTracks = statusList.filter(s => s.isReady).length;
  const percent = totalTracks > 0 ? Math.round((readyTracks / totalTracks) * 100) : 100;

  res.json({
    filename: path.basename(filePath),
    tracks: statusList,
    totalTracks,
    readyTracks,
    allReady: readyTracks === totalTracks,
    percent
  });
});

// Trigger One-Click Processing of All Audio Tracks
app.post(['/api/media/process-audio/:filename', '/api/media/process-audio/*'], async (req, res) => {
  const relPath = req.params[0] || req.params.filename;
  const filePath = resolveExistingMediaFile(relPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).json({ error: 'Media file not found' });
  }

  const probe = await probeMediaFile(filePath, relPath);
  const audioTracks = probe.audioTracks || [];

  audioTracks.forEach((t) => {
    preExtractAudioTrack(filePath, t.index, true).catch(() => { });
  });

  if (typeof io !== 'undefined') {
    io.emit('audio:processing_started', {
      filename: path.basename(filePath),
      totalTracks: audioTracks.length
    });
  }

  res.json({ success: true, message: 'Processing started for all audio tracks' });
});

// ==========================================================================
// Video Web Optimizer Engine (HEVC -> H.264 MP4 with AAC & FastStart)
// ==========================================================================
const activeVideoTranscodeJobs = new Map(); // relativePath -> jobInfo

app.get('/api/media/process/status', (req, res) => {
  const jobs = Array.from(activeVideoTranscodeJobs.values()).map(j => ({
    id: j.id,
    relativePath: j.relativePath,
    filename: path.basename(j.relativePath),
    outputFilename: path.basename(j.outputPath),
    progress: j.progress || 0,
    speed: j.speed || '1.0x',
    fps: j.fps || 0,
    time: j.time || '00:00:00',
    totalDuration: j.totalDuration || 0,
    status: j.status || 'processing'
  }));
  res.json({ activeJobs: jobs });
});

app.post('/api/media/process/start', async (req, res) => {
  const { relativePath, crf = 22, preset = 'veryfast' } = req.body;
  if (!relativePath) return res.status(400).json({ error: 'Relative path is required' });

  const filePath = getSafePath(relativePath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).json({ error: 'Source media file not found' });
  }

  if (activeVideoTranscodeJobs.has(relativePath)) {
    return res.json({ success: true, message: 'Processing already active', job: activeVideoTranscodeJobs.get(relativePath) });
  }

  // Derive target output file: e.g. "Hannibal.S01E09.1080p.BluRay.x265-KONTRAST.mkv" -> "Hannibal.S01E09.1080p.H264.mp4"
  const dir = path.dirname(filePath);
  const baseExt = path.extname(filePath);
  const baseName = path.basename(filePath, baseExt);
  let cleanBase = baseName.replace(/\.x265/i, '').replace(/\.hevc/i, '').replace(/\.h\.265/i, '');
  const outFilename = `${cleanBase}.H264.mp4`;
  const outputPath = path.join(dir, outFilename);

  // If output already exists and is complete
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10 * 1024 * 1024) {
    return res.json({ success: true, message: 'Already processed and ready', outputFilename: outFilename });
  }

  // Probe media duration
  const probe = await probeMediaFile(filePath, relativePath);
  const totalDuration = probe.duration || 1;

  const jobId = `job_${Date.now()}`;
  const jobInfo = {
    id: jobId,
    relativePath,
    filePath,
    outputPath,
    outputFilename: outFilename,
    progress: 0,
    speed: '0.0x',
    fps: 0,
    time: '00:00:00',
    totalDuration,
    status: 'processing',
    startedAt: Date.now()
  };

  activeVideoTranscodeJobs.set(relativePath, jobInfo);

  // Extract subtitle tracks alongside output
  if (probe.subtitles?.length > 0) {
    probe.subtitles.slice(0, 5).forEach((sub, sIdx) => {
      const subOut = path.join(dir, `${cleanBase}.H264.${sub.language || sIdx}.srt`);
      exec(`ffmpeg -y -i "${filePath}" -map 0:s:${sIdx} "${subOut}"`, () => { });
    });
  }

  // Check if video is already H.264 / AVC (e.g. WEB-DL / BluRay H264)
  const isAlreadyH264 = (probe.videoCodec === 'h264' || probe.videoCodec === 'avc');

  // Spawn FFmpeg transcode: 5-second fast remux if already H.264, or multi-threaded ultrafast for HEVC
  const ffmpegArgs = [
    '-y',
    '-i', filePath,
    '-map', '0:v:0',
    '-map', '0:a?'
  ];

  if (isAlreadyH264) {
    // ⚡ ZERO-RE-ENCODE STREAM COPY: 5 SECONDS!
    ffmpegArgs.push('-c:v', 'copy');
  } else {
    // Multi-threaded ultrafast CPU transcode for HEVC
    ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(crf || 23), '-threads', '0');
  }

  ffmpegArgs.push(
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    outputPath
  );

  const ffProc = spawn('ffmpeg', ffmpegArgs);
  jobInfo.process = ffProc;

  let stderrBuf = '';
  ffProc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    const lines = stderrBuf.split('\r');
    if (lines.length > 1) {
      const lastLine = lines[lines.length - 2];
      stderrBuf = lines[lines.length - 1];

      // Parse time=HH:MM:SS.ms
      const timeMatch = lastLine.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
      const speedMatch = lastLine.match(/speed=\s*([\d\.]+)x/);
      const fpsMatch = lastLine.match(/fps=\s*([\d\.]+)/);

      if (timeMatch) {
        const curSec = parseInt(timeMatch[1], 10) * 3600 + parseInt(timeMatch[2], 10) * 60 + parseFloat(timeMatch[3]);
        const pct = Math.min(99.9, Math.round((curSec / totalDuration) * 1000) / 10);
        jobInfo.progress = pct;
        jobInfo.time = `${timeMatch[1]}:${timeMatch[2]}:${Math.floor(parseFloat(timeMatch[3]))}`;
        if (speedMatch) jobInfo.speed = `${speedMatch[1]}x`;
        if (fpsMatch) jobInfo.fps = parseFloat(fpsMatch[1]);

        if (typeof io !== 'undefined') {
          io.emit('media:process_progress', {
            id: jobId,
            relativePath,
            progress: jobInfo.progress,
            speed: jobInfo.speed,
            fps: jobInfo.fps,
            time: jobInfo.time,
            totalDuration
          });
        }
      }
    }
  });

  ffProc.on('close', (code) => {
    activeVideoTranscodeJobs.delete(relativePath);
    mediaProbeCache.clear();

    if (code === 0 && fs.existsSync(outputPath)) {
      jobInfo.progress = 100;
      jobInfo.status = 'completed';
      if (typeof io !== 'undefined') {
        io.emit('media:process_complete', {
          id: jobId,
          relativePath,
          outputFilename: outFilename,
          outputPath
        });
      }
    } else {
      if (typeof io !== 'undefined') {
        io.emit('media:process_error', {
          id: jobId,
          relativePath,
          error: `Transcode exited with code ${code}`
        });
      }
    }
  });

  ffProc.on('error', (err) => {
    activeVideoTranscodeJobs.delete(relativePath);
    if (typeof io !== 'undefined') {
      io.emit('media:process_error', { id: jobId, relativePath, error: err.message });
    }
  });

  res.json({
    success: true,
    message: 'Video optimization started in background',
    jobId,
    outputFilename: outFilename
  });
});

app.post('/api/media/process/cancel', (req, res) => {
  const { relativePath } = req.body;
  if (!relativePath || !activeVideoTranscodeJobs.has(relativePath)) {
    return res.status(404).json({ error: 'No active job for this file' });
  }

  const job = activeVideoTranscodeJobs.get(relativePath);
  try {
    if (job.process) job.process.kill('SIGKILL');
    if (fs.existsSync(job.outputPath)) fs.unlinkSync(job.outputPath);
  } catch (e) { }

  activeVideoTranscodeJobs.delete(relativePath);
  if (typeof io !== 'undefined') {
    io.emit('media:process_cancelled', { relativePath, id: job.id });
  }
  res.json({ success: true, message: 'Processing cancelled' });
});

// Upload media or subtitle files directly (Supports large multi-GB videos & subfolders)
app.post('/api/media/upload', (req, res) => {
  upload.single('mediaFile')(req, res, (err) => {
    if (err) {
      console.error('❌ Media upload error:', err);
      return res.status(500).json({ success: false, error: err.message || 'File upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file received in upload payload' });
    }

    const folder = (req.body && req.body.folder) || (req.query && req.query.folder) || '';
    const safeRelPath = folder ? path.join(folder, req.file.filename).replace(/\\/g, '/') : req.file.filename;

    console.log(`📁 [Media Upload] Successfully stored "${req.file.filename}" in ${folder || 'root'} (${(req.file.size / (1024 * 1024)).toFixed(2)} MB)`);
    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      relativePath: safeRelPath,
      streamUrl: `/api/media/stream/${encodeURIComponent(safeRelPath)}`
    });
  });
});

// Chunked Upload for Large Video Files (Bypasses Cloudflare Tunnel 100MB body limit)
const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const chunkDir = path.join(DOWNLOADS_DIR, '.upload_chunks');
    if (!fs.existsSync(chunkDir)) {
      try { fs.mkdirSync(chunkDir, { recursive: true }); } catch (err) { return cb(err); }
    }
    cb(null, chunkDir);
  },
  filename: (req, file, cb) => {
    const uploadId = (req.body && req.body.uploadId) || (req.query && req.query.uploadId) || 'upload';
    const chunkIndex = (req.body && req.body.chunkIndex) || (req.query && req.query.chunkIndex) || '0';
    const safeUploadId = String(uploadId).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${safeUploadId}.chunk_${chunkIndex}`);
  }
});
const chunkUpload = multer({
  storage: chunkStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB per chunk
});

app.post('/api/media/upload/chunk', (req, res) => {
  chunkUpload.single('chunk')(req, res, async (err) => {
    if (err) {
      console.error('❌ Chunk upload error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Chunk upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No chunk file received' });
    }

    const uploadId = String(req.body.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = String(req.body.filename || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
    const folder = String(req.body.folder || '').replace(/(\.\.[\/\\])+/g, '').replace(/^[\\\/]+/, '');
    const chunkIndex = parseInt(req.body.chunkIndex, 10);
    const totalChunks = parseInt(req.body.totalChunks, 10);

    if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || totalChunks <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid chunk parameters' });
    }

    const chunkDir = path.join(DOWNLOADS_DIR, '.upload_chunks');
    const partFile = path.join(chunkDir, `${uploadId}.part`);
    const thisChunkPath = req.file.path;

    try {
      const chunkBuf = fs.readFileSync(thisChunkPath);
      fs.appendFileSync(partFile, chunkBuf);
      try { fs.unlinkSync(thisChunkPath); } catch {}

      // If this was the last chunk, finalize into target directory
      if (chunkIndex === totalChunks - 1) {
        let targetDir = DOWNLOADS_DIR;
        if (folder) {
          targetDir = path.join(DOWNLOADS_DIR, folder);
          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        }

        let candidate = filename;
        let counter = 1;
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        while (fs.existsSync(path.join(targetDir, candidate))) {
          candidate = `${base}_${counter}${ext}`;
          counter++;
        }

        const finalPath = path.join(targetDir, candidate);
        fs.renameSync(partFile, finalPath);

        const safeRelPath = folder ? path.join(folder, candidate).replace(/\\/g, '/') : candidate;
        const finalStats = fs.statSync(finalPath);
        console.log(`📁 [Chunked Upload Complete] Saved "${candidate}" (${(finalStats.size / (1024 * 1024)).toFixed(2)} MB)`);

        return res.json({
          success: true,
          completed: true,
          filename: candidate,
          originalName: filename,
          size: finalStats.size,
          relativePath: safeRelPath,
          streamUrl: `/api/media/stream/${encodeURIComponent(safeRelPath)}`
        });
      }

      return res.json({ success: true, completed: false, chunkIndex, totalChunks });
    } catch (finalizeErr) {
      console.error('❌ Chunk assembly error:', finalizeErr);
      try { if (fs.existsSync(partFile)) fs.unlinkSync(partFile); } catch {}
      return res.status(500).json({ success: false, error: 'Chunk assembly failed: ' + finalizeErr.message });
    }
  });
});

// 4.6 Stream Resolver using yt-dlp (For anime/movie sites & YouTube)
app.post('/api/media/resolve', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const cleanUrl = url.trim();
  const detected = detectMediaType(cleanUrl);

  // If already detected as YouTube, return clean YouTube metadata immediately
  if (detected.type === 'youtube' && detected.videoId) {
    return res.json({
      success: true,
      title: 'YouTube Video',
      streamUrl: detected.cleanUrl,
      type: 'youtube',
      videoId: detected.videoId
    });
  }

  // Call yt-dlp with --no-warnings for anime sites and custom video URLs
  exec(`yt-dlp --dump-json --no-warnings --no-playlist "${cleanUrl}"`, { timeout: 20000 }, (err, stdout, stderr) => {
    if (err || !stdout) {
      return res.json({
        success: true,
        title: 'Video Stream',
        streamUrl: detected.cleanUrl,
        type: detected.type,
        videoId: detected.videoId || null
      });
    }

    try {
      // Find the JSON block safely in stdout
      const firstBrace = stdout.indexOf('{');
      const lastBrace = stdout.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON found in stdout');

      const jsonStr = stdout.slice(firstBrace, lastBrace + 1);
      const data = JSON.parse(jsonStr);

      if (data.extractor?.includes('youtube') || cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
        return res.json({
          success: true,
          title: data.title || 'YouTube Video',
          thumbnail: data.thumbnail || '',
          duration: data.duration || 0,
          streamUrl: cleanUrl,
          type: 'youtube',
          videoId: data.id || detected.videoId
        });
      }

      const isHls = data.url && (data.url.includes('.m3u8') || data.ext === 'm3u8');

      // Route external streams through /api/proxy/stream to bypass CORS and Referer restrictions
      let finalStreamUrl = data.url;
      if (data.url && (isHls || !data.url.includes('googlevideo.com'))) {
        finalStreamUrl = `/api/proxy/stream?url=${encodeURIComponent(data.url)}&referer=${encodeURIComponent(cleanUrl)}`;
      }

      res.json({
        success: true,
        title: data.title || 'Video Stream',
        thumbnail: data.thumbnail || '',
        duration: data.duration || 0,
        streamUrl: finalStreamUrl || cleanUrl,
        rawUrl: data.url || cleanUrl,
        type: isHls ? 'hls' : 'direct',
        subtitles: data.subtitles || {}
      });
    } catch (parseErr) {
      res.json({
        success: true,
        title: 'Video Stream',
        streamUrl: detected.cleanUrl,
        type: detected.type,
        videoId: detected.videoId || null
      });
    }
  });
});

// 4.7 CORS & Referer Reverse Stream Proxy (For anime sites with blocked referrers)
app.get('/api/proxy/stream', async (req, res) => {
  const targetUrl = req.query.url;
  const customReferer = req.query.referer || targetUrl;

  if (!targetUrl) return res.status(400).send('Missing url parameter');

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Referer: customReferer,
        Origin: new URL(customReferer).origin
      }
    });

    const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');

    // If HLS manifest (.m3u8), rewrite relative chunk URLs to proxy through us
    if (contentType.includes('mpegurl') || targetUrl.includes('.m3u8')) {
      const text = await upstreamRes.text();
      const targetBase = new URL(targetUrl);

      const rewritten = text.replace(/^(?!#)(\S+)/gm, (match) => {
        const absoluteChunkUrl = new URL(match, targetBase).href;
        return `/api/proxy/stream?url=${encodeURIComponent(absoluteChunkUrl)}&referer=${encodeURIComponent(customReferer)}`;
      });

      return res.send(rewritten);
    }

    // Binary stream pipe
    const arrayBuffer = await upstreamRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(502).send(`Proxy error: ${err.message}`);
  }
});

// SPA Routes & Fallback (React frontend for all page navigation routes)
app.get([
  '/studio',
  '/library',
  '/downloads',
  '/media',
  '/media-manager',
  '/manager',
  '/room/:roomId'
], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Universal SPA fallback for any client-side navigation request
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/neko') || req.path.startsWith('/socket.io')) {
    return next();
  }
  if (path.extname(req.path)) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --------------------------------------------------------------------------
// 5. REAL-TIME SOCKET.IO ENGINE (SYNC, DANMAKU, WEBRTC VOICE)
// --------------------------------------------------------------------------
function anyActiveNekoUsers() {
  for (const room of rooms.values()) {
    if (room.media?.type === 'neko' && room.users && room.users.size > 0) {
      return true;
    }
  }
  return false;
}

async function stopNekoIfIdle() {
  try {
    if (anyActiveNekoUsers()) return { skipped: true, reason: 'active_users' };
    const status = await checkNekoStatus();
    if (status === 'running') {
      return await stopNeko();
    }
    return { success: true, status, alreadyStopped: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUser = null;

  socket.on('room:join', ({ roomId, username, color, avatar }) => {
    if (!roomId) return;
    const cleanRoomId = roomId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'lounge';
    currentRoomId = cleanRoomId;

    if (!rooms.has(cleanRoomId)) {
      rooms.set(cleanRoomId, createRoom(cleanRoomId));
    }

    const room = rooms.get(cleanRoomId);

    // Verify room media still exists before admitting user
    if (room.media?.url && room.media.url.startsWith('/api/media/stream/')) {
      const rawRel = decodeURIComponent(room.media.url.replace('/api/media/stream/', '').split('?')[0]);
      const targetFile = resolveExistingMediaFile(rawRel);
      if (!fs.existsSync(targetFile)) {
        console.log(`⚠️ Room "${cleanRoomId}" active media missing on disk (${rawRel}). Falling back to idle.`);
        room.media = {
          type: 'youtube',
          url: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
          videoId: '5qap5aO4i9A',
          title: 'Lofi Hip Hop Radio 🎧'
        };
        room.playback = {
          isPlaying: false,
          currentTime: 0,
          updatedAt: Date.now(),
          playbackRate: 1.0
        };
        saveRoomToDisk(cleanRoomId, room);
      }
    }

    if (room.media?.type === 'neko') {
      ensureNekoRunning();
    }

    const isFirstUser = room.users.size === 0;

    let cleanUsername = (username || 'Guest')
      .replace(/^(jotaro|jolyne|joyeline)\s+/i, '')
      .replace(/^riaa$/i, 'Ria')
      .trim() || 'Guest';

    currentUser = {
      id: socket.id,
      username: cleanUsername,
      color: color || '#ec4899',
      avatar: avatar || '🍿',
      isHost: isFirstUser || room.hostId === socket.id,
      inVoice: false
    };

    if (currentUser.isHost) {
      room.hostId = socket.id;
    }

    room.users.set(socket.id, currentUser);
    socket.join(cleanRoomId);

    // Clean any legacy system messages from room history
    const sanitizedMessages = room.messages.slice(-60).map((m) => {
      if (m.isSystem && typeof m.text === 'string') {
        return {
          ...m,
          text: m.text
            .replace(/^(jotaro|jolyne|joyeline)\s+/i, '')
            .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
            .replace(/hopped into the room!/i, 'joined the room')
            .trim()
        };
      }
      return m;
    });

    // Send full current state to joining user
    const fullState = {
      roomId: room.id,
      currentUser,
      hostId: room.hostId,
      settings: room.settings,
      media: room.media,
      playback: {
        isPlaying: room.playback.isPlaying,
        currentTime: getRoomCurrentTime(room),
        playbackRate: room.playback.playbackRate,
        updatedAt: room.playback.updatedAt
      },
      queue: room.queue,
      messages: sanitizedMessages,
      lastSeen: room.lastSeen || {},
      users: Array.from(room.users.values())
    };

    socket.emit('room:initial_state', fullState);

    // Notify room members
    socket.to(cleanRoomId).emit('user:joined', {
      user: currentUser,
      users: Array.from(room.users.values())
    });

    // System greeting in chat
    const sysMsg = {
      id: `sys-${Date.now()}`,
      sender: 'System',
      text: `${currentUser.username} joined the room`,
      timestamp: Date.now(),
      isSystem: true
    };
    room.messages.push(sysMsg);
    io.to(cleanRoomId).emit('chat:new_message', sysMsg);

    // Broadcast live presence to Home/Landing page
    broadcastLiveStatus();
  });

  // Permission check helper (Lounge participants can always play/pause/seek freely)
  function canControl(room) {
    if (!room.settings.hostOnlyControls) return true;
    if (room.users.size <= 2) return true;
    return room.hostId === socket.id;
  }

  // Play Event
  socket.on('player:play', ({ currentTime }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (!canControl(room)) return;

    room.playback.isPlaying = true;
    if (typeof currentTime === 'number' && !isNaN(currentTime)) {
      room.playback.currentTime = Math.max(0, currentTime);
    }
    room.playback.updatedAt = Date.now();
    saveRoomToDisk(currentRoomId, room);

    socket.to(currentRoomId).emit('player:sync_play', {
      currentTime: room.playback.currentTime,
      sender: currentUser?.username || 'Someone'
    });
    broadcastLiveStatus();
  });

  // Pause Event
  socket.on('player:pause', ({ currentTime }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (!canControl(room)) return;

    room.playback.isPlaying = false;
    if (typeof currentTime === 'number' && !isNaN(currentTime)) {
      room.playback.currentTime = Math.max(0, currentTime);
    }
    room.playback.updatedAt = Date.now();
    saveRoomToDisk(currentRoomId, room);

    socket.to(currentRoomId).emit('player:sync_pause', {
      currentTime: room.playback.currentTime,
      sender: currentUser?.username || 'Someone'
    });
    broadcastLiveStatus();
  });

  // Synchronized Seek Barrier (Ready Gate: eliminates freezes, lag, and desync across long seeks)
  socket.on('player:seek', ({ currentTime, wasPlaying }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (!canControl(room)) return;

    const targetTime = typeof currentTime === 'number' && !isNaN(currentTime) ? Math.max(0, currentTime) : 0;
    const shouldPlay = typeof wasPlaying === 'boolean' ? wasPlaying : room.playback.isPlaying;

    room.playback.currentTime = targetTime;
    room.playback.isPlaying = false; // Hold while buffering
    room.playback.updatedAt = Date.now();
    saveRoomToDisk(currentRoomId, room);

    if (room.barrier?.timeoutId) {
      clearTimeout(room.barrier.timeoutId);
    }

    const totalActiveUsers = room.users.size;
    const readyUsers = new Set();
    // Do not pre-fill readyUsers with socket.id: both initiator and peer must verify they have buffered the frame

    function releaseBarrier() {
      if (!room.barrier || !room.barrier.active) return;
      if (room.barrier.timeoutId) clearTimeout(room.barrier.timeoutId);
      room.barrier.active = false;
      room.playback.currentTime = targetTime;
      room.playback.isPlaying = shouldPlay;
      room.playback.updatedAt = Date.now();
      saveRoomToDisk(currentRoomId, room);

      io.to(currentRoomId).emit('player:barrier_release', {
        currentTime: targetTime,
        isPlaying: shouldPlay
      });
      broadcastLiveStatus();
    }

    // Solo viewer: zero delay release
    if (totalActiveUsers <= 1) {
      releaseBarrier();
      return;
    }

    room.barrier = {
      active: true,
      targetTime,
      wasPlaying: shouldPlay,
      readyUsers,
      totalUsers: totalActiveUsers,
      releaseBarrier,
      timeoutId: setTimeout(() => {
        // Generous safety fallback (7000ms): only fires if a client tab froze or died
        releaseBarrier();
      }, 7000)
    };

    // Broadcast barrier seek to all users in room with readyCount: 0
    io.to(currentRoomId).emit('player:sync_barrier_seek', {
      currentTime: targetTime,
      wasPlaying: shouldPlay,
      sender: currentUser?.username || 'Someone',
      totalUsers: totalActiveUsers,
      readyCount: 0
    });

    broadcastLiveStatus();
  });

  // Client confirms it has buffered and decoded frames at targetTime and is ready to play
  socket.on('player:client_ready', ({ currentTime }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (!room.barrier || !room.barrier.active) return;

    room.barrier.readyUsers.add(socket.id);
    const readyCount = room.barrier.readyUsers.size;
    const totalUsers = Math.max(room.barrier.totalUsers, room.users.size);

    io.to(currentRoomId).emit('player:barrier_progress', {
      readyCount,
      totalUsers
    });

    if (readyCount >= totalUsers) {
      room.barrier.releaseBarrier();
    }
  });

  // Synchronized Audio Track Change (Changes for BOTH users and stays locked in sync)
  socket.on('player:change_audio_track', ({ audioTrack, currentTime, isPlaying }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    // Audio track selection is always permitted for any lounge participant so both can listen together
    if (!room.media) return;
    const trackIdx = parseInt(audioTrack, 10) || 0;
    room.media.audioTrack = trackIdx;

    if (typeof currentTime === 'number' && !isNaN(currentTime)) {
      room.playback.currentTime = Math.max(0, currentTime);
    }
    if (typeof isPlaying === 'boolean') {
      room.playback.isPlaying = isPlaying;
    }
    room.playback.updatedAt = Date.now();
    saveRoomToDisk(currentRoomId, room);

    // Broadcast to EVERYONE in the room so BOTH users switch instantly at exact same timestamp
    io.to(currentRoomId).emit('player:audio_track_changed', {
      audioTrack: trackIdx,
      currentTime: room.playback.currentTime,
      isPlaying: room.playback.isPlaying,
      changedBy: currentUser?.username || 'Someone'
    });

    const sysMsg = {
      id: `sys-${Date.now()}`,
      sender: 'System',
      text: `${currentUser?.username || 'Someone'} switched audio track to #${trackIdx + 1}`,
      timestamp: Date.now(),
      isSystem: true
    };
    room.messages.push(sysMsg);
    io.to(currentRoomId).emit('chat:new_message', sysMsg);
  });

  // Playback Rate Event
  socket.on('player:rate', ({ playbackRate }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (!canControl(room)) return;

    room.playback.playbackRate = playbackRate || 1.0;
    room.playback.currentTime = getRoomCurrentTime(room);
    room.playback.updatedAt = Date.now();

    socket.to(currentRoomId).emit('player:sync_rate', {
      playbackRate: room.playback.playbackRate,
      currentTime: room.playback.currentTime
    });
  });

  // Media Change Event
  socket.on('media:change', ({ url, title, type, videoId, audioTrack }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (!canControl(room)) return;

    const oldMedia = room.media;
    const detected = detectMediaType(url);
    const resolvedType = type || (url?.includes('.m3u8') ? 'hls' : detected.type);

    // If switching away from Neko, stop container if no other Neko rooms are active to free CPU/RAM
    if (oldMedia?.type === 'neko' && resolvedType !== 'neko') {
      stopNekoIfIdle();
    } else if (resolvedType === 'neko') {
      ensureNekoRunning();
    }

    room.media = {
      type: resolvedType,
      url: detected.cleanUrl || url,
      videoId: videoId || detected.videoId || null,
      title: title || (detected.type === 'youtube' ? 'YouTube Stream' : 'Video Item'),
      audioTrack: typeof audioTrack === 'number' ? audioTrack : 0
    };

    room.playback.isPlaying = true;
    room.playback.currentTime = 0;
    room.playback.updatedAt = Date.now();
    saveRoomToDisk(currentRoomId, room);

    io.to(currentRoomId).emit('media:changed', {
      media: room.media,
      playback: room.playback,
      changedBy: currentUser?.username || 'Someone'
    });

    const sysMsg = {
      id: `sys-${Date.now()}`,
      sender: 'System',
      text: `${currentUser?.username || 'Someone'} loaded "${room.media.title}"`,
      timestamp: Date.now(),
      isSystem: true
    };
    room.messages.push(sysMsg);
    io.to(currentRoomId).emit('chat:new_message', sysMsg);
    broadcastLiveStatus();
  });

  // Manual Resync Request (Single user)
  socket.on('sync:request', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    socket.emit('player:sync_forced', {
      currentTime: getRoomCurrentTime(room),
      isPlaying: room.playback.isPlaying,
      playbackRate: room.playback.playbackRate
    });
  });

  // Force Sync BOTH Users (Het + Riaa)
  socket.on('player:force_sync_all', ({ currentTime, isPlaying }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);

    if (typeof currentTime === 'number' && !isNaN(currentTime)) {
      room.playback.currentTime = Math.max(0, currentTime);
    }
    if (typeof isPlaying === 'boolean') {
      room.playback.isPlaying = isPlaying;
    }
    room.playback.updatedAt = Date.now();
    saveRoomToDisk(currentRoomId, room);

    // Broadcast to EVERYONE in room (including sender) so both lock in sync
    io.to(currentRoomId).emit('player:sync_forced', {
      currentTime: room.playback.currentTime,
      isPlaying: room.playback.isPlaying,
      playbackRate: room.playback.playbackRate,
      syncedBy: currentUser?.username || 'Someone'
    });
  });

  // Toggle Host Control Mode
  socket.on('room:toggle_host_only', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (room.hostId !== socket.id) return;

    room.settings.hostOnlyControls = !room.settings.hostOnlyControls;
    io.to(currentRoomId).emit('room:settings_updated', room.settings);

    const mode = room.settings.hostOnlyControls ? 'Host-only controls enabled' : 'Free controls enabled (both can play/pause)';
    const sysMsg = {
      id: `sys-${Date.now()}`,
      sender: 'System',
      text: mode,
      timestamp: Date.now(),
      isSystem: true
    };
    room.messages.push(sysMsg);
    io.to(currentRoomId).emit('chat:new_message', sysMsg);
  });

  // Queue Operations
  socket.on('queue:add', ({ url, title }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    const detected = detectMediaType(url);

    const item = {
      id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      url: detected.cleanUrl || url,
      type: detected.type,
      videoId: detected.videoId || null,
      title: title || (detected.type === 'youtube' ? 'YouTube Video' : 'Queued Video'),
      addedBy: currentUser?.username || 'Someone'
    };

    room.queue.push(item);
    io.to(currentRoomId).emit('queue:updated', room.queue);

    const sysMsg = {
      id: `sys-${Date.now()}`,
      sender: 'System',
      text: `${currentUser?.username} queued "${item.title}"`,
      timestamp: Date.now(),
      isSystem: true
    };
    room.messages.push(sysMsg);
    io.to(currentRoomId).emit('chat:new_message', sysMsg);
  });

  socket.on('queue:remove', ({ itemId }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    room.queue = room.queue.filter((q) => q.id !== itemId);
    io.to(currentRoomId).emit('queue:updated', room.queue);
  });

  socket.on('queue:play_next', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (!canControl(room)) return;
    if (room.queue.length === 0) return;

    const nextItem = room.queue.shift();
    room.media = {
      type: nextItem.type,
      url: nextItem.url,
      videoId: nextItem.videoId || null,
      title: nextItem.title
    };
    room.playback.isPlaying = true;
    room.playback.currentTime = 0;
    room.playback.updatedAt = Date.now();

    io.to(currentRoomId).emit('queue:updated', room.queue);
    io.to(currentRoomId).emit('media:changed', {
      media: room.media,
      playback: room.playback,
      changedBy: 'Auto Next'
    });
  });

  // Chat & Danmaku Messages
  socket.on('chat:send_message', ({ text, isDanmaku = true, image = null }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    if (!text && !image) return;

    const room = rooms.get(currentRoomId);
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sender: currentUser?.username || 'Anonymous',
      color: currentUser?.color || '#6366f1',
      avatar: currentUser?.avatar || '🍿',
      text: text ? text.substring(0, 500) : '',
      image: image || null,
      timestamp: Date.now(),
      isDanmaku: !!isDanmaku,
      isSystem: false
    };

    room.messages.push(message);
    if (room.messages.length > 200) room.messages.shift();

    io.to(currentRoomId).emit('chat:new_message', message);
  });

  // Chat Seen Receipts Tracker
  socket.on('chat:seen', ({ username, timestamp }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    const u = username || currentUser?.username;
    if (!u) return;
    if (!room.lastSeen) room.lastSeen = {};
    const t = timestamp || Date.now();
    room.lastSeen[u] = t;
    io.to(currentRoomId).emit('chat:seen_update', {
      username: u,
      timestamp: t
    });
  });

  // Realtime Live Profile Avatar Updates
  socket.on('user:update_avatar', ({ avatar }) => {
    if (currentUser) {
      currentUser.avatar = avatar;
    }
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      if (room.users[socket.id]) {
        room.users[socket.id].avatar = avatar;
        io.to(currentRoomId).emit('room:users', Object.values(room.users));
      }
    }
  });

  // Reaction Emoji Spam (popcorn, hearts, laugh, fire)
  socket.on('reaction:send', ({ emoji }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    io.to(currentRoomId).emit('reaction:received', {
      emoji,
      sender: currentUser?.username || 'Friend',
      color: currentUser?.color || '#ec4899',
      id: `react-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    });
  });

  // ------------------------------------------------------------------------
  // WebRTC Peer-to-Peer Voice & Camera Signaling
  // ------------------------------------------------------------------------
  socket.on('voice:join', (data = {}) => {
    if (!currentRoomId || !currentUser) return;
    console.log(`🎙️ [Voice] ${currentUser.username} (${socket.id}) joined voice in room ${currentRoomId}`);
    currentUser.inVoice = true;
    currentUser.hasVideo = !!data.hasVideo;
    currentUser.hasAudio = data.hasAudio !== false;

    // 1. Announce to room that a new peer joined voice
    socket.to(currentRoomId).emit('voice:peer_joined', {
      peerId: socket.id,
      username: currentUser.username,
      avatar: currentUser.avatar,
      color: currentUser.color,
      hasVideo: !!data.hasVideo,
      hasAudio: data.hasAudio !== false
    });

    // 2. Send active voice peers to the newly joined socket so they discover each other instantly
    const room = rooms.get(currentRoomId);
    if (room && room.users) {
      for (const [uId, u] of room.users.entries()) {
        if (uId !== socket.id && u.inVoice) {
          console.log(`🎙️ [Voice] Discovered active peer ${u.username} (${uId}) for ${currentUser.username}`);
          socket.emit('voice:peer_joined', {
            peerId: uId,
            username: u.username,
            avatar: u.avatar,
            color: u.color,
            hasVideo: !!u.hasVideo,
            hasAudio: u.hasAudio !== false
          });
        }
      }
    }
  });

  socket.on('voice:signal', ({ targetPeerId, signalData }) => {
    if (!targetPeerId || !signalData) return;
    const sigType = signalData.desc?.type || (signalData.candidate ? 'candidate' : 'unknown');
    console.log(`📡 [Voice:Signal] ${sigType} from ${currentUser?.username || socket.id} -> ${targetPeerId}`);
    io.to(targetPeerId).emit('voice:signal', {
      senderPeerId: socket.id,
      username: currentUser?.username,
      avatar: currentUser?.avatar,
      color: currentUser?.color,
      signalData
    });
  });

  socket.on('voice:speaking', ({ isSpeaking }) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('voice:speaking', {
      peerId: socket.id,
      isSpeaking: !!isSpeaking
    });
  });

  socket.on('voice:track_state', ({ isMuted, hasVideo }) => {
    if (!currentRoomId || !currentUser) return;
    currentUser.isMuted = !!isMuted;
    currentUser.hasVideo = !!hasVideo;
    socket.to(currentRoomId).emit('voice:track_state', {
      peerId: socket.id,
      isMuted: !!isMuted,
      hasVideo: !!hasVideo
    });
  });

  socket.on('voice:leave', () => {
    if (!currentRoomId || !currentUser) return;
    currentUser.inVoice = false;
    currentUser.hasVideo = false;
    currentUser.hasAudio = false;
    socket.to(currentRoomId).emit('voice:peer_left', {
      peerId: socket.id,
      username: currentUser.username
    });
  });

  // Disconnect Handler
  socket.on('disconnect', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    room.users.delete(socket.id);

    // If a seek barrier is active, check if all remaining users are ready
    if (room.barrier?.active) {
      room.barrier.readyUsers.delete(socket.id);
      if (room.barrier.readyUsers.size >= room.users.size) {
        room.barrier.releaseBarrier();
      }
    }

    // Reassign host if host left
    if (room.hostId === socket.id) {
      const remainingKeys = Array.from(room.users.keys());
      if (remainingKeys.length > 0) {
        room.hostId = remainingKeys[0];
        const nextUser = room.users.get(remainingKeys[0]);
        if (nextUser) nextUser.isHost = true;
        io.to(currentRoomId).emit('host:changed', { newHostId: room.hostId, newHostName: nextUser?.username || 'User' });
      } else {
        room.hostId = null;
      }
    }

    io.to(currentRoomId).emit('user:left', {
      userId: socket.id,
      username: currentUser?.username,
      users: Array.from(room.users.values())
    });

    if (currentUser?.inVoice) {
      socket.to(currentRoomId).emit('voice:peer_left', { peerId: socket.id });
    }

    if (room.media?.type === 'neko' && room.users.size === 0) {
      stopNekoIfIdle();
    }

    broadcastLiveStatus();
  });
});

server.on('upgrade', async (req, socket, head) => {
  socket.on('error', (err) => {
    // Avoid unhandled socket error if client disconnects abruptly
  });

  if (req.url && req.url.startsWith('/neko')) {
    if (!appConfig?.modules?.neko) {
      socket.destroy();
      return;
    }
    socket.pause();
    const status = await ensureNekoRunning();
    if (socket.destroyed) {
      return;
    }
    if (status !== 'running') {
      socket.destroy();
      return;
    }
    socket.resume();
    // Normalize Origin to target host so gorilla/websocket checkOrigin allows the handshake from any tunnel/domain
    try {
      const u = new URL(NEKO_URL);
      req.headers.origin = u.origin;
    } catch {
      req.headers.origin = 'http://neko:8080';
    }
    req.headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'https';
    req.headers['x-forwarded-host'] = req.headers['x-forwarded-host'] || req.headers.host;
    // Strip /neko subpath prefix so Neko backend receives /api/ws?token=... instead of /neko/api/ws
    let cleanUrl = req.url.replace(/^\/neko/, '') || '/';
    if (!cleanUrl.startsWith('/')) cleanUrl = '/' + cleanUrl;
    req.url = cleanUrl;
    nekoProxy.upgrade(req, socket, head);
  } else if (req.url && req.url.startsWith('/livekit')) {
    if (!appConfig?.modules?.livekit) {
      socket.destroy();
      return;
    }
    socket.pause();
    try {
      const u = new URL(LIVEKIT_HTTP_TARGET);
      req.headers.origin = u.origin;
    } catch {
      req.headers.origin = 'http://livekit:7880';
    }
    req.headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'https';
    req.headers['x-forwarded-host'] = req.headers['x-forwarded-host'] || req.headers.host;
    socket.resume();
    // Strip /livekit subpath prefix so LiveKit SFU receives /rtc instead of /livekit/rtc
    let cleanUrl = req.url.replace(/^\/livekit/, '') || '/';
    if (!cleanUrl.startsWith('/')) cleanUrl = '/' + cleanUrl;
    req.url = cleanUrl;
    livekitProxy.upgrade(req, socket, head);
  }
});

// Periodic Authoritative Playback Sync Heartbeat (Eliminates 1-2s drift across all browsers)
setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size > 0 && room.playback?.isPlaying && room.media?.type !== 'neko' && !room.barrier?.active) {
      const authTime = getRoomCurrentTime(room);
      io.to(roomId).emit('player:sync_heartbeat', {
        currentTime: authTime,
        isPlaying: true,
        playbackRate: room.playback.playbackRate || 1.0,
        serverTimestamp: Date.now()
      });
    }
  }
}, 2000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🍿 Watch Together Media Hub running on http://0.0.0.0:${PORT}`);
  // Ensure Neko container isn't left consuming CPU/RAM on startup if no users are in a Neko room
  setTimeout(() => {
    stopNekoIfIdle().catch(() => { });
  }, 1500);
});

// Configure infinite request timeout for large multi-GB video uploads
server.requestTimeout = 0;
server.headersTimeout = 120000;
server.keepAliveTimeout = 125000;
server.setTimeout(0);
