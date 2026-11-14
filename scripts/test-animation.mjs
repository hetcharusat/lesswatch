#!/usr/bin/env node
/**
 * ==============================================================================
 * 🍿 LESSWATCH — Impeccable ASCII-Magic-Art & Bubble Tea TUI Prototype
 * Powered by:
 *   - ascii-magic-art (700+ animated ASCII art pieces, progress loaders, spinners)
 *   - Charm / Bubble Tea & Lipgloss Design Philosophy
 *   - Zero-flicker double-buffered alternate screen canvas (30 FPS)
 * ==============================================================================
 */

import readline from 'readline';
import os from 'os';

// Dynamically import ascii-magic-art pieces
let progressLoaderDraw = null;
let progressLoaderMeta = null;
let spinnerSetDraw = null;
let spinnerSetMeta = null;
let waveDividerDraw = null;
let waveDividerMeta = null;
let torusDraw = null;
let torusMeta = null;

try {
  const pLoader = await import('ascii-magic-art/pieces/progress-loader.js');
  progressLoaderDraw = pLoader.default();
  progressLoaderMeta = pLoader.meta;
} catch {}

try {
  const sSet = await import('ascii-magic-art/pieces/spinner-set.js');
  spinnerSetDraw = sSet.default();
  spinnerSetMeta = sSet.meta;
} catch {}

try {
  const wDiv = await import('ascii-magic-art/pieces/wave-divider.js');
  waveDividerDraw = wDiv.default();
  waveDividerMeta = wDiv.meta;
} catch {}

try {
  const torus = await import('ascii-magic-art/pieces/spinning-torus.js');
  torusDraw = torus.default();
  torusMeta = torus.meta;
} catch {}

// ------------------------------------------------------------------------------
// Impeccable Palette & ANSI Formatting (Charm / Lipgloss Style)
// ------------------------------------------------------------------------------
const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const ITALIC = `${ESC}[3m`;

// Truecolor Accents
const PURPLE = `${ESC}[38;2;125;86;244m`;     // Charm Electric Violet (#7D56F4)
const PINK = `${ESC}[38;2;242;93;148m`;       // Soft Coral Pink (#F25D94)
const CYAN = `${ESC}[38;2;4;181;117m`;        // Mint Cyan (#04B575)
const BLUE = `${ESC}[38;2;56;189;248m`;       // Sky Blue (#38BDF8)
const AMBER = `${ESC}[38;2;245;158;11m`;      // Warm Gold (#F59E0B)
const WHITE = `${ESC}[38;2;255;255;255m`;     // Pure White
const ZINC_LIGHT = `${ESC}[38;2;212;212;216m`; // Text Body
const ZINC_MUTED = `${ESC}[38;2;113;113;122m`; // Secondary Muted
const ZINC_DARK = `${ESC}[38;2;63;63;70m`;     // Borders & Subtext

// Box Drawing Characters (Rounded Lipgloss Borders)
const BOX = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  arrow: '❯', check: '✔', dot: '●', circle: '○'
};

// ------------------------------------------------------------------------------
// Colorize Helper for ascii-magic-art Frames ({text, color} + palette)
// ------------------------------------------------------------------------------
function colorizePiece(frame, palette) {
  if (!frame) return [];
  if (typeof frame === 'string') return frame.split('\n');
  const lines = frame.text.split('\n');
  const cLines = frame.color ? frame.color.split('\n') : null;

  return lines.map((line, y) => {
    if (!cLines || !cLines[y] || !palette) return line;
    const c = cLines[y];
    let s = '';
    let currKey = null;

    for (let x = 0; x < line.length; x++) {
      const k = c[x];
      if (k !== currKey) {
        currKey = k;
        const hex = currKey && palette[currKey];
        if (hex) {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          s += `${ESC}[38;2;${r};${g};${b}m`;
        } else {
          s += `${ESC}[39m`;
        }
      }
      s += line[x];
    }
    return s + RESET;
  });
}

// ------------------------------------------------------------------------------
// Reactive State Model
// ------------------------------------------------------------------------------
const state = {
  activeTab: 0, // 0: Motion Banner, 1: Bubble Tea Stepper, 2: Magic Loaders, 3: Spinners & Dividers
  totalTabs: 4,
  ticks: 0,
  seconds: 0,
  paused: false,
  stepSelected: 0,
  stepConfirmed: false,
  stepHistory: [],
  telemetryLogs: [
    'Pulling Watch Together / LESSWATCH core microservices...',
    'Building Node 20 runtime + ffmpeg + aria2c + yt-dlp layer...',
    'Spawning LiveKit low-latency voice SFU bridge on 7880...',
    'Allocating Neko Chromium WebRTC TCP multiplex port 52000...',
    'Negotiating unthrottled TURN relay over TCP 443...',
    'Requesting Cloudflare Quick Tunnel edge route...',
    'Live URL assigned: https://lesswatch-demo.trycloudflare.com',
    'All systems operational. Ready for synchronous room streaming.'
  ]
};

// ------------------------------------------------------------------------------
// LESSWATCH Shimmer Logo & ASCII Cinema Art
// ------------------------------------------------------------------------------
const LOGO_LINES = [
  "██╗     ███████╗███████╗███████╗██╗    ██╗ █████╗ ████████╗ ██████╗██╗  ██╗",
  "██║     ██╔════╝██╔════╝██╔════╝██║    ██║██╔══██╗╚══██╔══╝██╔════╝██║  ██║",
  "██║     █████╗  ███████╗███████╗██║ █╗ ██║███████║   ██║   ██║     ███████║",
  "██║     ██╔══╝  ╚════██║╚════██║██║███╗██║██╔══██║   ██║   ██║     ██╔══██║",
  "███████╗███████╗███████║███████║╚███╔███╔╝██║  ██║   ██║   ╚██████╗██║  ██║",
  "╚══════╝╚══════╝╚══════╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝"
];

function renderShimmerLogo(tick) {
  const len = LOGO_LINES[0].length;
  const sweep = tick % (len + 28);
  const out = [];

  for (let r = 0; r < LOGO_LINES.length; r++) {
    const line = LOGO_LINES[r];
    let row = '';
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === ' ') {
        row += ' ';
        continue;
      }
      const dist = Math.abs(c - sweep);
      if (dist === 0) row += `${WHITE}${BOLD}${ch}${RESET}`;
      else if (dist <= 2) row += `${CYAN}${BOLD}${ch}${RESET}`;
      else if (dist <= 4) row += `${PINK}${ch}${RESET}`;
      else if (dist <= 8) row += `${PURPLE}${ch}${RESET}`;
      else row += `${ZINC_MUTED}${ch}${RESET}`;
    }
    out.push(row);
  }
  return out;
}

// Multi-frame filmstrip reels
const FILMSTRIP = [
  [" .---.       .---. ", "/ (•) \\=====/ (•) \\", "\\  •  /=====\\  •  /", " '---'       '---' "],
  [" .---.       .---. ", "/  •  \\=====/  •  \\", "\\ (•) /=====\\ (•) /", " '---'       '---' "],
  [" .---.       .---. ", "/ •   \\=====/ •   \\", "\\   • /=====\\   • /", " '---'       '---' "],
  [" .---.       .---. ", "/   • \\=====/   • \\", "\\ •   /=====\\ •   /", " '---'       '---' "]
];

// Multi-frame popcorn popping
const POPCORN = [
  ["     .     ", "   ( 🍿 )  ", "  .─-══-─. ", "  │█ █ █ │ ", "  ╰──────╯ "],
  ["   ✦ . *   ", " ✦ ( 🍿 ) ✦", "  .─-══-─. ", "  │█ █ █ │ ", "  ╰──────╯ "],
  [" * °  *  ° ", " * ( 🍿 ) *", "  .─-══-─. ", "  │█ █ █ │ ", "  ╰──────╯ "],
  ["   * . *   ", " ✦ ( 🍿 ) ✦", "  .─-══-─. ", "  │█ █ █ │ ", "  ╰──────╯ "]
];

// ------------------------------------------------------------------------------
// Card Drawer (Rounded Lipgloss / Charm Container)
// ------------------------------------------------------------------------------
function drawCard(width, title, lines, borderColor = PURPLE) {
  const innerW = width - 4;
  const titleStr = title ? ` ${WHITE}${BOLD}${title}${RESET}${borderColor} ` : '';
  const titleLen = title ? title.length + 2 : 0;
  const topPad = BOX.h.repeat(2);
  const remain = Math.max(0, innerW - titleLen - 2);

  const top = `${borderColor}${BOX.tl}${topPad}${titleStr}${BOX.h.repeat(remain)}${BOX.tr}${RESET}`;
  const bot = `${borderColor}${BOX.bl}${BOX.h.repeat(innerW + 2)}${BOX.br}${RESET}`;

  const rows = [top];
  for (const l of lines) {
    const rawLen = l.replace(/\x1b\[[0-9;]*m/g, '').length;
    const pad = Math.max(0, innerW - rawLen);
    rows.push(`${borderColor}${BOX.v}${RESET}  ${l}${' '.repeat(pad)}${borderColor}${BOX.v}${RESET}`);
  }
  rows.push(bot);
  return rows;
}

// ------------------------------------------------------------------------------
// View 1: Cinema Motion Canvas
// ------------------------------------------------------------------------------
function viewMotion(w) {
  const shimmer = renderShimmerLogo(state.ticks);
  const filmFrame = FILMSTRIP[Math.floor(state.ticks / 3) % FILMSTRIP.length];
  const popFrame = POPCORN[Math.floor(state.ticks / 2) % POPCORN.length];

  const lines = [
    '',
    `  ${ZINC_LIGHT}${ITALIC}Cinema Motion Engine${RESET}  ${ZINC_DARK}•${RESET}  ${CYAN}Shimmer Sweep Active${RESET}  ${ZINC_DARK}•${RESET}  ${ZINC_MUTED}30 FPS${RESET}`,
    ''
  ];

  for (const r of shimmer) {
    lines.push(`  ${r}`);
  }

  lines.push('');
  lines.push(`  ${ZINC_DARK}─────────────────────────────────────────────────────────────────────────────${RESET}`);
  lines.push('');

  const rows = Math.max(filmFrame.length, popFrame.length);
  for (let i = 0; i < rows; i++) {
    const f = filmFrame[i] || ' '.repeat(20);
    const p = popFrame[i] || ' '.repeat(12);
    lines.push(`    ${CYAN}${f}${RESET}       ${PINK}${p}${RESET}     ${ZINC_MUTED}Rendering frame #${state.ticks} (Double-Buffered)${RESET}`);
  }

  lines.push('');
  lines.push(`  ${PURPLE}${BOLD}⚡ Motion Features:${RESET} ${ZINC_LIGHT}Continuous RGB sweep • Zero terminal flicker • Microsecond frame timing${RESET}`);
  lines.push('');

  return drawCard(w, 'CINEMA ASCII-MOTION CANVAS', lines, PURPLE);
}

// ------------------------------------------------------------------------------
// View 2: Bubble Tea Stepper (Interactive Lipgloss Menu)
// ------------------------------------------------------------------------------
function viewStepper(w) {
  const options = [
    { title: '⚡ Google Cloud Shell / Web Sandbox (Recommended)', desc: 'Zero port forwarding, binds cleanly to port 8080 with Web Preview integration.' },
    { title: '🚀 Dedicated Linux Cloud VM (Ubuntu / Debian / VPS / OCI)', desc: 'Permanent 24/7 background hosting with native direct UDP WebRTC.' },
    { title: '🔒 Custom Domain with Automatic SSL (Caddy)', desc: 'Production HTTPS with automated Let’s Encrypt certificate auto-renewal.' },
    { title: '💻 Local Workspace / Docker Desktop', desc: 'Fast local testing on your personal workstation.' }
  ];

  const lines = [
    '',
    `  ${WHITE}${BOLD}Select Deployment Target Infrastructure${RESET}  ${ZINC_MUTED}(Step 1 of 4)${RESET}`,
    `  ${ZINC_MUTED}Use [↑/↓] or [j/k] to navigate, [Enter] to confirm, [1-4] quick select${RESET}`,
    ''
  ];

  options.forEach((opt, idx) => {
    const isSel = idx === state.stepSelected;
    if (isSel) {
      lines.push(`  ${VIOLET}${BOLD}${BOX.arrow} [●] ${WHITE}${BOLD}${opt.title}${RESET}`);
      lines.push(`      ${PINK}${opt.desc}${RESET}`);
    } else {
      lines.push(`    ${ZINC_DARK}[○] ${ZINC_MUTED}${opt.title}${RESET}`);
      lines.push(`      ${ZINC_DARK}${opt.desc}${RESET}`);
    }
  });

  lines.push('');
  lines.push(`  ${ZINC_DARK}─────────────────────────────────────────────────────────────────────────────${RESET}`);
  lines.push('');

  if (state.stepConfirmed) {
    lines.push(`  ${CYAN}${BOLD}${BOX.check} Confirmed:${RESET} ${WHITE}${BOLD}${options[state.stepSelected].title}${RESET}`);
    lines.push(`    ${ZINC_MUTED}Selection dispatched to environment manager.${RESET}`);
  } else {
    lines.push(`  ${AMBER}${BOLD}● Awaiting choice...${RESET} ${ZINC_MUTED}Press [Enter] to lock selection${RESET}`);
  }
  lines.push('');

  return drawCard(w, 'BUBBLE TEA INTERACTIVE STEPPER', lines, CYAN);
}

// ------------------------------------------------------------------------------
// View 3: ascii-magic-art Progress Loaders
// ------------------------------------------------------------------------------
function viewLoaders(w) {
  const lines = [
    '',
    `  ${WHITE}${BOLD}Live Multi-Stage Pipeline${RESET}  ${ZINC_MUTED}(Powered by ascii-magic-art/progress-loader)${RESET}`,
    ''
  ];

  if (progressLoaderDraw) {
    const pFrame = progressLoaderDraw(state.seconds);
    const coloredP = colorizePiece(pFrame, progressLoaderMeta.palette);
    for (const cl of coloredP) {
      if (cl.trim()) lines.push(`  ${cl}`);
    }
  }

  lines.push('');
  lines.push(`  ${ZINC_DARK}─────────────────────────────────────────────────────────────────────────────${RESET}`);
  lines.push('');

  const activeIdx = Math.floor((state.seconds * 1.5) % state.telemetryLogs.length);
  lines.push(`  ${PURPLE}${BOLD}Active Subtask:${RESET} ${ZINC_LIGHT}${state.telemetryLogs[activeIdx]}${RESET}`);
  lines.push(`  ${ZINC_MUTED}Host Memory: ${GREEN}${Math.round(os.freemem() / 1024 / 1024)}MB free${RESET} ${ZINC_DARK}/ ${Math.round(os.totalmem() / 1024 / 1024)}MB total${RESET}`);
  lines.push('');

  return drawCard(w, 'ASCII-MAGIC-ART PROGRESS LOADER', lines, BLUE);
}

// ------------------------------------------------------------------------------
// View 4: ascii-magic-art Spinners & Wave Dividers
// ------------------------------------------------------------------------------
function viewSpinners(w) {
  const lines = [
    '',
    `  ${WHITE}${BOLD}Spinner Matrix & Wave Dividers${RESET}  ${ZINC_MUTED}(ascii-magic-art gallery)${RESET}`,
    ''
  ];

  // Animated wave divider
  if (waveDividerDraw) {
    const wFrame = waveDividerDraw(state.seconds);
    const coloredW = colorizePiece(wFrame, waveDividerMeta.palette);
    for (const wl of coloredW.slice(1, 5)) {
      lines.push(`  ${wl}`);
    }
  }

  lines.push('');
  lines.push(`  ${ZINC_DARK}─────────────────────────────────────────────────────────────────────────────${RESET}`);

  // Spinner Set preview
  if (spinnerSetDraw) {
    const sFrame = spinnerSetDraw(state.seconds);
    const coloredS = colorizePiece(sFrame, spinnerSetMeta.palette);
    for (const sl of coloredS.slice(0, 10)) {
      lines.push(`  ${sl}`);
    }
  }

  lines.push('');
  return drawCard(w, 'ASCII-MAGIC-ART SPINNERS & WAVES', lines, PINK);
}

// ------------------------------------------------------------------------------
// Master Render Loop
// ------------------------------------------------------------------------------
function render() {
  const w = Math.min(process.stdout.columns || 80, 84);

  // Tab navigation bar
  const tabs = [
    '1. Cinema Motion',
    '2. Bubble Stepper',
    '3. Magic Loader',
    '4. Spinner Gallery'
  ];

  const tabPills = tabs.map((t, idx) => {
    if (idx === state.activeTab) {
      return `${WHITE}${BOLD}[${t}]${RESET}`;
    }
    return `${ZINC_MUTED} ${t} ${RESET}`;
  }).join('  ');

  const header = `
${ZINC_DARK}┌─────────────────────────────────────────────────────────────────────────────┐${RESET}
${ZINC_DARK}│${RESET}  ${BOLD}${WHITE}L E S S W A T C H${RESET}  ${PINK}🍿${RESET}  ${ZINC_MUTED}ASCII-Magic & Bubble Tea Playground${RESET}         ${CYAN}v4.2-LAB${RESET}  ${ZINC_DARK}│${RESET}
${ZINC_DARK}├─────────────────────────────────────────────────────────────────────────────┤${RESET}
${ZINC_DARK}│${RESET}  ${tabPills}  ${ZINC_DARK}│${RESET}
${ZINC_DARK}└─────────────────────────────────────────────────────────────────────────────┘${RESET}`;

  let cardRows = [];
  if (state.activeTab === 0) cardRows = viewMotion(w);
  else if (state.activeTab === 1) cardRows = viewStepper(w);
  else if (state.activeTab === 2) cardRows = viewLoaders(w);
  else if (state.activeTab === 3) cardRows = viewSpinners(w);

  const footer = `
  ${ZINC_DARK}Navigation:${RESET} ${WHITE}[Tab / ← / → / 1-4]${RESET} Switch Views  ${ZINC_DARK}•${RESET} ${WHITE}[Space]${RESET} Pause  ${ZINC_DARK}•${RESET} ${WHITE}[r]${RESET} Reset  ${ZINC_DARK}•${RESET} ${WHITE}[q]${RESET} Exit
`;

  // Atomic write to prevent tearing
  process.stdout.write(`${ESC}[H${header}\n${cardRows.join('\n')}\n${footer}`);
}

// ------------------------------------------------------------------------------
// Input Handling & Application Lifecycle
// ------------------------------------------------------------------------------
function main() {
  // Alternate screen buffer so terminal scrollback stays 100% clean
  process.stdout.write(`${ESC}[?1049h${ESC}[H${ESC}[2J${ESC}[?25l`);

  const exitApp = () => {
    process.stdout.write(`${ESC}[?1049l${ESC}[?25h`);
    process.exit(0);
  };

  process.on('SIGINT', exitApp);
  process.on('SIGTERM', exitApp);
  process.on('exit', () => process.stdout.write(`${ESC}[?1049l${ESC}[?25h`));

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on('keypress', (str, key) => {
    if (!key && !str) return;

    // Quit ONLY on 'q' or 'Q' or Ctrl+C (NEVER quit on Tab or bare Escape!)
    if ((key && key.name === 'q') || str === 'q' || str === 'Q' || (key && key.ctrl && key.name === 'c')) {
      exitApp();
      return;
    }

    // Tab key switching (Rock-solid: checks str === '\t', key.name === 'tab', and shift+tab)
    if (str === '\t' || (key && key.name === 'tab')) {
      if (key && key.shift) {
        state.activeTab = (state.activeTab - 1 + state.totalTabs) % state.totalTabs;
      } else {
        state.activeTab = (state.activeTab + 1) % state.totalTabs;
      }
      return;
    }

    // Direct number keys (1, 2, 3, 4)
    if (str === '1') { state.activeTab = 0; return; }
    if (str === '2') { state.activeTab = 1; return; }
    if (str === '3') { state.activeTab = 2; return; }
    if (str === '4') { state.activeTab = 3; return; }

    // Arrow keys Left & Right for tab switching
    if (key && (key.name === 'left' || key.name === 'h')) {
      state.activeTab = (state.activeTab - 1 + state.totalTabs) % state.totalTabs;
      return;
    }
    if (key && (key.name === 'right' || key.name === 'l')) {
      state.activeTab = (state.activeTab + 1) % state.totalTabs;
      return;
    }

    // Pause toggle
    if (str === ' ') {
      state.paused = !state.paused;
      return;
    }

    // Reset simulation
    if (str === 'r' || str === 'R') {
      state.ticks = 0;
      state.seconds = 0;
      state.stepConfirmed = false;
      return;
    }

    // Stepper navigation when on Tab 1
    if (state.activeTab === 1 && key) {
      if (key.name === 'up' || key.name === 'k') {
        state.stepSelected = (state.stepSelected - 1 + 4) % 4;
        state.stepConfirmed = false;
      } else if (key.name === 'down' || key.name === 'j') {
        state.stepSelected = (state.stepSelected + 1) % 4;
        state.stepConfirmed = false;
      } else if (key.name === 'return' || key.name === 'enter') {
        state.stepConfirmed = true;
      }
    }
  });

  // 30 FPS Render Clock
  setInterval(() => {
    if (!state.paused) {
      state.ticks++;
      state.seconds += 0.033;
    }
    render();
  }, 33);
}

main();
