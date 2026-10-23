/**
 * Reproducción transparente de regalos en WebKit (iPhone, iPad y Safari de Mac).
 * WebKit no aplica el alfa del WebM y pinta un fondo blanco. El archivo de iPhone
 * trae el color arriba y la máscara abajo; aquí se aplica esa máscara y el fondo
 * queda transparente, como el video con alfa en Android.
 */

import { Capacitor } from '@capacitor/core';

let cachedNeed: boolean | null = null;

/**
 * En iPhone el WebM no tiene alfa: se ve el fondo blanco. No hay vuelta a ese
 * archivo. Si la versión con máscara falla, ese regalo termina y el siguiente
 * vuelve a intentar la máscara.
 */
export function markStackedAlphaBroken() {
  /* se conserva la firma; ya no cambia el modo de reproducción */
}

function isWebKitWithoutWebmAlpha(): boolean {
  try {
    if (Capacitor.getPlatform() === 'ios') return true;
  } catch {
    /* sin runtime nativo */
  }
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
  if (iOS) return true;
  return /Safari\//.test(ua) && /AppleWebKit\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android/i.test(ua);
}

/**
 * Clave de caché propia para la petición CORS: los primeros MP4 se sirvieron sin CORS con
 * caché inmutable de 1 año, y el navegador reutilizaría esa copia sin cabeceras CORS.
 */
export function stackedAlphaRequestUrl(url: string): string {
  if (!url) return '';
  return `${url}${url.includes('?') ? '&' : '?'}lbcors=1`;
}

/** true en iPhone / iPad / Safari: usar la versión con máscara si el regalo la tiene. */
export function needsStackedAlphaVideo(): boolean {
  if (cachedNeed != null) return cachedNeed;
  cachedNeed = typeof document !== 'undefined' && isWebKitWithoutWebmAlpha();
  return cachedNeed;
}

export type StackedAlphaRenderer = {
  draw: (video: HTMLVideoElement) => boolean;
  dispose: () => void;
};

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

float expandLimited(float c) {
  return clamp((c - 16.0 / 255.0) * (255.0 / 219.0), 0.0, 1.0);
}

void main() {
  float y = min(vUv.y * 0.5, 0.5 - uHalfTexel);
  vec3 color = texture2D(uTex, vec2(vUv.x, y)).rgb;
  vec3 mask = texture2D(uTex, vec2(vUv.x, max(0.5 + vUv.y * 0.5, 0.5 + uHalfTexel))).rgb;
  float raw = expandLimited(dot(mask, vec3(0.299, 0.587, 0.114)));
  // En el iPhone real el 4:2:0 levanta un poco el negro de la máscara; el simulador no.
  float alpha = smoothstep(0.0, 0.04, raw);
  vec3 rgb = vec3(expandLimited(color.r), expandLimited(color.g), expandLimited(color.b));
  gl_FragColor = vec4(rgb * alpha, alpha);
}`;

/** El centro de muchos regalos es transparente; se mira varios puntos del cuadro. */
function frameHasGift(gl: WebGLRenderingContext, w: number, h: number): boolean {
  const pixel = new Uint8Array(4);
  const spots = [
    [0.5, 0.55],
    [0.5, 0.72],
    [0.35, 0.5],
    [0.65, 0.5],
    [0.5, 0.35],
  ];
  for (const spot of spots) {
    const sx = spot[0] ?? 0.5;
    const sy = spot[1] ?? 0.5;
    const x = Math.min(w - 1, Math.max(0, Math.floor(w * sx)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(h * sy)));
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    if ((pixel[3] ?? 0) > 12) return true;
  }
  return false;
}

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

type GpuState = {
  texture: WebGLTexture;
  uHalfTexel: WebGLUniformLocation | null;
};

function bindGpu(gl: WebGLRenderingContext): GpuState | null {
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
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.clearColor(0, 0, 0, 0);
  return { texture, uHalfTexel: gl.getUniformLocation(program, 'uHalfTexel') };
}

export function createStackedAlphaRenderer(canvas: HTMLCanvasElement): StackedAlphaRenderer | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;
  let gpu = bindGpu(gl);
  if (!gpu) return null;
  let boundW = 0;
  let boundH = 0;
  const frame = document.createElement('canvas');
  const frameCtx = frame.getContext('2d', { alpha: false, willReadFrequently: false });
  if (!frameCtx) return null;

  const upload = (video: HTMLVideoElement) => {
    gl.bindTexture(gl.TEXTURE_2D, gpu!.texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      return true;
    } catch {
      /* iOS a veces no deja pasar el video directo a WebGL */
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (frame.width !== vw || frame.height !== vh) {
      frame.width = vw;
      frame.height = vh;
    }
    frameCtx.fillStyle = '#000';
    frameCtx.fillRect(0, 0, vw, vh);
    try {
      frameCtx.drawImage(video, 0, 0, vw, vh);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
      return true;
    } catch {
      return false;
    }
  };

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
        gpu = bindGpu(gl);
        if (!gpu) return false;
      }
      if (!gpu) return false;
      if (boundW !== w || boundH !== h) {
        gl.viewport(0, 0, w, h);
        boundW = w;
        boundH = h;
      }
      if (!upload(video)) return false;
      gl.uniform1f(gpu.uHalfTexel, 0.5 / vh);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!frameHasGift(gl, w, h)) return true;
      canvas.classList.add('is-ready');
      return true;
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
