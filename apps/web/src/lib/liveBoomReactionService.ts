import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  addCommentBoom,
  listenCommentBooms,
  removeCommentBoom,
  type CommentBoomUser,
} from './commentBoomService';
import { listenPostReactions, setPostReaction } from './socialFirestore';
import type { LiveBoomReaction, LiveBoomTargetType } from './liveBoomReactionAssets';
import type { PostReactionUser } from './socialFirestore';

export type { LiveBoomReaction, LiveBoomTargetType } from './liveBoomReactionAssets';

export type LiveBoomReactionUser = PostReactionUser;

export type LiveBoomReactionStats = {
  likeCount: number;
  dislikeCount: number;
  currentUserReaction: LiveBoomReaction;
  likers: LiveBoomReactionUser[];
  dislikers: LiveBoomReactionUser[];
};

export type LiveBoomReactionProfile = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

function userFrom(id: string, data: Record<string, unknown>): LiveBoomReactionUser {
  const username = String(data.username || '').trim();
  return {
    uid: id,
    username: username || id.slice(0, 8),
    displayName: String(data.displayName || username || 'Usuario'),
    avatarUrl: (data.avatarUrl as string | null) ?? null,
  };
}

function emptyStats(): LiveBoomReactionStats {
  return { likeCount: 0, dislikeCount: 0, currentUserReaction: null, likers: [], dislikers: [] };
}

export async function setReaction(
  targetType: LiveBoomTargetType,
  targetId: string,
  userId: string,
  reactionType: Exclude<LiveBoomReaction, null>,
  extras?: {
    postId?: string;
    chatId?: string;
    profile?: LiveBoomReactionProfile;
    current?: LiveBoomReaction;
  },
) {
  const next = extras?.current === reactionType ? null : reactionType;
  if (next === null) {
    await removeReaction(targetType, targetId, userId, extras);
    return;
  }
  if (targetType === 'post' || targetType === 'boomclip' || targetType === 'flashboom') {
    await setPostReaction(targetId, userId, next, extras?.profile);
    return;
  }
  if (targetType === 'comment' || targetType === 'reply') {
    const postId = String(extras?.postId || '').trim();
    if (!postId) throw new Error('postId requerido');
    const ref = doc(db, 'posts', postId, 'comments', targetId, 'reactions', userId);
    if (next === 'like') {
      await Promise.all([
        addCommentBoom(targetId, userId, extras?.profile, postId),
        deleteDoc(ref).catch(() => undefined),
      ]);
      return;
    }
    await Promise.all([
      removeCommentBoom(targetId, userId).catch(() => undefined),
      setDoc(
        ref,
        {
          type: 'dislike',
          username: extras?.profile?.username || '',
          displayName: extras?.profile?.displayName || extras?.profile?.username || '',
          avatarUrl: extras?.profile?.avatarUrl ?? null,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ]);
    return;
  }
  const chatId = String(extras?.chatId || '').trim();
  if (!chatId) throw new Error('chatId requerido');
  await setDoc(
    doc(db, 'chats', chatId, 'messages', targetId, 'reactions', userId),
    {
      type: next,
      username: extras?.profile?.username || '',
      displayName: extras?.profile?.displayName || extras?.profile?.username || '',
      avatarUrl: extras?.profile?.avatarUrl ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function removeReaction(
  targetType: LiveBoomTargetType,
  targetId: string,
  userId: string,
  extras?: { postId?: string; chatId?: string },
) {
  if (targetType === 'post' || targetType === 'boomclip' || targetType === 'flashboom') {
    await setPostReaction(targetId, userId, null);
    return;
  }
  if (targetType === 'comment' || targetType === 'reply') {
    const postId = String(extras?.postId || '').trim();
    await Promise.all([
      removeCommentBoom(targetId, userId).catch(() => undefined),
      postId
        ? deleteDoc(doc(db, 'posts', postId, 'comments', targetId, 'reactions', userId)).catch(() => undefined)
        : Promise.resolve(),
    ]);
    return;
  }
  const chatId = String(extras?.chatId || '').trim();
  if (!chatId) return;
  await deleteDoc(doc(db, 'chats', chatId, 'messages', targetId, 'reactions', userId));
}

export function listenReactionCounts(
  targetType: LiveBoomTargetType,
  targetId: string,
  userId: string | null | undefined,
  onChange: (stats: LiveBoomReactionStats) => void,
  extras?: { postId?: string; chatId?: string },
): Unsubscribe {
  if (targetType === 'post' || targetType === 'boomclip' || targetType === 'flashboom') {
    if (!targetId) {
      onChange(emptyStats());
      return () => undefined;
    }
    return listenPostReactions(targetId, userId, (stats) => {
      onChange({
        likeCount: Math.max(0, stats.likes),
        dislikeCount: Math.max(0, stats.dislikes),
        currentUserReaction: stats.viewerReaction,
        likers: stats.likers,
        dislikers: stats.dislikers,
      });
    });
  }
  if (targetType === 'comment' || targetType === 'reply') {
    return listenCommentPair(String(extras?.postId || ''), targetId, userId, onChange);
  }
  if (targetType === 'message') {
    const chatId = String(extras?.chatId || '').trim();
    if (!chatId || !targetId) {
      onChange(emptyStats());
      return () => undefined;
    }
    return onSnapshot(
      collection(db, 'chats', chatId, 'messages', targetId, 'reactions'),
      (snap) => onChange(statsFromReactionDocs(snap.docs, userId)),
      () => onChange(emptyStats()),
    );
  }
  onChange(emptyStats());
  return () => undefined;
}

export async function getReactionCounts(
  targetType: LiveBoomTargetType,
  targetId: string,
  extras?: { postId?: string; chatId?: string },
): Promise<Pick<LiveBoomReactionStats, 'likeCount' | 'dislikeCount'>> {
  if (targetType === 'post' || targetType === 'boomclip' || targetType === 'flashboom') {
    const snap = await getDocs(collection(db, 'posts', targetId, 'reactions'));
    const stats = statsFromReactionDocs(snap.docs, null);
    return { likeCount: stats.likeCount, dislikeCount: stats.dislikeCount };
  }
  if (targetType === 'comment' || targetType === 'reply') {
    const postId = String(extras?.postId || '').trim();
    const [boomSnap, dislikeSnap] = await Promise.all([
      getDocs(collection(db, 'commentBooms', targetId, 'users')),
      postId
        ? getDocs(collection(db, 'posts', postId, 'comments', targetId, 'reactions'))
        : Promise.resolve({ docs: [] as Array<{ id: string; data: () => unknown }> }),
    ]);
    const dislikeCount = dislikeSnap.docs.filter(
      (item) => String((item.data() as Record<string, unknown>).type || '') === 'dislike',
    ).length;
    return { likeCount: boomSnap.size, dislikeCount };
  }
  const chatId = String(extras?.chatId || '').trim();
  if (!chatId) return { likeCount: 0, dislikeCount: 0 };
  const snap = await getDocs(collection(db, 'chats', chatId, 'messages', targetId, 'reactions'));
  const stats = statsFromReactionDocs(snap.docs, null);
  return { likeCount: stats.likeCount, dislikeCount: stats.dislikeCount };
}

function statsFromReactionDocs(
  docs: Array<{ id: string; data: () => unknown }>,
  viewerUid: string | null | undefined,
): LiveBoomReactionStats {
  const likers: LiveBoomReactionUser[] = [];
  const dislikers: LiveBoomReactionUser[] = [];
  let currentUserReaction: LiveBoomReaction = null;
  for (const item of docs) {
    const data = (item.data() as Record<string, unknown>) || {};
    const type = String(data.type || '');
    const user = userFrom(item.id, data);
    if (type === 'like') likers.push(user);
    if (type === 'dislike') dislikers.push(user);
    if (viewerUid && item.id === viewerUid && (type === 'like' || type === 'dislike')) {
      currentUserReaction = type;
    }
  }
  return {
    likeCount: likers.length,
    dislikeCount: dislikers.length,
    currentUserReaction,
    likers,
    dislikers,
  };
}

function listenCommentPair(
  postId: string,
  commentId: string,
  userId: string | null | undefined,
  onChange: (stats: LiveBoomReactionStats) => void,
): Unsubscribe {
  let boomUsers: CommentBoomUser[] = [];
  let boomActive = false;
  let dislikeUsers: LiveBoomReactionUser[] = [];
  let viewerDislike = false;

  function emit() {
    const likeMap = new Map(boomUsers.map((user) => [user.uid, user]));
    onChange({
      likeCount: likeMap.size,
      dislikeCount: dislikeUsers.length,
      currentUserReaction: viewerDislike ? 'dislike' : boomActive ? 'like' : null,
      likers: [...likeMap.values()],
      dislikers: dislikeUsers,
    });
  }

  const stopBoom = listenCommentBooms(commentId, userId, (stats) => {
    boomUsers = stats.users;
    boomActive = stats.viewerBoom;
    emit();
  });

  let stopDislike: Unsubscribe = () => undefined;
  if (postId && commentId) {
    stopDislike = onSnapshot(
      collection(db, 'posts', postId, 'comments', commentId, 'reactions'),
      (snap) => {
        dislikeUsers = [];
        viewerDislike = false;
        for (const item of snap.docs) {
          const data = item.data() as Record<string, unknown>;
          if (String(data.type || '') !== 'dislike') continue;
          dislikeUsers.push(userFrom(item.id, data));
          if (userId && item.id === userId) viewerDislike = true;
        }
        emit();
      },
      () => {
        dislikeUsers = [];
        viewerDislike = false;
        emit();
      },
    );
  }

  return () => {
    stopBoom();
    stopDislike();
  };
}

export async function getUserReaction(
  targetType: LiveBoomTargetType,
  targetId: string,
  userId: string,
  extras?: { postId?: string; chatId?: string },
): Promise<LiveBoomReaction> {
  const uid = String(userId || '').trim();
  if (!uid || !targetId) return null;

  if (targetType === 'post' || targetType === 'boomclip' || targetType === 'flashboom') {
    const snap = await getDocs(collection(db, 'posts', targetId, 'reactions'));
    return statsFromReactionDocs(snap.docs, uid).currentUserReaction;
  }
  if (targetType === 'comment' || targetType === 'reply') {
    const postId = String(extras?.postId || '').trim();
    const [boomSnap, reactSnap] = await Promise.all([
      getDocs(collection(db, 'commentBooms', targetId, 'users')),
      postId
        ? getDocs(collection(db, 'posts', postId, 'comments', targetId, 'reactions'))
        : Promise.resolve({ docs: [] as Array<{ id: string; data: () => unknown }> }),
    ]);
    const disliked = reactSnap.docs.some((item) => {
      const type = String((item.data() as Record<string, unknown>).type || '');
      return item.id === uid && type === 'dislike';
    });
    if (disliked) return 'dislike';
    if (boomSnap.docs.some((item) => item.id === uid)) return 'like';
    return null;
  }
  const chatId = String(extras?.chatId || '').trim();
  if (!chatId) return null;
  const snap = await getDocs(collection(db, 'chats', chatId, 'messages', targetId, 'reactions'));
  return statsFromReactionDocs(snap.docs, uid).currentUserReaction;
}
