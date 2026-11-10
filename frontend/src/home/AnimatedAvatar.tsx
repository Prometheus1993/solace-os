import { useEffect, useRef, useState } from 'react';
import { avatarUrl } from './avatar.ts';

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = vec2((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// Motion is restricted to the loose cloth left of the character. Face, torso,
// arms and boots retain the exact source pixels; no regenerated-frame drift.
const fragmentSource = `
precision mediump float;
uniform sampler2D artwork;
uniform float time;
varying vec2 uv;
void main() {
  vec2 p = uv;
  float vertical = smoothstep(0.045, 0.085, p.y) * (1.0 - smoothstep(0.35, 0.39, p.y));
  float edge = mix(0.55, 0.31, smoothstep(0.12, 0.24, p.y));
  float freeEnd = 1.0 - smoothstep(0.04, edge, p.x);
  float cloth = vertical * freeEnd * freeEnd;
  float phase = time * 1.35 - p.x * 8.0 + p.y * 5.0;
  p.y += cloth * (0.005 * sin(phase) + 0.002 * sin(phase * 2.0));
  p.x += cloth * 0.002 * sin(phase + 1.2);
  gl_FragColor = texture2D(artwork, p);
}`;

/** Continuous localized cloth motion from the unchanged v3 master.
 * No reduced-motion gating. Hidden/offscreen playback pauses.
 */
export function AnimatedAvatar() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = el.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) return;
    let disposed = false;
    let frame = 0;
    let visible = false;
    let loaded = false;
    let elapsed = 0;
    let previous = 0;
    const shaders: WebGLShader[] = [];
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    const release = () => {
      gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program);
      shaders.forEach(shader => gl.deleteShader(shader));
    };
    if (!vertex || !fragment || !program || !buffer || !texture) { release(); return; }
    gl.attachShader(program, vertex); gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { release(); return; }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const time = gl.getUniformLocation(program, 'time');
    const draw = (now: number) => {
      frame = 0;
      if (disposed || !loaded || !visible || document.hidden) { previous = 0; return; }
      if (previous) elapsed += Math.min(now - previous, 50) / 1000;
      previous = now;
      gl.uniform1f(time, elapsed);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frame = requestAnimationFrame(draw);
    };
    const resume = () => {
      if (!frame && loaded && visible && !document.hidden && !disposed) frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
    observer.observe(el);
    document.addEventListener('visibilitychange', resume);
    const img = new Image();
    img.onload = () => {
      if (disposed) return;
      // Match source aspect and cap render size; the enclosing figure is 2:3.
      el.width = Math.min(img.naturalWidth, 768);
      el.height = Math.round(el.width * img.naturalHeight / img.naturalWidth);
      gl.viewport(0, 0, el.width, el.height);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.uniform1f(time, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      loaded = true;
      setReady(true);
      resume();
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      loaded = false;
      cancelAnimationFrame(frame);
      frame = 0;
      setReady(false);
    };
    el.addEventListener('webglcontextlost', contextLost);
    img.src = avatarUrl;
    return () => {
      disposed = true; img.onload = null;
      cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('visibilitychange', resume);
      el.removeEventListener('webglcontextlost', contextLost);
      release();
    };
  }, []);
  return <span role="img" aria-label="Local session avatar with gently moving sash" style={{ display: 'block', position: 'relative', width: '100%', height: '100%' }}>
    <img src={avatarUrl} alt="" style={{ visibility: ready ? 'hidden' : 'visible' }} />
    <canvas ref={canvas} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', visibility: ready ? 'visible' : 'hidden' }} />
  </span>;
}
