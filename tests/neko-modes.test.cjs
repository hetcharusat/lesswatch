const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNekoModes } = require('../scripts/neko-modes.cjs');

function fixture({ expire = false, reject = false } = {}) {
  let screen = { width: 1280, height: 720, rate: 30 };
  let logins = 0;
  const calls = [];
  const modes = createNekoModes({
    password: 'test-only',
    getUpstream: async () => ({ url: 'http://neko:8080', prefix: '/neko' }),
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      if (url.endsWith('/login')) return Response.json({ token: `session-${++logins}` });
      assert.equal(options.headers.Authorization, `Bearer session-${logins}`);
      if (expire) { expire = false; return new Response('', { status: 401 }); }
      if (options.method === 'POST') {
        if (reject) return new Response('', { status: 503 });
        screen = JSON.parse(options.body);
      }
      return Response.json(screen);
    }
  });
  return { modes, calls, logins: () => logins };
}

test('switches both shared desktop modes, verifies screen and reuses authentication', async () => {
  const f = fixture();
  assert.equal((await f.modes.read()).mode, 'interact');
  assert.deepEqual(await f.modes.set('watch'), { mode: 'watch', screen: { width: 1920, height: 1080, rate: 60 } });
  assert.deepEqual(await f.modes.set('interact'), { mode: 'interact', screen: { width: 1280, height: 720, rate: 30 } });
  assert.equal(f.logins(), 1);
  assert.ok(f.calls.every(call => call.url.startsWith('http://neko:8080/neko/api/')));
});
test('refreshes expired Neko sessions automatically', async () => {
  const f = fixture({ expire: true });
  assert.equal((await f.modes.set('watch')).mode, 'watch');
  assert.equal(f.logins(), 2);
});
test('rejects invalid modes before making any requests', async () => {
  const f = fixture();
  await assert.rejects(f.modes.set('invalid'), /Choose Interact or Watch/);
  assert.equal(f.calls.length, 0);
});
test('failed changes preserve actual mode and unlock subsequent changes', async () => {
  const f = fixture({ reject: true });
  await assert.rejects(f.modes.set('watch'), /503/);
  assert.equal((await f.modes.read()).mode, 'interact');
  await assert.rejects(f.modes.set('watch'), /503/);
});
test('serializes conflicting simultaneous mode changes', async () => {
  const f = fixture();
  const first = f.modes.set('watch');
  await assert.rejects(f.modes.set('interact'), /already in progress/);
  assert.equal((await first).mode, 'watch');
});
