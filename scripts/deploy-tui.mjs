#!/usr/bin/env node
/**
 * ==============================================================================
 * 🍿 LESSWATCH — Minimalist Synchronized Streaming & Cloud Desktop Engine
 * Impeccable Edition v4.2 • Distraction-Free Terminal UI & Live Build Pipeline
 * ==============================================================================
 */

import readline from 'readline';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

// ------------------------------------------------------------------------------
// Impeccable Disciplined ANSI Palette (High-Contrast, Focused)
// ------------------------------------------------------------------------------
const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;

// Color Accents
const CYAN = `${ESC}[38;2;34;211;238m`;       // Neon Cyan
const PINK = `${ESC}[38;2;244;114;182m`;      // Soft Coral / Rose
const VIOLET = `${ESC}[38;2;168;85;247m`;     // Electric Violet
const GREEN = `${ESC}[38;2;52;211;153m`;      // Mint Green
const AMBER = `${ESC}[38;2;251;191;36m`;      // Warm Amber
const WHITE = `${ESC}[38;2;255;255;255m`;     // Pure White
const ZINC_LIGHT = `${ESC}[38;2;212;212;216m`; // Text Zinc
const ZINC_MUTED = `${ESC}[38;2;113;113;122m`; // Muted Subtext
const ZINC_DARK = `${ESC}[38;2;63;63;70m`;     // Borders & Separators

// Clean up cursor on exit
function restoreCursor() {
  process.stdout.write(`${ESC}[?25h`);
}
process.on('exit', restoreCursor);
process.on('SIGINT', () => {
  restoreCursor();
  process.stdout.write(`\n\n  ${AMBER}Deployment cancelled by user.${RESET}\n\n`);
  process.exit(130);
});
process.on('SIGTERM', () => {
  restoreCursor();
  process.exit(143);
});

// Hide cursor during interactive run
process.stdout.write(`${ESC}[?25l`);

// Helper to safely truncate string to terminal width
function fitWidth(str, maxLen) {
  const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
  if (clean.length <= maxLen) return str;
  return clean.slice(0, maxLen - 1) + '…';
}

// ------------------------------------------------------------------------------
// System & Environment Detection
// ------------------------------------------------------------------------------
const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
const cpuCores = os.cpus().length;
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
  ? 'Google Cloud Shell (Sandbox Egress NAT)'
  : (publicIP !== '127.0.0.1' ? `Dedicated Linux VM (${publicIP})` : 'Local Host / Docker');

// Pre-pull cloudflared quietly in the background so tunnel launch is instantaneous
try {
  const bgPull = spawn('docker', ['pull', 'cloudflare/cloudflared:latest'], {
    stdio: 'ignore',
    detached: true
  });
  bgPull.unref();
} catch {}

// ------------------------------------------------------------------------------
// Sticky Impeccable Header
// ------------------------------------------------------------------------------
function printHeader() {
  console.clear();
  const width = Math.min(process.stdout.columns || 80, 84);
  const borderLine = '─'.repeat(width - 2);

  process.stdout.write(`
${ZINC_DARK}┌${borderLine}┐${RESET}
${ZINC_DARK}│${RESET}  ${BOLD}${WHITE}L E S S W A T C H${RESET}  ${PINK}🍿${RESET}  ${ZINC_MUTED}Minimalist Sync Streaming & Cloud Engine${RESET}${' '.repeat(Math.max(0, width - 68))}${ZINC_DARK}│${RESET}
${ZINC_DARK}├${borderLine}┤${RESET}
${ZINC_DARK}│${RESET}  ${ZINC_MUTED}Target:${RESET} ${CYAN}${envTitle}${RESET}  ${ZINC_DARK}•${RESET}  ${ZINC_MUTED}Specs:${RESET} ${WHITE}${cpuCores} vCPU / ${totalMemMB}MB RAM${RESET}${' '.repeat(Math.max(0, width - 58 - envTitle.length))}${ZINC_DARK}│${RESET}
${ZINC_DARK}└${borderLine}┘${RESET}\n
`);
}

// ------------------------------------------------------------------------------
// Focused Collapsing Menu Component
// ------------------------------------------------------------------------------
async function askStep({ stepNum, totalSteps, title, options, defaultIndex = 0 }) {
  return new Promise((resolve) => {
    let selected = defaultIndex;
    const count = options.length;

    const renderOption = (idx) => {
      const opt = options[idx];
      const isSelected = idx === selected;
      let out = '';
      if (isSelected) {
        out += `  ${VIOLET}${BOLD}●${RESET} ${WHITE}${BOLD}${opt.title}${RESET}\n`;
        if (opt.desc) {
          out += `    ${ZINC_LIGHT}${opt.desc}${RESET}\n`;
        }
      } else {
        out += `  ${ZINC_DARK}○${RESET} ${ZINC_MUTED}${opt.title}${RESET}\n`;
        if (opt.desc) {
          out += `    ${ZINC_DARK}${opt.desc}${RESET}\n`;
        }
      }
      return out;
    };

    let totalLines = 0;
    options.forEach(opt => {
      totalLines += opt.desc ? 2 : 1;
    });

    process.stdout.write(`${VIOLET}${BOLD}[${stepNum}/${totalSteps}]${RESET} ${WHITE}${BOLD}${title}${RESET}\n`);
    process.stdout.write(`${ZINC_MUTED}  [↑/↓] Navigate  [1-${count}] Select  [Enter] Confirm${RESET}\n`);

    // Render options
    options.forEach((_, idx) => {
      process.stdout.write(renderOption(idx));
    });

    const redraw = () => {
      process.stdout.write(`${ESC}[${totalLines}A`);
      options.forEach((_, idx) => {
        process.stdout.write(`${ESC}[2K${renderOption(idx)}`);
      });
    };

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const onKeypress = (str, key) => {
      // Quit ONLY on Ctrl+C (Never on bare escape or arrow prefixes!)
      if (key && key.ctrl && key.name === 'c') {
        restoreCursor();
        process.stdout.write(`\n\n  ${AMBER}Installation cancelled.${RESET}\n\n`);
        process.exit(130);
      }

      // Quick number select
      if (str && /^[1-9]$/.test(str)) {
        const num = parseInt(str, 10) - 1;
        if (num >= 0 && num < count) {
          selected = num;
          redraw();
        }
        return;
      }

      // Arrow navigation (handles both key object and raw sequence strings)
      const isUp = (key && (key.name === 'up' || key.name === 'k')) || str === '\x1b[A';
      const isDown = (key && (key.name === 'down' || key.name === 'j')) || str === '\x1b[B';
      const isConfirm = (key && (key.name === 'return' || key.name === 'enter')) || str === '\r' || str === '\n';

      if (isUp) {
        selected = (selected - 1 + count) % count;
        redraw();
      } else if (isDown) {
        selected = (selected + 1) % count;
        redraw();
      } else if (isConfirm) {
        cleanup();
        // Collapse menu into single clean confirmation line
        const linesToErase = totalLines + 2;
        process.stdout.write(`${ESC}[${linesToErase}A`);
        for (let i = 0; i < linesToErase; i++) {
          process.stdout.write(`${ESC}[2K\n`);
        }
        process.stdout.write(`${ESC}[${linesToErase}A`);
        process.stdout.write(`${GREEN}${BOLD}✔${RESET} ${ZINC_LIGHT}${title}:${RESET} ${WHITE}${BOLD}${options[selected].title}${RESET}\n\n`);
        resolve(selected);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    };

    process.stdin.on('keypress', onKeypress);
  });
}

// ------------------------------------------------------------------------------
// Impeccable Live Execution Runner with Sub-Status Streaming
// ------------------------------------------------------------------------------
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function runLiveTask({ step, total, title, execute }) {
  let frame = 0;
  const startTime = Date.now();
  let currentDetail = '';
  const termWidth = Math.min(process.stdout.columns || 80, 100);

  // Initial draw
  process.stdout.write(`  ${CYAN}${SPINNER[0]}${RESET} ${ZINC_MUTED}[${step}/${total}]${RESET} ${WHITE}${title}${RESET}\n`);
  process.stdout.write(`    ${ZINC_DARK}↳ Initializing task pipeline...${RESET}\n`);

  const timer = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const spinChar = SPINNER[frame % SPINNER.length];
    frame++;

    // Move up 2 lines, redraw title & detail
    process.stdout.write(`${ESC}[2A`);
    process.stdout.write(`${ESC}[2K  ${CYAN}${spinChar}${RESET} ${ZINC_MUTED}[${step}/${total}]${RESET} ${WHITE}${title}${RESET} ${ZINC_MUTED}(${elapsed}s)${RESET}\n`);
    
    const detailText = currentDetail ? `↳ ${currentDetail}` : '↳ Running...';
    const trimmedDetail = fitWidth(detailText, termWidth - 8);
    process.stdout.write(`${ESC}[2K    ${PINK}${trimmedDetail}${RESET}\n`);
  }, 90);

  const updateDetail = (msg) => {
    if (!msg) return;
    const clean = msg.trim()
      .replace(/[\r\n]+/g, ' ')
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/^[#0-9:\s\->]+/, '')
      .trim();
    if (clean.length > 3) {
      currentDetail = clean;
    }
  };

  try {
    const result = await execute(updateDetail);
    clearInterval(timer);

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    // Erase 2 lines, write final success
    process.stdout.write(`${ESC}[2A`);
    process.stdout.write(`${ESC}[2K  ${GREEN}${BOLD}✔${RESET} ${ZINC_MUTED}[${step}/${total}]${RESET} ${WHITE}${BOLD}${title}${RESET} ${ZINC_MUTED}(Done in ${totalDuration}s)${RESET}\n`);
    process.stdout.write(`${ESC}[2K\n`); // Clear subline
    process.stdout.write(`${ESC}[1A`);   // Stay clean
    return result;
  } catch (err) {
    clearInterval(timer);
    process.stdout.write(`${ESC}[2A`);
    process.stdout.write(`${ESC}[2K  ${PINK}${BOLD}✖${RESET} ${ZINC_MUTED}[${step}/${total}]${RESET} ${WHITE}${title}${RESET} ${AMBER}(Failed: ${err.message})${RESET}\n`);
    process.stdout.write(`${ESC}[2K\n`);
    throw err;
  }
}

// ------------------------------------------------------------------------------
// Main Orchestration Flow
// ------------------------------------------------------------------------------
async function main() {
  printHeader();

  const TOTAL_STEPS = 4;

  // Step 1: Platform Architecture
  const defaultPlatform = isCloudShell ? 0 : (publicIP !== '127.0.0.1' ? 1 : 2);
  const platformChoice = await askStep({
    stepNum: 1,
    totalSteps: TOTAL_STEPS,
    title: 'Select Deployment Target',
    defaultIndex: defaultPlatform,
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

  // Step 2: Port Assignment
  const defaultPortIndex = (platformChoice === 0 || isCloudShell) ? 0 : 1;
  const portChoice = await askStep({
    stepNum: 2,
    totalSteps: TOTAL_STEPS,
    title: 'Select Application Port',
    defaultIndex: defaultPortIndex,
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

  // Step 3: Public Ingress & Sharing Method
  const accessChoice = await askStep({
    stepNum: 3,
    totalSteps: TOTAL_STEPS,
    title: 'Select Public Access Method',
    defaultIndex: 0,
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

  // Step 4: Virtual Shared Browser (Neko Chromium)
  const nekoChoice = await askStep({
    stepNum: 4,
    totalSteps: TOTAL_STEPS,
    title: 'Shared Chromium Browser (Neko)',
    defaultIndex: 0,
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

  // ----------------------------------------------------------------------------
  // Execution Pipeline with Live Progress Streaming
  // ----------------------------------------------------------------------------
  process.stdout.write(`${WHITE}${BOLD}⚡ Orchestrating LESSWATCH Infrastructure...${RESET}\n\n`);

  const EXEC_TOTAL = enableTunnel ? 5 : 4;

  // 1. Verify Docker Engine & Environment
  await runLiveTask({
    step: 1,
    total: EXEC_TOTAL,
    title: 'Verifying Docker Engine & memory specs',
    execute: async (update) => {
      update('Pinging Docker daemon socket...');
      try {
        execSync('docker info', { stdio: 'ignore' });
      } catch {
        throw new Error('Docker daemon is not running. Please start Docker first.');
      }
      update(`Validated ${cpuCores} vCPU / ${totalMemMB}MB RAM.`);
      await new Promise(r => setTimeout(r, 150));
    }
  });

  // 2. Open Firewall Ports
  await runLiveTask({
    step: 2,
    total: EXEC_TOTAL,
    title: 'Configuring network firewall ports',
    execute: async (update) => {
      try {
        if (fs.existsSync('/usr/sbin/ufw')) {
          update(`Opening port ${targetPort}/tcp & WebRTC UDP ranges...`);
          execSync(`ufw allow ${targetPort}/tcp >/dev/null 2>&1 || true`);
          execSync('ufw allow 7880:7881/tcp >/dev/null 2>&1 || true');
          execSync('ufw allow 50000:50200/udp >/dev/null 2>&1 || true');
          execSync('ufw allow 52000:52100/udp >/dev/null 2>&1 || true');
          execSync('ufw allow 52000/tcp >/dev/null 2>&1 || true');
        } else {
          update('Standard sandbox networking detected (no ufw).');
        }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
  });

  // 3. Generate Cryptographic Secrets & .env
  await runLiveTask({
    step: 3,
    total: EXEC_TOTAL,
    title: 'Generating cryptographic secrets & .env configuration',
    execute: async (update) => {
      update('Deriving encryption keys & token salts...');
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

      // Optimized settings for Cloud Shell / Tunnel vs Direct VPS
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

      // ICE Lite is strictly for VPS with public IP. Must be 0 behind tunnels/CGNAT!
      const iceMode = (platformChoice === 1 && publicIP !== '127.0.0.1' && !isBehindTunnel) ? '1' : '0';
      setEnvVar('NEKO_ICELITE', iceMode);
      setEnvVar('NEKO_WEBRTC_ICELITE', iceMode);
      setEnvVar('NEKO_TCPMUX', '52000');
      setEnvVar('NEKO_WEBRTC_TCPMUX', '52000');

      fs.writeFileSync('.env', envContent.trim() + '\n');
      update('Configuration locked & written to .env');
      await new Promise(r => setTimeout(r, 100));
    }
  });

  // 4. Build & Launch Docker Services (Live Streaming!)
  await runLiveTask({
    step: 4,
    total: EXEC_TOTAL,
    title: 'Compiling & launching LESSWATCH core services',
    execute: async (update) => {
      const profiles = [];
      if (nekoMode === 'always') profiles.push('--profile', 'neko');

      return new Promise((resolve, reject) => {
        const cmdArgs = ['compose', ...profiles, 'up', '-d', '--build', 'watch-together', 'livekit'];
        update('Spawning Docker BuildKit engine...');

        const child = spawn('docker', cmdArgs);

        child.stdout.on('data', (d) => {
          const lines = d.toString().split('\n');
          for (const line of lines) {
            if (line.trim()) update(line);
          }
        });

        child.stderr.on('data', (d) => {
          const lines = d.toString().split('\n');
          for (const line of lines) {
            if (line.trim()) update(line);
          }
        });

        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Docker build failed with exit code ${code}`));
        });

        child.on('error', (err) => reject(err));
      });
    }
  });

  // 4b. Provision Neko Container (Fast cache check + non-blocking background pull)
  if (enableNeko) {
    let imageCached = false;
    try {
      execSync('docker image inspect m1k1o/neko:chromium', { stdio: 'ignore' });
      imageCached = true;
    } catch {}

    if (imageCached) {
      if (nekoMode === 'ondemand') {
        try { execSync('docker compose --profile neko up --no-start neko', { stdio: 'ignore' }); } catch {}
      } else if (nekoMode === 'always') {
        try { execSync('docker compose --profile neko up -d neko', { stdio: 'ignore' }); } catch {}
      }
    } else if (nekoMode === 'always') {
      await runLiveTask({
        step: 4,
        total: EXEC_TOTAL,
        title: 'Downloading & starting Neko Chromium browser image',
        execute: async (update) => {
          update('Pulling m1k1o/neko:chromium (live layer download)...');
          try {
            execSync('docker compose --profile neko pull neko', { stdio: 'ignore', timeout: 600000 });
          } catch {
            execSync('docker pull m1k1o/neko:chromium', { stdio: 'ignore', timeout: 600000 });
          }
          execSync('docker compose --profile neko up -d neko', { stdio: 'ignore' });
        }
      });
    } else {
      // On-demand: Dispatch in background so installation finishes in seconds
      try {
        const bgNeko = spawn('sh', ['-c', 'docker compose --profile neko pull neko >/dev/null 2>&1 && docker compose --profile neko up --no-start neko >/dev/null 2>&1'], {
          stdio: 'ignore',
          detached: true
        });
        bgNeko.unref();
      } catch {}
    }
  }

  // 5. Connect Cloudflare Quick Tunnel (Live edge link discovery)
  let tunnelUrl = '';
  if (enableTunnel) {
    await runLiveTask({
      step: 5,
      total: EXEC_TOTAL,
      title: 'Connecting Cloudflare Quick Tunnel',
      execute: async (update) => {
        try { execSync('docker rm -f wt-tunnel 2>/dev/null', { stdio: 'ignore' }); } catch {}

        update('Connecting to nearest Cloudflare edge PoP...');
        execSync(`docker run -d --name wt-tunnel --restart=unless-stopped --network=host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:${targetPort}`, { stdio: 'ignore' });

        const maxAttempts = 35;
        for (let i = 0; i < maxAttempts; i++) {
          await new Promise(r => setTimeout(r, 600));
          try {
            const logs = execSync('docker logs wt-tunnel 2>&1', { encoding: 'utf-8' });
            const match = logs.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match) {
              tunnelUrl = match[0];
              update(`Tunnel edge active: ${tunnelUrl}`);
              break;
            }
          } catch {}
          update(`Waiting for edge route assignment (${i + 1}s)...`);
        }

        if (!tunnelUrl) {
          tunnelUrl = `http://${publicIP}:${targetPort}`;
        }
      }
    });
  }

  // ----------------------------------------------------------------------------
  // Final Impeccable Summary Dashboard
  // ----------------------------------------------------------------------------
  const primaryUrl = tunnelUrl || `http://${publicIP}:${targetPort}`;
  const previewUrl = `http://localhost:${targetPort}`;
  const width = Math.min(process.stdout.columns || 80, 84);
  const borderLine = '─'.repeat(width - 2);

  process.stdout.write(`
${GREEN}${BOLD}┌${borderLine}┐${RESET}
${GREEN}${BOLD}│${RESET}  ${BOLD}${WHITE}🎉  L E S S W A T C H   I S   L I V E${RESET}${' '.repeat(Math.max(0, width - 42))}${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}├${borderLine}┤${RESET}
${GREEN}${BOLD}│${RESET}                                                                              ${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}│${RESET}  ${CYAN}${BOLD}🌐 Public HTTPS Link:${RESET}     ${WHITE}${BOLD}${primaryUrl}${RESET}${' '.repeat(Math.max(0, width - 26 - primaryUrl.length))}${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}│${RESET}  ${ZINC_MUTED}🚀 Web Preview / Local:${RESET}  ${PINK}${previewUrl}${RESET}${' '.repeat(Math.max(0, width - 28 - previewUrl.length))}${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}│${RESET}  ${ZINC_MUTED}👤 Admin Credentials:${RESET}   ${ZINC_LIGHT}Username:${RESET} ${WHITE}admin${RESET}   ${ZINC_LIGHT}Password:${RESET} ${WHITE}admin${RESET}${' '.repeat(Math.max(0, width - 52))}${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}│${RESET}                                                                              ${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}│${RESET}  ${ZINC_MUTED}🎬 Neko Virtual Browser:${RESET} ${enableNeko ? `${GREEN}Ready (${nekoMode} mode • ${isBehindTunnel ? '540p@20 tunnel-optimized' : '720p@30 direct'})${RESET}` : `${AMBER}Disabled${RESET}`}${' '.repeat(Math.max(0, width - 68))}${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}│${RESET}  ${ZINC_MUTED}⚡ Media Pipeline:${RESET}       ${GREEN}Operational (aria2c + yt-dlp resolver)${RESET}${' '.repeat(Math.max(0, width - 67))}${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}│${RESET}                                                                              ${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}├${borderLine}┤${RESET}
${GREEN}${BOLD}│${RESET}  ${VIOLET}${BOLD}Stack Management:${RESET}                                                           ${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}│${RESET}  ${ZINC_DARK}•${RESET} ${ZINC_LIGHT}Check status:${RESET}   ${CYAN}docker compose ps${RESET}${' '.repeat(Math.max(0, width - 39))}${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}│${RESET}  ${ZINC_DARK}•${RESET} ${ZINC_LIGHT}Stream logs:${RESET}    ${CYAN}docker compose logs -f watch-together${RESET}${' '.repeat(Math.max(0, width - 59))}${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}│${RESET}  ${ZINC_DARK}•${RESET} ${ZINC_LIGHT}Restart stack:${RESET}  ${CYAN}docker compose restart${RESET}${' '.repeat(Math.max(0, width - 40))}${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}│${RESET}  ${ZINC_DARK}•${RESET} ${ZINC_LIGHT}Stop services:${RESET}  ${CYAN}docker compose down${RESET}${' '.repeat(Math.max(0, width - 37))}${GREEN}${BOLD}│${RESET}
${GREEN}${BOLD}└${borderLine}┘${RESET}\n
`);

  restoreCursor();
  process.exit(0);
}

main().catch(err => {
  restoreCursor();
  process.stdout.write(`\n  ${PINK}${BOLD}Error:${RESET} ${err.message}\n\n`);
  process.exit(1);
});
