import crypto from 'node:crypto';

// Rerunning the installer must keep the keys used by existing services/users.
export function ensureInstallerCredentials(content) {
  const defaults = {
    LIVEKIT_API_KEY: () => 'watchtogether',
    LIVEKIT_API_SECRET: () => crypto.randomBytes(24).toString('hex'),
    VAULT_SECRET: () => crypto.randomBytes(32).toString('hex'),
    NEKO_PASSWORD: () => 'admin',
    NEKO_ADMIN_PASSWORD: () => 'admin'
  };
  for (const [key, generate] of Object.entries(defaults)) {
    const pattern = new RegExp(`^(?:export\\s+)?${key}\\s*=([^\\r\\n]*)`, 'm');
    const existing = content.match(pattern);
    if (existing && !['', '""', "''"].includes(existing[1].trim())) continue;
    const line = `${key}=${generate()}`;
    content = existing ? content.replace(pattern, () => line) : `${content.trimEnd()}\n${line}\n`;
  }
  return content;
}
