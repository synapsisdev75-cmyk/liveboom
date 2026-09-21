import {
  Gift,
  Maximize2,
  MessageCircle,
  Minus,
  Search,
  Send,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { countInboxUnread } from '../../lib/chatNotifyContext';
import { openRechargeCoins, validateCoinsBalance } from '../../lib/giftsFirestore';
import { findLiveGift, sortedPrivateGiftCatalog } from '../../lib/liveboomGifts';
import { sendPrivateGiftToPeer } from '../../lib/privateGiftSend';
import { playIncomingMessageSound } from '../../lib/alertSound';
import {
  ensureChat,
  listenConversations,
  listenMessages,
  markMessagesDelivered,
  markMessagesRead,
  sendChatMessage,
  type ChatMessage,
  type Conversation,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';
import { useMessageBoxesVisible, useMessagesInboxVisible } from '../../hooks/useMessagesInboxVisible';
import {
  useMessagesMenuStore,
  type MessagesPopupPeer,
} from '../../store/messagesMenuStore';
import { useCatalogConfigStore } from '../../store/catalogConfigStore';
import { GiftBoxStrip } from '../live/GiftBoxStrip';
import { GiftCatalogLayer } from '../live/GiftCatalogLayer';
import { FloatingGift, GiftVisual } from '../live/FloatingGift';
import { CoinModal } from '../wallet/CoinModal';
import { UserAvatar } from '../profile/UserAvatar';
import { CallChatActions } from './CallChatActions';
import { EmojiPickerButton } from './EmojiPicker';

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

/** Chat flotante: regalos, llamadas, emojis + expandir a /mensajes. */
function FloatingDmWindow({
  peer,
  onClose,
  onExpand,
  onMinimize,
}: {
  peer: MessagesPopupPeer;
  onClose: () => void;
  onExpand: () => void;
  onMinimize: () => void;
}) {
  const profile = useAuthStore((state) => state.profile);
  const setCoins = useAuthStore((state) => state.setCoins);
  const callStatus = useCallStore((state) => state.status);
  const callChatId = useCallStore((state) => state.chatId);
  const hangup = useCallStore((state) => state.hangup);
  const [chatId, setChatId] = useState<string | null>(peer.chatId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [sendingGift, setSendingGift] = useState<string | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [rechargeNeeded, setRechargeNeeded] = useState<number | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [giftFloats, setGiftFloats] = useState<
    Array<{ id: string; giftId: string; left: number; senderName?: string }>
  >([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const giftTriggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastMsgCount = useRef(0);
  const seenGiftAnimRef = useRef<Set<string>>(new Set());
  const giftSeededRef = useRef<string | null>(null);
  const giftWatchStartedRef = useRef(0);
  const inThisCall = Boolean(chatId && callChatId === chatId && callStatus !== 'idle');
  const giftsVersion = useCatalogConfigStore((state) => state.giftsVersion);
  const giftCatalog = useMemo(() => sortedPrivateGiftCatalog(), [giftsVersion]);
  const inboxVisible = useMessagesInboxVisible();

  useEffect(() => {
    setChatId(peer.chatId || null);
    setMessages([]);
    setDraft('');
    setError(null);
    lastMsgCount.current = 0;
    seenGiftAnimRef.current.clear();
    giftSeededRef.current = null;
    giftWatchStartedRef.current = 0;
    setGiftFloats([]);
  }, [peer.uid, peer.chatId]);

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
    // listenMessages ya entrega orden cronológico (antiguo → nuevo). No invertir otra vez.
    return listenMessages(chatId, profile.firebaseUid, (list) => {
      if (list.length > lastMsgCount.current && lastMsgCount.current > 0) {
        const newest = list[list.length - 1];
        if (newest && newest.fromUid !== profile.firebaseUid) {
          playIncomingMessageSound(document.visibilityState === 'visible');
        }
      }
      lastMsgCount.current = list.length;
      setMessages(list);
      void (async () => {
        await markMessagesDelivered(chatId, profile.firebaseUid, list);
        if (document.visibilityState === 'visible') {
          await markMessagesRead(chatId, profile.firebaseUid, list);
        }
      })();
    });
  }, [chatId, profile?.firebaseUid]);

  useEffect(() => {
    if (!chatId) return;
    if (giftSeededRef.current !== chatId) {
      if (messages.length === 0) return;
      giftSeededRef.current = chatId;
      giftWatchStartedRef.current = Date.now();
      messages.forEach((message) => {
        if (message.giftId) seenGiftAnimRef.current.add(message.id);
      });
      return;
    }
    for (const message of messages) {
      if (!message.giftId || seenGiftAnimRef.current.has(message.id)) continue;
      seenGiftAnimRef.current.add(message.id);
      if (message.fromUid === profile?.firebaseUid) continue;
      const createdAt = Date.parse(message.createdAt);
      if (!Number.isFinite(createdAt)) continue;
      if (createdAt < giftWatchStartedRef.current - 1500) continue;
      if (Date.now() - createdAt > 15_000) continue;
      const incomingGiftId = message.giftId;
      setGiftFloats((current) => [
        ...current.slice(-1),
        {
          id: `gf-in-${message.id}`,
          giftId: incomingGiftId,
          left: 30 + Math.random() * 40,
          senderName: peer.displayName || peer.username,
        },
      ]);
    }
  }, [chatId, messages, peer.displayName, peer.username, profile?.firebaseUid]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, peer.uid, giftFloats.length]);

  async function send(text = draft, extras?: { giftId?: string }) {
    if (!profile || busy) return;
    const body = text.trim();
    if (!body && !extras?.giftId) return;
    setBusy(true);
    setError(null);
    try {
      await sendChatMessage(meFromProfile(profile), peer, body || '🎁 Regalo', {
        giftId: extras?.giftId || null,
      });
      if (!extras?.giftId) setDraft('');
      setEmojiOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar');
    } finally {
      setBusy(false);
    }
  }

  async function sendGift(giftId: string, multiplier: 1 | 2 | 4 | 8 = 1) {
    if (sendingGift || !profile) return;
    const catalog = findLiveGift(giftId);
    if (!catalog) {
      setGiftError('Regalo no válido');
      return;
    }
    const mult = ([1, 2, 4, 8] as const).includes(multiplier) ? multiplier : 1;
    const totalCoins = catalog.coins * mult;
    const coins = profile.coinsBalance ?? 0;
    if (!validateCoinsBalance(coins, totalCoins)) {
      setGiftError('No tienes Coins suficientes');
      setRechargeNeeded(totalCoins);
      return;
    }
    setGiftError(null);
    setRechargeNeeded(null);
    setSendingGift(giftId);
    const senderName = profile.displayName || profile.handle || 'Liveboomer';
    try {
      const result = await sendPrivateGiftToPeer({
        giftId: catalog.id,
        sender: profile,
        peer,
        multiplier: mult,
        clientId: `quick-${chatId || peer.uid}-${Date.now()}`,
      });
      setCoins(result.senderBalance);
      setGiftFloats((current) => [
        ...current.slice(-1),
        {
          id: `gf-${Date.now()}`,
          giftId: catalog.id,
          left: 30 + Math.random() * 40,
          senderName,
        },
      ]);
      setGiftsOpen(false);
    } catch (err) {
      setGiftError(err instanceof Error ? err.message : 'No se pudo enviar el regalo');
      setGiftsOpen(true);
    } finally {
      setSendingGift(null);
    }
  }

  function insertEmoji(token: string) {
    const el = inputRef.current;
    const next = draft + token;
    setDraft(next.slice(0, 2000));
    window.setTimeout(() => el?.focus(), 0);
  }

  return createPortal(
    <div className="lb-msg-quick-popup pointer-events-auto fixed z-[80] flex flex-col overflow-hidden rounded-2xl border border-white/12 bg-zinc-950 shadow-2xl">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-1.5 sm:gap-1.5 sm:px-2.5 sm:py-2">
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
        <div className="flex shrink-0 items-center gap-0.5">
          {inThisCall ? (
            <button
              type="button"
              onClick={() => void hangup()}
              className="inline-flex h-9 items-center rounded-lg bg-red-500/20 px-2 text-[10px] font-bold text-red-300"
            >
              Colgar
            </button>
          ) : (
            <CallChatActions
              key={peer.uid}
              chatId={chatId}
              peer={peer}
              inThisCall={false}
              busy={busy}
              callStatus={callStatus}
              onBusy={setBusy}
              onError={setError}
              onStopCall={() => void hangup()}
            />
          )}
          <button
            type="button"
            onClick={onMinimize}
            className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-cyan-300"
            aria-label="Minimizar"
            title="Minimizar"
          >
            <Minus size={16} />
          </button>
          {inboxVisible ? (
            <button
              type="button"
              onClick={onExpand}
              className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-cyan-300"
              aria-label="Pantalla completa"
              title="Pantalla completa"
            >
              <Maximize2 size={16} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-white"
            aria-label="Cerrar chat"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="absolute inset-0 space-y-2 overflow-y-auto px-3 py-2">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">Sin mensajes aún. Escribe el primero.</p>
          ) : (
            messages.map((msg) => {
              const mine = msg.fromUid === profile?.firebaseUid;
              const gift = msg.giftId ? findLiveGift(msg.giftId) : null;
              return (
                <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-snug ${
                      mine
                        ? 'rounded-br-md bg-violet-600/90 text-white'
                        : 'rounded-bl-md bg-zinc-800 text-zinc-100'
                    }`}
                  >
                    {gift ? (
                      <div className="mb-1 flex items-center gap-1.5">
                        <GiftVisual gift={gift} size={28} />
                        <span className="font-semibold">{gift.name}</span>
                      </div>
                    ) : null}
                    {msg.mediaUrl && msg.mediaType === 'image' ? (
                      <img
                        src={msg.mediaUrl}
                        alt=""
                        className="mb-1 max-h-40 w-full rounded-xl object-contain"
                        loading="lazy"
                      />
                    ) : msg.mediaUrl ? (
                      <p className="opacity-90">
                        {msg.mediaType === 'audio'
                          ? '🎤 Nota de voz'
                          : msg.mediaType === 'video'
                            ? '🎬 Video'
                            : '📎 Adjunto'}
                      </p>
                    ) : null}
                    {msg.text ? <p className="whitespace-pre-wrap break-words">{msg.text}</p> : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
        {giftFloats.length > 0 ? (
          <div className="pointer-events-none absolute inset-0 z-[70] overflow-visible">
            {giftFloats.map((item) => (
              <FloatingGift
                key={item.id}
                giftId={item.giftId}
                senderName={item.senderName}
                left={item.left}
                layoutContext="chat"
                onComplete={() =>
                  setGiftFloats((current) => current.filter((row) => row.id !== item.id))
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="shrink-0 px-3 pb-1 text-[11px] text-rose-300">{error}</p> : null}
      {giftError ? <p className="shrink-0 px-3 pb-1 text-[11px] text-rose-300">{giftError}</p> : null}

      <form
        className="flex shrink-0 items-center gap-1 border-t border-white/10 px-2 py-2 sm:gap-1.5 sm:px-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <button
          ref={giftTriggerRef}
          type="button"
          onClick={() => {
            setGiftsOpen((v) => !v);
            setEmojiOpen(false);
          }}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition ${
            giftsOpen ? 'bg-fuchsia-500/25 text-fuchsia-200' : 'text-zinc-400 hover:bg-white/5 hover:text-fuchsia-300'
          }`}
          aria-label="Regalos"
          title="Regalos"
        >
          <Gift size={18} />
        </button>
        <EmojiPickerButton
          open={emojiOpen}
          onOpenChange={(next) => {
            setEmojiOpen(next);
            if (next) setGiftsOpen(false);
          }}
          title="Emoji"
          placement="above"
          showUnicode
          buttonClassName={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition ${
            emojiOpen ? 'bg-amber-500/20 text-amber-200' : 'text-zinc-400 hover:bg-white/5 hover:text-amber-200'
          }`}
          onPick={(id) => insertEmoji(id)}
        />
        <input
          ref={inputRef}
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

      {giftsOpen ? (
        <GiftCatalogLayer open={giftsOpen} triggerRef={giftTriggerRef} onClose={() => setGiftsOpen(false)}>
          <GiftBoxStrip
            gifts={giftCatalog}
            sendingGiftId={sendingGift}
            coins={profile?.coinsBalance}
            error={giftError}
            rechargeNeeded={rechargeNeeded}
            onRecharge={() => {
              setRechargeOpen(true);
              openRechargeCoins();
            }}
            compact
            floating
            onSelect={(id, multiplier) => void sendGift(id, multiplier ?? 1)}
            onClose={() => setGiftsOpen(false)}
          />
        </GiftCatalogLayer>
      ) : null}
      {rechargeOpen
        ? createPortal(
            <div className="pointer-events-auto fixed inset-0 z-[124]">
              <CoinModal onClose={() => setRechargeOpen(false)} />
            </div>,
            document.body,
          )
        : null}
    </div>,
    document.body,
  );
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
  const boxesVisible = useMessageBoxesVisible();
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
          if (!boxesVisible) return;
          openChatFromList(peerFromChat(chat));
        }}
      />
    </aside>
  );
}

/**
 * Host único (siempre montado en el shell): caja flotante + pastillas minimizadas.
 * En laptop/PC/tablet landscape se cierra y no renderiza (el escritorio queda libre).
 */
export function MessagesFloatingHost() {
  const profile = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const location = useLocation();
  const inboxVisible = useMessagesInboxVisible();
  const boxesVisible = useMessageBoxesVisible();
  const popupPeer = useMessagesMenuStore((state) => state.popupPeer);
  const minimized = useMessagesMenuStore((state) => state.minimized);
  const setRailOpen = useMessagesMenuStore((state) => state.setRailOpen);
  const expandMinimized = useMessagesMenuStore((state) => state.expandMinimized);
  const closePopup = useMessagesMenuStore((state) => state.closePopup);
  const minimizeCurrent = useMessagesMenuStore((state) => state.minimizeCurrent);
  const closeAll = useMessagesMenuStore((state) => state.closeAll);

  useEffect(() => {
    setRailOpen(false);
    closePopup();
  }, [location.pathname, setRailOpen, closePopup]);

  useEffect(() => {
    if (!boxesVisible) closeAll();
  }, [boxesVisible, closeAll]);

  if (!profile || !boxesVisible) return null;

  function openFullscreen(peer?: MessagesPopupPeer | null) {
    if (!inboxVisible) return;
    closeAll();
    if (peer?.username) {
      navigate(`/mensajes?con=${encodeURIComponent(peer.username)}`);
      return;
    }
    navigate('/mensajes');
  }

  return (
    <>
      {popupPeer ? (
        <FloatingDmWindow
          key={popupPeer.uid}
          peer={popupPeer}
          onClose={closePopup}
          onMinimize={minimizeCurrent}
          onExpand={() => openFullscreen(popupPeer)}
        />
      ) : null}
      <MinimizedChatsDock items={minimized} onExpand={expandMinimized} />
    </>
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
