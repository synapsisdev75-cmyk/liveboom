import { Globe, Lock, MessageCircle, ThumbsDown, ThumbsUp, UserMinus, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addPostComment,
  deletePostComment,
  followUser,
  isFollowing,
  listenPostComments,
  listenPostReactions,
  setPostReaction,
  unfollowUser,
  type PostComment,
} from '../../lib/socialFirestore';
import { profileHref } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';

type Props = {
  username: string;
  initialFollowing: boolean;
  isOwnProfile: boolean;
  onChange?: (following: boolean) => void;
};

export function FollowButton({ username, initialFollowing, isOwnProfile, onChange }: Props) {
  const profile = useAuthStore((state) => state.profile);
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing, username]);

  useEffect(() => {
    if (!profile || isOwnProfile) return;
    void isFollowing(profile.firebaseUid, username).then((value) => {
      setFollowing(value);
    });
  }, [profile?.firebaseUid, username, isOwnProfile]);

  if (isOwnProfile || !profile) return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (following) {
        await unfollowUser(profile!.firebaseUid, username);
        setFollowing(false);
        onChange?.(false);
      } else {
        await followUser(
          {
            firebaseUid: profile!.firebaseUid,
            handle: profile!.handle,
            displayName: profile!.displayName,
            avatarUrl: profile!.avatarUrl,
          },
          username,
        );
        setFollowing(true);
        onChange?.(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-60 ${
          following
            ? 'border border-zinc-600 bg-zinc-800 text-zinc-200 hover:border-fuchsia-400'
            : 'bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-zinc-950'
        }`}
      >
        {following ? <UserMinus size={16} /> : <UserPlus size={16} />}
        {following ? 'Siguiendo' : 'Seguir'}
      </button>
      {error ? <p className="text-[10px] text-fuchsia-300">{error}</p> : null}
    </div>
  );
}

type UserChip = {
  uid?: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export function FollowListModal({
  title,
  users,
  onClose,
}: {
  title: string;
  users: UserChip[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-4 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-white">{title}</h3>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-white">
            Cerrar
          </button>
        </div>
        {users.length === 0 ? (
          <p className="text-sm text-zinc-500">Nadie aquí todavía.</p>
        ) : (
          <ul className="space-y-2">
            {users.map((user) => (
              <li key={user.uid || user.username}>
                <Link
                  to={profileHref(user.username, user.uid)}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-xl border border-white/5 px-3 py-2 hover:border-cyan-400/30"
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-zinc-800 text-sm font-bold text-cyan-300">
                      {user.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-white">@{user.username}</p>
                    <p className="text-xs text-zinc-500">{user.displayName}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export type SocialPost = {
  id: string;
  authorUid?: string;
  authorUsername: string;
  type: 'photo' | 'video' | 'text';
  caption: string | null;
  mediaUrl: string | null;
  visibility?: 'public' | 'friends' | 'private';
  createdAt: string;
  likes: number;
  dislikes: number;
  viewerReaction: 'like' | 'dislike' | null;
};

export function PostCard({
  post,
  canDelete,
  canChangeVisibility,
  onDelete,
  onChangeVisibility,
}: {
  post: SocialPost;
  canDelete?: boolean;
  canChangeVisibility?: boolean;
  onDelete?: () => void;
  onReact?: (post: SocialPost) => void;
  onChangeVisibility?: (visibility: 'public' | 'friends' | 'private') => void;
}) {
  const profile = useAuthStore((state) => state.profile);
  const [busy, setBusy] = useState(false);
  const [reactError, setReactError] = useState<string | null>(null);
  const [likes, setLikes] = useState(post.likes);
  const [dislikes, setDislikes] = useState(post.dislikes);
  const [viewerReaction, setViewerReaction] = useState(post.viewerReaction);

  useEffect(() => {
    return listenPostReactions(post.id, profile?.firebaseUid, (stats) => {
      setLikes(stats.likes);
      setDislikes(stats.dislikes);
      setViewerReaction(stats.viewerReaction);
    });
  }, [post.id, profile?.firebaseUid]);

  async function react(reaction: 'like' | 'dislike') {
    if (!profile) {
      setReactError('Inicia sesión para reaccionar');
      return;
    }
    setBusy(true);
    setReactError(null);
    const next = viewerReaction === reaction ? null : reaction;
    try {
      await setPostReaction(post.id, profile.firebaseUid, next);
    } catch (err) {
      setReactError(err instanceof Error ? err.message : 'No se pudo guardar la reacción');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
      {post.visibility ? (
        <p className="border-b border-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {post.visibility === 'public'
            ? 'Público · registrados'
            : post.visibility === 'friends'
              ? 'Solo amigos'
              : 'Privado'}
        </p>
      ) : null}
      {post.type === 'photo' && post.mediaUrl ? (
        <img src={post.mediaUrl} alt="" className="aspect-square w-full object-cover" />
      ) : null}
      {post.type === 'video' && post.mediaUrl ? (
        <video src={post.mediaUrl} className="aspect-[4/5] w-full object-cover" controls playsInline />
      ) : null}
      {post.type === 'text' ? (
        <div className="min-h-[120px] bg-gradient-to-br from-zinc-900 to-zinc-950 p-4">
          <p className="whitespace-pre-wrap text-sm text-white">{post.caption}</p>
        </div>
      ) : post.caption ? (
        <p className="border-t border-white/5 px-3 py-2 text-sm text-zinc-300">{post.caption}</p>
      ) : null}
      {canChangeVisibility ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
          <div className="flex items-center gap-1">
            {(
              [
                ['public', Globe, 'Público'],
                ['friends', Users, 'Amigos'],
                ['private', Lock, 'Privado'],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                title={`Cambiar a ${label.toLowerCase()}`}
                onClick={() => onChangeVisibility?.(value)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${
                  post.visibility === value
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'text-zinc-500 hover:text-zinc-200'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="text-[11px] text-zinc-500 hover:text-fuchsia-400"
            >
              Eliminar
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void react('like')}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
              viewerReaction === 'like' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-cyan-300'
            }`}
          >
            <ThumbsUp size={14} /> {likes}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void react('dislike')}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
              viewerReaction === 'dislike'
                ? 'bg-fuchsia-500/20 text-fuchsia-300'
                : 'text-zinc-400 hover:text-fuchsia-300'
            }`}
          >
            <ThumbsDown size={14} /> {dislikes}
          </button>
        </div>
        {canDelete && !canChangeVisibility ? (
          <button
            type="button"
            onClick={onDelete}
            className="text-[11px] text-zinc-500 hover:text-fuchsia-400"
          >
            Eliminar
          </button>
        ) : null}
      </div>
      {reactError ? <p className="px-3 pb-1 text-[11px] text-fuchsia-400">{reactError}</p> : null}
      <PostComments postId={post.id} authorUid={post.authorUid} />
    </article>
  );
}

function PostComments({ postId, authorUid }: { postId: string; authorUid?: string }) {
  const profile = useAuthStore((state) => state.profile);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return listenPostComments(postId, setComments);
  }, [postId]);

  async function submit() {
    if (!profile) {
      setError('Inicia sesión para comentar');
      return;
    }
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      await addPostComment(postId, {
        firebaseUid: profile.firebaseUid,
        handle: profile.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      }, body);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar el comentario');
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: string) {
    setError(null);
    try {
      await deletePostComment(postId, commentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el comentario');
    }
  }

  return (
    <div className="border-t border-white/5 px-3 py-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        <MessageCircle size={12} />
        Comentarios
        {comments.length > 0 ? <span className="text-zinc-400">{comments.length}</span> : null}
      </p>
      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {comments.length === 0 ? (
          <li className="text-[11px] text-zinc-600">Sé el primero en comentar.</li>
        ) : (
          comments.map((comment) => {
            const canRemove =
              Boolean(profile) &&
              (profile!.firebaseUid === comment.authorUid ||
                (authorUid && profile!.firebaseUid === authorUid));
            return (
              <li key={comment.id} className="rounded-xl bg-zinc-900/80 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={profileHref(comment.username, comment.authorUid)}
                    className="min-w-0 text-[11px] font-semibold text-cyan-400 hover:underline"
                  >
                    @{comment.username}
                  </Link>
                  {canRemove ? (
                    <button
                      type="button"
                      onClick={() => void remove(comment.id)}
                      className="shrink-0 text-[10px] text-zinc-500 hover:text-fuchsia-400"
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-200">{comment.text}</p>
              </li>
            );
          })
        )}
      </ul>
      {profile ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={500}
            placeholder="Escribe un comentario…"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-zinc-600"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-200 disabled:opacity-50"
          >
            {busy ? '…' : 'Enviar'}
          </button>
        </form>
      ) : (
        <p className="mt-2 text-[11px] text-zinc-600">Inicia sesión para comentar.</p>
      )}
      {error ? <p className="mt-1 text-[11px] text-fuchsia-400">{error}</p> : null}
    </div>
  );
}
