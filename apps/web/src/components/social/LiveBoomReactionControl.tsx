import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { profileHref } from '../../lib/profileFirestore';
import {
  LIVEBOOM_REACTION_ASSETS,
  preloadLiveBoomReactionAssets,
  type LiveBoomReaction,
} from '../../lib/liveBoomReactionAssets';
import {
  listenReactionCounts,
  setReaction,
  type LiveBoomReactionStats,
  type LiveBoomReactionUser,
} from '../../lib/liveBoomReactionService';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';

type Size = 'xs' | 'sm' | 'md';

type Props = {
  currentUserReaction: LiveBoomReaction;
  likeCount: number;
  dislikeCount: number;
  likers?: LiveBoomReactionUser[];
  dislikers?: LiveBoomReactionUser[];
  busy?: boolean;
  onReact: (reaction: 'like' | 'dislike') => void;
  size?: Size;
  layout?: 'row' | 'rail' | 'chat';
};

const SIZE_CLASS: Record<Size, string> = {
  xs: '',
  sm: 'is-sm',
  md: '',
};

preloadLiveBoomReactionAssets();

export function LiveBoomReactionControl({
  currentUserReaction,
  likeCount,
  dislikeCount,
  likers = [],
  dislikers = [],
  busy,
  onReact,
  size = 'md',
  layout = 'row',
}: Props) {
  const [who, setWho] = useState<'like' | 'dislike' | null>(null);
  const [spark, setSpark] = useState<'like' | 'dislike' | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const likes = Math.max(0, likeCount);
  const dislikes = Math.max(0, dislikeCount);

  useEffect(() => {
    if (!who) return;
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setWho(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [who]);

  function tap(kind: 'like' | 'dislike') {
    if (busy) return;
    if (currentUserReaction !== kind) {
      setSpark(kind);
      window.setTimeout(() => setSpark((value) => (value === kind ? null : value)), 420);
    }
    onReact(kind);
  }

  const rail = layout === 'rail';
  const chat = layout === 'chat';

  return (
    <div
      ref={wrapRef}
      className={`relative inline-flex ${rail ? 'flex-col items-center gap-2' : 'items-center'} ${
        chat ? 'gap-0.5' : 'gap-1.5'
      }`}
    >
      <ReactionChip
        kind="like"
        active={currentUserReaction === 'like'}
        count={likes}
        size={size}
        layout={layout}
        spark={spark === 'like'}
        busy={busy}
        onTap={() => tap('like')}
        onWho={() => setWho((value) => (value === 'like' ? null : 'like'))}
      />
      <ReactionChip
        kind="dislike"
        active={currentUserReaction === 'dislike'}
        count={dislikes}
        size={size}
        layout={layout}
        spark={spark === 'dislike'}
        busy={busy}
        onTap={() => tap('dislike')}
        onWho={() => setWho((value) => (value === 'dislike' ? null : 'dislike'))}
      />
      {who ? (
        <ReactionPeople
          key={who}
          title="Reacciones"
          likeUsers={likers}
          dislikeUsers={dislikers}
          focus={who}
          onClose={() => setWho(null)}
        />
      ) : null}
    </div>
  );
}

function ReactionChip({
  kind,
  active,
  count,
  size,
  layout,
  spark,
  busy,
  onTap,
  onWho,
}: {
  kind: 'like' | 'dislike';
  active: boolean;
  count: number;
  size: Size;
  layout: 'row' | 'rail' | 'chat';
  spark: boolean;
  busy?: boolean;
  onTap: () => void;
  onWho: () => void;
}) {
  const t = useT();
  const like = kind === 'like';
  const src = like
    ? active
      ? LIVEBOOM_REACTION_ASSETS.likeOn
      : LIVEBOOM_REACTION_ASSETS.likeOff
    : active
      ? LIVEBOOM_REACTION_ASSETS.dislikeOn
      : LIVEBOOM_REACTION_ASSETS.dislikeOff;
  const rail = layout === 'rail';
  const chat = layout === 'chat';
  const label = like ? t('actions.like') : t('actions.dislike');

  return (
    <span className={`relative inline-flex ${rail ? 'flex-col items-center' : 'items-center gap-0.5'}`}>
      <button
        type="button"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          onTap();
        }}
        aria-label={active ? t('actions.removeLike') : label}
        aria-pressed={active}
        className={`lb-reaction-chip ${SIZE_CLASS[size]} ${like ? 'is-like' : 'is-dislike'} ${
          active ? 'is-active' : ''
        } ${spark ? (like ? 'lb-reaction-chip--like-pop' : 'lb-reaction-chip--dislike-pop') : ''} ${
          chat ? 'lb-reaction-chip--chat' : ''
        } ${rail ? 'lb-reaction-chip--rail' : ''}`}
      >
        <img src={src} alt="" draggable={false} className="lb-reaction-chip__img" />
        {spark ? (
          <>
            <span className="lb-reaction-chip__spark" aria-hidden />
            <span className="lb-reaction-chip__burst" aria-hidden />
          </>
        ) : null}
      </button>
      <button
        type="button"
        disabled={count === 0}
        onClick={(event) => {
          event.stopPropagation();
          onWho();
        }}
        className={`tabular-nums font-bold disabled:cursor-default ${
          rail
            ? 'lb-action-rail__count text-[11px] text-white drop-shadow disabled:opacity-40'
            : chat
              ? `text-[10px] ${active ? (like ? 'text-amber-300' : 'text-rose-300') : 'text-zinc-500'}`
              : `min-h-11 min-w-[1.25rem] px-0.5 text-xs ${
                  active ? (like ? 'text-amber-300' : 'text-rose-300') : count > 0 ? 'text-zinc-300' : 'text-zinc-600'
                }`
        }`}
        aria-label={t('actions.whoReacted', { label })}
      >
        {count}
      </button>
    </span>
  );
}

function ReactionPeople({
  title,
  likeUsers,
  dislikeUsers,
  focus,
  onClose,
}: {
  title: string;
  likeUsers: LiveBoomReactionUser[];
  dislikeUsers: LiveBoomReactionUser[];
  focus: 'like' | 'dislike';
  onClose: () => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<'like' | 'dislike'>(focus);
  const users = tab === 'like' ? likeUsers : dislikeUsers;
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(17rem,78vw)] rounded-xl border border-white/15 bg-zinc-950 p-2 shadow-xl">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{title}</p>
        <button type="button" onClick={onClose} className="text-[10px] text-zinc-500 hover:text-white">
          {t('common.close')}
        </button>
      </div>
      <div className="mb-1.5 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => setTab('like')}
          className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
            tab === 'like' ? 'bg-amber-500/20 text-amber-200' : 'text-zinc-400'
          }`}
        >
          {t('actions.like')} · {likeUsers.length}
        </button>
        <button
          type="button"
          onClick={() => setTab('dislike')}
          className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
            tab === 'dislike' ? 'bg-rose-500/20 text-rose-200' : 'text-zinc-400'
          }`}
        >
          {t('actions.dislike')} · {dislikeUsers.length}
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
                <span className="min-w-0">
                  <span className="block truncate text-xs text-white">{user.displayName}</span>
                  <span className="block truncate text-[10px] text-zinc-500">@{user.username}</span>
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export { ReactionPeople as LiveBoomReactionPeople };

export function MessageReactionBar({
  chatId,
  messageId,
  always,
}: {
  chatId: string;
  messageId: string;
  always?: boolean;
}) {
  const profile = useAuthStore((state) => state.profile);
  const [stats, setStats] = useState<LiveBoomReactionStats>({
    likeCount: 0,
    dislikeCount: 0,
    currentUserReaction: null,
    likers: [],
    dislikers: [],
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return listenReactionCounts('message', messageId, profile?.firebaseUid, setStats, { chatId });
  }, [chatId, messageId, profile?.firebaseUid]);

  const hasCounts = stats.likeCount > 0 || stats.dislikeCount > 0 || Boolean(stats.currentUserReaction);

  async function react(kind: 'like' | 'dislike') {
    if (!profile) return;
    setBusy(true);
    try {
      await setReaction('message', messageId, profile.firebaseUid, kind, {
        chatId,
        current: stats.currentUserReaction,
        profile: {
          username: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`lb-reaction-chat ${always || hasCounts ? 'is-visible' : ''}`}
      onClick={(event) => event.stopPropagation()}
    >
      <LiveBoomReactionControl
        currentUserReaction={stats.currentUserReaction}
        likeCount={stats.likeCount}
        dislikeCount={stats.dislikeCount}
        likers={stats.likers}
        dislikers={stats.dislikers}
        busy={busy}
        onReact={(kind) => void react(kind)}
        size="xs"
        layout="chat"
      />
    </div>
  );
}
