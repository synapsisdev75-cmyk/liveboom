const lives = new Map();
const liveHistory = require('./liveHistory');

function upsertLive({ username, uid, displayName, avatarUrl, title, isPrivate, viewers }) {
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
    isPrivate: Boolean(isPrivate ?? prev?.isPrivate ?? false),
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
  if (entry) liveHistory.archiveLive(entry);
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
