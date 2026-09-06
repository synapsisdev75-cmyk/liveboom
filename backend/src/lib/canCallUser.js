const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'liveboom-app';

function chatIdFor(a, b) {
  return [String(a || ''), String(b || '')].sort().join('_');
}

function callRoomName(chatId) {
  return `dm_${String(chatId || '')}`.slice(0, 64);
}

function otherUidFromChatId(chatId, me) {
  const id = String(chatId || '');
  const uid = String(me || '');
  if (!id || !uid) return null;
  if (id.startsWith(`${uid}_`)) return id.slice(uid.length + 1) || null;
  if (id.endsWith(`_${uid}`)) return id.slice(0, id.length - uid.length - 1) || null;
  return null;
}

function unwrapValue(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.stringValue != null) return value.stringValue;
  if (value.booleanValue != null) return value.booleanValue;
  if (value.integerValue != null) return Number(value.integerValue);
  if (value.doubleValue != null) return Number(value.doubleValue);
  if (value.timestampValue != null) return value.timestampValue;
  if (value.nullValue !== undefined) return null;
  if (value.mapValue && value.mapValue.fields) return unwrapFields(value.mapValue.fields);
  if (value.arrayValue && Array.isArray(value.arrayValue.values)) {
    return value.arrayValue.values.map(unwrapValue);
  }
  return null;
}

function unwrapFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    out[key] = unwrapValue(value);
  }
  return out;
}

function bearerFromReq(req) {
  const header = String(req?.headers?.authorization || '');
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

async function firestoreGet(docPath, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`firestore ${res.status}`);
    err.status = res.status;
    err.body = text.slice(0, 200);
    throw err;
  }
  return res.json();
}

function friendDocAccepted(snap) {
  if (!snap) return false;
  const data = unwrapFields(snap.fields);
  const status = data.status;
  if (status == null || status === '') return true;
  return String(status).toLowerCase() === 'accepted';
}

function permissionsFromFlags({ blocked, friend, follower }) {
  if (blocked) {
    return { relationship: 'blocked', canMessage: false, canVoiceCall: false, canVideoCall: false };
  }
  if (friend) {
    return { relationship: 'friend', canMessage: true, canVoiceCall: true, canVideoCall: true };
  }
  if (follower) {
    return { relationship: 'follower', canMessage: true, canVoiceCall: false, canVideoCall: false };
  }
  return { relationship: 'none', canMessage: false, canVoiceCall: false, canVideoCall: false };
}

async function getCommunicationPermissions(currentUserId, targetUserId, idToken) {
  const a = String(currentUserId || '').trim();
  const b = String(targetUserId || '').trim();
  if (!a || !b || a === b || !idToken) {
    return { relationship: 'none', canMessage: false, canVoiceCall: false, canVideoCall: false };
  }
  const [blockedAb, blockedBa, friendAb, friendBa, followAb, followBa] = await Promise.all([
    firestoreGet(`users/${a}/blocked/${b}`, idToken),
    firestoreGet(`users/${b}/blocked/${a}`, idToken),
    firestoreGet(`users/${a}/friends/${b}`, idToken),
    firestoreGet(`users/${b}/friends/${a}`, idToken),
    firestoreGet(`users/${a}/following/${b}`, idToken),
    firestoreGet(`users/${b}/following/${a}`, idToken),
  ]);
  return permissionsFromFlags({
    blocked: Boolean(blockedAb || blockedBa),
    friend: friendDocAccepted(friendAb) && friendDocAccepted(friendBa),
    follower: Boolean(followAb || followBa),
  });
}

async function isAcceptedFriend(currentUserId, targetUserId, idToken) {
  const perms = await getCommunicationPermissions(currentUserId, targetUserId, idToken);
  return perms.relationship === 'friend';
}

async function canCallUser(currentUserId, targetUserId, idToken) {
  const perms = await getCommunicationPermissions(currentUserId, targetUserId, idToken);
  return perms.canVoiceCall;
}

function isActiveCall(call, callId, me) {
  if (!call || typeof call !== 'object') return false;
  if (callId && call.id && String(call.id) !== String(callId)) return false;
  const status = String(call.status || '');
  if (status && status !== 'ringing' && status !== 'active') return false;
  const members = [call.fromUid, call.toUid, call.callerId, call.receiverId].filter(Boolean);
  if (members.length > 0 && !members.includes(me)) return false;
  return true;
}

async function loadChatCall(chatId, idToken) {
  const snap = await firestoreGet(`chats/${chatId}`, idToken);
  if (!snap) return null;
  const data = unwrapFields(snap.fields);
  return data.call && typeof data.call === 'object' ? data.call : null;
}

module.exports = {
  chatIdFor,
  callRoomName,
  otherUidFromChatId,
  bearerFromReq,
  firestoreGet,
  unwrapFields,
  getCommunicationPermissions,
  isAcceptedFriend,
  canCallUser,
  isActiveCall,
  loadChatCall,
};
