/** Desbloqueos de live con candado (regalo requerido). */

const unlocks = new Map(); // room -> Set(uid)
const locks = new Map(); // room -> { giftId, giftName, coins, emoji }

function roomKey(room) {
  return String(room || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

function setLock(room, lock) {
  const key = roomKey(room);
  if (!key) return null;
  if (!lock || !lock.giftId) {
    locks.delete(key);
    return null;
  }
  const entry = {
    giftId: String(lock.giftId),
    giftName: String(lock.giftName || lock.giftId),
    coins: Number(lock.coins) || 0,
    emoji: String(lock.emoji || '🔒'),
  };
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
};
