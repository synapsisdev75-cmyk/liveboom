/**
 * Quitar fondo de animaciones de regalo → WebM VP9 + alpha + Opus.
 * No modifica giftAlphaConvert (MOV 4444). Un archivo original + uno procesado.
 */

const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAdminDb, firestoreConfigured } = require('./firestoreAdmin');
const { LIMITS, safeGiftId, pixFmtHasAlpha, probeReportsAlpha, parseFfmpegProgress, sampleAlpha } = require('./giftAlphaConvert');

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'liveboom-app.firebasestorage.app';

const JOBS = 'gift_bg_jobs';
const GIFT_PTR = 'gift_bg_gifts';
const LOCK_PATH = 'config/giftBgRemoveLock';

const STAGE = {
  queued: 'queued',
  analyzing: 'analyzing',
  converting: 'converting',
  verifying: 'verifying',
  saving: 'saving',
  done: 'done',
  failed: 'failed',
};

function getAdminBucket() {
  getAdminDb();
  return getStorage().bucket(STORAGE_BUCKET);
}

function ffmpegBin() {
  try {
    const bin = require('ffmpeg-static');
    return bin && fs.existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

function ffprobeBin() {
  try {
    const packed = require('@ffprobe-installer/ffprobe');
    const bin = packed && packed.path;
    if (bin && fs.existsSync(bin)) return bin;
  } catch {
    /* ignore */
  }
  const ffmpeg = ffmpegBin();
  if (!ffmpeg) return null;
  const sibling = path.join(
    path.dirname(ffmpeg),
    process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
  );
  return fs.existsSync(sibling) ? sibling : null;
}

function runTool(bin, args, { timeoutMs = 60_000, onStdout, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const child = spawn(bin, args, { windowsHide: true, signal: ac.signal });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      if (stdout.length > 200_000) stdout = stdout.slice(-120_000);
      onStdout?.(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      stderr += text;
      if (stderr.length > 24_000) stderr = stderr.slice(-16_000);
      onStderr?.(text);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const err = new Error((stderr || stdout).trim().slice(-1500) || `${path.basename(bin)} salió ${code}`);
      err.code = 'FFMPEG_FAIL';
      reject(err);
    });
  });
}

function safeGiftMediaPath(raw) {
  const value = String(raw || '')
    .trim()
    .replace(/^\/+/, '');
  if (!value.startsWith('config/gifts/')) return null;
  if (value.includes('..') || value.includes('\\') || value.includes('\0')) return null;
  if (!/\.(mov|mp4|webm)$/i.test(value)) return null;
  if (value.split('/').length !== 3) return null;
  return value;
}

function downloadUrlFor(bucketName, objectPath, token) {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

function inspectMedia(probe) {
  const format = probe && typeof probe === 'object' ? probe.format || {} : {};
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = streams.find((s) => s && s.codec_type === 'video') || null;
  const audio = streams.find((s) => s && s.codec_type === 'audio') || null;
  const durationSec = Number(video?.duration || format.duration || 0);
  const width = Number(video?.width || 0);
  const height = Number(video?.height || 0);
  const fpsRaw = String(video?.avg_frame_rate || video?.r_frame_rate || '0');
  const [num, den] = fpsRaw.split('/').map((n) => Number(n));
  const fps = den ? num / den : Number(fpsRaw) || 0;
  let error = null;
  if (!video) error = 'El archivo no contiene una pista de video.';
  else if (!(width >= 2 && height >= 2)) error = 'La resolución del video no es válida.';
  else if (durationSec > LIMITS.maxDurationSec + 0.35) {
    error = `La animación supera ${LIMITS.maxDurationSec} s.`;
  }
  return {
    container: String(format.format_name || '').toLowerCase(),
    codec: String(video?.codec_name || ''),
    width,
    height,
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    fps: Number.isFinite(fps) ? fps : 0,
    pixFmt: String(video?.pix_fmt || ''),
    hasAlphaChannel: pixFmtHasAlpha(video?.pix_fmt) || probeReportsAlpha(probe),
    hasAudio: Boolean(audio),
    audioCodec: String(audio?.codec_name || ''),
    audioDuration: Number(audio?.duration || format.duration || 0),
    error,
  };
}

async function probeFile(filePath) {
  const bin = ffprobeBin();
  if (!bin) {
    throw Object.assign(new Error('ffprobe no está disponible.'), { code: 'NO_FFPROBE' });
  }
  const { stdout } = await runTool(
    bin,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ],
    { timeoutMs: 40_000 },
  );
  try {
    return JSON.parse(stdout);
  } catch {
    throw Object.assign(new Error('No se pudo inspeccionar el archivo.'), { code: 'PROBE_FAIL' });
  }
}

function colorDist(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function rgbHex({ r, g, b }) {
  const h = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `0x${h(r)}${h(g)}${h(b)}`;
}

function classifyBg(color) {
  if (color.g > 90 && color.g > color.r + 22 && color.g > color.b + 22) return 'green';
  if (color.r > 90 && color.r > color.g + 22 && color.r > color.b + 22) return 'red';
  if (color.r > 210 && color.g > 210 && color.b > 210) return 'white';
  if (color.r < 40 && color.g < 40 && color.b < 40) return 'black';
  return 'flat';
}

async function sampleCorner(ffmpegPath, src, ss, crop) {
  const tmp = path.join(os.tmpdir(), `gift-bg-sample-${randomUUID()}.rgb`);
  try {
    await runTool(
      ffmpegPath,
      [
        '-hide_banner',
        '-nostdin',
        '-ss',
        String(ss),
        '-i',
        src,
        '-frames:v',
        '1',
        '-vf',
        `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},format=rgb24`,
        '-f',
        'rawvideo',
        '-y',
        tmp,
      ],
      { timeoutMs: 25_000 },
    );
    const buf = fs.readFileSync(tmp);
    if (buf.length < 3) return null;
    let r = 0;
    let g = 0;
    let b = 0;
    const px = Math.floor(buf.length / 3);
    for (let i = 0; i < px; i += 1) {
      r += buf[i * 3];
      g += buf[i * 3 + 1];
      b += buf[i * 3 + 2];
    }
    return { r: Math.round(r / px), g: Math.round(g / px), b: Math.round(b / px) };
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

async function detectBackground(ffmpegPath, src, inspect) {
  const w = inspect.width;
  const h = inspect.height;
  const duration = Math.max(0.12, Number(inspect.durationSec) || 0.12);
  const times = [0.08, 0.42, 0.78].map((t) => Math.min(Math.max(0.02, duration * t), Math.max(0.02, duration - 0.04)));
  const cw = Math.max(4, Math.min(16, Math.floor(w * 0.04)));
  const ch = Math.max(4, Math.min(16, Math.floor(h * 0.04)));
  const insetX = Math.max(2, Math.floor(w * 0.02));
  const insetY = Math.max(2, Math.floor(h * 0.02));
  const spots = [
    { x: insetX, y: insetY, w: cw, h: ch },
    { x: w - insetX - cw, y: insetY, w: cw, h: ch },
    { x: insetX, y: h - insetY - ch, w: cw, h: ch },
    { x: w - insetX - cw, y: h - insetY - ch, w: cw, h: ch },
  ];
  const samples = [];
  for (const ss of times) {
    for (const crop of spots) {
      const rgb = await sampleCorner(ffmpegPath, src, ss, crop);
      if (rgb) samples.push(rgb);
    }
  }
  if (!samples.length) {
    return {
      color: { r: 0, g: 255, b: 0 },
      kind: 'green',
      uniform: false,
      warning: 'No se pudo muestrear el fondo; usa Ajustar o conserva el original.',
    };
  }
  const avg = samples.reduce(
    (acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b }),
    { r: 0, g: 0, b: 0 },
  );
  const color = {
    r: Math.round(avg.r / samples.length),
    g: Math.round(avg.g / samples.length),
    b: Math.round(avg.b / samples.length),
  };
  let maxD = 0;
  for (let i = 0; i < samples.length; i += 1) {
    for (let j = i + 1; j < samples.length; j += 1) {
      maxD = Math.max(maxD, colorDist(samples[i], samples[j]));
    }
  }
  const uniform = maxD < 48;
  const kind = classifyBg(color);
  let warning = uniform ? null : 'Fondo complejo: no se recortó en automático. Usa Ajustar.';
  if (uniform && (kind === 'black' || kind === 'white')) {
    warning = 'Fondo plano detectado. Revisa destellos y sombras; usa Ajustar si se recortó de más.';
  }
  return { color, kind, uniform, warning };
}

function buildKeyFilter({ hex, kind, similarity, blend }) {
  const sim = Math.min(0.42, Math.max(0.04, Number(similarity) || 0.16));
  const bl = Math.min(0.35, Math.max(0.02, Number(blend) || 0.08));
  if (kind === 'green' || kind === 'red') {
    return `chromakey=${hex}:${sim.toFixed(3)}:${bl.toFixed(3)},format=yuva420p`;
  }
  const conservative = kind === 'black' || kind === 'white';
  const sim2 = conservative ? Math.min(sim, 0.1) : sim;
  const bl2 = conservative ? Math.max(bl, 0.12) : bl;
  return `colorkey=${hex}:${sim2.toFixed(3)}:${bl2.toFixed(3)},format=yuva420p`;
}

function evenDim(value, maxEdge) {
  const n = Math.max(2, Math.min(maxEdge, Math.floor(Number(value) || 2)));
  return n % 2 === 0 ? n : n - 1;
}

function scaleFilter(width, height) {
  const maxEdge = LIMITS.maxEdge;
  if (width <= maxEdge && height <= maxEdge) {
    const w = evenDim(width, maxEdge);
    const h = evenDim(height, maxEdge);
    if (w === width && h === height) return null;
    return `scale=${w}:${h}:flags=lanczos`;
  }
  return `scale='min(${maxEdge},iw)':'min(${maxEdge},ih)':force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
}

function publicJob(doc) {
  if (!doc) return null;
  return {
    jobId: doc.jobId,
    giftId: doc.giftId,
    status: doc.status,
    stage: doc.stage,
    progressPercent: doc.progressPercent == null ? null : Number(doc.progressPercent),
    indeterminate: Boolean(doc.indeterminate),
    warning: doc.warning || null,
    error: doc.error || null,
    url: doc.url || null,
    hasAlpha: Boolean(doc.hasAlpha),
    alphaUsable: doc.alphaUsable == null ? null : Boolean(doc.alphaUsable),
    preservedOriginal: Boolean(doc.preservedOriginal),
    hasAudio: Boolean(doc.hasAudio),
    durationSec: doc.durationSec || 0,
    width: doc.width || 0,
    height: doc.height || 0,
    fps: doc.fps || 0,
    codec: doc.codec || 'vp9',
    fileName: doc.fileName || null,
  };
}

async function writeJob(jobId, patch) {
  const db = getAdminDb();
  await db.collection(JOBS).doc(jobId).set(
    {
      ...patch,
      updatedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  const snap = await db.collection(JOBS).doc(jobId).get();
  const data = snap.data() || {};
  const giftId = safeGiftId(data.giftId);
  if (giftId) {
    await db.collection(GIFT_PTR).doc(giftId).set(
      {
        latestJobId: jobId,
        status: data.status || patch.status || null,
        stage: data.stage || patch.stage || null,
        updatedAtMs: Date.now(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

async function readJob(jobId) {
  if (!jobId) return null;
  const snap = await getAdminDb().collection(JOBS).doc(String(jobId)).get();
  return snap.exists ? { jobId: snap.id, ...snap.data() } : null;
}

async function acquireLock(jobId) {
  const db = getAdminDb();
  const ref = db.doc(LOCK_PATH);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() : {};
    const until = Number(data.lockedUntilMs || 0);
    const owner = String(data.jobId || '');
    if (until > now && owner && owner !== jobId) return false;
    tx.set(
      ref,
      { jobId, lockedUntilMs: now + LIMITS.ffmpegTimeoutMs + 30_000, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return true;
  });
}

async function releaseLock(jobId) {
  const db = getAdminDb();
  const ref = db.doc(LOCK_PATH);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      if (String(snap.data()?.jobId || '') !== jobId) return;
      tx.delete(ref);
    });
  } catch {
    /* ignore */
  }
}

async function inspectStorageMedia(storagePath) {
  const sourcePath = safeGiftMediaPath(storagePath);
  if (!sourcePath) {
    throw Object.assign(new Error('Ruta de video inválida'), { code: 'INVALID_PATH' });
  }
  const ffmpegPath = ffmpegBin();
  if (!ffmpegPath) {
    throw Object.assign(new Error('FFmpeg no está disponible en el servidor.'), { code: 'NO_FFMPEG' });
  }
  const tmpIn = path.join(os.tmpdir(), `gift-inspect-${randomUUID()}${path.extname(sourcePath)}`);
  try {
    const file = getAdminBucket().file(sourcePath);
    const [exists] = await file.exists();
    if (!exists) throw Object.assign(new Error('No se encontró el archivo'), { code: 'NOT_FOUND' });
    await file.download({ destination: tmpIn });
    const inspect = inspectMedia(await probeFile(tmpIn));
    if (inspect.error) throw Object.assign(new Error(inspect.error), { code: 'UNSUPPORTED' });
    let alphaUsable = inspect.hasAlphaChannel ? true : null;
    let alphaWarning = null;
    if (inspect.hasAlphaChannel) {
      const sampled = await sampleAlpha(ffmpegPath, tmpIn);
      if (sampled.opaque) {
        alphaUsable = false;
        alphaWarning =
          'El archivo declara canal alfa, pero los fotogramas muestreados están opacos. Revisa el video; no se recortó el fondo.';
      } else if (sampled.fullyTransparent) {
        alphaUsable = true;
        alphaWarning =
          'El muestreo inicial salió vacío. Eso no significa que la animación esté vacía: la forma puede aparecer más tarde. Se conservó la transparencia.';
      } else if (sampled.usable === false) {
        alphaUsable = false;
        alphaWarning = 'No se pudo validar el canal alfa. Se conservó el original.';
      }
    }
    return {
      hasAudio: inspect.hasAudio,
      duration: inspect.durationSec,
      width: inspect.width,
      height: inspect.height,
      fps: Math.round(inspect.fps * 100) / 100,
      codec: inspect.codec,
      hasAlpha: inspect.hasAlphaChannel,
      alphaUsable,
      alphaWarning,
      storagePath: sourcePath,
    };
  } finally {
    try {
      fs.unlinkSync(tmpIn);
    } catch {
      /* ignore */
    }
  }
}

async function enqueueGiftBgJob({
  storagePath,
  giftId,
  createdByUid,
  fileName,
  clientNonce,
  mode,
  similarity,
  blend,
}) {
  const sourcePath = safeGiftMediaPath(storagePath);
  if (!sourcePath) {
    throw Object.assign(new Error('Ruta de video inválida'), { code: 'INVALID_PATH' });
  }
  const gid = safeGiftId(giftId);
  if (!gid) throw Object.assign(new Error('Regalo inválido'), { code: 'INVALID_GIFT' });

  const sourceFile = getAdminBucket().file(sourcePath);
  const [exists] = await sourceFile.exists();
  if (!exists) throw Object.assign(new Error('No se encontró el video'), { code: 'NOT_FOUND' });
  const [meta] = await sourceFile.getMetadata();
  const size = Number(meta.size || 0);
  if (size > LIMITS.maxMovBytes) {
    throw Object.assign(new Error('El archivo es demasiado grande'), { code: 'TOO_LARGE' });
  }

  const nonce = String(clientNonce || '').slice(0, 80);
  if (nonce) {
    const existing = await getAdminDb().collection(JOBS).where('clientNonce', '==', nonce).limit(1).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      return publicJob({ jobId: doc.id, ...doc.data() });
    }
  }

  const jobId = randomUUID();
  const destPath = `config/gifts/${gid}-transparent-${Date.now()}-${jobId.slice(0, 8)}.webm`;
  await writeJob(jobId, {
    jobId,
    giftId: gid,
    sourcePath,
    destPath,
    createdByUid: String(createdByUid || ''),
    status: 'queued',
    stage: STAGE.queued,
    progressPercent: null,
    indeterminate: true,
    keepAudio: true,
    mode: mode === 'adjust' ? 'adjust' : 'auto',
    similarity: Number(similarity) || null,
    blend: Number(blend) || null,
    fileName: String(fileName || '').slice(0, 180) || null,
    sourceBytes: size,
    clientNonce: nonce || null,
    createdAtMs: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  });
  return publicJob(await readJob(jobId));
}

async function convertKeyed({ ffmpegPath, tmpIn, tmpOut, inspect, vf, keepAudio, onProgress }) {
  const args = [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    tmpIn,
    '-map',
    '0:v:0',
  ];
  if (keepAudio && inspect.hasAudio) args.push('-map', '0:a:0?');
  args.push(
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuva420p',
    '-auto-alt-ref',
    '0',
    '-b:v',
    '0',
    '-crf',
    '20',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    '-row-mt',
    '1',
    '-threads',
    '2',
    '-vf',
    vf,
  );
  args.push('-metadata:s:v:0', 'alpha_mode=1');
  if (keepAudio && inspect.hasAudio) {
    args.push('-c:a', 'libopus', '-b:a', '96k', '-ac', '2');
  }
  args.push('-progress', 'pipe:1', '-nostats', '-f', 'webm', tmpOut);

  let buf = '';
  let lastEmit = 0;
  await runTool(ffmpegPath, args, {
    timeoutMs: LIMITS.ffmpegTimeoutMs,
    onStdout: (chunk) => {
      buf += chunk;
      if (buf.length > 8000) buf = buf.slice(-4000);
      const now = Date.now();
      if (now - lastEmit < LIMITS.progressFlushMs) return;
      lastEmit = now;
      onProgress?.(parseFfmpegProgress(buf, inspect.durationSec));
    },
  });
  onProgress?.({ percent: 99, indeterminate: false, ended: true });
}

async function processGiftBgJob(jobId) {
  if (!firestoreConfigured()) return { skipped: true };
  const id = String(jobId || '');
  const job = await readJob(id);
  if (!job) return { skipped: true };
  if (job.status === 'done') return publicJob(job);
  if (job.status === 'failed' && !job.retry) return publicJob(job);
  if (job.status === 'running' && Date.now() - Number(job.updatedAtMs || 0) < LIMITS.staleRunningMs) {
    return publicJob(job);
  }

  const locked = await acquireLock(id);
  if (!locked) return { skipped: true, reason: 'busy' };

  const ffmpegPath = ffmpegBin();
  const tmpId = randomUUID();
  const tmpIn = path.join(os.tmpdir(), `gift-bg-${tmpId}${path.extname(job.sourcePath || '.mp4')}`);
  const tmpOut = path.join(os.tmpdir(), `gift-bg-${tmpId}.webm`);

  try {
    if (!ffmpegPath) throw Object.assign(new Error('FFmpeg no está disponible.'), { code: 'NO_FFMPEG' });
    await writeJob(id, { status: 'running', stage: STAGE.analyzing, progressPercent: null, indeterminate: true });

    const sourceFile = getAdminBucket().file(job.sourcePath);
    const [exists] = await sourceFile.exists();
    if (!exists) throw Object.assign(new Error('No se encontró el video original.'), { code: 'NOT_FOUND' });
    await sourceFile.download({ destination: tmpIn });

    const inspect = inspectMedia(await probeFile(tmpIn));
    if (inspect.error) throw Object.assign(new Error(inspect.error), { code: 'UNSUPPORTED' });

    const srcPath = String(job.sourcePath || '').toLowerCase();
    const alreadyWebmAlpha =
      inspect.hasAlphaChannel && (srcPath.endsWith('.webm') || /^(vp8|vp9|libvpx)/.test(inspect.codec));

    if (alreadyWebmAlpha) {
      const [meta] = await sourceFile.getMetadata();
      let token = String(meta.metadata?.firebaseStorageDownloadTokens || '').split(',')[0];
      if (!token) {
        token = randomUUID();
        await sourceFile.setMetadata({
          metadata: { ...(meta.metadata || {}), firebaseStorageDownloadTokens: token },
        });
      }
      const url = downloadUrlFor(STORAGE_BUCKET, job.sourcePath, token);
      const sampled = await sampleAlpha(ffmpegPath, tmpIn);
      await writeJob(id, {
        status: 'done',
        stage: STAGE.done,
        progressPercent: 100,
        indeterminate: false,
        url,
        resultPath: job.sourcePath,
        preservedOriginal: true,
        hasAlpha: true,
        alphaUsable: sampled.usable !== false && !sampled.opaque,
        hasAudio: inspect.hasAudio,
        durationSec: inspect.durationSec,
        width: inspect.width,
        height: inspect.height,
        fps: inspect.fps,
        codec: inspect.codec,
        warning: sampled.opaque
          ? 'El archivo declara transparencia, pero los fotogramas muestreados están opacos. Se conservó el original; usa Ajustar solo si el fondo va pegado.'
          : sampled.fullyTransparent
            ? 'Hay canal alfa; el muestreo inicial salió vacío (la forma puede aparecer más tarde). Se conservó el original sin recortar.'
            : 'El original ya tenía transparencia real. Se conservó sin recortar ni reconvertir.',
        error: null,
      });
      return publicJob(await readJob(id));
    }

    const scale = scaleFilter(inspect.width, inspect.height);
    let vf;
    let warning = null;
    if (inspect.hasAlphaChannel) {
      vf = [scale, 'format=yuva420p'].filter(Boolean).join(',');
      warning = 'El original ya tenía transparencia; se pasó a WebM VP9 con alfa y se conservó el audio.';
    } else {
      const detected = await detectBackground(ffmpegPath, tmpIn, inspect);
      const mode = job.mode === 'adjust' ? 'adjust' : 'auto';
      if (mode === 'auto' && !detected.uniform) {
        throw Object.assign(
          new Error('Fondo complejo: no se recortó en automático. Usa Ajustar. El original sigue disponible.'),
          { code: 'NEEDS_ADJUST' },
        );
      }
      let similarity = Number(job.similarity);
      let blend = Number(job.blend);
      if (!Number.isFinite(similarity) || similarity <= 0) {
        similarity = detected.kind === 'green' || detected.kind === 'red' ? 0.14 : 0.16;
        if (mode === 'adjust') similarity = 0.12;
      }
      if (!Number.isFinite(blend) || blend <= 0) blend = mode === 'adjust' ? 0.12 : 0.08;
      const key = buildKeyFilter({
        hex: rgbHex(detected.color),
        kind: detected.kind,
        similarity,
        blend,
      });
      vf = [scale, key].filter(Boolean).join(',');
      warning = detected.warning;
    }

    await writeJob(id, {
      stage: STAGE.converting,
      progressPercent: 0,
      indeterminate: !(inspect.durationSec > 0),
      warning,
      hasAudio: inspect.hasAudio,
      durationSec: inspect.durationSec,
      width: inspect.width,
      height: inspect.height,
      fps: inspect.fps,
      codec: inspect.codec,
    });

    await convertKeyed({
      ffmpegPath,
      tmpIn,
      tmpOut,
      inspect,
      vf,
      keepAudio: true,
      onProgress: (info) => {
        writeJob(id, {
          stage: STAGE.converting,
          progressPercent: info.percent,
          indeterminate: Boolean(info.indeterminate),
        }).catch(() => {});
      },
    });

    await writeJob(id, { stage: STAGE.verifying, progressPercent: 99, indeterminate: true });
    const outProbe = await probeFile(tmpOut);
    const out = inspectMedia(outProbe);
    if (!out || !out.codec) throw Object.assign(new Error('El WebM no contiene video.'), { code: 'VERIFY' });
    if (!pixFmtHasAlpha(out.pixFmt) && !probeReportsAlpha(outProbe)) {
      throw Object.assign(new Error('La conversión no generó canal alpha. El original sigue disponible.'), {
        code: 'VERIFY',
      });
    }
    if (inspect.hasAudio && !out.hasAudio) {
      throw Object.assign(new Error('El WebM procesado quedó mudo. El original sigue disponible.'), {
        code: 'VERIFY',
      });
    }
    if (
      inspect.hasAudio &&
      inspect.durationSec > 0.4 &&
      out.audioDuration > 0 &&
      Math.abs(out.audioDuration - inspect.durationSec) > Math.max(1.2, inspect.durationSec * 0.25)
    ) {
      throw Object.assign(new Error('El audio y el video no coinciden en duración.'), { code: 'VERIFY' });
    }

    await writeJob(id, { stage: STAGE.saving, progressPercent: 99, indeterminate: true });
    const token = randomUUID();
    const destFile = getAdminBucket().file(job.destPath);
    await destFile.save(fs.readFileSync(tmpOut), {
      resumable: false,
      metadata: {
        contentType: 'video/webm',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    const url = downloadUrlFor(STORAGE_BUCKET, job.destPath, token);
    await writeJob(id, {
      status: 'done',
      stage: STAGE.done,
      progressPercent: 100,
      indeterminate: false,
      url,
      resultPath: job.destPath,
      preservedOriginal: false,
      hasAlpha: true,
      alphaUsable: true,
      hasAudio: out.hasAudio,
      durationSec: out.durationSec || inspect.durationSec,
      width: out.width,
      height: out.height,
      error: null,
    });
    return publicJob(await readJob(id));
  } catch (error) {
    await writeJob(id, {
      status: 'failed',
      stage: STAGE.failed,
      error: 'No se pudo quitar el fondo. El archivo original sigue disponible.',
      detail: error instanceof Error ? error.message : String(error),
      progressPercent: null,
      indeterminate: false,
    });
    throw error;
  } finally {
    try {
      fs.unlinkSync(tmpIn);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tmpOut);
    } catch {
      /* ignore */
    }
    await releaseLock(id);
  }
}

async function retryGiftBgJob(jobId) {
  const job = await readJob(jobId);
  if (!job) throw Object.assign(new Error('Trabajo no encontrado'), { code: 'NOT_FOUND' });
  if (job.status === 'done' && job.url) return publicJob(job);
  await writeJob(String(jobId), {
    status: 'queued',
    stage: STAGE.queued,
    error: null,
    retry: true,
    progressPercent: null,
    indeterminate: true,
  });
  return publicJob(await readJob(jobId));
}

function kickGiftBgJob(jobId) {
  if (process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.FUNCTION_NAME) return;
  setImmediate(() => {
    processGiftBgJob(jobId).catch((error) => {
      console.error('[gift-bg] local process', jobId, error.message);
    });
  });
}

async function giftHasActiveBgJob(giftId) {
  const gid = safeGiftId(giftId);
  if (!gid) return false;
  const ptr = await getAdminDb().collection(GIFT_PTR).doc(gid).get();
  const status = String(ptr.data()?.status || '');
  return status === 'queued' || status === 'retry' || status === 'running';
}

module.exports = {
  STAGE,
  safeGiftMediaPath,
  inspectMedia,
  inspectStorageMedia,
  detectBackground,
  buildKeyFilter,
  classifyBg,
  publicJob,
  readJob,
  enqueueGiftBgJob,
  processGiftBgJob,
  retryGiftBgJob,
  kickGiftBgJob,
  giftHasActiveBgJob,
};
module.exports.default = module.exports;
