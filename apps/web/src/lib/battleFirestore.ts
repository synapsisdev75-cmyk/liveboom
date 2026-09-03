import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { roomKey } from './roomKey';
import { BATTLE_DURATION_MS, battleChannel, newBattleId } from './agoraBattleId';

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
  scoreA: number;
  scoreB: number;
  startedAtMs: number;
  endsAtMs: number;
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
    startedAtMs: Number(data.startedAtMs) || 0,
    endsAtMs: Number(data.endsAtMs) || 0,
  };
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
    startedAtMs: 0,
    endsAtMs: 0,
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
  await updateDoc(snap.ref, {
    status: 'live',
    startedAtMs: now,
    endsAtMs: now + BATTLE_DURATION_MS,
    updatedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, 'liveRooms', roomKey(battle.hostBUsername)),
    { battleId: battle.id, incomingBattle: deleteField(), updatedAt: serverTimestamp() },
    { merge: true },
  );
  return { ...battle, status: 'live' as const, startedAtMs: now, endsAtMs: now + BATTLE_DURATION_MS };
}

export async function declineBattle(battleId: string) {
  const snap = await getDoc(doc(db, 'liveBattles', battleId));
  if (!snap.exists()) return;
  const battle = parseBattle(snap.id, snap.data());
  if (!battle) return;
  await updateDoc(snap.ref, { status: 'declined', updatedAt: serverTimestamp() }).catch(() => undefined);
  await Promise.all([
    setDoc(
      doc(db, 'liveRooms', roomKey(battle.hostAUsername)),
      { battleId: deleteField(), incomingBattle: deleteField(), updatedAt: serverTimestamp() },
      { merge: true },
    ),
    setDoc(
      doc(db, 'liveRooms', roomKey(battle.hostBUsername)),
      { battleId: deleteField(), incomingBattle: deleteField(), updatedAt: serverTimestamp() },
      { merge: true },
    ),
  ]);
}

export async function endBattle(battleId: string) {
  const snap = await getDoc(doc(db, 'liveBattles', battleId));
  if (!snap.exists()) return;
  const battle = parseBattle(snap.id, snap.data());
  if (!battle) return;
  if (battle.status !== 'ended') {
    await updateDoc(snap.ref, { status: 'ended', updatedAt: serverTimestamp() }).catch(() => undefined);
  }
  await Promise.all([
    setDoc(
      doc(db, 'liveRooms', roomKey(battle.hostAUsername)),
      { battleId: deleteField(), incomingBattle: deleteField(), updatedAt: serverTimestamp() },
      { merge: true },
    ),
    setDoc(
      doc(db, 'liveRooms', roomKey(battle.hostBUsername)),
      { battleId: deleteField(), incomingBattle: deleteField(), updatedAt: serverTimestamp() },
      { merge: true },
    ),
  ]);
}

export async function creditBattleGift(roomName: string, coins: number) {
  const amount = Math.max(0, Math.floor(Number(coins) || 0));
  if (!amount) return;
  const roomSnap = await getDoc(doc(db, 'liveRooms', roomKey(roomName)));
  const battleId = String(roomSnap.data()?.battleId || '').trim();
  if (!battleId) return;
  const battleSnap = await getDoc(doc(db, 'liveBattles', battleId));
  const battle = parseBattle(battleSnap.id, battleSnap.data());
  if (!battle || battle.status !== 'live') return;
  const key = roomKey(roomName);
  const field =
    key === roomKey(battle.hostAUsername)
      ? 'scoreA'
      : key === roomKey(battle.hostBUsername)
        ? 'scoreB'
        : null;
  if (!field) return;
  await updateDoc(battleSnap.ref, { [field]: increment(amount), updatedAt: serverTimestamp() });
}
