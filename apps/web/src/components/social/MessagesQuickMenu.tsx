import {
  Maximize2,
  MessageCircle,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { countInboxUnread } from '../../lib/chatNotifyContext';
import {
  listenConversations,
  type Conversation,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useMessageBoxesVisible, useMessagesInboxVisible } from '../../hooks/useMessagesInboxVisible';
import {
  useMessagesMenuStore,
  type MessagesPopupPeer,
} from '../../store/messagesMenuStore';
import { UserAvatar } from '../profile/UserAvatar';
import { InternalChatPanel } from './InternalChatPanel';

type ListTab = 'todos' | 'unread';

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
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

/** Pastillas minimizadas: solo foto + nombre; clic para reabrir. */
function MinimizedChatsDock({
  items,
  onExpand,
}: {
  items: MessagesPopupPeer[];
  onExpand: (uid: string) => void;
}) {
  if (items.length === 0) return null;
  return createPortal(
    <div className="lb-msg-min-dock pointer-events-none fixed z-[79] flex flex-row flex-wrap items-end justify-end gap-2">
      {items.map((peer) => (
        <button
          key={peer.uid}
          type="button"
          onClick={() => onExpand(peer.uid)}
          className="lb-msg-min-chip pointer-events-auto flex min-h-11 max-w-[min(100%,12rem)] items-center gap-2 rounded-full border border-white/15 bg-zinc-950/95 py-1.5 pl-1.5 pr-3 shadow-lg backdrop-blur-md transition hover:border-cyan-400/40"
          title={`Abrir chat con ${peer.displayName || peer.username}`}
        >
          <UserAvatar
            uid={peer.uid}
            src={peer.avatarUrl}
            username={peer.username}
            displayName={peer.displayName}
            size={32}
          />
          <span className="min-w-0 truncate text-xs font-semibold text-white">
            {peer.displayName || peer.username}
          </span>
        </button>
      ))}
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
  const inboxVisible = useMessagesInboxVisible();
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
          c.username.toLowerCase().includes(q) ||
          (c.displayName || '').toLowerCase().includes(q) ||
          (c.lastMessage || '').toLowerCase().includes(q),
      );
    }
    return rows;
  }, [conversations, query, tab]);

  if (!profile) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-zinc-500">
        Inicia sesión para ver tus mensajes.
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${embedded ? '' : ''}`}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <p className="text-sm font-bold text-white">Chats</p>
        <div className="flex items-center gap-0.5">
          {inboxVisible ? (
            <button
              type="button"
              onClick={onExpandAll}
              className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-cyan-300"
              aria-label="Abrir mensajes en pantalla completa"
              title="Pantalla completa"
            >
              <Maximize2 size={16} />
            </button>
          ) : null}
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

      {inboxVisible ? (
        <button
          type="button"
          onClick={onExpandAll}
          className="shrink-0 border-t border-white/10 px-3 py-3 text-center text-sm font-semibold text-cyan-300 hover:bg-white/5"
        >
          Ver todos los mensajes
        </button>
      ) : null}
    </div>
  );
}

/** Rail derecho temporal: sustituye Publicidad / Tendencias mientras el menú está abierto. */
export function MessagesSideRail() {
  const navigate = useNavigate();
  const inboxVisible = useMessagesInboxVisible();
  const setRailOpen = useMessagesMenuStore((state) => state.setRailOpen);
  const openChatFromList = useMessagesMenuStore((state) => state.openChatFromList);

  function close() {
    setRailOpen(false);
  }

  function expandAll() {
    if (!inboxVisible) return;
    setRailOpen(false);
    navigate('/mensajes');
  }

  return (
    <aside className="lb-side-rail lb-msg-side-rail chat-scroll hidden h-[var(--lb-vv-height,100dvh)] max-h-[var(--lb-vv-height,100dvh)] w-[min(28%,20rem)] min-w-[240px] max-w-[20rem] shrink-0 flex-col overflow-hidden border-l border-white/5 bg-zinc-950/95 backdrop-blur-xl lg:flex lg:min-w-[250px] lg:max-w-[19rem]">
      <MessagesChatListPanel
        embedded
        onClose={close}
        onExpandAll={expandAll}
        onSelect={(chat) => {
          openChatFromList(peerFromChat(chat));
        }}
      />
    </aside>
  );
}

/**
 * Host único (siempre montado en el shell): ventanas celular + pastillas minimizadas.
 */
export function MessagesFloatingHost() {
  const profile = useAuthStore((state) => state.profile);
  const location = useLocation();
  const boxesVisible = useMessageBoxesVisible();
  const openWindows = useMessagesMenuStore((state) => state.openWindows);
  const minimized = useMessagesMenuStore((state) => state.minimized);
  const setRailOpen = useMessagesMenuStore((state) => state.setRailOpen);
  const expandMinimized = useMessagesMenuStore((state) => state.expandMinimized);
  const closeWindow = useMessagesMenuStore((state) => state.closeWindow);
  const minimizeWindow = useMessagesMenuStore((state) => state.minimizeWindow);
  const closeAll = useMessagesMenuStore((state) => state.closeAll);

  useEffect(() => {
    setRailOpen(false);
    closeAll();
  }, [location.pathname, setRailOpen, closeAll]);

  useEffect(() => {
    if (!boxesVisible) closeAll();
  }, [boxesVisible, closeAll]);

  if (!profile || !boxesVisible) return null;

  return (
    <>
      {openWindows.map((peer, index) => (
        <PhoneChatWindow
          key={peer.uid}
          peer={peer}
          index={openWindows.length - 1 - index}
          onClose={() => closeWindow(peer.uid)}
          onMinimize={() => minimizeWindow(peer.uid)}
        />
      ))}
      <MinimizedChatsDock items={minimized} onExpand={expandMinimized} />
    </>
  );
}

/** Ventana flotante tamaño celular real con el chat completo (InternalChatPanel). */
function PhoneChatWindow({
  peer,
  index,
  onClose,
  onMinimize,
}: {
  peer: MessagesPopupPeer;
  /** 0 = más a la derecha */
  index: number;
  onClose: () => void;
  onMinimize: () => void;
}) {
  return createPortal(
    <div
      className="lb-phone-chat-window"
      style={{
        right: `calc(max(0.75rem, env(safe-area-inset-right, 0px)) + ${index} * (min(24.375rem, calc(100vw - 1.25rem)) + 0.75rem))`,
        bottom: 0,
        zIndex: 80 + index,
      }}
    >
      <InternalChatPanel
        floatingPeer={peer}
        onFloatingClose={onClose}
        onFloatingMinimize={onMinimize}
      />
    </div>,
    document.body,
  );
}

/**
 * Botón de mensajes en header:
 * - Desktop: reemplaza el rail derecho con la lista de chats hasta cerrar.
 * - Móvil: sheet inferior (sin rail).
 * Los portales flotantes van en MessagesFloatingHost (una sola instancia).
 */
export function MessagesQuickMenu() {
  const profile = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const location = useLocation();
  const desktop = useDesktopRail();
  const inboxVisible = useMessagesInboxVisible();
  const boxesVisible = useMessageBoxesVisible();
  const railOpen = useMessagesMenuStore((state) => state.railOpen);
  const setRailOpen = useMessagesMenuStore((state) => state.setRailOpen);
  const toggleRail = useMessagesMenuStore((state) => state.toggleRail);
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
    setRailOpen(false);
    setSheetOpen(false);
  }, [location.pathname, setRailOpen]);

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
    if (!inboxVisible) return;
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

  function onSelectChat(chat: Conversation) {
    setSheetOpen(false);
    if (!boxesVisible) return;
    openChatFromList(peerFromChat(chat));
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
                  onSelect={onSelectChat}
                />
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
