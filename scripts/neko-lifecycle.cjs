// A stopped browser can only be revived by an explicit room launch, never by polling.
function createNekoLifecycle({ start, stop, hasUsers, onStop = () => {}, delayMs = 180000,
  setTimer = setTimeout, clearTimer = clearTimeout, onError = console.error }) {
  let wanted = false;
  let initialized = false;
  let epoch = 0;
  let queue = Promise.resolve();
  let pendingStart = null;
  let idleTimer = null;
  let startController = null;
  const cancelIdle = () => {
    if (idleTimer !== null) clearTimer(idleTimer);
    idleTimer = null;
  };
  const enqueue = operation => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const halt = (reason = 'manual') => {
    wanted = false;
    initialized = false;
    epoch += 1;
    startController?.abort();
    cancelIdle();
    onStop(reason);
    // Finish an in-flight Docker start before issuing stop, so it cannot win the race.
    return enqueue(stop);
  };
  const reconcile = () => {
    if (hasUsers()) {
      cancelIdle();
      return { skipped: true, reason: 'active_users' };
    }
    if (idleTimer === null) {
      idleTimer = setTimer(() => {
        idleTimer = null;
        if (!hasUsers()) halt('idle').catch(onError);
      }, delayMs);
      idleTimer?.unref?.();
    }
    return { scheduled: true, delayMs };
  };
  const ensure = ({ explicit = false } = {}) => {
    if (explicit && !wanted) { wanted = true; epoch += 1; }
    if (!wanted) return Promise.resolve('stopped');
    const version = epoch;
    if (pendingStart?.version === version) return pendingStart.promise;
    const promise = enqueue(async () => {
      if (!wanted || version !== epoch) return 'stopped';
      startController = new AbortController();
      const result = await start({ fresh: !initialized, signal: startController.signal });
      if (!wanted || version !== epoch) return 'stopped';
      if (result === 'running') initialized = true;
      reconcile();
      return result;
    });
    pendingStart = { version, promise };
    const clear = () => { if (pendingStart?.promise === promise) pendingStart = null; };
    promise.then(clear, clear);
    return promise;
  };
  return { ensure, stop: halt, reconcile, dispose: cancelIdle };
}
module.exports = { createNekoLifecycle };
