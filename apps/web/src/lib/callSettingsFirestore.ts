import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { assertCanStartCall } from './callAvailability';
import { getCommunicationPermissions } from './communicationPermissions';
import {
  isAllowedCallGiftValue,
  type CallRateSnapshot,
  estimateCallMinutes,
  snapshotFromGift,
  validateCallGiftId,
} from './callPricing';
import { findLiveGift } from './liveboomGifts';
import type { FriendChip } from './socialFirestore';

export type CallKind = 'audio' | 'video';

export type CallRateMode = 'free' | 'paid';

export type CallRateConfig = {
  mode: CallRateMode;
  giftId: string | null;
  rateBlasts: number;
};

export type CreatorCallSettings = {
  voiceEnabled: boolean;
  videoEnabled: boolean;
  allowFollowerRequests: boolean;
  friendVoice: CallRateConfig;
  friendVideo: CallRateConfig;
  followerVoice: CallRateConfig;
  followerVideo: CallRateConfig;
};

export type CallAccessKind =
  | 'blocked'
  | 'none'
  | 'follower_chat'
  | 'follower_request'
  | 'friend'
  | 'free_contact';

export type CallAccess = {
  kind: CallAccessKind;
  canDirectCall: boolean;
  canRequestCall: boolean;
  voiceEnabled: boolean;
  videoEnabled: boolean;
  pricing: CallRateSnapshot | null;
  label: 'Gratis' | string;
};

export type CallRequestDoc = {
  id: string;
  chatId: string;
  callerId: string;
  callerName: string;
  callerHandle: string;
  callerAvatar: string | null;
  callType: CallKind;
  giftId: string | null;
  giftName: string | null;
  giftEmoji: string | null;
  rateBlasts: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAtMs: number;
  expiresAtMs: number;
  authorizationId?: string | null;
};

const DEFAULT_RATE: CallRateConfig = { mode: 'free', giftId: null, rateBlasts: 0 };

export const DEFAULT_CALL_SETTINGS: CreatorCallSettings = {
  voiceEnabled: true,
  videoEnabled: true,
  allowFollowerRequests: false,
  friendVoice: { ...DEFAULT_RATE },
  friendVideo: { ...DEFAULT_RATE },
  followerVoice: { ...DEFAULT_RATE },
  followerVideo: { ...DEFAULT_RATE },
};

function chatIdFor(a: string, b: string) {
  return [a, b].sort().join('_');
}

function parseRate(raw: unknown): CallRateConfig {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mode = data.mode === 'paid' ? 'paid' : 'free';
  const giftId = typeof data.giftId === 'string' && data.giftId ? data.giftId : null;
  let rateBlasts = Math.max(0, Math.floor(Number(data.rateBlasts) || 0));
  if (mode === 'paid' && giftId) {
    try {
      rateBlasts = validateCallGiftId(giftId).rateBlasts;
    } catch {
      return { ...DEFAULT_RATE };
    }
  }
  if (mode !== 'paid') return { ...DEFAULT_RATE };
  return { mode, giftId, rateBlasts };
}

export function parseCallSettings(raw: unknown): CreatorCallSettings {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    voiceEnabled: data.voiceEnabled !== false,
    videoEnabled: data.videoEnabled !== false,
    allowFollowerRequests: Boolean(data.allowFollowerRequests),
    friendVoice: parseRate(data.friendVoice),
    friendVideo: parseRate(data.friendVideo),
    followerVoice: parseRate(data.followerVoice),
    followerVideo: parseRate(data.followerVideo),
  };
}

function pricingFromRate(rate: CallRateConfig): CallRateSnapshot | null {
  if (rate.mode !== 'paid' || !rate.giftId || rate.rateBlasts <= 0) return null;
  try {
    return validateCallGiftId(rate.giftId);
  } catch {
    const gift = findLiveGift(rate.giftId);
    if (!gift) return null;
    return snapshotFromGift(gift);
  }
}

function userRef(uid: string) {
  return doc(db, 'users', uid);
}

function settingsSubRef(uid: string) {
  return doc(db, 'users', uid, 'callSettings', 'config');
}

function privateFreeRef(uid: string) {
  return doc(db, 'users', uid, 'private', 'freeCallContacts');
}

function ignoreWrite(error: unknown) {
  return error;
}

export function listenCreatorCallSettings(
  uid: string,
  onChange: (settings: CreatorCallSettings) => void,
): Unsubscribe {
  if (!uid) {
    onChange(DEFAULT_CALL_SETTINGS);
    return () => undefined;
  }
  return onSnapshot(userRef(uid), (snap) => {
    onChange(parseCallSettings(snap.data()?.callSettings));
  });
}

export async function saveCreatorCallSettings(uid: string, settings: CreatorCallSettings) {
  const payload: CreatorCallSettings = {
    ...DEFAULT_CALL_SETTINGS,
    ...settings,
    friendVoice: parseRate(settings.friendVoice),
    friendVideo: parseRate(settings.friendVideo),
    followerVoice: parseRate(settings.followerVoice),
    followerVideo: parseRate(settings.followerVideo),
  };
  if (payload.friendVoice.mode === 'paid') validateCallGiftId(String(payload.friendVoice.giftId));
  if (payload.friendVideo.mode === 'paid') validateCallGiftId(String(payload.friendVideo.giftId));
  if (payload.followerVoice.mode === 'paid') validateCallGiftId(String(payload.followerVoice.giftId));
  if (payload.followerVideo.mode === 'paid') validateCallGiftId(String(payload.followerVideo.giftId));
  await updateDoc(userRef(uid), { callSettings: payload, updatedAt: serverTimestamp() });
  await setDoc(settingsSubRef(uid), { ...payload, updatedAt: serverTimestamp() }, { merge: true }).catch(ignoreWrite);
}

export function listenFreeCallContacts(
  uid: string,
  onChange: (uids: string[]) => void,
): Unsubscribe {
  return onSnapshot(privateFreeRef(uid), (snap) => {
    const map = snap.data()?.contacts;
    if (!map || typeof map !== 'object') {
      onChange([]);
      return;
    }
    onChange(Object.keys(map as Record<string, unknown>));
  });
}

export async function setFreeCallContact(ownerUid: string, contact: FriendChip, enabled: boolean) {
  const chatId = chatIdFor(ownerUid, contact.uid);
  const privateSnap = await getDoc(privateFreeRef(ownerUid));
  const contacts = {
    ...((privateSnap.data()?.contacts as Record<string, unknown> | undefined) || {}),
  };
  if (enabled) {
    contacts[contact.uid] = {
      uid: contact.uid,
      username: contact.username,
      displayName: contact.displayName,
      avatarUrl: contact.avatarUrl,
    };
  } else {
    delete contacts[contact.uid];
  }
  await setDoc(privateFreeRef(ownerUid), { contacts, updatedAt: serverTimestamp() }, { merge: true });
  await updateDoc(doc(db, 'chats', chatId), {
    [`callFreeBy.${ownerUid}`]: enabled,
  }).catch(ignoreWrite);
  const sub = doc(db, 'users', ownerUid, 'freeCallContacts', contact.uid);
  if (enabled) {
    await setDoc(sub, {
      uid: contact.uid,
      username: contact.username,
      displayName: contact.displayName,
      avatarUrl: contact.avatarUrl,
      createdAt: serverTimestamp(),
    }).catch(ignoreWrite);
  } else {
    await deleteDoc(sub).catch(ignoreWrite);
  }
}

export async function isFreeCallContact(ownerUid: string, contactUid: string, chatId?: string | null) {
  if (!ownerUid || !contactUid) return false;
  if (chatId) {
    const chat = await getDoc(doc(db, 'chats', chatId));
    const map = chat.data()?.callFreeBy;
    if (map && typeof map === 'object' && Boolean((map as Record<string, unknown>)[ownerUid])) {
      return true;
    }
  }
  const privateSnap = await getDoc(privateFreeRef(ownerUid)).catch(() => null);
  if (privateSnap?.exists()) {
    const map = privateSnap.data()?.contacts;
    if (map && typeof map === 'object' && contactUid in (map as object)) return true;
  }
  const snap = await getDoc(doc(db, 'users', ownerUid, 'freeCallContacts', contactUid)).catch(() => null);
  return Boolean(snap?.exists());
}

function rateFor(settings: CreatorCallSettings, kind: CallKind, follower: boolean): CallRateConfig {
  if (follower) return kind === 'video' ? settings.followerVideo : settings.followerVoice;
  return kind === 'video' ? settings.friendVideo : settings.friendVoice;
}

export async function getCallAccess(
  callerId: string,
  creatorId: string,
  kind: CallKind,
  settings?: CreatorCallSettings,
  freeContact?: boolean,
): Promise<CallAccess> {
  const perms = await getCommunicationPermissions(callerId, creatorId);
  const cfg = settings || DEFAULT_CALL_SETTINGS;
  const voiceEnabled = cfg.voiceEnabled !== false;
  const videoEnabled = cfg.videoEnabled !== false;
  const enabled = kind === 'video' ? videoEnabled : voiceEnabled;

  if (perms.relationship === 'blocked') {
    return {
      kind: 'blocked',
      canDirectCall: false,
      canRequestCall: false,
      voiceEnabled,
      videoEnabled,
      pricing: null,
      label: '',
    };
  }

  if (perms.relationship === 'friend') {
    const free = freeContact ?? (await isFreeCallContact(creatorId, callerId, chatIdFor(callerId, creatorId)));
    const pricing = free ? null : pricingFromRate(rateFor(cfg, kind, false));
    return {
      kind: free ? 'free_contact' : 'friend',
      canDirectCall: enabled,
      canRequestCall: false,
      voiceEnabled,
      videoEnabled,
      pricing,
      label: pricing ? `${pricing.rateBlasts} Blasts/min` : 'Gratis',
    };
  }

  if (perms.relationship === 'follower') {
    const pricing = pricingFromRate(rateFor(cfg, kind, true));
    const canRequest = Boolean(cfg.allowFollowerRequests) && enabled;
    return {
      kind: canRequest ? 'follower_request' : 'follower_chat',
      canDirectCall: false,
      canRequestCall: canRequest,
      voiceEnabled,
      videoEnabled,
      pricing,
      label: !canRequest ? '' : pricing ? `${pricing.rateBlasts} Blasts/min` : 'Gratis',
    };
  }

  return {
    kind: 'none',
    canDirectCall: false,
    canRequestCall: false,
    voiceEnabled,
    videoEnabled,
    pricing: null,
    label: '',
  };
}

function parseRequest(raw: unknown, fallbackId: string, chatId: string): CallRequestDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const expiresAtMs = Number(data.expiresAtMs) || 0;
  const status =
    data.status === 'accepted' || data.status === 'rejected' || data.status === 'cancelled'
      ? data.status
      : 'pending';
  return {
    id: String(data.id || fallbackId),
    chatId: String(data.chatId || chatId),
    callerId: String(data.callerId || ''),
    callerName: String(data.callerName || data.callerHandle || ''),
    callerHandle: String(data.callerHandle || ''),
    callerAvatar: (data.callerAvatar as string | null) ?? null,
    callType: data.callType === 'video' ? 'video' : 'audio',
    giftId: (data.giftId as string | null) ?? null,
    giftName: (data.giftName as string | null) ?? null,
    giftEmoji: (data.giftEmoji as string | null) ?? null,
    rateBlasts: Math.max(0, Math.floor(Number(data.rateBlasts) || 0)),
    status,
    createdAtMs: Number(data.createdAtMs) || 0,
    expiresAtMs,
    authorizationId: (data.authorizationId as string | null) ?? null,
  };
}

export async function createCallRequest(
  creatorId: string,
  caller: FriendChip & { uid: string },
  callType: CallKind,
  pricing: CallRateSnapshot | null,
  chatId: string,
) {
  await assertCanStartCall(caller.uid, creatorId);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const expiresAtMs = Date.now() + 15 * 60_000;
  const payload = {
    id,
    chatId,
    callerId: caller.uid,
    callerName: caller.displayName || caller.username,
    callerHandle: caller.username,
    callerAvatar: caller.avatarUrl,
    callType,
    giftId: pricing?.giftId || null,
    giftName: pricing?.giftName || null,
    giftEmoji: pricing?.giftEmoji || null,
    rateBlasts: pricing?.rateBlasts || 0,
    status: 'pending' as const,
    createdAtMs: Date.now(),
    expiresAtMs,
    toUid: creatorId,
  };
  await updateDoc(doc(db, 'chats', chatId), { callRequest: payload });
  await setDoc(doc(db, 'users', creatorId, 'callRequests', id), {
    ...payload,
    createdAt: serverTimestamp(),
  }).catch(ignoreWrite);
  return id;
}

export function listenIncomingCallRequests(
  creatorId: string,
  onChange: (requests: CallRequestDoc[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'chats'), where('participants', 'array-contains', creatorId));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const list = snap.docs
      .map((item) => parseRequest(item.data().callRequest, item.id, item.id))
      .filter((item): item is CallRequestDoc => Boolean(item))
      .filter((item) => item.status === 'pending' && item.expiresAtMs > now && item.chatId)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
    onChange(list);
  });
}

export function listenCallRequest(
  creatorId: string,
  requestId: string,
  onChange: (request: CallRequestDoc | null) => void,
  chatId?: string | null,
): Unsubscribe {
  if (chatId) {
    return onSnapshot(doc(db, 'chats', chatId), (snap) => {
      onChange(parseRequest(snap.data()?.callRequest, requestId, chatId));
    });
  }
  return onSnapshot(doc(db, 'users', creatorId, 'callRequests', requestId), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    onChange(parseRequest({ ...snap.data(), id: snap.id }, snap.id, String(snap.data()?.chatId || '')));
  });
}

export async function rejectCallRequest(creatorId: string, request: CallRequestDoc | string) {
  const req = typeof request === 'string' ? { id: request, chatId: '' } : request;
  if (typeof request !== 'string' && request.chatId) {
    await updateDoc(doc(db, 'chats', request.chatId), {
      'callRequest.status': 'rejected',
      'callRequest.resolvedAtMs': Date.now(),
    });
  }
  await updateDoc(doc(db, 'users', creatorId, 'callRequests', req.id), {
    status: 'rejected',
    resolvedAt: serverTimestamp(),
  }).catch(ignoreWrite);
}

export async function cancelCallRequest(creatorId: string, request: { id: string; chatId: string }) {
  if (request.chatId) {
    await updateDoc(doc(db, 'chats', request.chatId), {
      'callRequest.status': 'cancelled',
      'callRequest.resolvedAtMs': Date.now(),
    });
  }
  await updateDoc(doc(db, 'users', creatorId, 'callRequests', request.id), {
    status: 'cancelled',
    resolvedAt: serverTimestamp(),
  }).catch(ignoreWrite);
}

export async function acceptCallRequest(creatorId: string, request: CallRequestDoc) {
  const authorizationId = `auth_${request.id}`;
  const expiresAtMs = Date.now() + 10 * 60_000;
  const authz = {
    id: authorizationId,
    requestId: request.id,
    callerId: request.callerId,
    creatorId,
    callType: request.callType,
    giftId: request.giftId,
    giftName: request.giftName,
    giftEmoji: request.giftEmoji,
    rateBlasts: request.rateBlasts,
    expiresAtMs,
  };
  if (request.chatId) {
    await updateDoc(doc(db, 'chats', request.chatId), {
      callAuthorization: authz,
      'callRequest.status': 'accepted',
      'callRequest.authorizationId': authorizationId,
      'callRequest.resolvedAtMs': Date.now(),
    });
  }
  await setDoc(doc(db, 'users', creatorId, 'callAuthorizations', authorizationId), {
    ...authz,
    createdAt: serverTimestamp(),
  }).catch(ignoreWrite);
  await updateDoc(doc(db, 'users', creatorId, 'callRequests', request.id), {
    status: 'accepted',
    authorizationId,
    resolvedAt: serverTimestamp(),
  }).catch(ignoreWrite);
  return authorizationId;
}

export async function readCallAuthorization(creatorId: string, authorizationId: string, chatId?: string | null) {
  if (chatId) {
    const chat = await getDoc(doc(db, 'chats', chatId));
    const data = chat.data()?.callAuthorization as Record<string, unknown> | undefined;
    if (data && String(data.id || '') === authorizationId) {
      const expiresAtMs = Number(data.expiresAtMs) || 0;
      if (expiresAtMs && expiresAtMs < Date.now()) return null;
      return {
        id: String(data.id),
        requestId: String(data.requestId || ''),
        callerId: String(data.callerId || ''),
        creatorId: String(data.creatorId || creatorId),
        callType: data.callType === 'video' ? 'video' : ('audio' as CallKind),
        giftId: (data.giftId as string | null) ?? null,
        giftName: (data.giftName as string | null) ?? null,
        giftEmoji: (data.giftEmoji as string | null) ?? null,
        rateBlasts: Math.max(0, Math.floor(Number(data.rateBlasts) || 0)),
        expiresAtMs,
      };
    }
  }
  const snap = await getDoc(doc(db, 'users', creatorId, 'callAuthorizations', authorizationId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const expiresAtMs = Number(data.expiresAtMs) || 0;
  if (expiresAtMs && expiresAtMs < Date.now()) return null;
  return {
    id: snap.id,
    requestId: String(data.requestId || ''),
    callerId: String(data.callerId || ''),
    creatorId: String(data.creatorId || creatorId),
    callType: data.callType === 'video' ? 'video' : ('audio' as CallKind),
    giftId: (data.giftId as string | null) ?? null,
    giftName: (data.giftName as string | null) ?? null,
    giftEmoji: (data.giftEmoji as string | null) ?? null,
    rateBlasts: Math.max(0, Math.floor(Number(data.rateBlasts) || 0)),
    expiresAtMs,
  };
}

export async function processCallGiftPayment(input: {
  callId: string;
  chatId: string;
  payerId: string;
  payerName: string;
  creatorId: string;
  giftId: string;
  rateBlasts: number;
  minuteBlock: number;
}): Promise<{ duplicate: boolean; spent: number; senderBalance: number }> {
  const catalog = findLiveGift(input.giftId);
  if (!catalog) {
    throw new Error('Elige un regalo válido de la tarifa de llamadas (máx. 150 Blasts).');
  }
  const rate = Math.max(0, Math.floor(Number(input.rateBlasts) || 0));
  if (!isAllowedCallGiftValue(rate)) {
    throw new Error('La tarifa de esta llamada no es válida.');
  }
  const giftName = catalog.name;
  const giftEmoji = catalog.emoji;
  const blockKey = String(input.minuteBlock);
  const senderRef = doc(db, 'users', input.payerId);
  const inboxRef = doc(collection(db, 'users', input.creatorId, 'giftInbox'));
  const callRef = doc(db, 'chats', input.chatId);

  return runTransaction(db, async (tx) => {
    const senderSnap = await tx.get(senderRef);
    const callSnap = await tx.get(callRef);
    const prevCall = (callSnap.data()?.call && typeof callSnap.data()?.call === 'object'
      ? (callSnap.data()?.call as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const charged =
      prevCall.chargedBlocks && typeof prevCall.chargedBlocks === 'object'
        ? { ...(prevCall.chargedBlocks as Record<string, boolean>) }
        : {};
    if (charged[blockKey]) {
      return {
        duplicate: true,
        spent: rate,
        senderBalance: -1,
      };
    }
    if (String(prevCall.id || '') && String(prevCall.id) !== String(input.callId)) {
      throw new Error('La llamada activa ya no coincide.');
    }
    const current = senderSnap.exists() ? Number(senderSnap.data()?.coinsBalance ?? 0) : 0;
    if (current < rate) {
      throw new Error(`Necesitas al menos ${rate} Blasts para continuar esta llamada.`);
    }
    const next = current - rate;
    const prevSpent = Math.max(0, Math.floor(Number(prevCall.spentBlasts) || 0));
    const prevBlocks = Math.max(0, Math.floor(Number(prevCall.blocksCharged) || 0));
    charged[blockKey] = true;
    tx.set(
      senderRef,
      { coinsBalance: next, updatedAt: serverTimestamp() },
      { merge: true },
    );
    tx.set(inboxRef, {
      senderUid: input.payerId,
      senderName: input.payerName,
      recipientUid: input.creatorId,
      giftId: catalog.id,
      giftName,
      emoji: giftEmoji,
      coins: rate,
      multiplier: 1,
      postId: null,
      clientId: `call:${input.callId}:block:${input.minuteBlock}`,
      callId: input.callId,
      minuteBlock: input.minuteBlock,
      processed: false,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
    tx.update(callRef, {
      call: {
        ...prevCall,
        spentBlasts: prevSpent + rate,
        blocksCharged: prevBlocks + 1,
        chargedBlocks: charged,
      },
    });
    return { duplicate: false, spent: rate, senderBalance: next };
  });
}

export function callConfirmCopy(pricing: CallRateSnapshot | null, balance: number) {
  if (!pricing || pricing.rateBlasts <= 0) {
    return { title: 'Llamada gratuita', body: 'Esta llamada no tiene costo en Blasts.' };
  }
  const mins = estimateCallMinutes(balance, pricing.rateBlasts);
  return {
    title: `${pricing.giftName}`,
    body: `Cada bloque iniciado de 60 segundos tiene un costo de ${pricing.rateBlasts} Blasts.`,
    estimate: Number.isFinite(mins) ? mins : 0,
  };
}
