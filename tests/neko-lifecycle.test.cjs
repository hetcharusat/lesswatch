const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNekoLifecycle } = require('../scripts/neko-lifecycle.cjs');

function fixture(overrides = {}) {
  let present = true;
  let starts = 0;
  let stops = 0;
  const launches = [];
  const timers = new Map();
  let serial = 0;
  const lifecycle = createNekoLifecycle({
    hasUsers: () => present,
    start: async ({ fresh }) => { starts++; launches.push(fresh); return 'running'; },
    stop: async () => { stops++; return { success: true }; },
    setTimer: (fn, delay) => { const id = ++serial; timers.set(id, { fn, delay }); return id; },
    clearTimer: id => timers.delete(id),
    ...overrides
  });
  return { lifecycle, timers, launches, starts: () => starts, stops: () => stops,
    setPresent(value) { present = value; },
    async expire() { const timer = timers.values().next().value; assert.ok(timer); timers.clear(); timer.fn(); await new Promise(setImmediate); }
  };
}

test('polling cannot launch a stopped browser, and Stop blocks stale requests', async () => {
  const f = fixture();
  assert.equal(await f.lifecycle.ensure(), 'stopped');
  assert.equal(f.starts(), 0);
  await f.lifecycle.ensure({ explicit: true });
  await f.lifecycle.stop();
  assert.equal(await f.lifecycle.ensure(), 'stopped');
  assert.equal(f.starts(), 1);
  assert.equal(f.stops(), 1);
  await f.lifecycle.ensure({ explicit: true });
  assert.deepEqual(f.launches, [true, true]);
});
test('room empty timeout is three minutes and passive traffic does not postpone it', async () => {
  const f = fixture();
  await f.lifecycle.ensure({ explicit: true });
  f.setPresent(false); f.lifecycle.reconcile();
  const initialTimer = [...f.timers.keys()][0];
  assert.equal(f.timers.get(initialTimer).delay, 180000);
  await f.lifecycle.ensure(); f.lifecycle.reconcile();
  assert.equal([...f.timers.keys()][0], initialTimer);
  await f.expire();
  assert.equal(f.stops(), 1);
  assert.equal(await f.lifecycle.ensure(), 'stopped');
});
test('returning users cancel the timeout; an occupied room is never stopped', async () => {
  const f = fixture();
  f.setPresent(false); f.lifecycle.reconcile();
  const callback = [...f.timers.values()][0].fn;
  f.setPresent(true); f.lifecycle.reconcile();
  assert.equal(f.timers.size, 0);
  callback(); await new Promise(setImmediate);
  assert.equal(f.stops(), 0);
});
test('concurrent launches share initialization; joining a running session preserves its mode', async () => {
  const f = fixture();
  await Promise.all([f.lifecycle.ensure({ explicit: true }), f.lifecycle.ensure({ explicit: true })]);
  assert.equal(f.starts(), 1);
  await f.lifecycle.ensure({ explicit: true });
  assert.deepEqual(f.launches, [true, false]);
});
test('Stop wins against an in-flight launch, aborts it, and serializes Docker stop afterward', async () => {
  let finish;
  let signal;
  const order = [];
  const f = fixture({
    start: async options => { signal = options.signal; order.push('start'); await new Promise(r => { finish = r; }); return 'running'; },
    stop: async () => { order.push('stop'); return { success: true }; }
  });
  const starting = f.lifecycle.ensure({ explicit: true });
  await new Promise(setImmediate);
  const stopping = f.lifecycle.stop();
  assert.equal(signal.aborted, true);
  assert.equal(await f.lifecycle.ensure(), 'stopped');
  finish();
  assert.equal(await starting, 'stopped');
  await stopping;
  assert.deepEqual(order, ['start', 'stop']);
});
test('failed startup is retried as a fresh launch instead of claiming readiness', async () => {
  let calls = 0;
  const fresh = [];
  const f = fixture({ start: async options => { fresh.push(options.fresh); return ++calls === 1 ? 'failed' : 'running'; } });
  assert.equal(await f.lifecycle.ensure({ explicit: true }), 'failed');
  assert.equal(await f.lifecycle.ensure(), 'running');
  assert.deepEqual(fresh, [true, true]);
});
