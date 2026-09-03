const { FieldValue } = require('firebase-admin/firestore');
const { getAdminDb } = require('./firestoreAdmin');
const { createLivekitToken, livekitEnabled } = require('./livekit');

const BATTLE_DURATION_MS = 5 * 60 * 1000;
const INVITE_TTL_MS = 20 * 1000;
const COUNTDOWN_MS = 3500;
const GRACE_MS = 25 * 1000;

function roomKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}

function newBattleId() {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function battleLivekitRoom(battleId) {
  return `lb_battle_${String(battleId || '').trim()}`.slice(0, 64);
}

function isBattleLivekitRoom(name) {
  return /^lb_battle_/i.test(String(name || ''));
}

function phaseMultiplier(startedAt, endsAt, now = Date.now()) {
  const start = Number(startedAt) || 0;
  const end = Number(endsAt) || 0;
  if (!start || !end || end <= start || now < start) return 1;
  const t = (now - start) / (end - start);
  if (t >= 0.8) return 3;
  if (t >= 0.4) return 2;
  return 1;
}

function parseBattle(id, data) {
  if (!data) return null;
  return {
    id,
    ...data,
    livekitRoom: data.livekitRoom || battleLivekitRoom(id),
    scoreA: Math.max(0, Number(data.scoreA) || 0),
    scoreB: Math.max(0, Number(data.scoreB) || 0),
    multiplierA: Math.max(1, Math.min(3, Number(data.multiplierA) || 1)),
    multiplierB: Math.max(1, Math.min(3, Number(data.multiplierB) || 1)),
    teamA: Array.isArray(data.teamA) ? data.teamA : [data.hostAUserId].filter(Boolean),
    teamB: Array.isArray(data.teamB) ? data.teamB : [data.hostBUserId].filter(Boolean),
  };
}

async function readBattle(battleId) {
  const id = String(battleId || '').trim();
  if (!id) return null;
  const snap = await getAdminDb().collection('liveBattles').doc(id).get();
  if (!snap.exists) return null;
  return parseBattle(snap.id, snap.data());
}

async function readLiveRoom(username) {
  const key = roomKey(username);
  if (!key) return null;
  const snap = await getAdminDb().collection('liveRooms').doc(key).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function clearRoomBattle(username) {
  const key = roomKey(username);
  if (!key) return;
  await getAdminDb()
    .collection('liveRooms')
    .doc(key)
    .set(
      {
        battleId: FieldValue.delete(),
        incomingBattle: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

async function createInvite({
  fromUserId,
  fromUsername,
  fromName,
  toUserId,
  toUsername,
  toName,
  mode = 'solo',
}) {
  const a = roomKey(fromUsername);
  const b = roomKey(toUsername);
  if (!a || !b || a === b) {
    const err = new Error('Elige otro creador en vivo');
    err.status = 400;
    throw err;
  }
  if (!toUserId || !fromUserId) {
    const err = new Error('Usuarios inválidos');
    err.status = 400;
    throw err;
  }

  const [roomA, roomB] = await Promise.all([readLiveRoom(a), readLiveRoom(b)]);
  if (!roomA || roomA.status !== 'live') {
    const err = new Error('Tu LIVE no está activo');
    err.status = 400;
    throw err;
  }
  if (!roomB || roomB.status !== 'live') {
    const err = new Error('Ese usuario no está en LIVE ahora');
    err.status = 400;
    throw err;
  }
  if (roomA.battleId || roomA.incomingBattle) {
    const err = new Error('Ya estás en una batalla');
    err.status = 409;
    throw err;
  }
  if (roomB.battleId || roomB.incomingBattle) {
    const err = new Error('Ese creador ya está en una batalla');
    err.status = 409;
    throw err;
  }
  if (roomB.vsDisabled === true) {
    const err = new Error('Ese creador no recibe invitaciones VS');
    err.status = 403;
    throw err;
  }

  const id = newBattleId();
  const now = Date.now();
  const livekitRoom = battleLivekitRoom(id);
  const battle = {
    hostAUserId: fromUserId,
    hostBUserId: toUserId,
    hostALiveId: a,
    hostBLiveId: b,
    hostAIdentity: fromUserId,
    hostBIdentity: toUserId,
    hostAUsername: a,
    hostBUsername: b,
    hostAName: fromName || a,
    hostBName: toName || b,
    // Compat con clientes previos
    hostAUid: fromUserId,
    hostBUid: toUserId,
    teamA: [fromUserId],
    teamB: [toUserId],
    mode: mode === 'team' ? 'team' : 'solo',
    scoreA: 0,
    scoreB: 0,
    multiplierA: 1,
    multiplierB: 1,
    status: 'inviting',
    livekitRoom,
    channel: livekitRoom,
    inviteExpiresAt: now + INVITE_TTL_MS,
    createdAt: now,
    readyA: false,
    readyB: false,
    giftsA: 0,
    giftsB: 0,
  };

  const db = getAdminDb();
  await db.collection('liveBattles').doc(id).set({
    ...battle,
    createdAtTs: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection('liveRooms').doc(a).set(
    { battleId: id, incomingBattle: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await db.collection('liveRooms').doc(b).set(
    {
      incomingBattle: {
        battleId: id,
        fromUid: fromUserId,
        fromUsername: a,
        fromName: fromName || a,
        expiresAt: now + INVITE_TTL_MS,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await db.collection('users').doc(toUserId).collection('liveAlerts').add({
    kind: 'battle',
    battleId: id,
    hostUid: fromUserId,
    hostUsername: a,
    hostName: fromName || a,
    title: `${fromName || a} te invita a Batalla Boom`,
    href: `/stream/${encodeURIComponent(b)}?battleAccept=${encodeURIComponent(id)}`,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: now,
  });

  return parseBattle(id, battle);
}

async function expireIfNeeded(battle) {
  if (!battle || battle.status !== 'inviting') return battle;
  if (Number(battle.inviteExpiresAt || 0) > Date.now()) return battle;
  await getAdminDb().collection('liveBattles').doc(battle.id).set(
    { status: 'cancelled', cancelReason: 'expired', updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await Promise.all([clearRoomBattle(battle.hostAUsername), clearRoomBattle(battle.hostBUsername)]);
  return { ...battle, status: 'cancelled', cancelReason: 'expired' };
}

async function acceptInvite(battleId, userId) {
  let battle = await readBattle(battleId);
  if (!battle) {
    const err = new Error('La invitación ya no existe');
    err.status = 404;
    throw err;
  }
  battle = await expireIfNeeded(battle);
  if (battle.status === 'cancelled' && battle.cancelReason === 'expired') {
    const err = new Error('La invitación expiró');
    err.status = 410;
    throw err;
  }
  if (battle.hostBUserId !== userId && battle.hostBUid !== userId) {
    const err = new Error('Esta batalla no es para ti');
    err.status = 403;
    throw err;
  }
  if (['connecting', 'countdown', 'active'].includes(battle.status)) {
    return battle;
  }
  if (battle.status !== 'inviting' && battle.status !== 'accepted') {
    const err = new Error('La batalla ya no está disponible');
    err.status = 409;
    throw err;
  }

  const [roomA, roomB] = await Promise.all([
    readLiveRoom(battle.hostAUsername),
    readLiveRoom(battle.hostBUsername),
  ]);
  if (!roomA || roomA.status !== 'live' || !roomB || roomB.status !== 'live') {
    const err = new Error('Ambos LIVE deben seguir activos');
    err.status = 409;
    throw err;
  }

  const now = Date.now();
  const patch = {
    status: 'connecting',
    acceptedAt: now,
    readyA: false,
    readyB: false,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await getAdminDb().collection('liveBattles').doc(battle.id).set(patch, { merge: true });
  await getAdminDb()
    .collection('liveRooms')
    .doc(roomKey(battle.hostBUsername))
    .set(
      { battleId: battle.id, incomingBattle: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  return { ...battle, ...patch, updatedAt: undefined };
}

async function declineInvite(battleId, userId, { disableVs = false } = {}) {
  const battle = await readBattle(battleId);
  if (!battle) return null;
  const isB = battle.hostBUserId === userId || battle.hostBUid === userId;
  const isA = battle.hostAUserId === userId || battle.hostAUid === userId;
  if (!isA && !isB) {
    const err = new Error('No puedes rechazar esta batalla');
    err.status = 403;
    throw err;
  }
  await getAdminDb().collection('liveBattles').doc(battle.id).set(
    { status: 'cancelled', cancelReason: 'rejected', updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await Promise.all([clearRoomBattle(battle.hostAUsername), clearRoomBattle(battle.hostBUsername)]);
  if (disableVs && isB) {
    await getAdminDb()
      .collection('liveRooms')
      .doc(roomKey(battle.hostBUsername))
      .set({ vsDisabled: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { ...battle, status: 'cancelled', cancelReason: 'rejected' };
}

async function markReady(battleId, userId) {
  let battle = await readBattle(battleId);
  if (!battle) {
    const err = new Error('Batalla no encontrada');
    err.status = 404;
    throw err;
  }
  const isA = battle.hostAUserId === userId || battle.hostAUid === userId;
  const isB = battle.hostBUserId === userId || battle.hostBUid === userId;
  if (!isA && !isB) {
    const err = new Error('Solo los hosts pueden marcar listo');
    err.status = 403;
    throw err;
  }
  if (!['connecting', 'countdown', 'accepted'].includes(battle.status)) {
    return battle;
  }

  const patch = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (isA) patch.readyA = true;
  if (isB) patch.readyB = true;

  const nextReadyA = isA ? true : Boolean(battle.readyA);
  const nextReadyB = isB ? true : Boolean(battle.readyB);

  if (nextReadyA && nextReadyB && battle.status !== 'countdown' && battle.status !== 'active') {
    const now = Date.now();
    patch.status = 'countdown';
    patch.countdownAt = now;
    patch.startedAt = now + COUNTDOWN_MS;
    patch.endsAt = now + COUNTDOWN_MS + BATTLE_DURATION_MS;
    // Compat
    patch.startedAtMs = patch.startedAt;
    patch.endsAtMs = patch.endsAt;
  }

  await getAdminDb().collection('liveBattles').doc(battle.id).set(patch, { merge: true });
  return { ...battle, ...patch, readyA: nextReadyA, readyB: nextReadyB, updatedAt: undefined };
}

async function promoteCountdownToActive(battle) {
  if (!battle || battle.status !== 'countdown') return battle;
  const startedAt = Number(battle.startedAt || battle.startedAtMs || 0);
  if (!startedAt || Date.now() < startedAt) return battle;
  const endsAt =
    Number(battle.endsAt || battle.endsAtMs || 0) || startedAt + BATTLE_DURATION_MS;
  const mult = phaseMultiplier(startedAt, endsAt);
  await getAdminDb().collection('liveBattles').doc(battle.id).set(
    {
      status: 'active',
      multiplierA: mult,
      multiplierB: mult,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return {
    ...battle,
    status: 'active',
    startedAt,
    endsAt,
    startedAtMs: startedAt,
    endsAtMs: endsAt,
    multiplierA: mult,
    multiplierB: mult,
  };
}

async function finishBattle(battleId, { reason = 'timer' } = {}) {
  const battle = await readBattle(battleId);
  if (!battle) return null;
  if (battle.status === 'finished') return battle;
  if (!['active', 'countdown', 'connecting'].includes(battle.status)) {
    return battle;
  }

  const scoreA = Math.max(0, Number(battle.scoreA) || 0);
  const scoreB = Math.max(0, Number(battle.scoreB) || 0);
  let winnerUserId = null;
  if (scoreA > scoreB) winnerUserId = battle.hostAUserId || battle.hostAUid;
  else if (scoreB > scoreA) winnerUserId = battle.hostBUserId || battle.hostBUid;

  const patch = {
    status: 'finished',
    finishedAt: Date.now(),
    finishReason: reason,
    winnerUserId,
    scoreA,
    scoreB,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await getAdminDb().collection('liveBattles').doc(battle.id).set(patch, { merge: true });
  return { ...battle, ...patch, updatedAt: undefined };
}

async function leaveBattle(battleId, userId) {
  const battle = await readBattle(battleId);
  if (!battle) return null;
  const isA = battle.hostAUserId === userId || battle.hostAUid === userId;
  const isB = battle.hostBUserId === userId || battle.hostBUid === userId;
  if (!isA && !isB) {
    const err = new Error('No eres participante');
    err.status = 403;
    throw err;
  }

  if (battle.status === 'active' || battle.status === 'countdown') {
    const winnerUserId = isA
      ? battle.hostBUserId || battle.hostBUid
      : battle.hostAUserId || battle.hostAUid;
    await getAdminDb().collection('liveBattles').doc(battle.id).set(
      {
        status: 'finished',
        finishedAt: Date.now(),
        finishReason: 'left',
        winnerUserId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } else if (battle.status !== 'finished') {
    await getAdminDb().collection('liveBattles').doc(battle.id).set(
      {
        status: 'cancelled',
        cancelReason: 'left',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await Promise.all([clearRoomBattle(battle.hostAUsername), clearRoomBattle(battle.hostBUsername)]);
  return readBattle(battleId);
}

async function exitToNormal(battleId) {
  const battle = await readBattle(battleId);
  if (!battle) return null;
  if (battle.status !== 'finished' && battle.status !== 'cancelled') {
    await getAdminDb().collection('liveBattles').doc(battle.id).set(
      { status: 'finished', finishedAt: Date.now(), finishReason: 'exit', updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await Promise.all([clearRoomBattle(battle.hostAUsername), clearRoomBattle(battle.hostBUsername)]);
  return battle;
}

async function rematch(battleId, userId) {
  const prev = await readBattle(battleId);
  if (!prev || prev.status !== 'finished') {
    const err = new Error('Solo puedes pedir revancha al terminar');
    err.status = 409;
    throw err;
  }
  const isA = prev.hostAUserId === userId || prev.hostAUid === userId;
  const isB = prev.hostBUserId === userId || prev.hostBUid === userId;
  if (!isA && !isB) {
    const err = new Error('No eres participante');
    err.status = 403;
    throw err;
  }
  return createInvite({
    fromUserId: userId,
    fromUsername: isA ? prev.hostAUsername : prev.hostBUsername,
    fromName: isA ? prev.hostAName : prev.hostBName,
    toUserId: isA ? prev.hostBUserId || prev.hostBUid : prev.hostAUserId || prev.hostAUid,
    toUsername: isA ? prev.hostBUsername : prev.hostAUsername,
    toName: isA ? prev.hostBName : prev.hostAName,
    mode: prev.mode || 'solo',
  });
}

async function applyGiftScore(roomName, giftCoins) {
  const amount = Math.max(0, Math.floor(Number(giftCoins) || 0));
  if (!amount) return null;
  const room = await readLiveRoom(roomName);
  const battleId = String(room?.battleId || '').trim();
  if (!battleId) return null;

  let battle = await readBattle(battleId);
  if (!battle) return null;
  battle = await promoteCountdownToActive(battle);

  if (battle.status === 'countdown') {
    // Aún no suma hasta active
    return null;
  }
  if (battle.status !== 'active') return null;

  const endsAt = Number(battle.endsAt || battle.endsAtMs || 0);
  if (endsAt && Date.now() >= endsAt) {
    await finishBattle(battle.id, { reason: 'timer' });
    return null;
  }

  const key = roomKey(roomName);
  const isA = key === roomKey(battle.hostAUsername) || key === roomKey(battle.hostALiveId);
  const isB = key === roomKey(battle.hostBUsername) || key === roomKey(battle.hostBLiveId);
  if (!isA && !isB) return null;

  const startedAt = Number(battle.startedAt || battle.startedAtMs || 0);
  const mult = phaseMultiplier(startedAt, endsAt);
  const points = amount * mult;
  const scoreField = isA ? 'scoreA' : 'scoreB';
  const giftsField = isA ? 'giftsA' : 'giftsB';
  const multField = isA ? 'multiplierA' : 'multiplierB';

  await getAdminDb()
    .collection('liveBattles')
    .doc(battle.id)
    .set(
      {
        [scoreField]: FieldValue.increment(points),
        [giftsField]: FieldValue.increment(1),
        multiplierA: mult,
        multiplierB: mult,
        [multField]: mult,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return {
    battleId: battle.id,
    side: isA ? 'A' : 'B',
    points,
    multiplier: mult,
  };
}

async function mintBattleToken({ battleId, userId, displayName, asHost }) {
  if (!livekitEnabled()) {
    const err = new Error('LiveKit no configurado');
    err.status = 503;
    throw err;
  }
  let battle = await readBattle(battleId);
  if (!battle) {
    const err = new Error('Batalla no encontrada');
    err.status = 404;
    throw err;
  }
  battle = await expireIfNeeded(battle);
  battle = await promoteCountdownToActive(battle);

  const livekitRoom = battle.livekitRoom || battleLivekitRoom(battle.id);
  const isHostA = battle.hostAUserId === userId || battle.hostAUid === userId;
  const isHostB = battle.hostBUserId === userId || battle.hostBUid === userId;
  const publisher = Boolean(asHost && (isHostA || isHostB));

  const identity = publisher
    ? userId
    : `v_${String(userId || 'anon').slice(0, 12)}_${Math.random().toString(36).slice(2, 7)}`;

  const token = await createLivekitToken({
    identity,
    name: displayName || identity,
    room: livekitRoom,
    canPublish: publisher,
  });

  return {
    token,
    url: process.env.LIVEKIT_URL,
    room: livekitRoom,
    identity,
    canPublish: publisher,
    battleId: battle.id,
    status: battle.status,
  };
}

async function tickBattle(battleId) {
  let battle = await readBattle(battleId);
  if (!battle) return null;
  battle = await expireIfNeeded(battle);
  battle = await promoteCountdownToActive(battle);
  if (battle.status === 'active') {
    const endsAt = Number(battle.endsAt || battle.endsAtMs || 0);
    if (endsAt && Date.now() >= endsAt) {
      return finishBattle(battle.id, { reason: 'timer' });
    }
    const startedAt = Number(battle.startedAt || battle.startedAtMs || 0);
    const mult = phaseMultiplier(startedAt, endsAt);
    if (mult !== battle.multiplierA || mult !== battle.multiplierB) {
      await getAdminDb().collection('liveBattles').doc(battle.id).set(
        { multiplierA: mult, multiplierB: mult, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      battle = { ...battle, multiplierA: mult, multiplierB: mult };
    }
  }
  return battle;
}

module.exports = {
  BATTLE_DURATION_MS,
  INVITE_TTL_MS,
  COUNTDOWN_MS,
  GRACE_MS,
  battleLivekitRoom,
  isBattleLivekitRoom,
  phaseMultiplier,
  readBattle,
  createInvite,
  acceptInvite,
  declineInvite,
  markReady,
  finishBattle,
  leaveBattle,
  exitToNormal,
  rematch,
  applyGiftScore,
  mintBattleToken,
  tickBattle,
  roomKey,
};
