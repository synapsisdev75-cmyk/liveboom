import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export type CommentBoomUser = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type CommentBoomStats = {
  count: number;
  viewerBoom: boolean;
  users: CommentBoomUser[];
};

export type CommentBoomProfile = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

function boomUsersCol(commentId: string) {
  return collection(db, 'commentBooms', commentId, 'users');
}

function boomUserDoc(commentId: string, userId: string) {
  return doc(db, 'commentBooms', commentId, 'users', userId);
}

function userFromDoc(id: string, data: Record<string, unknown>): CommentBoomUser {
  const username = String(data.username || '').trim();
  return {
    uid: id,
    username: username || id.slice(0, 8),
    displayName: String(data.displayName || username || 'Usuario'),
    avatarUrl: (data.avatarUrl as string | null) ?? null,
  };
}

function statsFromDocs(
  docs: Array<{ id: string; data: () => unknown }>,
  viewerUid: string | null | undefined,
): CommentBoomStats {
  const ranked: Array<CommentBoomUser & { at: number }> = [];
  let viewerBoom = false;
  for (const item of docs) {
    const data = (item.data() as Record<string, unknown>) || {};
    const user = userFromDoc(item.id, data);
    const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
    const at = Number(data.createdAtMs || createdAt?.toMillis?.() || 0);
    ranked.push({ ...user, at });
    if (viewerUid && item.id === viewerUid) viewerBoom = true;
  }
  ranked.sort((a, b) => b.at - a.at);
  return {
    count: ranked.length,
    viewerBoom,
    users: ranked.map(({ uid, username, displayName, avatarUrl }) => ({
      uid,
      username,
      displayName,
      avatarUrl,
    })),
  };
}

function requireIds(commentId: string, userId: string) {
  const cid = String(commentId || '').trim();
  const uid = String(userId || '').trim();
  if (!cid) throw new Error('commentId vacío');
  if (!uid) throw new Error('userId vacío');
  return { commentId: cid, userId: uid };
}

export function listenCommentBooms(
  commentId: string,
  viewerUid: string | null | undefined,
  onChange: (stats: CommentBoomStats) => void,
): Unsubscribe {
  const cid = String(commentId || '').trim();
  if (!cid) {
    onChange({ count: 0, viewerBoom: false, users: [] });
    return () => undefined;
  }
  return onSnapshot(
    boomUsersCol(cid),
    (snap) => {
      onChange(statsFromDocs(snap.docs, viewerUid));
    },
    (error) => {
      console.error('Comment Boom failed', { commentId: cid, userId: viewerUid || null, error });
    },
  );
}

export async function addCommentBoom(
  commentId: string,
  userId: string,
  profile?: CommentBoomProfile,
  postId?: string | null,
) {
  const ids = requireIds(commentId, userId);
  await setDoc(
    boomUserDoc(ids.commentId, ids.userId),
    {
      commentId: ids.commentId,
      userId: ids.userId,
      postId: String(postId || '').trim() || null,
      username: String(profile?.username || '')
        .replace(/^@/, '')
        .toLowerCase(),
      displayName: profile?.displayName || profile?.username || '',
      avatarUrl: profile?.avatarUrl ?? null,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    },
    { merge: true },
  );
}

export async function removeCommentBoom(commentId: string, userId: string) {
  const ids = requireIds(commentId, userId);
  await deleteDoc(boomUserDoc(ids.commentId, ids.userId));
}

export async function toggleCommentBoom(
  commentId: string,
  userId: string,
  currentlyActive: boolean,
  profile?: CommentBoomProfile,
  postId?: string | null,
) {
  if (currentlyActive) {
    await removeCommentBoom(commentId, userId);
    return false;
  }
  await addCommentBoom(commentId, userId, profile, postId);
  return true;
}

export async function getCommentBoomCount(commentId: string): Promise<number> {
  const cid = String(commentId || '').trim();
  if (!cid) return 0;
  const snap = await getDocs(boomUsersCol(cid));
  return snap.size;
}

export async function hasUserBoomedComment(commentId: string, userId: string): Promise<boolean> {
  const ids = requireIds(commentId, userId);
  const snap = await getDoc(boomUserDoc(ids.commentId, ids.userId));
  return snap.exists();
}

export async function getCommentBoomUsers(commentId: string): Promise<CommentBoomUser[]> {
  const cid = String(commentId || '').trim();
  if (!cid) return [];
  const snap = await getDocs(boomUsersCol(cid));
  return statsFromDocs(snap.docs, null).users;
}

export const CommentBoomService = {
  addCommentBoom,
  removeCommentBoom,
  toggleCommentBoom,
  getCommentBoomCount,
  hasUserBoomedComment,
  getCommentBoomUsers,
  listenCommentBooms,
};
