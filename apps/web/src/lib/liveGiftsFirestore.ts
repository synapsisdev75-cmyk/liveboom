import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { roomKey } from './roomKey';

export type LiveGiftEvent = {
  id: string;
  giftId: string;
  giftName: string;
  emoji: string;
  senderName: string;
  senderUid: string;
  coins: number;
  multiplier?: number;
};

/** Marca la sala como en vivo (nueva transmisión). */
export async function markLiveRoomActive(
  roomName: string,
  hostUid: string,
  meta?: {
    displayName?: string;
    avatarUrl?: string | null;
    title?: string;
    category?: string;
    isPrivate?: boolean;
    aspectRatio?: '16:9' | '9:16';
  },
) {
  const username = roomKey(roomName);
  await setDoc(
    doc(db, 'liveRooms', username),
    {
      status: 'live',
      hostUid,
      username,
      displayName: meta?.displayName || roomName,
      avatarUrl: meta?.avatarUrl ?? null,
      title: meta?.title || `Live de ${meta?.displayName || roomName}`,
      category: meta?.category || 'otro',
      isPrivate: Boolean(meta?.isPrivate),
      aspectRatio: meta?.aspectRatio === '16:9' ? '16:9' : '9:16',
      lockGiftId: null,
      viewers: 0,
      startedAtMs: Date.now(),
      heartbeatAtMs: Date.now(),
      endedAtMs: null,
      coinsEarned: 0,
      topGifters: [],
      gifters: {},
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Pulso del host: el feed solo muestra salas con heartbeat reciente. */
export async function touchLiveRoomHeartbeat(roomName: string) {
  const now = Date.now();
  await setDoc(
    doc(db, 'liveRooms', roomKey(roomName)),
    {
      status: 'live',
      heartbeatAtMs: now,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Marca la sala como cerrada cuando el anfitrión deja de transmitir. */
export async function markLiveRoomEnded(roomName: string) {
  await clearLiveViewers(roomName).catch(() => undefined);
  await setDoc(
    doc(db, 'liveRooms', roomKey(roomName)),
    {
      status: 'ended',
      endedAtMs: Date.now(),
      heartbeatAtMs: 0,
      isPrivate: false,
      lockGiftId: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Segundos máximos sin pulso antes de ocultar/cerrar un live en el feed. */
export const LIVE_HEARTBEAT_TTL_MS = 90_000;
export const LIVE_START_GRACE_MS = 90_000;

export async function updateLiveRoomFeed(
  roomName: string,
  patch: {
    isPrivate?: boolean;
    lockGiftId?: string | null;
    viewers?: number;
    title?: string;
  },
) {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (typeof patch.isPrivate === 'boolean') data.isPrivate = patch.isPrivate;
  if (patch.lockGiftId !== undefined) data.lockGiftId = patch.lockGiftId;
  if (typeof patch.viewers === 'number') data.viewers = Math.max(0, Math.floor(patch.viewers));
  if (typeof patch.title === 'string' && patch.title.trim()) data.title = patch.title.trim().slice(0, 80);
  await setDoc(doc(db, 'liveRooms', roomKey(roomName)), data, { merge: true });
}

/** TTL de pulso de espectador: sin heartbeat reciente no cuenta en el total. */
export const LIVE_VIEWER_HEARTBEAT_TTL_MS = 45_000;

export type LiveViewerPresence = {
  uid: string;
  username: string;
  displayName: string;
  joinedAtMs: number;
  heartbeatAtMs: number;
};

function countActiveViewerDocs(docs: { data: () => DocumentData }[], now = Date.now()) {
  return docs.filter((item) => {
    const data = item.data();
    const heartbeatAtMs = Number(data.heartbeatAtMs || data.joinedAtMs || 0);
    return heartbeatAtMs > 0 && now - heartbeatAtMs <= LIVE_VIEWER_HEARTBEAT_TTL_MS;
  }).length;
}

async function syncLiveViewerCount(roomName: string) {
  const key = roomKey(roomName);
  const snap = await getDocs(collection(db, 'liveRooms', key, 'viewers'));
  const now = Date.now();
  let active = 0;
  const batch = writeBatch(db);
  let hasDeletes = false;
  for (const item of snap.docs) {
    const heartbeatAtMs = Number(item.data().heartbeatAtMs || item.data().joinedAtMs || 0);
    if (heartbeatAtMs > 0 && now - heartbeatAtMs <= LIVE_VIEWER_HEARTBEAT_TTL_MS) {
      active += 1;
    } else {
      batch.delete(item.ref);
      hasDeletes = true;
    }
  }
  if (hasDeletes) await batch.commit();
  await updateLiveRoomFeed(roomName, { viewers: active });
}

/** Host: limpia espectadores inactivos y actualiza contador en feed. */
export async function refreshLiveViewerCount(roomName: string) {
  await syncLiveViewerCount(roomName);
}

/** Espectador entra al live: +1 en contador real. */
export async function registerLiveViewer(
  roomName: string,
  user: { uid: string; username: string; displayName?: string },
) {
  const uid = String(user.uid || '').trim();
  if (!uid) return;
  const now = Date.now();
  await setDoc(
    doc(db, 'liveRooms', roomKey(roomName), 'viewers', uid),
    {
      uid,
      username: String(user.username || uid).slice(0, 40),
      displayName: String(user.displayName || user.username || 'Espectador').slice(0, 60),
      joinedAtMs: now,
      heartbeatAtMs: now,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await syncLiveViewerCount(roomName);
}

/** Pulso del espectador mientras permanece en la sala. */
export async function touchLiveViewerHeartbeat(roomName: string, uid: string) {
  const id = String(uid || '').trim();
  if (!id) return;
  await setDoc(
    doc(db, 'liveRooms', roomKey(roomName), 'viewers', id),
    {
      heartbeatAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Espectador sale del live: -1 en contador real. */
export async function unregisterLiveViewer(roomName: string, uid: string) {
  const id = String(uid || '').trim();
  if (!id) return;
  await deleteDoc(doc(db, 'liveRooms', roomKey(roomName), 'viewers', id)).catch(() => undefined);
  await syncLiveViewerCount(roomName);
}

/** Limpia presencia al cerrar el live. */
export async function clearLiveViewers(roomName: string) {
  const key = roomKey(roomName);
  const snap = await getDocs(collection(db, 'liveRooms', key, 'viewers'));
  if (!snap.empty) {
    const batch = writeBatch(db);
    snap.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
  await updateLiveRoomFeed(roomName, { viewers: 0 });
}

/** Contador en tiempo real de espectadores activos (solo quienes están en /stream). */
export function listenLiveRoomViewerCount(
  roomName: string,
  onChange: (count: number) => void,
): Unsubscribe {
  const key = roomKey(roomName);
  const emit = (snap: { docs: { data: () => DocumentData }[] }) => {
    onChange(countActiveViewerDocs(snap.docs));
  };
  return onSnapshot(
    collection(db, 'liveRooms', key, 'viewers'),
    emit,
    () => onChange(0),
  );
}

/** Lista de espectadores activos para el panel del host. */
export function listenLiveViewers(
  roomName: string,
  onChange: (viewers: LiveViewerPresence[]) => void,
): Unsubscribe {
  const key = roomKey(roomName);
  return onSnapshot(
    collection(db, 'liveRooms', key, 'viewers'),
    (snap) => {
      const now = Date.now();
      const list = snap.docs
        .map((item) => {
          const data = item.data();
          return {
            uid: item.id,
            username: String(data.username || item.id),
            displayName: String(data.displayName || data.username || item.id),
            joinedAtMs: Number(data.joinedAtMs || 0),
            heartbeatAtMs: Number(data.heartbeatAtMs || data.joinedAtMs || 0),
          };
        })
        .filter((v) => v.heartbeatAtMs > 0 && now - v.heartbeatAtMs <= LIVE_VIEWER_HEARTBEAT_TTL_MS)
        .sort((a, b) => b.joinedAtMs - a.joinedAtMs);
      onChange(list);
    },
    () => onChange([]),
  );
}

export type ActiveLiveFeedItem = {
  username: string;
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  title: string;
  startedAt: string;
  viewers: number;
  isPrivate: boolean;
  category: string;
};

function isLiveHeartbeatFresh(data: DocumentData, now = Date.now()) {
  const heartbeatAtMs = Number(data.heartbeatAtMs || 0);
  const startedAtMs = Number(data.startedAtMs || 0);
  if (heartbeatAtMs > 0) {
    return now - heartbeatAtMs <= LIVE_HEARTBEAT_TTL_MS;
  }
  // Salas viejas sin heartbeat: solo gracia corta tras el start.
  if (startedAtMs > 0) {
    return now - startedAtMs <= LIVE_START_GRACE_MS;
  }
  return false;
}

/** Feed de lives en tiempo real (aparece/desaparece al instante). */
export function listenActiveLiveRooms(
  onChange: (streams: ActiveLiveFeedItem[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'liveRooms'), where('status', '==', 'live'));
  let latestDocs: QueryDocumentSnapshot[] = [];

  const emit = () => {
    const now = Date.now();
    const streams: ActiveLiveFeedItem[] = [];
    for (const item of latestDocs) {
      const data = item.data();
      const username = String(data.username || item.id || '').trim();
      if (!username) continue;
      if (data.isPrivate || data.lockGiftId) continue;
      if (!isLiveHeartbeatFresh(data, now)) continue;
      const startedAtMs = Number(data.startedAtMs || Date.now());
      streams.push({
        username,
        uid: String(data.hostUid || ''),
        displayName: String(data.displayName || username),
        avatarUrl: (data.avatarUrl as string | null) ?? null,
        title: String(data.title || `Live de ${data.displayName || username}`),
        startedAt: new Date(startedAtMs).toISOString(),
        viewers: Math.max(0, Number(data.viewers || 0)),
        isPrivate: false,
        category: String(data.category || 'otro'),
      });
    }
    streams.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    onChange(streams);
    // No marcar ended aquí: solo oculta. El reconcile con API cierra salas muertas.
  };

  const unsub = onSnapshot(
    q,
    (snap) => {
      latestDocs = snap.docs;
      emit();
    },
    (err) => {
      console.error('[live] listenActiveLiveRooms', err);
      onChange([]);
    },
  );

  // Revisa heartbeats aunque no haya writes nuevos.
  const timer = window.setInterval(emit, 10_000);
  return () => {
    unsub();
    window.clearInterval(timer);
  };
}

/** Cierra en Firestore las salas que ya no aparecen como activas en el API. */
export async function reconcileLiveFeedWithApi(activeUsernames: string[]) {
  const active = new Set(
    activeUsernames.map((name) => roomKey(name)).filter(Boolean),
  );
  const snap = await getDocs(query(collection(db, 'liveRooms'), where('status', '==', 'live')));
  const now = Date.now();
  await Promise.all(
    snap.docs.map(async (item) => {
      const data = item.data();
      const username = String(data.username || item.id || '').trim();
      if (!username) return;
      if (active.has(roomKey(username))) return;
      // Si el API no la tiene y el heartbeat ya expiró (o nunca hubo), cerrar.
      if (!isLiveHeartbeatFresh(data, now)) {
        await markLiveRoomEnded(username).catch(() => undefined);
      }
    }),
  );
}

export function listenLiveRoomStatus(
  roomName: string,
  onChange: (status: 'live' | 'ended' | 'unknown') => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'liveRooms', roomKey(roomName)),
    (snap) => {
      if (!snap.exists()) {
        onChange('unknown');
        return;
      }
      const status = String(snap.data()?.status || 'unknown');
      onChange(status === 'ended' ? 'ended' : status === 'live' ? 'live' : 'unknown');
    },
    () => onChange('unknown'),
  );
}

export type LiveActivityEntry = {
  id: string;
  username: string;
  displayName: string;
  title: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  viewers: number;
  coinsEarned: number;
  goalCoins: number;
  goalLabel: string;
  topGifters: { uid?: string; name: string; coins: number }[];
};

/** Guarda el resumen del live en el historial del anfitrión (Firestore). */
export async function archiveLiveActivity(
  hostUid: string,
  entry: Omit<LiveActivityEntry, 'id'>,
) {
  const uid = String(hostUid || '').trim();
  if (!uid) return;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await setDoc(doc(db, 'users', uid, 'liveHistory', id), {
    ...entry,
    endedAtMs: Date.now(),
    createdAt: serverTimestamp(),
  });
}

export function listenLiveActivity(
  hostUid: string,
  onChange: (lives: LiveActivityEntry[]) => void,
): Unsubscribe {
  const uid = String(hostUid || '').trim();
  if (!uid) {
    onChange([]);
    return () => undefined;
  }
  const col = collection(db, 'users', uid, 'liveHistory');
  const q = query(col, orderBy('endedAtMs', 'desc'), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((item) => {
          const data = item.data() as Record<string, unknown>;
          return {
            id: item.id,
            username: String(data.username || ''),
            displayName: String(data.displayName || data.username || ''),
            title: String(data.title || 'Live'),
            startedAt: String(data.startedAt || ''),
            endedAt: String(data.endedAt || ''),
            durationMs: Number(data.durationMs || 0),
            viewers: Number(data.viewers || 0),
            coinsEarned: Number(data.coinsEarned || 0),
            goalCoins: Number(data.goalCoins || 0),
            goalLabel: String(data.goalLabel || ''),
            topGifters: Array.isArray(data.topGifters)
              ? (data.topGifters as LiveActivityEntry['topGifters'])
              : [],
          };
        }),
      );
    },
    (err) => {
      console.error('No se pudo cargar el historial de lives', err);
      onChange([]);
    },
  );
}

/** Escucha recaudación durable de la sala (coins + top gifters). */
export function listenLiveRoomEarnings(
  roomName: string,
  onChange: (stats: {
    coinsEarned: number;
    topGifters: { uid: string; name: string; coins: number }[];
  }) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'liveRooms', roomKey(roomName)),
    (snap) => {
      if (!snap.exists()) {
        onChange({ coinsEarned: 0, topGifters: [] });
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const topGifters = Array.isArray(data.topGifters)
        ? (data.topGifters as { uid?: string; name?: string; coins?: number }[])
            .map((item) => ({
              uid: String(item.uid || ''),
              name: String(item.name || 'Liveboomer'),
              coins: Number(item.coins || 0),
            }))
            .sort((a, b) => b.coins - a.coins)
            .slice(0, 5)
        : [];
      onChange({
        coinsEarned: Number(data.coinsEarned || 0),
        topGifters,
      });
    },
    (err) => {
      console.error('No se pudo escuchar la recaudación de la sala', err);
    },
  );
}

/** Acumula coins ganados y top gifters en la sala (durable). */
export async function recordLiveGiftEarnings(
  roomName: string,
  gift: { coins: number; senderUid: string; senderName: string },
) {
  const roomRef = doc(db, 'liveRooms', roomKey(roomName));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef);
    const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
    const giftersRaw =
      data.gifters && typeof data.gifters === 'object'
        ? (data.gifters as Record<string, { uid?: string; name?: string; coins?: number }>)
        : {};
    const prev = Number(giftersRaw[gift.senderUid]?.coins || 0);
    const gifters = {
      ...giftersRaw,
      [gift.senderUid]: {
        uid: gift.senderUid,
        name: gift.senderName,
        coins: prev + gift.coins,
      },
    };
    const topGifters = Object.values(gifters)
      .map((item) => ({
        uid: String(item.uid || ''),
        name: String(item.name || 'Liveboomer'),
        coins: Number(item.coins || 0),
      }))
      .sort((a, b) => b.coins - a.coins)
      .slice(0, 5);
    tx.set(
      roomRef,
      {
        coinsEarned: Number(data.coinsEarned || 0) + gift.coins,
        gifters,
        topGifters,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

/** Borra mensajes y regalos de la sala para que una transmisión nueva arranque con chat vacío. */
export async function resetLiveRoomChat(roomName: string) {
  const key = roomKey(roomName);

  async function wipe(subcollection: 'messages' | 'gifts') {
    const col = collection(db, 'liveRooms', key, subcollection);
    for (;;) {
      const snap = await getDocs(query(col, limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((item) => batch.delete(item.ref));
      await batch.commit();
    }
  }

  await wipe('messages');
  await wipe('gifts');
}

export function listenLiveGifts(
  roomName: string,
  onGift: (gift: LiveGiftEvent) => void,
): Unsubscribe {
  const col = collection(db, 'liveRooms', roomKey(roomName), 'gifts');
  let primed = false;
  return onSnapshot(
    col,
    (snap) => {
      if (!primed) {
        primed = true;
        return;
      }
      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue;
        const data = change.doc.data() as Record<string, unknown>;
        const giftId = String(data.giftId || '');
        if (!giftId) continue;
        const rawMult = Math.floor(Number(data.multiplier) || 1);
        onGift({
          id: String(data.clientId || change.doc.id),
          giftId,
          giftName: String(data.giftName || 'Regalo'),
          emoji: String(data.emoji || '🎁'),
          senderName: String(data.senderName || 'Liveboomer'),
          senderUid: String(data.senderUid || ''),
          coins: Number(data.coins || 0),
          multiplier: [1, 2, 4, 8].includes(rawMult) ? rawMult : 1,
        });
      }
    },
    (err) => {
      console.error('No se pudieron escuchar los regalos en vivo', err);
    },
  );
}

export async function publishLiveGift(
  roomName: string,
  gift: Omit<LiveGiftEvent, 'id'> & { clientId: string },
) {
  await addDoc(collection(db, 'liveRooms', roomKey(roomName), 'gifts'), {
    clientId: gift.clientId,
    giftId: gift.giftId,
    giftName: gift.giftName,
    emoji: gift.emoji,
    senderName: gift.senderName,
    senderUid: gift.senderUid,
    coins: gift.coins,
    multiplier: [1, 2, 4, 8].includes(Math.floor(Number(gift.multiplier) || 1))
      ? Math.floor(Number(gift.multiplier) || 1)
      : 1,
    createdAt: serverTimestamp(),
  });
  void recordLiveGiftEarnings(roomName, {
    coins: gift.coins,
    senderUid: gift.senderUid,
    senderName: gift.senderName,
  }).catch((error) => console.error('[gift] room-stats', error));
}

export type LiveChatMessage = {
  id: string;
  author: string;
  authorUid: string;
  text: string;
  gift?: { giftId: string; emoji: string; name: string } | null;
  createdAtMs: number;
};

export function listenLiveChat(
  roomName: string,
  onChange: (messages: LiveChatMessage[]) => void,
): Unsubscribe {
  const col = collection(db, 'liveRooms', roomKey(roomName), 'messages');

  function emit(docs: QueryDocumentSnapshot<DocumentData>[]) {
    const list = docs
      .map((item) => {
        const data = item.data() as Record<string, unknown>;
        const giftRaw = data.gift && typeof data.gift === 'object' ? (data.gift as Record<string, unknown>) : null;
        return {
          id: String(data.clientId || item.id),
          author: String(data.author || 'Liveboomer'),
          authorUid: String(data.authorUid || ''),
          text: String(data.text || ''),
          gift: giftRaw
            ? {
                giftId: String(giftRaw.giftId || ''),
                emoji: String(giftRaw.emoji || '🎁'),
                name: String(giftRaw.name || 'Regalo'),
              }
            : null,
          createdAtMs: Number(data.createdAtMs || 0),
        };
      })
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .slice(-400);
    onChange(list);
  }

  const q = query(col, orderBy('createdAtMs', 'desc'), limit(400));
  let fallback: Unsubscribe | null = null;
  const primary = onSnapshot(
    q,
    (snap) => emit(snap.docs),
    () => {
      fallback = onSnapshot(col, (snap) => emit(snap.docs), (err) => {
        console.error('No se pudo cargar el historial del chat', err);
      });
    },
  );
  return () => {
    primary();
    fallback?.();
  };
}

export async function publishLiveChatMessage(
  roomName: string,
  message: {
    clientId: string;
    authorUid: string;
    author: string;
    text: string;
    gift?: { giftId: string; emoji: string; name: string } | null;
  },
) {
  await addDoc(collection(db, 'liveRooms', roomKey(roomName), 'messages'), {
    clientId: message.clientId,
    authorUid: message.authorUid,
    author: message.author,
    text: message.text.slice(0, 500),
    gift: message.gift || null,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
}

/** Avisa a amigos/seguidores que el host está en LIVE (máx. 40). */
export async function notifyNetworkImLive(input: {
  hostUid: string;
  hostUsername: string;
  hostName: string;
  recipientUids: string[];
}) {
  const recipients = Array.from(new Set(input.recipientUids.filter(Boolean))).slice(0, 40);
  const batch = writeBatch(db);
  const at = Date.now();
  for (const uid of recipients) {
    if (uid === input.hostUid) continue;
    const ref = doc(collection(db, 'users', uid, 'liveAlerts'));
    batch.set(ref, {
      hostUid: input.hostUid,
      hostUsername: input.hostUsername,
      hostName: input.hostName,
      title: `${input.hostName} está en LIVE`,
      href: `/stream/${encodeURIComponent(input.hostUsername)}`,
      createdAt: serverTimestamp(),
      createdAtMs: at,
    });
  }
  await batch.commit();
  return recipients.length;
}

export function listenLiveAlerts(
  uid: string,
  onChange: (alerts: Array<{ id: string; text: string; href: string; at: number }>) => void,
): Unsubscribe {
  const col = collection(db, 'users', uid, 'liveAlerts');
  const q = query(col, orderBy('createdAtMs', 'desc'), limit(20));
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            text: String(data.title || 'Un amigo está en LIVE'),
            href: String(data.href || '/'),
            at: Number(data.createdAtMs || Date.now()),
          };
        }),
      );
    },
    (err) => {
      console.warn('[liveAlerts]', err);
    },
  );
}

/** Borra una alerta LIVE del usuario. */
export async function deleteLiveAlert(uid: string, alertId: string) {
  const id = String(alertId || '').trim();
  if (!uid || !id) return;
  await deleteDoc(doc(db, 'users', uid, 'liveAlerts', id));
}

/** Borra todas las alertas LIVE del usuario (máx. 40). */
export async function clearLiveAlerts(uid: string) {
  if (!uid) return;
  const col = collection(db, 'users', uid, 'liveAlerts');
  const snap = await getDocs(query(col, orderBy('createdAtMs', 'desc'), limit(40)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((item) => batch.delete(item.ref));
  await batch.commit();
}

export async function setLiveWishlist(roomName: string, giftIds: string[]) {
  await setDoc(
    doc(db, 'liveRooms', roomKey(roomName)),
    { wishlist: giftIds.slice(0, 5), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function listenLiveWishlist(
  roomName: string,
  onChange: (giftIds: string[]) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'liveRooms', roomKey(roomName)), (snap) => {
    const data = snap.data();
    const list = Array.isArray(data?.wishlist) ? data.wishlist.map(String) : [];
    onChange(list);
  });
}
