import { Link } from 'react-router-dom';
import { profileHref } from '../../lib/profileFirestore';
import type { PostReactionUser } from '../../lib/socialFirestore';
import { LiveBoomReactionControl } from './LiveBoomReactionControl';

type Props = {
  likes: number;
  dislikes: number;
  viewerReaction: 'like' | 'dislike' | null;
  likers: PostReactionUser[];
  dislikers: PostReactionUser[];
  busy?: boolean;
  onReact: (reaction: 'like' | 'dislike') => void;
  compact?: boolean;
};

export function PostReactionButtons({
  likes,
  dislikes,
  viewerReaction,
  likers,
  dislikers,
  busy,
  onReact,
  compact,
}: Props) {
  return (
    <LiveBoomReactionControl
      currentUserReaction={viewerReaction}
      likeCount={likes}
      dislikeCount={dislikes}
      likers={likers}
      dislikers={dislikers}
      busy={busy}
      onReact={onReact}
      size={compact ? 'sm' : 'md'}
    />
  );
}

export function ReactionList({
  title,
  users,
  onClose,
}: {
  title: string;
  users: PostReactionUser[];
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(16rem,70vw)] rounded-xl border border-white/15 bg-zinc-950 p-2 shadow-xl">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{title}</p>
        <button type="button" onClick={onClose} className="text-[10px] text-zinc-500 hover:text-white">
          Cerrar
        </button>
      </div>
      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {users.length === 0 ? (
          <li className="text-[11px] text-zinc-500">Nadie todavía.</li>
        ) : (
          users.map((user) => (
            <li key={user.uid}>
              <Link
                to={profileHref(user.username, user.uid)}
                onClick={onClose}
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/5"
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-200">
                    {(user.displayName || user.username).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 truncate text-xs text-white">
                  {user.displayName !== user.username ? user.displayName : `@${user.username}`}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
