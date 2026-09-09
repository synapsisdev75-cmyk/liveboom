import { MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { countInboxUnread } from '../../lib/chatNotifyContext';
import { listenConversations } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';

/** Badge de mensajes no leídos + toast visual notorio. */
export function MessageInboxBadge({ className = '' }: { className?: string }) {
  const profile = useAuthStore((state) => state.profile);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!profile) {
      setUnread(0);
      return;
    }
    return listenConversations(profile.firebaseUid, (list) => {
      setUnread(countInboxUnread(list));
    });
  }, [profile?.firebaseUid]);

  if (!profile) return null;

  return (
    <Link
      to="/mensajes"
      className={`relative grid h-9 w-9 place-items-center rounded-xl ${
        unread > 0
          ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/40'
          : 'bg-zinc-900 text-zinc-400 hover:text-cyan-300'
      } ${className}`}
      aria-label={unread > 0 ? `${unread} mensajes sin leer` : 'Mensajes'}
    >
      <MessageCircle size={16} />
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-fuchsia-500 px-1 text-[9px] font-black text-white shadow-[0_0_10px_rgba(217,70,239,0.7)]">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  );
}

export function useUnreadMessageCount() {
  const profile = useAuthStore((state) => state.profile);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!profile) {
      setUnread(0);
      return;
    }
    return listenConversations(profile.firebaseUid, (list) => {
      setUnread(countInboxUnread(list));
    });
  }, [profile?.firebaseUid]);
  return unread;
}
