/** Borrado permanente de un regalo del catálogo: assets exclusivos + auditoría. No toca transacciones. */

const { FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAdminDb, firestoreConfigured } = require('./firestoreAdmin');
const { safeGiftId } = require('./giftAlphaConvert');

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'liveboom-app.firebasestorage.app';
const CATALOG_PATH = 'config/giftsCatalog';
const TOMBSTONES = 'gift_tombstones';
const AUDIT = 'gift_delete_audit';

function getAdminBucket() {
  getAdminDb();
  return getStorage().bucket(STORAGE_BUCKET);
}

function collectUrls(gift) {
  const keys = ['image', 'video', 'originalAsset', 'processedAsset'];
  const urls = new Set();
  for (const key of keys) {
    const value = gift?.[key] || gift?.media?.[key];
    if (value && typeof value === 'string') urls.add(value);
  }
  return urls;
}

function storagePathFromUrl(url) {
  const raw = String(url || '');
  const match = raw.match(/\/o\/([^?]+)/);
  if (!match) return null;
  const decoded = decodeURIComponent(match[1]);
  if (!decoded.startsWith('config/gifts/')) return null;
  if (decoded.includes('..')) return null;
  return decoded;
}

function isExclusivePath(objectPath, giftId) {
  const name = String(objectPath || '').split('/').pop() || '';
  return name.startsWith(`${giftId}-`);
}

async function deleteStoragePrefix(bucket, prefix, deletedPaths) {
  const [files] = await bucket.getFiles({ prefix });
  for (const file of files || []) {
    try {
      await file.delete({ ignoreNotFound: true });
      deletedPaths.push(file.name);
    } catch (error) {
      console.warn('[gift-delete] storage', file.name, error.message);
    }
  }
}

async function cancelGiftJobs(db, giftId) {
  await db.collection('gift_alpha_gifts').doc(giftId).set(
    { status: 'cancelled', stage: 'failed', updatedAtMs: Date.now() },
    { merge: true },
  );
  await db.collection('gift_bg_gifts').doc(giftId).set(
    { status: 'cancelled', stage: 'failed', updatedAtMs: Date.now() },
    { merge: true },
  );
}

async function isGiftDeleted(giftId) {
  const id = safeGiftId(giftId);
  if (!id || !firestoreConfigured()) return false;
  const snap = await getAdminDb().collection(TOMBSTONES).doc(id).get();
  return snap.exists;
}

async function deleteGiftPermanently({ giftId, adminUserId, adminEmail }) {
  if (!firestoreConfigured()) {
    throw Object.assign(new Error('Firestore no configurado'), { code: 'NO_DB' });
  }
  const gid = safeGiftId(giftId);
  if (!gid) throw Object.assign(new Error('Regalo inválido'), { code: 'INVALID_GIFT' });

  const db = getAdminDb();
  await cancelGiftJobs(db, gid);

  const catalogRef = db.doc(CATALOG_PATH);
  const catalogSnap = await catalogRef.get();
  const catalog = catalogSnap.exists ? catalogSnap.data() || {} : {};
  const gifts = Array.isArray(catalog.gifts) ? catalog.gifts : [];
  const target = gifts.find((g) => String(g?.id || '') === gid) || null;
  if (target && gifts.length <= 1) {
    throw Object.assign(new Error('Debe quedar al menos un regalo en el catálogo.'), { code: 'LAST_GIFT' });
  }

  const remaining = gifts.filter((g) => String(g?.id || '') !== gid);
  const shared = new Set();
  for (const other of remaining) {
    for (const url of collectUrls(other)) shared.add(url);
  }

  const sharedPaths = new Set();
  for (const url of shared) {
    const objectPath = storagePathFromUrl(url);
    if (objectPath) sharedPaths.add(objectPath);
  }
  const bucket = getAdminBucket();
  const deletedPaths = [];

  const [prefixed] = await bucket.getFiles({ prefix: `config/gifts/${gid}-` });
  for (const file of prefixed) {
    const objectPath = file.name;
    if (!isExclusivePath(objectPath, gid)) continue;
    if (sharedPaths.has(objectPath)) continue;
    try {
      await file.delete({ ignoreNotFound: true });
      deletedPaths.push(objectPath);
    } catch (error) {
      console.warn('[gift-delete] storage', objectPath, error.message);
    }
  }
  await deleteStoragePrefix(bucket, `admin/private/gifts/${gid}/`, deletedPaths);

  if (target) {
    const version = Math.max(1, Math.floor(Number(catalog.version) || 1) + 1);
    await catalogRef.set(
      {
        ...catalog,
        gifts: remaining,
        version,
        updatedBy: adminEmail || adminUserId || 'admin',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  const snapshot = {
    giftId: gid,
    giftName: String(target?.name || gid),
    coins: Number(target?.coins) || 0,
    emoji: String(target?.emoji || '🎁'),
    blast: Number(target?.coins) || 0,
  };

  await db.collection(TOMBSTONES).doc(gid).set({
    ...snapshot,
    deletedAt: FieldValue.serverTimestamp(),
    deletedAtMs: Date.now(),
  });

  await db.collection(AUDIT).add({
    adminUserId: String(adminUserId || ''),
    giftId: gid,
    giftName: snapshot.giftName,
    deletedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, giftId: gid, version: target ? Math.max(1, Math.floor(Number(catalog.version) || 1) + 1) : Number(catalog.version) || 1, deletedPaths };
}

module.exports = {
  collectUrls,
  storagePathFromUrl,
  isExclusivePath,
  isGiftDeleted,
  deleteGiftPermanently,
};
module.exports.default = module.exports;
