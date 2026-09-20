/**
 * Conversión de animaciones MOV ProRes 4444 / 4444 XQ → WebM VP9 con alfa.
 * Tareas persistentes: el HTTP no espera a FFmpeg. Una sola conversión por job.
 */

const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAdminDb, firestoreConfigured } = require('./firestoreAdmin');

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'liveboom-app.firebasestorage.app';

const LIMITS = {
  /** Límite para WebM/MP4 publicados (referencia API). */
  maxBytes: 80 * 1024 * 1024,
  /**
   * Fuentes MOV ProRes 4444 Full HD antes de comprimir a WebM.
   */
  maxMovBytes: 650 * 1024 * 1024,
  maxDurationSec: 30,
  maxEdge: 1080,
  maxJobsPerGift: 1,
  ffmpegTimeoutMs: 900_000,
  staleRunningMs: 20 * 60 * 1000,
  progressFlushMs: 1200,
};

const JOBS = 'gift_alpha_jobs';
const GIFT_PTR = 'gift_alpha_gifts';
const LOCK_PATH = 'config/giftAlphaConvertLock';

const STAGE = {
  queued: 'queued',
  analyzing: 'analyzing',
  converting: 'converting',
  verifying: 'verifying',
  saving: 'saving',
  done: 'done',
  failed: 'failed',
};

const OPAQUE_ALPHA_WARNING =
  'El archivo no contiene transparencia utilizable. La conversión conservará su fondo.';

let encoderCache = null;

function getAdminBucket() {
  getAdminDb();
  return getStorage().bucket(STORAGE_BUCKET);
}

function safeGiftId(raw) {
  const value = String(raw || '').trim();
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(value)) return null;
  return value;
}

function safeGiftSourcePath(raw) {
  const value = String(raw || '')
    .trim()
    .replace(/^\/+/, '');
  if (!value.startsWith('config/gifts/')) return null;
  if (value.includes('..') || value.includes('\\') || value.includes('\0')) return null;
  if (!/\.mov$/i.test(value)) return null;
  if (value.split('/').length !== 3) return null;
  return value;
}

function downloadUrlFor(bucketName, objectPath, token) {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
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
  try {
    const packed = require('ffprobe-static');
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
      const err = new Error((stderr || stdout).trim().slice(-1500) || `${path.basename(bin)} salió con código ${code}`);
      err.code = 'FFMPEG_FAIL';
      reject(err);
    });
  });
}

function pixFmtHasAlpha(pixFmt) {
  const p = String(pixFmt || '').toLowerCase();
  if (!p) return false;
  return (
    p.includes('yuva') ||
    p.includes('rgba') ||
    p.includes('argb') ||
    p.includes('abgr') ||
    p.includes('bgra') ||
    p.includes('gbrap') ||
    p.includes('ya8') ||
    p.includes('ya16') ||
    p.includes('pal8') ||
    /(^|[^a-z])a(8|16|64)/.test(p)
  );
}

function streamReportsAlpha(stream) {
  if (!stream) return false;
  if (pixFmtHasAlpha(stream.pix_fmt)) return true;
  const tags = stream.tags && typeof stream.tags === 'object' ? stream.tags : {};
  const mode = String(tags.ALPHA_MODE || tags.alpha_mode || tags.ALPHA || '').toLowerCase();
  if (mode === '1' || mode === 'true' || mode === 'yes') return true;
  const sides = Array.isArray(stream.side_data_list) ? stream.side_data_list : [];
  return sides.some((item) => /alpha/i.test(String(item?.side_data_type || item?.type || '')));
}

/** VP9/WebM a menudo reporta yuv420p y guarda el alfa como tag o segunda pista. */
function probeReportsAlpha(probe) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const videos = streams.filter((s) => s && s.codec_type === 'video');
  if (videos.some(streamReportsAlpha)) return true;
  return videos.length >= 2;
}

function classifyProRes(stream) {
  const codec = String(stream?.codec_name || '').toLowerCase();
  if (codec !== 'prores') {
    return { ok: false, profile: codec || null, label: codec || 'desconocido' };
  }
  const tag = String(stream.codec_tag_string || '').toLowerCase();
  const profileRaw = stream.profile;
  const profile = String(profileRaw == null ? '' : profileRaw);
  const lower = profile.toLowerCase();
  const n = Number(profileRaw);
  if (tag === 'ap4x' || /4444\s*xq/i.test(profile) || lower.includes('xq') || n === 5) {
    return { ok: true, profile: '4444XQ', label: 'ProRes 4444 XQ' };
  }
  if (tag === 'ap4h' || /4444/.test(profile) || n === 4) {
    return { ok: true, profile: '4444', label: 'ProRes 4444' };
  }
  return { ok: false, profile: profile || tag || 'prores', label: profile || tag || 'ProRes' };
}

function streamIsAudio(stream) {
  if (!stream || typeof stream !== 'object') return false;
  if (String(stream.codec_type || '') === 'audio') return true;
  const name = String(stream.codec_name || '').toLowerCase();
  return /^(aac|opus|mp3|pcm|flac|alac|ac3|eac3|vorbis|mp2|wmav)/.test(name);
}

function probeHasAudio(probe) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  return streams.some(streamIsAudio);
}

function inspectProbe(probe) {
  const format = probe && typeof probe === 'object' ? probe.format || {} : {};
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = streams.find((s) => s && s.codec_type === 'video') || null;
  const audio = streams.find(streamIsAudio) || null;
  const formatName = String(format.format_name || '').toLowerCase();
  const containerOk = /mov|mp4|quicktime/.test(formatName);
  const durationSec = Number(video?.duration || format.duration || 0);
  const width = Number(video?.width || 0);
  const height = Number(video?.height || 0);
  const pixFmt = String(video?.pix_fmt || '');
  const hasAlphaChannel = pixFmtHasAlpha(pixFmt);
  const prores = classifyProRes(video);
  const nbFrames = Number(video?.nb_frames || 0);

  let error = null;
  if (!video) error = 'El archivo no contiene una pista de video.';
  else if (!containerOk) error = 'Solo se admite contenedor MOV (QuickTime) para esta conversión.';
  else if (!(width >= 2 && height >= 2)) error = 'La resolución del video no es válida.';
  else if (durationSec > LIMITS.maxDurationSec + 0.35) {
    error = `La animación supera ${LIMITS.maxDurationSec} s (duración ${durationSec.toFixed(1)} s).`;
  }

  return {
    container: formatName,
    codec: String(video?.codec_name || ''),
    profile: prores.profile,
    profileLabel: prores.label,
    isProRes4444: prores.ok,
    width,
    height,
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    pixFmt,
    hasAlphaChannel,
    hasAudio: Boolean(audio),
    nbFrames: Number.isFinite(nbFrames) ? nbFrames : 0,
    error,
  };
}

function parseFfmpegProgress(buffer, durationSec) {
  const text = String(buffer || '');
  const usMatch = text.match(/out_time_us=(\d+)/g);
  const msMatch = text.match(/out_time_ms=(\d+)/g);
  let outUs = null;
  if (usMatch && usMatch.length) {
    outUs = Number(String(usMatch[usMatch.length - 1]).split('=')[1]);
  } else if (msMatch && msMatch.length) {
    outUs = Number(String(msMatch[msMatch.length - 1]).split('=')[1]) * 1000;
  }
  const ended = /progress=end/.test(text);
  if (!(durationSec > 0) || !(outUs > 0)) {
    return { percent: null, indeterminate: true, ended };
  }
  const raw = (outUs / (durationSec * 1e6)) * 100;
  const percent = Math.max(0, Math.min(99, Math.round(raw)));
  return { percent, indeterminate: false, ended };
}

function parseSignalStats(stderr) {
  const text = String(stderr || '');
  const mins = [...text.matchAll(/YMIN(?:\.f)?=([\d.]+)/g)].map((m) => Number(m[1]));
  const maxs = [...text.matchAll(/YMAX(?:\.f)?=([\d.]+)/g)].map((m) => Number(m[1]));
  const mean = [...text.matchAll(/YAVERAGE(?:\.f)?=([\d.]+)/g)].map((m) => Number(m[1]));
  if (!mins.length && !maxs.length) return null;
  const ymin = mins.length ? Math.min(...mins) : null;
  const ymax = maxs.length ? Math.max(...maxs) : null;
  const yavg = mean.length ? mean.reduce((a, b) => a + b, 0) / mean.length : null;
  return { ymin, ymax, yavg };
}

function classifyAlphaSamples(stats) {
  if (!stats) return { usable: null, opaque: null };
  const { ymin, ymax } = stats;
  if (ymin == null || ymax == null) return { usable: null, opaque: null };
  const opaque = ymin >= 250 && ymax >= 250;
  const fullyTransparent = ymax <= 5;
  const usable = !opaque && !fullyTransparent && ymax - ymin >= 8;
  return { usable: usable || (!opaque && ymax > 8), opaque, fullyTransparent };
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
    resultPath: doc.resultPath || null,
    hasAlpha: Boolean(doc.hasAlpha),
    alphaUsable: Boolean(doc.alphaUsable),
    profile: doc.profile || null,
    durationSec: doc.durationSec || 0,
    width: doc.width || 0,
    height: doc.height || 0,
    sourceBytes: doc.sourceBytes || 0,
    fileName: doc.fileName || null,
    keepAudio: doc.keepAudio !== false,
    hasAudio: doc.hasAudio == null ? null : Boolean(doc.hasAudio),
  };
}

async function writeJob(jobId, patch) {
  const db = getAdminDb();
  const payload = {
    ...patch,
    updatedAtMs: Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.collection(JOBS).doc(jobId).set(payload, { merge: true });
  if (patch.giftId || patch.status || patch.url || patch.error) {
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
}

async function readJob(jobId) {
  if (!jobId) return null;
  const snap = await getAdminDb().collection(JOBS).doc(String(jobId)).get();
  return snap.exists ? { jobId: snap.id, ...snap.data() } : null;
}

async function ensureVp9Encoder() {
  if (encoderCache) return encoderCache;
  const bin = ffmpegBin();
  if (!bin) {
    const error = new Error('FFmpeg no está disponible en el servidor.');
    error.code = 'NO_FFMPEG';
    throw error;
  }
  const { stdout, stderr } = await runTool(bin, ['-hide_banner', '-encoders'], { timeoutMs: 20_000 });
  const text = `${stdout}\n${stderr}`;
  const hasVp9 = /libvpx-vp9/.test(text);
  const hasOpus = /libopus/.test(text);
  encoderCache = { hasVp9, hasOpus, bin };
  if (!hasVp9) {
    const error = new Error(
      'Este servidor no incluye el codificador libvpx-vp9. La conversión a WebM con transparencia no puede ejecutarse.',
    );
    error.code = 'NO_VP9';
    throw error;
  }
  return encoderCache;
}

async function probeFile(filePath) {
  const bin = ffprobeBin();
  if (!bin) {
    const error = new Error('ffprobe no está disponible en el servidor.');
    error.code = 'NO_FFPROBE';
    throw error;
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
    const error = new Error('No se pudo inspeccionar el archivo (ffprobe).');
    error.code = 'PROBE_FAIL';
    throw error;
  }
}

async function sampleAlpha(bin, filePath, decoderArgs = []) {
  try {
    const { stderr } = await runTool(
      bin,
      [
        '-hide_banner',
        '-nostdin',
        ...decoderArgs,
        '-i',
        filePath,
        '-an',
        '-vf',
        'alphaextract,format=gray,signalstats,metadata=print',
        '-frames:v',
        '8',
        '-f',
        'null',
        '-',
      ],
      { timeoutMs: 45_000 },
    );
    return classifyAlphaSamples(parseSignalStats(stderr));
  } catch {
    return { usable: null, opaque: null, fullyTransparent: null };
  }
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
  };
  return `scale='min(${maxEdge},iw)':'min(${maxEdge},ih)':force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
}

async function muxAudioOntoWebm(ffmpegPath, videoPath, audioSourcePath, destPath) {
  const attempts = [
    ['-c:a', 'libopus', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-application', 'audio'],
    ['-c:a', 'libopus', '-b:a', '96k', '-ac', '1', '-ar', '48000'],
  ];
  let lastError = new Error('No se pudo copiar el audio al WebM.');
  for (const audioArgs of attempts) {
    const muxed = `${destPath}.mux-try.webm`;
    try {
      await runTool(
        ffmpegPath,
        [
          '-hide_banner',
          '-nostdin',
          '-y',
          '-i',
          videoPath,
          '-i',
          audioSourcePath,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-c:v',
          'copy',
          ...audioArgs,
          '-f',
          'webm',
          muxed,
        ],
        { timeoutMs: 180_000 },
      );
      const probe = await probeFile(muxed);
      if (!probeHasAudio(probe)) {
        throw new Error('El mux no dejó pista de audio.');
      }
      fs.renameSync(muxed, destPath);
      return;
    } catch (error) {
      lastError = error;
      fs.rmSync(muxed, { force: true });
    }
  }
  const extracted = `${destPath}.audio.opus`;
  const muxed = `${destPath}.mux-try.webm`;
  try {
    await runTool(
      ffmpegPath,
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-i',
        audioSourcePath,
        '-vn',
        '-map',
        '0:a:0',
        '-c:a',
        'libopus',
        '-b:a',
        '128k',
        '-ac',
        '2',
        '-ar',
        '48000',
        extracted,
      ],
      { timeoutMs: 180_000 },
    );
    await runTool(
      ffmpegPath,
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-i',
        videoPath,
        '-i',
        extracted,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'copy',
        '-c:a',
        'copy',
        '-f',
        'webm',
        muxed,
      ],
      { timeoutMs: 180_000 },
    );
    const probe = await probeFile(muxed);
    if (!probeHasAudio(probe)) {
      throw new Error('El mux no dejó pista de audio.');
    }
    fs.renameSync(muxed, destPath);
    return;
  } catch (error) {
    lastError = error;
  } finally {
    fs.rmSync(extracted, { force: true });
    fs.rmSync(muxed, { force: true });
  }
  throw Object.assign(
    new Error(lastError instanceof Error ? lastError.message : 'No se pudo conservar el audio.'),
    { code: 'AUDIO' },
  );
}

async function convertWithProgress({
  ffmpegPath,
  tmpIn,
  tmpOut,
  inspect,
  keepAudio,
  hasAlpha,
  encoder = 'libvpx-vp9',
  onProgress,
}) {
  const vfParts = [];
  const scale = scaleFilter(inspect.width, inspect.height);
  if (scale) vfParts.push(scale);
  vfParts.push(hasAlpha ? 'format=yuva420p' : 'format=yuv420p');
  const wantAudio = keepAudio !== false && Boolean(inspect.hasAudio);
  const videoOnly = `${tmpOut}.vonly.webm`;
  const videoTarget = wantAudio ? videoOnly : tmpOut;

  const args = [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    tmpIn,
    '-map',
    '0:v:0',
    '-an',
    '-c:v',
    encoder,
    '-pix_fmt',
    hasAlpha ? 'yuva420p' : 'yuv420p',
    '-auto-alt-ref',
    '0',
    '-lag-in-frames',
    '0',
    '-b:v',
    '0',
    '-crf',
    encoder === 'libvpx' ? '22' : '20',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    '-row-mt',
    '1',
    '-threads',
    '2',
    '-vf',
    vfParts.join(','),
  ];
  if (hasAlpha) args.push('-metadata:s:v:0', 'alpha_mode=1');
  args.push('-progress', 'pipe:1', '-nostats', '-f', 'webm', videoTarget);

  let buf = '';
  let lastEmit = 0;
  try {
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

    if (wantAudio) {
      await muxAudioOntoWebm(ffmpegPath, videoOnly, tmpIn, tmpOut);
    }
  } finally {
    fs.rmSync(videoOnly, { force: true });
    fs.rmSync(`${tmpOut}.mux.webm`, { force: true });
  }
}

async function verifyWebm({ ffmpegPath, tmpOut, inspect, expectAlpha, expectAudio }) {
  const probe = await probeFile(tmpOut);
  const out = inspectProbe({
    ...probe,
    format: { ...(probe.format || {}), format_name: String(probe.format?.format_name || 'webm') },
  });
  const formatName = String(probe.format?.format_name || '').toLowerCase();
  const video = (probe.streams || []).find((s) => s.codec_type === 'video');
  if (!/webm/.test(formatName)) {
    throw Object.assign(new Error('El resultado no es un contenedor WebM.'), { code: 'VERIFY' });
  }
  if (!video) {
    throw Object.assign(new Error('El WebM no contiene pista de video.'), { code: 'VERIFY' });
  }
  const codec = String(video.codec_name || '').toLowerCase();
  if (codec !== 'vp9' && codec !== 'vp8') {
    throw Object.assign(new Error(`El WebM no usa VP9 (códec ${codec || 'vacío'}).`), { code: 'VERIFY' });
  }
  const pixFmt = String(video.pix_fmt || '');
  const srcDur = inspect.durationSec || 0;
  const outDur = Number(video.duration || probe.format?.duration || 0);
  if (srcDur > 0.4 && outDur > 0 && Math.abs(outDur - srcDur) > Math.max(1.2, srcDur * 0.25)) {
    throw Object.assign(new Error('La duración del WebM no coincide con el original.'), { code: 'VERIFY' });
  }

  if (expectAudio) {
    if (!probeHasAudio(probe)) {
      throw Object.assign(new Error('La conversión no conservó el audio original.'), { code: 'AUDIO' });
    }
  }

  const decoderHint = codec === 'vp8' ? ['-c:v', 'libvpx'] : ['-c:v', 'libvpx-vp9'];
  await runTool(
    ffmpegPath,
    ['-hide_banner', '-nostdin', ...decoderHint, '-i', tmpOut, '-frames:v', '3', '-f', 'null', '-'],
    { timeoutMs: 40_000 },
  ).catch(() =>
    runTool(
      ffmpegPath,
      ['-hide_banner', '-nostdin', '-i', tmpOut, '-frames:v', '3', '-f', 'null', '-'],
      { timeoutMs: 40_000 },
    ),
  );

  let alpha = { usable: null, opaque: null };
  if (expectAlpha) {
    const reportedAlpha = probeReportsAlpha(probe) || pixFmtHasAlpha(pixFmt);
    alpha = await sampleAlpha(ffmpegPath, tmpOut, decoderHint);
    if (alpha.usable === false && alpha.opaque) {
      return { out, pixFmt, warning: OPAQUE_ALPHA_WARNING, alpha };
    }
    if (alpha.usable === false && alpha.fullyTransparent) {
      throw Object.assign(new Error('El WebM quedó sin cobertura visible (alfa vacío).'), { code: 'VERIFY' });
    }
    const kept = reportedAlpha || alpha.usable === true;
    if (!kept) {
      throw Object.assign(new Error('La conversión no conservó el canal alfa.'), { code: 'VERIFY' });
    }
  }
  return { out, pixFmt, warning: null, alpha };
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
    if (until > now && owner && owner !== jobId) {
      return false;
    }
    tx.set(
      ref,
      {
        jobId,
        lockedUntilMs: now + LIMITS.ffmpegTimeoutMs + 30_000,
        updatedAt: FieldValue.serverTimestamp(),
      },
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

async function enqueueGiftAlphaJob({ storagePath, giftId, createdByUid, keepAudio, fileName, clientNonce }) {
  const sourcePath = safeGiftSourcePath(storagePath);
  if (!sourcePath) {
    const error = new Error('Ruta MOV inválida');
    error.code = 'INVALID_PATH';
    throw error;
  }
  let gid = safeGiftId(giftId);
  if (!gid) {
    const inferred = String(sourcePath).match(/^config\/gifts\/([a-zA-Z0-9_]+)-video-/);
    gid = inferred ? safeGiftId(inferred[1]) : null;
  }
  if (!gid) {
    const error = new Error('Regalo inválido');
    error.code = 'INVALID_GIFT';
    throw error;
  }

  const bucket = getAdminBucket();
  const sourceFile = bucket.file(sourcePath);
  const [exists] = await sourceFile.exists();
  if (!exists) {
    const error = new Error('No se encontró el MOV en Storage');
    error.code = 'NOT_FOUND';
    throw error;
  }
  const [meta] = await sourceFile.getMetadata();
  const size = Number(meta.size || 0);
  if (size > LIMITS.maxMovBytes) {
    const error = new Error(`El MOV supera ${Math.round(LIMITS.maxMovBytes / (1024 * 1024))} MB`);
    error.code = 'TOO_LARGE';
    throw error;
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
  const destPath = `config/gifts/${gid}-video-${Date.now()}-${jobId.slice(0, 8)}.webm`;
  const privatePath = `admin/private/gifts/${gid}/${jobId}.mov`;

  await writeJob(jobId, {
    jobId,
    giftId: gid,
    sourcePath,
    destPath,
    privatePath,
    createdByUid: String(createdByUid || ''),
    status: 'queued',
    stage: STAGE.queued,
    progressPercent: null,
    indeterminate: true,
    warning: null,
    error: null,
    url: null,
    resultPath: null,
    keepAudio: keepAudio !== false,
    fileName: String(fileName || '').slice(0, 180) || null,
    sourceBytes: size,
    generation: String(meta.generation || ''),
    clientNonce: nonce || null,
    createdAtMs: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  });

  return publicJob(await readJob(jobId));
}

async function processGiftAlphaJob(jobId) {
  if (!firestoreConfigured()) return { skipped: true };
  const id = String(jobId || '');
  const job = await readJob(id);
  if (!job) return { skipped: true };
  if (job.status === 'done') return publicJob(job);
  if (job.status === 'failed' && job.stage === STAGE.failed && !job.retry) return publicJob(job);
  if (job.status === 'running' && Date.now() - Number(job.updatedAtMs || 0) < LIMITS.staleRunningMs) {
    return publicJob(job);
  }

  const locked = await acquireLock(id);
  if (!locked) return { skipped: true, reason: 'busy' };

  const ffmpegPath = ffmpegBin();
  const tmpId = randomUUID();
  const tmpIn = path.join(os.tmpdir(), `gift-alpha-${tmpId}.mov`);
  const tmpOut = path.join(os.tmpdir(), `gift-alpha-${tmpId}.webm`);

  try {
    await ensureVp9Encoder();
    await writeJob(id, { status: 'running', stage: STAGE.analyzing, progressPercent: null, indeterminate: true });

    const bucket = getAdminBucket();
    let sourceFile = bucket.file(job.sourcePath);
    const [exists] = await sourceFile.exists();
    if (!exists && job.privatePath) {
      const archived = bucket.file(job.privatePath);
      const [archOk] = await archived.exists();
      if (archOk) sourceFile = archived;
    }
    const [stillThere] = await sourceFile.exists();
    if (!stillThere) {
      const error = new Error('No se encontró el MOV en Storage');
      error.code = 'NOT_FOUND';
      throw error;
    }

    await sourceFile.download({ destination: tmpIn });
    const probe = await probeFile(tmpIn);
    const inspect = inspectProbe(probe);
    if (inspect.error) {
      const error = new Error(inspect.error);
      error.code = 'UNSUPPORTED';
      throw error;
    }

    const srcAlpha = inspect.hasAlphaChannel
      ? await sampleAlpha(ffmpegPath, tmpIn)
      : { usable: false, opaque: true, fullyTransparent: false };

    let warning = null;
    let expectAlpha = Boolean(inspect.hasAlphaChannel && srcAlpha.usable !== false && !srcAlpha.opaque);
    if (!inspect.hasAlphaChannel) {
      warning = OPAQUE_ALPHA_WARNING;
      expectAlpha = false;
    } else if (srcAlpha.opaque) {
      warning = OPAQUE_ALPHA_WARNING;
      expectAlpha = false;
    } else if (srcAlpha.usable === false) {
      warning = OPAQUE_ALPHA_WARNING;
      expectAlpha = false;
    }

    if (!inspect.isProRes4444) {
      warning = warning
        ? `${warning} El códec no es ProRes 4444/XQ; se convierte como animación opaca.`
        : 'El archivo no es ProRes 4444 ni 4444 XQ. La conversión conservará su fondo.';
    }

    await writeJob(id, {
      stage: STAGE.converting,
      progressPercent: 0,
      indeterminate: !(inspect.durationSec > 0),
      warning,
      hasAlpha: Boolean(expectAlpha),
      alphaUsable: Boolean(expectAlpha),
      profile: inspect.profile,
      durationSec: inspect.durationSec,
      width: inspect.width,
      height: inspect.height,
    });

    await convertWithProgress({
      ffmpegPath,
      tmpIn,
      tmpOut,
      inspect,
      keepAudio: job.keepAudio !== false,
      hasAlpha: expectAlpha,
      encoder: 'libvpx-vp9',
      onProgress: (info) => {
        writeJob(id, {
          stage: STAGE.converting,
          progressPercent: info.percent,
          indeterminate: Boolean(info.indeterminate),
        }).catch(() => {});
      },
    });

    const outStat = fs.statSync(tmpOut);
    if (!outStat.size) {
      throw Object.assign(new Error('La conversión no produjo video'), { code: 'EMPTY' });
    }

    await writeJob(id, { stage: STAGE.verifying, progressPercent: 99, indeterminate: true });
    let verified;
    try {
      verified = await verifyWebm({
        ffmpegPath,
        tmpOut,
        inspect,
        expectAlpha,
        expectAudio: job.keepAudio !== false && inspect.hasAudio,
      });
    } catch (verifyError) {
      if (!(expectAlpha && verifyError && verifyError.code === 'VERIFY' && /alfa/i.test(String(verifyError.message)))) {
        throw verifyError;
      }
      console.warn('[gift-alpha] VP9 no dejó alfa visible, reintento VP8', verifyError.message);
      await convertWithProgress({
        ffmpegPath,
        tmpIn,
        tmpOut,
        inspect,
        keepAudio: job.keepAudio !== false,
        hasAlpha: true,
        encoder: 'libvpx',
        onProgress: (info) => {
          writeJob(id, {
            stage: STAGE.converting,
            progressPercent: info.percent,
            indeterminate: Boolean(info.indeterminate),
          }).catch(() => {});
        },
      });
      verified = await verifyWebm({
        ffmpegPath,
        tmpOut,
        inspect,
        expectAlpha,
        expectAudio: job.keepAudio !== false && inspect.hasAudio,
      });
    }
    if (verified.warning) warning = verified.warning;

    await writeJob(id, { stage: STAGE.saving, progressPercent: 99, indeterminate: true });
    const token = randomUUID();
    const destPath = job.destPath;
    await bucket.upload(tmpOut, {
      destination: destPath,
      metadata: {
        contentType: 'video/webm',
        cacheControl: 'public,max-age=3600',
        metadata: {
          firebaseStorageDownloadTokens: token,
          source: 'alpha-mov-4444',
          giftId: job.giftId,
          jobId: id,
        },
      },
    });

    try {
      await bucket.upload(tmpIn, {
        destination: job.privatePath,
        metadata: {
          contentType: 'video/quicktime',
          metadata: {
            giftId: job.giftId,
            jobId: id,
            original: '1',
          },
        },
      });
      try {
        if (sourceFile.name !== job.privatePath) {
          await sourceFile.delete({ ignoreNotFound: true });
        }
      } catch {
        /* el WebM público es el activo */
      }
    } catch (copyErr) {
      console.warn('[gift-alpha] no se pudo archivar el MOV original', copyErr.message);
    }

    const url = downloadUrlFor(bucket.name, destPath, token);
    await writeJob(id, {
      status: 'done',
      stage: STAGE.done,
      progressPercent: 100,
      indeterminate: false,
      url,
      resultPath: destPath,
      warning,
      error: null,
      hasAlpha: Boolean(expectAlpha),
      alphaUsable: Boolean(expectAlpha && !verified.warning),
      hasAudio: job.keepAudio === false ? false : Boolean(inspect.hasAudio),
    });
    return publicJob(await readJob(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo convertir el MOV';
    await writeJob(id, {
      status: 'failed',
      stage: STAGE.failed,
      progressPercent: null,
      indeterminate: false,
      error: message.slice(0, 500),
    });
    throw error;
  } finally {
    fs.rmSync(tmpIn, { force: true });
    fs.rmSync(tmpOut, { force: true });
    await releaseLock(id);
  }
}

const RESTORE = 'gift_audio_restore';
const CATALOG_PATH = 'config/giftsCatalog';

function isGiftStoragePath(value) {
  const decoded = String(value || '').split('?')[0];
  if (decoded.includes('..') || decoded.includes('\\') || decoded.includes('\0')) return false;
  return decoded.startsWith('config/gifts/') || decoded.startsWith('admin/private/gifts/');
}

function storagePathFromGiftUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (isGiftStoragePath(raw)) return raw.split('?')[0];
  try {
    const oMatch = raw.match(/\/o\/([^?&#]+)/);
    if (oMatch) {
      const decoded = decodeURIComponent(oMatch[1]);
      if (isGiftStoragePath(decoded)) return decoded.split('?')[0];
    }
    const gs = raw.match(/^gs:\/\/[^/]+\/(.+)$/);
    if (gs) {
      const decoded = decodeURIComponent(gs[1].split('?')[0]);
      if (isGiftStoragePath(decoded)) return decoded;
    }
    const hosted = raw.match(
      /(?:liveboom-app(?:\.firebasestorage\.app|\.appspot\.com)|storage\.googleapis\.com\/liveboom-app(?:\.firebasestorage\.app|\.appspot\.com))\/(.+)$/i,
    );
    if (hosted) {
      const decoded = decodeURIComponent(hosted[1].split('?')[0]);
      if (isGiftStoragePath(decoded)) return decoded;
    }
  } catch {
    return null;
  }
  return null;
}

async function listGiftStorageFiles(bucket, giftId) {
  const prefixes = [`admin/private/gifts/${giftId}/`, `config/gifts/${giftId}`];
  const files = [];
  for (const prefix of prefixes) {
    const [batch] = await bucket.getFiles({ prefix });
    files.push(...(batch || []));
  }
  const seen = new Set();
  const unique = files.filter((file) => {
    if (!file?.name || seen.has(file.name)) return false;
    seen.add(file.name);
    return true;
  });
  const newest = (a, b) => String(b.name).localeCompare(String(a.name));
  return {
    webms: unique.filter((file) => /\.webm$/i.test(file.name)).sort(newest),
    audios: unique
      .filter((file) => /\.(mov|mp4|m4a|aac|webm)$/i.test(file.name))
      .sort(newest),
  };
}

function catalogMediaUrls(gift) {
  return [gift?.video, gift?.media?.processedAsset, gift?.media?.originalAsset].filter(Boolean);
}

async function patchCatalogGiftAudio(db, giftId, { videoUrl, replaceVideo = false }) {
  const ref = db.doc(CATALOG_PATH);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const gifts = Array.isArray(snap.data()?.gifts) ? snap.data().gifts : [];
    let changed = false;
    const next = gifts.map((gift) => {
      if (String(gift?.id || '') !== giftId) return gift;
      changed = true;
      const media = gift.media && typeof gift.media === 'object' ? { ...gift.media } : {};
      media.hasAudio = true;
      const localVideo = !gift.video || String(gift.video).startsWith('/');
      const canReplace =
        Boolean(replaceVideo && videoUrl) &&
        (localVideo || Boolean(storagePathFromGiftUrl(gift.video)));
      if (canReplace) media.originalAsset = media.originalAsset || videoUrl;
      return {
        ...gift,
        video: canReplace ? videoUrl : gift.video,
        media,
      };
    });
    if (!changed) return;
    tx.set(ref, { gifts: next, audioRestoredAtMs: Date.now() }, { merge: true });
  });
}

async function restoreGiftAudioFromStorage({ ffmpegPath, bucket, db, gift, force }) {
  const gid = safeGiftId(gift?.id);
  if (!gid) return { giftId: null, skipped: true };
  const markerRef = db.collection(RESTORE).doc(gid);
  const prev = await markerRef.get();
  const prevData = prev.exists ? prev.data() || {} : {};
  const status = String(prevData.status || '');
  const prevReason = String(prevData.reason || '');
  if (
    !force &&
    (status === 'bundled' ||
      (status === 'ok' && prevReason !== 'already-has-audio') ||
      (status === 'skip' &&
        ['no-original-audio', 'nothing-to-restore', 'original-silent', 'invalid-webm'].includes(prevReason)))
  ) {
    return { giftId: gid, skipped: true, reason: status === 'skip' ? prevReason : status };
  }

  const listed = await listGiftStorageFiles(bucket, gid);
  const fromUrls = catalogMediaUrls(gift)
    .map((url) => storagePathFromGiftUrl(url))
    .filter((value) => value && /\.webm$/i.test(value))
    .map((name) => bucket.file(name));
  const webms = [];
  const seen = new Set();
  for (const file of [...fromUrls, ...listed.webms]) {
    if (!file?.name || seen.has(file.name) || !/\.webm$/i.test(file.name)) continue;
    if (!file.name.startsWith(`config/gifts/${gid}-`) && file.name !== `config/gifts/${gid}.webm`) continue;
    seen.add(file.name);
    webms.push(file);
  }

  if (!webms.length) {
    await markerRef.set(
      {
        status: 'bundled',
        reason: 'no-uploaded-webm',
        attempts: Number(prevData.attempts || 0) + 1,
        updatedAtMs: Date.now(),
      },
      { merge: true },
    );
    return { giftId: gid, skipped: true, reason: 'no-uploaded-webm' };
  }

  const audioCandidates = [
    ...listed.audios.filter((file) => /\.mov$/i.test(file.name)),
    ...listed.audios.filter((file) => file.name !== webms[0]?.name),
  ];

  const tmpId = randomUUID();
  const tmpWebm = path.join(os.tmpdir(), `gift-audio-${tmpId}.webm`);
  const tmpAudio = path.join(os.tmpdir(), `gift-audio-${tmpId}.src`);
  const tmpOut = path.join(os.tmpdir(), `gift-audio-${tmpId}.out.webm`);
  let restoredPaths = [];
  let already = [];
  try {
    let audioFile = null;
    for (const candidate of audioCandidates) {
      try {
        await candidate.download({ destination: tmpAudio });
        const probe = await probeFile(tmpAudio);
        if (probeHasAudio(probe)) {
          audioFile = candidate;
          break;
        }
      } catch {
        /* siguiente fuente */
      }
    }
    if (!audioFile) {
      await markerRef.set(
        {
          status: 'skip',
          reason: 'no-original-audio',
          attempts: Number(prevData.attempts || 0) + 1,
          updatedAtMs: Date.now(),
        },
        { merge: true },
      );
      return { giftId: gid, skipped: true, reason: 'no-original-audio' };
    }

    for (const webmFile of webms) {
      try {
        await webmFile.download({ destination: tmpWebm });
        const webmProbe = await probeFile(tmpWebm);
        if (probeHasAudio(webmProbe)) {
          already.push(webmFile.name);
          continue;
        }
        await muxAudioOntoWebm(ffmpegPath, tmpWebm, tmpAudio, tmpOut);
        const [meta] = await webmFile.getMetadata();
        const existingToken =
          (meta && meta.metadata && meta.metadata.firebaseStorageDownloadTokens) || randomUUID();
        await bucket.upload(tmpOut, {
          destination: webmFile.name,
          metadata: {
            contentType: 'video/webm',
            cacheControl: 'public, max-age=0, must-revalidate',
            metadata: {
              ...((meta && meta.metadata) || {}),
              firebaseStorageDownloadTokens: existingToken,
              audioRestored: '1',
            },
          },
        });
        restoredPaths.push(webmFile.name);
        console.log('[gift-alpha] audio restored', gid, webmFile.name);
      } catch (fileError) {
        const message = fileError instanceof Error ? fileError.message : String(fileError);
        console.warn('[gift-alpha] audio restore skip file', gid, webmFile.name, message.slice(0, 180));
      }
    }

    if (!restoredPaths.length && already.length) {
      const good = already[0];
      const [meta] = await bucket.file(good).getMetadata();
      const token =
        (meta && meta.metadata && meta.metadata.firebaseStorageDownloadTokens) || randomUUID();
      const videoUrl = downloadUrlFor(bucket.name, good, token);
      await patchCatalogGiftAudio(db, gid, { videoUrl, replaceVideo: true });
      await markerRef.set(
        { status: 'ok', reason: 'catalog-audio', path: good, attempts: Number(prevData.attempts || 0) + 1, updatedAtMs: Date.now() },
        { merge: true },
      );
      return { giftId: gid, restored: true, reason: 'already-has-audio', paths: [good] };
    }
    if (!restoredPaths.length) {
      await markerRef.set(
        { status: 'skip', reason: 'nothing-to-restore', attempts: Number(prevData.attempts || 0) + 1, updatedAtMs: Date.now() },
        { merge: true },
      );
      return { giftId: gid, skipped: true, reason: 'nothing-to-restore' };
    }

    const [meta] = await bucket.file(restoredPaths[0]).getMetadata();
    const token =
      (meta && meta.metadata && meta.metadata.firebaseStorageDownloadTokens) || randomUUID();
    const videoUrl = downloadUrlFor(bucket.name, restoredPaths[0], token);
    await patchCatalogGiftAudio(db, gid, { videoUrl, replaceVideo: true });
    await markerRef.set(
      {
        status: 'ok',
        reason: 'restored',
        path: restoredPaths.join(','),
        attempts: Number(prevData.attempts || 0) + 1,
        updatedAtMs: Date.now(),
      },
      { merge: true },
    );
    return { giftId: gid, restored: true, paths: restoredPaths };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[gift-alpha] audio restore', gid, message);
    await markerRef.set(
      { status: 'retry', reason: message.slice(0, 300), attempts: Number(prevData.attempts || 0) + 1, updatedAtMs: Date.now() },
      { merge: true },
    );
    return { giftId: gid, restored: false, error: message };
  } finally {
    fs.rmSync(tmpWebm, { force: true });
    fs.rmSync(tmpAudio, { force: true });
    fs.rmSync(tmpOut, { force: true });
  }
}

async function restoreSilentGiftAudio({ limit = 4, force = false } = {}) {
  if (!firestoreConfigured()) return { skipped: true };
  const ffmpegPath = ffmpegBin();
  if (!ffmpegPath) return { skipped: true, reason: 'no-ffmpeg' };
  const db = getAdminDb();
  const catalogSnap = await db.doc(CATALOG_PATH).get();
  const gifts = Array.isArray(catalogSnap.data()?.gifts) ? catalogSnap.data().gifts : [];
  const bucket = getAdminBucket();
  const results = [];
  const deadline = Date.now() + 420_000;
  let restoredCount = 0;
  for (const gift of gifts) {
    if (Date.now() > deadline || restoredCount >= limit) break;
    const row = await restoreGiftAudioFromStorage({ ffmpegPath, bucket, db, gift, force });
    if (!row || row.skipped) continue;
    results.push(row);
    if (row.restored) restoredCount += 1;
  }
  return {
    restored: results.filter((row) => row.restored).map((row) => row.giftId),
    errors: results.filter((row) => row.error),
    done: restoredCount < limit,
  };
}

async function restoreOneSilentGiftAudio() {
  return restoreSilentGiftAudio({ limit: 4, force: false });
}

async function processGiftAlphaQueue() {
  if (!firestoreConfigured()) return { skipped: true };
  const db = getAdminDb();
  const now = Date.now();
  const queued = await db.collection(JOBS).where('status', 'in', ['queued', 'retry']).limit(4).get();
  const running = await db.collection(JOBS).where('status', '==', 'running').limit(8).get();
  const stale = running.docs.filter((d) => now - Number(d.data()?.updatedAtMs || 0) > LIMITS.staleRunningMs);
  const ids = [
    ...queued.docs.map((d) => d.id),
    ...stale.map((d) => d.id),
  ];
  let convert = null;
  if (ids.length) {
    const jobId = ids[0];
    try {
      await processGiftAlphaJob(jobId);
      convert = { processed: 1, jobId };
    } catch (error) {
      console.error('[gift-alpha] queue', jobId, error.message);
      convert = { processed: 1, jobId, error: error.message };
    }
  }
  try {
    const restored = await restoreSilentGiftAudio({ limit: ids.length ? 2 : 4, force: false });
    return { ok: !convert?.error, processed: convert?.processed || 0, jobId: convert?.jobId || null, ...restored };
  } catch (error) {
    console.warn('[gift-alpha] audio restore queue', error.message);
    return {
      ok: !convert?.error,
      processed: convert?.processed || 0,
      jobId: convert?.jobId || null,
      restoreError: error.message,
    };
  }
}

async function retryGiftAlphaJob(jobId) {
  const job = await readJob(jobId);
  if (!job) {
    const error = new Error('Trabajo no encontrado');
    error.code = 'NOT_FOUND';
    throw error;
  }
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

function kickGiftAlphaJob(jobId) {
  if (process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.FUNCTION_NAME) {
    return;
  }
  setImmediate(() => {
    processGiftAlphaJob(jobId).catch((error) => {
      console.error('[gift-alpha] local process', jobId, error.message);
    });
  });
}

async function convertGiftAlphaMov({ storagePath, giftId, createdByUid, keepAudio, fileName, clientNonce }) {
  return enqueueGiftAlphaJob({ storagePath, giftId, createdByUid, keepAudio, fileName, clientNonce });
}

module.exports = {
  LIMITS,
  STAGE,
  OPAQUE_ALPHA_WARNING,
  safeGiftId,
  safeGiftSourcePath,
  pixFmtHasAlpha,
  streamReportsAlpha,
  probeReportsAlpha,
  probeHasAudio,
  streamIsAudio,
  classifyProRes,
  inspectProbe,
  parseFfmpegProgress,
  parseSignalStats,
  classifyAlphaSamples,
  publicJob,
  enqueueGiftAlphaJob,
  processGiftAlphaJob,
  processGiftAlphaQueue,
  retryGiftAlphaJob,
  readJob,
  convertGiftAlphaMov,
  kickGiftAlphaJob,
  storagePathFromGiftUrl,
  restoreSilentGiftAudio,
};
module.exports.default = module.exports;
