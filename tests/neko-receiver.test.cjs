const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('Interact minimizes both receiver buffers; Watch buffers brief delivery gaps', () => {
  const frame = { dataset: { streamMode: 'watch' } };
  let update;
  class Peer {
    connectionState = 'connected';
    listeners = {};
    receivers = [];
    addEventListener(name, listener) { this.listeners[name] = listener; }
    getReceivers() { return this.receivers; }
  }
  const window = { frameElement: frame, RTCPeerConnection: Peer };
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/neko-receiver.js'), 'utf8'), {
    window, setTimeout: fn => fn(),
    MutationObserver: class { constructor(callback) { update = callback; } observe() {} }
  });
  const pc = new window.RTCPeerConnection({});
  const receiver = { jitterBufferTarget: 120, playoutDelayHint: 0.2 };
  pc.receivers.push(receiver);
  pc.listeners.track({ receiver });
  assert.deepEqual(receiver, { jitterBufferTarget: 300, playoutDelayHint: 0.3 });
  frame.dataset.streamMode = 'interact'; update();
  assert.deepEqual(receiver, { jitterBufferTarget: 0, playoutDelayHint: 0 });
  frame.dataset.streamMode = 'watch'; update();
  assert.deepEqual(receiver, { jitterBufferTarget: 300, playoutDelayHint: 0.3 });
  frame.dataset.streamMode = ''; update();
  assert.deepEqual(receiver, { jitterBufferTarget: 120, playoutDelayHint: 0.2 });
  frame.dataset.streamMode = 'interact';
  const unsupported = {};
  pc.listeners.track({ receiver: unsupported });
  assert.deepEqual(unsupported, {});
  pc.connectionState = 'closed'; pc.listeners.connectionstatechange();
  frame.dataset.streamMode = 'watch'; update();
  assert.equal(receiver.jitterBufferTarget, 120);
});
