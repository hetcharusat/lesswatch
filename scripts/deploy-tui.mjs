#!/usr/bin/env node
/**
 * 🍿 LESSWATCH — Production Animated TUI Launcher
 * Launches the retro animated self-host installer in live production mode (--real)
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

const child = spawn(process.execPath, [targetScript, ...args], {
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
