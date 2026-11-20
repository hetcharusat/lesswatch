// Loaded before Neko's client: immediate input feedback or buffered movie playback.
(() => {
  const NativePeer = window.RTCPeerConnection;
  const frame = window.frameElement;
  if (!NativePeer || !frame) return;
  const peers = new Set();
  const defaults = new WeakMap();
  const apply = receiver => {
    const interactive = frame.dataset.streamMode === 'interact';
    const watching = frame.dataset.streamMode === 'watch';
    if (!defaults.has(receiver)) {
      defaults.set(receiver, {
        jitterBufferTarget: receiver.jitterBufferTarget,
        playoutDelayHint: receiver.playoutDelayHint
      });
    }
    const original = defaults.get(receiver);
    for (const property of ['jitterBufferTarget', 'playoutDelayHint']) {
      if (!(property in receiver)) continue;
      const watchTarget = property === 'jitterBufferTarget' ? 300 : 0.3;
      try { receiver[property] = interactive ? 0 : watching ? watchTarget : original[property]; } catch { /* Optional browser API. */ }
    }
  };
  const update = () => peers.forEach(pc => pc.getReceivers().forEach(apply));
  window.RTCPeerConnection = new Proxy(NativePeer, {
    construct(target, args) {
      const pc = new target(...args);
      peers.add(pc);
      // Run after all track handlers: Neko sets its own zero-delay target there.
      pc.addEventListener('track', event => setTimeout(() => apply(event.receiver), 0));
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'closed') peers.delete(pc);
      });
      return pc;
    }
  });
  new MutationObserver(update).observe(frame, { attributes: true, attributeFilter: ['data-stream-mode'] });
})();
