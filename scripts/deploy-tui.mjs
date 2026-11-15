#!/usr/bin/env node
/**
 * LESSWATCH — Production Animated TUI Launcher
 * Launched by deploy.sh when Node.js is available.
 * Passes --real flag so the full Docker pipeline runs.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetScript = path.join(__dirname, 'lesswatch-install-v2.mjs');

const args = process.argv.slice(2);
if (!args.includes('--real')) {
  args.push('--real');
}

// Ensure UTF-8 locale so Cloud Shell tmux sessions don't garble box-drawing chars
const env = {
  ...process.env,
  LANG: process.env.LANG || 'en_US.UTF-8',
  LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
  TERM: process.env.TERM || 'xterm-256color',
};

const child = spawn(process.execPath, [targetScript, ...args], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
