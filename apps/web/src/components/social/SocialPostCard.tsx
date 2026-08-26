import { Globe, Lock, ThumbsDown, ThumbsUp, UserMinus, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  followUser,
  isFollowing,
  listenPostReactions,
  setPostReaction,
  unfollowUser,
} from '../../lib/socialFirestore';
import { profileHref } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';
import { PostComments, PostVideoPlayer } from './PostVideoPlayer';

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
  startVideoExpanded,
  onCloseVideoExpand,
}: {
  post: SocialPost;
  canDelete?: boolean;
  canChangeVisibility?: boolean;
  onDelete?: () => void;
  onReact?: (post: SocialPost) => void;
  onChangeVisibility?: (visibility: 'public' | 'friends' | 'private') => void;
  /** Abrir el video en pantalla completa (p. ej. tras publicar). */
  startVideoExpanded?: boolean;
  onCloseVideoExpand?: () => void;
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
        <PostVideoPlayer
          src={post.mediaUrl}
          postId={post.id}
          authorUid={post.authorUid}
          caption={post.caption}
          likes={likes}
          dislikes={dislikes}
          viewerReaction={viewerReaction}
          busy={busy}
          onReact={(reaction) => void react(reaction)}
          visibility={post.visibility}
          canChangeVisibility={canChangeVisibility}
          onChangeVisibility={onChangeVisibility}
          canDelete={canDelete}
          onDelete={onDelete}
          startExpanded={startVideoExpanded}
          onCloseExpand={onCloseVideoExpand}
        />
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
              onClick={() => {
                if (window.confirm('¿Estás seguro de borrar esta publicación?')) onDelete?.();
              }}
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
            onClick={() => {
              if (window.confirm('¿Estás seguro de borrar esta publicación?')) onDelete?.();
            }}
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
