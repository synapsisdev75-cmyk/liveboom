/**
 * Ingesta universal de animaciones de regalo / overlay.
 *
 * Flujo al subir (una sola vez):
 * 1. El admin sube el original a config/gifts/{id}-original-{ts}.{ext}
 * 2. POST /api/gifts/ingest inspecciona formato, duración, fps, audio y alfa real
 * 3. Se conserva el original (público + copia privada al convertir)
 * 4. Decisión:
 *    - WebM VP8/VP9 con alfa usable → ready (reutilizar)
 *    - Alfa real en MOV/MP4/WebM → convert-alpha (VP9 yuva + audio)
 *    - Croma verde/rojo uniforme → bg-remove
 *    - MOV/MP4 opaco sin croma seguro → convert-alpha de empaque (sin recortar)
 *    - Negro/blanco/complejo/WebM opaco → review (no publicar procesado defectuoso)
 * 5. Validar WebM (alfa si aplica, audio si existía) y dejar processedAsset
 * 6. LIVE / chat / editor leen giftPlaybackSrc → processedAsset
 *
 * No cobra, no envía regalos y no borra el archivo original.
 */

const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getStorage } = require('firebase-admin/storage');
const { getAdminDb, firestoreConfigured } = require('./firestoreAdmin');
const {
  LIMITS,
  safeGiftId,
  pixFmtHasAlpha,
  probeReportsAlpha,
  sampleAlpha,
  ffmpegBin,
  probeFile,
  enqueueGiftAlphaJob,
  kickGiftAlphaJob,
} = require('./giftAlphaConvert');
const {
  safeGiftMediaPath,
  inspectMedia,
  classifyBg,
  enqueueGiftBgJob,
  kickGiftBgJob,
  detectBackground,
} = require('./giftBgRemove');

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'liveboom-app.firebasestorage.app';

const REASONS = {
  WEB_M_ALPHA: 'webm-alpha',
  KEEP_ALPHA: 'keep-alpha',
  CHROMA: 'chroma',
  PACKAGING: 'packaging',
  REVIEW: 'opaque-or-complex',
};

const MESSAGES = {
  [REASONS.WEB_M_ALPHA]:
    'El WebM ya tiene transparencia real. Se reutiliza sin reconvertir. El original se conserva.',
  [REASONS.KEEP_ALPHA]:
    'Se detectó canal alfa real. Se convierte a WebM VP9 conservando transparencia y audio. El original se conserva.',
  [REASONS.CHROMA]:
    'Fondo croma uniforme. Se quita el fondo automáticamente. El original se conserva.',
  [REASONS.PACKAGING]:
    'Se genera un WebM de producción para LiveBoom. El original se conserva.',
  [REASONS.REVIEW]:
    'No hay transparencia utilizable ni un croma seguro. Se conservó el original para revisión; no se publicó una versión recortada.',
};

function getAdminBucket() {
  getAdminDb();
  return getStorage().bucket(STORAGE_BUCKET);
}

function containerOf(inspect, sourcePath) {
  const fromInspect = String(inspect?.container || '').toLowerCase();
  if (fromInspect) return fromInspect;
  const ext = path.extname(String(sourcePath || '')).toLowerCase();
  if (ext === '.webm') return 'webm';
  if (ext === '.mp4') return 'mp4';
  if (ext === '.mov') return 'mov';
  return '';
}

/**
 * Decisión pura: qué hacer con un archivo ya inspeccionado.
 * @param {{
 *   hasAlphaChannel: boolean,
 *   alphaUsable: boolean | null,
 *   codec: string,
 *   container: string,
 *   bgKind?: string | null,
 *   bgUniform?: boolean,
 * }} input
 */
function planGiftAnimIngest(input) {
  const hasAlpha = Boolean(input.hasAlphaChannel);
  const usable = input.alphaUsable;
  const codec = String(input.codec || '').toLowerCase();
  const container = String(input.container || '').toLowerCase();
  const kind = String(input.bgKind || '');
  const uniform = Boolean(input.bgUniform);

  const alreadyProdWebm =
    /webm|matroska/.test(container) &&
    /^(vp8|vp9|libvpx)/.test(codec) &&
    hasAlpha &&
    usable !== false;

  if (alreadyProdWebm) {
    return { action: 'ready', reason: REASONS.WEB_M_ALPHA, message: MESSAGES[REASONS.WEB_M_ALPHA] };
  }

  if (hasAlpha && usable !== false) {
    return { action: 'convert-alpha', reason: REASONS.KEEP_ALPHA, message: MESSAGES[REASONS.KEEP_ALPHA] };
  }

  if (uniform && (kind === 'green' || kind === 'red')) {
    return { action: 'bg-remove', reason: REASONS.CHROMA, message: MESSAGES[REASONS.CHROMA] };
  }

  if (/mov|mp4|quicktime/.test(container) && !/webm/.test(container)) {
    return { action: 'convert-alpha', reason: REASONS.PACKAGING, message: MESSAGES[REASONS.PACKAGING] };
  }

  return { action: 'review', reason: REASONS.REVIEW, message: MESSAGES[REASONS.REVIEW] };
}

async function analyzeGiftSource(storagePath) {
  const sourcePath = safeGiftMediaPath(storagePath);
  if (!sourcePath) {
    throw Object.assign(new Error('Ruta de video inválida'), { code: 'INVALID_PATH' });
  }
  const ffmpegPath = ffmpegBin();
  if (!ffmpegPath) {
    throw Object.assign(new Error('FFmpeg no está disponible en el servidor.'), { code: 'NO_FFMPEG' });
  }
  const tmpIn = path.join(os.tmpdir(), `gift-ingest-${randomUUID()}${path.extname(sourcePath)}`);
  try {
    const file = getAdminBucket().file(sourcePath);
    const [exists] = await file.exists();
    if (!exists) throw Object.assign(new Error('No se encontró el archivo'), { code: 'NOT_FOUND' });
    await file.download({ destination: tmpIn });
    const probe = await probeFile(tmpIn);
    const inspect = inspectMedia(probe);
    if (inspect.error) throw Object.assign(new Error(inspect.error), { code: 'UNSUPPORTED' });
    const hasAlphaChannel = Boolean(inspect.hasAlphaChannel || pixFmtHasAlpha(inspect.pixFmt) || probeReportsAlpha(probe));
    let alphaUsable = hasAlphaChannel ? true : null;
    let alphaWarning = null;
    if (hasAlphaChannel) {
      const sampled = await sampleAlpha(ffmpegPath, tmpIn);
      if (sampled.opaque) {
        alphaUsable = false;
        alphaWarning = 'El archivo declara canal alfa, pero los fotogramas muestreados están opacos.';
      } else if (sampled.fullyTransparent) {
        alphaUsable = true;
        alphaWarning =
          'El muestreo inicial salió vacío. La forma puede aparecer más tarde. Se conservó la transparencia.';
      } else if (sampled.usable === false) {
        alphaUsable = false;
        alphaWarning = 'No se pudo validar el canal alfa. Se conservó el original.';
      }
    }

    let bg = null;
    if (!(hasAlphaChannel && alphaUsable !== false)) {
      try {
        bg = await detectBackground(ffmpegPath, tmpIn, inspect);
      } catch {
        bg = { kind: 'flat', uniform: false, color: { r: 0, g: 0, b: 0 }, warning: null };
      }
    }

    return {
      sourcePath,
      inspect: {
        ...inspect,
        hasAlphaChannel,
        container: containerOf(inspect, sourcePath),
      },
      alphaUsable,
      alphaWarning,
      bg,
    };
  } finally {
    try {
      fs.unlinkSync(tmpIn);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Inspecciona, decide y encola. El HTTP no espera a FFmpeg.
 */
async function ingestGiftAnimation({ storagePath, giftId, createdByUid, fileName, clientNonce }) {
  if (!firestoreConfigured()) {
    throw Object.assign(new Error('Firestore no está configurado'), { code: 'NO_FIRESTORE' });
  }
  const gid = safeGiftId(giftId);
  if (!gid) throw Object.assign(new Error('Regalo inválido'), { code: 'INVALID_GIFT' });

  const analyzed = await analyzeGiftSource(storagePath);
  const decision = planGiftAnimIngest({
    hasAlphaChannel: analyzed.inspect.hasAlphaChannel,
    alphaUsable: analyzed.alphaUsable,
    codec: analyzed.inspect.codec,
    container: analyzed.inspect.container,
    bgKind: analyzed.bg?.kind || null,
    bgUniform: Boolean(analyzed.bg?.uniform),
  });

  const mediaBase = {
    hasAudio: Boolean(analyzed.inspect.hasAudio),
    duration: analyzed.inspect.durationSec,
    width: analyzed.inspect.width,
    height: analyzed.inspect.height,
    fps: Math.round((analyzed.inspect.fps || 0) * 100) / 100,
    codec: analyzed.inspect.codec,
    hasAlpha: Boolean(analyzed.inspect.hasAlphaChannel && analyzed.alphaUsable !== false),
    alphaUsable: analyzed.alphaUsable,
    alphaWarning: analyzed.alphaWarning || analyzed.bg?.warning || null,
    needsReview: decision.action === 'review',
    ingestReason: decision.reason,
    ingestMessage: decision.message,
  };

  if (decision.action === 'ready' || decision.action === 'review') {
    return {
      decision,
      jobKind: null,
      job: null,
      media: mediaBase,
      sourcePath: analyzed.sourcePath,
    };
  }

  const nonce = String(clientNonce || '').slice(0, 80) || undefined;
  if (decision.action === 'convert-alpha') {
    const job = await enqueueGiftAlphaJob({
      storagePath: analyzed.sourcePath,
      giftId: gid,
      createdByUid,
      keepAudio: true,
      fileName,
      clientNonce: nonce,
    });
    kickGiftAlphaJob(job.jobId);
    return {
      decision,
      jobKind: 'alpha',
      job,
      media: { ...mediaBase, processingStatus: 'processing' },
      sourcePath: analyzed.sourcePath,
    };
  }

  const job = await enqueueGiftBgJob({
    storagePath: analyzed.sourcePath,
    giftId: gid,
    createdByUid,
    fileName,
    clientNonce: nonce,
    mode: 'auto',
  });
  kickGiftBgJob(job.jobId);
  return {
    decision,
    jobKind: 'bg',
    job,
    media: { ...mediaBase, processingStatus: 'processing' },
    sourcePath: analyzed.sourcePath,
  };
}

module.exports = {
  REASONS,
  MESSAGES,
  planGiftAnimIngest,
  analyzeGiftSource,
  ingestGiftAnimation,
  classifyBg,
  LIMITS,
};
module.exports.default = module.exports;
