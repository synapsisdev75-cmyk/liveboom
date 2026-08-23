import { UserCheck, UserPlus, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  getFriendshipStatus,
  rejectFriendRequest,
  removeFriendship,
  sendFriendRequest,
  type FriendshipStatus,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';

export type { FriendshipStatus };

type Props = {
  username: string;
  initialStatus: FriendshipStatus;
  isOwnProfile?: boolean;
  compact?: boolean;
  onChange?: (status: FriendshipStatus) => void;
};

export function FriendRequestButton({
  username,
  initialStatus,
  isOwnProfile,
  compact,
  onChange,
}: Props) {
  const profile = useAuthStore((state) => state.profile);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus, username]);

  useEffect(() => {
    if (!profile || isOwnProfile) return;
    void getFriendshipStatus(profile.firebaseUid, username).then((next) => {
      setStatus(next);
      onChange?.(next);
    });
  }, [profile?.firebaseUid, username, isOwnProfile]);

  if (isOwnProfile || status === 'self' || !profile) return null;

  const className = compact
    ? 'shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-60'
    : 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold disabled:opacity-60';

  async function run(action: () => Promise<void>, next: FriendshipStatus) {
    setBusy(true);
    try {
      await action();
      setStatus(next);
      onChange?.(next);
    } finally {
      setBusy(false);
    }
  }

  if (status === 'friends') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void run(() => removeFriendship(profile.firebaseUid, username), 'none')
        }
        className={`${className} border border-emerald-500/40 bg-emerald-500/10 text-emerald-300`}
      >
        <UserCheck size={compact ? 14 : 16} className={compact ? '' : 'inline'} />{' '}
        {compact ? 'Amigos' : 'Amigos · Quitar'}
      </button>
    );
  }

  if (status === 'pending_sent') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void run(() => cancelFriendRequest(profile.firebaseUid, username), 'none')
        }
        className={`${className} border border-zinc-600 bg-zinc-800 text-zinc-300`}
      >
        {compact ? 'Pendiente' : 'Solicitud enviada'}
      </button>
    );
  }

  if (status === 'pending_received') {
    return (
      <div className={`flex gap-2 ${compact ? 'flex-col' : ''}`}>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() => acceptFriendRequest(profile.firebaseUid, username), 'friends')
          }
          className={`${className} bg-emerald-500/20 text-emerald-300`}
        >
          <UserCheck size={compact ? 14 : 16} /> Aceptar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() => rejectFriendRequest(profile.firebaseUid, username), 'none')
          }
          className={`${className} border border-zinc-600 text-zinc-400`}
        >
          <UserX size={compact ? 14 : 16} /> Rechazar
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        void run(
          () =>
            sendFriendRequest(
              {
                firebaseUid: profile.firebaseUid,
                handle: profile.handle,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
              },
              username,
            ),
          'pending_sent',
        )
      }
      className={`${className} bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-zinc-950`}
    >
      <UserPlus size={compact ? 14 : 16} className={compact ? '' : 'inline'} />{' '}
      {compact ? 'Amistad' : 'Solicitud de amistad'}
    </button>
  );
}
