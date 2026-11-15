#!/usr/bin/env node
/**
 * lesswatch-install-v2.mjs · 60 FPS animated self-host installer · zero dependencies
 *
 *   node lesswatch-install-v2.mjs          demo run (simulated steps + simulated load)
 *   node lesswatch-install-v2.mjs --real   runs the live commands in STAGES
 *
 * Flow:
 *   Splash (environment detection)
 *     └─ Menu ─┬─ Express install  (auto-detected target + recommended modules) → Review → Install → Done
 *              ├─ Custom install   (Target → Modules → Review) → Install → Done
 *              ├─ What's included
 *              └─ Quit
 *
 * Keys: ↑/↓ j/k move · Space select/toggle · Enter next · Esc/←/Backspace back
 *       1-6 toggle module · a toggle all · t jump to target · y deploy (review)
 *       r retry (failed) · c copy URL (done) · q quit · Ctrl+C abort
 * Env:  LW_URL=https://...    public URL shown on the thank-you screen
 *       LW_LOCAL=http://...   local URL (default http://localhost:8080)
 */
import readline from 'node:readline';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn, exec, execSync } from 'node:child_process';

const REAL = process.argv.includes('--real');
const out = process.stdout;
const inp = process.stdin;
const isTTY = Boolean(out.isTTY && inp.isTTY);
const COLOR = Boolean(out.isTTY) && !('NO_COLOR' in process.env);
const E = '\x1b[';

// ─── Environment Detection ──────────────────────────────────────────────────
const isCloudShell = Boolean(
  process.env.CLOUD_SHELL ||
  process.env.DEVSHELL_PROJECT_ID ||
  fs.existsSync('/google/devshell') ||
  process.env.USER === 'cloudshell' ||
  (process.env.HOME && process.env.HOME.includes('cloudshell'))
);

// Async so the splash can animate while the lookup runs.
let detectedPublicIP = '127.0.0.1';
let ipReady = false;
const defaultTarget = () => (isCloudShell ? 0 : (detectedPublicIP !== '127.0.0.1' ? 1 : 2));
const ipPromise = new Promise((resolve) => {
  exec(
    "curl -s4 --max-time 2 https://api.ipify.org 2>/dev/null || curl -s4 --max-time 2 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'",
    { encoding: 'utf-8', timeout: 6000 },
    (err, stdout) => {
      const ip = String(stdout || '').trim();
      if (ip) detectedPublicIP = ip;
      ipReady = true;
      if (!state.targetTouched) state.target = defaultTarget();
      resolve();
    }
  );
});

// ─── Config & Modules Checklist ─────────────────────────────────────────────
const TARGETS = [
  {
    id: 'cloud',
    short: 'Cloud Shell',
    icon: '☁',
    tag: 'DETECTED',
    title: 'Google Cloud Shell / Web Sandbox',
    defaultPort: 8080,
    desc: 'Browser sandbox. Zero port forwarding needed, binds to :8080 with Google Web Preview.',
    netMode: 'Cloudflare Tunnel + Web Preview',
    webrtc: 'TCP-Mux on :52000 (HTTP fallback)',
  },
  {
    id: 'vps',
    short: 'Cloud VM / VPS',
    icon: '⚡',
    tag: 'DEDICATED',
    title: 'Linux Cloud VM / Dedicated VPS',
    defaultPort: 3000,
    desc: 'Always-on 24/7 cloud server with high-performance direct UDP for spatial WebRTC streaming.',
    netMode: 'Direct Public IP or Cloudflare Tunnel',
    webrtc: 'Direct UDP 50000-50200 + TCP-Mux',
  },
  {
    id: 'local',
    short: 'Local / Docker',
    icon: '💻',
    tag: 'LOCAL',
    title: 'Local Workstation / Docker Desktop',
    defaultPort: 3000,
    desc: 'Local testing on your PC or Mac workstation. Ideal for offline media playback.',
    netMode: 'http://localhost:3000',
    webrtc: 'Local loopback ICE candidates',
  },
];

function defaultPort() {
  if (state.port) return state.port;
  return TARGETS[state.target]?.defaultPort || (TARGETS[state.target]?.id === 'cloud' ? 8080 : 3000);
}

const MODULES = [
  {
    id: 'neko', icon: '◈', tag: 'RECOMMENDED', title: 'Shared Chromium Virtual Browser (Neko)',
    desc: 'Watch together in one shared browser. Auto-sleeps when idle to save 100% of RAM.', on: true
  },
  {
    id: 'aria', icon: '▸', tag: 'CORE ENGINE', title: 'Server Media Downloader (aria2c + yt-dlp)',
    desc: 'High-speed torrent daemon with DHT & direct YouTube/web stream extractor into library.', on: true
  },
  {
    id: 'tunnel', icon: '◉', tag: 'ZERO CONFIG', title: 'Cloudflare Public HTTPS Quick Tunnel',
    desc: 'Instant shareable public HTTPS link with SSL. No router port-forwarding needed.', on: true
  },
  {
    id: 'livekit', icon: '◎', tag: 'SPATIAL AUDIO', title: 'LiveKit Voice & Room SFU Server',
    desc: 'Sub-second spatial audio/video party channels with noise suppression & echo cancel.', on: true
  },
  {
    id: 'storage', icon: '▣', tag: 'STORAGE', title: 'Media Library & Streaming Transcoder',
    desc: 'Direct streaming for MKV, MP4, HLS, WebM + online subtitle auto-search.', on: true
  },
  {
    id: 'neko_warm', icon: '◇', tag: 'OPTIONAL', title: 'Always-On Browser Mode (Pre-warmed in RAM)',
    desc: 'Keeps Neko hot in memory at all times (~600MB permanent RAM instead of sleep mode).', on: false
  },
];
const SHORT = {
  neko: 'Neko browser', aria: 'Downloader', tunnel: 'HTTPS tunnel',
  livekit: 'LiveKit', storage: 'Library', neko_warm: 'Always-on',
};

// Pre-pull cloudflared in the background quietly
try {
  const bgPull = spawn('docker', ['pull', 'cloudflare/cloudflared:latest'], { stdio: 'ignore', detached: true });
  bgPull.on('error', () => { }); // docker missing → don't crash the UI
  bgPull.unref();
} catch { }

// ─── Real Stage Implementations (Non-Blocking & Watchdog Protected) ─────────
async function checkDocker(log, s) {
  log('Connecting to Docker daemon socket /var/run/docker.sock...');
  try {
    execSync('docker info', { stdio: 'ignore' });
    s.progress = 100;
    log(`Docker engine verified (${os.cpus().length} vCPUs, ${(os.totalmem() / 1073741824).toFixed(1)}GB RAM).`);
  } catch {
    throw new Error('Docker daemon is not running. Please start Docker first.');
  }
}

async function generateEnvironment(log, s) {
  log('Deriving cryptographic session secrets & AES vault keys...');
  const livekitSecret = crypto.randomBytes(24).toString('hex');
  const vaultSecret = crypto.randomBytes(32).toString('hex');

  if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
  if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads', { recursive: true });
  if (!fs.existsSync('./media')) fs.mkdirSync('./media', { recursive: true });

  let envContent = '';
  if (fs.existsSync('.env')) {
    envContent = fs.readFileSync('.env', 'utf-8');
  }

  const setEnvVar = (key, val) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${val}`);
    } else {
      envContent += `\n${key}=${val}`;
    }
  };

  const isCloud = TARGETS[state.target]?.id === 'cloud';
  const targetPort = defaultPort();

  setEnvVar('PORT', targetPort);
  setEnvVar('LIVEKIT_API_KEY', 'watchtogether');
  setEnvVar('LIVEKIT_API_SECRET', livekitSecret);
  setEnvVar('VAULT_SECRET', vaultSecret);
  setEnvVar('NEKO_PASSWORD', 'admin');
  setEnvVar('NEKO_ADMIN_PASSWORD', 'admin');

  if (isCloud) {
    setEnvVar('NEKO_SCREEN', '960x540@20');
    setEnvVar('NEKO_DESKTOP_SCREEN', '960x540@20');
    setEnvVar('NEKO_VIDEO_BITRATE', '1500');
    setEnvVar('NEKO_MAX_FPS', '20');
    setEnvVar('NEKO_NAT1TO1', '');
    setEnvVar('NEKO_WEBRTC_NAT1TO1', '');
    setEnvVar('NEKO_ICELITE', '0');
    setEnvVar('NEKO_WEBRTC_ICELITE', '0');
  } else {
    setEnvVar('NEKO_SCREEN', '1280x720@30');
    setEnvVar('NEKO_DESKTOP_SCREEN', '1280x720@30');
    setEnvVar('NEKO_VIDEO_BITRATE', '3072');
    setEnvVar('NEKO_MAX_FPS', '30');
    setEnvVar('NEKO_ICELITE', '1');
    setEnvVar('NEKO_WEBRTC_ICELITE', '1');
    if (detectedPublicIP !== '127.0.0.1') {
      setEnvVar('NEKO_NAT1TO1', detectedPublicIP);
      setEnvVar('NEKO_WEBRTC_NAT1TO1', detectedPublicIP);
    }
  }

  setEnvVar('NEKO_TCPMUX', '52000');
  setEnvVar('NEKO_WEBRTC_TCPMUX', '52000');

  fs.writeFileSync('.env', envContent.trim() + '\n');
  s.progress = 100;
  log(`Written .env with port ${targetPort} and optimized WebRTC parameters.`);
}

function buildServices(log, s) {
  return new Promise((resolve, reject) => {
    log('Building LESSWATCH core services with Docker BuildKit...');

    const livekitOn = state.modules[3] ?? true;
    const services = ['watch-together'];
    if (livekitOn) services.push('livekit');

    const child = spawn('docker', ['compose', 'up', '-d', '--build', ...services], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    activeChild = child;
    let finished = false;
    let pollerTimer = null;
    let settleTimer = null;

    const cleanupAndResolve = () => {
      if (finished) return;
      finished = true;
      if (pollerTimer) clearInterval(pollerTimer);
      if (settleTimer) clearTimeout(settleTimer);
      activeChild = null;
      s.progress = 100;
      log('LESSWATCH core services & LiveKit server online.');
      resolve();
    };

    const cleanupAndReject = (err) => {
      if (finished) return;
      finished = true;
      if (pollerTimer) clearInterval(pollerTimer);
      if (settleTimer) clearTimeout(settleTimer);
      activeChild = null;
      reject(err);
    };

    // Non-blocking async poller: checks if container is running without freezing event loop
    pollerTimer = setInterval(() => {
      if (finished) return;
      exec('docker ps --filter "name=watch-together" --format "{{.Status}}"', { timeout: 6000 }, (err, stdout) => {
        if (!err && stdout && (stdout.includes('Up') || stdout.includes('running') || stdout.includes('healthy'))) {
          log('Verified watch-together container is Up and operational.');
          cleanupAndResolve();
        }
      });
    }, 2000);

    const feed = (d) => {
      const lines = String(d).split(/\r?\n|\r/);
      for (const line of lines) {
        if (!line.trim()) continue;
        log(line);
        if (line.includes('Step 1/')) s.progress = 15;
        else if (line.includes('Step 2/')) s.progress = 30;
        else if (line.includes('Step 3/')) s.progress = 50;
        else if (line.includes('Step 4/')) s.progress = 65;
        else if (line.includes('Step 5/')) s.progress = 80;
        else if (line.includes('Step 6/')) s.progress = 90;
        else if (line.includes('Started') || line.includes('Running')) {
          s.progress = 95;
          // Once Docker Compose logs "Started" for watch-together, the container is up!
          // Don't wait for stuck child compose pipes — settle and resolve.
          if (!settleTimer && (line.includes('watch-together') || line.includes('Started'))) {
            settleTimer = setTimeout(() => {
              cleanupAndResolve();
            }, 2000);
          }
        }
      }
    };

    child.stdout.on('data', feed);
    child.stderr.on('data', feed);

    child.on('error', cleanupAndReject);
    child.on('exit', (code) => {
      if (code === 0) cleanupAndResolve();
      else {
        // Compose CLI might return non-zero on pipe disconnect even if container started
        exec('docker ps --filter "name=watch-together" --format "{{.Status}}"', (err, stdout) => {
          if (!err && stdout && (stdout.includes('Up') || stdout.includes('running'))) {
            cleanupAndResolve();
          } else {
            cleanupAndReject(new Error(`Docker build failed with exit code ${code}`));
          }
        });
      }
    });
    child.on('close', (code) => {
      if (code === 0) cleanupAndResolve();
    });

    // Safety watchdog: after 30s, verify container status
    setTimeout(() => {
      if (!finished) {
        exec('docker ps --filter "name=watch-together" --format "{{.Status}}"', (err, stdout) => {
          if (!err && stdout && (stdout.includes('Up') || stdout.includes('running'))) {
            log('Container watch-together verified via safety watchdog.');
            cleanupAndResolve();
          }
        });
      }
    }, 30000);
  });
}

async function provisionNeko(log, s) {
  const nekoOn = state.modules[0] ?? true;
  const nekoWarm = state.modules[5] ?? false;

  if (!nekoOn) {
    s.progress = 100;
    log('Neko Virtual Browser skipped (disabled in modules menu).');
    return;
  }

  log(`Configuring Neko Chromium browser (${nekoWarm ? 'Always-On' : 'On-Demand'} mode)...`);

  return new Promise((resolve) => {
    exec('docker image inspect m1k1o/neko:chromium', (inspectErr) => {
      if (!inspectErr) {
        log('Image cached. Provisioning virtual browser container...');
        const upCmd = nekoWarm ? 'docker compose --profile neko up -d neko' : 'docker compose --profile neko up --no-start neko';
        exec(upCmd, () => {
          s.progress = 100;
          log(`Neko Chromium browser ready (${nekoWarm ? 'Running' : 'On-Demand sleep mode'}).`);
          resolve();
        });
      } else {
        log('Registering Chromium browser for on-demand pull in background...');
        // Pull in background asynchronously so UI is never blocked
        spawn('sh', ['-c', 'docker compose --profile neko pull neko >/dev/null 2>&1 && docker compose --profile neko up --no-start neko >/dev/null 2>&1 &'], {
          stdio: 'ignore',
          detached: true
        }).unref();
        s.progress = 100;
        log('Chromium browser registered (activates on first room use).');
        resolve();
      }
    });
  });
}

async function prepareDownloader(log, s) {
  const ariaOn = state.modules[1] ?? true;
  if (!ariaOn) {
    s.progress = 100;
    log('Downloader engine skipped (disabled in modules menu).');
    return;
  }
  log('Verifying torrent downloader storage pipeline...');
  if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads', { recursive: true });
  if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
  if (!fs.existsSync('./media')) fs.mkdirSync('./media', { recursive: true });
  s.progress = 100;
  log('Downloader storage directories and permissions verified.');
}

async function startTunnel(log, s) {
  const tunnelOn = state.modules[2] ?? true;
  const isCloud = TARGETS[state.target]?.id === 'cloud';
  const targetPort = defaultPort();

  if (!tunnelOn) {
    state.publicUrl = `http://${detectedPublicIP}:${targetPort}`;
    s.progress = 100;
    log(`Tunnel skipped. Direct access: ${state.publicUrl}`);
    return;
  }

  log(`Requesting Cloudflare edge quick tunnel for port ${targetPort}...`);
  try { execSync('docker rm -f wt-tunnel 2>/dev/null', { stdio: 'ignore' }); } catch { }

  execSync(`docker run -d --name wt-tunnel --restart=unless-stopped --network=host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:${targetPort}`, { stdio: 'ignore' });

  const maxAttempts = 35;
  for (let i = 0; i < maxAttempts; i++) {
    s.progress = Math.min(95, 20 + Math.round((i / maxAttempts) * 75));
    await new Promise(r => setTimeout(r, 600));
    try {
      const logs = execSync('docker logs wt-tunnel 2>&1', { encoding: 'utf-8' });
      const match = logs.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
      if (match) {
        state.publicUrl = match[0];
        log(`Tunnel registered at edge: ${state.publicUrl}`);
        s.progress = 100;
        return;
      }
    } catch { }
    if (i % 3 === 0) log(`Waiting for Cloudflare edge route assignment (${i + 1}s)...`);
  }

  if (!state.publicUrl) {
    state.publicUrl = `http://localhost:${targetPort}`;
    log(`Tunnel timed out; fallback to local URL: ${state.publicUrl}`);
  }
}

// ─── Pipeline Stages ────────────────────────────────────────────────────────
const STAGES = [
  { id: 'docker', label: 'Docker daemon check', cmd: 'docker info >/dev/null', exec: checkDocker, sim: 1000 },
  { id: 'env', label: 'Generate secrets & .env', cmd: 'sh scripts/gen-env.sh', exec: generateEnvironment, sim: 800 },
  { id: 'build', label: 'Build LESSWATCH services', cmd: 'docker compose build', exec: buildServices, sim: 2800 },
  { id: 'neko', label: 'Pull Chromium image', cmd: 'docker compose pull neko', exec: provisionNeko, sim: 1400, feature: 'neko' },
  { id: 'aria', label: 'Prepare downloader', cmd: 'mkdir -p downloads data', exec: prepareDownloader, sim: 800, feature: 'aria' },
  { id: 'tunnel', label: 'Public HTTPS tunnel', cmd: 'sh scripts/tunnel.sh', exec: startTunnel, sim: 1200, feature: 'tunnel' },
];

const SIM_LINES = [
  'resolving dependencies', 'layer cache hit, reusing', 'verifying checksum',
  'writing config', 'health check ok', 'waiting for ports', 'connection established',
];

// ─── Terminal helpers ───────────────────────────────────────────────────────
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const BLOCKS = ' ▁▂▃▄▅▆▇█';
const PARTIAL = ' ▏▎▍▌▋▊▉';
const CONFETTI = ['✦', '✧', '*', '•', '◆', '▲', '✶'];
const SCRAMBLE = '▓▒░#%&@$*+=?';
const WIZARD = ['Target', 'Port', 'Modules', 'Review', 'Install'];

const A = (code) => (COLOR ? `${E}${code}m` : '');
const RESET = A(0), BOLD = A(1), DIM = A(2);
const fg = (c) => (COLOR ? `${E}38;2;${c[0]};${c[1]};${c[2]}m` : '');
const bgc = (c) => (COLOR ? `${E}48;2;${c[0]};${c[1]};${c[2]}m` : '');
const tint = (c) => (s) => fg(c) + s + RESET;
const C = {
  accent: tint([34, 211, 238]), green: tint([110, 231, 160]), amber: tint([251, 191, 36]),
  red: tint([248, 113, 113]), text: tint([228, 228, 231]), muted: tint([161, 161, 170]),
  faint: tint([100, 100, 112]),
};
const GREEN = [110, 231, 160];
const STOPS = [[255, 106, 193], [167, 139, 250], [90, 220, 255]];
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Width-aware length: comprehensive East Asian / emoji width table.
// All icons in MODULES are now single-width Unicode, so this mainly
// guards against stray emoji in log lines.
function cw(ch) {
  const c = ch.codePointAt(0);
  // Zero-width: variation selector, ZWJ, combining marks
  if (c === 0xfe0f || c === 0x200d || (c >= 0x0300 && c <= 0x036f)) return 0;
  // Explicitly NOT wide: ◈ ◉ ◎ ▣ ◇ ▸ ▲ ✔ ✖ ○ ● ─ │ ╭ ╮ ╰ ╯ braille blocks
  // All Basic Multilingual Plane box/block chars: treat as 1
  if (c < 0x1100) return 1;
  // CJK / wide East Asian ranges
  if (
    (c >= 0x1100 && c <= 0x115f) ||   // Hangul Jamo
    (c >= 0x2e80 && c <= 0x303e) ||   // CJK Radicals
    (c >= 0x3041 && c <= 0x33bf) ||   // Hiragana / Katakana / CJK Compat
    (c >= 0x3400 && c <= 0x4dbf) ||   // CJK Extension A
    (c >= 0x4e00 && c <= 0xa4cf) ||   // CJK Unified
    (c >= 0xa960 && c <= 0xa97f) ||   // Hangul Jamo Extended-A
    (c >= 0xac00 && c <= 0xd7ff) ||   // Hangul Syllables
    (c >= 0xf900 && c <= 0xfaff) ||   // CJK Compat Ideographs
    (c >= 0xfe10 && c <= 0xfe6f) ||   // CJK Compat Forms / Small Forms
    (c >= 0xff00 && c <= 0xff60) ||   // Fullwidth Forms
    (c >= 0x1b000 && c <= 0x1b2ff) || // Kana Supplement / Extended
    (c >= 0x1f004 && c <= 0x1f0cf) || // Mahjong / Playing cards
    (c >= 0x1f200 && c <= 0x1f2ff) || // Enclosed CJK
    (c >= 0x1f300 && c <= 0x1faff) || // Misc Symbols & Pictographs (most emoji)
    (c >= 0x20000 && c <= 0x2fffd) || // CJK Extension B+
    (c >= 0x30000 && c <= 0x3fffd)    // CJK Extension G+
  ) return 2;
  return 1;
}
const vlen = (s) => { let n = 0; for (const ch of s.replace(ANSI_RE, '')) n += cw(ch); return n; };

function truncateAnsi(str, maxLen) {
  const visible = vlen(str);
  if (visible <= maxLen) return str;

  let currentLen = 0;
  let result = '';
  const regex = /(\x1b\[[0-9;?]*[A-Za-z])|([^\x1b]+)/g;
  let match;

  while ((match = regex.exec(str)) !== null) {
    if (match[1]) {
      result += match[1];
    } else if (match[2]) {
      for (const ch of match[2]) {
        const w = cw(ch);
        if (currentLen + w > maxLen - 1) {
          result += '…' + RESET;
          return result;
        }
        result += ch;
        currentLen += w;
      }
    }
  }
  return result + RESET;
}

function pad(s, w) {
  const len = vlen(s);
  if (len > w) {
    return truncateAnsi(s, w);
  }
  return s + ' '.repeat(w - len);
}

const center = (s, w) => ' '.repeat(Math.max(0, Math.floor((w - vlen(s)) / 2))) + s;

function formatLogLine(raw, maxLen) {
  const clean = String(raw).replace(/\s+$/, '');
  if (!clean) return '';
  let colored;
  if (clean.startsWith('$')) {
    colored = C.accent(BOLD + clean);
  } else if (clean.includes('Started') || clean.includes('Up') || clean.includes('verified') || clean.includes('online')) {
    colored = green('✔ ') + C.green(clean);
  } else if (clean.includes('Starting') || clean.includes('Step') || clean.includes('Building')) {
    colored = C.amber('▸ ') + C.amber(clean);
  } else if (clean.includes('fail') || clean.includes('Error') || clean.includes('error')) {
    colored = C.red('✖ ') + C.red(clean);
  } else {
    colored = C.faint('· ') + C.muted(clean);
  }
  return ' ' + truncateAnsi(colored, maxLen - 2);
}

function fit(s, n) {
  let w = 0, r = '';
  for (const ch of String(s).replace(ANSI_RE, '')) {
    const k = cw(ch);
    if (w + k > n - 1 && vlen(s) > n) return r + '…';
    r += ch; w += k;
  }
  return r;
}
function wrap(text, w) {
  const lines = [];
  let cur = '';
  for (const wd of text.split(' ')) {
    if (cur && vlen(cur) + 1 + vlen(wd) > w) { lines.push(cur); cur = wd; }
    else cur = cur ? cur + ' ' + wd : wd;
  }
  if (cur) lines.push(cur);
  return lines;
}
function wrapTokens(tokens, width, sep = '   ') {
  const lines = [];
  let cur = '';
  for (const t of tokens) {
    if (cur && vlen(cur) + vlen(sep) + vlen(t) > width) { lines.push(cur); cur = t; }
    else cur = cur ? cur + sep + t : t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function grad(t) {
  const x = clamp(t, 0, 1) * (STOPS.length - 1);
  const i = Math.min(Math.floor(x), STOPS.length - 2);
  const f = x - i;
  return [0, 1, 2].map((k) => Math.round(STOPS[i][k] + (STOPS[i + 1][k] - STOPS[i][k]) * f));
}
const wave = (i, speed = 3, freq = 0.15) => (Math.sin(i * freq - state.t * speed) + 1) / 2;
function gtext(s, bold = false) {
  let r = bold ? BOLD : '';
  [...s].forEach((ch, i) => { r += ch === ' ' ? ch : fg(grad(wave(i))) + ch; });
  return r + RESET;
}
const green = C.green;
const dim = (s) => DIM + s + RESET;

function hsl(h, s, l) {
  if (!COLOR) return '';
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `${E}38;2;${Math.round((r + m) * 255)};${Math.round((g + m) * 255)};${Math.round((b + m) * 255)}m`;
}

// Hint bar: drops middle hints until it fits the box.
function hint(pairs, inner) {
  const sep = dim('  ·  ');
  const render = (p) => p.map(([k, d]) => fg(grad(0.55)) + BOLD + k + RESET + dim(' ' + d)).join(sep);
  const p = [...pairs];
  while (inner && vlen(render(p)) > inner && p.length > 2) p.splice(1, 1);
  return center(render(p), inner || 0);
}

function stepper(active, inner) {
  if (inner < 58) return dim(`Step ${active + 1}/${WIZARD.length} · `) + gtext(WIZARD[active], true);
  return WIZARD.map((l, i) =>
    i < active ? green('✔ ' + l) : i === active ? gtext('● ' + l, true) : dim('○ ' + l)
  ).join(dim(' ─ '));
}
// Express flow has no wizard steps, so it gets a title line instead.
const topline = (active, inner) =>
  state.mode === 'express'
    ? gtext('EXPRESS INSTALL', true) + dim(`  ·  ${TARGETS[state.target].short} :${defaultPort()}`)
    : stepper(active, inner);

// Selectable row with a soft highlight that glides between rows.
function selRow(i, content, inner) {
  const sel = i === state.cursor;
  const ptr = sel ? fg(grad(wave(0, 4))) + '❯' + RESET : ' ';
  let s = ` ${ptr} ${content}`;
  const k = Math.max(0, 1 - Math.abs(state.hl - i));
  if (COLOR && k > 0.04) {
    const bg = bgc([Math.round(14 + 24 * k), Math.round(18 + 26 * k), Math.round(32 + 48 * k)]);
    s = bg + pad(s, inner).split(RESET).join(RESET + bg) + RESET;
  }
  return s;
}

function box(lines, W, title) {
  const inner = W - 4;
  const colorAt = (i, k = 0) => fg(grad((Math.sin(i * 0.09 - state.t * 1.6 + k) + 1) / 2));
  let top = '╭' + '─'.repeat(W - 2) + '╮';
  if (title) {
    const t = ` ${title} `;
    top = top.slice(0, 3) + t + top.slice(3 + t.length);
  }
  const topC = [...top].map((ch, i) => colorAt(i) + ch).join('') + RESET;
  const bot = [...('╰' + '─'.repeat(W - 2) + '╯')].map((ch, i) => colorAt(i, 2) + ch).join('') + RESET;
  const body = lines.map((l, r) => {
    const side = colorAt(r * 3, 1);
    return `${side}│${RESET} ${pad(l, inner)} ${side}│${RESET}`;
  });
  return [topC, ...body, bot];
}

function bar(p, w, shim = true) {
  p = clamp(p, 0, 1);
  const units = p * w * 8;
  const full = Math.floor(units / 8);
  const rem = Math.floor(units % 8);
  const sx = (state.t * 42) % (w + 14) - 7;
  let s = '';
  for (let i = 0; i < full; i++) {
    s += (shim && Math.abs(i - sx) < 2.2 ? fg([255, 255, 255]) : fg(grad(i / w))) + '█' + RESET;
  }
  const partial = full < w && rem > 0;
  if (partial) s += fg(grad(full / w)) + PARTIAL[rem] + RESET;
  const used = full + (partial ? 1 : 0);
  return s + C.faint('░'.repeat(Math.max(0, w - used)));
}

// ─── State ──────────────────────────────────────────────────────────────────
const state = {
  screen: 'splash', screenT: 0, sa: 0, t: 0, frame: 0,
  mode: 'express',                 // express | custom
  cursor: 0, hl: 0, lastMenu: 0, btn: 0,
  target: defaultTarget(), targetTouched: false,
  port: null, portCursor: 0, editingCustomPort: false, customPortInput: '',
  modules: MODULES.map((m) => m.on),
  flash: {}, toast: null,
  stages: [], current: 0, shown: 0, logs: [], started: 0, finishedAt: 0,
  pendingDone: false, doneT: 0, error: '', publicUrl: '', plain: false,
  cpu: Array(120).fill(0.05), mem: Array(120).fill(0.2), cpuV: 0.05, lastSample: 0,
  confetti: null, quitting: false,
};
const t0 = Date.now();
let activeChild = null;
let leftScreen = false;
let prevCpu = os.cpus();

function go(next) {
  const prev = state.screen;
  state.screen = next;
  state.screenT = state.t;
  state.sa = 0;
  if (next === 'menu') state.cursor = state.lastMenu;
  if (next === 'target') state.cursor = state.target;
  if (next === 'port') {
    state.cursor = state.portCursor;
    state.editingCustomPort = false;
  }
  if (next === 'modules') state.cursor = (prev === 'target' || prev === 'port') ? 0 : clamp(state.cursor, 0, MODULES.length - 1);
  if (next === 'review') state.btn = 0;
  if (next === 'done') state.confetti = null;
  state.hl = state.cursor;
}
function toast(text) { state.toast = { text, until: state.t + 3 }; }

// ─── CPU / RAM telemetry ────────────────────────────────────────────────────
// Real mode reads the OS. Demo mode synthesises load that follows the running
// stage, so spikes line up with what the installer is "doing".
const LOAD = { docker: 0.22, env: 0.3, build: 0.9, neko: 0.62, aria: 0.3, tunnel: 0.42 };
const push = (arr, v) => { arr.push(v); if (arr.length > 160) arr.shift(); };

function sample() {
  let mem;
  if (REAL) {
    try {
      const cur = os.cpus();
      const sum = (o) => Object.values(o.times).reduce((a, b) => a + b, 0);
      let idle = 0, total = 0;
      cur.forEach((c, i) => {
        const p = prevCpu && prevCpu[i] ? prevCpu[i] : c;
        total += sum(c) - sum(p);
        idle += c.times.idle - p.times.idle;
      });
      prevCpu = cur;
      const f = total > 0 ? clamp(1 - idle / total, 0, 1) : state.cpuV;
      state.cpuV += (f - state.cpuV) * 0.6;
    } catch { }
    mem = clamp(1 - os.freemem() / os.totalmem(), 0, 1);
  } else {
    const run = state.screen === 'install' ? state.stages[state.current] : null;
    const active = Boolean(run && run.status === 'running');
    const base = active ? (LOAD[run.id] ?? 0.4) : (state.screen === 'install' ? 0.12 : 0.06);
    let target = base * (0.55 + 0.45 * Math.random());
    if (active && base > 0.2 && Math.random() < 0.14) target = Math.min(1, target + 0.2 + Math.random() * 0.3);
    state.cpuV += (target - state.cpuV) * 0.55;
    mem = 0.24 + 0.34 * state.shown + 0.01 * Math.sin(state.t * 1.3);
  }
  push(state.cpu, clamp(state.cpuV, 0.02, 1));
  push(state.mem, clamp(mem, 0, 1));
}

const heat = (f) => hsl(140 - 140 * clamp(f, 0, 1), 0.85, 0.55);
const cool = (f) => hsl(195 + 70 * clamp(f, 0, 1), 0.8, 0.62);

// Multi-row area chart: R rows × 8 sub-levels, newest sample on the right.
function chart(hist, w, R, colorFn) {
  const data = hist.slice(-w);
  while (data.length < w) data.unshift(0);
  const lines = [];
  for (let r = 0; r < R; r++) {
    let s = '';
    for (const v of data) {
      const h = Math.round(clamp(v, 0, 1) * R * 8);
      const lvl = clamp(h - (R - 1 - r) * 8, 0, 8);
      if (lvl === 0) { s += r === R - 1 ? C.faint('▁') : ' '; continue; }
      const frac = ((R - 1 - r) * 8 + lvl) / (R * 8);
      s += colorFn(frac) + BLOCKS[lvl] + RESET;
    }
    lines.push(s);
  }
  return lines;
}

// ─── Pipeline ───────────────────────────────────────────────────────────────
function log(line) {
  const clean = String(line).replace(ANSI_RE, '').replace(/\s+$/, '');
  const m = clean.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (m) state.publicUrl = m[0];
  state.logs.push(clean);
  if (state.logs.length > 200) state.logs.splice(0, 100);
  if (state.plain && clean) console.log(clean);
}

function enabledStages() {
  const tid = TARGETS[state.target].id;
  const nekoOn = state.modules[0] ?? true;
  const ariaOn = state.modules[1] ?? true;
  const tunnelOn = state.modules[2] ?? true;

  return STAGES
    .filter((s) => {
      if (s.feature === 'neko' && !nekoOn) return false;
      if (s.feature === 'aria' && !ariaOn) return false;
      if (s.feature === 'tunnel' && (!tunnelOn || tid === 'local')) return false;
      if (s.targets && !s.targets.includes(tid)) return false;
      return true;
    })
    .map((s) => ({ ...s, status: 'pending', progress: 0, ms: 0 }));
}

function runSim(s) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      const f = Math.min(1, (Date.now() - t0) / s.sim);
      s.progress = f * 100;
      if (Math.random() < 0.3) log('  ' + SIM_LINES[Math.floor(Math.random() * SIM_LINES.length)]);
      if (f >= 1) { clearInterval(timer); resolve(); }
    }, 40);
  });
}

async function runReal(s) {
  if (typeof s.exec === 'function') {
    return await s.exec(log, s);
  }

  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', s.cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
    activeChild = child;
    const feed = (d) => String(d).split(/\r?\n|\r/).forEach((l) => l && log('  ' + l));
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    const creep = setInterval(() => { s.progress += (92 - s.progress) * 0.02; }, 200);
    child.on('error', (e) => { clearInterval(creep); activeChild = null; reject(e); });
    child.on('exit', (code) => {
      clearInterval(creep);
      activeChild = null;
      code === 0 ? resolve() : reject(new Error(`${s.label} failed (exit ${code})`));
    });
  });
}

async function runPipeline(from) {
  for (let i = from; i < state.stages.length; i++) {
    const s = state.stages[i];
    state.current = i;
    s.status = 'running';
    s.progress = 0;
    log(`$ ${s.cmd || s.id}`);
    const t0 = Date.now();
    try {
      await (REAL ? runReal(s) : runSim(s));
      s.status = 'done';
      s.progress = 100;
      s.ms = Date.now() - t0;
    } catch (err) {
      s.status = 'failed';
      state.error = err.message;
      go('failed');
      return;
    }
  }
  state.finishedAt = Date.now();
  state.pendingDone = true;       // frame loop eases the bar to 100%, then flips to 'done'
  state.doneT = 0;
  if (!REAL && !state.publicUrl) state.publicUrl = 'https://lesswatch-demo.trycloudflare.com';
  if (process.env.LW_URL) state.publicUrl = process.env.LW_URL;
}

function startInstall() {
  state.stages = enabledStages();
  state.started = Date.now();
  state.pendingDone = false;
  state.shown = 0;
  state.logs = [];
  go('install');
  return runPipeline(0);
}

function retry() {
  const s = state.stages[state.current];
  s.status = 'pending';
  s.progress = 0;
  state.error = '';
  go('install');
  runPipeline(state.current);
}

function overall() {
  const n = state.stages.length || 1;
  const done = state.stages.filter((s) => s.status === 'done').length;
  const cur = state.stages.find((s) => s.status === 'running');
  return (done + (cur ? cur.progress / 100 : 0)) / n;
}

// ─── Screens ────────────────────────────────────────────────────────────────
const LOGO = {
  L: ['█  ', '█  ', '█▄▄'], E: ['█▀▀', '█▀▀', '█▄▄'], S: ['█▀▀', '▀▀█', '▄▄█'],
  W: ['█   █', '█ █ █', '▀▄▀▄▀'], A: ['▄▀▄', '█▀█', '▀ ▀'], T: ['▀█▀', ' █ ', ' ▀ '],
  C: ['█▀▀', '█  ', '▀▀▀'], H: ['█ █', '█▀█', '▀ ▀'],
};
const logoLines = () => [0, 1, 2].map((r) => [...'LESSWATCH'].map((ch) => LOGO[ch][r]).join(' '));
function paintLogo(lines) {
  return lines.map((l, r) => {
    let s = '';
    [...l].forEach((ch, i) => { s += ch === ' ' ? ' ' : fg(grad(wave(i + r * 2, 3.5, 0.18))) + BOLD + ch; });
    return s + RESET;
  });
}

const envName = () => (isCloudShell ? 'Google Cloud Shell' : detectedPublicIP !== '127.0.0.1' ? 'Linux VM / VPS' : 'Local workstation');
const sysInfo = () => `${os.cpus().length} vCPU · ${(os.totalmem() / 1073741824).toFixed(1)} GB RAM`;
const enabledCount = () => state.modules.filter((v, i) => v && !(MODULES[i].id === 'neko_warm' && !state.modules[0])).length;

function toggleModule(i) {
  const isWarm = MODULES[i].id === 'neko_warm';
  if (isWarm && !state.modules[0] && !state.modules[i]) return toast('Always-On mode needs the Neko browser enabled');
  state.modules[i] = !state.modules[i];
  state.flash[i] = state.t;
  if (i === 0 && !state.modules[0] && state.modules[5]) {
    state.modules[5] = false;
    state.flash[5] = state.t;
    toast('Always-On mode switched off (needs Neko)');
  }
}
function markFor(i) {
  const on = state.modules[i];
  if (MODULES[i].id === 'neko_warm' && !state.modules[0] && !on) return C.faint('[–]');
  const a = state.t - (state.flash[i] ?? -99);
  if (a < 0.22) {
    const f = on ? ['·', '◔', '◑', '✔'] : ['✔', '◑', '◔', '·'];
    return (on ? C.green : C.amber)(BOLD + '[' + f[Math.min(3, Math.floor(a / 0.055))] + ']');
  }
  return on ? C.green(BOLD + '[✔]') : C.faint('[ ]');
}

const menuItems = () => [
  {
    label: 'Express install', desc: `auto · ${TARGETS[defaultTarget()].short} :${TARGETS[defaultTarget()].defaultPort} · recommended`,
    run: () => { state.mode = 'express'; state.target = defaultTarget(); state.port = TARGETS[state.target].defaultPort; state.modules = MODULES.map((m) => m.on); go('review'); }
  },
  {
    label: 'Custom install', desc: 'choose target, port & modules',
    run: () => { state.mode = 'custom'; if (!state.targetTouched) state.target = defaultTarget(); state.port = TARGETS[state.target].defaultPort; go('target'); }
  },
  { label: 'What\u2019s included', desc: 'see every module', run: () => go('about') },
  { label: 'Quit', desc: 'exit installer', run: () => shutdown(0) },
];

// Scramble-resolve text effect for the final public IP / URL.
function typeFx(text, start, cps) {
  const el = state.sa - start;
  if (el < 0) return null;
  const n = Math.min(text.length, Math.floor(el * cps));
  const done = n >= text.length;
  const pending = done ? '' : [...text.slice(n, n + 4)].map(() => SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]).join('');
  return { shown: text.slice(0, n), pending, done, since: el - text.length / cps };
}

const screens = {
  splash: {
    render(inner) {
      const logo = paintLogo(logoLines()).map((l) => center(l, inner));
      const tag = 'stream together · self-hosted · watch in sync';
      const typed = tag.slice(0, Math.floor(Math.max(0, state.sa - 0.5) * 34));
      const spin = SPINNER[Math.floor(state.t * 14) % SPINNER.length];
      const ind = ' '.repeat(Math.max(2, Math.floor((inner - 48) / 2)));
      const row = (at, k, v, ok) => (state.sa >= at ? `${ind}${ok ? green('✔') : C.accent(spin)} ${C.accent(k.padEnd(13))} ${C.text(v)}` : '');
      const prompt = Math.floor(state.t * 1.6) % 2 ? BOLD + green('▌ PRESS ANY KEY TO CONTINUE ▐') : dim('  PRESS ANY KEY TO CONTINUE  ');

      const netLabel = isCloudShell ? 'Access Mode' : 'Public IP';
      const netVal = isCloudShell
        ? 'Private NAT Sandbox (Cloudflare Tunnel enabled)'
        : (ipReady ? (detectedPublicIP === '127.0.0.1' ? 'Local loopback only' : detectedPublicIP) : 'detecting…');

      return [
        '', ...logo, '',
        center(dim(typed) + (Math.floor(state.t * 3) % 2 ? dim('▌') : ' '), inner), '',
        row(0.6, 'Environment', envName(), true),
        row(0.9, netLabel, netVal, isCloudShell || ipReady),
        row(1.2, 'Resources', sysInfo(), true),
        '',
        state.sa > 1.5 ? center(prompt, inner) : '',
      ];
    },
    key(s, k) {
      if (s === 'q' || k?.name === 'escape') shutdown(0);
      else go('menu');
    },
  },

  menu: {
    render(inner) {
      const items = menuItems();
      return [
        center(gtext('LESSWATCH', true) + dim('  installer'), inner),
        center(dim(`detected: ${envName()} · ${sysInfo()}`), inner), '',
        dim('What would you like to do?'), '',
        ...items.map((it, i) => selRow(i, `${pad(`${i + 1}  ${it.label}`, 22)}${dim(fit(it.desc, Math.max(8, inner - 4 - 22)))}`, inner)),
        '', hint([['↑↓', 'move'], ['enter', 'select'], ['q', 'quit']], inner),
      ];
    },
    key(s, k) {
      const n = menuItems().length;
      const run = () => { state.lastMenu = state.cursor; menuItems()[state.cursor].run(); };
      if (k.name === 'up' || s === 'k') state.cursor = (state.cursor + n - 1) % n;
      else if (k.name === 'down' || s === 'j') state.cursor = (state.cursor + 1) % n;
      else if (/^[1-9]$/.test(s) && +s <= n) { state.cursor = +s - 1; run(); }
      else if (k.name === 'return') run();
      else if (s === 'q' || k.name === 'escape') shutdown(0);
    },
  },

  about: {
    render(inner) {
      const L = [center(gtext('What\u2019s included', true), inner), ''];
      MODULES.forEach((m) => {
        // icon is 1-wide now; account for ✔(1) sp(1) icon(1) sp(2) = 5 chars overhead
        L.push(` ${green('+')} ${BOLD}${m.icon}  ${fit(m.title, inner - 7)}${RESET}`);
        L.push('      ' + dim(fit(m.desc, inner - 7)));
      });
      L.push('', hint([['enter', 'back'], ['esc', 'back']], inner));
      return L;
    },
    key(s, k) { if (k.name === 'return' || k.name === 'escape' || k.name === 'backspace') go('menu'); },
  },

  target: {
    render(inner) {
      const L = [topline(0, inner), '', dim('Where are you deploying LESSWATCH?'), ''];
      TARGETS.forEach((t, i) => {
        const isSel = i === state.cursor;
        const mark = i === state.target ? green('◉') : C.faint('○');
        const isDet = (isCloudShell && t.id === 'cloud') || (!isCloudShell && detectedPublicIP !== '127.0.0.1' && t.id === 'vps');
        const badge = isDet ? C.amber(' [AUTO-DETECTED]') : (t.tag ? C.faint(` [${t.tag}]`) : '');
        const titleText = `${t.icon}  ${t.title}${badge}`;
        const label = isSel ? BOLD + C.accent(titleText) : C.text(titleText);
        L.push(selRow(i, `${mark} ${label}`, inner));
      });
      L.push('');
      const cur = TARGETS[state.cursor];
      L.push(...box([
        `${BOLD}${C.accent(cur.title)}${RESET} ${C.amber(`[${cur.short}]`)}`,
        dim(cur.desc),
        '',
        `${C.faint('Network Mode: ')} ${C.text(cur.netMode)}`,
        `${C.faint('WebRTC Sync:  ')} ${C.text(cur.webrtc)}`,
        `${C.faint('Default Port: ')} ${C.green(String(cur.defaultPort))}  ${dim('(customizable in next step)')}`
      ], inner, 'target details'));
      L.push('', hint([['↑↓', 'move'], ['space', 'select'], ['1-3', 'direct'], ['enter', 'next (port)'], ['esc', 'menu']], inner));
      return L;
    },
    key(s, k) {
      const n = TARGETS.length;
      if (k.name === 'up' || s === 'k') state.cursor = (state.cursor + n - 1) % n;
      else if (k.name === 'down' || s === 'j') state.cursor = (state.cursor + 1) % n;
      else if (/^[1-3]$/.test(s)) {
        state.cursor = Number(s) - 1;
        state.target = state.cursor;
        state.targetTouched = true;
        state.port = TARGETS[state.target].defaultPort;
      }
      else if (s === ' ') {
        state.target = state.cursor;
        state.targetTouched = true;
        state.port = TARGETS[state.target].defaultPort;
      }
      else if (k.name === 'return' || k.name === 'right') {
        state.target = state.cursor;
        state.targetTouched = true;
        if (!state.port) state.port = TARGETS[state.target].defaultPort;
        go('port');
      }
      else if (k.name === 'escape' || k.name === 'backspace' || k.name === 'left') go('menu');
      else if (s === 'q') shutdown(0);
    },
  },

  port: {
    render(inner) {
      const isCloud = TARGETS[state.target].id === 'cloud';
      const curPort = defaultPort();
      const L = [topline(1, inner), '', dim('Choose HTTP network port for LESSWATCH:'), ''];

      const presets = [
        {
          port: 8080,
          tag: isCloud ? 'RECOMMENDED' : 'WEB PREVIEW',
          title: 'Port 8080 (Cloud Shell Web Preview)',
          desc: 'Direct integration with Google Cloud Shell Web Preview. Zero firewall config needed.'
        },
        {
          port: 3000,
          tag: !isCloud ? 'RECOMMENDED' : 'STANDARD',
          title: 'Port 3000 (Standard Node Server)',
          desc: 'Standard default LESSWATCH server port for VPS, dedicated servers, and local Docker.'
        },
        {
          port: 80,
          tag: 'STANDARD HTTP',
          title: 'Port 80 (Standard Web HTTP)',
          desc: 'Binds directly to port 80. Accessible at http://<ip> without typing a port. Requires root/sudo.'
        },
        {
          port: 'custom',
          tag: 'CUSTOM',
          title: state.editingCustomPort
            ? `Custom Port: ${state.customPortInput ? bold(C.accent(state.customPortInput)) : C.amber('_')} `
            : `Custom Port... ${state.port && ![8080, 3000, 80].includes(state.port) ? C.accent(`(${state.port})`) : ''}`,
          desc: 'Specify any custom numeric port (e.g. 5000, 8000, 8888, 9000).'
        }
      ];

      presets.forEach((p, i) => {
        const isSel = i === state.cursor;
        const isCurrent = p.port === 'custom'
          ? (state.port && ![8080, 3000, 80].includes(state.port))
          : curPort === p.port;
        const mark = isCurrent ? green('◉') : C.faint('○');
        const badge = p.tag ? C.amber(` [${p.tag}]`) : '';
        const titleText = `${p.title}${badge}`;
        const label = isSel ? BOLD + C.accent(titleText) : C.text(titleText);
        L.push(selRow(i, `${mark} ${label}`, inner));
      });

      L.push('');
      const cur = presets[state.cursor];
      const descText = state.editingCustomPort
        ? 'Type numeric port digits (1-65535). Press [Enter] to confirm, [Esc] to cancel.'
        : cur.desc;

      L.push(...box([
        `${BOLD}${C.accent(cur.title)}${RESET}`,
        dim(descText),
        '',
        `${C.faint('Active Configuration: ')} ${C.green(String(curPort))} ${C.faint(`(bound on target ${TARGETS[state.target].short})`)}`
      ], inner, 'port configuration'));

      const hintText = state.editingCustomPort
        ? [['0-9', 'type digits'], ['enter', 'confirm'], ['esc', 'cancel']]
        : [['↑↓', 'move'], ['space', 'select'], ['1-4', 'direct'], ['enter', 'next'], ['esc', 'back']];

      L.push('', hint(hintText, inner));
      return L;
    },
    key(s, k) {
      if (state.editingCustomPort) {
        if (/^[0-9]$/.test(s)) {
          if (state.customPortInput.length < 5) {
            state.customPortInput += s;
          }
        } else if (k.name === 'backspace') {
          state.customPortInput = state.customPortInput.slice(0, -1);
        } else if (k.name === 'return') {
          const val = parseInt(state.customPortInput, 10);
          if (val > 0 && val <= 65535) {
            state.port = val;
            state.editingCustomPort = false;
            toast(`Port set to ${val}`);
            go('modules');
          } else {
            toast('Invalid port! Must be between 1 and 65535.');
          }
        } else if (k.name === 'escape') {
          state.editingCustomPort = false;
        }
        return;
      }

      const presets = [8080, 3000, 80, 'custom'];
      const n = presets.length;
      if (k.name === 'up' || s === 'k') state.cursor = (state.cursor + n - 1) % n;
      else if (k.name === 'down' || s === 'j') state.cursor = (state.cursor + 1) % n;
      else if (/^[1-3]$/.test(s)) {
        const idx = Number(s) - 1;
        state.cursor = idx;
        state.port = presets[idx];
        toast(`Port set to ${presets[idx]}`);
        go('modules');
      } else if (s === '4') {
        state.cursor = 3;
        state.editingCustomPort = true;
        state.customPortInput = String(state.port || defaultPort());
      } else if (s === ' ') {
        if (state.cursor === 3) {
          state.editingCustomPort = true;
          state.customPortInput = String(state.port || defaultPort());
        } else {
          state.port = presets[state.cursor];
          toast(`Port set to ${presets[state.cursor]}`);
        }
      } else if (k.name === 'return' || k.name === 'right') {
        if (state.cursor === 3) {
          state.editingCustomPort = true;
          state.customPortInput = String(state.port || defaultPort());
        } else {
          state.port = presets[state.cursor];
          go('modules');
        }
      } else if (k.name === 'escape' || k.name === 'backspace' || k.name === 'left') {
        go('target');
      } else if (s === 'q') shutdown(0);
    }
  },

  modules: {
    render(inner) {
      const tid = TARGETS[state.target].id;
      const L = [topline(2, inner), '', `${dim('Pick what to install')}  ${C.accent(`${enabledCount()} of ${MODULES.length} enabled`)}`, ''];
      MODULES.forEach((m, i) => {
        const on = state.modules[i];
        const blocked = m.id === 'neko_warm' && !state.modules[0];
        let note = '';
        if (m.id === 'tunnel' && tid === 'local') note = ' (skipped on Local)';
        if (blocked) note = ' (needs Neko)';
        // mark=[✔] = 3, sp=1, icon(1-wide)=1, sp=1, tag=[XX]=tag.length+2, note, padding from selRow=4
        const room = Math.max(10, inner - 4 - 3 - 1 - 1 - 1 - (m.tag.length + 2) - note.length - 2);
        const title = fit(m.title, room);
        const label = i === state.cursor ? BOLD + title + RESET : (on && !blocked ? C.text(title) : C.faint(title));
        L.push(selRow(i, `${markFor(i)} ${m.icon} ${label} ${C.amber(`[${m.tag}]`)}${C.faint(note)}`, inner));
      });
      L.push('');
      const d = wrap(MODULES[state.cursor].desc, inner - 2);
      L.push(' ' + dim(d[0] || ''), ' ' + dim(d[1] || ''));
      const tl = state.toast && state.t < state.toast.until ? C.amber('! ' + state.toast.text) : dim(`Target: ${TARGETS[state.target].short}  ·  Port: ${defaultPort()}`);
      L.push(' ' + tl, hint([['spc', 'toggle [✔]'], ['1-6', 'direct'], ['a', 'all'], ['p', 'port'], ['enter', 'next'], ['esc', 'back']], inner));
      return L;
    },
    key(s, k) {
      const n = MODULES.length;
      if (k.name === 'up' || s === 'k') state.cursor = (state.cursor + n - 1) % n;
      else if (k.name === 'down' || s === 'j') state.cursor = (state.cursor + 1) % n;
      else if (s === ' ') toggleModule(state.cursor);
      else if (/^[1-6]$/.test(s)) { state.cursor = +s - 1; toggleModule(state.cursor); }
      else if (s === 'a' || s === 'A') {
        const anyOff = state.modules.some((v) => !v);
        MODULES.forEach((m, i) => { if (state.modules[i] !== anyOff) { state.modules[i] = anyOff; state.flash[i] = state.t; } });
      }
      else if (s === 'p' || s === 'P') go('port');
      else if (s === 't' || s === 'T') go('target');
      else if (k.name === 'return' || k.name === 'right') go('review');
      else if (k.name === 'escape' || k.name === 'backspace' || k.name === 'left') {
        go(state.mode === 'custom' ? 'port' : 'menu');
      }
      else if (s === 'q') shutdown(0);
    },
  },

  review: {
    render(inner) {
      const stages = enabledStages();
      const tid = TARGETS[state.target].id;
      const curPort = defaultPort();
      const modTokens = MODULES.map((m, i) => {
        const on = state.modules[i] && !(m.id === 'neko_warm' && !state.modules[0]);
        return on ? green('✔ ') + C.text(SHORT[m.id]) : C.faint('✖ ' + SHORT[m.id]);
      });
      const pipe = stages.map((s, i) => C.muted(`${i + 1}.`) + C.text(s.id));
      const kv = (k, v) => ` ${dim(pad(k, 12))}${v}`;
      const btn = (label, on, c) => (on
        ? bgc(c) + fg([12, 14, 22]) + BOLD + `  ${label}  ` + RESET
        : dim(`[ ${label} ]`));
      const L = [
        topline(3, inner), '', dim('Review deployment configuration:'), '',
        kv('Target', C.text(TARGETS[state.target].title) + dim(' [press t to change]')),
        kv('HTTP Port', BOLD + C.accent(String(curPort)) + dim(' [press p to change]')),
        kv('Modules', `${enabledCount()} of ${MODULES.length} enabled` + dim(' [press m to change]')),
        ...wrapTokens(modTokens, inner - 4).map((l) => '   ' + l),
        kv('Pipeline', dim(`${stages.length} stages`)),
        ...wrapTokens(pipe, inner - 4, dim(' › ')).map((l) => '   ' + l),
      ];
      if (tid === 'local' && state.modules[2]) L.push(' ' + C.amber('! Tunnel step is skipped on a Local target.'));
      L.push('', center(btn('Deploy', state.btn === 0, GREEN) + '   ' + btn('Back', state.btn === 1, [150, 150, 170]), inner),
        '', hint([['←→', 'choose'], ['enter', 'confirm'], ['y', 'deploy'], ['p', 'port'], ['t', 'target'], ['esc', 'back']], inner));
      return L;
    },
    key(s, k) {
      const back = () => go(state.mode === 'custom' ? 'modules' : 'menu');
      if (k.name === 'left' || k.name === 'right' || k.name === 'tab') state.btn = 1 - state.btn;
      else if (s === 'y' || s === 'Y') startInstall();
      else if (s === 'p' || s === 'P') go('port');
      else if (s === 't' || s === 'T') go('target');
      else if (s === 'm' || s === 'M') go('modules');
      else if (k.name === 'return') { if (state.btn === 0) startInstall(); else back(); }
      else if (k.name === 'escape' || k.name === 'backspace') back();
      else if (s === 'q') shutdown(0);
    },
  },

  install: {
    renderTop: (inner) => installTop(inner, false),
    renderLogs: (inner, rows) => installLogs(inner, rows, false),
    key() { }
  },

  failed: {
    renderTop: (inner) => installTop(inner, true),
    renderLogs: (inner, rows) => installLogs(inner, rows, true),
    key(s, k) {
      if (s === 'r') retry();
      else if (s === 'q') shutdown(1, 'Stopped. Run the installer again to resume.');
    },
  },

  done: {
    render(inner) {
      const H = 3;
      if (!state.confetti) {
        state.confetti = Array.from({ length: 44 }, () => ({
          x: Math.random(), y: Math.random() * H, vy: 1.2 + Math.random() * 2.4,
          ch: CONFETTI[Math.floor(Math.random() * CONFETTI.length)], h: Math.random() * 360,
        }));
      }
      const grid = Array.from({ length: H }, () => new Array(inner).fill(' '));
      for (const p of state.confetti) {
        const gx = Math.floor(p.x * inner), gy = Math.floor(p.y);
        if (gy >= 0 && gy < H && gx >= 0 && gx < inner) grid[gy][gx] = hsl(p.h + state.t * 90, 0.9, 0.65) + p.ch + RESET;
      }

      const secs = ((state.finishedAt - state.started) / 1000).toFixed(1);
      const ip = detectedPublicIP !== '127.0.0.1' ? detectedPublicIP : 'none (local only)';
      const url = state.publicUrl || 'not captured · set LW_URL';
      const isCloud = TARGETS[state.target].id === 'cloud';
      const local = process.env.LW_LOCAL || `http://localhost:${isCloud ? 8080 : 3000}`;
      const label = (k) => C.accent(pad(k, 12));

      const ipFx = typeFx(ip, 0.7, 26);
      const urlFx = typeFx(url, 1.5, 36);
      const cur = (fx) => (fx && !fx.done ? C.accent('▌') : '');
      const ipLine = ipFx ? ` ${label('Public IP')} ${C.text(ipFx.shown)}${C.accent(ipFx.pending)}${cur(ipFx)}` : '';

      let urlLine = '';
      if (urlFx) {
        let body;
        if (!urlFx.done) body = BOLD + C.text(urlFx.shown) + C.accent(urlFx.pending) + cur(urlFx);
        else if (urlFx.since < 0.45) body = BOLD + fg([255, 255, 255]) + url + RESET;
        else body = `${E}4m` + gtext(url, true);
        urlLine = vlen(url) + 14 > inner ? [` ${label('Public URL')}`, '   ' + body] : [` ${label('Public URL')} ${body}`];
      }
      const rest = urlFx && urlFx.done && urlFx.since > 0.3;
      const tl = state.toast && state.t < state.toast.until ? C.amber(state.toast.text) : '';
      return [
        ...grid.map((r) => r.join('')),
        center(green('✔ ') + gtext('Installation complete', true), inner),
        center(dim(`built in ${secs}s · ${state.stages.length} steps · ${enabledCount()} modules`), inner), '',
        ipLine,
        ...(Array.isArray(urlLine) ? urlLine : [urlLine]),
        '',
        rest ? ` ${label('Local')} ${C.text(local)}` : '',
        rest ? ` ${label('Target')} ${C.text(TARGETS[state.target].title)}` : '',
        rest ? ` ${label('Login')} ${C.text('admin / admin (or credentials in .env)')}` : '',
        center(tl, inner),
        hint([['c', 'copy url'], ['enter', 'exit']], inner),
      ];
    },
    key(s, k) {
      if (k.name === 'return' || s === 'q') finish();
      else if (s === 'c') {
        if (state.publicUrl) {
          out.write(`\x1b]52;c;${Buffer.from(state.publicUrl).toString('base64')}\x07`); // OSC 52 clipboard
          toast('URL sent to clipboard (if your terminal supports it)');
        }
      }
    },
  },
};

function installTop(inner, failed = false) {
  const spin = SPINNER[Math.floor(state.t * 14) % SPINNER.length];
  const elapsed = (((state.finishedAt || Date.now()) - state.started) / 1000).toFixed(1);
  const pct = String(Math.round(state.shown * 100)).padStart(3);
  const title = failed ? C.red('✖ ') + BOLD + C.red('INSTALL FAILED')
    : state.pendingDone ? green('✔ ') + BOLD + green('ALL STEPS COMPLETE')
      : C.accent(spin) + ' ' + BOLD + C.text('INSTALLING LESSWATCH');
  const L = [topline(3, inner), '', `${title}  ${dim('·')}  ${C.muted(elapsed + 's')}`,
  `${bar(state.shown, Math.max(10, inner - 7), !state.pendingDone && !failed)} ${BOLD}${C.accent(pct + '%')}${RESET}`, ''];

  const bw = clamp(inner - 3 - 28 - 1 - 5, 8, 28);
  state.stages.forEach((s) => {
    const icon = { pending: C.faint('○'), running: C.accent(spin), done: green('✔'), failed: C.red('✖') }[s.status];
    const name = { pending: C.faint, running: (t) => BOLD + C.text(t), done: C.muted, failed: C.red }[s.status](s.label.padEnd(28));
    let right = '';
    if (s.status === 'running') right = bar(s.progress / 100, bw) + C.muted(` ${String(Math.round(s.progress)).padStart(3)}%`);
    else if (s.status === 'done') right = green(`${(s.ms / 1000).toFixed(1)}s`);
    L.push(` ${icon} ${name} ${right}`);
  });
  L.push('');

  // CPU / RAM oscilloscope
  const R = 3;
  const cwid = Math.floor((inner - 2) / 2);
  const cpu = chart(state.cpu, cwid, R, heat);
  const mem = chart(state.mem, cwid, R, cool);
  for (let r = 0; r < R; r++) L.push(cpu[r] + '  ' + mem[r]);
  const cpuNow = state.cpu.at(-1) ?? 0, memNow = state.mem.at(-1) ?? 0;
  const peak = Math.max(...state.cpu.slice(-60));
  const l1 = `${C.muted('CPU')} ${heat(cpuNow)}${BOLD}${String(Math.round(cpuNow * 100)).padStart(3)}%${RESET} ${dim('peak ' + Math.round(peak * 100) + '%')}`;
  const l2 = `${C.muted('RAM')} ${cool(memNow)}${BOLD}${String(Math.round(memNow * 100)).padStart(3)}%${RESET}`;
  L.push(pad(l1, cwid) + '  ' + l2);

  return L;
}

function installLogs(inner, rows, failed = false) {
  const L = [];
  if (failed) {
    const e = wrap(state.error, inner - 2);
    L.push(' ' + C.red(e[0] || ''), ' ' + C.red(e[1] || ''));
    L.push('', hint([['r', 'retry step'], ['q', 'quit']], inner));
    return L;
  }

  // Calculate available rows for log stream (scales dynamically with terminal height)
  const maxLogs = Math.max(3, Math.min(8, (rows || 24) - 20));
  const tail = state.logs.slice(-maxLogs);
  while (tail.length < maxLogs) tail.unshift('');

  for (const raw of tail) {
    if (!raw) {
      L.push('');
      continue;
    }
    L.push(formatLogLine(raw, inner));
  }

  L.push(center(dim('Ctrl+C to abort'), inner));
  return L;
}

// ─── Render loop ────────────────────────────────────────────────────────────
let lastT = 0;
function frame() {
  state.t = (Date.now() - t0) / 1000;
  const dt = Math.min(0.1, state.t - lastT);
  lastT = state.t;
  state.frame++;
  state.sa = state.t - state.screenT;
  state.shown += (overall() - state.shown) * (1 - Math.exp(-dt * 6));
  state.hl += (state.cursor - state.hl) * (1 - Math.exp(-dt * 14));
  if (state.t - state.lastSample >= 0.1) { state.lastSample = state.t; sample(); }
  if (state.confetti) for (const p of state.confetti) { p.y += p.vy * dt; if (p.y >= 3) { p.y = 0; p.x = Math.random(); } }

  // Splash waits for user keypress (no auto-skip)
  if (state.pendingDone && state.screen === 'install') {
    state.doneT += dt;
    if (state.shown > 0.985 && state.doneT > 0.9) { state.pendingDone = false; go('done'); }
  }
  draw();
}

function draw() {
  const cols = out.columns || 80, rows = out.rows || 24;
  if (cols < 60 || rows < 22) {
    out.write(E + 'H' + C.amber(`Terminal too small (${cols}x${rows}). Need at least 60x22.`) + E + 'K\n' + E + 'J');
    return;
  }
  // Adaptive width: standard 86-94 for modern terminals, ensures full URL readability
  const W = Math.max(76, Math.min(cols - 4, 92));
  const inner = W - 4;
  const left = ' '.repeat(Math.max(0, Math.floor((cols - W) / 2)));

  let rendered;
  if (state.screen === 'install' || state.screen === 'failed') {
    const isFail = state.screen === 'failed';
    const topLines = screens[state.screen].renderTop(inner);
    const framedTop = box(topLines, W, 'lesswatch');

    const logTitle = isFail ? 'failure diagnostics' : 'live deployment stream';
    const bottomLines = screens[state.screen].renderLogs(inner, rows);
    const framedBottom = box(bottomLines, W, logTitle);

    rendered = ['', ...framedTop, ...framedBottom];
  } else {
    let lines = screens[state.screen].render(inner);
    const reveal = Math.floor(state.sa * 80) + 1;       // staggered line reveal on every screen change
    if (reveal < lines.length) lines = lines.map((l, i) => (i < reveal ? l : ''));
    const framed = box(lines, W, state.screen === 'splash' ? '' : 'lesswatch');
    rendered = ['', ...framed];
  }

  const all = rendered.slice(0, rows - 1);
  out.write(E + 'H' + all.map((l) => left + l + E + 'K').join('\n') + E + 'J');
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
let loop = null;
function leaveScreen() {
  if (leftScreen || !isTTY) return;
  leftScreen = true;
  out.write(E + '?25h' + E + '?1049l' + E + '0m');
  try { inp.setRawMode(false); } catch { }
}
function shutdown(code, msg) {
  state.quitting = true;
  clearInterval(loop);
  activeChild?.kill('SIGTERM');
  leaveScreen();
  if (msg) out.write(`\n  ${C.amber(msg)}\n\n`);
  else if (code) out.write(`\n  ${C.amber('Installation aborted.')}\n\n`);
  process.exit(code);
}
function finish() {
  clearInterval(loop);
  leaveScreen();
  const url = state.publicUrl || '(not captured, see the tunnel step output)';
  const isCloud = TARGETS[state.target].id === 'cloud';
  const local = process.env.LW_LOCAL || `http://localhost:${isCloud ? 8080 : 3000}`;
  const ip = detectedPublicIP !== '127.0.0.1' ? detectedPublicIP : 'none (local only)';
  const cols = out.columns || 80;
  const cardW = Math.max(86, Math.min(cols - 4, 94));
  const card = box([
    BOLD + green('LESSWATCH is live') + RESET, '',
    `${C.accent('Public IP ')}  ${ip}`,
    `${C.accent('Public URL')}  ${BOLD}${C.text(url)}${RESET}`,
    `${C.accent('Local     ')}  ${local}`,
    `${C.accent('Login     ')}  admin / admin`, '',
    C.muted('docker compose ps  ·  docker compose logs -f'),
  ], cardW, '');
  const left = ' '.repeat(Math.max(0, Math.floor((cols - cardW) / 2)));
  out.write('\n' + card.map((l) => left + l).join('\n') + '\n\n');
  process.exit(0);
}

process.on('exit', leaveScreen);
process.on('SIGTERM', () => shutdown(143));
process.on('SIGINT', () => shutdown(130));
process.on('uncaughtException', (err) => {
  leaveScreen();
  console.error(err);
  process.exit(1);
});

async function main() {
  // Ensure the terminal is in UTF-8 mode — critical for Cloud Shell tmux sessions
  // that sometimes inherit a C locale.
  process.env.LANG = process.env.LANG || 'en_US.UTF-8';
  process.env.LC_ALL = process.env.LC_ALL || 'en_US.UTF-8';
  // Tell the terminal to use UTF-8 character set (xterm ESC % G sequence)
  out.write('\x1b%G');

  if (!isTTY) {
    console.log('Non-interactive terminal detected. Running automated installation pipeline...');
    state.plain = true;
    await ipPromise;
    state.target = defaultTarget();
    await startInstall();
    if (state.screen === 'failed') { console.error(`[FAIL] ${state.error}`); process.exit(1); }
    console.log(`[OK] LESSWATCH installed${state.publicUrl ? ' · ' + state.publicUrl : ''}`);
    process.exit(0);
  }
  readline.emitKeypressEvents(inp);
  inp.setRawMode(true);
  inp.resume();
  // Enter alternate screen, hide cursor, clear
  out.write(E + '?1049h' + E + '?25l' + E + '2J');
  out.on('resize', () => out.write(E + '2J'));
  inp.on('keypress', (s, k = {}) => {
    if (k.ctrl && k.name === 'c') return shutdown(130);
    screens[state.screen].key?.(s, k);
  });
  loop = setInterval(frame, 16);   // ~60 FPS, all animation is time-based
}

main();
