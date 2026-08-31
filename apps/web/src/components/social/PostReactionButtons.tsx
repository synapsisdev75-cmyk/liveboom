import { ThumbsDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { profileHref } from '../../lib/profileFirestore';
import type { PostReactionUser } from '../../lib/socialFirestore';
import { BoomLikeButton } from './BoomButtons';

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
  const [showLikers, setShowLikers] = useState(false);
  const [showDislikers, setShowDislikers] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLikers && !showDislikers) return;
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setShowLikers(false);
        setShowDislikers(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showLikers, showDislikers]);

  const btn = compact ? 'h-9 px-2 text-[11px]' : 'px-2 py-1 text-xs';
  const iconSize = compact ? 16 : 14;

  return (
    <div ref={wrapRef} className="relative flex flex-wrap items-center gap-2">
      <div className="relative inline-flex items-center">
        <BoomLikeButton
          active={viewerReaction === 'like'}
          busy={busy}
          count={likes}
          size={compact ? 'sm' : 'md'}
          onToggle={() => onReact('like')}
          onShowWho={() => {
            setShowDislikers(false);
            setShowLikers((v) => !v);
          }}
        />
        {showLikers ? (
          <ReactionList title="Les gustó (Boom)" users={likers} onClose={() => setShowLikers(false)} />
        ) : null}
      </div>

      <div className="relative inline-flex items-center rounded-lg ring-1 ring-white/5">
        <button
          type="button"
          disabled={busy}
          onClick={() => onReact('dislike')}
          className={`inline-flex items-center gap-1 rounded-l-lg ${btn} font-semibold ${
            viewerReaction === 'dislike'
              ? 'bg-fuchsia-500/20 text-fuchsia-300'
              : 'text-zinc-400 hover:text-fuchsia-300'
          }`}
          aria-label="No me gusta"
        >
          <ThumbsDown size={iconSize} />
        </button>
        <button
          type="button"
          disabled={busy || dislikes === 0}
          onClick={() => {
            setShowLikers(false);
            setShowDislikers((v) => !v);
          }}
          className={`rounded-r-lg border-l border-white/10 ${btn} font-semibold tabular-nums ${
            dislikes > 0 ? 'text-fuchsia-300 hover:bg-white/5' : 'text-zinc-600'
          }`}
          aria-label="Ver quién dio dislike"
        >
          {dislikes}
        </button>
        {showDislikers ? (
          <ReactionList title="No les gustó" users={dislikers} onClose={() => setShowDislikers(false)} />
        ) : null}
      </div>
    </div>
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
