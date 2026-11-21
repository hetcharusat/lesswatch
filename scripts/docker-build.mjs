import { spawn } from 'node:child_process';

// Progress advances only when a phase completes. Registry downloads and long
// Dockerfile steps must not masquerade as a nearly finished installation.
export async function buildAndStartServices({ services, build, pullApp = false, log, stage, onProcess = () => {}, spawnProcess = spawn,
  idleTimeoutMs = 300000, commandTimeoutMs = 1800000, heartbeatMs = 15000,
  healthTimeoutMs = 90000, healthRetryMs = 2000 }) {
  const run = (args, { quiet = false, timeout = commandTimeoutMs } = {}) => new Promise((resolve, reject) => {
    if (!quiet) log(`$ docker ${args.join(' ')}`);
    const child = spawnProcess('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BUILDKIT_PROGRESS: 'plain', COMPOSE_PROGRESS: 'plain', COMPOSE_ANSI: 'never' } });
    onProcess(child);
    let settled = false, idleTimer, heartbeat, totalTimer, lastOutput = Date.now();
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer); clearTimeout(totalTimer); clearInterval(heartbeat);
      onProcess(null);
      if (error) reject(error); else resolve();
    };
    const fail = message => { finish(new Error(message)); child.kill('SIGTERM'); };
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => fail(`Docker produced no output for ${Math.round(idleTimeoutMs / 1000)} seconds during ${args[0] === 'exec' ? 'health check' : args.join(' ')}. Check install.log and retry; the phase was not marked complete.`), idleTimeoutMs);
    };
    const feed = data => {
      if (settled) return;
      lastOutput = Date.now(); resetIdle();
      if (!quiet) for (const line of String(data).split(/\r?\n|\r/).filter(Boolean)) log(line);
    };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    child.once('error', finish);
    child.once('close', (code, signal) => finish(code === 0 ? null : new Error(`docker ${args.slice(0, 3).join(' ')} failed (${signal || code}). See install.log for the Docker error.`)));
    totalTimer = setTimeout(() => fail(`Docker exceeded the ${Math.round(timeout / 60000)} minute command limit. See install.log and retry.`), timeout);
    resetIdle();
    if (!quiet) heartbeat = setInterval(() => {
      const silence = Math.floor((Date.now() - lastOutput) / 1000);
      if (silence >= 30) log(`Waiting for Docker output (${silence}s). This phase has not finished. Press L for full logs.`);
    }, heartbeatMs);
  });

  stage.progress = 5;
  if (build && pullApp) throw new Error('Choose either a prebuilt app image or a source build.');
  const images = services.filter(service => pullApp || service !== 'watch-together');
  if (images.length) {
    log(`Downloading service images: ${images.join(', ')}. First downloads depend on registry/network speed.`);
    await run(['compose', '--progress', 'plain', 'pull', ...images]);
  }
  stage.progress = 25;
  if (build) {
    log('Building LESSWATCH. Package installation and layer export can take several minutes.');
    await run(['compose', '--progress', 'plain', 'build', 'watch-together']);
  }
  stage.progress = 75;
  await run(['compose', '--progress', 'plain', 'up', '-d', '--no-build', '--no-deps', ...services]);
  stage.progress = 90;
  log('Checking the application health endpoint inside the started container...');
  const deadline = Date.now() + healthTimeoutMs;
  let lastError;
  do {
    try {
      await run(['exec', 'watch-together', 'curl', '-fsS', '--max-time', '5', 'http://127.0.0.1:3000/api/health'], { quiet: true, timeout: Math.min(10000, healthTimeoutMs) });
      stage.progress = 100;
      log(`LESSWATCH is healthy. Started services: ${services.join(', ')}.`);
      return;
    } catch (error) { lastError = error; }
    if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, healthRetryMs));
  } while (Date.now() < deadline);
  throw new Error(`The container started but LESSWATCH did not pass its health check. Run docker compose logs --tail=80 watch-together. ${lastError?.message || ''}`);
}
