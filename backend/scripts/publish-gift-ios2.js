#!/usr/bin/env node
/**
 * Solo iPhone: regenera MP4 H.264 stacked (color + máscara) y, si hay
 * FIREBASE_SERVICE_ACCOUNT, los sube a Storage y parchea el catálogo.
 * No toca los WebM de Android.
 *
 *   FIREBASE_SERVICE_ACCOUNT='...' node backend/scripts/publish-gift-ios2.js
 *   node backend/scripts/publish-gift-ios2.js --encode-only
 */
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { encodeStacked, stackedObjectPath, playbackSrcFor, sameGiftAsset } = require('../src/lib/giftStackedAlpha');

const CATALOG_URL =
  'https://firestore.googleapis.com/v1/projects/liveboom-app/databases/(default)/documents/config/giftsCatalog';
const WORK = process.env.GIFT_IOS2_DIR || path.join(os.tmpdir(), 'gift-ios2-batch');
const ENCODE_ONLY = process.argv.includes('--encode-only');
const LIMIT = Number(process.env.GIFT_IOS2_LIMIT || 0);

function str(fields, key) {
  return String((fields?.[key] || {}).stringValue || '').trim();
}

function unwrapGift(item) {
  const g = item.mapValue?.fields || {};
  const media = g.media?.mapValue?.fields || {};
  const mediaObj = {};
  for (const [k, v] of Object.entries(media)) {
    if (v.stringValue != null) mediaObj[k] = v.stringValue;
    else if (v.booleanValue != null) mediaObj[k] = v.booleanValue;
    else if (v.integerValue != null) mediaObj[k] = Number(v.integerValue);
    else if (v.doubleValue != null) mediaObj[k] = Number(v.doubleValue);
  }
  return {
    id: str(g, 'id'),
    name: str(g, 'name'),
    video: str(g, 'video'),
    media: mediaObj,
  };
}

async function fetchCatalog() {
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`No se pudo leer el catálogo (${res.status})`);
  const doc = await res.json();
  const values = doc.fields?.gifts?.arrayValue?.values || [];
  return values.map(unwrapGift);
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url.slice(0, 80)}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function ffmpegBin() {
  try {
    return require('ffmpeg-static');
  } catch {
    return 'ffmpeg';
  }
}

async function encodeOne(gift) {
  const src = playbackSrcFor(gift);
  if (!src || !/^https:\/\//i.test(src)) return { giftId: gift.id, skipped: true, reason: 'no-src' };
  const outName = path.basename(stackedObjectPath(gift.id, src));
  const outPath = path.join(WORK, outName);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 10_000) {
    return { giftId: gift.id, name: gift.name, ready: true, reused: true, outPath, src };
  }
  const tmpIn = path.join(WORK, `${gift.id}.src`);
  await download(src, tmpIn);
  await encodeStacked(ffmpegBin(), tmpIn, outPath);
  fs.rmSync(tmpIn, { force: true });
  return { giftId: gift.id, name: gift.name, ready: true, outPath, src };
}

async function publishOne(bucket, db, gift, encoded) {
  const objectPath = stackedObjectPath(gift.id, encoded.src);
  const token = randomUUID();
  await bucket.upload(encoded.outPath, {
    destination: objectPath,
    metadata: {
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: token, stackedAlpha: '2', giftId: gift.id },
    },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  const ref = db.doc('config/giftsCatalog');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const gifts = Array.isArray(snap.data()?.gifts) ? snap.data().gifts : [];
    const next = gifts.map((row) => {
      if (String(row?.id || '') !== gift.id) return row;
      if (!sameGiftAsset(playbackSrcFor(row), encoded.src)) return row;
      const media = row.media && typeof row.media === 'object' ? row.media : {};
      return { ...row, media: { ...media, stackedAlphaAsset: url, stackedAlphaSource: encoded.src } };
    });
    tx.set(ref, { gifts: next }, { merge: true });
  });
  return url;
}

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const gifts = (await fetchCatalog()).filter((g) => playbackSrcFor(g));
  const todo = LIMIT > 0 ? gifts.slice(0, LIMIT) : gifts;
  console.log(`[gift-ios2] ${todo.length} regalos con video (dir ${WORK})`);
  const results = [];
  for (const gift of todo) {
    try {
      const row = await encodeOne(gift);
      console.log('[gift-ios2] encode', gift.id, gift.name, row.reused ? 'reused' : row.skipped ? row.reason : 'ok');
      results.push(row);
    } catch (error) {
      console.warn('[gift-ios2] encode fail', gift.id, error.message);
      results.push({ giftId: gift.id, error: error.message });
    }
  }

  if (ENCODE_ONLY) {
    console.log('[gift-ios2] encode-only listo', results.filter((r) => r.ready).length);
    return;
  }

  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) {
    console.log('[gift-ios2] MP4 listos en', WORK);
    console.log('[gift-ios2] Falta FIREBASE_SERVICE_ACCOUNT para subirlos al catálogo.');
    process.exitCode = 2;
    return;
  }
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    sa = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  }
  const { cert, getApps, initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const { getStorage } = require('firebase-admin/storage');
  if (!getApps().length) {
    initializeApp({
      credential: cert(sa),
      projectId: sa.project_id || 'liveboom-app',
      storageBucket: 'liveboom-app.firebasestorage.app',
    });
  }
  const db = getFirestore();
  const bucket = getStorage().bucket('liveboom-app.firebasestorage.app');
  for (const row of results.filter((r) => r.ready && r.outPath)) {
    const gift = todo.find((g) => g.id === row.giftId);
    const url = await publishOne(bucket, db, gift, row);
    console.log('[gift-ios2] published', row.giftId, url.slice(0, 80));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
