const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../client/src/utils/peerNegotiation.mjs');

function peer(state = 'stable') {
  return {
    signalingState: state, localDescription: null, remoteDescription: null,
    calls: [], active: 0, peak: 0,
    async setLocalDescription(...args) {
      assert.equal(args.length, 0, 'SDP must be generated and applied atomically');
      this.peak = Math.max(this.peak, ++this.active);
      await new Promise(resolve => setImmediate(resolve));
      const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';
      this.localDescription = { type, sdp: 'audio-video' };
      this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
      this.active--;
      this.calls.push(type);
    },
    async setRemoteDescription(desc) {
      this.remoteDescription = desc;
      this.signalingState = desc.type === 'offer' ? 'have-remote-offer' : 'stable';
      this.calls.push('remote-' + desc.type);
    },
    async addIceCandidate(candidate) { this.calls.push(candidate.id); }
  };
}

test('overlapping negotiation events have one SDP writer and no stale createOffer result', async () => {
  const { createPeerNegotiation } = await modulePromise;
  const pc = peer(), sent = [], errors = [];
  createPeerNegotiation(pc, { polite: () => true, send: value => sent.push(value), onError: e => errors.push(e) });
  await Promise.all([pc.onnegotiationneeded(), pc.onnegotiationneeded(), pc.onnegotiationneeded()]);
  assert.equal(pc.peak, 1);
  assert.equal(sent.length, 1);
  assert.deepEqual(errors, []);
});

test('polite collision rolls back through remote offer and prepares tracks before answering', async () => {
  const { createPeerNegotiation } = await modulePromise;
  const pc = peer('have-local-offer'), errors = [];
  const controller = createPeerNegotiation(pc, { polite: () => true, send: () => {}, onError: e => errors.push(e), prepareAnswer: () => pc.calls.push('attach-tracks') });
  await controller.receive({ desc: { type: 'offer', sdp: 'incoming' } });
  assert.deepEqual(pc.calls, ['remote-offer', 'attach-tracks', 'answer']);
  assert.equal(pc.signalingState, 'stable');
  assert.deepEqual(errors, []);
});

test('impolite collision ignores that offer and its ICE, then accepts the matching answer', async () => {
  const { createPeerNegotiation } = await modulePromise;
  const pc = peer('have-local-offer');
  const controller = createPeerNegotiation(pc, { polite: () => false, send: () => {}, onError: assert.fail });
  await controller.receive({ desc: { type: 'offer' } });
  await controller.receive({ candidate: { id: 'ignored-ice' } });
  await controller.receive({ desc: { type: 'answer' } });
  assert.deepEqual(pc.calls, ['remote-answer']);
});

test('early ICE is applied after remote description; stale answers and closed peers are ignored', async () => {
  const { createPeerNegotiation } = await modulePromise;
  const pc = peer();
  const controller = createPeerNegotiation(pc, { polite: () => true, send: () => {}, onError: assert.fail });
  await controller.receive({ candidate: { id: 'ice-1' } });
  await controller.receive({ candidate: { id: 'ice-2' } });
  await controller.receive({ desc: { type: 'offer' } });
  await controller.receive({ desc: { type: 'answer' } });
  assert.deepEqual(pc.calls, ['remote-offer', 'ice-1', 'ice-2', 'answer']);
  pc.signalingState = 'closed';
  await pc.onnegotiationneeded();
  assert.equal(pc.calls.length, 4);
});
