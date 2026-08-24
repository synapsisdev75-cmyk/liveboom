/** Historial de chat en vivo (memoria + disco local del API). */

const persist = require('./persist');

/** @type {Map<string, object[]>} */
const byRoom = new Map();

function roomKey(room) {
  return String(room || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

function hydrate() {
  const data = persist.load('liveChat', {});
  for (const [room, list] of Object.entries(data || {})) {
    byRoom.set(room, Array.isArray(list) ? list : []);
  }
}

function flush() {
  persist.debouncedSave('liveChat', Object.fromEntries(byRoom));
}

hydrate();

function appendMessage(room, message) {
  const key = roomKey(room);
  if (!key || !message) return null;
  const list = byRoom.get(key) || [];
  const row = {
    id: String(message.id || `${Date.now()}`),
    author: String(message.author || ''),
    text: String(message.text || '').slice(0, 500),
    gift: message.gift || null,
    createdAt: message.createdAt || new Date().toISOString(),
  };
  list.push(row);
  if (list.length > 400) list.splice(0, list.length - 400);
  byRoom.set(key, list);
  flush();
  return row;
}

function listMessages(room, { limit = 200 } = {}) {
  const list = byRoom.get(roomKey(room)) || [];
  return list.slice(-Math.max(1, Math.min(400, limit)));
}

function clearRoom(room) {
  byRoom.delete(roomKey(room));
  flush();
}

module.exports = { appendMessage, listMessages, clearRoom };
