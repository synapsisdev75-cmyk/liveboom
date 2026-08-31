import { MessageCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { listenConversations } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';

/** Badge de mensajes no leídos + toast visual notorio. */
export function MessageInboxBadge({ className = '' }: { className?: string }) {
  const profile = useAuthStore((state) => state.profile);
  const location = useLocation();
  const setToast = useUiStore((state) => state.setToast);
  const [unread, setUnread] = useState(0);
  const knownTotal = useRef(-1);
  const onMessages = location.pathname.startsWith('/mensajes');

  useEffect(() => {
    if (!profile) {
      setUnread(0);
      return;
    }
    return listenConversations(profile.firebaseUid, (list) => {
      const total = list.reduce((sum, chat) => sum + (chat.unread || 0), 0);
      if (knownTotal.current >= 0 && total > knownTotal.current && !onMessages) {
        const fresh = list.find((chat) => (chat.unread || 0) > 0);
        setToast(
          fresh
            ? `💬 Nuevo mensaje de @${fresh.username}: ${fresh.lastMessage || '…'}`
            : '💬 Tienes mensajes nuevos',
          'info',
        );
        window.setTimeout(() => setToast(null), 4200);
      }
      knownTotal.current = total;
      setUnread(total);
    });
  }, [profile?.firebaseUid, onMessages, setToast]);

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
      setUnread(list.reduce((sum, chat) => sum + (chat.unread || 0), 0));
    });
  }, [profile?.firebaseUid]);
  return unread;
}
