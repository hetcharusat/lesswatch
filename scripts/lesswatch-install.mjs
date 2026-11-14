#!/usr/bin/env node
/**
 * lesswatch-install.mjs: animated, interactive self-host installer. Zero dependencies.
 *
 *   node lesswatch-install.mjs          simulated run (look and feel only)
 *   node lesswatch-install.mjs --real   runs the shell commands defined in STAGES
 *
 * Keys:
 *   ↑/↓ or j/k  move        Tab       next
 *   1-9         jump        Space     toggle a component
 *   Enter       confirm     Esc / b   back
 *   r           retry failed step     q  quit     Ctrl+C  abort
 */
import readline from 'node:readline';
import os from 'node:os';
import { spawn } from 'node:child_process';

const REAL = process.argv.includes('--real');
const out = (s) => process.stdout.write(s);

// ─── Config ─────────────────────────────────────────────────────────────────
const TARGETS = [
  { id: 'cloud', title: 'Cloud Shell / Web Sandbox', desc: 'Browser sandbox. No port forwarding needed, binds to :8080.' },
  { id: 'vps',   title: 'Linux VPS / Dedicated VM',  desc: 'Always-on hosting with direct UDP for WebRTC.' },
  { id: 'local', title: 'Local workstation',         desc: 'Docker Desktop on your own machine, for testing.' },
];

const FEATURES = [
  { id: 'neko', title: 'Shared Chromium browser (Neko)',      desc: 'Watch together in one shared virtual browser. Sleeps when idle.', on: true },
  { id: 'aria', title: 'Media downloader (aria2c + yt-dlp)',  desc: 'Pull torrents and streams straight into the media library.',      on: true },
];

// Optional gates: `feature` ties a stage to a component, `targets` to a deploy target.
// Replace the `cmd` values with your real commands; `sim` is the demo duration in ms.
const STAGES = [
  { id: 'docker', label: 'Docker daemon check',      cmd: 'docker info >/dev/null',   sim: 1100 },
  { id: 'env',    label: 'Generate secrets & .env',  cmd: 'sh scripts/gen-env.sh',    sim: 800  },
  { id: 'build',  label: 'Build LESSWATCH services', cmd: 'docker compose build',     sim: 2800 },
  { id: 'neko',   label: 'Pull Chromium image',      cmd: 'docker compose pull neko', sim: 1400, feature: 'neko' },
  { id: 'aria',   label: 'Pull downloader image',    cmd: 'docker compose pull aria', sim: 1000, feature: 'aria' },
  { id: 'up',     label: 'Start containers',         cmd: 'docker compose up -d',     sim: 1300 },
  { id: 'tunnel', label: 'Public HTTPS tunnel',      cmd: 'sh scripts/tunnel.sh',     sim: 1000, targets: ['cloud'] },
];

const SIM_LINES = [
  'resolving dependencies', 'layer cache hit, reusing', 'verifying checksum',
  'writing config', 'health check ok', 'waiting for ports', 'connection established',
];
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPARK = '▁▂▃▄▅▆▇█';
const PARTIAL = ' ▏▎▍▌▋▊▉';
const PINK = [244, 114, 182];
const CYAN = [34, 211, 238];

// ─── Styling helpers ────────────────────────────────────────────────────────
const rgb = (r, g, b) => (s) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
const C = {
  accent: rgb(34, 211, 238),
  pink:   rgb(244, 114, 182),
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

// Shimmering gradient, one color per character, shifted by `phase`.
function grad(text, phase = 0) {
  const chars = [...text];
  const n = Math.max(1, chars.length);
  return chars.map((ch, i) => {
    const t = (Math.sin((i / n) * Math.PI * 2 + phase) + 1) / 2;
    const [r, g, b] = PINK.map((p, k) => Math.round(p + (CYAN[k] - p) * t));
    return `\x1b[38;2;${r};${g};${b}m${ch}`;
  }).join('') + '\x1b[39m';
}

// Sub-cell precision progress bar.
function bar(p, w, color = C.accent) {
  p = Math.max(0, Math.min(1, p));
  const units = p * w * 8;
  const full = Math.floor(units / 8);
  const rem = Math.floor(units % 8);
  const partial = full < w ? PARTIAL[rem] : '';
  const empty = w - full - (partial ? 1 : 0);
  return color('█'.repeat(full) + partial) + C.faint('░'.repeat(empty));
}

function spark(arr, w) {
  return arr.slice(-w).map((v) => SPARK[Math.min(7, Math.floor(v * 8))]).join('').padStart(w, ' ');
}

function box(lines, width, color = C.faint) {
  const inner = width - 2;
  const row = (l) => color('│') + ' ' + l + ' '.repeat(Math.max(0, inner - 2 - vis(l))) + ' ' + color('│');
  return [color('╭' + '─'.repeat(inner) + '╮'), ...lines.map(row), color('╰' + '─'.repeat(inner) + '╯')];
}
const boxed = (lines, W) => box(lines, W).map((l) => '  ' + l);

const cols = () => Math.max(60, process.stdout.columns || 80);
const rows = () => Math.max(20, process.stdout.rows || 24);

// ─── State ──────────────────────────────────────────────────────────────────
const state = {
  screen: 'target',          // target | features | install | failed | done
  cursor: 0,
  target: 0,
  features: FEATURES.map((f) => f.on),
  stages: [],
  current: 0,
  shown: 0,                  // eased overall progress, 0..1
  logs: [],
  started: 0,
  finishedAt: 0,
  error: '',
  tick: 0,
  cpu: [],
  mem: [],
};

let loop = null;
let activeChild = null;
let leftScreen = false;
let prevCpu = os.cpus();

// ─── Telemetry ──────────────────────────────────────────────────────────────
const push = (arr, v) => { arr.push(v); if (arr.length > 40) arr.shift(); };

function sampleCpu() {
  const cur = os.cpus();
  const sum = (o) => Object.values(o.times).reduce((a, b) => a + b, 0);
  let idle = 0;
  let total = 0;
  cur.forEach((c, i) => {
    const p = prevCpu[i];
    total += sum(c) - sum(p);
    idle += c.times.idle - p.times.idle;
  });
  prevCpu = cur;
  push(state.cpu, total ? 1 - idle / total : 0);
  push(state.mem, 1 - os.freemem() / os.totalmem());
}

// ─── Pipeline ───────────────────────────────────────────────────────────────
function log(line) {
  state.logs.push(strip(line).replace(/\s+$/, ''));
  if (state.logs.length > 200) state.logs.splice(0, 100);
}

function enabledStages() {
  const tid = TARGETS[state.target].id;
  return STAGES
    .filter((s) =>
      (!s.feature || state.features[FEATURES.findIndex((f) => f.id === s.feature)]) &&
      (!s.targets || s.targets.includes(tid)))
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
    }, 60);
  });
}

function runReal(s) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', s.cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
    activeChild = child;
    const feed = (d) => String(d).split(/\r?\n|\r/).forEach((l) => l && log('  ' + l));
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    // Creep the bar toward 92% while the command runs; snap to 100 on success.
    const creep = setInterval(() => { s.progress += (92 - s.progress) * 0.02; }, 200);
    child.on('error', (e) => { clearInterval(creep); activeChild = null; reject(e); });
    child.on('close', (code) => {
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
    log(`$ ${s.cmd}`);
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
  const title = bold(grad('LESSWATCH', state.tick * 0.07));
  const sub = C.muted(`self-host installer · ${REAL ? 'live' : 'demo mode'}`);
  const spec = C.faint(`${os.cpus().length} vCPU · ${(os.totalmem() / 2 ** 30).toFixed(1)} GB RAM · ${os.platform()}`);
  const cur = { target: 0, features: 1 }[state.screen] ?? 2;
  const crumbs = ['Target', 'Features', 'Install']
    .map((n, i) => (i < cur ? C.green('✔ ' + n) : i === cur ? bold(C.accent(n)) : C.faint(n)))
    .join(C.faint('  ›  '));
  return [...boxed([`${title}  ${sub}`, spec], W), '  ' + crumbs, ''];
}

function menu(title, items, checks) {
  const L = ['  ' + bold(C.text(title)), ''];
  items.forEach((it, i) => {
    const on = i === state.cursor;
    const mark = checks
      ? (checks[i] ? C.green('[✔]') : C.faint('[ ]'))
      : (on ? C.accent('◉') : C.faint('○'));
    const label = on ? bold(grad(it, state.tick * 0.12)) : C.muted(it);
    L.push(`  ${on ? C.accent('▸') : ' '} ${mark} ${label}`);
  });
  L.push('');
  return L;
}

function stageLine(s) {
  const spin = SPIN[Math.floor(state.tick / 2) % SPIN.length];
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
  const pct = String(Math.round(state.shown * 100)).padStart(3);
  L.push(`  ${bold(C.text('Installing LESSWATCH'))}  ${C.faint('·')}  ${C.muted(elapsed + 's')}`);
  L.push(`  ${bar(state.shown, Math.max(10, W - 10))} ${bold(C.accent(pct + '%'))}`);
  L.push('');
  state.stages.forEach((s) => L.push(stageLine(s)));
  L.push('');

  const logH = 7;
  const tail = state.logs.slice(-logH);
  while (tail.length < logH) tail.unshift('');
  L.push(...boxed(tail.map((l) => C.muted(fit(l, W - 6))), W));

  const cpuNow = state.cpu.at(-1) ?? 0;
  const memNow = state.mem.at(-1) ?? 0;
  L.push(
    `  ${C.muted('CPU')} ${C.accent(spark(state.cpu, 16))} ${C.muted(String(Math.round(cpuNow * 100)).padStart(3) + '%')}` +
    `    ${C.muted('RAM')} ${C.pink(spark(state.mem, 16))} ${C.muted(String(Math.round(memNow * 100)).padStart(3) + '%')}`
  );
  return L;
}

function buildScreen(W) {
  const s = state.screen;
  const L = header(W);

  if (s === 'target' || s === 'features') {
    const isT = s === 'target';
    const items = isT ? TARGETS.map((t) => t.title) : FEATURES.map((f) => f.title);
    L.push(...menu(isT ? 'Where are you deploying?' : 'Choose components', items, isT ? null : state.features));
    const cur = isT ? TARGETS[state.cursor] : FEATURES[state.cursor];
    L.push(...boxed([bold(C.accent(cur.title)), C.muted(cur.desc)], W));
    L.push('', '  ' + C.faint(isT
      ? '↑/↓ move · 1-3 jump · enter select · q quit'
      : '↑/↓ move · space toggle · enter install · esc back'));
    return L;
  }

  L.push(...installView(W));

  if (s === 'failed') {
    L.push('', ...boxed([bold(C.red('Step failed')), C.text(fit(state.error, W - 6))], W));
    L.push('', '  ' + C.faint('r retry this step · q quit'));
  } else if (s === 'done') {
    L.push('', ...boxed([bold(C.green('✔ LESSWATCH is ready')), C.muted('Press Enter to finish and show access details')], W));
  }
  return L;
}

// ─── Rendering loop ─────────────────────────────────────────────────────────
function frame() {
  state.tick++;
  if (state.tick % 20 === 0) sampleCpu();
  state.shown += (overall() - state.shown) * 0.12;
  const W = Math.min(cols() - 4, 76);
  const lines = buildScreen(W).slice(0, rows());
  out('\x1b[H' + lines.map((l) => l + '\x1b[K').join('\n') + '\x1b[J');
}

// ─── Input ──────────────────────────────────────────────────────────────────
function onMenuKey(name, str) {
  const isTarget = state.screen === 'target';
  const count = isTarget ? TARGETS.length : FEATURES.length;
  const move = (d) => { state.cursor = (state.cursor + d + count) % count; };

  if (name === 'up' || name === 'k') move(-1);
  else if (name === 'down' || name === 'j' || name === 'tab') move(1);
  else if (str && /^[1-9]$/.test(str) && Number(str) <= count) state.cursor = Number(str) - 1;
  else if ((name === 'escape' || name === 'b') && !isTarget) {
    state.screen = 'target';
    state.cursor = state.target;
  }
  else if (name === 'q') shutdown(0, 'Cancelled.');
  else if (name === 'space' && !isTarget) state.features[state.cursor] = !state.features[state.cursor];
  else if (name === 'return' || name === 'enter') {
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
  if (state.screen === 'done' && (name === 'return' || name === 'enter')) finish();
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
  const url = process.env.LW_URL || 'http://localhost:8080';
  const secs = ((state.finishedAt - state.started) / 1000).toFixed(1);
  clearInterval(loop);
  leaveScreen();
  const card = box([
    bold(C.green('LESSWATCH is live')),
    '',
    `${C.accent('URL')}      ${bold(url)}`,
    `${C.accent('Target')}   ${TARGETS[state.target].title}`,
    `${C.accent('Time')}     ${secs}s`,
    `${C.accent('Login')}    credentials are in .env`,
    '',
    C.muted('docker compose ps  ·  docker compose logs -f'),
  ], 66);
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
    console.error('lesswatch-install needs an interactive terminal.');
    process.exit(1);
  }
  out('\x1b[?1049h\x1b[?25l\x1b[2J');
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('keypress', onKey);
  process.stdout.on('resize', () => out('\x1b[2J'));
  sampleCpu();
  loop = setInterval(frame, 50);
}

main();
