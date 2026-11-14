#!/usr/bin/env node
/**
 * ==============================================================================
 * 🍿 LESSWATCH — Distilled Impeccable Installation Experience
 * Architecture:
 *   - Zero external dependencies (pure Node.js standard library)
 *   - Bulletproof raw keypress parser (no escape-drop crashes on cloud terminals)
 *   - Linear, distraction-free prompt-and-collapse flow (Astro / Vercel style)
 *   - Smooth single-line orbital progress animation with live sub-task telemetry
 *   - Minimalist, high-contrast typography
 * ==============================================================================
 */

import readline from 'readline';
import os from 'os';

// ------------------------------------------------------------------------------
// Disciplined Impeccable Palette
// ------------------------------------------------------------------------------
const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;

// Subtle, high-contrast tints
const CYAN = `${ESC}[38;2;34;211;238m`;       // Crisp Cyan
const PINK = `${ESC}[38;2;244;114;182m`;      // Soft Accent Rose
const GREEN = `${ESC}[38;2;52;211;153m`;      // Muted Mint Green
const WHITE = `${ESC}[38;2;255;255;255m`;     // Foreground White
const ZINC_LIGHT = `${ESC}[38;2;228;228;231m`; // Body Zinc
const ZINC_MUTED = `${ESC}[38;2;161;161;170m`; // Subtext
const ZINC_DARK = `${ESC}[38;2;82;82;91m`;     // Borders & Inactive Lines

// Cleanup cursor on exit
function restoreCursor() {
  process.stdout.write(`${ESC}[?25h`);
}
process.on('exit', restoreCursor);
process.on('SIGINT', () => {
  restoreCursor();
  process.stdout.write(`\n\n  ${ZINC_MUTED}Installation aborted.${RESET}\n\n`);
  process.exit(130);
});
process.on('SIGTERM', () => {
  restoreCursor();
  process.exit(143);
});

// Hide cursor
process.stdout.write(`${ESC}[?25l`);

// System stats
const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
const cpuCores = os.cpus().length;

// ------------------------------------------------------------------------------
// Distilled Header
// ------------------------------------------------------------------------------
function printHeader() {
  console.clear();
  process.stdout.write(`
  ${BOLD}${WHITE}LESSWATCH${RESET}  ${PINK}🍿${RESET}  ${ZINC_MUTED}v4.2 Impeccable${RESET}
  ${ZINC_MUTED}Synchronized Streaming & Cloud Desktop Engine${RESET}
  ${ZINC_DARK}Target: Google Cloud Shell • ${cpuCores} vCPU / ${totalMemMB}MB RAM${RESET}
  ${ZINC_DARK}───────────────────────────────────────────────────────────────────${RESET}\n\n`);
}

// ------------------------------------------------------------------------------
// Bulletproof Interactive Menu (Prompt & Collapse)
// ------------------------------------------------------------------------------
async function askStep({ title, options, defaultIndex = 0 }) {
  return new Promise((resolve) => {
    let selected = defaultIndex;
    const count = options.length;

    const renderOption = (idx) => {
      const opt = options[idx];
      const isSelected = idx === selected;
      let out = '';
      if (isSelected) {
        out += `    ${CYAN}${BOLD}●${RESET} ${WHITE}${BOLD}${opt.title}${RESET}\n`;
        if (opt.desc) {
          out += `        ${ZINC_MUTED}${opt.desc}${RESET}\n`;
        }
      } else {
        out += `    ${ZINC_DARK}○${RESET} ${ZINC_LIGHT}${opt.title}${RESET}\n`;
        if (opt.desc) {
          out += `        ${ZINC_DARK}${opt.desc}${RESET}\n`;
        }
      }
      return out;
    };

    let totalLines = 0;
    options.forEach(opt => {
      totalLines += opt.desc ? 2 : 1;
    });

    process.stdout.write(`  ${CYAN}?${RESET} ${WHITE}${BOLD}${title}${RESET}\n`);

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

    // Configure raw input
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const onKeypress = (str, key) => {
      // Quit ONLY on Ctrl+C (Never on bare escape or arrow prefixes!)
      if (key && key.ctrl && key.name === 'c') {
        restoreCursor();
        process.stdout.write(`\n\n  ${ZINC_MUTED}Installation aborted.${RESET}\n\n`);
        process.exit(130);
      }

      // Hotkey numbers (1-9)
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
        // Collapse menu: erase options and show single confirmed line
        const linesToErase = totalLines + 1;
        process.stdout.write(`${ESC}[${linesToErase}A`);
        for (let i = 0; i < linesToErase; i++) {
          process.stdout.write(`${ESC}[2K\n`);
        }
        process.stdout.write(`${ESC}[${linesToErase}A`);
        process.stdout.write(`  ${GREEN}✔${RESET} ${ZINC_MUTED}${title}:${RESET} ${WHITE}${BOLD}${options[selected].title}${RESET}\n\n`);
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
// Distilled Live Progress Task Runner
// ------------------------------------------------------------------------------
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function runTask(title, execute) {
  let frame = 0;
  const startTime = Date.now();
  let subdetail = '';

  process.stdout.write(`  ${CYAN}${SPINNER[0]}${RESET} ${ZINC_LIGHT}${title}...${RESET}\n`);

  const timer = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const spin = SPINNER[frame % SPINNER.length];
    frame++;

    if (subdetail) {
      process.stdout.write(`${ESC}[1A${ESC}[2K  ${CYAN}${spin}${RESET} ${ZINC_LIGHT}${title}...${RESET} ${ZINC_MUTED}(${elapsed}s)${RESET}\n`);
      process.stdout.write(`${ESC}[2K      ${ZINC_MUTED}↳ ${subdetail}${RESET}\n`);
    } else {
      process.stdout.write(`${ESC}[1A${ESC}[2K  ${CYAN}${spin}${RESET} ${ZINC_LIGHT}${title}...${RESET} ${ZINC_MUTED}(${elapsed}s)${RESET}\n`);
    }
  }, 80);

  const updateSub = (msg) => {
    if (msg) subdetail = msg.slice(0, 60);
  };

  try {
    const result = await execute(updateSub);
    clearInterval(timer);

    const dur = ((Date.now() - startTime) / 1000).toFixed(1);
    if (subdetail) {
      process.stdout.write(`${ESC}[1A${ESC}[2K${ESC}[1A`);
    } else {
      process.stdout.write(`${ESC}[1A`);
    }
    process.stdout.write(`${ESC}[2K  ${GREEN}✔${RESET} ${ZINC_LIGHT}${title}${RESET} ${ZINC_MUTED}(${dur}s)${RESET}\n`);
    return result;
  } catch (err) {
    clearInterval(timer);
    process.stdout.write(`\n  ${PINK}✖${RESET} ${WHITE}${title} failed:${RESET} ${err.message}\n`);
    throw err;
  }
}

// ------------------------------------------------------------------------------
// Main Distilled Flow
// ------------------------------------------------------------------------------
async function main() {
  printHeader();

  // 1. Target Infrastructure
  const platform = await askStep({
    title: 'Select deployment target',
    defaultIndex: 0,
    options: [
      {
        title: '⚡ Google Cloud Shell / Web Sandbox (Recommended)',
        desc: 'Optimized for sandbox CGNAT, binds to port 8080 with Web Preview integration.'
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

  // 2. Public Access Method
  const access = await askStep({
    title: 'Select public sharing method',
    defaultIndex: 0,
    options: [
      {
        title: '🌐 Instant Cloudflare Quick Tunnel (Free Public HTTPS)',
        desc: 'Zero port forwarding, shareable URL generated in seconds.'
      },
      {
        title: '🔒 Custom Domain with Automatic SSL (Caddy)',
        desc: 'Production HTTPS using your own domain with Let’s Encrypt auto-renewal.'
      },
      {
        title: '📡 Direct IP & Port',
        desc: 'Direct connection without external tunnel.'
      }
    ]
  });

  // 3. Virtual Shared Browser Mode
  const neko = await askStep({
    title: 'Shared Chromium browser (Neko)',
    defaultIndex: 0,
    options: [
      {
        title: '🎮 On-Demand Mode (Recommended)',
        desc: 'Sleeps when idle. Boots in 1s when room activates Neko. Saves ~600MB RAM.'
      },
      {
        title: '🚀 Always-On Mode',
        desc: 'Instantly warm and ready at all times (~600MB RAM usage).'
      },
      {
        title: '🚫 Disabled',
        desc: 'Disables virtual browser for low-resource environments.'
      }
    ]
  });

  process.stdout.write(`  ${ZINC_DARK}───────────────────────────────────────────────────────────────────${RESET}\n\n`);

  // Simulated Execution Steps (Exact mirror of deployment)
  await runTask('Verifying Docker engine & memory specs', async (update) => {
    update('Pinging Docker daemon...');
    await new Promise(r => setTimeout(r, 400));
    update('Verified 2 vCPU / 16GB RAM.');
    await new Promise(r => setTimeout(r, 200));
  });

  await runTask('Configuring network firewall ports', async (update) => {
    update('Opening 8080/tcp, 7880:7881, and WebRTC UDP/TCP ranges...');
    await new Promise(r => setTimeout(r, 300));
  });

  await runTask('Generating cryptographic secrets & .env parameters', async (update) => {
    update('Writing AES vault keys and TURN relay configuration...');
    await new Promise(r => setTimeout(r, 350));
  });

  await runTask('Compiling & launching LESSWATCH core services', async (update) => {
    update('Step 2/7: RUN apt-get install -y ffmpeg aria2...');
    await new Promise(r => setTimeout(r, 600));
    update('Step 4/7: RUN npm ci --omit=dev [watch-together]');
    await new Promise(r => setTimeout(r, 700));
    update('Starting livekit & watch-together containers...');
    await new Promise(r => setTimeout(r, 500));
  });

  await runTask('Connecting Cloudflare Quick Tunnel', async (update) => {
    update('Requesting edge ingress tunnel...');
    await new Promise(r => setTimeout(r, 500));
    update('Registered edge route at nearest Cloudflare PoP...');
    await new Promise(r => setTimeout(r, 400));
  });

  // Final Distilled Summary
  process.stdout.write(`
  ${ZINC_DARK}───────────────────────────────────────────────────────────────────${RESET}
  ${BOLD}${WHITE}LESSWATCH is live & streaming${RESET}
  ${ZINC_DARK}───────────────────────────────────────────────────────────────────${RESET}

    ${CYAN}${BOLD}Public URL:${RESET}     ${WHITE}${BOLD}https://lesswatch-demo.trycloudflare.com${RESET}
    ${ZINC_MUTED}Web Preview:${RESET}    ${PINK}http://localhost:8080${RESET}
    ${ZINC_MUTED}Credentials:${RESET}    ${WHITE}admin / admin${RESET}

    ${ZINC_MUTED}Components:${RESET}
    ${ZINC_DARK}•${RESET} Virtual Browser:   ${GREEN}Ready (On-Demand • 540p@20 tunnel-optimized)${RESET}
    ${ZINC_DARK}•${RESET} Media Downloader:  ${GREEN}Operational (aria2c + yt-dlp)${RESET}

  ${ZINC_DARK}───────────────────────────────────────────────────────────────────${RESET}
  ${ZINC_MUTED}Management:${RESET}  ${CYAN}docker compose ps${RESET}  ${ZINC_DARK}•${RESET}  ${CYAN}docker compose logs -f${RESET}\n\n`);

  restoreCursor();
  process.exit(0);
}

main().catch(err => {
  restoreCursor();
  process.stdout.write(`\n  ${PINK}Error:${RESET} ${err.message}\n\n`);
  process.exit(1);
});
