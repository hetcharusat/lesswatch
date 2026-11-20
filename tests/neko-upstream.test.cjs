const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { discoverNekoUpstream } = require('../scripts/neko-upstream.cjs');

async function fixture(t, routes) {
  const server = http.createServer((req, res) => {
    const route = routes[req.url] || [404, '404 page not found'];
    res.writeHead(route[0]);
    res.end(route[1]);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('root deployment: /neko/health 404 must not select the prefixed route', async t => {
  const url = await fixture(t, { '/health': [200, 'true'] });
  assert.deepEqual(await discoverNekoUpstream([url]), { url, prefix: '' });
});

test('prefixed deployment keeps /neko', async t => {
  const url = await fixture(t, { '/neko/health': [200, 'true'] });
  assert.deepEqual(await discoverNekoUpstream([url]), { url, prefix: '/neko' });
});

test('all 404 responses mean unavailable, not ready', async t => {
  const url = await fixture(t, {});
  assert.equal(await discoverNekoUpstream([url]), null);
});

test('legacy root homepage works when health is missing', async t => {
  const url = await fixture(t, { '/': [200, '<!doctype html><title>n.eko</title>'] });
  assert.deepEqual(await discoverNekoUpstream([url + '/']), { url, prefix: '' });
});

test('an unrelated SPA fallback cannot masquerade as Neko health', async t => {
  const html = [200, '<!doctype html><html><title>Other app</title></html>'];
  const url = await fixture(t, { '/neko/health': html, '/health': html, '/': html });
  assert.equal(await discoverNekoUpstream([url]), null);
});

test('an unhealthy candidate does not hide the next healthy deployment', async t => {
  const bad = await fixture(t, { '/neko/health': [503, 'starting'] });
  const url = await fixture(t, { '/health': [200, 'true'] });
  assert.deepEqual(await discoverNekoUpstream([bad, url]), { url, prefix: '' });
});

test('a restarting upstream is re-probed rather than keeping its old prefix', async t => {
  const routes = { '/neko/health': [200, 'true'] };
  const url = await fixture(t, routes);
  assert.equal((await discoverNekoUpstream([url])).prefix, '/neko');
  delete routes['/neko/health'];
  assert.equal(await discoverNekoUpstream([url]), null);
  routes['/health'] = [200, 'true'];
  assert.equal((await discoverNekoUpstream([url])).prefix, '');
});

test('network errors fail closed', async () => {
  assert.equal(await discoverNekoUpstream(['http://unavailable'], {
    fetchImpl: async () => { throw new Error('connection refused'); }
  }), null);
});
