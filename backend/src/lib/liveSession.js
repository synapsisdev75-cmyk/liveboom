/** Estadísticas de la sesión en vivo: meta, coins y top regalos. */

function roomKey(room) {
  return String(room || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

const sessions = new Map();

function snapshot(entry) {
  const topGifters = Object.values(entry.gifters || {})
    .sort((a, b) => Number(b.coins) - Number(a.coins))
    .slice(0, 8)
    .map((item) => ({
      uid: String(item.uid || ''),
      name: String(item.name || 'Liveboomer'),
      coins: Number(item.coins) || 0,
    }));
  return {
    username: entry.username,
    startedAt: entry.startedAt,
    goalCoins: Number(entry.goalCoins) || 0,
    goalLabel: String(entry.goalLabel || ''),
    coinsEarned: Number(entry.coinsEarned) || 0,
    topGifters,
  };
}

function startSession(room, extra = {}) {
  const key = roomKey(room);
  if (!key) return null;
  const prev = sessions.get(key);
  const entry = {
    username: key,
    startedAt: prev?.startedAt || new Date().toISOString(),
    goalCoins: prev?.goalCoins || 0,
    goalLabel: prev?.goalLabel || '',
    coinsEarned: prev?.coinsEarned || 0,
    gifters: prev?.gifters || {},
  };
  if (extra.goalCoins != null) entry.goalCoins = Math.max(0, Number(extra.goalCoins) || 0);
  if (extra.goalLabel != null) entry.goalLabel = String(extra.goalLabel || '').trim().slice(0, 80);
  sessions.set(key, entry);
  return snapshot(entry);
}

function addGift(room, { uid, name, coins } = {}) {
  const key = roomKey(room);
  if (!key) return null;
  let entry = sessions.get(key);
  if (!entry) {
    startSession(key);
    entry = sessions.get(key);
  }
  const amount = Math.max(0, Number(coins) || 0);
  entry.coinsEarned += amount;
  const id = String(uid || name || 'anon');
  const current = entry.gifters[id] || { uid: id, name: name || 'Liveboomer', coins: 0 };
  current.coins += amount;
  current.name = name || current.name;
  entry.gifters[id] = current;
  sessions.set(key, entry);
  return snapshot(entry);
}

function getSession(room) {
  const entry = sessions.get(roomKey(room));
  return entry ? snapshot(entry) : null;
}

function endSession(room) {
  const key = roomKey(room);
  const entry = sessions.get(key);
  sessions.delete(key);
  return entry ? snapshot(entry) : null;
}

module.exports = { startSession, addGift, getSession, endSession };
