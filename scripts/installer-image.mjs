export function selectInstallerImage({ environmentImage, envContent = '', release = {}, fromSource = false } = {}) {
  if (fromSource) return { image: 'watch-together:latest', prebuilt: false };
  const configured = envContent.match(/^\s*(?:export\s+)?LESSWATCH_IMAGE\s*=\s*([^\r\n]*)/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
  const image = environmentImage?.trim() || configured || (release.available ? release.image : '') || 'watch-together:latest';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(image)) throw new Error('LESSWATCH_IMAGE must be a Docker image reference without whitespace.');
  return { image, prebuilt: image !== 'watch-together:latest' };
}
