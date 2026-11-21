const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const modulePromise = import('../scripts/docker-build.mjs');

function fakeDocker(results = []) {
  const calls = [], children = [];
  const spawnProcess = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = signal => { child.killed = true; setImmediate(() => child.emit('close', null, signal)); };
    children.push(child);
    const result = results.shift() ?? 0;
    if (result !== 'hang') setImmediate(() => { child.stdout.emit('data', Buffer.from('Docker output\n')); child.emit('close', result); });
    return child;
  };
  return { calls, children, spawnProcess };
}

test('build phases finish in order and success requires the new application health check', async () => {
  const { buildAndStartServices } = await modulePromise;
  const docker = fakeDocker(), stage = { progress: 0 }, logs = [], processes = [];
  await buildAndStartServices({ services: ['watch-together', 'livekit'], build: true, stage, log: line => logs.push(line), onProcess: p => processes.push(p), ...docker });
  assert.deepEqual(docker.calls.map(call => call.args.slice(0, 4)), [
    ['compose', '--progress', 'plain', 'pull'], ['compose', '--progress', 'plain', 'build'],
    ['compose', '--progress', 'plain', 'up'], ['exec', 'watch-together', 'curl', '-fsS']
  ]);
  assert.ok(docker.calls[2].args.includes('--no-deps'));
  assert.equal(stage.progress, 100);
  assert.match(logs.at(-1), /healthy/);
  assert.equal(processes.at(-1), null);
});
test('a failed registry pull stops before building or starting old containers', async () => {
  const { buildAndStartServices } = await modulePromise;
  const docker = fakeDocker([1]), stage = { progress: 0 };
  await assert.rejects(buildAndStartServices({ services: ['watch-together', 'livekit'], build: true, stage, log() {}, ...docker }), /failed/);
  assert.equal(docker.calls.length, 1);
  assert.equal(stage.progress, 5);
});
test('cached app with LiveKit disabled skips pulls/build and does not start dependencies', async () => {
  const { buildAndStartServices } = await modulePromise;
  const docker = fakeDocker();
  await buildAndStartServices({ services: ['watch-together'], build: false, stage: {}, log() {}, ...docker });
  assert.equal(docker.calls.length, 2);
  assert.ok(docker.calls[0].args.includes('--no-deps'));
  assert.ok(!docker.calls[0].args.includes('livekit'));
});
test('quiet hung download does not invent progress and is terminated at the idle deadline', async () => {
  const { buildAndStartServices } = await modulePromise;
  const docker = fakeDocker(['hang']), stage = { progress: 0 };
  const pending = buildAndStartServices({ services: ['watch-together', 'livekit'], build: true, stage, log() {}, idleTimeoutMs: 30, ...docker });
  await new Promise(resolve => setTimeout(resolve, 8));
  assert.equal(stage.progress, 5);
  await assert.rejects(pending, /no output/);
  assert.equal(docker.children[0].killed, true);
});
test('started containers that never become healthy cannot report successful installation', async () => {
  const { buildAndStartServices } = await modulePromise;
  const docker = fakeDocker([0, ...Array(100).fill(1)]), stage = {};
  await assert.rejects(buildAndStartServices({ services: ['watch-together'], build: false, stage, log() {}, healthTimeoutMs: 25, healthRetryMs: 1, ...docker }), /did not pass its health check/);
  assert.equal(stage.progress, 90);
});
