import React, { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle } from 'ogl';

const vertex = `attribute vec2 position; void main(){ gl_Position=vec4(position,0.0,1.0); }`;
const fragment = `
precision highp float;
uniform float uSeed;
uniform float uSize;
uniform vec3 uTint;
float hash(vec2 p){
  vec3 p3=fract(vec3(p.xyx)*0.1031);
  p3+=dot(p3,p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}
float field(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),
             mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y)-0.5;
}
void main(){
  vec2 p=gl_FragCoord.xy/max(0.45,uSize);
  vec2 seed=vec2(uSeed,uSeed*0.731);
  // Independent exposure each frame; correlated fine/coarse structure, zero-mean tone.
  float grain=0.72*field(p+seed)+0.28*field(p*0.53-seed.yx);
  gl_FragColor=vec4(vec3(0.5)+grain*0.9*uTint,1.0);
}`;

export function FilmGrain({ intensity = 30, size = 1, blend = 'soft-light', rose = false }) {
  const host = useRef(null);
  const options = useRef({ size, rose });
  options.current = { size, rose };
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let canvas, renderer, geometry, program, mesh, ctx, pixels;
    let frame = 0, last = -Infinity, scale = 1, stopped = false, fallbackSize = size;
    const random = new Uint32Array(1);
    const releaseGL = () => {
      geometry?.remove(); program?.remove();
      renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext();
      renderer = geometry = program = mesh = null;
    };
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (renderer) {
        scale = Math.min(1, Math.sqrt(2073600 / Math.max(1, width * height)));
        renderer.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
        canvas.style.width = '100%'; canvas.style.height = '100%';
      } else if (ctx) {
        scale = Math.min(1, 480 / Math.max(1, width), 270 / Math.max(1, height)) / options.current.size;
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        pixels = ctx.createImageData(canvas.width, canvas.height);
      }
    };
    const fallback = () => {
      canvas?.remove();
      releaseGL();
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d', { alpha: false });
      element.appendChild(canvas);
      element.dataset.engine = 'canvas2d';
      resize();
    };
    try {
      canvas = document.createElement('canvas');
      renderer = new Renderer({ canvas, webgl: 1, dpr: 1, depth: false, antialias: false, powerPreference: 'low-power' });
      const gl = renderer.gl;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      if (info && /swiftshader|llvmpipe|software/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))) {
        throw new Error('Use bounded CPU grain instead of software WebGL');
      }
      geometry = new Triangle(gl);
      program = new Program(gl, { vertex, fragment, depthTest: false, depthWrite: false,
        uniforms: { uSeed: { value: 0 }, uSize: { value: 1 }, uTint: { value: [1,1,1] } } });
      if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) throw new Error('Grain shader unavailable');
      mesh = new Mesh(gl, { geometry, program });
      element.appendChild(canvas);
      element.dataset.engine = 'webgl';
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); if (!stopped) fallback(); }, { once: true });
      resize();
    } catch { fallback(); }
    const draw = now => {
      if (stopped || document.hidden) return;
      frame = requestAnimationFrame(draw);
      if (now - last < 1000 / 24) return;
      last = now - ((now - last) % (1000 / 24) || 0);
      // A random seed changes the exposure itself, rather than translating a cached tile.
      crypto.getRandomValues(random);
      if (renderer) {
        program.uniforms.uSeed.value = random[0] / 131072;
        program.uniforms.uSize.value = options.current.size * scale;
        program.uniforms.uTint.value = options.current.rose ? [1, 0.75, 0.9] : [1,1,1];
        renderer.render({ scene: mesh });
      } else if (ctx && pixels) {
        if (fallbackSize !== options.current.size) { fallbackSize = options.current.size; resize(); }
        let state = random[0] || 1;
        for (let i = 0; i < pixels.data.length; i += 4) {
          state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
          const value = 128 + ((state >>> 24) - 128) * 0.5;
          pixels.data[i] = value;
          pixels.data[i+1] = options.current.rose ? 128 + (value-128)*0.75 : value;
          pixels.data[i+2] = options.current.rose ? 128 + (value-128)*0.9 : value;
          pixels.data[i+3] = 255;
        }
        ctx.putImageData(pixels, 0, 0);
      }
    };
    const visibility = () => { cancelAnimationFrame(frame); if (!document.hidden) { last = -Infinity; frame = requestAnimationFrame(draw); } };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    document.addEventListener('visibilitychange', visibility);
    frame = requestAnimationFrame(draw);
    return () => {
      stopped = true; cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      canvas?.remove(); releaseGL(); pixels = null;
    };
  }, []);
  return <div ref={host} className="pouf-film-grain" aria-hidden="true" style={{ position:'absolute', inset:0,
    pointerEvents:'none', zIndex:9, opacity:Math.min(0.65,Math.max(0,intensity/100)*0.65), mixBlendMode:blend === 'overlay' ? 'overlay' : 'soft-light' }} />;
}
