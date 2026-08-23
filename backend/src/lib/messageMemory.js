const persist = require('./persist');
const { getProfile, findByUsername } = require('./profileMemory');
const social = require('./socialMemory');

const threads = new Map();
const MAX_MESSAGES = 200;
const MAX_TEXT = 2000;

function exportState() {
  return Object.fromEntries(threads);
}

function importState(data) {
  threads.clear();
  if (!data || typeof data !== 'object') return;
  for (const [key, list] of Object.entries(data)) {
    threads.set(key, list);
  }
}

function flush() {
  persist.debouncedSave('messages', exportState());
}

importState(persist.load('messages', {}));

function threadKey(uidA, uidB) {
  return [String(uidA), String(uidB)].sort().join(':');
}

function canMessage(fromUid, toUsername) {
  const me = getProfile(fromUid);
  const target = findByUsername(toUsername);
  if (!me || !target) return { error: 'Usuario no encontrado' };
  if (target.firebaseUid === fromUid) return { error: 'No puedes enviarte mensajes a ti mismo' };
  if (!social.areFriends(fromUid, target.firebaseUid)) {
    return { error: 'Solo puedes chatear con amigos' };
  }
  return { me, target };
}

function sendMessage(fromUid, toUsername, text) {
  const check = canMessage(fromUid, toUsername);
  if (check.error) return { error: check.error };
  const body = String(text || '').trim().slice(0, MAX_TEXT);
  if (!body) return { error: 'Escribe un mensaje' };

  const key = threadKey(fromUid, check.target.firebaseUid);
  const list = threads.get(key) || [];
  const message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    fromUid: String(fromUid),
    toUid: check.target.firebaseUid,
    text: body,
    createdAt: new Date().toISOString(),
  };
  list.push(message);
  if (list.length > MAX_MESSAGES) list.splice(0, list.length - MAX_MESSAGES);
  threads.set(key, list);
  flush();
  return { message };
}

function listMessages(viewerUid, otherUsername) {
  const check = canMessage(viewerUid, otherUsername);
  if (check.error) return { error: check.error };
  const key = threadKey(viewerUid, check.target.firebaseUid);
  const list = threads.get(key) || [];
  return {
    messages: list.map((item) => ({
      ...item,
      mine: item.fromUid === String(viewerUid),
    })),
    friend: social.userSummary(check.target),
  };
}

function listConversations(uid) {
  const me = getProfile(uid);
  if (!me?.username) return [];
  const friends = social.listFriends(me.username);
  const result = [];
  for (const friend of friends) {
    const profile = findByUsername(friend.username);
    if (!profile) continue;
    const key = threadKey(uid, profile.firebaseUid);
    const list = threads.get(key) || [];
    const last = list[list.length - 1];
    const unread = list.filter((m) => m.toUid === String(uid)).length;
    result.push({
      username: friend.username,
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl,
      lastMessage: last?.text || null,
      lastAt: last?.createdAt || null,
      unread,
    });
  }
  return result.sort((a, b) => {
    const aTime = a.lastAt || '';
    const bTime = b.lastAt || '';
    return aTime < bTime ? 1 : -1;
  });
}

function purgeUser(uid) {
  const keyUid = String(uid);
  for (const [key, list] of threads.entries()) {
    if (key.includes(keyUid)) threads.delete(key);
    else if (list.some((m) => m.fromUid === keyUid || m.toUid === keyUid)) {
      threads.set(
        key,
        list.filter((m) => m.fromUid !== keyUid && m.toUid !== keyUid),
      );
    }
  }
  flush();
}

module.exports = { sendMessage, listMessages, listConversations, purgeUser };
