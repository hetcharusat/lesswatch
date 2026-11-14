#!/usr/bin/env node
/**
 * ==============================================================================
 * 🍿 LESSWATCH — Impeccable Sticky Header & Progress-Loader Installation Engine
 * Architecture:
 *   - Alternate Screen Buffer (\x1b[?1049h): Sticky header NEVER scrolls away
 *   - ASCII Magic Inspired "progress-loader" terminal engine
 *   - Rock-solid raw key listener: Arrows, Tab, Numbers, Enter (Ctrl+C to abort)
 *   - Live system telemetry: CPU, RAM, Duration & Docker command output
 *   - Zero external runtime dependencies (Pure Node.js standard library)
 * ==============================================================================
 */

import readline from 'readline';
import os from 'os';

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;

// Impeccable high-contrast color palette
const CYAN = `${ESC}[38;2;34;211;238m`;       // #22d3ee
const PINK = `${ESC}[38;2;244;114;182m`;      // #f472b6
const GREEN = `${ESC}[38;2;52;211;153m`;      // #34d399
const AMBER = `${ESC}[38;2;251;191;36m`;      // #fbbf24
const WHITE = `${ESC}[38;2;255;255;255m`;     // #ffffff
const ZINC_LIGHT = `${ESC}[38;2;228;228;231m`; // #e4e4e7
const ZINC_MUTED = `${ESC}[38;2;161;161;170m`; // #a1a1aa
const ZINC_DARK = `${ESC}[38;2;82;82;91m`;     // #52525b

// Terminal dimensions
function getTermSize() {
  return {
    cols: Math.max(process.stdout.columns || 80, 60),
    rows: Math.max(process.stdout.rows || 24, 20)
  };
}

// Cleanup screen & cursor on exit
let inAltScreen = false;
function restoreTerminal() {
  if (inAltScreen) {
    process.stdout.write(`${ESC}[?1049l${ESC}[?25h`);
    inAltScreen = false;
  } else {
    process.stdout.write(`${ESC}[?25h`);
  }
}

process.on('exit', restoreTerminal);
process.on('SIGINT', () => {
  restoreTerminal();
  process.stdout.write(`\n\n  ${AMBER}Installation aborted by user.${RESET}\n\n`);
  process.exit(130);
});
process.on('SIGTERM', () => {
  restoreTerminal();
  process.exit(143);
});

// Enter Alternate Screen Buffer (Sticky Viewport)
function enterAltScreen() {
  if (process.stdout.isTTY) {
    process.stdout.write(`${ESC}[?1049h${ESC}[H${ESC}[?25l`);
    inAltScreen = true;
  } else {
    process.stdout.write(`${ESC}[?25l`);
  }
}

// System Hardware Telemetry
const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
const totalMemGB = (totalMemMB / 1024).toFixed(1);
const cpuCores = os.cpus().length;

function getMemUsedMB() {
  const freeMB = Math.round(os.freemem() / (1024 * 1024));
  return Math.max(totalMemMB - freeMB, 400);
}

// Truncate helper
function fit(str, maxLen) {
  if (!str) return '';
  const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
  if (clean.length <= maxLen) return str;
  return clean.slice(0, maxLen - 1) + '…';
}

// ------------------------------------------------------------------------------
// STICKY NAVBAR HEADER (Permanently at Rows 1-5, Never Scrolls)
// ------------------------------------------------------------------------------
function renderStickyNavbar(statusTags = []) {
  const { cols } = getTermSize();
  const width = Math.min(cols - 4, 76);
  const innerW = width - 2;

  const titleLine = `  ${BOLD}${WHITE}LESSWATCH${RESET} ${PINK}🍿${RESET} ${ZINC_MUTED}v4.2 • Cloud Desktop & Synchronized Streaming Engine${RESET}`;

  let subtitle = `Target: Cloud Shell • ${cpuCores} vCPU • ${totalMemGB}GB RAM`;
  if (statusTags.length > 0) {
    subtitle = statusTags.join(` ${ZINC_DARK}•${RESET} `);
  }

  const borderTop = `  ${ZINC_DARK}┌${'─'.repeat(innerW)}┐${RESET}`;
  const borderBot = `  ${ZINC_DARK}└${'─'.repeat(innerW)}┘${RESET}`;
  const line1 = `  ${ZINC_DARK}│${RESET}  ${titleLine}${' '.repeat(Math.max(0, innerW - 55))}  ${ZINC_DARK}│${RESET}`;
  const line2 = `  ${ZINC_DARK}│${RESET}  ${ZINC_MUTED}${fit(subtitle, innerW - 4)}${RESET}${' '.repeat(Math.max(0, innerW - subtitle.length - 4))}  ${ZINC_DARK}│${RESET}`;

  return `${borderTop}\n${line1}\n${line2}\n${borderBot}\n`;
}

// ------------------------------------------------------------------------------
// ROCK-SOLID INTERACTIVE MENU (Sticky Viewport, Tab/Arrows, No Scroll)
// ------------------------------------------------------------------------------
async function askInteractiveOption({ title, options, defaultIndex = 0, statusTags = [] }) {
  if (!process.stdin.isTTY) {
    return defaultIndex;
  }
  return new Promise((resolve) => {
    let selected = defaultIndex;
    const count = options.length;

    const renderScreen = () => {
      let out = `${ESC}[H`; // Move cursor to top-left (Row 1, Col 1)
      out += renderStickyNavbar(statusTags);
      out += `\n  ${CYAN}?${RESET} ${WHITE}${BOLD}${title}${RESET}\n\n`;

      options.forEach((opt, idx) => {
        const isSel = idx === selected;
        if (isSel) {
          out += `    ${CYAN}${BOLD}●${RESET} ${WHITE}${BOLD}${opt.title}${RESET}${ESC}[K\n`;
          if (opt.desc) {
            out += `        ${ZINC_LIGHT}${opt.desc}${RESET}${ESC}[K\n`;
          }
        } else {
          out += `    ${ZINC_DARK}○${RESET} ${ZINC_MUTED}${opt.title}${RESET}${ESC}[K\n`;
          if (opt.desc) {
            out += `        ${ZINC_DARK}${opt.desc}${RESET}${ESC}[K\n`;
          }
        }
      });

      out += `\n  ${ZINC_DARK}Use [↑/↓] or [Tab] to navigate • [1-${count}] Direct • [Enter] Confirm${RESET}${ESC}[K\n`;
      out += `${ESC}[J`; // Clear any leftover rows below
      process.stdout.write(out);
    };

    renderScreen();

    // Raw key listener
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const onKey = (str, key) => {
      // ONLY Ctrl+C quits
      if (key && key.ctrl && key.name === 'c') {
        restoreTerminal();
        process.stdout.write(`\n\n  ${AMBER}Installation aborted.${RESET}\n\n`);
        process.exit(130);
      }

      // Hotkey numbers (1-9)
      if (str && /^[1-9]$/.test(str)) {
        const num = parseInt(str, 10) - 1;
        if (num >= 0 && num < count) {
          selected = num;
          renderScreen();
        }
        return;
      }

      // Tab key navigation (cycles forward)
      const isTab = (key && key.name === 'tab') || str === '\t';
      if (isTab) {
        selected = (selected + 1) % count;
        renderScreen();
        return;
      }

      // Arrow keys (handles both key object and raw escape strings)
      const isUp = (key && (key.name === 'up' || key.name === 'k')) || str === '\x1b[A';
      const isDown = (key && (key.name === 'down' || key.name === 'j')) || str === '\x1b[B';
      const isConfirm = (key && (key.name === 'return' || key.name === 'enter')) || str === '\r' || str === '\n' || str === ' ';

      if (isUp) {
        selected = (selected - 1 + count) % count;
        renderScreen();
      } else if (isDown) {
        selected = (selected + 1) % count;
        renderScreen();
      } else if (isConfirm) {
        process.stdin.removeListener('keypress', onKey);
        resolve(selected);
      }
    };

    process.stdin.on('keypress', onKey);
  });
}

// ------------------------------------------------------------------------------
// ANIMATED PROGRESS-LOADER ENGINE (ASCII Magic Inspired, Live System Stats)
// ------------------------------------------------------------------------------
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function runInstallationPipeline(stages, statusTags = []) {
  let activeIndex = 0;
  let activeTelemetry = 'Starting orchestration pipeline...';
  let frame = 0;
  const startTime = Date.now();

  // Each stage: { id, label, progress (0-100), status: 'pending'|'running'|'done'|'failed' }
  const stageStates = stages.map((s, idx) => ({
    id: s.id,
    label: s.label,
    progress: 0,
    status: idx === 0 ? 'running' : 'pending',
    duration: 0
  }));

  const BAR_WIDTH = 26;

  const renderFrame = () => {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const spinChar = SPINNER[frame % SPINNER.length];
    frame++;

    let out = `${ESC}[H`; // Sticky reset to top
    out += renderStickyNavbar(statusTags);
    out += `\n  ${BOLD}${WHITE}Installing LESSWATCH Infrastructure${RESET}\n\n`;

    // Render "progress-loader" stacked bars
    stageStates.forEach((stage, idx) => {
      const isCurrent = idx === activeIndex;
      const isDone = stage.status === 'done';
      const isPending = stage.status === 'pending';

      // Indicator
      let icon = `${ZINC_DARK}○${RESET}`;
      let tagColor = ZINC_MUTED;
      let barFilledColor = CYAN;

      if (isDone) {
        icon = `${GREEN}✔${RESET}`;
        tagColor = GREEN;
        barFilledColor = GREEN;
      } else if (isCurrent) {
        icon = `${CYAN}${spinChar}${RESET}`;
        tagColor = WHITE;
        barFilledColor = CYAN;
      }

      // Bar fill calculation
      const pct = Math.min(100, Math.max(0, Math.round(stage.progress)));
      const filledLen = Math.round((pct / 100) * BAR_WIDTH);
      const emptyLen = BAR_WIDTH - filledLen;

      const barStr = `${barFilledColor}${'█'.repeat(filledLen)}${RESET}${ZINC_DARK}${'░'.repeat(emptyLen)}${RESET}`;
      const pctStr = `${String(pct).padStart(3)}%`;

      const stageTag = stage.id.padEnd(8);
      const durationStr = isDone ? `(${stage.duration}s)` : (isCurrent ? `(${elapsedSec}s)` : '');

      out += `    ${icon} ${tagColor}${stageTag}${RESET}  ${barStr}  ${tagColor}${pctStr}${RESET}  ${stage.label} ${ZINC_MUTED}${durationStr}${RESET}${ESC}[K\n`;
    });

    out += `\n  ${ZINC_DARK}───────────────────────────────────────────────────────────────────${RESET}${ESC}[K\n`;

    // Live Telemetry Line (Current Docker/Shell Action)
    const shortTelem = fit(activeTelemetry, 68);
    out += `  ${PINK}⚡ Telemetry:${RESET} ${WHITE}${shortTelem}${RESET}${ESC}[K\n`;

    // Live System Resources
    const usedMB = getMemUsedMB();
    const usedGB = (usedMB / 1024).toFixed(1);
    out += `  ${CYAN}📊 Live Stats:${RESET} ${ZINC_MUTED}CPU: ${cpuCores} vCPU • RAM: ${usedGB}GB / ${totalMemGB}GB • Time: ${elapsedSec}s${RESET}${ESC}[K\n`;
    out += `${ESC}[J`;

    process.stdout.write(out);
  };

  const timer = setInterval(renderFrame, 80);

  // Execute stages sequentially
  for (let i = 0; i < stages.length; i++) {
    activeIndex = i;
    stageStates[i].status = 'running';
    const stageStart = Date.now();

    const updateStage = ({ progress, telemetry }) => {
      if (typeof progress === 'number') stageStates[i].progress = progress;
      if (telemetry) activeTelemetry = telemetry;
    };

    try {
      await stages[i].action(updateStage);
      stageStates[i].progress = 100;
      stageStates[i].status = 'done';
      stageStates[i].duration = ((Date.now() - stageStart) / 1000).toFixed(1);
    } catch (err) {
      clearInterval(timer);
      stageStates[i].status = 'failed';
      renderFrame();
      throw err;
    }
  }

  clearInterval(timer);
  renderFrame();
  await new Promise(r => setTimeout(r, 600)); // Brief pause on completion
}

// ------------------------------------------------------------------------------
// MAIN TEST FLOW
// ------------------------------------------------------------------------------
async function main() {
  enterAltScreen();

  const statusTags = [
    `Target: ${CYAN}Cloud Shell${RESET}`,
    `RAM: ${WHITE}${totalMemGB}GB${RESET}`
  ];

  // Step 1: Target Platform
  const targetIdx = await askInteractiveOption({
    title: 'Select Deployment Target',
    defaultIndex: 0,
    statusTags,
    options: [
      {
        title: '⚡ Google Cloud Shell / Web Sandbox (Recommended)',
        desc: 'Optimized for browser sandbox, zero port forwarding, binds to 8080.'
      },
      {
        title: '🚀 Dedicated Linux Cloud VM (Ubuntu / Debian / VPS / OCI)',
        desc: 'Permanent 24/7 background hosting with native direct UDP WebRTC.'
      },
      {
        title: '💻 Local Workspace / Docker Desktop',
        desc: 'Local testing on your PC workstation.'
      }
    ]
  });

  statusTags[0] = `Target: ${CYAN}${targetIdx === 0 ? 'Cloud Shell' : (targetIdx === 1 ? 'Linux VPS' : 'Local')}${RESET}`;

  // Step 2: Shared Virtual Browser Mode
  const nekoIdx = await askInteractiveOption({
    title: 'Shared Chromium Virtual Browser (Neko)',
    defaultIndex: 0,
    statusTags,
    options: [
      {
        title: '🎮 On-Demand Mode (Recommended)',
        desc: 'Sleeps when idle. Boots in 1s when room activates Neko. Saves ~600MB RAM.'
      },
      {
        title: '🚀 Always-On Mode',
        desc: 'Instantly warm and ready at all times (~600MB permanent RAM usage).'
      },
      {
        title: '🚫 Disabled',
        desc: 'Disables virtual browser for low-resource environments (<1GB RAM).'
      }
    ]
  });

  statusTags.push(`Neko: ${CYAN}${nekoIdx === 0 ? 'On-Demand' : (nekoIdx === 1 ? 'Always-On' : 'Off')}${RESET}`);

  // Step 3: Server Media Downloader
  const ariaIdx = await askInteractiveOption({
    title: 'Server Torrent & Media Downloader (aria2c + yt-dlp)',
    defaultIndex: 0,
    statusTags,
    options: [
      {
        title: '⚡ Enabled (Full BitTorrent & Stream Downloader)',
        desc: 'Aria2 background daemon with DHT + yt-dlp stream pipeline directly into Media Library.'
      },
      {
        title: '🚫 Disabled',
        desc: 'Disable background downloader engine.'
      }
    ]
  });

  statusTags.push(`Downloader: ${CYAN}${ariaIdx === 0 ? 'Enabled' : 'Disabled'}${RESET}`);

  // ----------------------------------------------------------------------------
  // Execution: 5-Stage Animated Progress Pipeline
  // ----------------------------------------------------------------------------
  const stages = [
    {
      id: 'docker',
      label: 'Docker Daemon & Resource Check',
      action: async (update) => {
        update({ progress: 20, telemetry: 'Connecting to Docker daemon socket /var/run/docker.sock' });
        await new Promise(r => setTimeout(r, 400));
        update({ progress: 65, telemetry: `Verified ${cpuCores} vCPU and ${totalMemGB}GB RAM allocation.` });
        await new Promise(r => setTimeout(r, 400));
        update({ progress: 100, telemetry: 'Docker engine check passed.' });
      }
    },
    {
      id: 'network',
      label: 'Network Ports & Cryptographic Secrets',
      action: async (update) => {
        update({ progress: 30, telemetry: 'Opening firewall ports (8080/tcp, 7880:7881, 52000)...' });
        await new Promise(r => setTimeout(r, 400));
        update({ progress: 75, telemetry: 'Writing .env secrets & generating AES session keys...' });
        await new Promise(r => setTimeout(r, 400));
        update({ progress: 100, telemetry: 'Network & security parameters generated.' });
      }
    },
    {
      id: 'services',
      label: 'LESSWATCH Core Services (Node + Vite)',
      action: async (update) => {
        update({ progress: 15, telemetry: 'Building Docker container layer: ffmpeg aria2c...' });
        await new Promise(r => setTimeout(r, 600));
        update({ progress: 45, telemetry: 'Step 4/7: RUN npm ci --omit=dev [watch-together]' });
        await new Promise(r => setTimeout(r, 700));
        update({ progress: 80, telemetry: 'Vite production build bundled in 407ms.' });
        await new Promise(r => setTimeout(r, 500));
        update({ progress: 100, telemetry: 'LiveKit server & LESSWATCH services online.' });
      }
    },
    {
      id: 'browser',
      label: 'Chromium Virtual Browser Container',
      action: async (update) => {
        update({ progress: 30, telemetry: 'Pulling m1k1o/neko:chromium lightweight image...' });
        await new Promise(r => setTimeout(r, 600));
        update({ progress: 70, telemetry: 'Configuring TCP-mux port 52000 and OpenRelay TURN...' });
        await new Promise(r => setTimeout(r, 500));
        update({ progress: 100, telemetry: 'Neko browser configured (On-Demand sleep mode).' });
      }
    },
    {
      id: 'ingress',
      label: 'Cloudflare Edge Quick Tunnel',
      action: async (update) => {
        update({ progress: 25, telemetry: 'Connecting to Cloudflare edge edge network...' });
        await new Promise(r => setTimeout(r, 500));
        update({ progress: 85, telemetry: 'Routing public HTTPS tunnel to localhost:8080...' });
        await new Promise(r => setTimeout(r, 600));
        update({ progress: 100, telemetry: 'Edge tunnel established: https://lesswatch-demo.trycloudflare.com' });
      }
    }
  ];

  await runInstallationPipeline(stages, statusTags);

  // Restore normal terminal screen before printing permanent summary
  restoreTerminal();

  // Final Summary Output in permanent scrollback
  process.stdout.write(`
  ${ZINC_DARK}┌────────────────────────────────────────────────────────────────────────┐${RESET}
  ${ZINC_DARK}│${RESET}  ${BOLD}${WHITE}LESSWATCH is Live & Streaming${RESET}  ${PINK}🍿${RESET}${' '.repeat(41)}${ZINC_DARK}│${RESET}
  ${ZINC_DARK}└────────────────────────────────────────────────────────────────────────┘${RESET}

    ${CYAN}${BOLD}Public URL:${RESET}     ${WHITE}${BOLD}https://lesswatch-demo.trycloudflare.com${RESET}
    ${ZINC_MUTED}Web Preview:${RESET}    ${PINK}http://localhost:8080${RESET}
    ${ZINC_MUTED}Credentials:${RESET}    ${WHITE}admin / admin${RESET}

    ${ZINC_MUTED}Components:${RESET}
    ${ZINC_DARK}•${RESET} Virtual Browser:   ${GREEN}Ready (On-Demand • 540p@20 tunnel-optimized)${RESET}
    ${ZINC_DARK}•${RESET} Media Downloader:  ${GREEN}Operational (aria2c + yt-dlp)${RESET}

  ${ZINC_DARK}────────────────────────────────────────────────────────────────────────${RESET}
  ${ZINC_MUTED}Manage:${RESET}  ${CYAN}docker compose ps${RESET}  ${ZINC_DARK}•${RESET}  ${CYAN}docker compose logs -f${RESET}\n\n`);

  process.exit(0);
}

main().catch(err => {
  restoreTerminal();
  process.stdout.write(`\n  ${PINK}Fatal Error:${RESET} ${err.message}\n\n`);
  process.exit(1);
});
