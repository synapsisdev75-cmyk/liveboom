import {
  Maximize2,
  MessageCircle,
  Search,
  Send,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { countInboxUnread } from '../../lib/chatNotifyContext';
import {
  ensureChat,
  listenConversations,
  listenMessages,
  markMessagesRead,
  sendChatMessage,
  type ChatMessage,
  type Conversation,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import {
  useMessagesMenuStore,
  type MessagesPopupPeer,
} from '../../store/messagesMenuStore';
import { UserAvatar } from '../profile/UserAvatar';

type ListTab = 'todos' | 'unread';

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${Math.max(1, m)} m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

function meFromProfile(profile: {
  firebaseUid: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  return {
    firebaseUid: profile.firebaseUid,
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  };
}

function useDesktopRail() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return desktop;
}

function peerFromChat(chat: Conversation): MessagesPopupPeer {
  return {
    uid: chat.uid,
    username: chat.username,
    displayName: chat.displayName,
    avatarUrl: chat.avatarUrl,
    chatId: chat.chatId,
    lastMessage: chat.lastMessage,
  };
}

/** Chat flotante: ver hilo + expandir a /mensajes pantalla completa. */
function FloatingDmWindow({
  peer,
  onClose,
  onExpand,
}: {
  peer: MessagesPopupPeer;
  onClose: () => void;
  onExpand: () => void;
}) {
  const profile = useAuthStore((state) => state.profile);
  const [chatId, setChatId] = useState<string | null>(peer.chatId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    void (async () => {
      try {
        const id = await ensureChat(meFromProfile(profile), peer);
        if (!cancelled) setChatId(id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo abrir el chat');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.firebaseUid, peer.uid]);

  useEffect(() => {
    if (!chatId || !profile) return;
    return listenMessages(chatId, profile.firebaseUid, (list) => {
      setMessages([...list].reverse());
    });
  }, [chatId, profile?.firebaseUid]);

  useEffect(() => {
    if (!chatId || !profile || messages.length === 0) return;
    void markMessagesRead(chatId, profile.firebaseUid, messages);
  }, [chatId, profile?.firebaseUid, messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, peer.uid]);

  async function send() {
    if (!profile || busy) return;
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await sendChatMessage(meFromProfile(profile), peer, text);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="lb-msg-quick-popup pointer-events-auto fixed z-[80] flex flex-col overflow-hidden rounded-2xl border border-white/12 bg-zinc-950 shadow-2xl">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-2.5 py-2">
        <button
          type="button"
          onClick={onExpand}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-left transition hover:bg-white/5"
          title="Abrir en pantalla completa"
        >
          <UserAvatar
            uid={peer.uid}
            src={peer.avatarUrl}
            username={peer.username}
            displayName={peer.displayName}
            size={36}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">
              {peer.displayName || peer.username}
            </span>
            <span className="block truncate text-[10px] text-zinc-500">@{peer.username}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onExpand}
          className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-cyan-300"
          aria-label="Pantalla completa"
          title="Pantalla completa"
        >
          <Maximize2 size={16} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-white"
          aria-label="Cerrar chat"
        >
          <X size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-zinc-500">Sin mensajes aún. Escribe el primero.</p>
        ) : (
          messages.map((msg) => {
            const mine = msg.fromUid === profile?.firebaseUid;
            return (
              <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-snug ${
                    mine
                      ? 'rounded-br-md bg-violet-600/90 text-white'
                      : 'rounded-bl-md bg-zinc-800 text-zinc-100'
                  }`}
                >
                  {msg.giftId ? <p className="font-semibold">🎁 Regalo</p> : null}
                  {msg.mediaUrl ? (
                    <p className="opacity-90">{msg.mediaType === 'image' ? '📷 Foto' : '📎 Adjunto'}</p>
                  ) : null}
                  {msg.text ? <p className="whitespace-pre-wrap break-words">{msg.text}</p> : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {error ? <p className="shrink-0 px-3 pb-1 text-[11px] text-rose-300">{error}</p> : null}

      <form
        className="flex shrink-0 items-center gap-1.5 border-t border-white/10 px-2.5 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
          placeholder="Escribe un mensaje..."
          className="min-h-10 min-w-0 flex-1 rounded-full border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-400/40"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="grid h-10 w-10 place-items-center rounded-full bg-cyan-500/20 text-cyan-300 transition hover:bg-cyan-500/30 disabled:opacity-40"
          aria-label="Enviar"
        >
          <Send size={16} />
        </button>
      </form>
    </div>,
    document.body,
  );
}

type ChatListProps = {
  embedded?: boolean;
  onSelect: (chat: Conversation) => void;
  onExpandAll: () => void;
  onClose: () => void;
};

/** Lista de chats reutilizable: rail derecho o sheet móvil. */
export function MessagesChatListPanel({ embedded, onSelect, onExpandAll, onClose }: ChatListProps) {
  const profile = useAuthStore((state) => state.profile);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<ListTab>('todos');
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    if (!profile) {
      setConversations([]);
      return;
    }
    return listenConversations(profile.firebaseUid, setConversations);
  }, [profile?.firebaseUid]);

  const list = useMemo(() => {
    let rows = conversations.filter((c) => !c.deletedAtMs && c.uid);
    if (tab === 'unread') rows = rows.filter((c) => c.unread > 0);
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q) ||
          (c.lastMessage || '').toLowerCase().includes(q),
      );
    }
    return rows.slice(0, 40);
  }, [conversations, tab, query]);

  if (!profile) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-zinc-500">
        Inicia sesión para ver tus mensajes.
      </div>
    );
  }

  return (
    <div
      className={`lb-msg-chat-list flex min-h-0 flex-col overflow-hidden ${
        embedded ? 'h-full' : 'max-h-[min(85dvh,36rem)]'
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <p className="text-sm font-bold text-white">Chats</p>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onExpandAll}
            className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-cyan-300"
            aria-label="Abrir mensajes en pantalla completa"
            title="Pantalla completa"
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-white"
            aria-label="Cerrar chats"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <label className="mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-full bg-zinc-900 px-3 py-2 ring-1 ring-white/10">
        <Search size={14} className="shrink-0 text-zinc-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar en mensajes"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
        />
      </label>

      <div className="mt-2 flex shrink-0 gap-1.5 px-3">
        {(
          [
            { id: 'todos' as const, label: 'Todos' },
            { id: 'unread' as const, label: 'No leídos' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-h-9 rounded-full px-3 text-xs font-semibold transition ${
              tab === item.id
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-1.5 pb-1">
        {list.length === 0 ? (
          <li className="px-3 py-8 text-center text-xs text-zinc-500">
            {tab === 'unread' ? 'No hay mensajes sin leer.' : 'Aún no tienes conversaciones.'}
          </li>
        ) : (
          list.map((chat) => (
            <li key={chat.chatId}>
              <button
                type="button"
                onClick={() => onSelect(chat)}
                className="flex w-full min-h-11 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/5"
              >
                <UserAvatar
                  uid={chat.uid}
                  src={chat.avatarUrl}
                  username={chat.username}
                  displayName={chat.displayName}
                  size={44}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm ${
                        chat.unread > 0 ? 'font-bold text-white' : 'font-semibold text-zinc-100'
                      }`}
                    >
                      {chat.displayName || chat.username}
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-500">{timeAgo(chat.lastAt)}</span>
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-xs ${
                      chat.unread > 0 ? 'font-medium text-zinc-200' : 'text-zinc-500'
                    }`}
                  >
                    {chat.lastMessage || 'Conversación'}
                  </span>
                </span>
                {chat.unread > 0 ? (
                  <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-cyan-500 px-1 text-[10px] font-black text-white">
                    {chat.unread > 9 ? '9+' : chat.unread}
                  </span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>

      <button
        type="button"
        onClick={onExpandAll}
        className="shrink-0 border-t border-white/10 px-3 py-3 text-center text-sm font-semibold text-cyan-300 hover:bg-white/5"
      >
        Ver todos los mensajes
      </button>
    </div>
  );
}

/** Rail derecho temporal: sustituye Publicidad / Tendencias mientras el menú está abierto. */
export function MessagesSideRail() {
  const navigate = useNavigate();
  const setRailOpen = useMessagesMenuStore((state) => state.setRailOpen);
  const openChatFromList = useMessagesMenuStore((state) => state.openChatFromList);

  function close() {
    setRailOpen(false);
  }

  function expandAll() {
    setRailOpen(false);
    navigate('/mensajes');
  }

  return (
    <aside className="lb-side-rail lb-msg-side-rail chat-scroll hidden h-[100dvh] w-[min(28%,20rem)] min-w-[240px] max-w-[20rem] shrink-0 flex-col overflow-hidden border-l border-white/5 bg-zinc-950/95 backdrop-blur-xl lg:flex lg:min-w-[250px] lg:max-w-[19rem]">
      <MessagesChatListPanel
        embedded
        onClose={close}
        onExpandAll={expandAll}
        onSelect={(chat) => openChatFromList(peerFromChat(chat))}
      />
    </aside>
  );
}

/**
 * Botón de mensajes en header:
 * - Desktop: reemplaza el rail derecho con la lista de chats hasta cerrar.
 * - Móvil: sheet inferior (sin rail).
 */
export function MessagesQuickMenu() {
  const profile = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const location = useLocation();
  const desktop = useDesktopRail();
  const railOpen = useMessagesMenuStore((state) => state.railOpen);
  const popupPeer = useMessagesMenuStore((state) => state.popupPeer);
  const setRailOpen = useMessagesMenuStore((state) => state.setRailOpen);
  const toggleRail = useMessagesMenuStore((state) => state.toggleRail);
  const setPopupPeer = useMessagesMenuStore((state) => state.setPopupPeer);
  const openChatFromList = useMessagesMenuStore((state) => state.openChatFromList);
  const closeAll = useMessagesMenuStore((state) => state.closeAll);
  const [sheetOpen, setSheetOpen] = useState(false);
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

  useEffect(() => {
    closeAll();
    setSheetOpen(false);
  }, [location.pathname, closeAll]);

  useEffect(() => {
    if (!railOpen && !sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRailOpen(false);
        setSheetOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [railOpen, sheetOpen, setRailOpen]);

  if (!profile) return null;

  const menuOpen = desktop ? railOpen : sheetOpen;

  function openFullscreen(peer?: MessagesPopupPeer | null) {
    closeAll();
    setSheetOpen(false);
    if (peer?.username) {
      navigate(`/mensajes?con=${encodeURIComponent(peer.username)}`);
      return;
    }
    navigate('/mensajes');
  }

  function onButtonClick() {
    if (desktop) {
      setSheetOpen(false);
      toggleRail();
      return;
    }
    setRailOpen(false);
    setSheetOpen((v) => !v);
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onButtonClick}
        className={`relative grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 ${
          unread > 0 || menuOpen
            ? 'text-cyan-300 ring-1 ring-cyan-500/35'
            : 'text-zinc-400 hover:text-cyan-300'
        }`}
        aria-label={unread > 0 ? `${unread} mensajes sin leer` : 'Mensajes'}
        aria-expanded={menuOpen}
      >
        <MessageCircle size={16} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-fuchsia-500 px-1 text-[9px] font-black text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {!desktop && sheetOpen
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[65] bg-black/45"
                aria-label="Cerrar mensajes"
                onClick={() => setSheetOpen(false)}
              />
              <div
                className="lb-msg-quick-menu fixed z-[70] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
                style={{
                  left: 'max(0.5rem, var(--lb-safe-left))',
                  right: 'max(0.5rem, var(--lb-safe-right))',
                  bottom: 'calc(var(--lb-bottom-nav-h) + max(0.5rem, var(--lb-safe-bottom)))',
                  top: 'auto',
                  maxHeight: 'min(70dvh, 32rem)',
                }}
              >
                <MessagesChatListPanel
                  onClose={() => setSheetOpen(false)}
                  onExpandAll={() => openFullscreen(null)}
                  onSelect={(chat) => {
                    setSheetOpen(false);
                    openChatFromList(peerFromChat(chat));
                  }}
                />
              </div>
            </>,
            document.body,
          )
        : null}

      {popupPeer ? (
        <FloatingDmWindow
          peer={popupPeer}
          onClose={() => setPopupPeer(null)}
          onExpand={() => openFullscreen(popupPeer)}
        />
      ) : null}
    </div>
  );
}
