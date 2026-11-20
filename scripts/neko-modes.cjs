const MODES = Object.freeze({
  interact: { width: 1280, height: 720, rate: 30 },
  watch: { width: 1920, height: 1080, rate: 60 }
});

function createNekoModes({ getUpstream, password, fetchImpl = fetch }) {
  let session = null;
  let changing = false;
  async function request(method, body, retry = true) {
    const upstream = await getUpstream();
    const base = `${upstream.url}${upstream.prefix}/api`;
    if (!session || session.base !== base) {
      const login = await fetchImpl(`${base}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'LESSWATCH Modes', password }),
        signal: AbortSignal.timeout(5000)
      });
      if (!login.ok) throw new Error('Could not authenticate the browser mode control.');
      const data = await login.json();
      const token = (data.data || data).token;
      const cookie = login.headers.get('set-cookie')?.split(';')[0];
      if (!token && !cookie) throw new Error('Browser mode authentication returned no session.');
      session = { base, headers: token ? { Authorization: `Bearer ${token}` } : { Cookie: cookie } };
    }
    const response = await fetchImpl(`${base}/room/screen`, {
      method, headers: { ...session.headers, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000)
    });
    if (response.status === 401) {
      session = null;
      if (retry) return request(method, body, false);
    }
    if (!response.ok) throw new Error(`Browser mode request failed (${response.status}). Please try again.`);
    const data = await response.json();
    return data.data || data;
  }
  async function read() {
    const screen = await request('GET');
    const mode = Object.keys(MODES).find(key => Object.entries(MODES[key]).every(([k, v]) => screen[k] === v)) || null;
    return { mode, screen };
  }
  async function set(mode) {
    if (!Object.hasOwn(MODES, mode)) throw new Error('Choose Interact or Watch.');
    if (changing) throw new Error('A browser mode change is already in progress.');
    changing = true;
    try {
      await request('POST', MODES[mode]);
      const result = await read();
      if (result.mode !== mode) throw new Error('The browser did not apply the requested screen mode.');
      return result;
    } finally { changing = false; }
  }
  return { read, set };
}
module.exports = { MODES, createNekoModes };
