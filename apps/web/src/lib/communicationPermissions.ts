import { doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

export type CommunicationRelationship = 'blocked' | 'none' | 'follower' | 'friend';

export type CommunicationPermissions = {
  relationship: CommunicationRelationship;
  canMessage: boolean;
  canVoiceCall: boolean;
  canVideoCall: boolean;
};

const NONE: CommunicationPermissions = {
  relationship: 'none',
  canMessage: false,
  canVoiceCall: false,
  canVideoCall: false,
};

function blockedPerms(): CommunicationPermissions {
  return {
    relationship: 'blocked',
    canMessage: false,
    canVoiceCall: false,
    canVideoCall: false,
  };
}

export function permissionsFromFlags(flags: {
  blocked: boolean;
  friend: boolean;
  follower: boolean;
}): CommunicationPermissions {
  if (flags.blocked) return blockedPerms();
  if (flags.friend) {
    return {
      relationship: 'friend',
      canMessage: true,
      canVoiceCall: true,
      canVideoCall: true,
    };
  }
  if (flags.follower) {
    return {
      relationship: 'follower',
      canMessage: true,
      canVoiceCall: false,
      canVideoCall: false,
    };
  }
  return NONE;
}

function isAcceptedFriendData(exists: boolean, data: Record<string, unknown> | undefined): boolean {
  if (!exists) return false;
  const status = data?.status;
  if (status == null || status === '') return true;
  return String(status).toLowerCase() === 'accepted';
}

async function docExistsAccepted(path: [string, string, string, string]): Promise<boolean> {
  const snap = await getDoc(doc(db, ...path));
  return isAcceptedFriendData(snap.exists(), snap.data() as Record<string, unknown> | undefined);
}

async function docExists(path: [string, string, string, string]): Promise<boolean> {
  const snap = await getDoc(doc(db, ...path));
  return snap.exists();
}

/** Single source of truth: chat vs voice/video according to relationship. */
export async function getCommunicationPermissions(
  currentUserId: string,
  targetUserId: string,
): Promise<CommunicationPermissions> {
  const a = String(currentUserId || '').trim();
  const b = String(targetUserId || '').trim();
  if (!a || !b || a === b) return NONE;

  const [blockedAb, blockedBa, friendAb, friendBa, followAb, followBa] = await Promise.all([
    docExists(['users', a, 'blocked', b]),
    docExists(['users', b, 'blocked', a]),
    docExistsAccepted(['users', a, 'friends', b]),
    docExistsAccepted(['users', b, 'friends', a]),
    docExists(['users', a, 'following', b]),
    docExists(['users', b, 'following', a]),
  ]);

  return permissionsFromFlags({
    blocked: blockedAb || blockedBa,
    friend: friendAb && friendBa,
    follower: followAb || followBa,
  });
}

export async function canCallUser(currentUserId: string, targetUserId: string): Promise<boolean> {
  const perms = await getCommunicationPermissions(currentUserId, targetUserId);
  return perms.canVoiceCall;
}

/** Fast path from the live friends list (accepted friends only). */
export function canCallFromFriends(friends: Array<{ uid: string }>, targetUid: string) {
  const uid = String(targetUid || '').trim();
  if (!uid) return false;
  return friends.some((friend) => friend.uid === uid);
}

export function listenAcceptedFriendship(
  currentUserId: string,
  targetUserId: string,
  onChange: (accepted: boolean) => void,
): Unsubscribe {
  const a = String(currentUserId || '').trim();
  const b = String(targetUserId || '').trim();
  if (!a || !b || a === b) {
    onChange(false);
    return () => undefined;
  }

  let mine = false;
  let theirs = false;
  const emit = () => onChange(mine && theirs);

  const unsubMine = onSnapshot(doc(db, 'users', a, 'friends', b), (snap) => {
    mine = isAcceptedFriendData(snap.exists(), snap.data() as Record<string, unknown> | undefined);
    emit();
  });
  const unsubTheirs = onSnapshot(doc(db, 'users', b, 'friends', a), (snap) => {
    theirs = isAcceptedFriendData(snap.exists(), snap.data() as Record<string, unknown> | undefined);
    emit();
  });

  return () => {
    unsubMine();
    unsubTheirs();
  };
}
