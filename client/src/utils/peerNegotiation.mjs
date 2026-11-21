// One serialized SDP writer per peer. Never create an offer in one async task
// and apply it after another task has changed the negotiated m-line ordering.
// https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
export function createPeerNegotiation(pc, { polite, send, onError, prepareAnswer }) {
  let operations = Promise.resolve();
  let ignoreOffer = false;
  let candidates = [];
  const enqueue = task => {
    const result = operations.then(() => {
      if (pc.signalingState !== 'closed') return task();
    });
    operations = result.catch(error => {
      if (pc.signalingState !== 'closed') onError(error);
    });
    return operations;
  };
  const flushCandidates = async () => {
    const pending = candidates;
    candidates = [];
    for (const candidate of pending) await pc.addIceCandidate(candidate);
  };
  pc.onnegotiationneeded = () => enqueue(async () => {
    if (pc.signalingState !== 'stable') return;
    await pc.setLocalDescription();
    send({ desc: pc.localDescription });
  });
  return {
    receive(signal) {
      return enqueue(async () => {
        const desc = signal.desc;
        if (desc) {
          const collision = desc.type === 'offer' && pc.signalingState !== 'stable';
          ignoreOffer = collision && !polite();
          if (ignoreOffer) { candidates = []; return; }
          if (desc.type === 'answer' && pc.signalingState !== 'have-local-offer') return;
          // setRemoteDescription rolls back a collided local offer atomically.
          await pc.setRemoteDescription(desc);
          await flushCandidates();
          if (desc.type === 'offer') {
            await prepareAnswer?.();
            await pc.setLocalDescription();
            send({ desc: pc.localDescription });
          }
        } else if (signal.candidate && !ignoreOffer) {
          if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
          else candidates.push(signal.candidate);
        }
      });
    }
  };
}
