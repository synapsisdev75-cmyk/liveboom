import { MessageCircle, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  getFriendshipStatus,
  rejectFriendRequest,
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus, username]);

  useEffect(() => {
    if (!profile || isOwnProfile) return;
    void getFriendshipStatus(profile.firebaseUid, username)
      .then((next) => {
        setStatus(next);
        onChange?.(next);
      })
      .catch(() => undefined);
  }, [profile?.firebaseUid, username, isOwnProfile]);

  if (isOwnProfile || status === 'self' || !profile) return null;

  const className = compact
    ? 'shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-60'
    : 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold disabled:opacity-60';

  async function run(action: () => Promise<void>, next: FriendshipStatus) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setStatus(next);
      onChange?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción');
    } finally {
      setBusy(false);
    }
  }

  const body = (() => {
    if (status === 'friends') {
      return (
        <Link
          to={`/mensajes?con=${encodeURIComponent(username)}`}
          className={`${className} inline-flex items-center gap-1.5 border border-cyan-500/40 bg-cyan-500/15 text-cyan-200`}
        >
          <MessageCircle size={compact ? 14 : 16} className={compact ? '' : 'inline'} />
          Enviar mensaje
        </Link>
      );
    }

    if (status === 'pending_sent') {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => cancelFriendRequest(profile.firebaseUid, username), 'none')}
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
  })();

  return (
    <div className="flex flex-col items-end gap-1">
      {body}
      {error ? <p className="max-w-[12rem] text-right text-[10px] text-fuchsia-300">{error}</p> : null}
    </div>
  );
}
