#!/usr/bin/env node
/**
 * ==============================================================================
 * 🍿 LESSWATCH — Impeccable ASCII-Motion & Bubble Tea TUI Prototype
 * Demonstrates:
 *   1. Multi-Frame ASCII Motion (Filmstrip / Retro Projector / Shimmer Wave)
 *   2. Charm/Bubble Tea Inspired Lipgloss Layouts (Rounded Cards, Smooth Gradients)
 *   3. Interactive Model-Update-View Architecture (Tabs, Stepper, Live Telemetry)
 *   4. Zero-Flicker Double-Buffered Alternate Screen Canvas
 * ==============================================================================
 */

import readline from 'readline';
import os from 'os';

// ------------------------------------------------------------------------------
// ANSI Styling & Palette (Charm/Bubble Tea & Impeccable Standard)
// ------------------------------------------------------------------------------
const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const ITALIC = `${ESC}[3m`;

// Color palette
const PURPLE = `${ESC}[38;2;125;86;244m`;     // Charm Violet (#7D56F4)
const PINK = `${ESC}[38;2;242;93;148m`;       // Soft Coral Pink (#F25D94)
const CYAN = `${ESC}[38;2;4;181;117m`;        // Mint Cyan (#04B575)
const BLUE = `${ESC}[38;2;56;189;248m`;       // Sky Blue (#38BDF8)
const AMBER = `${ESC}[38;2;245;158;11m`;      // Warm Gold (#F59E0B)
const WHITE = `${ESC}[38;2;255;255;255m`;     // Bright White
const ZINC_LIGHT = `${ESC}[38;2;212;212;216m`; // Foreground Body
const ZINC_MUTED = `${ESC}[38;2;113;113;122m`; // Secondary Muted
const ZINC_DARK = `${ESC}[38;2;63;63;70m`;     // Borders & Inactive
const BG_DARK = `${ESC}[48;2;24;24;27m`;      // Card Surface
const BG_PURPLE = `${ESC}[48;2;125;86;244m`;  // Accent Pill

// Box drawing glyphs (Charm / Lipgloss Rounded Style)
const BOX = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  t_down: '┬', t_up: '┴', t_right: '├', t_left: '┤',
  dot: '●', circle: '○', arrow: '❯', check: '✔', spark: '✦'
};

// ------------------------------------------------------------------------------
// State Machine (Model-Update-View)
// ------------------------------------------------------------------------------
const state = {
  activeTab: 0, // 0: Motion Canvas, 1: Bubble Tea Stepper, 2: Live Build Telemetry
  ticks: 0,
  paused: false,
  stepSelected: 0,
  stepConfirmed: false,
  simProgress: 0,
  simStage: 0,
  simLogs: [
    'Initializing sandbox virtual container environment...',
    'Allocating shared memory segment (shm_size: 2gb)...',
    'Binding WebRTC TCP multiplexer on port 52000...',
    'Generating 256-bit cryptographic AES authentication tokens...',
    'Spawning LiveKit multi-user audio SFU on 7880:7881...',
    'Pre-warming Chromium hardware-accelerated pipeline...',
    'Connecting Cloudflare Quick Tunnel edge ingress...',
    'Route registered: https://lesswatch-demo.trycloudflare.com',
    'System operational. Zero latency synchronization ready.'
  ]
};

// ------------------------------------------------------------------------------
// Multi-Frame ASCII Motion Art
// ------------------------------------------------------------------------------

// 1. Filmstrip Rollers (4 animation frames)
const FILMSTRIP_FRAMES = [
  [
    "  .---.       .---.       .---.  ",
    " / (•) \\=====/ (•) \\=====/ (•) \\ ",
    " \\  •  /=====\\  •  /=====\\  •  / ",
    "  '---'       '---'       '---'  "
  ],
  [
    "  .---.       .---.       .---.  ",
    " /  •  \\=====/  •  \\=====/  •  \\ ",
    " \\ (•) /=====\\ (•) /=====\\ (•) / ",
    "  '---'       '---'       '---'  "
  ],
  [
    "  .---.       .---.       .---.  ",
    " / •   \\=====/ •   \\=====/ •   \\ ",
    " \\   • /=====\\   • /=====\\   • / ",
    "  '---'       '---'       '---'  "
  ],
  [
    "  .---.       .---.       .---.  ",
    " /   • \\=====/   • \\=====/   • \\ ",
    " \\ •   /=====\\ •   /=====\\ •   / ",
    "  '---'       '---'       '---'  "
  ]
];

// 2. Popping Popcorn Kernels (6 animation frames)
const POPCORN_FRAMES = [
  [
    "         .           ",
    "       ( 🍿 )        ",
    "     .─-════-─.      ",
    "     │█ █ █ █ │      ",
    "     │█ █ █ █ │      ",
    "     ╰────────╯      "
  ],
  [
    "       *   .   *     ",
    "     ✦ ( 🍿 ) ✦      ",
    "     .─-════-─.      ",
    "     │█ █ █ █ │      ",
    "     │█ █ █ █ │      ",
    "     ╰────────╯      "
  ],
  [
    "     °   *   °   *   ",
    "    *  ( 🍿 )  *     ",
    "     .─-════-─.      ",
    "     │█ █ █ █ │      ",
    "     │█ █ █ █ │      ",
    "     ╰────────╯      "
  ],
  [
    "      .    ✦    .    ",
    "     ✦ ( 🍿 ) ✦      ",
    "     .─-════-─.      ",
    "     │█ █ █ █ │      ",
    "     │█ █ █ █ │      ",
    "     ╰────────╯      "
  ],
  [
    "       *   °   *     ",
    "       ( 🍿 )        ",
    "     .─-════-─.      ",
    "     │█ █ █ █ │      ",
    "     │█ █ █ █ │      ",
    "     ╰────────╯      "
  ],
  [
    "         .           ",
    "       ( 🍿 )        ",
    "     .─-════-─.      ",
    "     │█ █ █ █ │      ",
    "     │█ █ █ █ │      ",
    "     ╰────────╯      "
  ]
];

// 3. Iconic LESSWATCH Logo
const LOGO_LINES = [
  "██╗     ███████╗███████╗███████╗██╗    ██╗ █████╗ ████████╗ ██████╗██╗  ██╗",
  "██║     ██╔════╝██╔════╝██╔════╝██║    ██║██╔══██╗╚══██╔══╝██╔════╝██║  ██║",
  "██║     █████╗  ███████╗███████╗██║ █╗ ██║███████║   ██║   ██║     ███████║",
  "██║     ██╔══╝  ╚════██║╚════██║██║███╗██║██╔══██║   ██║   ██║     ██╔══██║",
  "███████╗███████╗███████║███████║╚███╔███╔╝██║  ██║   ██║   ╚██████╗██║  ██║",
  "╚══════╝╚══════╝╚══════╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝"
];

// ------------------------------------------------------------------------------
// Shimmer Wave & Color Interpolation Engine
// ------------------------------------------------------------------------------

// Generates a traveling light wave across the ASCII characters
function renderShimmerLogo(tick) {
  const len = LOGO_LINES[0].length;
  const sweepPos = tick % (len + 24);
  const out = [];

  for (let r = 0; r < LOGO_LINES.length; r++) {
    const line = LOGO_LINES[r];
    let rowStr = '';
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === ' ') {
        rowStr += ' ';
        continue;
      }
      const dist = Math.abs(c - sweepPos);
      if (dist === 0) {
        // Core of the light beam (blinding white)
        rowStr += `${WHITE}${BOLD}${ch}${RESET}`;
      } else if (dist === 1 || dist === 2) {
        // Intense Cyan / Violet corona
        rowStr += `${CYAN}${BOLD}${ch}${RESET}`;
      } else if (dist === 3 || dist === 4) {
        // Soft Coral Pink
        rowStr += `${PINK}${ch}${RESET}`;
      } else if (dist < 8) {
        // Deep Violet
        rowStr += `${PURPLE}${ch}${RESET}`;
      } else {
        // Ambient background glow
        rowStr += `${ZINC_MUTED}${ch}${RESET}`;
      }
    }
    out.push(rowStr);
  }
  return out;
}

// ------------------------------------------------------------------------------
// Card Box Renderer (Charm / Lipgloss Style)
// ------------------------------------------------------------------------------
function drawCard(width, title, contentLines, borderColor = PURPLE) {
  const innerW = width - 4;
  const topPad = BOX.h.repeat(2);
  const titleStr = title ? ` ${WHITE}${BOLD}${title}${RESET}${borderColor} ` : '';
  const titleVisibleLen = title ? title.length + 2 : 0;
  const topRemain = Math.max(0, innerW - titleVisibleLen - 2);
  const topBorder = `${borderColor}${BOX.tl}${topPad}${titleStr}${BOX.h.repeat(topRemain)}${BOX.tr}${RESET}`;
  const bottomBorder = `${borderColor}${BOX.bl}${BOX.h.repeat(innerW + 2)}${BOX.br}${RESET}`;

  const rows = [topBorder];
  for (const line of contentLines) {
    const cleanLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = Math.max(0, innerW - cleanLen);
    rows.push(`${borderColor}${BOX.v}${RESET}  ${line}${' '.repeat(padding)}${borderColor}${BOX.v}${RESET}`);
  }
  rows.push(bottomBorder);
  return rows;
}

// ------------------------------------------------------------------------------
// View Renderers
// ------------------------------------------------------------------------------

// TAB 1: ASCII Motion Showcase
function renderMotionView(w) {
  const logoRendered = renderShimmerLogo(state.ticks);
  const filmIdx = Math.floor(state.ticks / 3) % FILMSTRIP_FRAMES.length;
  const popIdx = Math.floor(state.ticks / 2) % POPCORN_FRAMES.length;

  const film = FILMSTRIP_FRAMES[filmIdx];
  const pop = POPCORN_FRAMES[popIdx];

  const lines = [
    '',
    `  ${ZINC_LIGHT}${ITALIC}Live 30 FPS Keyframed ASCII-Motion Canvas${RESET}  ${ZINC_DARK}•${RESET}  ${CYAN}Shimmer Sweep: active${RESET}`,
    ''
  ];

  // Add logo centered
  for (const row of logoRendered) {
    lines.push(`  ${row}`);
  }

  lines.push('');
  lines.push(`  ${ZINC_DARK}─────────────────────────────────────────────────────────────────────────────${RESET}`);
  lines.push('');

  // Side-by-side animated elements
  const compositeRows = Math.max(film.length, pop.length);
  for (let i = 0; i < compositeRows; i++) {
    const fLine = film[i] || ' '.repeat(35);
    const pLine = pop[i] || ' '.repeat(20);
    lines.push(`    ${CYAN}${fLine}${RESET}        ${PINK}${pLine}${RESET}    ${ZINC_MUTED}Frame: ${state.ticks} | FPS: 30${RESET}`);
  }

  lines.push('');
  lines.push(`  ${PURPLE}${BOLD}⚡ Motion Features:${RESET} ${ZINC_LIGHT}Double-buffered ANSI canvas • Continuous color interpolation • Zero flicker${RESET}`);
  lines.push('');

  return drawCard(w, 'ASCII-MOTION PLAYGROUND', lines, PURPLE);
}

// TAB 2: Bubble Tea Stepper (Charm Style)
function renderStepperView(w) {
  const options = [
    { title: '⚡ Google Cloud Shell / Ephemeral Sandbox', desc: 'Auto-configures port 8080 & Web Preview integration.' },
    { title: '🚀 Dedicated Linux Cloud VM (Ubuntu / Debian)', desc: 'Full 24/7 background hosting with direct UDP WebRTC.' },
    { title: '🔒 Custom Domain with Automatic SSL (Caddy)', desc: 'Production HTTPS with automated Let’s Encrypt SSL.' },
    { title: '💻 Local Workspace / Docker Desktop', desc: 'Fast local testing on your personal workstation.' }
  ];

  const lines = [
    '',
    `  ${WHITE}${BOLD}Select Target Infrastructure${RESET}  ${ZINC_MUTED}(Interactive Lipgloss Menu)${RESET}`,
    `  ${ZINC_DARK}Use ↑/↓ or j/k to navigate, [Enter] to confirm, [1-4] quick select${RESET}`,
    ''
  ];

  options.forEach((opt, idx) => {
    const isSelected = idx === state.stepSelected;
    if (isSelected) {
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
    lines.push(`  ${CYAN}${BOLD}${BOX.check} Confirmed:${RESET} ${WHITE}${BOLD}${options[state.stepSelected].title}${RESET} ${ZINC_MUTED}(Saved to state model)${RESET}`);
  } else {
    lines.push(`  ${AMBER}${BOLD}● Awaiting selection...${RESET} ${ZINC_MUTED}Press [Enter] to lock choice${RESET}`);
  }
  lines.push('');

  return drawCard(w, 'BUBBLE TEA INTERACTIVE STEPPER', lines, CYAN);
}

// TAB 3: Live Telemetry & Progress
function renderTelemetryView(w) {
  // Update simulated progress
  if (!state.paused && state.simProgress < 100) {
    state.simProgress = Math.min(100, state.simProgress + 0.6);
    state.simStage = Math.floor((state.simProgress / 100) * state.simLogs.length);
  }

  // Draw progress bar
  const barWidth = 42;
  const filled = Math.round((state.simProgress / 100) * barWidth);
  const empty = barWidth - filled;
  const barStr = `${PINK}${'█'.repeat(filled)}${ZINC_DARK}${'░'.repeat(empty)}${RESET}`;
  const pctStr = `${WHITE}${BOLD}${state.simProgress.toFixed(0)}%${RESET}`;

  const spinFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const spinner = spinFrames[state.ticks % spinFrames.length];

  const lines = [
    '',
    `  ${CYAN}${spinner}${RESET} ${WHITE}${BOLD}Compiling & Launching LESSWATCH Engine${RESET}  ${ZINC_MUTED}(${state.simProgress.toFixed(1)}%)${RESET}`,
    `  ${barStr}  ${pctStr}`,
    '',
    `  ${PURPLE}${BOLD}Active Subtask:${RESET} ${ZINC_LIGHT}${state.simLogs[Math.min(state.simStage, state.simLogs.length - 1)]}${RESET}`,
    '',
    `  ${ZINC_DARK}─────────────────────────────────────────────────────────────────────────────${RESET}`,
    `  ${WHITE}${BOLD}System Telemetry:${RESET}`,
    `    ${ZINC_MUTED}• Host Memory:${RESET}     ${GREEN}${Math.round(os.freemem() / 1024 / 1024)}MB Free${RESET} ${ZINC_DARK}/ ${Math.round(os.totalmem() / 1024 / 1024)}MB Total${RESET}`,
    `    ${ZINC_MUTED}• WebRTC Mux:${RESET}      ${CYAN}Port 52000 (TCP/UDP Unified)${RESET}`,
    `    ${ZINC_MUTED}• Edge Ingress:${RESET}    ${PINK}Cloudflare Quick Tunnel (Sub-second synced)${RESET}`,
    `    ${ZINC_MUTED}• Frame Budget:${RESET}    ${GREEN}33.3ms (Solid 30.0 FPS)${RESET}`,
    ''
  ];

  return drawCard(w, 'BUBBLE TEA LIVE TELEMETRY', lines, PINK);
}

// ------------------------------------------------------------------------------
// Master Render Loop
// ------------------------------------------------------------------------------
function render() {
  const w = Math.min(process.stdout.columns || 80, 84);

  // Tab Header Bar
  const tab0 = state.activeTab === 0 ? `${WHITE}${BOLD}[1] ASCII-Motion Canvas${RESET}` : `${ZINC_MUTED} 1  ASCII-Motion Canvas${RESET}`;
  const tab1 = state.activeTab === 1 ? `${WHITE}${BOLD}[2] Bubble Tea Stepper${RESET}` : `${ZINC_MUTED} 2  Bubble Tea Stepper${RESET}`;
  const tab2 = state.activeTab === 2 ? `${WHITE}${BOLD}[3] Live Telemetry${RESET}` : `${ZINC_MUTED} 3  Live Telemetry${RESET}`;

  const header = `
${ZINC_DARK}┌─────────────────────────────────────────────────────────────────────────────┐${RESET}
${ZINC_DARK}│${RESET}  ${BOLD}${WHITE}L E S S W A T C H${RESET}  ${PINK}🍿${RESET}  ${ZINC_MUTED}Impeccable Motion & Bubble Tea Lab${RESET}          ${CYAN}v4.2-LAB${RESET}  ${ZINC_DARK}│${RESET}
${ZINC_DARK}├─────────────────────────────────────────────────────────────────────────────┤${RESET}
${ZINC_DARK}│${RESET}  ${tab0}   ${tab1}   ${tab2}  ${ZINC_DARK}│${RESET}
${ZINC_DARK}└─────────────────────────────────────────────────────────────────────────────┘${RESET}`;

  // Footer Controls
  const footer = `
  ${ZINC_DARK}Controls:${RESET} ${WHITE}[Tab / 1-3]${RESET} Switch Views  ${ZINC_DARK}•${RESET} ${WHITE}[Space]${RESET} Pause Motion  ${ZINC_DARK}•${RESET} ${WHITE}[r]${RESET} Reset  ${ZINC_DARK}•${RESET} ${WHITE}[q / Esc]${RESET} Exit
`;

  let cardRows = [];
  if (state.activeTab === 0) cardRows = renderMotionView(w);
  else if (state.activeTab === 1) cardRows = renderStepperView(w);
  else if (state.activeTab === 2) cardRows = renderTelemetryView(w);

  // Buffer output to single atomic write to eliminate flicker entirely
  const fullFrame = `${ESC}[H${header}\n${cardRows.join('\n')}\n${footer}`;
  process.stdout.write(fullFrame);
}

// ------------------------------------------------------------------------------
// Initialization & Input Loop
// ------------------------------------------------------------------------------
function main() {
  // Enter Alternate Screen Buffer (Leaves main terminal scrollback 100% pristine!)
  process.stdout.write(`${ESC}[?1049h${ESC}[H${ESC}[2J${ESC}[?25l`);

  // Exit cleanup
  const exitApp = () => {
    // Leave alternate screen buffer & restore cursor
    process.stdout.write(`${ESC}[?1049l${ESC}[?25h`);
    process.exit(0);
  };

  process.on('SIGINT', exitApp);
  process.on('SIGTERM', exitApp);
  process.on('exit', () => process.stdout.write(`${ESC}[?1049l${ESC}[?25h`));

  // Keyboard Navigation
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on('keypress', (str, key) => {
    if (!key) return;

    if (key.name === 'q' || (key.ctrl && key.name === 'c') || key.name === 'escape') {
      exitApp();
    } else if (key.name === 'tab') {
      state.activeTab = (state.activeTab + 1) % 3;
    } else if (str === '1') {
      state.activeTab = 0;
    } else if (str === '2') {
      state.activeTab = 1;
    } else if (str === '3') {
      state.activeTab = 2;
    } else if (str === ' ') {
      state.paused = !state.paused;
    } else if (str === 'r' || str === 'R') {
      state.ticks = 0;
      state.simProgress = 0;
      state.stepConfirmed = false;
    } else if (state.activeTab === 1) {
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
    }
    render();
  }, 33);
}

main();
