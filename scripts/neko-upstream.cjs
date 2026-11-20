// Discover only responding Neko endpoints, never a 404 or an unrelated SPA page.
async function discoverNekoUpstream(candidates, { fetchImpl = fetch, timeoutMs = 600 } = {}) {
  async function probe(url, isHomepage = false) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        await response.body?.cancel();
        return false;
      }
      const body = await response.text();
      if (isHomepage) return /<title>\s*n\.?eko\s*<\/title>/i.test(body);
      // Neko's health response is plain text; a reverse proxy's HTML fallback isn't health.
      return !/^\s*(?:<!doctype\s+html|<html)/i.test(body);
    } catch {
      return false;
    }
  }

  for (const value of new Set(candidates.filter(Boolean))) {
    const url = value.replace(/\/+$/, '');
    if (await probe(`${url}/neko/health`)) return { url, prefix: '/neko' };
    if (await probe(`${url}/health`)) return { url, prefix: '' };
    if (await probe(`${url}/`, true)) return { url, prefix: '' };
  }
  return null;
}

module.exports = { discoverNekoUpstream };
