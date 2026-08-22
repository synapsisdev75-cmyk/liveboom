import { UserCheck, UserPlus, UserX } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';

export type FriendshipStatus =
  | 'none'
  | 'friends'
  | 'pending_sent'
  | 'pending_received'
  | 'self';

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
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);

  if (isOwnProfile || status === 'self') return null;

  async function sendRequest() {
    setBusy(true);
    try {
      await api(`/api/social/friends/request/${encodeURIComponent(username)}`, { method: 'POST' });
      setStatus('pending_sent');
      onChange?.('pending_sent');
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest() {
    setBusy(true);
    try {
      await api(`/api/social/friends/request/${encodeURIComponent(username)}`, { method: 'DELETE' });
      setStatus('none');
      onChange?.('none');
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function removeFriend() {
    setBusy(true);
    try {
      await api(`/api/social/friends/${encodeURIComponent(username)}`, { method: 'DELETE' });
      setStatus('none');
      onChange?.('none');
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  const className = compact
    ? 'shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-60'
    : 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold disabled:opacity-60';

  if (status === 'friends') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void removeFriend()}
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
        onClick={() => void cancelRequest()}
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
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/social/friends/accept/${encodeURIComponent(username)}`, { method: 'POST' });
              setStatus('friends');
              onChange?.('friends');
            } finally {
              setBusy(false);
            }
          }}
          className={`${className} bg-emerald-500/20 text-emerald-300`}
        >
          <UserCheck size={compact ? 14 : 16} /> Aceptar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/social/friends/reject/${encodeURIComponent(username)}`, { method: 'POST' });
              setStatus('none');
              onChange?.('none');
            } finally {
              setBusy(false);
            }
          }}
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
      onClick={() => void sendRequest()}
      className={`${className} bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-zinc-950`}
    >
      <UserPlus size={compact ? 14 : 16} className={compact ? '' : 'inline'} />{' '}
      {compact ? 'Amistad' : 'Solicitud de amistad'}
    </button>
  );
}
