import { useEffect, useRef, useState } from 'react';
import {
  listenCommentBooms,
  toggleCommentBoom,
  type CommentBoomUser,
} from '../../lib/commentBoomService';
import { useAuthStore } from '../../store/authStore';
import { BoomLikeButton } from './BoomButtons';
import { ReactionList } from './PostReactionButtons';

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
  if (code === 'permission-denied') return 'No se pudo guardar el Boom';
  return 'No se pudo guardar el Boom';
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
  const [count, setCount] = useState(Math.max(0, boomCount ?? 0));
  const [active, setActive] = useState(Boolean(hasBoomed));
  const [users, setUsers] = useState<CommentBoomUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [showWho, setShowWho] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const latestRef = useRef<{ count: number; viewerBoom: boolean; users: CommentBoomUser[] } | null>(
    null,
  );

  function applyStats(stats: { count: number; viewerBoom: boolean; users: CommentBoomUser[] }) {
    setCount(Math.max(0, stats.count));
    setActive(stats.viewerBoom);
    setUsers(stats.users);
  }

  useEffect(() => {
    return listenCommentBooms(commentId, uid, (stats) => {
      latestRef.current = stats;
      if (busyRef.current) return;
      applyStats(stats);
    });
  }, [commentId, uid]);

  useEffect(() => {
    if (!showWho) return;
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setShowWho(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowWho(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [showWho]);

  async function toggle() {
    if (!uid || !profile) {
      setError('Inicia sesión para reaccionar');
      return;
    }
    if (!commentId) {
      console.error('Comment Boom failed', { commentId, userId: uid, error: 'commentId undefined' });
      setError('No se pudo guardar el Boom');
      return;
    }
    if (busyRef.current) return;
    const currentlyActive = active;
    const previous = { active, count, users };
    const statsBeforeWrite = latestRef.current;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setActive(!currentlyActive);
    setCount((value) => Math.max(0, value + (currentlyActive ? -1 : 1)));
    if (!currentlyActive) {
      setUsers((current) => {
        if (current.some((user) => user.uid === uid)) return current;
        return [
          {
            uid,
            username: profile.handle,
            displayName: profile.displayName || profile.handle,
            avatarUrl: profile.avatarUrl,
          },
          ...current,
        ];
      });
    } else {
      setUsers((current) => current.filter((user) => user.uid !== uid));
    }
    try {
      await toggleCommentBoom(commentId, uid, currentlyActive, {
        username: profile.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      }, postId);
    } catch (err) {
      console.error('Comment Boom failed', { commentId, userId: uid, error: err });
      setActive(previous.active);
      setCount(previous.count);
      setUsers(previous.users);
      setError(boomFailMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (latestRef.current && latestRef.current !== statsBeforeWrite) {
        applyStats(latestRef.current);
      }
    }
  }

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex min-h-11 min-w-0 items-center"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <BoomLikeButton
        size="sm"
        active={active}
        busy={busy}
        count={count}
        onToggle={() => void toggle()}
        onShowWho={() => setShowWho((value) => !value)}
      />
      {showWho ? (
        <ReactionList title="Personas que dieron Boom" users={users} onClose={() => setShowWho(false)} />
      ) : null}
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
