/**
 * Versión iPhone / Safari de las animaciones de regalo.
 *
 * WebKit (iOS y Safari) no aplica el canal alfa de WebM VP9: pinta el fondo del video.
 * Para esos navegadores se genera un MP4 H.264 "stacked alpha": mitad superior = color,
 * mitad inferior = máscara de transparencia. El cliente lo compone en un canvas WebGL.
 * El WebM original no se toca; Android y PC lo siguen usando.
 */

const { createHash, randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getStorage } = require('firebase-admin/storage');
const { getAdminDb, firestoreConfigured } = require('./firestoreAdmin');
const { ffmpegBin, probeFile, safeGiftId } = require('./giftAlphaConvert');

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'liveboom-app.firebasestorage.app';
const CATALOG_PATH = 'config/giftsCatalog';
const MARKERS = 'gift_stacked_alpha';
const PUBLIC_ORIGIN = 'https://liveboomapp.com';
const MAX_ATTEMPTS = 3;
const MAX_SOURCE_BYTES = 120 * 1024 * 1024;
/** Lado mayor de cada mitad: 1280 mantiene el MP4 dentro de lo que decodifica cualquier iPhone. */
const MAX_HALF_EDGE = 1280;
const ENCODE_TIMEOUT_MS = 300_000;

function bucketRef() {
  getAdminDb();
  return getStorage().bucket(STORAGE_BUCKET);
}

function downloadUrlFor(bucketName, objectPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

/** Misma prioridad que giftPlaybackSrc() en el cliente. */
function playbackSrcFor(gift) {
  const media = gift && typeof gift.media === 'object' && gift.media ? gift.media : {};
  return String(media.processedAsset || gift?.video || media.originalAsset || '').trim();
}

function sourceHttpUrl(src) {
  if (!src) return null;
  if (src.startsWith('/') && !src.startsWith('//')) return `${PUBLIC_ORIGIN}${src}`;
  if (/^https:\/\//i.test(src)) return src;
  return null;
}

function stackedObjectPath(giftId, src) {
  const hash = createHash('sha1').update(src).digest('hex').slice(0, 12);
  return `config/gifts/${giftId}-ios-${hash}.mp4`;
}

function runFfmpeg(bin, args, timeoutMs) {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 16_000) stderr = stderr.slice(-8_000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(-800) || `ffmpeg salió con código ${code}`));
    });
  });
}

async function downloadSource(url, dest) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`No se pudo descargar la animación (${response.status})`);
  const size = Number(response.headers.get('content-length') || 0);
  if (size > MAX_SOURCE_BYTES) throw new Error('Animación demasiado grande para la versión iPhone');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_SOURCE_BYTES) throw new Error('Animación demasiado grande para la versión iPhone');
  fs.writeFileSync(dest, buffer);
}

function evenScaleFilter(width, height) {
  const w = Math.max(2, Number(width) || 0);
  const h = Math.max(2, Number(height) || 0);
  const factor = Math.min(1, MAX_HALF_EDGE / Math.max(w, h));
  const even = (n) => Math.max(2, Math.floor((n * factor) / 2) * 2);
  return `scale=${even(w)}:${even(h)}:flags=lanczos`;
}

async function encodeStacked(ffmpegPath, input, output) {
  const probe = await probeFile(input);
  const video = (probe.streams || []).find((s) => s.codec_type === 'video');
  if (!video) throw new Error('El archivo no tiene video');
  const codec = String(video.codec_name || '').toLowerCase();
  const decoder = codec === 'vp9' ? ['-c:v', 'libvpx-vp9'] : codec === 'vp8' ? ['-c:v', 'libvpx'] : [];
  const hasAudio = (probe.streams || []).some((s) => s.codec_type === 'audio');
  const filter = [
    `[0:v]${evenScaleFilter(video.width, video.height)},format=yuva420p,split[c][a]`,
    '[a]alphaextract[m]',
    '[c]format=yuv420p[cc]',
    '[cc][m]vstack=inputs=2,format=yuv420p[v]',
  ].join(';');
  const args = [
    '-v', 'error', '-y',
    ...decoder,
    '-i', input,
    '-filter_complex', filter,
    '-map', '[v]',
    ...(hasAudio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k'] : ['-an']),
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-preset', 'medium',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output,
  ];
  await runFfmpeg(ffmpegPath, args, ENCODE_TIMEOUT_MS);
}

async function patchCatalog(db, giftId, src, url) {
  const ref = db.doc(CATALOG_PATH);
  let patched = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const gifts = Array.isArray(snap.data()?.gifts) ? snap.data().gifts : [];
    const next = gifts.map((gift) => {
      if (String(gift?.id || '') !== giftId || playbackSrcFor(gift) !== src) return gift;
      patched = true;
      const media = gift.media && typeof gift.media === 'object' ? gift.media : {};
      return { ...gift, media: { ...media, stackedAlphaAsset: url, stackedAlphaSource: src } };
    });
    if (patched) tx.set(ref, { gifts: next }, { merge: true });
  });
  return patched;
}

function needsStacked(gift) {
  const src = playbackSrcFor(gift);
  if (!safeGiftId(gift?.id) || !sourceHttpUrl(src)) return false;
  if (!/\.(webm|mov|mp4)(\?|$)/i.test(src.split('#')[0])) return false;
  const media = gift.media && typeof gift.media === 'object' ? gift.media : {};
  return !(media.stackedAlphaAsset && media.stackedAlphaSource === src);
}

async function buildOne({ ffmpegPath, bucket, db, gift }) {
  const giftId = safeGiftId(gift.id);
  const src = playbackSrcFor(gift);
  const markerRef = db.collection(MARKERS).doc(giftId);
  const markerSnap = await markerRef.get();
  const marker = markerSnap.exists ? markerSnap.data() || {} : {};
  const sameSource = marker.source === src;
  if (sameSource && marker.status === 'error' && Number(marker.attempts || 0) >= MAX_ATTEMPTS) {
    return { giftId, skipped: true, reason: 'max-attempts' };
  }

  const objectPath = stackedObjectPath(giftId, src);
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();
  if (exists) {
    const [meta] = await file.getMetadata();
    const token = meta?.metadata?.firebaseStorageDownloadTokens || randomUUID();
    const url = downloadUrlFor(bucket.name, objectPath, String(token).split(',')[0]);
    await patchCatalog(db, giftId, src, url);
    await markerRef.set({ source: src, status: 'ok', path: objectPath, updatedAtMs: Date.now() }, { merge: true });
    return { giftId, ready: true, reused: true };
  }

  const tmpId = randomUUID();
  const tmpIn = path.join(os.tmpdir(), `gift-ios-${tmpId}.src`);
  const tmpOut = path.join(os.tmpdir(), `gift-ios-${tmpId}.mp4`);
  try {
    await downloadSource(sourceHttpUrl(src), tmpIn);
    await encodeStacked(ffmpegPath, tmpIn, tmpOut);
    const token = randomUUID();
    await bucket.upload(tmpOut, {
      destination: objectPath,
      metadata: {
        contentType: 'video/mp4',
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { firebaseStorageDownloadTokens: token, stackedAlpha: '1', giftId },
      },
    });
    const url = downloadUrlFor(bucket.name, objectPath, token);
    await patchCatalog(db, giftId, src, url);
    await markerRef.set(
      { source: src, status: 'ok', path: objectPath, attempts: 0, error: null, updatedAtMs: Date.now() },
      { merge: true },
    );
    console.log('[gift-ios] listo', giftId, objectPath);
    return { giftId, ready: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[gift-ios] error', giftId, message.slice(0, 300));
    await markerRef.set(
      {
        source: src,
        status: 'error',
        error: message.slice(0, 300),
        attempts: (sameSource ? Number(marker.attempts || 0) : 0) + 1,
        updatedAtMs: Date.now(),
      },
      { merge: true },
    );
    return { giftId, ready: false, error: message.slice(0, 300) };
  } finally {
    fs.rmSync(tmpIn, { force: true });
    fs.rmSync(tmpOut, { force: true });
  }
}

/** Genera las versiones iPhone que falten (o quedaron viejas tras cambiar el video). */
async function processStackedAlphaQueue({ deadlineMs = Date.now() + 240_000, limit = 8 } = {}) {
  if (!firestoreConfigured()) return { skipped: true };
  const ffmpegPath = ffmpegBin();
  if (!ffmpegPath) return { skipped: true, reason: 'no-ffmpeg' };
  const db = getAdminDb();
  const bucket = bucketRef();
  const snap = await db.doc(CATALOG_PATH).get();
  const gifts = Array.isArray(snap.data()?.gifts) ? snap.data().gifts : [];
  const results = [];
  for (const gift of gifts.filter(needsStacked)) {
    if (Date.now() > deadlineMs || results.length >= limit) break;
    const row = await buildOne({ ffmpegPath, bucket, db, gift });
    if (!row.skipped) results.push(row);
  }
  return {
    processed: results.length,
    ready: results.filter((r) => r.ready).map((r) => r.giftId),
    errors: results.filter((r) => r.error).map((r) => ({ giftId: r.giftId, error: r.error })),
  };
}

async function stackedAlphaStatus() {
  if (!firestoreConfigured()) return { total: 0, ready: 0, pending: 0, failed: [] };
  const db = getAdminDb();
  const snap = await db.doc(CATALOG_PATH).get();
  const gifts = (Array.isArray(snap.data()?.gifts) ? snap.data().gifts : []).filter(
    (gift) => safeGiftId(gift?.id) && sourceHttpUrl(playbackSrcFor(gift)),
  );
  const pending = gifts.filter(needsStacked);
  const failed = [];
  for (const gift of pending) {
    const marker = await db.collection(MARKERS).doc(String(gift.id)).get();
    const data = marker.exists ? marker.data() || {} : {};
    if (data.status === 'error' && data.source === playbackSrcFor(gift)) {
      failed.push({
        giftId: String(gift.id),
        name: String(gift.name || gift.id),
        error: String(data.error || ''),
        attempts: Number(data.attempts || 0),
      });
    }
  }
  return { total: gifts.length, ready: gifts.length - pending.length, pending: pending.length, failed };
}

/** Permite reintentar los que agotaron intentos. */
async function resetStackedAlphaErrors() {
  if (!firestoreConfigured()) return { reset: 0 };
  const db = getAdminDb();
  const errored = await db.collection(MARKERS).where('status', '==', 'error').limit(200).get();
  await Promise.all(errored.docs.map((doc) => doc.ref.set({ attempts: 0 }, { merge: true })));
  return { reset: errored.size };
}

module.exports = {
  playbackSrcFor,
  stackedObjectPath,
  needsStacked,
  evenScaleFilter,
  encodeStacked,
  processStackedAlphaQueue,
  stackedAlphaStatus,
  resetStackedAlphaErrors,
};
