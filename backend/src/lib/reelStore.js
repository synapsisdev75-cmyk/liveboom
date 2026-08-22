const persist = require('./persist');

const reelsByUser = new Map();
const MAX_REELS_PER_USER = 12;
const MAX_REEL_BYTES = 4 * 1024 * 1024;

function hydrate() {
  const data = persist.load('reels', {});
  for (const [username, list] of Object.entries(data)) {
    reelsByUser.set(username, list);
  }
}

function flush() {
  persist.debouncedSave('reels', Object.fromEntries(reelsByUser));
}

hydrate();

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

function addReel({ username, dataUrl, title, shared = false }) {
  const key = normalize(username);
  if (!key || !dataUrl) return null;
  const bytes = Buffer.byteLength(dataUrl, 'utf8');
  if (bytes > MAX_REEL_BYTES) {
    throw new Error('El reel es demasiado grande (máx. 4 MB)');
  }
  const list = reelsByUser.get(key) || [];
  const reel = {
    id: `reel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    username: key,
    title: String(title || 'Momento del live').slice(0, 80),
    dataUrl,
    shared: Boolean(shared),
    createdAt: new Date().toISOString(),
  };
  list.unshift(reel);
  reelsByUser.set(key, list.slice(0, MAX_REELS_PER_USER));
  flush();
  return reel;
}

function listReels(username, { sharedOnly = false } = {}) {
  const key = normalize(username);
  const list = reelsByUser.get(key) || [];
  return sharedOnly ? list.filter((item) => item.shared) : list;
}

function listSharedReels() {
  const all = [];
  for (const list of reelsByUser.values()) {
    for (const reel of list) {
      if (reel.shared) all.push(reel);
    }
  }
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 24);
}

function setReelShared(username, reelId, shared) {
  const key = normalize(username);
  const list = reelsByUser.get(key) || [];
  const reel = list.find((item) => item.id === reelId);
  if (!reel) return null;
  reel.shared = Boolean(shared);
  flush();
  return reel;
}

module.exports = { addReel, listReels, listSharedReels, setReelShared };
