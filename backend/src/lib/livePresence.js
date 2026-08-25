const lives = new Map();
const liveHistory = require('./liveHistory');

function upsertLive({
  username,
  uid,
  displayName,
  avatarUrl,
  title,
  isPrivate,
  viewers,
  category,
  goalCoins,
  goalLabel,
  lockGiftId,
  lockGiftName,
  lockCoins,
  lockEmoji,
}) {
  const key = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  if (!key) return null;
  const prev = lives.get(key);
  const entry = {
    username: key,
    uid: String(uid || prev?.uid || ''),
    displayName: displayName || prev?.displayName || key,
    avatarUrl: avatarUrl ?? prev?.avatarUrl ?? null,
    title: title || prev?.title || `Live de ${displayName || key}`,
    startedAt: prev?.startedAt || new Date().toISOString(),
    viewers: Number(viewers ?? prev?.viewers ?? 0),
    isPrivate:
      typeof isPrivate === 'boolean' ? isPrivate : Boolean(prev?.isPrivate ?? false),
    category: category || prev?.category || 'otro',
    goalCoins: Number(goalCoins) > 0 ? Number(goalCoins) : Number(prev?.goalCoins ?? 0),
    goalLabel: goalLabel || prev?.goalLabel || '',
    lockGiftId:
      lockGiftId === null
        ? null
        : lockGiftId != null
          ? String(lockGiftId)
          : prev?.lockGiftId || null,
    lockGiftName:
      lockGiftId === null
        ? null
        : lockGiftName != null
          ? String(lockGiftName)
          : prev?.lockGiftName || null,
    lockCoins:
      lockGiftId === null
        ? 0
        : lockCoins != null
          ? Number(lockCoins) || 0
          : Number(prev?.lockCoins || 0),
    lockEmoji:
      lockGiftId === null
        ? null
        : lockEmoji != null
          ? String(lockEmoji)
          : prev?.lockEmoji || null,
  };
  lives.set(key, entry);
  return entry;
}

function removeLive(username) {
  const key = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  const entry = lives.get(key);
  if (entry) {
    let stats = null;
    try {
      stats = require('./liveSession').endSession(key);
    } catch {
      stats = null;
    }
    liveHistory.archiveLive({
      ...entry,
      coinsEarned: stats?.coinsEarned || 0,
      goalCoins: stats?.goalCoins || entry.goalCoins || 0,
      goalLabel: stats?.goalLabel || entry.goalLabel || '',
      topGifters: stats?.topGifters || [],
    });
  }
  lives.delete(key);
}

function listLives() {
  return Array.from(lives.values()).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

function touchLive(username) {
  const key = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  const entry = lives.get(key);
  if (!entry) return null;
  entry.startedAt = entry.startedAt || new Date().toISOString();
  lives.set(key, entry);
  return entry;
}

module.exports = { upsertLive, removeLive, listLives, touchLive };
