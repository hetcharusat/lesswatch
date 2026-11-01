import {
  SpeexWorkletNode,
  loadSpeex,
  RnnoiseWorkletNode,
  loadRnnoise
} from '@sapphi-red/web-noise-suppressor';
import speexWorkletUrl from '@sapphi-red/web-noise-suppressor/speexWorklet.js?url';
import speexWasmUrl from '@sapphi-red/web-noise-suppressor/speex.wasm?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

let speexWasmBinaryPromise = null;
let rnnoiseWasmBinaryPromise = null;
const addedWorkletsMap = new WeakMap(); // audioContext -> Set of loaded urls

/**
 * Initializes and creates an AI/DSP noise suppressor node using @sapphi-red/web-noise-suppressor.
 * Supports:
 * - 'rnnoise': Recurrent Neural Network voice isolation (removes background fans, typing, TV clatter).
 * - 'speex': Low-latency acoustic DSP noise suppressor (robust at any sample rate: 44.1kHz, 48kHz, etc.).
 * - 'off' / 'raw': Pure direct microphone signal.
 */
export async function createNoiseSuppressorNode(audioContext, mode = 'speex') {
  if (!audioContext || !audioContext.audioWorklet || mode === 'off' || mode === 'raw') {
    return null;
  }

  try {
    let contextLoaded = addedWorkletsMap.get(audioContext);
    if (!contextLoaded) {
      contextLoaded = new Set();
      addedWorkletsMap.set(audioContext, contextLoaded);
    }

    if (mode === 'rnnoise') {
      if (!contextLoaded.has(rnnoiseWorkletUrl)) {
        await audioContext.audioWorklet.addModule(rnnoiseWorkletUrl);
        contextLoaded.add(rnnoiseWorkletUrl);
      }
      if (!rnnoiseWasmBinaryPromise) {
        rnnoiseWasmBinaryPromise = loadRnnoise({
          url: rnnoiseWasmUrl,
          simdUrl: rnnoiseSimdWasmUrl
        });
      }
      const wasmBinary = await rnnoiseWasmBinaryPromise;
      const node = new RnnoiseWorkletNode(audioContext, {
        wasmBinary,
        maxChannels: 2
      });
      return { node, mode: 'rnnoise' };
    }

    // Default: Speex DSP (all sample rates)
    if (!contextLoaded.has(speexWorkletUrl)) {
      await audioContext.audioWorklet.addModule(speexWorkletUrl);
      contextLoaded.add(speexWorkletUrl);
    }
    if (!speexWasmBinaryPromise) {
      speexWasmBinaryPromise = loadSpeex({ url: speexWasmUrl });
    }
    const wasmBinary = await speexWasmBinaryPromise;
    const node = new SpeexWorkletNode(audioContext, {
      wasmBinary,
      maxChannels: 2
    });
    return { node, mode: 'speex' };
  } catch (err) {
    console.warn(`Noise suppressor mode [${mode}] load failed, falling back to bypass:`, err);
    return null;
  }
}
