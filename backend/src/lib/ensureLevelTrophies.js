/**
 * Publica / actualiza trofeos de nivel en config/giftsCatalog.
 * Idempotente: no borra otros regalos.
 */

const { FieldValue } = require('firebase-admin/firestore');
const { getAdminDb, firestoreConfigured } = require('./firestoreAdmin');
const { CATALOG_PATH, invalidateCatalogCache, safeId } = require('./giftCatalog');
const { LEVEL_TROPHIES, trophyGiftPayload } = require('./levelTrophies');

let ensurePromise = null;

async function ensureLevelTrophiesInCatalog() {
  if (!firestoreConfigured()) return { ok: false, reason: 'no_db' };
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const db = getAdminDb();
    const ref = db.doc(CATALOG_PATH);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() || {} : {};
    const gifts = Array.isArray(data.gifts) ? [...data.gifts] : [];
    const byId = new Map();
    for (const raw of gifts) {
      const id = safeId(raw?.id);
      if (id) byId.set(id, raw);
    }

    let changed = 0;
    for (const def of LEVEL_TROPHIES) {
      const payload = trophyGiftPayload(def);
      const prev = byId.get(def.id);
      const needsWrite =
        !prev ||
        Number(prev.coins) !== payload.coins ||
        String(prev.requiredLevelSlug || '') !== payload.requiredLevelSlug ||
        String(prev.image || '') !== payload.image ||
        String(prev.name || '') !== payload.name ||
        prev.enabled === false;
      if (!needsWrite) continue;
      byId.set(def.id, { ...(prev && typeof prev === 'object' ? prev : {}), ...payload });
      changed += 1;
    }

    if (!changed) {
      return { ok: true, changed: 0, total: LEVEL_TROPHIES.length };
    }

    const nextGifts = [...byId.values()];
    const nextVersion = Math.max(1, Math.floor(Number(data.version) || 1) + 1);
    await ref.set(
      {
        version: nextVersion,
        gifts: nextGifts,
        updatedBy: 'system:level-trophies',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    invalidateCatalogCache();
    console.log('[levelTrophies] catalog upsert', { changed, version: nextVersion });
    return { ok: true, changed, total: LEVEL_TROPHIES.length, version: nextVersion };
  })().finally(() => {
    ensurePromise = null;
  });
  return ensurePromise;
}

module.exports = { ensureLevelTrophiesInCatalog };
