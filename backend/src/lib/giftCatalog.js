/**
 * Catálogo comercial autorizado: Firestore config/giftsCatalog.
 * Única fuente de precio/disponibilidad para cobros. Caché con versión; no autoriza sola.
 */

const { FieldValue } = require('firebase-admin/firestore');
const { getAdminDb, firestoreConfigured } = require('./firestoreAdmin');
const { LEGACY_STATIC_GIFT_IDS } = require('./gifts');

const CATALOG_PATH = 'config/giftsCatalog';
const MIGRATION_PATH = 'config/giftCatalogMigration';
const MIGRATION_ID = 'retire-static-catalog-v1';
const TOMBSTONES = 'gift_tombstones';
const CACHE_TTL_MS = 5_000;
const MAX_GIFT_COINS = 5_000_000;

let cache = {
  loadedAt: 0,
  version: 0,
  byId: new Map(),
  gifts: [],
};
let migrationDoneMemory = false;

function safeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 64);
}

function normalizeCatalogGift(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = safeId(raw.id);
  if (!id) return null;
  const coins = Math.floor(Number(raw.coins) || 0);
  if (!Number.isFinite(coins) || coins < 1 || coins > MAX_GIFT_COINS) return null;
  const enabled = raw.enabled !== false;
  const placements = Array.isArray(raw.placements)
    ? raw.placements.map((p) => String(p)).filter(Boolean)
    : ['live', 'post', 'boom_clip', 'flashboom', 'call', 'chat'];
  return {
    id,
    name: String(raw.name || id).trim() || id,
    emoji: String(raw.emoji || '🎁'),
    coins,
    enabled,
    placements,
    liveOnly: placements.length === 1 && placements[0] === 'live',
    version: Math.max(1, Math.floor(Number(raw.version) || 0)),
    image: raw.image != null ? String(raw.image) : undefined,
    video: raw.video != null ? String(raw.video) : undefined,
  };
}

function invalidateCatalogCache() {
  cache = { loadedAt: 0, version: 0, byId: new Map(), gifts: [] };
}

async function loadCatalogFromFirestore({ force = false } = {}) {
  if (!firestoreConfigured()) {
    return { version: 0, gifts: [], byId: new Map() };
  }
  const now = Date.now();
  if (!force && cache.loadedAt && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }
  const snap = await getAdminDb().doc(CATALOG_PATH).get();
  const data = snap.exists ? snap.data() || {} : {};
  const version = Math.max(1, Math.floor(Number(data.version) || 1));
  const byId = new Map();
  const gifts = [];
  for (const raw of Array.isArray(data.gifts) ? data.gifts : []) {
    const gift = normalizeCatalogGift(raw);
    if (!gift) continue;
    gift.catalogVersion = version;
    byId.set(gift.id, gift);
    gifts.push(gift);
  }
  cache = { loadedAt: now, version, byId, gifts };
  return cache;
}

async function isTombstoned(giftId) {
  const id = safeId(giftId);
  if (!id || !firestoreConfigured()) return false;
  const snap = await getAdminDb().collection(TOMBSTONES).doc(id).get();
  return snap.exists;
}

/**
 * Regalo autorizado para operaciones nuevas: publicado, enabled, precio > 0, no tombstone.
 */
async function getAuthorizedGift(giftId, opts = {}) {
  const id = safeId(giftId);
  if (!id) return null;
  // IDs del catálogo estático anterior: nunca autorizan cobros nuevos.
  if (LEGACY_STATIC_GIFT_IDS.has(id)) return null;
  await ensureLegacyRetirement();
  const catalog = await loadCatalogFromFirestore({ force: Boolean(opts.force) });
  const gift = catalog.byId.get(id) || null;
  if (!gift || !gift.enabled) return null;
  if (await isTombstoned(id)) return null;
  if (opts.placement) {
    const place = String(opts.placement);
    if (gift.placements.length && !gift.placements.includes(place)) return null;
  }
  return gift;
}

async function migrationCompleted() {
  if (migrationDoneMemory) return true;
  if (!firestoreConfigured()) return false;
  const snap = await getAdminDb().doc(MIGRATION_PATH).get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  const done = data.id === MIGRATION_ID && data.status === 'completed';
  if (done) migrationDoneMemory = true;
  return done;
}

let retirementPromise = null;

/**
 * Retira el catálogo estático/anterior una sola vez. Idempotente:
 * no borra regalos nuevos (ids fuera del snapshot retirado).
 */
async function ensureLegacyRetirement() {
  if (!firestoreConfigured()) return { ok: true, skipped: true, reason: 'no_db' };
  if (migrationDoneMemory) {
    return { ok: true, already: true };
  }
  if (retirementPromise) return retirementPromise;
  retirementPromise = (async () => {
    const db = getAdminDb();
    const migRef = db.doc(MIGRATION_PATH);
    const migSnap = await migRef.get();
    if (migSnap.exists) {
      const prev = migSnap.data() || {};
      if (prev.id === MIGRATION_ID && prev.status === 'completed') {
        migrationDoneMemory = true;
        return {
          ok: true,
          already: true,
          retiredCount: Array.isArray(prev.retiredIds) ? prev.retiredIds.length : 0,
          retiredIds: prev.retiredIds || [],
        };
      }
    }

    const catalogRef = db.doc(CATALOG_PATH);
    const catalogSnap = await catalogRef.get();
    const catalog = catalogSnap.exists ? catalogSnap.data() || {} : {};
    const currentGifts = Array.isArray(catalog.gifts) ? catalog.gifts : [];
    const snapshotIds = new Set(LEGACY_STATIC_GIFT_IDS);
    for (const raw of currentGifts) {
      const id = safeId(raw?.id);
      if (id) snapshotIds.add(id);
    }

    const retiredIds = [...snapshotIds].sort();
    const batchSize = 400;
    for (let i = 0; i < retiredIds.length; i += batchSize) {
      const batch = db.batch();
      for (const id of retiredIds.slice(i, i + batchSize)) {
        batch.set(
          db.collection(TOMBSTONES).doc(id),
          {
            giftId: id,
            reason: 'legacy_catalog_retirement',
            migrationId: MIGRATION_ID,
            retiredAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      await batch.commit();
    }

    const kept = currentGifts.filter((raw) => {
      const id = safeId(raw?.id);
      return id && !snapshotIds.has(id);
    });
    const nextVersion = Math.max(1, Math.floor(Number(catalog.version) || 1) + 1);
    await catalogRef.set(
      {
        version: nextVersion,
        gifts: kept,
        updatedBy: 'system:retire-static-catalog-v1',
        updatedAt: FieldValue.serverTimestamp(),
        migrationId: MIGRATION_ID,
      },
      { merge: true },
    );

    await migRef.set(
      {
        id: MIGRATION_ID,
        status: 'completed',
        retiredIds,
        retiredCount: retiredIds.length,
        catalogVersionBefore: Math.max(1, Math.floor(Number(catalog.version) || 1)),
        catalogVersionAfter: nextVersion,
        completedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    invalidateCatalogCache();
    migrationDoneMemory = true;
    console.log('[giftCatalog] legacy retirement complete', {
      retiredCount: retiredIds.length,
      kept: kept.length,
      version: nextVersion,
    });
    return { ok: true, already: false, retiredCount: retiredIds.length, retiredIds, kept: kept.length };
  })().finally(() => {
    retirementPromise = null;
  });
  return retirementPromise;
}

module.exports = {
  CATALOG_PATH,
  MIGRATION_PATH,
  MIGRATION_ID,
  MAX_GIFT_COINS,
  safeId,
  normalizeCatalogGift,
  invalidateCatalogCache,
  loadCatalogFromFirestore,
  getAuthorizedGift,
  ensureLegacyRetirement,
  migrationCompleted,
};
module.exports.default = module.exports;
