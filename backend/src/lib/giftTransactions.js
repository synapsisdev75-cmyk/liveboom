const { createHash } = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { findGift } = require('./gifts');
const { getAdminDb, firestoreConfigured } = require('./firestoreAdmin');
const {
  normalizeBlastBalances,
  applySpend,
  applyCreditEarned,
  firestoreBalancePatch,
} = require('./blastBalances');
const { setBalances } = require('./walletMemory');

function clean(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function roomKey(value) {
  return clean(value, 80)
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]/g, '_');
}

function fail(message, status = 400, code = 'GIFT_INVALID') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

function sourceFromPost(post) {
  if (
    post?.postFormat === 'story' ||
    Number(post?.storyExpiresAtMs) > 0 ||
    ((post?.type === 'video' || post?.type === 'photo') && post?.visibility === 'circle')
  ) {
    return 'flashboom';
  }
  if (
    post?.type === 'video' &&
    post?.mediaUrl &&
    (post?.postFormat === 'post' ||
      (post?.postFormat == null && Number(post?.reelFeedUntilMs) > 0)) &&
    !(Number(post?.durationSec) > 90)
  ) {
    return 'boom_clip';
  }
  return 'publication';
}

function placementForSource(source) {
  if (source === 'publication') return 'post';
  if (source === 'boom_clip') return 'boom_clip';
  if (source === 'flashboom') return 'flashboom';
  if (source === 'private_gift') return 'chat';
  return 'live';
}

async function resolvedCatalogGift(db, giftId, source) {
  const fallback = findGift(giftId);
  const configSnap = await db.collection('config').doc('giftsCatalog').get();
  const configured = Array.isArray(configSnap.data()?.gifts)
    ? configSnap.data().gifts.find((item) => clean(item?.id, 80) === giftId)
    : null;

  if (configured) {
    if (configured.enabled === false) fail('Este regalo está deshabilitado', 409, 'GIFT_DISABLED');
    const placement = placementForSource(source);
    if (
      Array.isArray(configured.placements) &&
      !configured.placements.map(String).includes(placement)
    ) {
      fail('Este regalo no está disponible en este espacio', 400, 'GIFT_PLACEMENT_INVALID');
    }
    const coins = Math.max(0, Math.floor(Number(configured.coins) || 0));
    if (!coins) fail('El precio del regalo no es válido', 409, 'GIFT_PRICE_INVALID');
    return {
      id: giftId,
      name: clean(configured.name || fallback?.name || giftId, 100),
      emoji: clean(configured.emoji || fallback?.emoji || '🎁', 16),
      coins,
    };
  }

  if (!fallback) fail('Regalo no válido', 400, 'GIFT_NOT_FOUND');
  if (/^ar_/.test(fallback.id) && source !== 'live' && source !== 'battle') {
    fail('Este regalo solo está disponible en LIVE', 400, 'GIFT_PLACEMENT_INVALID');
  }
  return fallback;
}

async function findUserByUsername(db, username) {
  const key = clean(username, 48).toLowerCase().replace(/^@/, '');
  if (!key) return null;
  const snap = await db.collection('users').where('username', '==', key).limit(1).get();
  if (snap.empty) return null;
  return { uid: snap.docs[0].id, data: snap.docs[0].data() };
}

async function resolveGiftContext(db, input) {
  const postId = clean(input.postId, 128);
  if (postId) {
    const postSnap = await db.collection('posts').doc(postId).get();
    if (!postSnap.exists) fail('La publicación ya no existe', 404, 'GIFT_CONTENT_NOT_FOUND');
    const post = postSnap.data() || {};
    const recipientUid = clean(post.authorUid, 128);
    if (!recipientUid) fail('No encontramos al creador', 404, 'GIFT_RECIPIENT_NOT_FOUND');
    return {
      recipientUid,
      source: sourceFromPost(post),
      postId,
      roomName: '',
      roomRef: null,
      battleRef: null,
    };
  }

  const rawRoom = clean(input.roomName, 100);
  if (rawRoom && !rawRoom.toLowerCase().startsWith('chat:')) {
    const key = roomKey(rawRoom);
    const roomRef = db.collection('liveRooms').doc(key);
    const roomSnap = await roomRef.get();
    if (roomSnap.exists) {
      const room = roomSnap.data() || {};
      if (room.status !== 'live' || Number(room.endedAtMs) > 0) {
        fail('Esta transmisión ya terminó', 409, 'LIVE_ENDED');
      }
      const recipientUid = clean(room.hostUid, 128);
      if (!recipientUid) fail('No encontramos al anfitrión', 404, 'GIFT_RECIPIENT_NOT_FOUND');
      const battleId = clean(room.battleId, 128);
      return {
        recipientUid,
        source: battleId ? 'battle' : 'live',
        postId: '',
        roomName: key,
        roomRef,
        battleRef: battleId ? db.collection('liveBattles').doc(battleId) : null,
      };
    }
  }

  let recipientUid = clean(input.recipientUid, 128);
  if (!recipientUid) {
    const found = await findUserByUsername(db, input.recipientUsername);
    recipientUid = found?.uid || '';
  }
  if (!recipientUid) fail('No encontramos al creador', 404, 'GIFT_RECIPIENT_NOT_FOUND');
  return {
    recipientUid,
    source: 'private_gift',
    postId: '',
    roomName: '',
    roomRef: null,
    battleRef: null,
  };
}

function giftTransactionId(senderUid, clientId) {
  return `gift_${createHash('sha256')
    .update(`${senderUid}:${clientId}`)
    .digest('hex')
    .slice(0, 44)}`;
}

function battlePatch(battle, roomName, coins) {
  if (!battle || !roomName) return null;
  const key = roomKey(roomName);
  const side =
    key === roomKey(battle.hostAUsername || battle.hostALiveId)
      ? 'a'
      : key === roomKey(battle.hostBUsername || battle.hostBLiveId)
        ? 'b'
        : null;
  if (!side) return null;

  if (battle.status === 'live') {
    const now = Date.now();
    const hpA = Math.min(100, Math.max(0, Number(battle.hpA ?? 100)));
    const hpB = Math.min(100, Math.max(0, Number(battle.hpB ?? 100)));
    if (Number(battle.endsAtMs) > 0 && now >= Number(battle.endsAtMs)) {
      return {
        status: 'ended',
        endReason: 'timer',
        winnerSide: hpA > hpB ? 'a' : hpB > hpA ? 'b' : 'draw',
      };
    }
    const damage = Math.min(15, Math.max(0.5, coins * 0.05));
    const nextHpA = side === 'b' ? Math.max(0, hpA - damage) : hpA;
    const nextHpB = side === 'a' ? Math.max(0, hpB - damage) : hpB;
    const ko = nextHpA <= 0 || nextHpB <= 0;
    return {
      hpA: nextHpA,
      hpB: nextHpB,
      scoreA: Math.max(0, Number(battle.scoreA) || 0) + (side === 'a' ? damage : 0),
      scoreB: Math.max(0, Number(battle.scoreB) || 0) + (side === 'b' ? damage : 0),
      ...(ko
        ? {
            status: 'ended',
            endReason: 'ko',
            winnerSide: nextHpA > nextHpB ? 'a' : nextHpB > nextHpA ? 'b' : 'draw',
          }
        : {}),
    };
  }

  if (battle.status === 'active') {
    const multiplier = Math.max(1, Math.min(3, Number(battle.multiplierA) || 1));
    return {
      [side === 'a' ? 'scoreA' : 'scoreB']:
        Math.max(0, Number(battle[side === 'a' ? 'scoreA' : 'scoreB']) || 0) +
        coins * multiplier,
      [side === 'a' ? 'giftsA' : 'giftsB']:
        Math.max(0, Number(battle[side === 'a' ? 'giftsA' : 'giftsB']) || 0) + 1,
    };
  }
  return null;
}

function liveRoomPatch(room, senderUid, senderName, coins) {
  const gifters =
    room?.gifters && typeof room.gifters === 'object' ? { ...room.gifters } : {};
  const previous = gifters[senderUid] || {};
  gifters[senderUid] = {
    uid: senderUid,
    name: senderName,
    coins: Math.max(0, Number(previous.coins) || 0) + coins,
  };
  const topGifters = Object.values(gifters)
    .map((item) => ({
      uid: clean(item?.uid, 128),
      name: clean(item?.name || 'Liveboomer', 120),
      coins: Math.max(0, Number(item?.coins) || 0),
    }))
    .sort((a, b) => b.coins - a.coins)
    .slice(0, 5);
  const nextEarned = Math.max(0, Number(room?.coinsEarned) || 0) + coins;
  const patch = { coinsEarned: nextEarned, gifters, topGifters };

  const goal = room?.coinGoal && typeof room.coinGoal === 'object' ? { ...room.coinGoal } : null;
  if (goal?.status === 'ACTIVE') {
    const goalGifters =
      room?.coinGoalGifters && typeof room.coinGoalGifters === 'object'
        ? { ...room.coinGoalGifters }
        : {};
    const prevGoal = goalGifters[senderUid] || {};
    goalGifters[senderUid] = {
      uid: senderUid,
      name: senderName,
      coins: Math.max(0, Number(prevGoal.coins) || 0) + coins,
    };
    patch.coinGoalGifters = goalGifters;
    if (nextEarned - Math.max(0, Number(goal.baselineCoins) || 0) >= Number(goal.targetCoins)) {
      const top = Object.values(goalGifters).sort(
        (a, b) => Number(b?.coins || 0) - Number(a?.coins || 0),
      )[0];
      patch.coinGoal = {
        ...goal,
        status: 'COMPLETED',
        completedAt: Date.now(),
        topName: clean(top?.name, 120),
        topCoins: Math.max(0, Number(top?.coins) || 0),
      };
      const history = Array.isArray(room?.coinGoalHistory) ? room.coinGoalHistory : [];
      patch.coinGoalHistory = [...history, patch.coinGoal].slice(-20);
    }
  }
  return patch;
}

async function sendGiftTransaction(input) {
  if (!firestoreConfigured()) {
    fail('Los regalos no están disponibles temporalmente', 503, 'GIFT_STORE_UNAVAILABLE');
  }
  const senderUid = clean(input.senderUid, 128);
  const clientId = clean(input.clientId, 120);
  const senderName = clean(input.senderName || 'Liveboomer', 120);
  const giftId = clean(input.giftId, 80);
  const multiplier = [1, 2, 4, 8].includes(Number(input.multiplier))
    ? Number(input.multiplier)
    : 1;
  if (!senderUid || !clientId || !giftId) fail('Datos del regalo incompletos');

  const db = getAdminDb();
  const context = await resolveGiftContext(db, input);
  if (context.recipientUid === senderUid) fail('No puedes enviarte un regalo a ti mismo');
  const gift = await resolvedCatalogGift(db, giftId, context.source);
  const totalCoins = gift.coins * multiplier;
  const transactionId = giftTransactionId(senderUid, clientId);
  const transactionRef = db.collection('giftTransactions').doc(transactionId);
  const senderRef = db.collection('users').doc(senderUid);
  const recipientRef = db.collection('users').doc(context.recipientUid);
  const inboxRef = recipientRef.collection('giftInbox').doc(transactionId);
  const walletTxRef = db.collection('wallet_transactions').doc(transactionId);

  const result = await db.runTransaction(async (tx) => {
    const reads = [
      tx.get(transactionRef),
      tx.get(senderRef),
      tx.get(recipientRef),
      context.roomRef ? tx.get(context.roomRef) : Promise.resolve(null),
      context.battleRef ? tx.get(context.battleRef) : Promise.resolve(null),
    ];
    const [existing, senderSnap, recipientSnap, roomSnap, battleSnap] = await Promise.all(reads);
    if (existing.exists) {
      if (clean(existing.data()?.senderUid, 128) !== senderUid) {
        fail('Transacción de regalo inválida', 409, 'GIFT_ID_CONFLICT');
      }
      return {
        duplicate: true,
        senderBalances: normalizeBlastBalances(senderSnap.exists ? senderSnap.data() : {}),
        recipientBalances: normalizeBlastBalances(
          recipientSnap.exists ? recipientSnap.data() : {},
        ),
      };
    }
    if (!senderSnap.exists) fail('No encontramos tu billetera', 404, 'WALLET_NOT_FOUND');
    if (!recipientSnap.exists) fail('No encontramos al creador', 404, 'GIFT_RECIPIENT_NOT_FOUND');

    const spent = applySpend(
      normalizeBlastBalances(senderSnap.data()),
      totalCoins,
      true,
    );
    if (!spent.ok || spent.remainingCharge > 0) {
      fail('Saldo insuficiente', 402, 'INSUFFICIENT_BLAST');
    }
    const recipientBalances = applyCreditEarned(
      normalizeBlastBalances(recipientSnap.data()),
      totalCoins,
    );
    const now = Date.now();
    const record = {
      id: transactionId,
      clientId,
      senderUid,
      senderName,
      recipientUid: context.recipientUid,
      giftId: gift.id,
      giftName: gift.name,
      emoji: gift.emoji,
      coins: totalCoins,
      unitCoins: gift.coins,
      multiplier,
      source: context.source,
      postId: context.postId || null,
      roomName: context.roomName || null,
      chargedPurchased: spent.chargedPurchased,
      chargedEarned: spent.chargedEarned,
      createdAtMs: now,
      createdAt: FieldValue.serverTimestamp(),
    };

    tx.update(senderRef, {
      ...firestoreBalancePatch(spent.balances),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(recipientRef, {
      ...firestoreBalancePatch(recipientBalances),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(transactionRef, record);
    tx.create(inboxRef, {
      ...record,
      processed: true,
      processedAtMs: now,
    });
    tx.create(walletTxRef, {
      ...record,
      type: 'gift',
      blast: totalCoins,
    });

    if (context.roomRef && roomSnap?.exists) {
      const room = roomSnap.data() || {};
      tx.set(
        context.roomRef,
        {
          ...liveRoomPatch(room, senderUid, senderName, totalCoins),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.create(context.roomRef.collection('gifts').doc(transactionId), record);
    }
    if (context.battleRef && battleSnap?.exists) {
      const patch = battlePatch(battleSnap.data(), context.roomName, totalCoins);
      if (patch) {
        tx.set(
          context.battleRef,
          { ...patch, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
    }

    return {
      duplicate: false,
      senderBalances: spent.balances,
      recipientBalances,
      record,
    };
  });

  setBalances(senderUid, result.senderBalances);
  setBalances(context.recipientUid, result.recipientBalances);
  return {
    ...result,
    context,
    gift: {
      id: transactionId,
      clientId,
      giftId: gift.id,
      giftName: gift.name,
      emoji: gift.emoji,
      coins: totalCoins,
      multiplier,
      senderName,
      senderUid,
      source: context.source,
    },
  };
}

module.exports = {
  sendGiftTransaction,
  sourceFromPost,
  battlePatch,
};
