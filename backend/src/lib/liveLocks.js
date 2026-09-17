/** Desbloqueos de live con candado (regalos requeridos + cantidades). */

const unlocks = new Map(); // room -> Set(uid)
const locks = new Map(); // room -> LockInfo

function roomKey(room) {
  return String(room || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

function normalizeRequirement(raw) {
  if (!raw || !raw.giftId) return null;
  const quantity = Math.min(99, Math.max(1, Math.floor(Number(raw.quantity) || 1)));
  const unitCoins = Math.max(0, Math.floor(Number(raw.coins) || 0));
  return {
    giftId: String(raw.giftId),
    giftName: String(raw.giftName || raw.giftId),
    coins: unitCoins,
    emoji: String(raw.emoji || '🔒'),
    quantity,
  };
}

function buildLockEntry(requirementsInput) {
  const list = (Array.isArray(requirementsInput) ? requirementsInput : [requirementsInput])
    .map(normalizeRequirement)
    .filter(Boolean)
    .slice(0, 5);
  if (!list.length) return null;
  const totalCoins = list.reduce((sum, row) => sum + row.coins * row.quantity, 0);
  const primary = list[0];
  const summaryName =
    list.length === 1
      ? `${primary.giftName}${primary.quantity > 1 ? ` ×${primary.quantity}` : ''}`
      : list.map((row) => `${row.giftName}×${row.quantity}`).join(', ');
  return {
    giftId: primary.giftId,
    giftName: summaryName,
    coins: totalCoins,
    emoji: primary.emoji,
    quantity: primary.quantity,
    requirements: list,
  };
}

function setLock(room, lock) {
  const key = roomKey(room);
  if (!key) return null;
  // Nuevo candado = reinicia accesos: el público debe enviar el regalo de nuevo.
  unlocks.delete(key);
  if (!lock) {
    locks.delete(key);
    return null;
  }
  const requirements = Array.isArray(lock.requirements)
    ? lock.requirements
    : lock.giftId
      ? [
          {
            giftId: lock.giftId,
            giftName: lock.giftName,
            coins: lock.coins,
            emoji: lock.emoji,
            quantity: lock.quantity || 1,
          },
        ]
      : [];
  const entry = buildLockEntry(requirements);
  if (!entry) {
    locks.delete(key);
    return null;
  }
  locks.set(key, entry);
  return entry;
}

function getLock(room) {
  return locks.get(roomKey(room)) || null;
}

function clearLock(room) {
  locks.delete(roomKey(room));
  unlocks.delete(roomKey(room));
}

function isUnlocked(room, uid) {
  const set = unlocks.get(roomKey(room));
  return Boolean(set && set.has(String(uid)));
}

function markUnlocked(room, uid) {
  const key = roomKey(room);
  if (!key || !uid) return;
  let set = unlocks.get(key);
  if (!set) {
    set = new Set();
    unlocks.set(key, set);
  }
  set.add(String(uid));
}

function canEnterLockedLive(room, uid, isHost) {
  if (isHost) return true;
  const lock = getLock(room);
  if (!lock) return true;
  return isUnlocked(room, uid);
}

module.exports = {
  setLock,
  getLock,
  clearLock,
  isUnlocked,
  markUnlocked,
  canEnterLockedLive,
  buildLockEntry,
};
