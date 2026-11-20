import React, { useEffect, useRef } from 'react';
import { Mic } from 'lucide-react';

const BANDS = [[0,350], [350,700], [700,1400], [1400,2800], [2800,5600]];

export function VoiceActivityPill({ analyserRef, audioNodesRef, mutedRef }) {
  const bars = useRef([]);
  useEffect(() => {
    let frame, data, last = 0;
    const levels = new Float32Array(BANDS.length);
    const update = now => {
      frame = requestAnimationFrame(update);
      if (now - last < 40) return;
      last = now;
      const analyser = analyserRef.current;
      const active = analyser && analyser.context.state !== 'closed' && !mutedRef?.current;
      const gain = audioNodesRef?.current?.gateGain?.gain.value ?? 1;
      if (active) {
        if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
      }
      BANDS.forEach(([low, high], index) => {
        let energy = 0, count = 0;
        if (active) {
          const binHz = analyser.context.sampleRate / analyser.fftSize;
          const start = Math.max(0, Math.floor(low / binHz));
          const end = Math.min(data.length, Math.max(start + 1, Math.ceil(high / binHz)));
          for (let bin = start; bin < end; bin++) { energy += data[bin] * data[bin]; count++; }
        }
        const measured = count ? Math.sqrt(energy / count) / 255 * gain : 0;
        const target = Math.pow(Math.max(0, measured - 0.02), 0.7);
        levels[index] += (target - levels[index]) * (target > levels[index] ? 0.65 : 0.3);
        bars.current[index]?.style.setProperty('transform', `scaleY(${0.12 + Math.min(1, levels[index]) * 0.88})`);
      });
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [analyserRef, audioNodesRef, mutedRef]);
  return <div className="voice-activity-pill" role="status" aria-label="Push-to-talk microphone active" title="Push to talk · microphone active">
    <Mic size={13} aria-hidden="true" /><div className="voice-activity-spectrum" aria-hidden="true">
      {BANDS.map((_, index) => <span key={index} ref={node => { bars.current[index] = node; }} />)}
    </div>
  </div>;
}
