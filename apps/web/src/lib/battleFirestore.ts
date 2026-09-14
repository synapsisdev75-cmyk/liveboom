import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { roomKey } from './roomKey';
import { battleChannel, newBattleId } from './agoraBattleId';
import {
  BATTLE_HP_MAX,
  applyGiftDamageToOpponent,
  clampBattleHp,
  normalizeBattleDurationMs,
  resolveBattleWinner,
  type BattleEndReason,
  type BattleWinnerSide,
} from './battleHp';

export type LiveBattleStatus = 'pending' | 'live' | 'ended' | 'declined';

export type LiveBattle = {
  id: string;
  channel: string;
  status: LiveBattleStatus;
  hostAUid: string;
  hostAUsername: string;
  hostAName: string;
  hostBUid: string;
  hostBUsername: string;
  hostBName: string;
  /** Daño acumulado infligido (analytics / FX). */
  scoreA: number;
  scoreB: number;
  /** Vida restante 0–100. */
  hpA: number;
  hpB: number;
  durationMs: number;
  startedAtMs: number;
  endsAtMs: number;
  endReason: BattleEndReason | null;
  winnerSide: BattleWinnerSide | null;
};

export type IncomingBattle = {
  battleId: string;
  fromUid: string;
  fromUsername: string;
  fromName: string;
};

export type RoomBattleState = {
  battleId: string | null;
  incoming: IncomingBattle | null;
};

function parseBattle(id: string, data: Record<string, unknown> | undefined): LiveBattle | null {
  if (!data) return null;
  const status = data.status;
  if (status !== 'pending' && status !== 'live' && status !== 'ended' && status !== 'declined') {
    return null;
  }
  const endReasonRaw = data.endReason;
  const endReason: BattleEndReason | null =
    endReasonRaw === 'timer' || endReasonRaw === 'ko' || endReasonRaw === 'forfeit'
      ? endReasonRaw
      : null;
  const winnerRaw = data.winnerSide;
  const winnerSide: BattleWinnerSide | null =
    winnerRaw === 'a' || winnerRaw === 'b' || winnerRaw === 'draw' ? winnerRaw : null;
  const hpA =
    data.hpA != null ? clampBattleHp(data.hpA) : BATTLE_HP_MAX;
  const hpB =
    data.hpB != null ? clampBattleHp(data.hpB) : BATTLE_HP_MAX;
  return {
    id,
    channel: String(data.channel || battleChannel(id)),
    status,
    hostAUid: String(data.hostAUid || ''),
    hostAUsername: String(data.hostAUsername || ''),
    hostAName: String(data.hostAName || data.hostAUsername || ''),
    hostBUid: String(data.hostBUid || ''),
    hostBUsername: String(data.hostBUsername || ''),
    hostBName: String(data.hostBName || data.hostBUsername || ''),
    scoreA: Math.max(0, Number(data.scoreA) || 0),
    scoreB: Math.max(0, Number(data.scoreB) || 0),
    hpA,
    hpB,
    durationMs: normalizeBattleDurationMs(data.durationMs),
    startedAtMs: Number(data.startedAtMs) || 0,
    endsAtMs: Number(data.endsAtMs) || 0,
    endReason,
    winnerSide,
  };
}

async function clearRoomBattlePointers(hostAUsername: string, hostBUsername: string) {
  await Promise.all([
    setDoc(
      doc(db, 'liveRooms', roomKey(hostAUsername)),
      { battleId: deleteField(), incomingBattle: deleteField(), updatedAt: serverTimestamp() },
      { merge: true },
    ),
    setDoc(
      doc(db, 'liveRooms', roomKey(hostBUsername)),
      { battleId: deleteField(), incomingBattle: deleteField(), updatedAt: serverTimestamp() },
      { merge: true },
    ),
  ]);
}

export function listenLiveBattle(
  battleId: string,
  onChange: (battle: LiveBattle | null) => void,
): Unsubscribe {
  const id = String(battleId || '').trim();
  if (!id) {
    onChange(null);
    return () => undefined;
  }
  return onSnapshot(
    doc(db, 'liveBattles', id),
    (snap) => onChange(snap.exists() ? parseBattle(snap.id, snap.data()) : null),
    () => onChange(null),
  );
}

export function listenRoomBattleState(
  roomName: string,
  onChange: (state: RoomBattleState) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'liveRooms', roomKey(roomName)),
    (snap) => {
      const data = snap.data();
      const incomingRaw = data?.incomingBattle as IncomingBattle | undefined;
      const incoming =
        incomingRaw?.battleId && incomingRaw.fromUsername
          ? {
              battleId: String(incomingRaw.battleId),
              fromUid: String(incomingRaw.fromUid || ''),
              fromUsername: String(incomingRaw.fromUsername),
              fromName: String(incomingRaw.fromName || incomingRaw.fromUsername),
            }
          : null;
      onChange({
        battleId: data?.battleId ? String(data.battleId) : null,
        incoming,
      });
    },
    () => onChange({ battleId: null, incoming: null }),
  );
}

export async function createBattleInvite(input: {
  hostAUid: string;
  hostAUsername: string;
  hostAName: string;
  hostBUid: string;
  hostBUsername: string;
  hostBName: string;
  durationMs?: number;
}): Promise<string> {
  const a = roomKey(input.hostAUsername);
  const b = roomKey(input.hostBUsername);
  if (!a || !b || a === b) throw new Error('Elige otro creador en vivo');
  if (!input.hostBUid) throw new Error('No se encontró al oponente');

  const opponentRoom = await getDoc(doc(db, 'liveRooms', b));
  if (!opponentRoom.exists() || opponentRoom.data()?.status !== 'live') {
    throw new Error('Ese usuario no está en LIVE ahora');
  }
  if (opponentRoom.data()?.battleId || opponentRoom.data()?.incomingBattle) {
    throw new Error('Ese creador ya está en una batalla');
  }

  const id = newBattleId();
  const channel = battleChannel(id);
  const durationMs = normalizeBattleDurationMs(input.durationMs);
  await setDoc(doc(db, 'liveBattles', id), {
    channel,
    status: 'pending',
    hostAUid: input.hostAUid,
    hostAUsername: a,
    hostAName: input.hostAName,
    hostBUid: input.hostBUid,
    hostBUsername: b,
    hostBName: input.hostBName,
    scoreA: 0,
    scoreB: 0,
    hpA: BATTLE_HP_MAX,
    hpB: BATTLE_HP_MAX,
    durationMs,
    startedAtMs: 0,
    endsAtMs: 0,
    endReason: null,
    winnerSide: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, 'liveRooms', a),
    { battleId: id, incomingBattle: deleteField(), updatedAt: serverTimestamp() },
    { merge: true },
  );
  await setDoc(
    doc(db, 'liveRooms', b),
    {
      incomingBattle: {
        battleId: id,
        fromUid: input.hostAUid,
        fromUsername: a,
        fromName: input.hostAName,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await addDoc(collection(db, 'users', input.hostBUid, 'liveAlerts'), {
    kind: 'battle',
    battleId: id,
    hostUid: input.hostAUid,
    hostUsername: a,
    hostName: input.hostAName,
    title: `${input.hostAName} te reta a una Batalla Boom`,
    href: `/stream/${encodeURIComponent(input.hostBUsername)}?battleAccept=${encodeURIComponent(id)}`,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  return id;
}

export async function acceptBattle(battleId: string, uid: string) {
  const snap = await getDoc(doc(db, 'liveBattles', battleId));
  if (!snap.exists()) throw new Error('La invitación ya no existe');
  const battle = parseBattle(snap.id, snap.data());
  if (!battle || battle.hostBUid !== uid) throw new Error('Esta batalla no es para ti');
  if (battle.status === 'live') return battle;
  if (battle.status !== 'pending') throw new Error('La batalla ya no está disponible');
  const now = Date.now();
  const endsAtMs = now + battle.durationMs;
  await updateDoc(snap.ref, {
    status: 'live',
    hpA: BATTLE_HP_MAX,
    hpB: BATTLE_HP_MAX,
    scoreA: 0,
    scoreB: 0,
    startedAtMs: now,
    endsAtMs,
    endReason: null,
    winnerSide: null,
    updatedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, 'liveRooms', roomKey(battle.hostBUsername)),
    { battleId: battle.id, incomingBattle: deleteField(), updatedAt: serverTimestamp() },
    { merge: true },
  );
  return {
    ...battle,
    status: 'live' as const,
    hpA: BATTLE_HP_MAX,
    hpB: BATTLE_HP_MAX,
    scoreA: 0,
    scoreB: 0,
    startedAtMs: now,
    endsAtMs,
    endReason: null,
    winnerSide: null,
  };
}

export async function declineBattle(battleId: string) {
  const snap = await getDoc(doc(db, 'liveBattles', battleId));
  if (!snap.exists()) return;
  const battle = parseBattle(snap.id, snap.data());
  if (!battle) return;
  await updateDoc(snap.ref, { status: 'declined', updatedAt: serverTimestamp() }).catch(() => undefined);
  await clearRoomBattlePointers(battle.hostAUsername, battle.hostBUsername);
}

/** Cierra la batalla con ganador. Mantiene battleId en rooms para pantalla de resultado. */
export async function finishBattle(
  battleId: string,
  opts?: { reason?: BattleEndReason; clearRooms?: boolean },
) {
  const reason = opts?.reason || 'timer';
  const snap = await getDoc(doc(db, 'liveBattles', battleId));
  if (!snap.exists()) return null;
  const battle = parseBattle(snap.id, snap.data());
  if (!battle) return null;
  if (battle.status === 'ended') {
    if (opts?.clearRooms) {
      await clearRoomBattlePointers(battle.hostAUsername, battle.hostBUsername);
    }
    return battle;
  }
  if (battle.status !== 'live') return battle;

  const winnerSide =
    reason === 'forfeit' && battle.winnerSide
      ? battle.winnerSide
      : resolveBattleWinner(battle.hpA, battle.hpB);

  await updateDoc(snap.ref, {
    status: 'ended',
    endReason: reason,
    winnerSide,
    updatedAt: serverTimestamp(),
  });

  if (opts?.clearRooms) {
    await clearRoomBattlePointers(battle.hostAUsername, battle.hostBUsername);
  }

  return {
    ...battle,
    status: 'ended' as const,
    endReason: reason,
    winnerSide,
  };
}

/** @deprecated Prefer finishBattle — mantiene compat con Terminar/timer. */
export async function endBattle(battleId: string) {
  return finishBattle(battleId, { reason: 'forfeit', clearRooms: false });
}

/** Quita punteros de sala tras cerrar el resultado o al salir. */
export async function dismissBattleResult(battleId: string) {
  const snap = await getDoc(doc(db, 'liveBattles', battleId));
  if (!snap.exists()) return;
  const battle = parseBattle(snap.id, snap.data());
  if (!battle) return;
  if (battle.status === 'live') {
    await finishBattle(battleId, { reason: 'forfeit', clearRooms: true });
    return;
  }
  await clearRoomBattlePointers(battle.hostAUsername, battle.hostBUsername);
}

/**
 * Regalo al host de `roomName` → resta vida al oponente.
 * KO → status ended (rooms siguen con battleId para UI).
 */
export async function creditBattleGift(roomName: string, coins: number) {
  const amount = Math.max(0, Math.floor(Number(coins) || 0));
  if (!amount) return;
  const roomSnap = await getDoc(doc(db, 'liveRooms', roomKey(roomName)));
  const battleId = String(roomSnap.data()?.battleId || '').trim();
  if (!battleId) return;
  const battleRef = doc(db, 'liveBattles', battleId);

  await runTransaction(db, async (tx) => {
    const battleSnap = await tx.get(battleRef);
    if (!battleSnap.exists()) return;
    const battle = parseBattle(battleSnap.id, battleSnap.data());
    if (!battle || battle.status !== 'live') return;

    const endsAt = Number(battle.endsAtMs || 0);
    if (endsAt && Date.now() >= endsAt) {
      tx.update(battleRef, {
        status: 'ended',
        endReason: 'timer',
        winnerSide: resolveBattleWinner(battle.hpA, battle.hpB),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const key = roomKey(roomName);
    const receiver: 'a' | 'b' | null =
      key === roomKey(battle.hostAUsername)
        ? 'a'
        : key === roomKey(battle.hostBUsername)
          ? 'b'
          : null;
    if (!receiver) return;

    const next = applyGiftDamageToOpponent({
      hpA: battle.hpA,
      hpB: battle.hpB,
      receiver,
      coins: amount,
    });

    const patch: Record<string, unknown> = {
      hpA: next.hpA,
      hpB: next.hpB,
      scoreA: receiver === 'a' ? battle.scoreA + next.damage : battle.scoreA,
      scoreB: receiver === 'b' ? battle.scoreB + next.damage : battle.scoreB,
      updatedAt: serverTimestamp(),
    };

    if (next.ko) {
      patch.status = 'ended';
      patch.endReason = 'ko';
      patch.winnerSide = next.winnerSide;
    }

    tx.update(battleRef, patch);
  });
}

/** Revancha: nuevo reto al mismo rival con la misma duración. */
export async function requestBattleRematch(input: {
  previousBattleId: string;
  fromUid: string;
}): Promise<string> {
  const snap = await getDoc(doc(db, 'liveBattles', input.previousBattleId));
  if (!snap.exists()) throw new Error('Batalla no encontrada');
  const prev = parseBattle(snap.id, snap.data());
  if (!prev || prev.status !== 'ended') {
    throw new Error('Solo puedes pedir revancha al terminar');
  }
  const isA = prev.hostAUid === input.fromUid;
  const isB = prev.hostBUid === input.fromUid;
  if (!isA && !isB) throw new Error('No eres participante');

  await clearRoomBattlePointers(prev.hostAUsername, prev.hostBUsername);

  return createBattleInvite({
    hostAUid: input.fromUid,
    hostAUsername: isA ? prev.hostAUsername : prev.hostBUsername,
    hostAName: isA ? prev.hostAName : prev.hostBName,
    hostBUid: isA ? prev.hostBUid : prev.hostAUid,
    hostBUsername: isA ? prev.hostBUsername : prev.hostAUsername,
    hostBName: isA ? prev.hostBName : prev.hostAName,
    durationMs: prev.durationMs,
  });
}
