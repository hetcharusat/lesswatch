const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../scripts/installer-image.mjs');

test('unpublished Docker Hub image cannot break existing source installs', async () => {
  const { selectInstallerImage } = await modulePromise;
  assert.deepEqual(selectInstallerImage({ release: { image: 'h4het/lesswatch:latest', available: false } }), { image: 'watch-together:latest', prebuilt: false });
});
test('published image defaults to pull; explicit image and source choices take precedence', async () => {
  const { selectInstallerImage } = await modulePromise;
  const release = { image: 'h4het/lesswatch:latest', available: true };
  assert.deepEqual(selectInstallerImage({ release }), { image: release.image, prebuilt: true });
  assert.equal(selectInstallerImage({ release, envContent: 'LESSWATCH_IMAGE="h4het/lesswatch:sha-pinned"' }).image, 'h4het/lesswatch:sha-pinned');
  assert.equal(selectInstallerImage({ release, environmentImage: 'h4het/lesswatch:1.2.3' }).image, 'h4het/lesswatch:1.2.3');
  assert.deepEqual(selectInstallerImage({ release, environmentImage: release.image, fromSource: true }), { image: 'watch-together:latest', prebuilt: false });
});
test('image references cannot contain whitespace or shell fragments', async () => {
  const { selectInstallerImage } = await modulePromise;
  assert.throws(() => selectInstallerImage({ environmentImage: 'image; command' }), /Docker image reference/);
});
