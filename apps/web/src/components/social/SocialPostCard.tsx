import { ThumbsDown, ThumbsUp, UserMinus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

type Props = {
  username: string;
  initialFollowing: boolean;
  isOwnProfile: boolean;
  onChange?: (following: boolean) => void;
};

export function FollowButton({ username, initialFollowing, isOwnProfile, onChange }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  if (isOwnProfile) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (following) {
        await api(`/api/social/follow/${encodeURIComponent(username)}`, { method: 'DELETE' });
        setFollowing(false);
        onChange?.(false);
      } else {
        await api(`/api/social/follow/${encodeURIComponent(username)}`, { method: 'POST' });
        setFollowing(true);
        onChange?.(true);
      }
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  return (
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
  );
}

type UserChip = {
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
              <li key={user.username}>
                <Link
                  to={`/u/${encodeURIComponent(user.username)}`}
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
  authorUsername: string;
  type: 'photo' | 'video' | 'text';
  caption: string | null;
  mediaUrl: string | null;
  createdAt: string;
  likes: number;
  dislikes: number;
  viewerReaction: 'like' | 'dislike' | null;
};

export function PostCard({
  post,
  canDelete,
  onDelete,
  onReact,
}: {
  post: SocialPost;
  canDelete?: boolean;
  onDelete?: () => void;
  onReact?: (post: SocialPost) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function react(reaction: 'like' | 'dislike' | 'none') {
    setBusy(true);
    try {
      const next =
        reaction === 'none'
          ? 'none'
          : post.viewerReaction === reaction
            ? 'none'
            : reaction;
      const result = await api<{ post: SocialPost }>(`/api/social/posts/${post.id}/react`, {
        method: 'POST',
        body: JSON.stringify({ reaction: next }),
      });
      onReact?.(result.post);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
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
      <div className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void react('like')}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
              post.viewerReaction === 'like' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-cyan-300'
            }`}
          >
            <ThumbsUp size={14} /> {post.likes}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void react('dislike')}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
              post.viewerReaction === 'dislike'
                ? 'bg-fuchsia-500/20 text-fuchsia-300'
                : 'text-zinc-400 hover:text-fuchsia-300'
            }`}
          >
            <ThumbsDown size={14} /> {post.dislikes}
          </button>
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
    </article>
  );
}
