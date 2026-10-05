/**
 * Reproducción transparente de regalos en WebKit (iPhone, iPad y Safari de Mac).
 * WebKit no aplica el alfa de WebM VP9 y pinta el fondo; para esos navegadores el backend
 * genera un MP4 con el color arriba y la máscara abajo, que aquí se compone en WebGL.
 */

let cachedNeed: boolean | null = null;
let broken = false;

/** Si la versión stacked no carga (red / CORS), los siguientes regalos vuelven al WebM. */
export function markStackedAlphaBroken() {
  broken = true;
}

function isWebKitWithoutWebmAlpha(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
  if (iOS) return true;
  return /Safari\//.test(ua) && /AppleWebKit\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android/i.test(ua);
}

function webglAvailable(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl', { premultipliedAlpha: true });
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

/** true en iPhone / iPad / Safari: usar la versión stacked alpha si el regalo la tiene. */
export function needsStackedAlphaVideo(): boolean {
  if (broken) return false;
  if (cachedNeed != null) return cachedNeed;
  cachedNeed = typeof document !== 'undefined' && isWebKitWithoutWebmAlpha() && webglAvailable();
  return cachedNeed;
}

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D uTex;
uniform float uHalfTexel;
varying vec2 vUv;
void main() {
  float y = min(vUv.y * 0.5, 0.5 - uHalfTexel);
  vec3 color = texture2D(uTex, vec2(vUv.x, y)).rgb;
  float alpha = texture2D(uTex, vec2(vUv.x, max(0.5 + vUv.y * 0.5, 0.5 + uHalfTexel))).r;
  gl_FragColor = vec4(color * alpha, alpha);
}`;

export type StackedAlphaRenderer = {
  draw: (video: HTMLVideoElement) => boolean;
  dispose: () => void;
};

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createStackedAlphaRenderer(canvas: HTMLCanvasElement): StackedAlphaRenderer | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  const uHalfTexel = gl.getUniformLocation(program, 'uHalfTexel');
  gl.clearColor(0, 0, 0, 0);

  return {
    draw(video) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw < 2 || vh < 4 || video.readyState < 2) return false;
      const w = vw;
      const h = Math.floor(vh / 2);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'SecurityError') markStackedAlphaBroken();
        return false;
      }
      gl.uniform1f(uHalfTexel, 0.5 / vh);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    },
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
