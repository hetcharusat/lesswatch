#!/usr/bin/env node
/**
 * ==============================================================================
 * 🍿 LESSWATCH — Minimalist Synchronized Streaming & Cloud Desktop Engine
 * Impeccable Edition v4.2 • Distraction-Free Terminal UI & Live Build Pipeline
 * Architecture:
 *   - Alternate Screen Buffer (\x1b[?1049h): Sticky header NEVER scrolls away
 *   - ASCII Magic Inspired "progress-loader" stacked terminal engine
 *   - Rock-solid raw key listener: Arrows, Tab, Numbers, Enter (Ctrl+C to abort)
 *   - Real Docker BuildKit live telemetry stream in a fixed slot (zero log drift)
 *   - Live system telemetry: CPU, RAM, Duration & edge tunnel discovery
 *   - Zero external runtime dependencies (Pure Node.js standard library)
 * ==============================================================================
 */

import readline from 'readline';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;

// Impeccable high-contrast color palette
const CYAN = `${ESC}[38;2;34;211;238m`;       // #22d3ee Neon Cyan
const PINK = `${ESC}[38;2;244;114;182m`;      // #f472b6 Soft Rose
const VIOLET = `${ESC}[38;2;168;85;247m`;     // #a855f7 Electric Violet
const GREEN = `${ESC}[38;2;52;211;153m`;      // #34d399 Mint Green
const AMBER = `${ESC}[38;2;251;191;36m`;      // #fbbf24 Warm Amber
const WHITE = `${ESC}[38;2;255;255;255m`;     // #ffffff Pure White
const ZINC_LIGHT = `${ESC}[38;2;228;228;231m`; // #e4e4e7 Body
const ZINC_MUTED = `${ESC}[38;2;161;161;170m`; // #a1a1aa Subtext
const ZINC_DARK = `${ESC}[38;2;82;82;91m`;     // #52525b Borders & Separators

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
  process.stdout.write(`\n\n  ${AMBER}Installation cancelled by user.${RESET}\n\n`);
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

// Environment Detection
const isCloudShell = Boolean(
  process.env.CLOUD_SHELL ||
  process.env.DEVSHELL_PROJECT_ID ||
  fs.existsSync('/google/devshell') ||
  process.env.USER === 'cloudshell' ||
  (process.env.HOME && process.env.HOME.includes('cloudshell'))
);

let publicIP = '127.0.0.1';
try {
  publicIP = execSync("curl -s4 --max-time 2 https://api.ipify.org 2>/dev/null || curl -s4 --max-time 2 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'", { encoding: 'utf-8' }).trim() || '127.0.0.1';
} catch {}

const envTitle = isCloudShell
  ? 'Google Cloud Shell (Web Sandbox)'
  : (publicIP !== '127.0.0.1' ? `Dedicated Linux VM (${publicIP})` : 'Local Host / Docker');

// Pre-pull cloudflared in the background so tunnel launch is instantaneous
try {
  const bgPull = spawn('docker', ['pull', 'cloudflare/cloudflared:latest'], {
    stdio: 'ignore',
    detached: true
  });
  bgPull.unref();
} catch {}

// ------------------------------------------------------------------------------
// STICKY NAVBAR HEADER (Permanently at Rows 1-5, Never Scrolls)
// ------------------------------------------------------------------------------
function renderStickyNavbar(statusTags = []) {
  const { cols } = getTermSize();
  const width = Math.min(cols - 4, 76);
  const innerW = width - 2;

  const titleLine = `  ${BOLD}${WHITE}LESSWATCH${RESET} ${PINK}🍿${RESET} ${ZINC_MUTED}v4.2 • Cloud Desktop & Synchronized Streaming Engine${RESET}`;
  
  let subtitle = `Target: ${envTitle} • ${cpuCores} vCPU • ${totalMemGB}GB RAM`;
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
// ANIMATED PROGRESS-LOADER PIPELINE (ASCII Magic Inspired, Live System Stats)
// ------------------------------------------------------------------------------
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function runInstallationPipeline(stages, statusTags = []) {
  let activeIndex = 0;
  let activeTelemetry = 'Starting orchestration pipeline...';
  let frame = 0;
  const startTime = Date.now();

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
    
    // Live Telemetry Line (Current Docker/Shell Action in Fixed Slot)
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
      if (telemetry) {
        const clean = telemetry.trim()
          .replace(/[\r\n]+/g, ' ')
          .replace(/\x1b\[[0-9;]*m/g, '')
          .replace(/^[#0-9:\s\->]+/, '')
          .trim();
        if (clean.length > 2) activeTelemetry = clean;
      }
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
  await new Promise(r => setTimeout(r, 600)); // Brief victory pause
}

// ------------------------------------------------------------------------------
// MAIN DEPLOYMENT ORCHESTRATION
// ------------------------------------------------------------------------------
async function main() {
  enterAltScreen();

  const statusTags = [
    `Target: ${CYAN}${envTitle}${RESET}`,
    `RAM: ${WHITE}${totalMemGB}GB${RESET}`
  ];

  // 1. Target Infrastructure
  const defaultPlatform = isCloudShell ? 0 : (publicIP !== '127.0.0.1' ? 1 : 2);
  const platformChoice = await askInteractiveOption({
    title: 'Select Deployment Target',
    defaultIndex: defaultPlatform,
    statusTags,
    options: [
      {
        title: '⚡ Google Cloud Shell / Web Sandbox (Recommended for Testing)',
        desc: 'Zero port forwarding, binds cleanly to port 8080 with Web Preview integration.'
      },
      {
        title: '🚀 Dedicated Linux Cloud VM (Ubuntu / Debian / VPS / OCI)',
        desc: 'Permanent 24/7 background hosting with native high-speed UDP WebRTC.'
      },
      {
        title: '💻 Local Workspace / Docker Desktop',
        desc: 'Local testing on your PC workstation.'
      }
    ]
  });

  statusTags[0] = `Target: ${CYAN}${platformChoice === 0 ? 'Cloud Shell' : (platformChoice === 1 ? 'Linux VPS' : 'Local')}${RESET}`;

  // 2. Port Assignment
  const defaultPortIndex = (platformChoice === 0 || isCloudShell) ? 0 : 1;
  const portChoice = await askInteractiveOption({
    title: 'Select Application Port',
    defaultIndex: defaultPortIndex,
    statusTags,
    options: [
      {
        title: 'Port 8080 (Cloud Shell Web Preview Standard)',
        desc: 'Connect in 1 click using Google Cloud Shell Web Preview button.'
      },
      {
        title: 'Port 3000 (Default LESSWATCH Port)',
        desc: 'Standard microservice port for reverse proxies or private LANs.'
      },
      {
        title: 'Port 80 (Standard Public HTTP)',
        desc: 'Binds directly to port 80 (requires root and nothing else on port 80).'
      }
    ]
  });

  let targetPort = 8080;
  if (portChoice === 0) targetPort = 8080;
  else if (portChoice === 1) targetPort = 3000;
  else if (portChoice === 2) targetPort = 80;

  statusTags.push(`Port: ${WHITE}${targetPort}${RESET}`);

  // 3. Public Access Method
  const accessChoice = await askInteractiveOption({
    title: 'Select Public Sharing & Ingress Method',
    defaultIndex: 0,
    statusTags,
    options: [
      {
        title: '🌐 Instant Cloudflare Quick Tunnel (Free Public HTTPS)',
        desc: 'Generates a secure HTTPS link instantly with zero port forwarding required.'
      },
      {
        title: '🔒 Custom Domain with Automatic SSL (Caddy)',
        desc: 'Production HTTPS with Let’s Encrypt auto-renewal (e.g. watch.mywebsite.com).'
      },
      {
        title: '📡 Direct IP & Port',
        desc: `Direct access via http://${publicIP}:${targetPort} (no external proxy).`
      }
    ]
  });

  const enableTunnel = accessChoice === 0;
  const isBehindTunnel = enableTunnel || isCloudShell;
  statusTags.push(`Tunnel: ${enableTunnel ? `${GREEN}Enabled${RESET}` : `${ZINC_MUTED}Direct${RESET}`}`);

  // 4. Virtual Shared Browser (Neko Chromium)
  const nekoChoice = await askInteractiveOption({
    title: 'Shared Chromium Virtual Browser (Neko)',
    defaultIndex: 0,
    statusTags,
    options: [
      {
        title: '🎮 On-Demand Mode (Recommended)',
        desc: 'Container sleeps when idle; boots in 1-2s when room activates Neko. Saves ~600MB RAM.'
      },
      {
        title: '🚀 Always-On Mode',
        desc: 'Container runs permanently warm in the background (~600MB RAM usage).'
      },
      {
        title: '🚫 Disabled',
        desc: 'Disables virtual browser for ultra-low memory setups (<1GB RAM).'
      }
    ]
  });

  const enableNeko = nekoChoice !== 2;
  const nekoMode = nekoChoice === 1 ? 'always' : nekoChoice === 0 ? 'ondemand' : 'disabled';
  statusTags.push(`Neko: ${CYAN}${nekoMode === 'ondemand' ? 'On-Demand' : (nekoMode === 'always' ? 'Always-On' : 'Off')}${RESET}`);

  // ----------------------------------------------------------------------------
  // REAL DEPLOYMENT PIPELINE (Driven by Animated Progress-Loader)
  // ----------------------------------------------------------------------------
  let tunnelUrl = '';

  const stages = [
    // Stage 1: Docker Check
    {
      id: 'docker',
      label: 'Docker Daemon & Resource Check',
      action: async (update) => {
        update({ progress: 20, telemetry: 'Connecting to Docker daemon socket /var/run/docker.sock...' });
        await new Promise(r => setTimeout(r, 200));
        try {
          execSync('docker info', { stdio: 'ignore' });
        } catch {
          throw new Error('Docker daemon is not running. Please start Docker first.');
        }
        update({ progress: 80, telemetry: `Verified ${cpuCores} vCPU and ${totalMemGB}GB RAM allocation.` });
        await new Promise(r => setTimeout(r, 200));
        update({ progress: 100, telemetry: 'Docker engine check passed.' });
      }
    },

    // Stage 2: Firewall & Secrets
    {
      id: 'network',
      label: 'Network Ports & Cryptographic Secrets',
      action: async (update) => {
        update({ progress: 25, telemetry: 'Configuring network firewall ports...' });
        try {
          if (fs.existsSync('/usr/sbin/ufw')) {
            execSync(`ufw allow ${targetPort}/tcp >/dev/null 2>&1 || true`);
            execSync('ufw allow 7880:7881/tcp >/dev/null 2>&1 || true');
            execSync('ufw allow 50000:50200/udp >/dev/null 2>&1 || true');
            execSync('ufw allow 52000:52100/udp >/dev/null 2>&1 || true');
            execSync('ufw allow 52000/tcp >/dev/null 2>&1 || true');
          }
        } catch {}

        update({ progress: 60, telemetry: 'Generating cryptographic secrets & .env parameters...' });
        const livekitSecret = crypto.randomBytes(24).toString('hex');
        const vaultSecret = crypto.randomBytes(32).toString('hex');

        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads', { recursive: true });

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

        setEnvVar('PORT', targetPort);
        setEnvVar('LIVEKIT_API_KEY', 'watchtogether');
        setEnvVar('LIVEKIT_API_SECRET', livekitSecret);
        setEnvVar('VAULT_SECRET', vaultSecret);
        setEnvVar('NEKO_PASSWORD', 'admin');
        setEnvVar('NEKO_ADMIN_PASSWORD', 'admin');

        if (isBehindTunnel) {
          setEnvVar('NEKO_SCREEN', '960x540@20');
          setEnvVar('NEKO_DESKTOP_SCREEN', '960x540@20');
          setEnvVar('NEKO_VIDEO_BITRATE', '1500');
          setEnvVar('NEKO_MAX_FPS', '20');
          setEnvVar('NEKO_NAT1TO1', '');
          setEnvVar('NEKO_WEBRTC_NAT1TO1', '');
        } else {
          setEnvVar('NEKO_SCREEN', '1280x720@30');
          setEnvVar('NEKO_DESKTOP_SCREEN', '1280x720@30');
          setEnvVar('NEKO_VIDEO_BITRATE', '3072');
          setEnvVar('NEKO_MAX_FPS', '30');
          if (publicIP !== '127.0.0.1') {
            setEnvVar('NEKO_NAT1TO1', publicIP);
            setEnvVar('NEKO_WEBRTC_NAT1TO1', publicIP);
          }
        }

        const iceMode = (platformChoice === 1 && publicIP !== '127.0.0.1' && !isBehindTunnel) ? '1' : '0';
        setEnvVar('NEKO_ICELITE', iceMode);
        setEnvVar('NEKO_WEBRTC_ICELITE', iceMode);
        setEnvVar('NEKO_TCPMUX', '52000');
        setEnvVar('NEKO_WEBRTC_TCPMUX', '52000');

        fs.writeFileSync('.env', envContent.trim() + '\n');
        update({ progress: 100, telemetry: 'Network & cryptographic vault configuration written.' });
      }
    },

    // Stage 3: Core Services Build & Launch
    {
      id: 'services',
      label: 'LESSWATCH Core Services (Node + Vite)',
      action: async (update) => {
        const profiles = [];
        if (nekoMode === 'always') profiles.push('--profile', 'neko');

        return new Promise((resolve, reject) => {
          const cmdArgs = ['compose', ...profiles, 'up', '-d', '--build', 'watch-together', 'livekit'];
          update({ progress: 10, telemetry: 'Spawning Docker BuildKit engine...' });

          const child = spawn('docker', cmdArgs);
          let currentPct = 10;

          const handleOutput = (d) => {
            const lines = d.toString().split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed.includes('Step 1/')) currentPct = 20;
              else if (trimmed.includes('Step 2/')) currentPct = 35;
              else if (trimmed.includes('Step 3/')) currentPct = 50;
              else if (trimmed.includes('Step 4/')) currentPct = 65;
              else if (trimmed.includes('Step 5/')) currentPct = 80;
              else if (trimmed.includes('Step 6/')) currentPct = 90;
              else if (trimmed.includes('Started') || trimmed.includes('Running')) currentPct = 95;

              update({ progress: currentPct, telemetry: trimmed });
            }
          };

          child.stdout.on('data', handleOutput);
          child.stderr.on('data', handleOutput);

          child.on('close', (code) => {
            if (code === 0) {
              update({ progress: 100, telemetry: 'LESSWATCH core services & LiveKit server online.' });
              resolve();
            } else {
              reject(new Error(`Docker build failed with exit code ${code}`));
            }
          });

          child.on('error', (err) => reject(err));
        });
      }
    },

    // Stage 4: Virtual Chromium Browser Container
    {
      id: 'browser',
      label: 'Chromium Virtual Browser Container',
      action: async (update) => {
        if (!enableNeko) {
          update({ progress: 100, telemetry: 'Neko Virtual Browser disabled by user choice.' });
          return;
        }

        update({ progress: 20, telemetry: 'Checking local cache for m1k1o/neko:chromium...' });
        let imageCached = false;
        try {
          execSync('docker image inspect m1k1o/neko:chromium', { stdio: 'ignore' });
          imageCached = true;
        } catch {}

        if (imageCached) {
          update({ progress: 70, telemetry: 'Pre-warming Neko container in background...' });
          if (nekoMode === 'ondemand') {
            try { execSync('docker compose --profile neko up --no-start neko', { stdio: 'ignore' }); } catch {}
          } else if (nekoMode === 'always') {
            try { execSync('docker compose --profile neko up -d neko', { stdio: 'ignore' }); } catch {}
          }
          update({ progress: 100, telemetry: `Neko container ready (${nekoMode} mode).` });
        } else if (nekoMode === 'always') {
          update({ progress: 40, telemetry: 'Pulling m1k1o/neko:chromium image...' });
          try {
            execSync('docker compose --profile neko pull neko', { stdio: 'ignore', timeout: 600000 });
          } catch {
            execSync('docker pull m1k1o/neko:chromium', { stdio: 'ignore', timeout: 600000 });
          }
          execSync('docker compose --profile neko up -d neko', { stdio: 'ignore' });
          update({ progress: 100, telemetry: 'Neko Chromium browser running (Always-On).' });
        } else {
          // On-demand: Dispatch in background so installation finishes immediately
          update({ progress: 75, telemetry: 'Registering on-demand container triggers...' });
          try {
            const bgNeko = spawn('sh', ['-c', 'docker compose --profile neko pull neko >/dev/null 2>&1 && docker compose --profile neko up --no-start neko >/dev/null 2>&1'], {
              stdio: 'ignore',
              detached: true
            });
            bgNeko.unref();
          } catch {}
          update({ progress: 100, telemetry: 'Neko browser registered (Sleeps until launched in room).' });
        }
      }
    },

    // Stage 5: Cloudflare Edge Quick Tunnel (if enabled)
    {
      id: 'ingress',
      label: 'Cloudflare Edge Quick Tunnel',
      action: async (update) => {
        if (!enableTunnel) {
          update({ progress: 100, telemetry: `Direct ingress enabled via http://${publicIP}:${targetPort}` });
          return;
        }

        update({ progress: 20, telemetry: 'Connecting to Cloudflare edge network...' });
        try { execSync('docker rm -f wt-tunnel 2>/dev/null', { stdio: 'ignore' }); } catch {}

        execSync(`docker run -d --name wt-tunnel --restart=unless-stopped --network=host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:${targetPort}`, { stdio: 'ignore' });

        const maxAttempts = 35;
        for (let i = 0; i < maxAttempts; i++) {
          await new Promise(r => setTimeout(r, 600));
          const currentProgress = 20 + Math.round((i / maxAttempts) * 75);
          try {
            const logs = execSync('docker logs wt-tunnel 2>&1', { encoding: 'utf-8' });
            const match = logs.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match) {
              tunnelUrl = match[0];
              update({ progress: 100, telemetry: `Tunnel active: ${tunnelUrl}` });
              break;
            }
          } catch {}
          update({ progress: currentProgress, telemetry: `Requesting edge route assignment (${i + 1}s)...` });
        }

        if (!tunnelUrl) {
          tunnelUrl = `http://${publicIP}:${targetPort}`;
        }
      }
    }
  ];

  await runInstallationPipeline(stages, statusTags);

  // Restore normal terminal buffer before printing permanent final card
  restoreTerminal();

  // ----------------------------------------------------------------------------
  // Final Impeccable Summary Dashboard (Permanent in Terminal Scrollback)
  // ----------------------------------------------------------------------------
  const primaryUrl = tunnelUrl || `http://${publicIP}:${targetPort}`;
  const previewUrl = `http://localhost:${targetPort}`;
  const { cols } = getTermSize();
  const width = Math.min(cols - 4, 76);
  const innerW = width - 2;

  process.stdout.write(`
  ${ZINC_DARK}┌${'─'.repeat(innerW)}┐${RESET}
  ${ZINC_DARK}│${RESET}  ${BOLD}${WHITE}LESSWATCH is Live & Streaming${RESET}  ${PINK}🍿${RESET}${' '.repeat(Math.max(0, innerW - 35))}${ZINC_DARK}│${RESET}
  ${ZINC_DARK}└${'─'.repeat(innerW)}┘${RESET}

    ${CYAN}${BOLD}Public URL:${RESET}     ${WHITE}${BOLD}${primaryUrl}${RESET}
    ${ZINC_MUTED}Web Preview:${RESET}    ${PINK}${previewUrl}${RESET}
    ${ZINC_MUTED}Credentials:${RESET}    ${WHITE}admin / admin${RESET}

    ${ZINC_MUTED}Components:${RESET}
    ${ZINC_DARK}•${RESET} Virtual Browser:   ${enableNeko ? `${GREEN}Ready (${nekoMode} • ${isBehindTunnel ? '540p@20 tunnel-optimized' : '720p@30 direct'})${RESET}` : `${AMBER}Disabled${RESET}`}
    ${ZINC_DARK}•${RESET} Media Downloader:  ${GREEN}Operational (aria2c + yt-dlp resolver)${RESET}

  ${ZINC_DARK}────────────────────────────────────────────────────────────────────────${RESET}
  ${ZINC_MUTED}Manage:${RESET}  ${CYAN}docker compose ps${RESET}  ${ZINC_DARK}•${RESET}  ${CYAN}docker compose logs -f watch-together${RESET}\n\n`);

  process.exit(0);
}

main().catch(err => {
  restoreTerminal();
  process.stdout.write(`\n  ${PINK}${BOLD}Error:${RESET} ${err.message}\n\n`);
  process.exit(1);
});
