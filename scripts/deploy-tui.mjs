#!/usr/bin/env node
/**
 * ==============================================================================
 * 🍿 Watch Together - Universal Cloud & VM Orchestrator (v4.0 Impeccable Edition)
 * Next-Gen Animated Terminal UI, Zero-Latency Keyboard Menus & Instant Deployment
 * ==============================================================================
 */

import readline from 'readline';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

// ANSI Styling Palette
const ESC = '\x1b';
const CYAN = `${ESC}[38;2;0;240;255m`;
const PINK = `${ESC}[38;2;255;0;122m`;
const ROSE = `${ESC}[38;2;244;114;182m`;
const PURPLE = `${ESC}[38;2;168;85;247m`;
const GREEN = `${ESC}[38;2;16;185;129m`;
const AMBER = `${ESC}[38;2;245;158;11m`;
const GRAY = `${ESC}[38;2;148;163;184m`;
const DARK_GRAY = `${ESC}[38;2;71;85;105m`;
const WHITE = `${ESC}[38;2;255;255;255m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;

// Cleanup & Cursor Restore
function restoreCursor() {
  process.stdout.write(`${ESC}[?25h`);
}
process.on('exit', restoreCursor);
process.on('SIGINT', () => {
  restoreCursor();
  process.stdout.write(`\n\n  ${AMBER}Installation interrupted by user.${RESET}\n\n`);
  process.exit(130);
});
process.on('SIGTERM', () => {
  restoreCursor();
  process.exit(143);
});

// Hide cursor during interactive setup
process.stdout.write(`${ESC}[?25l`);

// ------------------------------------------------------------------------------
// Background Pre-Pulling for Instant Deployment
// ------------------------------------------------------------------------------
// Pre-pull cloudflared in the background so by the time user finishes menus, it's ready!
let bgPullProcess = null;
try {
  bgPullProcess = spawn('docker', ['pull', 'cloudflare/cloudflared:latest'], {
    stdio: 'ignore',
    detached: true
  });
  bgPullProcess.unref();
} catch {}

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
  ? 'Google Cloud Shell (Ephemeral Web Sandbox)'
  : (publicIP !== '127.0.0.1' ? `Dedicated Linux Cloud VM (${publicIP})` : 'Local Host / Docker');

// ------------------------------------------------------------------------------
// Animated ASCII Banner
// ------------------------------------------------------------------------------
console.clear();
const BANNER = `
${PINK} ██╗    ██╗ █████╗ ████████╗ ██████╗██╗  ██╗   ████████╗ ██████╗ ${RESET}
${PINK} ██║    ██║██╔══██╗╚══██╔══╝██╔════╝██║  ██║   ╚══██╔══╝██╔════╝ ${RESET}
${ROSE} ██║ █╗ ██║███████║   ██║   ██║     ███████║█████╗██║   ██║  ███╗${RESET}
${ROSE} ██║███╗██║██╔══██║   ██║   ██║     ██╔══██║╚════╝██║   ██║   ██║${RESET}
${CYAN} ╚███╔███╔╝██║  ██║   ██║   ╚██████╗██║  ██║      ██║   ╚██████╔╝${RESET}
${CYAN}  ╚══╝╚══╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝      ╚═╝    ╚═════╝ ${RESET}
    ${WHITE}${BOLD}🍿 Universal Cloud & VM Orchestrator${RESET} ${GRAY}|${RESET} ${ROSE}Impeccable Edition v4.0${RESET}
    ${DARK_GRAY}Sub-second synced rooms • Shared Chromium • Native Torrent/URL Downloader${RESET}
`;
process.stdout.write(BANNER);

process.stdout.write(`
${DARK_GRAY}┌─────────────────────────────────────────────────────────────────────────────┐${RESET}
${DARK_GRAY}│${RESET}  ${CYAN}${BOLD}Environment Check:${RESET} ${WHITE}${envTitle}${RESET}
${DARK_GRAY}│${RESET}  ${GRAY}System Specs:${RESET} ${GREEN}${cpuCores} vCPU${RESET} ${DARK_GRAY}•${RESET} ${GREEN}${totalMemMB} MB RAM${RESET} ${DARK_GRAY}•${RESET} User: ${ROSE}${process.env.USER || 'root'}${RESET}
${DARK_GRAY}└─────────────────────────────────────────────────────────────────────────────┘${RESET}\n
`);

// ------------------------------------------------------------------------------
// Interactive Arrow-Key Menu Component
// ------------------------------------------------------------------------------
async function askMenu({ title, options, defaultIndex = 0 }) {
  return new Promise((resolve) => {
    let selected = defaultIndex;
    const count = options.length;

    // Calculate lines per option
    const renderOptionLines = (idx) => {
      const opt = options[idx];
      const isSelected = idx === selected;
      let text = '';
      if (isSelected) {
        text += `  ${PINK}${BOLD}❯ [●] ${CYAN}${opt.title}${RESET}\n`;
        if (opt.desc) {
          text += `      ${ROSE}${opt.desc}${RESET}\n`;
        }
      } else {
        text += `    ${DARK_GRAY}[○] ${GRAY}${opt.title}${RESET}\n`;
        if (opt.desc) {
          text += `      ${DARK_GRAY}${opt.desc}${RESET}\n`;
        }
      }
      return text;
    };

    let totalMenuLines = 0;
    options.forEach(opt => {
      totalMenuLines += opt.desc ? 2 : 1;
    });

    process.stdout.write(`${PURPLE}${BOLD}❯ ${title}${RESET}\n`);
    process.stdout.write(`${DARK_GRAY}  Use ↑/↓ arrow keys (or j/k) to navigate, press [Enter] to choose:${RESET}\n`);

    // Initial render
    options.forEach((_, idx) => {
      process.stdout.write(renderOptionLines(idx));
    });

    const redraw = () => {
      // Move cursor up to beginning of options block
      process.stdout.write(`${ESC}[${totalMenuLines}A`);
      options.forEach((_, idx) => {
        // Clear line and rewrite
        const opt = options[idx];
        const isSelected = idx === selected;
        process.stdout.write(`${ESC}[2K`);
        if (isSelected) {
          process.stdout.write(`  ${PINK}${BOLD}❯ [●] ${CYAN}${opt.title}${RESET}\n`);
        } else {
          process.stdout.write(`    ${DARK_GRAY}[○] ${GRAY}${opt.title}${RESET}\n`);
        }
        if (opt.desc) {
          process.stdout.write(`${ESC}[2K`);
          if (isSelected) {
            process.stdout.write(`      ${ROSE}${opt.desc}${RESET}\n`);
          } else {
            process.stdout.write(`      ${DARK_GRAY}${opt.desc}${RESET}\n`);
          }
        }
      });
    };

    // Setup raw mode keyboard input
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const onKeypress = (str, key) => {
      if (!key) return;

      if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
        cleanup();
        process.exit(130);
      }

      if (key.name === 'up' || str === 'k' || str === 'K') {
        selected = (selected - 1 + count) % count;
        redraw();
      } else if (key.name === 'down' || str === 'j' || str === 'J') {
        selected = (selected + 1) % count;
        redraw();
      } else if (key.name === 'return' || key.name === 'enter' || str === ' ') {
        cleanup();
        process.stdout.write(`  ${GREEN}${BOLD}✔ Confirmed:${RESET} ${WHITE}${options[selected].title}${RESET}\n\n`);
        resolve(selected);
      } else if (str >= '1' && str <= String(count)) {
        selected = parseInt(str, 10) - 1;
        cleanup();
        process.stdout.write(`  ${GREEN}${BOLD}✔ Confirmed:${RESET} ${WHITE}${options[selected].title}${RESET}\n\n`);
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
// Animated Task Runner with Live Spinners & Timing
// ------------------------------------------------------------------------------
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function runTask(msg, fn) {
  let frame = 0;
  const startTime = Date.now();
  const interval = setInterval(() => {
    const symbol = `${CYAN}${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]}${RESET}`;
    process.stdout.write(`\r  ${symbol} ${msg} ${DARK_GRAY}(${Math.round((Date.now() - startTime) / 1000)}s)${RESET}${ESC}[K`);
    frame++;
  }, 80);

  try {
    const result = await fn();
    clearInterval(interval);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r  ${GREEN}${BOLD}✔${RESET} ${msg} ${DARK_GRAY}(Done in ${duration}s)${RESET}${ESC}[K\n`);
    return result;
  } catch (err) {
    clearInterval(interval);
    process.stdout.write(`\r  ${PINK}${BOLD}✖${RESET} ${msg} ${AMBER}(Failed: ${err.message})${RESET}${ESC}[K\n`);
    throw err;
  }
}

// ------------------------------------------------------------------------------
// Main Orchestrator Flow
// ------------------------------------------------------------------------------
async function main() {
  // Step 1: Deployment Strategy
  const defaultPlatformIndex = isCloudShell ? 1 : 0;
  const platformChoice = await askMenu({
    title: 'Select Deployment Strategy',
    defaultIndex: defaultPlatformIndex,
    options: [
      {
        title: '🚀 Dedicated Linux Cloud VM (Ubuntu VPS / OCI / AWS / DigitalOcean)',
        desc: 'PRIMARY RECOMMENDED: 24/7 background hosting, permanent storage, auto-start on boot, direct high-speed UDP.'
      },
      {
        title: '⚡ Google Cloud Shell / Web Sandbox',
        desc: 'ALTERNATIVE METHOD: Fast temporary test sandbox. Auto-configures Web Preview on port 8080.'
      },
      {
        title: '💻 Local Machine / Docker Desktop',
        desc: 'Self-hosted local workspace instance.'
      }
    ]
  });

  // Step 2: Public Port
  const portOptions = (platformChoice === 1 || isCloudShell)
    ? [
        { title: 'Port 8080 (Cloud Shell Web Preview standard)', desc: 'Recommended: Google Cloud Shell Web Preview connects in 1 click without port changes.' },
        { title: 'Port 3000 (Default Watch Together port)', desc: 'Standard internal application port.' },
        { title: 'Port 80 (Standard Web HTTP)', desc: 'Binds directly to port 80 (requires root).' }
      ]
    : [
        { title: 'Port 3000 (Standard Recommended for VPS)', desc: 'Default port. Ideal for VPS direct IP access or reverse proxies.' },
        { title: 'Port 8080 (Alternative Web Port)', desc: 'Secondary web port.' },
        { title: 'Port 80 (Standard Web HTTP)', desc: 'Binds directly to standard HTTP port 80.' }
      ];

  const portChoice = await askMenu({
    title: 'Select Public HTTP Port',
    defaultIndex: 0,
    options: portOptions
  });

  let targetPort = 3000;
  if (portChoice === 0) {
    targetPort = (platformChoice === 1 || isCloudShell) ? 8080 : 3000;
  } else if (portChoice === 1) {
    targetPort = (platformChoice === 1 || isCloudShell) ? 3000 : 8080;
  } else if (portChoice === 2) {
    targetPort = 80;
  }

  // Step 3: Access & Sharing Method
  const accessChoice = await askMenu({
    title: 'Public Access & Sharing Method',
    defaultIndex: 0,
    options: [
      {
        title: '🌐 Instant Cloudflare Quick Tunnel (Recommended)',
        desc: 'Generates a 100% free, secure HTTPS link. Shareable with friends anywhere with ZERO port forwarding!'
      },
      {
        title: '📡 Direct Public IP & Port',
        desc: `Direct connection via http://${publicIP}:${targetPort} (no external tunnel).`
      }
    ]
  });
  const enableTunnel = accessChoice === 0;
  const isBehindTunnel = enableTunnel || isCloudShell;

  // Step 4: Virtual Browser (Neko Chromium)
  const nekoChoice = await askMenu({
    title: 'Virtual Shared Browser (Neko Chromium)',
    defaultIndex: 0,
    options: [
      {
        title: '🎮 On-Demand Mode (Recommended)',
        desc: 'Container sleeps when idle. Automatically boots when a room launches Neko. Saves ~600MB RAM.'
      },
      {
        title: '🚀 Always-On Mode',
        desc: 'Instantly warm and ready at all times (~600MB permanent RAM usage).'
      },
      {
        title: '🚫 Disabled',
        desc: 'Disable Neko module. Best for ultra-low memory (<1GB RAM) VPS instances.'
      }
    ]
  });
  const enableNeko = nekoChoice !== 2;
  const nekoMode = nekoChoice === 1 ? 'always' : nekoChoice === 0 ? 'ondemand' : 'disabled';

  // Step 5: Torrent Downloader Engine
  const dlChoice = await askMenu({
    title: 'Server Torrent & Media Downloader (aria2c + yt-dlp)',
    defaultIndex: 0,
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
  const enableDownloader = dlChoice === 0;

  // ----------------------------------------------------------------------------
  // Execution Pipeline
  // ----------------------------------------------------------------------------
  process.stdout.write(`\n${CYAN}${BOLD}⚡ Orchestrating System Infrastructure...${RESET}\n`);

  // 1. Verify Prerequisites
  await runTask('Verifying Docker Engine & memory capacity', async () => {
    try {
      execSync('docker info', { stdio: 'ignore' });
    } catch {
      throw new Error('Docker daemon is not running. Please start Docker first.');
    }
  });

  // 2. Open Firewall Ports (if ufw exists)
  await runTask('Configuring system firewall ports', async () => {
    try {
      if (fs.existsSync('/usr/sbin/ufw')) {
        execSync(`ufw allow ${targetPort}/tcp >/dev/null 2>&1 || true`);
        execSync('ufw allow 7880:7881/tcp >/dev/null 2>&1 || true');
        execSync('ufw allow 50000:50200/udp >/dev/null 2>&1 || true');
        execSync('ufw allow 52000:52100/udp >/dev/null 2>&1 || true');
      }
    } catch {}
  });

  // 3. Generate Secrets & .env
  await runTask('Generating cryptographic secrets & .env parameters', async () => {
    const livekitSecret = crypto.randomBytes(24).toString('hex');
    const vaultSecret = crypto.randomBytes(32).toString('hex');

    // Create required directories
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
    // Cloud Shell / Tunnel deployments: lower resolution & bitrate to reduce CPU + TURN bandwidth
    if (isBehindTunnel) {
      setEnvVar('NEKO_SCREEN', '960x540@20');
      setEnvVar('NEKO_DESKTOP_SCREEN', '960x540@20');
      setEnvVar('NEKO_VIDEO_BITRATE', '1500');
      setEnvVar('NEKO_MAX_FPS', '20');
    } else {
      setEnvVar('NEKO_SCREEN', '1280x720@30');
      setEnvVar('NEKO_DESKTOP_SCREEN', '1280x720@30');
      setEnvVar('NEKO_VIDEO_BITRATE', '3072');
      setEnvVar('NEKO_MAX_FPS', '30');
    }

    // Platform-adaptive ICE: ICE Lite only on VPS with public IP (NOT behind tunnel/CGNAT)
    // ICE Lite MUST be false for TURN relay to work behind Cloudflare tunnels
    const iceMode = (platformChoice === 0 && publicIP !== '127.0.0.1' && !isBehindTunnel) ? '1' : '0';
    setEnvVar('NEKO_ICELITE', iceMode);
    setEnvVar('NEKO_WEBRTC_ICELITE', iceMode);

    fs.writeFileSync('.env', envContent.trim() + '\n');
  });

  // 4. Build & Launch Docker Services (Fast single-stage build)
  await runTask('Compiling & launching Watch Together services', async () => {
    // If always-on Neko was selected, include neko profile
    const profiles = [];
    if (nekoMode === 'always') profiles.push('--profile', 'neko');

    const args = ['compose', ...profiles, 'up', '-d', '--build', 'watch-together', 'livekit'];
    execSync(`docker ${args.join(' ')}`, { stdio: 'ignore' });
  });

  // 4b. Provision Neko container (fast cache check + background pre-warm for on-demand)
  if (enableNeko) {
    let imageCached = false;
    try {
      execSync('docker image inspect m1k1o/neko:chromium', { stdio: 'ignore' });
      imageCached = true;
    } catch {}

    if (imageCached) {
      await runTask('Provisioning Neko Chromium browser container', async () => {
        if (nekoMode === 'ondemand') {
          execSync('docker compose --profile neko up --no-start neko', { stdio: 'ignore' });
        } else if (nekoMode === 'always') {
          execSync('docker compose --profile neko up -d neko', { stdio: 'ignore' });
        }
      });
    } else if (nekoMode === 'always') {
      await runTask('Downloading & launching Neko Chromium browser image', async () => {
        try {
          execSync('docker compose --profile neko pull neko', { stdio: 'ignore', timeout: 600000 });
        } catch {
          execSync('docker pull m1k1o/neko:chromium', { stdio: 'ignore', timeout: 600000 });
        }
        execSync('docker compose --profile neko up -d neko', { stdio: 'ignore' });
      });
    } else {
      // On-demand mode: Dispatch in background so deployment finishes in seconds!
      try {
        const bgNeko = spawn('sh', ['-c', 'docker compose --profile neko pull neko >/dev/null 2>&1 && docker compose --profile neko up --no-start neko >/dev/null 2>&1'], {
          stdio: 'ignore',
          detached: true
        });
        bgNeko.unref();
      } catch {}
      process.stdout.write(`  ${GREEN}✔${RESET} Neko Chromium browser image pre-warming dispatched in background (${PURPLE}non-blocking${RESET})\n`);
    }
  }

  // 5. Cloudflare Quick Tunnel (Instant launch via pre-pulled image)
  let tunnelUrl = '';
  if (enableTunnel) {
    await runTask('Connecting Cloudflare Quick Tunnel', async () => {
      // Remove old tunnel container if running
      try { execSync('docker rm -f wt-tunnel 2>/dev/null', { stdio: 'ignore' }); } catch {}

      // Launch container
      execSync(`docker run -d --name wt-tunnel --restart=unless-stopped --network=host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:${targetPort}`, { stdio: 'ignore' });

      // Poll container logs for the trycloudflare.com URL (typically ready in 1-2 seconds)
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 600));
        try {
          const logs = execSync('docker logs wt-tunnel 2>&1', { encoding: 'utf-8' });
          const match = logs.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
          if (match) {
            tunnelUrl = match[0];
            break;
          }
        } catch {}
      }

      if (!tunnelUrl) {
        tunnelUrl = `http://${publicIP}:${targetPort}`;
      }
    });
  }

  // ----------------------------------------------------------------------------
  // Final Completion Dashboard
  // ----------------------------------------------------------------------------
  const primaryUrl = tunnelUrl || `http://${publicIP}:${targetPort}`;
  const previewUrl = `http://localhost:${targetPort}`;

  process.stdout.write(`
${GREEN}${BOLD}===============================================================================${RESET}
  ${WHITE}${BOLD}🎉 WATCH TOGETHER IS READY & STREAMING LIVE!${RESET}
${GREEN}${BOLD}===============================================================================${RESET}

  ${CYAN}${BOLD}🌐 Public HTTPS Link:${RESET}     ${WHITE}${BOLD}${primaryUrl}${RESET}
  ${GRAY}🚀 Web Preview / Local:${RESET}  ${ROSE}${previewUrl}${RESET}
  ${GRAY}👤 Admin Credentials:${RESET}   ${GRAY}Username:${RESET} ${WHITE}admin${RESET}  ${GRAY}Password:${RESET} ${WHITE}admin${RESET}
  ${GRAY}🎬 Neko Virtual Browser:${RESET} ${enableNeko ? `${GREEN}Ready (${nekoMode} mode, ${isBehindTunnel ? '540p@20 tunnel-optimized' : '720p@30 smooth'})${RESET}` : `${AMBER}Disabled${RESET}`}
  ${GRAY}⚡ Torrent Downloader:${RESET}   ${enableDownloader ? `${GREEN}Operational (aria2c + yt-dlp)${RESET}` : `${AMBER}Disabled${RESET}`}

${DARK_GRAY}─────────────────────────────────────────────────────────────────────────────${RESET}
  ${PURPLE}${BOLD}Helpful Management Commands:${RESET}
  ${DARK_GRAY}•${RESET} View status:      ${CYAN}docker compose ps${RESET}
  ${DARK_GRAY}•${RESET} Stream live logs: ${CYAN}docker compose logs -f watch-together${RESET}
  ${DARK_GRAY}•${RESET} Restart stack:    ${CYAN}docker compose restart${RESET}
  ${DARK_GRAY}•${RESET} Stop all:         ${CYAN}docker compose down${RESET}
${GREEN}${BOLD}===============================================================================${RESET}\n
`);

  restoreCursor();
  process.exit(0);
}

main().catch(err => {
  restoreCursor();
  process.stdout.write(`\n  ${PINK}${BOLD}Error:${RESET} ${err.message}\n\n`);
  process.exit(1);
});

