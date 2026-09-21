const { firestoreConfigured, getAdminDb } = require('./firestoreAdmin');

function asIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function mapChat(doc) {
  const data = doc.data() || {};
  return {
    chatId: doc.id,
    participants: Array.isArray(data.participants) ? data.participants.map(String) : [],
    profiles: data.profiles && typeof data.profiles === 'object' ? data.profiles : {},
    lastMessage: data.lastMessage ?? null,
    lastAt: asIso(data.lastAt),
  };
}

async function listAdminChats({ q = '', cursor = null, limit = 40 } = {}) {
  const take = Math.min(80, Math.max(1, Math.floor(Number(limit) || 40)));
  if (!firestoreConfigured()) {
    return { chats: [], nextCursor: null };
  }
  const db = getAdminDb();
  let query = db.collection('chats').orderBy('lastAt', 'desc').limit(take + 1);
  if (cursor) {
    try {
      const cursorDoc = await db.collection('chats').doc(String(cursor)).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    } catch {
      /* ignore */
    }
  }
  let snap;
  try {
    snap = await query.get();
  } catch {
    snap = await db.collection('chats').limit(take + 1).get();
  }
  const page = snap.docs.slice(0, take).map(mapChat);
  const needle = String(q || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  const chats = needle
    ? page.filter((chat) => {
        const names = Object.values(chat.profiles || {})
          .map((p) => `${p?.displayName || ''} ${p?.username || ''}`.toLowerCase())
          .join(' ');
        return (
          names.includes(needle) ||
          String(chat.lastMessage || '')
            .toLowerCase()
            .includes(needle) ||
          chat.participants.some((uid) => uid.toLowerCase().includes(needle))
        );
      })
    : page;
  const extra = snap.docs[take];
  return { chats, nextCursor: extra ? extra.id : null };
}

async function listAdminChatMessages(chatId, { limit = 200 } = {}) {
  const id = String(chatId || '').trim();
  const take = Math.min(400, Math.max(1, Math.floor(Number(limit) || 200)));
  if (!id) return { messages: [] };
  if (!firestoreConfigured()) return { messages: [] };
  const db = getAdminDb();
  let snap;
  try {
    snap = await db
      .collection('chats')
      .doc(id)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limit(take)
      .get();
  } catch {
    snap = await db.collection('chats').doc(id).collection('messages').limit(take).get();
  }
  const messages = snap.docs.map((doc) => {
    const data = doc.data() || {};
    const deleted = Boolean(data.deleted);
    return {
      id: doc.id,
      text: deleted ? '(eliminado)' : String(data.text || ''),
      fromUid: String(data.fromUid || ''),
      createdAt: asIso(data.createdAt),
      mediaUrl: deleted ? null : data.mediaUrl || null,
      mediaType: deleted ? null : data.mediaType || null,
      deleted,
    };
  });
  return { messages };
}

module.exports = {
  listAdminChats,
  listAdminChatMessages,
  mapChat,
};
module.exports.default = module.exports;
