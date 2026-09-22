import { UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FollowButton } from '../social/SocialPostCard';
import { useT } from '../../i18n';
import {
  browseSuggestedCreators,
} from '../../lib/socialFirestore';
import {
  ignoreSuggestedCreator,
  readIgnoredSuggestionUids,
} from '../../lib/ignoredSuggestions';
import { useAuthStore } from '../../store/authStore';

type SuggestedUser = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

type Props = {
  onNavigate?: () => void;
  className?: string;
  limit?: number;
};

function useSuggestedCreators(limit: number) {
  const profile = useAuthStore((state) => state.profile);
  const [suggested, setSuggested] = useState<SuggestedUser[]>([]);

  const pullReplacement = useCallback(
    (excludeUids: string[]) => {
      void browseSuggestedCreators(profile?.firebaseUid, profile?.handle, {
        limit: 1,
        excludeUids,
      }).then((replacements) => {
        const replacement = replacements[0];
        if (!replacement) return;
        setSuggested((list) => {
          if (list.some((user) => user.uid === replacement.uid)) return list;
          return [...list, replacement].slice(0, limit);
        });
      });
    },
    [profile?.firebaseUid, profile?.handle, limit],
  );

  useEffect(() => {
    let cancelled = false;
    void browseSuggestedCreators(profile?.firebaseUid, profile?.handle, {
      limit,
      excludeUids: readIgnoredSuggestionUids(profile?.firebaseUid),
    })
      .then((users) => {
        if (!cancelled) setSuggested(users);
      })
      .catch(() => {
        if (!cancelled) setSuggested([]);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.handle, profile?.firebaseUid, limit]);

  const onSuggestedFollow = useCallback(
    (followedUid: string, following: boolean) => {
      if (!following) return;
      setSuggested((current) => {
        const next = current.filter((user) => user.uid !== followedUid);
        pullReplacement([...next.map((user) => user.uid), followedUid]);
        return next;
      });
    },
    [pullReplacement],
  );

  const onSuggestedIgnore = useCallback(
    (ignoredUid: string) => {
      if (!profile?.firebaseUid) return;
      ignoreSuggestedCreator(profile.firebaseUid, ignoredUid);
      setSuggested((current) => {
        const next = current.filter((user) => user.uid !== ignoredUid);
        pullReplacement([...next.map((user) => user.uid), ignoredUid]);
        return next;
      });
    },
    [profile?.firebaseUid, pullReplacement],
  );

  return { suggested, onSuggestedFollow, onSuggestedIgnore, profile };
}

/** Creadores sugeridos (antes en el rail derecho de Inicio). */
export function SidebarSuggestedCreatorsCard({
  onNavigate,
  className = '',
  limit = 5,
}: Props) {
  const t = useT();
  const { suggested, onSuggestedFollow, onSuggestedIgnore, profile } =
    useSuggestedCreators(limit);

  return (
    <section className={`lb-panel rounded-2xl p-3${className ? ` ${className}` : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          <UserPlus size={12} className="shrink-0 text-cyan-300" /> Creadores sugeridos
        </p>
        <Link
          to="/buscar"
          onClick={onNavigate}
          className="shrink-0 text-[10px] font-semibold text-cyan-400 hover:underline"
        >
          Ver más
        </Link>
      </div>
      {suggested.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500">
          <Link to="/buscar" onClick={onNavigate} className="text-cyan-400 underline">
            Busca amigos
          </Link>{' '}
          para descubrir creadores.
        </p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {suggested.map((user) => (
            <li key={user.uid || user.username} className="flex items-center gap-2">
              <Link
                to={`/u/${encodeURIComponent(user.username)}`}
                onClick={onNavigate}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                  />
                ) : (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-bold text-cyan-200">
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-white">
                    {user.displayName || user.username}
                  </span>
                  <span className="block truncate text-[10px] text-zinc-500">@{user.username}</span>
                </span>
              </Link>
              {profile ? (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <FollowButton
                    username={user.username}
                    targetUid={user.uid}
                    targetHint={user}
                    initialFollowing={false}
                    isOwnProfile={false}
                    variant="default"
                    size="sm"
                    onChange={(following) => onSuggestedFollow(user.uid, following)}
                  />
                  <button
                    type="button"
                    onClick={() => onSuggestedIgnore(user.uid)}
                    className="min-h-8 rounded-full border border-rose-500/70 bg-rose-600/25 px-2.5 text-[10px] font-bold text-rose-300 transition hover:bg-rose-600/40 hover:text-white"
                  >
                    {t('common.ignore')}
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  onClick={onNavigate}
                  className="shrink-0 rounded-full bg-fuchsia-500/20 px-2.5 py-1 text-[10px] font-bold text-fuchsia-200"
                >
                  {t('actions.follow')}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
