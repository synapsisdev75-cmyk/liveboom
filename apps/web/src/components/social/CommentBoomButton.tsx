import { useEffect, useRef, useState } from 'react';
import {
  listenReactionCounts,
  setReaction,
  type LiveBoomReaction,
  type LiveBoomReactionStats,
} from '../../lib/liveBoomReactionService';
import { useAuthStore } from '../../store/authStore';
import { LiveBoomReactionControl } from './LiveBoomReactionControl';

type Props = {
  postId: string;
  commentId: string;
  currentUserId?: string | null;
  boomCount?: number;
  hasBoomed?: boolean;
};

function boomFailMessage(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (code === 'unauthenticated') return 'Inicia sesión para reaccionar';
  if (code === 'unavailable' || /network|offline|Failed to fetch/i.test(String(error))) {
    return 'Sin conexión. Intenta de nuevo.';
  }
  if (code === 'permission-denied') return 'No se pudo guardar la reacción';
  return 'No se pudo guardar la reacción';
}

export function CommentBoomReaction({
  postId,
  commentId,
  currentUserId,
  boomCount,
  hasBoomed,
}: Props) {
  const profile = useAuthStore((state) => state.profile);
  const uid = currentUserId || profile?.firebaseUid || null;
  const [stats, setStats] = useState<LiveBoomReactionStats>({
    likeCount: Math.max(0, boomCount ?? 0),
    dislikeCount: 0,
    currentUserReaction: hasBoomed ? 'like' : null,
    likers: [],
    dislikers: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const latestRef = useRef<LiveBoomReactionStats | null>(null);

  useEffect(() => {
    return listenReactionCounts('comment', commentId, uid, (next) => {
      latestRef.current = next;
      if (busyRef.current) return;
      setStats(next);
    }, { postId });
  }, [commentId, postId, uid]);

  async function react(kind: 'like' | 'dislike') {
    if (!uid || !profile) {
      setError('Inicia sesión para reaccionar');
      return;
    }
    if (!commentId) {
      setError('No se pudo guardar la reacción');
      return;
    }
    if (busyRef.current) return;
    const previous = stats;
    const next: LiveBoomReaction = previous.currentUserReaction === kind ? null : kind;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setStats({
      ...previous,
      currentUserReaction: next,
      likeCount: Math.max(
        0,
        previous.likeCount +
          (next === 'like' ? 1 : 0) -
          (previous.currentUserReaction === 'like' ? 1 : 0),
      ),
      dislikeCount: Math.max(
        0,
        previous.dislikeCount +
          (next === 'dislike' ? 1 : 0) -
          (previous.currentUserReaction === 'dislike' ? 1 : 0),
      ),
    });
    try {
      await setReaction('comment', commentId, uid, kind, {
        postId,
        current: previous.currentUserReaction,
        profile: {
          username: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      });
    } catch (err) {
      console.error('Comment reaction failed', { commentId, userId: uid, error: err });
      setStats(previous);
      setError(boomFailMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (latestRef.current) setStats(latestRef.current);
    }
  }

  return (
    <div
      className="relative inline-flex min-h-11 min-w-0 items-center"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <LiveBoomReactionControl
        currentUserReaction={stats.currentUserReaction}
        likeCount={stats.likeCount}
        dislikeCount={stats.dislikeCount}
        likers={stats.likers}
        dislikers={stats.dislikers}
        busy={busy}
        onReact={(kind) => void react(kind)}
        size="sm"
      />
      {error ? (
        <span className="pointer-events-none absolute left-0 top-full z-20 whitespace-nowrap text-[10px] text-rose-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export const CommentBoomButton = CommentBoomReaction;

export function BoomReaction({
  targetType,
  targetId,
  postId,
  currentUserId,
  initialCount,
  initialActive,
}: {
  targetType: 'post' | 'comment';
  targetId: string;
  postId?: string;
  currentUserId?: string | null;
  initialCount?: number;
  initialActive?: boolean;
}) {
  if (targetType !== 'comment') return null;
  return (
    <CommentBoomReaction
      postId={postId || ''}
      commentId={targetId}
      currentUserId={currentUserId}
      boomCount={initialCount}
      hasBoomed={initialActive}
    />
  );
}
