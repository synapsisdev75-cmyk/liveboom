const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getStorage } = require('firebase-admin/storage');
const { getAdminDb } = require('./firestoreAdmin');

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'liveboom-app.firebasestorage.app';
const MAX_SOURCE_BYTES = 80 * 1024 * 1024;

function getAdminBucket() {
  getAdminDb();
  return getStorage().bucket(STORAGE_BUCKET);
}

function safeGiftSourcePath(raw) {
  const value = String(raw || '')
    .trim()
    .replace(/^\/+/, '');
  if (!value.startsWith('config/gifts/')) return null;
  if (value.includes('..') || value.includes('\\')) return null;
  if (!/\.mov$/i.test(value)) return null;
  return value;
}

function downloadUrlFor(bucketName, objectPath, token) {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let err = '';
    child.stderr.on('data', (chunk) => {
      err += String(chunk);
      if (err.length > 8000) err = err.slice(-8000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(err.trim() || `ffmpeg salió con código ${code}`));
    });
  });
}

async function convertGiftAlphaMov({ storagePath }) {
  const sourcePath = safeGiftSourcePath(storagePath);
  if (!sourcePath) {
    const error = new Error('Ruta MOV inválida');
    error.code = 'INVALID_PATH';
    throw error;
  }

  let ffmpegPath = null;
  try {
    ffmpegPath = require('ffmpeg-static');
  } catch {
    ffmpegPath = null;
  }
  if (!ffmpegPath) {
    const error = new Error('ffmpeg no está disponible en el servidor');
    error.code = 'NO_FFMPEG';
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
  if (size > MAX_SOURCE_BYTES) {
    const error = new Error('El MOV supera 80 MB');
    error.code = 'TOO_LARGE';
    throw error;
  }

  const id = randomUUID();
  const tmpIn = path.join(os.tmpdir(), `gift-alpha-${id}.mov`);
  const tmpOut = path.join(os.tmpdir(), `gift-alpha-${id}.webm`);
  const destPath = sourcePath.replace(/\.mov$/i, '.webm');
  const token = randomUUID();

  try {
    await sourceFile.download({ destination: tmpIn });
    await runFfmpeg(ffmpegPath, [
      '-y',
      '-i',
      tmpIn,
      '-an',
      '-c:v',
      'libvpx-vp9',
      '-pix_fmt',
      'yuva420p',
      '-auto-alt-ref',
      '0',
      '-deadline',
      'good',
      '-cpu-used',
      '4',
      '-crf',
      '30',
      '-b:v',
      '0',
      '-row-mt',
      '1',
      '-vf',
      "scale='min(1080,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      tmpOut,
    ]);
    const outStat = fs.statSync(tmpOut);
    if (!outStat.size) {
      throw new Error('La conversión no produjo video');
    }
    await bucket.upload(tmpOut, {
      destination: destPath,
      metadata: {
        contentType: 'video/webm',
        cacheControl: 'public,max-age=3600',
        metadata: {
          firebaseStorageDownloadTokens: token,
          source: 'alpha-mov-4444',
        },
      },
    });
    return {
      url: downloadUrlFor(bucket.name, destPath, token),
      storagePath: destPath,
    };
  } finally {
    fs.rmSync(tmpIn, { force: true });
    fs.rmSync(tmpOut, { force: true });
  }
}

module.exports = {
  convertGiftAlphaMov,
  safeGiftSourcePath,
  MAX_SOURCE_BYTES,
};
module.exports.default = module.exports;
