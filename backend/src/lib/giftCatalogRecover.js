/**
 * Recuperación del catálogo tras publishes concurrentes:
 * une catálogo actual + revisiones + assets en Storage (sin tombstones).
 */

const { FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAdminDb, firestoreConfigured } = require('./firestoreAdmin');
const { LEGACY_STATIC_GIFT_IDS } = require('./gifts');
const { invalidateCatalogCache, CATALOG_PATH, safeId } = require('./giftCatalog');

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'liveboom-app.firebasestorage.app';
const REVISIONS = 'gifts_catalog_revisions';
const TOMBSTONES = 'gift_tombstones';

function getAdminBucket() {
  getAdminDb();
  return getStorage().bucket(STORAGE_BUCKET);
}

function normalizeGift(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = safeId(raw.id);
  if (!id || LEGACY_STATIC_GIFT_IDS.has(id)) return null;
  const coins = Math.floor(Number(raw.coins) || 0);
  if (!Number.isFinite(coins) || coins < 1) return null;
  const placements = Array.isArray(raw.placements)
    ? raw.placements.map((p) => String(p)).filter(Boolean)
    : ['live', 'post', 'boom_clip', 'flashboom', 'call', 'chat'];
  return {
    ...raw,
    id,
    name: String(raw.name || id).trim() || id,
    emoji: String(raw.emoji || '🎁'),
    coins,
    enabled: raw.enabled !== false,
    placements: placements.length ? placements : ['live'],
    image: raw.image != null ? String(raw.image) : null,
    video: raw.video != null ? String(raw.video) : null,
  };
}

function mergeById(lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const raw of list || []) {
      const gift = normalizeGift(raw);
      if (!gift) continue;
      byId.set(gift.id, { ...(byId.get(gift.id) || {}), ...gift });
    }
  }
  return [...byId.values()];
}

async function loadTombstoneIds(db) {
  const snap = await db.collection(TOMBSTONES).limit(2000).get();
  const ids = new Set();
  for (const doc of snap.docs) ids.add(doc.id);
  return ids;
}

async function loadRevisionGifts(db) {
  const snap = await db.collection(REVISIONS).orderBy('version', 'desc').limit(100).get();
  const lists = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (Array.isArray(data.gifts)) lists.push(data.gifts);
  }
  return { lists, revisionCount: snap.size };
}

async function publicUrlForPath(bucket, objectPath) {
  try {
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return null;
    await file.makePublic().catch(() => undefined);
    return `https://storage.googleapis.com/${bucket.name}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
  } catch {
    return null;
  }
}

/**
 * Escanea config/gifts/{id}-* y reconstruye stubs con media si faltan en el catálogo.
 */
async function giftsFromStorage(bucket, existingIds) {
  const [files] = await bucket.getFiles({ prefix: 'config/gifts/' });
  const byId = new Map();
  for (const file of files || []) {
    const name = String(file.name || '').split('/').pop() || '';
    const match = name.match(/^([a-z0-9_]+)-(image|video|original|transparent|anim)/i);
    if (!match) continue;
    const id = safeId(match[1]);
    if (!id || LEGACY_STATIC_GIFT_IDS.has(id) || existingIds.has(id)) continue;
    const kind = match[2].toLowerCase();
    const entry = byId.get(id) || {
      id,
      name: id.replace(/_/g, ' '),
      emoji: '🎁',
      coins: 1,
      enabled: true,
      placements: ['live', 'post', 'boom_clip', 'flashboom', 'call', 'chat'],
      image: null,
      video: null,
      recoveredFromStorage: true,
    };
    if (kind === 'image' && !entry.image) entry._imagePath = file.name;
    if ((kind === 'video' || kind === 'transparent' || kind === 'anim') && !entry._videoPath) {
      if (/\.(webm|mp4)$/i.test(name)) entry._videoPath = file.name;
    }
    byId.set(id, entry);
  }
  const out = [];
  for (const entry of byId.values()) {
    if (entry._imagePath) {
      entry.image = await publicUrlForPath(bucket, entry._imagePath);
    }
    if (entry._videoPath) {
      entry.video = await publicUrlForPath(bucket, entry._videoPath);
    }
    delete entry._imagePath;
    delete entry._videoPath;
    if (!entry.image && !entry.video) continue;
    out.push(entry);
  }
  return out;
}

async function recoverGiftCatalog({ adminUserId, adminEmail }) {
  if (!firestoreConfigured()) {
    throw Object.assign(new Error('Firestore no configurado'), { code: 'NO_DB' });
  }
  const db = getAdminDb();
  const catalogRef = db.doc(CATALOG_PATH);
  const catalogSnap = await catalogRef.get();
  const catalog = catalogSnap.exists ? catalogSnap.data() || {} : {};
  const current = Array.isArray(catalog.gifts) ? catalog.gifts : [];
  const tombstones = await loadTombstoneIds(db);
  const { lists: revisionLists, revisionCount } = await loadRevisionGifts(db);

  let merged = mergeById([current, ...revisionLists]);
  merged = merged.filter((g) => !tombstones.has(g.id));

  const existingIds = new Set(merged.map((g) => g.id));
  const fromStorage = await giftsFromStorage(getAdminBucket(), existingIds);
  const storageKept = fromStorage.filter((g) => !tombstones.has(g.id));
  merged = mergeById([merged, storageKept]);

  const before = current.length;
  const after = merged.length;
  const restored = Math.max(0, after - before);
  if (restored === 0) {
    return {
      ok: true,
      restored: 0,
      before,
      after,
      revisionCount,
      fromStorage: storageKept.length,
      version: Math.max(1, Math.floor(Number(catalog.version) || 1)),
    };
  }

  const version = Math.max(1, Math.floor(Number(catalog.version) || 1) + 1);
  if (current.length) {
    await db
      .collection(REVISIONS)
      .doc(`v${Math.max(1, Math.floor(Number(catalog.version) || 1))}`)
      .set(
        {
          version: Math.max(1, Math.floor(Number(catalog.version) || 1)),
          gifts: current,
          updatedBy: catalog.updatedBy || 'unknown',
          archivedAt: FieldValue.serverTimestamp(),
          archivedBy: adminEmail || adminUserId || 'recover',
          supersededBy: version,
          reason: 'pre-recover-snapshot',
        },
        { merge: true },
      );
  }

  await catalogRef.set(
    {
      version,
      gifts: merged,
      updatedBy: adminEmail || adminUserId || 'recover',
      updatedAt: FieldValue.serverTimestamp(),
      lastRecover: {
        before,
        after,
        restored,
        revisionCount,
        fromStorage: storageKept.length,
        atMs: Date.now(),
      },
    },
    { merge: true },
  );
  invalidateCatalogCache();
  return {
    ok: true,
    restored,
    before,
    after,
    revisionCount,
    fromStorage: storageKept.length,
    version,
  };
}

module.exports = {
  recoverGiftCatalog,
  REVISIONS,
};
module.exports.default = module.exports;
