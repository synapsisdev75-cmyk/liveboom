const lives = new Map();

function upsertLive({ username, uid, displayName, avatarUrl, title }) {
  const key = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  if (!key) return null;
  const entry = {
    username: key,
    uid: String(uid || ''),
    displayName: displayName || key,
    avatarUrl: avatarUrl || null,
    title: title || `Live de ${displayName || key}`,
    startedAt: new Date().toISOString(),
    viewers: 0,
  };
  lives.set(key, entry);
  return entry;
}

function removeLive(username) {
  const key = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
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
