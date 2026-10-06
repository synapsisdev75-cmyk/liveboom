import { UserMinus, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { followUser, isFollowing, type FriendChip, unfollowUser } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';

type Props = {
  username: string;
  targetUid?: string | null;
  targetHint?: Partial<Pick<FriendChip, 'uid' | 'username' | 'displayName' | 'avatarUrl'>> | null;
  initialFollowing: boolean;
  isOwnProfile: boolean;
  onChange?: (following: boolean) => void;
  /** outline = borde cyan (rail mensajes); default = gradiente */
  variant?: 'default' | 'outline';
  size?: 'md' | 'sm';
};

export function FollowButton({
  username,
  targetUid,
  targetHint,
  initialFollowing,
  isOwnProfile,
  onChange,
  variant = 'default',
  size = 'md',
}: Props) {
  const t = useT();
  const profile = useAuthStore((state) => state.profile);
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedUid = targetUid || targetHint?.uid || null;
  const hint = targetHint || (resolvedUid ? { uid: resolvedUid, username } : null);

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing, username]);

  useEffect(() => {
    if (!profile || isOwnProfile) return;
    void isFollowing(profile.firebaseUid, username, resolvedUid).then((value) => {
      setFollowing(value);
    });
  }, [profile?.firebaseUid, username, resolvedUid, isOwnProfile]);

  if (isOwnProfile || !profile) return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (following) {
        await unfollowUser(profile!.firebaseUid, username, resolvedUid, hint);
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
          resolvedUid,
          hint,
        );
        setFollowing(true);
        onChange?.(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  const sm = size === 'sm';
  const outline = variant === 'outline';

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
        className={`inline-flex shrink-0 items-center justify-center font-bold transition disabled:opacity-60 ${
          sm ? 'gap-1 rounded-full px-2.5 py-1 text-[10px]' : 'gap-2 rounded-full px-4 py-2 text-sm'
        } ${
          outline
            ? following
              ? 'border border-zinc-600 text-zinc-400 hover:border-zinc-500'
              : 'border border-cyan-400/70 text-cyan-300 hover:bg-cyan-400/10'
            : following
              ? 'border border-zinc-600 bg-zinc-800 text-zinc-200 hover:border-fuchsia-400'
              : 'bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-zinc-950'
        }`}
      >
        {outline ? null : following ? <UserMinus size={16} /> : <UserPlus size={16} />}
        {following ? t('actions.following') : t('actions.follow')}
      </button>
      {error ? <p className="text-[10px] text-fuchsia-300">{error}</p> : null}
    </div>
  );
}
