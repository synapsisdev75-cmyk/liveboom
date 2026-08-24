const persist = require('./persist');

const history = [];

function hydrate() {
  const rows = persist.load('liveHistory', []);
  if (Array.isArray(rows)) {
    history.splice(0, history.length, ...rows);
  }
}

function flush() {
  persist.debouncedSave('liveHistory', history);
}

hydrate();

function archiveLive(entry) {
  if (!entry?.username) return null;
  const started = entry.startedAt ? new Date(entry.startedAt).getTime() : Date.now();
  const ended = Date.now();
  const record = {
    username: entry.username,
    displayName: entry.displayName || entry.username,
    avatarUrl: entry.avatarUrl || null,
    title: entry.title || `Live de ${entry.username}`,
    startedAt: entry.startedAt || new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: Math.max(0, ended - (Number.isFinite(started) ? started : ended)),
    isPrivate: Boolean(entry.isPrivate),
    viewers: Number(entry.viewers || 0),
    coinsEarned: Number(entry.coinsEarned || 0),
    goalCoins: Number(entry.goalCoins || 0),
    goalLabel: entry.goalLabel || '',
    topGifters: Array.isArray(entry.topGifters) ? entry.topGifters.slice(0, 5) : [],
  };
  history.unshift(record);
  if (history.length > 80) history.length = 80;
  flush();
  return record;
}

function listHistory({ username, limit = 12 } = {}) {
  let list = history;
  if (username) {
    const key = String(username).toLowerCase();
    list = history.filter((item) => item.username === key);
  }
  return list.slice(0, limit);
}

module.exports = { archiveLive, listHistory };
