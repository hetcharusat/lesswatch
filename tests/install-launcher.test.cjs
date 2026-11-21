const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const gitPath = spawnSync('git', ['--exec-path'], { encoding: 'utf8' }).stdout?.trim();
const bash = process.platform === 'win32' ? path.resolve(gitPath, '../../../bin/bash.exe') : 'bash';
const source = fs.readFileSync(path.join(__dirname, '../install.sh'), 'utf8').replace(/\r\n/g, '\n');
const slash = value => value.replaceAll('\\', '/');

function fixture(t, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lesswatch-installer-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin'), cwd = path.join(root, 'start'), home = path.join(root, 'home');
  for (const dir of [bin, cwd, home]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(root, 'install.sh'), source);
  const script = (name, body) => fs.writeFileSync(path.join(bin, name), '#!/usr/bin/env bash\n' + body + '\n', { mode: 0o755 });
  script('curl', 'exit 0');
  script('sudo', 'printf "SUDO\\n" >> "$TEST_ROOT/calls"\n[ "${1:-}" != -E ] || shift\nexec "$@"');
  script('git', `printf 'GIT %s\\n' "$*" >> "$TEST_ROOT/calls"
case "$*" in
  *status*) [ "\${FAKE_DIRTY:-0}" != 1 ] || printf ' M custom-file\\n' ;;
  *symbolic-ref*) printf '%s\\n' "\${FAKE_BRANCH:-main}" ;;
  *pull*) [ "\${FAKE_PULL_FAIL:-0}" != 1 ] ;;
  clone*)
    target="\${@: -1}"
    mkdir -p "$target/scripts"
    printf '#!/usr/bin/env bash\\nprintf "DEPLOY %%s\\\\n" "$*" >> "$TEST_ROOT/calls"\\n' > "$target/deploy.sh"
    touch "$target/docker-compose.yml" "$target/scripts/ensure-docker.sh"
    ;;
esac`);
  function checkout(target) {
    fs.mkdirSync(path.join(target, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(target, 'deploy.sh'), '#!/usr/bin/env bash\nprintf "DEPLOY %s\\n" "$*" >> "$TEST_ROOT/calls"\n');
    fs.writeFileSync(path.join(target, 'docker-compose.yml'), '');
    fs.writeFileSync(path.join(target, 'scripts/ensure-docker.sh'), '');
  }
  const target = path.join(home, 'lesswatch');
  return {
    root, target, cwd, checkout,
    run(args = []) {
      const command = 'if command -v cygpath >/dev/null 2>&1; then export PATH="$(cygpath -u "$TEST_BIN"):$PATH"; else export PATH="$TEST_BIN:$PATH"; fi; source "$TEST_INSTALL"';
      const result = spawnSync(bash, ['--noprofile', '--norc', '-c', command, 'installer-test', ...args], {
        cwd, encoding: 'utf8', timeout: 10000,
        env: { ...process.env, HOME: slash(home), TEST_BIN: slash(bin), TEST_INSTALL: slash(path.join(root, 'install.sh')), TEST_ROOT: slash(root), ...extra }
      });
      if (result.error) throw result.error;
      return { ...result, calls: fs.existsSync(path.join(root, 'calls')) ? fs.readFileSync(path.join(root, 'calls'), 'utf8') : '' };
    }
  };
}

test('installer preserves non-Git folders and refuses deployment', t => {
  const f = fixture(t); fs.mkdirSync(f.target); fs.writeFileSync(path.join(f.target, 'media.txt'), 'keep');
  const r = f.run(); assert.notEqual(r.status, 0); assert.match(r.stderr, /Nothing was removed/);
  assert.equal(fs.readFileSync(path.join(f.target, 'media.txt'), 'utf8'), 'keep'); assert.doesNotMatch(r.calls, /DEPLOY|clone/);
});
test('clean checkout uses fast-forward-only update and forwards installer arguments', t => {
  const f = fixture(t); f.checkout(f.target); fs.mkdirSync(path.join(f.target, '.git'));
  const r = f.run(['--real', 'value with spaces']); assert.equal(r.status, 0, r.stderr);
  assert.match(r.calls, /pull --ff-only origin main/); assert.match(r.calls, /DEPLOY --real value with spaces/);
});
test('failed repository update stops before deployment', t => {
  const f = fixture(t, { FAKE_PULL_FAIL: '1' }); f.checkout(f.target); fs.mkdirSync(path.join(f.target, '.git'));
  const r = f.run(); assert.notEqual(r.status, 0); assert.match(r.stderr, /Update failed/); assert.doesNotMatch(r.calls, /DEPLOY/);
});
test('dirty checkout keeps local edits and skips pull', t => {
  const f = fixture(t, { FAKE_DIRTY: '1' }); f.checkout(f.target); fs.mkdirSync(path.join(f.target, '.git'));
  const r = f.run(); assert.equal(r.status, 0, r.stderr); assert.doesNotMatch(r.calls, /pull/); assert.match(r.calls, /DEPLOY/);
});
test('fresh install clones into empty path and launches deployment', t => {
  const f = fixture(t); const r = f.run(); assert.equal(r.status, 0, r.stderr);
  assert.match(r.calls, /clone --branch main --single-branch/); assert.match(r.calls, /DEPLOY/);
});
test('running in the project uses local source without pulling', t => {
  const f = fixture(t); f.checkout(f.cwd); const r = f.run(); assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.calls, /clone|pull/); assert.match(r.calls, /DEPLOY/);
});
