import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type Timestamp as FsTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { plazaMessageExpiresAt, visiblePlazaMessages } from './plazaMessageExpiry';
import {
  parsePostTextStyle,
  parseTextStyleRanges,
  textStyleRangesForTrimmed,
  type PostTextStyle,
  type TextStyleRange,
} from './postTextStyle';
import { roomKey } from './roomKey';
import type { PostCommentMedia, PostCommentMediaType } from './socialFirestore';

export const EXPLORE_PRESENCE_TTL_MS = 30_000;
export const EXPLORE_HEAT_TTL_MS = 25_000;
export const EXPLORE_PLAZA_TTL_MS = 20 * 60 * 1000;
const LIVE_HEARTBEAT_TTL_MS = 90_000;
const LIVE_START_GRACE_MS = 90_000;
const HEARTBEAT_MS = 12_000;
const PLAZA_ALERT_GAP_MS = 10 * 60 * 1000;
/** Las reglas solo dejan leer 20 min contados con el reloj del servidor. */
const PLAZA_QUERY_MARGINS_MS = [3 * 60_000, 10 * 60_000, 17 * 60_000];
export const CREATOR_CLOSING_TTL_MS = 6 * 60 * 60 * 1000;
export const PLAZA_LIVE_REPLY_TEXT = 'Voy a responderles en LIVE. Entren para verme.';

export type PlazaMessageKind = 'text' | 'live_reply';

export function plazaHref(postId: string): string {
  return `/explorar?v=${encodeURIComponent(postId)}&plaza=1`;
}

export type PlazaViewer = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type PlazaMessage = {
  id: string;
  fromUid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  text: string;
  kind: PlazaMessageKind;
  createdAtMs: number;
  mediaUrl: string | null;
  mediaType: PostCommentMediaType | null;
  mediaPreviewUrl: string | null;
  textStyle: PostTextStyle | null;
  textStyleRanges: TextStyleRange[];
  /** Últimos instantes antes de borrarse (para desvanecerlo). */
  leaving: boolean;
  replyTo: PlazaReplyRef | null;
};

/** Mensaje al que se responde (copia corta: el original se borra a los 3 min). */
export type PlazaReplyRef = {
  id: string;
  name: string;
  text: string;
};

export type PlazaMessageExtras = {
  media?: PostCommentMedia | null;
  textStyle?: PostTextStyle | null;
  textStyleRanges?: TextStyleRange[];
  replyTo?: PlazaReplyRef | null;
};

const PLAZA_REPLY_TEXT_MAX = 120;

function plazaReplyOf(data: Record<string, unknown>): PlazaReplyRef | null {
  const id = typeof data.replyToId === 'string' ? data.replyToId.trim().slice(0, 64) : '';
  if (!id) return null;
  return {
    id,
    name: typeof data.replyToName === 'string' ? data.replyToName.trim().slice(0, 80) : '',
    text: typeof data.replyToText === 'string' ? data.replyToText.trim().slice(0, PLAZA_REPLY_TEXT_MAX) : '',
  };
}

const PLAZA_MEDIA_TYPES: ReadonlySet<string> = new Set(['image', 'video', 'gif', 'sticker']);

function plainPlazaText(text: string): string {
  return text.replace(/\u200b/g, '').trim();
}

/** http(s) o ruta propia del sitio (`/stickers/...`); los stickers del catálogo son rutas relativas. */
function mediaUrlOf(value: unknown): string | null {
  return typeof value === 'string' && /^(https?:\/\/|\/(?!\/))/i.test(value) ? value : null;
}

export function plazaMediaLabel(type: PostCommentMediaType | null): string {
  if (type === 'video') return 'Video';
  if (type === 'gif') return 'GIF';
  if (type === 'sticker') return 'Sticker';
  return 'Foto';
}

export type PlazaProfile = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
};

function millisOf(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const ms = (value as FsTimestamp).toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

/** Gente con latido fresco en este video. */
export function listenExploreViewers(
  postId: string,
  onChange: (viewers: PlazaViewer[]) => void,
): () => void {
  const viewersQuery = query(collection(db, 'explorePresence', postId, 'viewers'), limit(30));
  // Cada latido re-emite la misma gente: solo avisar cuando cambia quién está.
  let lastSignature: string | null = null;
  const emit = (people: PlazaViewer[]) => {
    const signature = JSON.stringify(people);
    if (signature === lastSignature) return;
    lastSignature = signature;
    onChange(people);
  };
  return onSnapshot(
    viewersQuery,
    (snap) => {
      const now = Date.now();
      const people: PlazaViewer[] = [];
      for (const item of snap.docs) {
        const data = item.data();
        const at = millisOf(data.heartbeatAt);
        if (at <= 0 || now - at > EXPLORE_PRESENCE_TTL_MS) continue;
        const uid = String(data.uid || item.id || '');
        if (!uid) continue;
        people.push({
          uid,
          username: String(data.username || ''),
          displayName: String(data.displayName || data.username || ''),
          avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
        });
      }
      emit(people);
    },
    () => emit([]),
  );
}

/** Publica el conteo para que Para ti suba los videos con gente ahora. */
export function publishExploreHeat(postId: string, count: number): void {
  const safe = Math.max(0, Math.min(40, Math.round(count)));
  void setDoc(
    doc(db, 'explorePresence', postId),
    { count: safe, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => undefined);
}

export function startExploreHeartbeat(postId: string, profile: PlazaProfile): () => void {
  const viewerRef = doc(db, 'explorePresence', postId, 'viewers', profile.uid);
  let stopped = false;

  async function beat() {
    if (stopped || document.hidden) return;
    try {
      await setDoc(viewerRef, {
        uid: profile.uid,
        username: profile.username.slice(0, 24),
        displayName: (profile.displayName || profile.username).slice(0, 80),
        avatarUrl: profile.avatarUrl || null,
        heartbeatAt: serverTimestamp(),
      });
    } catch {
      /* sin sesión o reglas: el conteo público sigue leyéndose */
    }
  }

  void beat();
  const timer = window.setInterval(() => void beat(), HEARTBEAT_MS);
  const onVisible = () => {
    if (!document.hidden) void beat();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    void deleteDoc(viewerRef).catch(() => undefined);
  };
}

export function listenExploreHeat(onChange: (heat: Map<string, number>) => void): () => void {
  const heatQuery = query(collection(db, 'explorePresence'), where('count', '>', 0), limit(40));
  return onSnapshot(
    heatQuery,
    (snap) => {
      const now = Date.now();
      const heat = new Map<string, number>();
      for (const item of snap.docs) {
        const data = item.data();
        const at = millisOf(data.updatedAt);
        if (at <= 0 || now - at > EXPLORE_HEAT_TTL_MS) continue;
        const count = Math.max(0, Math.round(Number(data.count) || 0));
        if (count > 0) heat.set(item.id, count);
      }
      onChange(heat);
    },
    () => onChange(new Map()),
  );
}

export function listenPlazaMessages(
  postId: string,
  onChange: (messages: PlazaMessage[]) => void,
): () => void {
  let unsub: () => void = () => undefined;
  let stopped = false;
  let marginStep = 0;
  let primed = false;
  let latest: PlazaMessage[] = [];
  let tick = 0;
  /** Hora local en que se borra cada mensaje. Los que llegan en vivo cuentan desde que llegan
   *  (un reloj del teléfono adelantado no debe borrarlos antes de tiempo). */
  const expiresAt = new Map<string, number>();

  function emit() {
    window.clearTimeout(tick);
    if (stopped) return;
    const now = Date.now();
    const { visible, nextAt } = visiblePlazaMessages(latest, expiresAt, now);
    const ids = new Set(latest.map((message) => message.id));
    for (const [id, end] of expiresAt) {
      if (!ids.has(id) && now >= end) expiresAt.delete(id);
    }
    onChange(visible);
    if (nextAt !== null) tick = window.setTimeout(emit, Math.max(16, nextAt - now));
  }

  function attach() {
    unsub();
    const margin = PLAZA_QUERY_MARGINS_MS[marginStep] ?? 0;
    const cutoff = Timestamp.fromMillis(Date.now() - EXPLORE_PLAZA_TTL_MS + margin);
    const messagesQuery = query(
      collection(db, 'explorePlaza', postId, 'messages'),
      where('createdAt', '>', cutoff),
      orderBy('createdAt', 'desc'),
      limit(40),
    );
    unsub = onSnapshot(
      messagesQuery,
      (snap) => {
        const now = Date.now();
        const messages: PlazaMessage[] = [];
        for (const item of [...snap.docs].reverse()) {
          const data = item.data({ serverTimestamps: 'estimate' });
          const createdAtMs = millisOf(data.createdAt);
          if (createdAtMs <= 0 || now - createdAtMs > EXPLORE_PLAZA_TTL_MS) continue;
          const rawText = String(data.text || '').trim();
          const text = plainPlazaText(rawText) ? rawText : '';
          const mediaUrl = mediaUrlOf(data.mediaUrl);
          const mediaType =
            mediaUrl && PLAZA_MEDIA_TYPES.has(String(data.mediaType))
              ? (String(data.mediaType) as PostCommentMediaType)
              : null;
          if (!text && !mediaType) continue;
          messages.push({
            id: item.id,
            fromUid: String(data.fromUid || ''),
            username: String(data.username || ''),
            displayName: String(data.displayName || data.username || ''),
            avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
            text,
            kind: data.kind === 'live_reply' ? 'live_reply' : 'text',
            createdAtMs,
            mediaUrl: mediaType ? mediaUrl : null,
            mediaType,
            mediaPreviewUrl: mediaType ? mediaUrlOf(data.mediaPreviewUrl) : null,
            textStyle: text ? parsePostTextStyle(data.textStyle) : null,
            textStyleRanges: text ? parseTextStyleRanges(data.textStyleRanges, text.length) : [],
            leaving: false,
            replyTo: plazaReplyOf(data),
          });
          if (!expiresAt.has(item.id)) expiresAt.set(item.id, plazaMessageExpiresAt(now, createdAtMs, primed));
        }
        if (!snap.metadata.fromCache) primed = true;
        latest = messages;
        emit();
      },
      () => {
        // Reloj del teléfono atrasado: ampliar el margen antes de rendirse.
        if (!stopped && marginStep < PLAZA_QUERY_MARGINS_MS.length - 1) {
          marginStep += 1;
          attach();
          return;
        }
        latest = [];
        emit();
      },
    );
  }

  attach();
  const timer = window.setInterval(() => {
    if (!stopped) attach();
  }, 60_000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.clearTimeout(tick);
    unsub();
  };
}

export async function sendPlazaMessage(
  postId: string,
  profile: PlazaProfile,
  text: string,
  kind: PlazaMessageKind = 'text',
  extras?: PlazaMessageExtras,
): Promise<void> {
  const clean = plainPlazaText(text) ? text.trim().slice(0, 280) : '';
  const mediaUrl = mediaUrlOf(extras?.media?.mediaUrl);
  const mediaType =
    mediaUrl && extras?.media && PLAZA_MEDIA_TYPES.has(extras.media.mediaType) ? extras.media.mediaType : null;
  if (!clean && !mediaType) return;
  const textStyle = clean ? parsePostTextStyle(extras?.textStyle) : null;
  const textStyleRanges = clean ? textStyleRangesForTrimmed(text, extras?.textStyleRanges, 280) : [];
  const mediaPreviewUrl = mediaType ? mediaUrlOf(extras?.media?.mediaPreviewUrl) : null;
  const reply = extras?.replyTo?.id ? extras.replyTo : null;
  const ref = doc(collection(db, 'explorePlaza', postId, 'messages'));
  await setDoc(ref, {
    fromUid: profile.uid,
    username: profile.username.slice(0, 24),
    displayName: (profile.displayName || profile.username).slice(0, 80),
    avatarUrl: profile.avatarUrl || null,
    // Las reglas exigen text.size() > 0; un adjunto solo usa un marcador invisible.
    text: clean || '\u200b',
    ...(kind === 'live_reply' ? { kind } : {}),
    ...(mediaType ? { mediaUrl, mediaType } : {}),
    ...(mediaPreviewUrl ? { mediaPreviewUrl } : {}),
    ...(textStyle ? { textStyle } : {}),
    ...(textStyleRanges.length ? { textStyleRanges } : {}),
    ...(reply
      ? {
          replyToId: reply.id.slice(0, 64),
          replyToName: reply.name.slice(0, 80),
          replyToText: reply.text.slice(0, PLAZA_REPLY_TEXT_MAX),
        }
      : {}),
    createdAt: serverTimestamp(),
  });
}

/** El creador avisa en la plaza que va a responder en LIVE. */
export function announcePlazaLiveReply(postId: string, profile: PlazaProfile): Promise<void> {
  return sendPlazaMessage(postId, profile, PLAZA_LIVE_REPLY_TEXT, 'live_reply');
}

/** Reserva el aviso al creador (uno por ventana) en el doc de presencia del video. */
async function claimPlazaAlert(postId: string, field: 'waitingAlertAt' | 'plazaAlertAt', gapMs: number, count?: number) {
  const presenceRef = doc(db, 'explorePresence', postId);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(presenceRef);
      const data = snap.data();
      const last = Number(data?.[field] || 0);
      if (last > 0 && Date.now() - last < gapMs) return false;
      const safeCount = Math.max(0, Math.min(40, Math.round(count ?? (Number(data?.count) || 0))));
      tx.set(
        presenceRef,
        { count: safeCount, [field]: Date.now(), updatedAt: serverTimestamp() },
        { merge: true },
      );
      return true;
    });
  } catch {
    return false;
  }
}

async function releasePlazaAlert(postId: string, field: 'waitingAlertAt' | 'plazaAlertAt', count: number) {
  await setDoc(
    doc(db, 'explorePresence', postId),
    { [field]: 0, count: Math.max(0, Math.min(40, Math.round(count))), updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => undefined);
}

async function pushPlazaAlert(authorUid: string, title: string, body: string, href: string) {
  try {
    const { enqueuePushNotify } = await import('./pushNotifications');
    enqueuePushNotify({ recipientUids: [authorUid], title, body, channel: 'live', type: 'plaza', href });
  } catch {
    /* push opcional */
  }
}

/** Aviso al autor cuando alguien escribe en la plaza de su video. */
export async function notifyCreatorPlazaMessage(input: {
  postId: string;
  authorUid: string;
  fromUid: string;
  fromName: string;
  text: string;
  count: number;
}): Promise<void> {
  const authorUid = String(input.authorUid || '').trim();
  const postId = String(input.postId || '').trim();
  if (!authorUid || !postId || authorUid === input.fromUid) return;
  const claimed = await claimPlazaAlert(postId, 'plazaAlertAt', PLAZA_ALERT_GAP_MS, input.count);
  if (!claimed) return;

  const name = String(input.fromName || '').trim().slice(0, 40) || 'Alguien';
  const preview = String(input.text || '').trim().slice(0, 80);
  const title = `${name} escribió en la plaza de tu video`;
  const href = plazaHref(postId);
  try {
    await addDoc(collection(db, 'users', authorUid, 'liveAlerts'), {
      kind: 'plaza',
      title: preview ? `${title}: “${preview}”` : title,
      href,
      postId,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
  } catch {
    await releasePlazaAlert(postId, 'plazaAlertAt', input.count);
    return;
  }
  void pushPlazaAlert(authorUid, title, preview || 'Responde en LIVE o en el chat.', href);
}

export function liveRoomIsOpen(data: Record<string, unknown> | undefined, now = Date.now()): boolean {
  if (!data || data.status !== 'live' || data.isPrivate) return false;
  const heartbeatAtMs = Number(data.heartbeatAtMs || 0);
  const startedAtMs = Number(data.startedAtMs || 0);
  if (heartbeatAtMs > 0) return now - heartbeatAtMs <= LIVE_HEARTBEAT_TTL_MS;
  if (startedAtMs > 0) return now - startedAtMs <= LIVE_START_GRACE_MS;
  return false;
}

export function listenAuthorLive(
  username: string,
  onChange: (open: boolean) => void,
): () => void {
  const key = roomKey(username);
  if (!key || key === 'room') {
    onChange(false);
    return () => undefined;
  }
  return onSnapshot(
    doc(db, 'liveRooms', key),
    (snap) => {
      onChange(snap.exists() && liveRoomIsOpen(snap.data() as Record<string, unknown>));
    },
    () => onChange(false),
  );
}

export function creatorClosingNote(data: Record<string, unknown> | undefined, now = Date.now()): string {
  if (!data || data.status === 'live') return '';
  const note = String(data.closingNote || '').trim();
  const at = Number(data.closingAtMs || 0);
  if (!note || at <= 0 || now - at > CREATOR_CLOSING_TTL_MS) return '';
  return note.slice(0, 140);
}

export function listenCreatorClosing(username: string, onChange: (note: string) => void): () => void {
  const key = roomKey(username);
  if (!key || key === 'room') {
    onChange('');
    return () => undefined;
  }
  return onSnapshot(
    doc(db, 'liveRooms', key),
    (snap) => {
      onChange(snap.exists() ? creatorClosingNote(snap.data() as Record<string, unknown>) : '');
    },
    () => onChange(''),
  );
}
