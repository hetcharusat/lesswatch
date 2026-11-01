import { SpeexWorkletNode, loadSpeex } from '@sapphi-red/web-noise-suppressor';
import speexWorkletUrl from '@sapphi-red/web-noise-suppressor/speexWorklet.js?url';
import speexWasmUrl from '@sapphi-red/web-noise-suppressor/speex.wasm?url';

let speexWasmBinaryPromise = null;
const workletAddedContexts = new WeakSet();

/**
 * Initializes and creates an AI/DSP Speex noise suppressor node using @sapphi-red/web-noise-suppressor.
 * Operates at any microphone sample rate (44.1kHz, 48kHz, etc.) with near-zero latency.
 * Falls back gracefully to null if AudioWorklet or WebAssembly is unsupported in the current browser.
 */
export async function createNoiseSuppressorNode(audioContext) {
  try {
    if (!audioContext || !audioContext.audioWorklet) {
      return null;
    }

    if (!speexWasmBinaryPromise) {
      speexWasmBinaryPromise = loadSpeex({ url: speexWasmUrl });
    }

    if (!workletAddedContexts.has(audioContext)) {
      await audioContext.audioWorklet.addModule(speexWorkletUrl);
      workletAddedContexts.add(audioContext);
    }

    const wasmBinary = await speexWasmBinaryPromise;
    const speexNode = new SpeexWorkletNode(audioContext, {
      wasmBinary,
      maxChannels: 1
    });

    return speexNode;
  } catch (err) {
    console.warn('WASM / AudioWorklet noise suppressor load failed, using DSP fallback:', err);
    return null;
  }
}

