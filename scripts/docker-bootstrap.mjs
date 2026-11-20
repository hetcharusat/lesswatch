import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function ensureDocker(log) {
  return new Promise((resolve, reject) => {
    const script = fileURLToPath(new URL('./ensure-docker.sh', import.meta.url));
    const child = spawn('bash', [script], { stdio: ['ignore', 'pipe', 'pipe'] });
    const feed = data => String(data).split(/\r?\n|\r/).filter(Boolean).forEach(log);
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error('Docker setup failed. Check the installation log above; service deployment has not started.'));
    });
  });
}
