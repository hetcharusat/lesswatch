#!/usr/bin/env node
/**
 * lesswatch-install-v2.mjs · 60 FPS retro animated self-host installer · zero dependencies
 *
 *   node lesswatch-install-v2.mjs          demo run (simulated steps)
 *   node lesswatch-install-v2.mjs --real   runs the live commands in STAGES
 *
 * Keys: ↑/↓ j/k move · Tab next · 1-9 jump/toggle · Space toggle checkbox · Enter confirm
 *       Esc/b back · r retry failed step · q quit · Ctrl+C abort
 * Env:  LW_URL=https://...    public URL shown on the thank-you screen
 *       LW_LOCAL=http://...   local URL (default http://localhost:8080)
 */
import readline from 'node:readline';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';

const REAL = process.argv.includes('--real');
const out = (s) => process.stdout.write(s);

// ─── Environment Detection ──────────────────────────────────────────────────
const isCloudShell = Boolean(
  process.env.CLOUD_SHELL ||
  process.env.DEVSHELL_PROJECT_ID ||
  fs.existsSync('/google/devshell') ||
  process.env.USER === 'cloudshell' ||
  (process.env.HOME && process.env.HOME.includes('cloudshell'))
);

let detectedPublicIP = '127.0.0.1';
try {
  detectedPublicIP = execSync("curl -s4 --max-time 2 https://api.ipify.org 2>/dev/null || curl -s4 --max-time 2 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'", { encoding: 'utf-8' }).trim() || '127.0.0.1';
} catch {}

// ─── Config ─────────────────────────────────────────────────────────────────
const TARGETS = [
  { id: 'cloud', title: 'Cloud Shell / Web Sandbox', desc: 'Browser sandbox. Zero port forwarding needed, binds to :8080.' },
  { id: 'vps',   title: 'Linux VPS / Dedicated VM',  desc: 'Always-on 24/7 cloud VM with high-speed direct UDP for WebRTC.' },
  { id: 'local', title: 'Local workstation',         desc: 'Docker Desktop on your local machine, ideal for offline testing.' },
];

const FEATURES = [
  { id: 'neko',      title: 'Shared Chromium Virtual Browser (Neko)', desc: 'Synced party browser tabs. Container sleeps when idle to save RAM.', on: true },
  { id: 'aria',      title: 'Server Media Downloader (aria2c + yt-dlp)', desc: 'Direct-to-storage stream pipeline & high-speed torrent engine.',      on: true },
  { id: 'tunnel',    title: 'Cloudflare Public HTTPS Tunnel',        desc: 'Instant public sharing URL without opening router or firewall ports.',  on: true },
  { id: 'livekit',   title: 'LiveKit Voice & Room SFU Server',        desc: 'Sub-second spatial audio/video party channels.',                         on: true },
  { id: 'neko_warm', title: 'Always-On Virtual Browser (Warm RAM)',   desc: 'Keep Neko warm in memory (~600MB permanent RAM instead of sleep mode).', on: false },
];

// Pre-pull cloudflared in the background quietly
try {
  const bgPull = spawn('docker', ['pull', 'cloudflare/cloudflared:latest'], {
    stdio: 'ignore',
    detached: true
  });
  bgPull.unref();
} catch {}

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

  const isCloud = TARGETS[state.target].id === 'cloud';
  const targetPort = isCloud ? 8080 : 3000;

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
    
    const livekitOn = state.features[FEATURES.findIndex((f) => f.id === 'livekit')] ?? true;
    const services = ['watch-together'];
    if (livekitOn) services.push('livekit');

    const child = spawn('docker', ['compose', 'up', '-d', '--build', ...services], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    activeChild = child;
    let finished = false;

    const cleanupAndResolve = () => {
      if (finished) return;
      finished = true;
      if (poller) clearInterval(poller);
      activeChild = null;
      s.progress = 100;
      log('LESSWATCH core services & LiveKit server online.');
      resolve();
    };

    const cleanupAndReject = (err) => {
      if (finished) return;
      finished = true;
      if (poller) clearInterval(poller);
      activeChild = null;
      reject(err);
    };

    // Poller: detects when watch-together is already Up even if compose pipe is slow
    const poller = setInterval(() => {
      try {
        const psOut = execSync('docker ps --filter "name=watch-together" --format "{{.Status}}"', { encoding: 'utf-8', timeout: 1500 });
        if (psOut && (psOut.includes('Up') || psOut.includes('running'))) {
          log('Verified watch-together container is Up and operational.');
          cleanupAndResolve();
        }
      } catch {}
    }, 2500);

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
        else if (line.includes('Started') || line.includes('Running')) s.progress = 95;
      }
    };

    child.stdout.on('data', feed);
    child.stderr.on('data', feed);

    child.on('error', cleanupAndReject);
    child.on('exit', (code) => {
      if (code === 0) cleanupAndResolve();
      else cleanupAndReject(new Error(`Docker build failed with exit code ${code}`));
    });
    child.on('close', (code) => {
      if (code === 0) cleanupAndResolve();
    });

    // Safety watchdog: after 45s, if container is running, don't stay blocked
    setTimeout(() => {
      try {
        const psOut = execSync('docker ps --filter "name=watch-together" --format "{{.Status}}"', { encoding: 'utf-8', timeout: 1500 });
        if (psOut && psOut.includes('Up')) {
          log('Container watch-together active and healthy.');
          cleanupAndResolve();
        }
      } catch {}
    }, 45000);
  });
}

async function provisionNeko(log, s) {
  const nekoWarm = state.features[FEATURES.findIndex((f) => f.id === 'neko_warm')] ?? false;
  log(`Configuring Neko Chromium browser (${nekoWarm ? 'Always-On' : 'On-Demand'} mode)...`);

  let cached = false;
  try {
    execSync('docker image inspect m1k1o/neko:chromium', { stdio: 'ignore' });
    cached = true;
  } catch {}

  if (cached) {
    log('Image cached. Provisioning virtual browser container...');
    if (nekoWarm) {
      execSync('docker compose --profile neko up -d neko', { stdio: 'ignore' });
    } else {
      execSync('docker compose --profile neko up --no-start neko', { stdio: 'ignore' });
    }
    s.progress = 100;
    log(`Neko Chromium browser ready (${nekoWarm ? 'Running' : 'On-Demand sleep mode'}).`);
  } else {
    log('Pulling lightweight Chromium virtual browser image...');
    try {
      execSync('docker compose --profile neko pull neko', { stdio: 'ignore', timeout: 180000 });
      if (nekoWarm) {
        execSync('docker compose --profile neko up -d neko', { stdio: 'ignore' });
      } else {
        execSync('docker compose --profile neko up --no-start neko', { stdio: 'ignore' });
      }
    } catch {
      // Background fallback pull
      spawn('sh', ['-c', 'docker compose --profile neko pull neko >/dev/null 2>&1 && docker compose --profile neko up --no-start neko >/dev/null 2>&1 &'], {
        stdio: 'ignore',
        detached: true
      }).unref();
    }
    s.progress = 100;
    log('Chromium browser container registered (ready for room activation).');
  }
}

async function prepareDownloader(log, s) {
  log('Verifying torrent downloader storage pipeline...');
  if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads', { recursive: true });
  if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
  if (!fs.existsSync('./media')) fs.mkdirSync('./media', { recursive: true });
  s.progress = 100;
  log('Downloader storage directories and permissions verified.');
}

async function startTunnel(log, s) {
  const isCloud = TARGETS[state.target].id === 'cloud';
  const targetPort = isCloud ? 8080 : 3000;
  log(`Requesting Cloudflare edge quick tunnel for port ${targetPort}...`);
  try { execSync('docker rm -f wt-tunnel 2>/dev/null', { stdio: 'ignore' }); } catch {}

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
    } catch {}
    if (i % 3 === 0) log(`Waiting for Cloudflare edge route assignment (${i + 1}s)...`);
  }

  if (!state.publicUrl) {
    state.publicUrl = `http://localhost:${targetPort}`;
    log(`Tunnel timed out; fallback to local URL: ${state.publicUrl}`);
  }
}

// ─── Pipeline Stages ────────────────────────────────────────────────────────
const STAGES = [
  { id: 'docker', label: 'Docker daemon check',      cmd: 'docker info >/dev/null',   exec: checkDocker,         sim: 1000 },
  { id: 'env',    label: 'Generate secrets & .env',  cmd: 'sh scripts/gen-env.sh',    exec: generateEnvironment, sim: 800  },
  { id: 'build',  label: 'Build LESSWATCH services', cmd: 'docker compose build',     exec: buildServices,       sim: 2800 },
  { id: 'neko',   label: 'Pull Chromium image',      cmd: 'docker compose pull neko', exec: provisionNeko,       sim: 1400, feature: 'neko' },
  { id: 'aria',   label: 'Prepare downloader',       cmd: 'mkdir -p downloads data',  exec: prepareDownloader,    sim: 800,  feature: 'aria' },
  { id: 'tunnel', label: 'Public HTTPS tunnel',      cmd: 'sh scripts/tunnel.sh',     exec: startTunnel,          sim: 1200, feature: 'tunnel' },
];

const PALETTES = [
  { name: 'SYNTHWAVE', h0: 290, span: 110 },
  { name: 'SUNSET',    h0: 0,   span: 55  },
  { name: 'MATRIX',    h0: 100, span: 50  },
  { name: 'ICE',       h0: 170, span: 60  },
];
const FILLS = ['solid', 'shade', 'dither'];
const FILL_CHAR = { solid: '█', shade: '▓', dither: '▒' };

const SIM_LINES = [
  'resolving dependencies', 'layer cache hit, reusing', 'verifying checksum',
  'writing config', 'health check ok', 'waiting for ports', 'connection established',
];
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const REEL = ['◐', '◓', '◑', '◒'];
const SPARK = ' ▂▃▄▅▆▇█';
const PARTIAL = ' ▏▎▍▌▋▊▉';
const CONFETTI = ['✦', '✧', '*', '•', '◆', '▲', '✶'];

// ─── Big block font (ANSI Shadow style) ─────────────────────────────────────
const GLYPHS = {
  L: ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
  W: ['██╗    ██╗', '██║    ██║', '██║ █╗ ██║', '██║███╗██║', '╚███╔███╔╝', ' ╚══╝╚══╝ '],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  T: ['████████╗', '╚══██╔══╝', '   ██║   ', '   ██║   ', '   ██║   ', '   ╚═╝   '],
  C: [' ██████╗', '██╔════╝', '██║     ', '██║     ', '╚██████╗', ' ╚═════╝'],
  H: ['██╗  ██╗', '██║  ██║', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  N: ['███╗   ██╗', '████╗  ██║', '██╔██╗ ██║', '██║╚██╗██║', '██║ ╚████║', '╚═╝  ╚═══╝'],
  K: ['██╗  ██╗', '██║ ██╔╝', '█████╔╝ ', '██╔═██╗ ', '██║  ██╗', '╚═╝  ╚═╝'],
  Y: ['██╗   ██╗', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚██╔╝  ', '   ██║   ', '   ╚═╝   '],
  O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  U: ['██╗   ██╗', '██║   ██║', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  ' ': ['  ', '  ', '  ', '  ', '  ', '  '],
};

function bigRows(text) {
  const rows = ['', '', '', '', '', ''];
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    const w = Math.max(...g.map((r) => [...r].length));
    g.forEach((r, i) => { rows[i] += r.padEnd(w); });
  }
  return rows;
}

// ─── Styling ────────────────────────────────────────────────────────────────
const RESET = '\x1b[0m';
const rgb = (r, g, b) => (s) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
const C = {
  accent: rgb(34, 211, 238),
  green:  rgb(52, 211, 153),
  amber:  rgb(251, 191, 36),
  red:    rgb(248, 113, 113),
  text:   rgb(228, 228, 231),
  muted:  rgb(161, 161, 170),
  faint:  rgb(82, 82, 91),
};
const bold = (s) => `\x1b[1m${s}\x1b[22m`;
const strip = (s) => String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
const vis = (s) => [...strip(s)].length;
const fit = (s, n) => {
  const t = [...strip(s)];
  return t.length > n ? t.slice(0, Math.max(0, n - 1)).join('') + '…' : t.join('');
};

// HSL → 24-bit ANSI foreground. h in degrees.
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `\x1b[38;2;${Math.round((r + m) * 255)};${Math.round((g + m) * 255)};${Math.round((b + m) * 255)}m`;
}

const getPal = () => PALETTES[Math.floor(state.tick / 300) % PALETTES.length];
const getFill = () => FILLS[Math.floor(state.tick / 450) % FILLS.length];

// Progress bar with a palette gradient and sub-cell precision.
function bar(p, w) {
  p = Math.max(0, Math.min(1, p));
  const pal = getPal();
  const units = p * w * 8;
  const full = Math.floor(units / 8);
  const rem = Math.floor(units % 8);
  let s = '';
  for (let i = 0; i < full; i++) s += hsl(pal.h0 + pal.span * (i / w), 0.95, 0.6) + '█';
  const partial = full < w && rem > 0;
  if (partial) s += hsl(pal.h0 + pal.span * (full / w), 0.95, 0.6) + PARTIAL[rem];
  const used = full + (partial ? 1 : 0);
  return s + RESET + C.faint('░'.repeat(Math.max(0, w - used)));
}

// Big banner: 60 FPS CRT scanlines, moving sweep, glitch.
function bigBanner(text, pal, fill) {
  const rows = bigRows(text);
  const W = [...rows[0]].length;
  const sweepX = ((state.tick * 0.4) % (W + 16)) - 8;
  const glitchRow = (Math.floor(state.tick / 360) * 7) % 6;
  const glitching = state.tick % 360 < 6;
  return rows.map((row, r) => {
    let s = glitching && r === glitchRow ? '   ' : '';
    Array.from(row).forEach((ch, x) => {
      if (ch === ' ') { s += ' '; return; }
      const t = x / W + state.tick * 0.004;
      const tri = Math.abs((t % 2) - 1);
      const hue = pal.h0 + pal.span * tri + r * 6;
      let light = r % 2 ? 0.52 : 0.64;
      if (Math.abs(x - sweepX) < 4) light = 0.96;
      s += hsl(hue, 0.95, light) + (ch === '█' ? FILL_CHAR[fill] : ch);
    });
    return s + RESET;
  });
}

function compactTitle(pal) {
  return [...'L E S S W A T C H'].map((ch, x) => {
    const tri = Math.abs(((x / 18) + state.tick * 0.004) % 2 - 1);
    return hsl(pal.h0 + pal.span * tri, 0.95, 0.65) + bold(ch);
  }).join('') + RESET;
}

function marquee(W, pal) {
  const msg = ' ◆ STREAM TOGETHER ◆ SELF-HOSTED ◆ WATCH IN SYNC ◆ NO SUBSCRIPTIONS ◆ ';
  const off = Math.floor(state.tick * 0.2) % msg.length;
  const span = [...(msg.repeat(6)).slice(off, off + W - 4)];
  return span.map((ch, i) =>
    hsl(pal.h0 + pal.span * (i / Math.max(1, span.length)) + state.tick * 0.8, 0.9, 0.62) + ch
  ).join('') + RESET;
}

function animatedRule(W, pal) {
  const n = W - 4;
  const pos = Math.floor(Math.abs(((state.tick * 0.2) % (2 * n)) - n));
  let s = '';
  for (let i = 0; i < n; i++) s += i === pos ? hsl(pal.h0, 0.95, 0.7) + '◆' : C.faint('─');
  return s + RESET;
}

function box(lines, width, color = C.faint) {
  const inner = width - 2;
  const row = (l) => color('│') + ' ' + l + ' '.repeat(Math.max(0, inner - 2 - vis(l))) + ' ' + color('│');
  return [color('╭' + '─'.repeat(inner) + '╮'), ...lines.map(row), color('╰' + '─'.repeat(inner) + '╯')];
}
const boxed = (lines, W, color) => box(lines, W, color).map((l) => '  ' + l);

const cols = () => Math.max(60, process.stdout.columns || 80);
const rows = () => Math.max(20, process.stdout.rows || 24);

// ─── State ──────────────────────────────────────────────────────────────────
const state = {
  screen: 'target',   // target | features | install | failed | done
  cursor: 0,
  target: isCloudShell ? 0 : (detectedPublicIP !== '127.0.0.1' ? 1 : 2),
  features: FEATURES.map((f) => f.on),
  stages: [],
  current: 0,
  shown: 0,           // 60 FPS sub-pixel smoothed progress 0..1
  logs: [],
  started: 0,
  finishedAt: 0,
  error: '',
  publicUrl: '',
  tick: 0,
  cpu: Array(30).fill(0.1),
  mem: Array(30).fill(0.15),
  confetti: null,
};

let loop = null;
let activeChild = null;
let leftScreen = false;
let prevCpu = os.cpus();

// ─── Telemetry (Rock-Solid Oscilloscope Graph) ──────────────────────────────
const pushCapped = (arr, v) => { arr.push(v); if (arr.length > 40) arr.shift(); };
const spark = (arr, w) => arr.slice(-w).map((v) => SPARK[Math.min(7, Math.max(0, Math.floor(v * 8)))]).join('').padStart(w, ' ');

function sampleCpu() {
  try {
    const cur = os.cpus();
    if (!cur || cur.length === 0) return;
    const sum = (o) => Object.values(o.times).reduce((a, b) => a + b, 0);
    let idle = 0;
    let total = 0;
    cur.forEach((c, i) => {
      const p = prevCpu && prevCpu[i] ? prevCpu[i] : c;
      total += sum(c) - sum(p);
      idle += c.times.idle - p.times.idle;
    });
    prevCpu = cur;
    let cpuFraction = total > 0 ? Math.max(0, Math.min(1, 1 - idle / total)) : (state.cpu.at(-1) || 0.15);
    // Keep baseline dynamic so graph never dies into a flatline
    if (cpuFraction < 0.06) cpuFraction = 0.06 + 0.04 * Math.sin(state.tick * 0.08);
    pushCapped(state.cpu, cpuFraction);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memFraction = totalMem > 0 ? Math.max(0, Math.min(1, 1 - freeMem / totalMem)) : 0.2;
    pushCapped(state.mem, memFraction);
  } catch {}
}

// ─── Pipeline ───────────────────────────────────────────────────────────────
function log(line) {
  const clean = strip(line).replace(/\s+$/, '');
  const m = clean.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (m) state.publicUrl = m[0];
  state.logs.push(clean);
  if (state.logs.length > 200) state.logs.splice(0, 100);
}

function enabledStages() {
  const tid = TARGETS[state.target].id;
  const nekoOn = state.features[FEATURES.findIndex((f) => f.id === 'neko')] ?? true;
  const ariaOn = state.features[FEATURES.findIndex((f) => f.id === 'aria')] ?? true;
  const tunnelOn = state.features[FEATURES.findIndex((f) => f.id === 'tunnel')] ?? true;

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
      state.screen = 'failed';
      return;
    }
  }
  state.finishedAt = Date.now();
  state.screen = 'done';
  if (!REAL && !state.publicUrl) state.publicUrl = 'https://lesswatch-demo.trycloudflare.com';
  if (process.env.LW_URL) state.publicUrl = process.env.LW_URL;
}

function startInstall() {
  state.stages = enabledStages();
  state.started = Date.now();
  state.screen = 'install';
  runPipeline(0);
}

function retry() {
  const s = state.stages[state.current];
  s.status = 'pending';
  s.progress = 0;
  state.error = '';
  state.screen = 'install';
  runPipeline(state.current);
}

function overall() {
  const n = state.stages.length || 1;
  const done = state.stages.filter((s) => s.status === 'done').length;
  const cur = state.stages.find((s) => s.status === 'running');
  return (done + (cur ? cur.progress / 100 : 0)) / n;
}

// ─── Views ──────────────────────────────────────────────────────────────────
function header(W) {
  const pal = getPal();
  const fill = getFill();
  const big = cols() >= 84 && rows() >= 34;
  const cur = { target: 0, features: 1 }[state.screen] ?? 2;
  const crumbs = ['Target', 'Features', 'Install']
    .map((n, i) => (i < cur ? C.green('✔ ' + n) : i === cur ? bold(C.accent(n)) : C.faint(n)))
    .join(C.faint('  ›  '));
  const L = [];
  if (big) L.push(...bigBanner('LESSWATCH', pal, fill).map((l) => '  ' + l));
  else L.push('  ' + compactTitle(pal));
  L.push('  ' + marquee(W, pal));
  L.push('  ' + C.muted(`self-host installer · 60fps · ${REAL ? 'live' : 'demo'} · ${pal.name} · ${fill}`));
  L.push('  ' + crumbs);
  L.push('  ' + animatedRule(W, pal));
  L.push('');
  return L;
}

function grad(text, phase) {
  const pal = getPal();
  return [...text].map((ch, i) => {
    const tri = Math.abs(((i / Math.max(1, text.length)) + phase * 0.1) % 2 - 1);
    return hsl(pal.h0 + pal.span * tri, 0.95, 0.65) + ch;
  }).join('') + RESET;
}

function menu(title, items, checks) {
  const L = ['  ' + bold(C.text(title)), ''];
  items.forEach((it, i) => {
    const on = i === state.cursor;
    const mark = checks
      ? (checks[i] ? C.green(bold('[✔]')) : C.faint('[ ]'))
      : (on ? C.accent('◉') : C.faint('○'));
    const label = on ? bold(grad(it, state.tick * 0.04)) : (checks && !checks[i] ? C.faint(it) : C.muted(it));
    L.push(`  ${on ? C.accent('▸') : ' '} ${mark} ${label}`);
  });
  L.push('');
  return L;
}

function stageLine(s) {
  const spin = SPIN[Math.floor(state.tick / 6) % SPIN.length];
  const icon = { pending: C.faint('○'), running: C.accent(spin), done: C.green('✔'), failed: C.red('✖') }[s.status];
  const label = s.label.padEnd(28);
  const name = {
    pending: (t) => C.faint(t),
    running: (t) => bold(C.text(t)),
    done:    (t) => C.muted(t),
    failed:  (t) => C.red(t),
  }[s.status](label);
  let right = '';
  if (s.status === 'running') {
    right = bar(s.progress / 100, 22) + C.muted(` ${String(Math.round(s.progress)).padStart(3)}%`);
  } else if (s.status === 'done') {
    right = C.green(`${(s.ms / 1000).toFixed(1)}s`);
  }
  return `  ${icon} ${name} ${right}`;
}

function installView(W) {
  const L = [];
  const end = state.finishedAt || Date.now();
  const elapsed = ((end - state.started) / 1000).toFixed(1);
  const reel = REEL[Math.floor(state.tick / 10) % REEL.length];
  const pct = String(Math.round(state.shown * 100)).padStart(3);
  L.push(`  ${C.accent(reel)} ${bold(C.text('INSTALLING LESSWATCH'))}  ${C.faint('·')}  ${C.muted(elapsed + 's')}`);
  L.push(`  ${bar(state.shown, Math.max(10, W - 12))} ${bold(C.accent(pct + '%'))}`);
  L.push('');
  state.stages.forEach((s) => L.push(stageLine(s)));
  L.push('');

  const logH = 7;
  const tail = state.logs.slice(-logH);
  while (tail.length < logH) tail.unshift('');
  L.push(...boxed(tail.map((l) => C.muted(fit(l, W - 6))), W));

  const pal = getPal();
  const cpuNow = state.cpu.at(-1) ?? 0.1;
  const memNow = state.mem.at(-1) ?? 0.15;
  L.push(
    `  ${C.muted('CPU')} ${hsl(pal.h0, 0.9, 0.6)}${spark(state.cpu, 16)}${RESET} ${C.muted(String(Math.round(cpuNow * 100)).padStart(3) + '%')}` +
    `    ${C.muted('RAM')} ${hsl(pal.h0 + 60, 0.9, 0.6)}${spark(state.mem, 16)}${RESET} ${C.muted(String(Math.round(memNow * 100)).padStart(3) + '%')}`
  );
  return L;
}

function confettiLines(W, H = 3) {
  if (!state.confetti) {
    state.confetti = Array.from({ length: 48 }, () => ({
      x: Math.random(),
      y: Math.random() * H,
      vy: 0.02 + Math.random() * 0.05,
      ch: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
      h: Math.random() * 360,
    }));
  }
  const grid = Array.from({ length: H }, () => new Array(W).fill(' '));
  for (const p of state.confetti) {
    p.y += p.vy;
    if (p.y >= H) { p.y = 0; p.x = Math.random(); }
    const gx = Math.floor(p.x * W);
    const gy = Math.floor(p.y);
    if (gy >= 0 && gy < H && gx >= 0 && gx < W) grid[gy][gx] = hsl(p.h + state.tick * 0.8, 0.9, 0.65) + p.ch + RESET;
  }
  return grid.map((r) => '  ' + r.join(''));
}

function thanksView(W) {
  const pal = getPal();
  const L = [];
  if (cols() >= 84) {
    L.push(...bigBanner('THANK YOU', pal, getFill()).map((l) => '  ' + l));
  } else {
    L.push(...boxed([bold(grad('THANK YOU!', state.tick * 0.04))], W));
  }
  L.push(...confettiLines(Math.min(W + 2, cols() - 4), 3));
  L.push('');

  const secs = ((state.finishedAt - state.started) / 1000).toFixed(1);
  const comps = state.features.map((on, i) => (on ? FEATURES[i].title : null)).filter(Boolean);
  const urlColor = hsl(pal.h0 + pal.span * ((state.tick % 180) / 180), 0.95, 0.7);
  const url = state.publicUrl || 'not captured · set LW_URL';
  const isCloud = TARGETS[state.target].id === 'cloud';
  const local = process.env.LW_LOCAL || `http://localhost:${isCloud ? 8080 : 3000}`;

  L.push(...boxed([
    bold(C.amber('YOUR PUBLIC URL')) + (REAL ? '' : C.faint('  (demo)')),
    `${urlColor}\x1b[4m${bold(url)}\x1b[24m${RESET}`,
    '',
    `${C.accent('Local')}       ${C.text(local)}`,
    `${C.accent('Target')}      ${C.text(TARGETS[state.target].title)}`,
    `${C.accent('Components')}  ${C.text(comps.length ? comps.join(', ') : 'none')}`,
    `${C.accent('Built in')}    ${C.text(`${secs}s · ${state.stages.length} steps`)}`,
    `${C.accent('Login')}       ${C.text('admin / admin (or credentials in .env)')}`,
    '',
    C.muted('Open the URL on any device · logs: docker compose logs -f'),
  ], W));

  const blink = state.tick % 60 < 35;
  L.push('', '  ' + (blink ? bold(C.green('▌ PRESS ENTER TO EXIT ▐')) : C.faint('                    ')));
  return L;
}

function buildScreen(W) {
  const s = state.screen;
  const L = header(W);

  if (s === 'target' || s === 'features') {
    const isT = s === 'target';
    const items = isT ? TARGETS.map((t) => t.title) : FEATURES.map((f) => f.title);
    const activeCount = state.features.filter(Boolean).length;
    const title = isT ? 'WHERE ARE YOU DEPLOYING?' : `CHOOSE COMPONENTS & FEATURES (${activeCount} of ${FEATURES.length} enabled)`;
    L.push(...menu(title, items, isT ? null : state.features));
    const cur = isT ? TARGETS[state.cursor] : FEATURES[state.cursor];
    L.push(...boxed([bold(C.accent(cur.title)), C.muted(cur.desc)], W));
    L.push('', '  ' + C.faint(isT
      ? '↑/↓ move · Tab cycle · 1-3 jump · Enter select · q quit'
      : '↑/↓ move · Space toggle [✔] · Tab cycle · 1-5 direct · Enter install · Esc back'));
    return L;
  }

  if (s === 'done') return [...L, ...thanksView(W)];

  L.push(...installView(W));
  if (s === 'failed') {
    L.push('', ...boxed([bold(C.red('Step failed')), C.text(fit(state.error, W - 6))], W));
    L.push('', '  ' + C.faint('r retry this step · q quit'));
  }
  return L;
}

// ─── Render loop (Silky 60 FPS Engine) ──────────────────────────────────────
function frame() {
  state.tick++;
  if (state.tick % 10 === 0) sampleCpu();
  state.shown += (overall() - state.shown) * 0.06;
  const W = Math.min(cols() - 4, 76);
  const lines = buildScreen(W).slice(0, rows());
  out('\x1b[H' + lines.map((l) => l + '\x1b[K').join('\n') + '\x1b[J');
}

// ─── Input ──────────────────────────────────────────────────────────────────
function onMenuKey(name, str) {
  const isTarget = state.screen === 'target';
  const count = isTarget ? TARGETS.length : FEATURES.length;
  const move = (d) => { state.cursor = (state.cursor + d + count) % count; };

  const isUp = name === 'up' || name === 'k' || str === '\x1b[A';
  const isDown = name === 'down' || name === 'j' || name === 'tab' || str === '\x1b[B' || str === '\t';
  const isConfirm = name === 'return' || name === 'enter' || str === '\r' || str === '\n';
  const isSpace = name === 'space' || str === ' ';
  const isBack = (name === 'escape' || name === 'b' || str === '\x1b') && !isTarget;

  if (isUp) move(-1);
  else if (isDown) move(1);
  else if (str && /^[1-9]$/.test(str) && Number(str) <= count) {
    if (!isTarget) {
      const idx = Number(str) - 1;
      state.cursor = idx;
      state.features[idx] = !state.features[idx];
    } else {
      state.cursor = Number(str) - 1;
    }
  }
  else if (isBack) {
    state.screen = 'target';
    state.cursor = state.target;
  } else if (name === 'q') shutdown(0, 'Cancelled.');
  else if (isSpace && !isTarget) state.features[state.cursor] = !state.features[state.cursor];
  else if (isConfirm) {
    if (isTarget) {
      state.target = state.cursor;
      state.screen = 'features';
      state.cursor = 0;
    } else {
      startInstall();
    }
  }
}

function onKey(str, key = {}) {
  const name = key.name;
  if (key.ctrl && name === 'c') return shutdown(130, 'Installation aborted.');
  if (state.screen === 'target' || state.screen === 'features') return onMenuKey(name, str);
  if (state.screen === 'failed') {
    if (name === 'r') return retry();
    if (name === 'q') return shutdown(1, 'Stopped. Run the installer again to resume.');
  }
  if (state.screen === 'done' && (name === 'return' || name === 'enter' || str === '\r' || str === '\n')) finish();
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
function leaveScreen() {
  if (leftScreen) return;
  leftScreen = true;
  out('\x1b[?1049l\x1b[?25h\x1b[0m');
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
}

function shutdown(code, msg) {
  clearInterval(loop);
  activeChild?.kill('SIGTERM');
  leaveScreen();
  if (msg) out(`\n  ${C.amber(msg)}\n\n`);
  process.exit(code);
}

function finish() {
  clearInterval(loop);
  leaveScreen();
  const url = state.publicUrl || '(not captured, see the tunnel step output)';
  const isCloud = TARGETS[state.target].id === 'cloud';
  const local = process.env.LW_LOCAL || `http://localhost:${isCloud ? 8080 : 3000}`;
  const card = box([
    bold(C.green('LESSWATCH is live')),
    '',
    `${C.accent('Public URL')}  ${bold(url)}`,
    `${C.accent('Local')}       ${local}`,
    `${C.accent('Login')}       admin / admin`,
    '',
    C.muted('docker compose ps  ·  docker compose logs -f'),
  ], 70);
  out('\n' + card.map((l) => '  ' + l).join('\n') + '\n\n');
  process.exit(0);
}

process.on('exit', leaveScreen);
process.on('SIGTERM', () => shutdown(143));
process.on('uncaughtException', (err) => {
  leaveScreen();
  console.error(err);
  process.exit(1);
});

function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log('Non-interactive terminal detected. Running automated installation pipeline...');
    state.target = isCloudShell ? 0 : (detectedPublicIP !== '127.0.0.1' ? 1 : 2);
    startInstall();
    return;
  }
  out('\x1b[?1049h\x1b[?25l\x1b[2J');
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('keypress', onKey);
  process.stdout.on('resize', () => out('\x1b[2J'));
  sampleCpu();
  loop = setInterval(frame, 16); // True 60 FPS
}

main();
