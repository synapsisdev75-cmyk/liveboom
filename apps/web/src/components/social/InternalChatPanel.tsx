import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Check,
  CheckCheck,
  FileText,
  Gift,
  Image as ImageIcon,
  Info,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pause,
  Pencil,
  Phone,
  PhoneMissed,
  PhoneOff,
  Play,
  Search,
  Send,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { EmojiPickerButton } from './EmojiPicker';
import { VideoNoteBubble, VideoNoteCapture } from './ChatVideoNote';
import { FlashBoomCameraCapture } from './FlashBoomCameraCapture';
import { ChatVoiceRecorderBar } from './ChatVoiceRecorderBar';
import { EmojiInput } from './EmojiInput';
import { EmojiText } from './EmojiText';
import { GifPickerSheet } from './GifPickerSheet';
import { insertEmojiToken, CHAT_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import { playIncomingMessageSound, playMessagePop } from '../../lib/alertSound';
import { api } from '../../lib/api';
import { ensureCallMediaPermission } from '../../lib/callMedia';
import {
  CHAT_FILE_ACCEPT,
  formatChatFileSize,
  isAnimatedChatGif,
  previewChatAttachment,
  type ChatAttachmentPreview,
} from '../../lib/chatAttachments';
import { listenMyGroups, type LiveGroup } from '../../lib/groupsFirestore';
import { uploadChatAttachment, uploadChatMedia } from '../../lib/storage';
import type { ComposerGif } from '../../lib/composerGifs';
import {
  openRechargeCoins,
  sendPrivateGift,
  validateCoinsBalance,
} from '../../lib/giftsFirestore';
import { findLiveGift, sortedLiveboomGiftCatalog } from '../../lib/liveboomGifts';
import { addLevelXp, setFirestoreCoins } from '../../lib/profileFirestore';
import { FloatingGift, GiftVisual } from '../live/FloatingGift';
import { GiftBoxStrip } from '../live/GiftBoxStrip';
import { GiftCatalogLayer } from '../live/GiftCatalogLayer';
import { CoinModal } from '../wallet/CoinModal';
import {
  deleteChatMessageForEveryone,
  deleteChatMessageForMe,
  deleteConversation,
  editChatMessage,
  ensureChat,
  listenConversations,
  listenFriends,
  listenMessages,
  listenPresence,
  markMessagesDelivered,
  markMessagesRead,
  sendChatMessage,
  startPrivateCall,
  endPrivateCall,
  type ChatMessage,
  type Conversation,
  type FriendChip,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { formatCallClock, useCallElapsed, useCallStore } from '../../store/callStore';
import { profileHref } from '../../lib/profileFirestore';
import { canCallFromFriends, canCallUser } from '../../lib/canCallUser';
import { createCall, formatCallApiError } from '../../lib/liveKitCallService';
import { StickerPickerSheet } from './StickerPickerSheet';
import type { ComposerSticker } from '../../lib/composerStickers';

type Props = {
  compact?: boolean;
  /** Layout página /mensajes (lista + hilo lado a lado en desktop). */
  page?: boolean;
  /** @deprecated usa page */
  fullscreen?: boolean;
};

type ListTab = 'todos' | 'unread' | 'grupos';

type PersonRow = FriendChip & {
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
  chatId: string | null;
};

function detectLink(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

function formatAudioClock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function VoiceNotePlayer({ src, mine }: { src: string; mine?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setProgress(el.currentTime || 0);
    const onMeta = () => setDuration(el.duration && Number.isFinite(el.duration) ? el.duration : 0);
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onErr = () => setError('No se pudo reproducir este audio');
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onErr);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onErr);
    };
  }, [src]);

  async function toggle() {
    const el = audioRef.current;
    if (!el) return;
    setError(null);
    try {
      if (playing) {
        el.pause();
        setPlaying(false);
        return;
      }
      await el.play();
      setPlaying(true);
    } catch {
      setError('Toca de nuevo para reproducir');
      setPlaying(false);
    }
  }

  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <div className={`mb-0.5 flex w-[min(100%,15rem)] items-center gap-2 ${mine ? '' : ''}`}>
      <audio ref={audioRef} src={src} preload="metadata" playsInline className="hidden" />
      <button
        type="button"
        onClick={() => void toggle()}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
          mine ? 'bg-white/20 text-white' : 'bg-violet-500/25 text-violet-200'
        }`}
        aria-label={playing ? 'Pausar' : 'Reproducir'}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={`h-1.5 overflow-hidden rounded-full ${mine ? 'bg-white/25' : 'bg-white/10'}`}
          onClick={(e) => {
            const el = audioRef.current;
            if (!el || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            el.currentTime = ratio * duration;
            setProgress(el.currentTime);
          }}
          role="presentation"
        >
          <div
            className={`h-full rounded-full ${mine ? 'bg-white' : 'bg-violet-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-zinc-500'}`}>
          {error || `${formatAudioClock(progress)} / ${formatAudioClock(duration)}`}
        </p>
      </div>
    </div>
  );
}

function CallEventBubble({ message }: { message: ChatMessage }) {
  const meta = message.callMeta;
  const outcome = meta?.outcome || 'missed';
  const video = Boolean(meta?.video);
  const missed = outcome === 'missed' || outcome === 'declined' || outcome === 'cancelled';
  const Icon = missed ? PhoneMissed : video ? Video : Phone;
  const label =
    message.text ||
    (missed
      ? `${video ? 'Videollamada' : 'Llamada'} perdida`
      : `${video ? 'Videollamada' : 'Llamada'}`);
  return (
    <div className="mx-auto my-2 flex max-w-[90%] items-center justify-center gap-2 rounded-full border border-white/10 bg-[#14151c] px-3.5 py-1.5 text-[11px] text-zinc-400">
      <Icon size={13} className={missed ? 'text-rose-400' : 'text-emerald-400'} />
      <span className="font-medium text-zinc-300">{label}</span>
    </div>
  );
}

function ChatAttachMenu({
  open,
  anchorRef,
  onClose,
  onGallery,
  onCamera,
  onVideoNote,
  onFile,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onGallery: () => void;
  onCamera: () => void;
  onVideoNote: () => void;
  onFile: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });

  const place = useCallback(() => {
    const btn = anchorRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const rect = btn.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const pad = 8;
    const gap = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left;
    if (left + mw > vw - pad) left = vw - pad - mw;
    if (left < pad) left = pad;

    let top = rect.top - gap - mh;
    if (top < pad) top = pad;
    if (top + mh > vh - pad) top = Math.max(pad, vh - pad - mh);

    setPos({ top, left, ready: true });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPos((current) => (current.ready ? { ...current, ready: false } : current));
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    menu?.focus();
    const onReposition = () => place();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        anchorRef.current?.focus();
      }
    };
    const onDoc = (event: MouseEvent) => {
      const node = event.target as Node;
      if (menuRef.current?.contains(node) || anchorRef.current?.contains(node)) return;
      onClose();
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('orientationchange', onReposition);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('orientationchange', onReposition);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open, place, onClose, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  const pick = (action: () => void) => {
    action();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      id="lb-chat-attach-menu"
      role="menu"
      tabIndex={-1}
      aria-label="Adjuntar"
      className="lb-chat-attach-menu"
      style={{ top: pos.top, left: pos.left, visibility: pos.ready ? 'visible' : 'hidden' }}
    >
      <button type="button" role="menuitem" className="lb-chat-attach-item" onClick={() => pick(onGallery)}>
        <span className="lb-chat-attach-ico is-gallery">
          <ImageIcon size={16} />
        </span>
        Galería
      </button>
      <button type="button" role="menuitem" className="lb-chat-attach-item" onClick={() => pick(onCamera)}>
        <span className="lb-chat-attach-ico is-camera">
          <Camera size={16} />
        </span>
        Abrir cámara
      </button>
      <button type="button" role="menuitem" className="lb-chat-attach-item" onClick={() => pick(onVideoNote)}>
        <span className="lb-chat-attach-ico is-video">
          <Video size={16} />
        </span>
        Nota de video
      </button>
      <button type="button" role="menuitem" className="lb-chat-attach-item" onClick={() => pick(onFile)}>
        <span className="lb-chat-attach-ico is-file">
          <FileText size={16} />
        </span>
        Adjuntar archivo
      </button>
    </div>,
    document.body,
  );
}

function formatListTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startToday - startMsg) / 86_400_000);
  if (diffDays === 0) {
    return d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Ayer';
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function formatBubbleTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startToday - startMsg) / 86_400_000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function sameCalendarDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function Avatar({
  url,
  name,
  size = 44,
  ring,
  online,
}: {
  url: string | null;
  name: string;
  size?: number;
  ring?: boolean;
  online?: boolean;
}) {
  const letter = (name || '?').slice(0, 1).toUpperCase();
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size, minWidth: size, minHeight: size, maxWidth: size, maxHeight: size }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          className={`block rounded-full object-cover ${
            ring ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-[#0a0a0b]' : ''
          }`}
          style={{ width: size, height: size, maxWidth: size, maxHeight: size }}
        />
      ) : (
        <span
          className={`grid h-full w-full place-items-center rounded-full bg-zinc-800 text-[10px] font-bold text-violet-300 ${
            ring ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-[#0a0a0b]' : ''
          }`}
        >
          {letter}
        </span>
      )}
      {online ? (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-[#0a0a0b] bg-emerald-400 ${
            size <= 32 ? 'h-2 w-2' : 'h-2.5 w-2.5'
          }`}
        />
      ) : null}
    </span>
  );
}

export function InternalChatPanel({ compact = false, page = false, fullscreen = false }: Props) {
  const isPage = page || fullscreen;
  const profile = useAuthStore((state) => state.profile);
  const setCoins = useAuthStore((state) => state.setCoins);
  const [searchParams, setSearchParams] = useSearchParams();
  const [friends, setFriends] = useState<FriendChip[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeUid, setActiveUid] = useState<string | null>(searchParams.get('conUid'));
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docVisible, setDocVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  const [online, setOnline] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; url: string } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [videoNoteOpen, setVideoNoteOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [fileUpload, setFileUpload] = useState<{
    stage: 'preparing' | 'uploading' | 'sent' | 'error';
    pct: number;
  } | null>(null);
  const callStatus = useCallStore((state) => state.status);
  const callChatId = useCallStore((state) => state.chatId);
  const beginOutgoing = useCallStore((state) => state.beginOutgoing);
  const hangup = useCallStore((state) => state.hangup);
  const callElapsed = useCallElapsed();
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [recordLevels, setRecordLevels] = useState<number[]>(() => Array(18).fill(0.18));
  const [pendingFile, setPendingFile] = useState<ChatAttachmentPreview | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [sendingGift, setSendingGift] = useState<string | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [rechargeNeeded, setRechargeNeeded] = useState<number | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [giftFloats, setGiftFloats] = useState<
    Array<{ id: string; giftId: string; left: number; senderName?: string }>
  >([]);
  const [mediaViewer, setMediaViewer] = useState<{ url: string; gif?: boolean } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [listTab, setListTab] = useState<ListTab>('todos');
  const [queryText, setQueryText] = useState('');
  const [liveHandles, setLiveHandles] = useState<Set<string>>(new Set());
  const [myGroups, setMyGroups] = useState<LiveGroup[]>([]);
  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMsgCount = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachFileRef = useRef<HTMLInputElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const giftTriggerRef = useRef<HTMLButtonElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordCtxRef = useRef<AudioContext | null>(null);
  const recordRafRef = useRef(0);
  const recordTimerRef = useRef(0);
  const recordCancelRef = useRef(false);
  const seenGiftAnimRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;
    return listenFriends(profile.firebaseUid, setFriends);
  }, [profile?.firebaseUid]);

  useEffect(() => {
    const onVis = () => setDocVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!profile) return;
    return listenConversations(profile.firebaseUid, setConversations);
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile || !isPage) return;
    return listenMyGroups(profile.firebaseUid, setMyGroups);
  }, [profile?.firebaseUid, isPage]);

  useEffect(() => {
    if (!profile || !isPage) return;
    let cancelled = false;
    const load = () => {
      void api<{ streams?: { username?: string }[] }>('/api/stream/friends-live')
        .then((data) => {
          if (cancelled) return;
          setLiveHandles(
            new Set(
              (data.streams || [])
                .map((s) => (s.username || '').toLowerCase())
                .filter(Boolean),
            ),
          );
        })
        .catch(() => {
          if (!cancelled) setLiveHandles(new Set());
        });
    };
    load();
    const id = window.setInterval(load, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [profile?.firebaseUid, isPage]);

  const conUser = searchParams.get('con');
  useEffect(() => {
    if (!conUser || friends.length === 0) return;
    const match = friends.find((f) => f.username.toLowerCase() === conUser.toLowerCase());
    if (match) {
      setActiveUid(match.uid);
      setSearchParams({}, { replace: true });
    }
  }, [conUser, friends, setSearchParams]);

  const people = useMemo(() => {
    const convByUid = new Map(conversations.map((chat) => [chat.uid, chat]));
    return friends
      .map((friend) => {
        const chat = convByUid.get(friend.uid);
        return {
          ...friend,
          lastMessage: chat?.lastMessage ?? null,
          lastAt: chat?.lastAt ?? null,
          unread: chat?.unread ?? 0,
          chatId: chat?.chatId ?? null,
        } satisfies PersonRow;
      })
      .sort((a, b) => {
        if ((b.unread || 0) !== (a.unread || 0)) return (b.unread || 0) - (a.unread || 0);
        return String(b.lastAt || '').localeCompare(String(a.lastAt || ''));
      });
  }, [friends, conversations]);

  const giftCatalog = useMemo(() => sortedLiveboomGiftCatalog(), []);
  const coins = profile?.coinsBalance ?? 0;

  const totalUnread = useMemo(
    () => conversations.reduce((sum, chat) => sum + (chat.unread || 0), 0),
    [conversations],
  );

  const filteredPeople = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    let list = people;
    if (listTab === 'unread') list = list.filter((p) => p.unread > 0);
    if (q) {
      list = list.filter(
        (p) =>
          p.username.toLowerCase().includes(q) ||
          (p.displayName || '').toLowerCase().includes(q) ||
          (p.lastMessage || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [people, listTab, queryText]);

  useEffect(() => {
    if (isPage || compact) return;
    if (people.length > 0 && !activeUid) {
      const first = people[0];
      if (first) setActiveUid(first.uid);
    }
  }, [people, compact, activeUid, isPage]);

  const activeFriend = people.find((item) => item.uid === activeUid) || null;
  const inThisCall = Boolean(chatId && callChatId === chatId && callStatus !== 'idle');
  const mayCall = Boolean(activeFriend && canCallFromFriends(friends, activeFriend.uid));

  useEffect(() => {
    if (!activeFriend?.uid) {
      setOnline(false);
      return;
    }
    return listenPresence(activeFriend.uid, setOnline);
  }, [activeFriend?.uid]);

  useEffect(() => {
    if (!profile || !activeFriend) {
      setChatId(null);
      setMessages([]);
      return;
    }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    setError(null);
    void ensureChat(
      {
        firebaseUid: profile.firebaseUid,
        handle: profile.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      },
      activeFriend,
    )
      .then((id) => {
        if (cancelled) return;
        setChatId(id);
        lastMsgCount.current = 0;
        unsub = listenMessages(id, profile.firebaseUid, (list) => {
          if (list.length > lastMsgCount.current && lastMsgCount.current > 0) {
            const newest = list[list.length - 1];
            if (newest && !newest.mine) {
              // Dentro del chat abierto: pop corto; pestaña oculta: alerta completa
              playIncomingMessageSound(document.visibilityState === 'visible');
            }
          }
          lastMsgCount.current = list.length;
          setMessages(list);
          void (async () => {
            await markMessagesDelivered(id, profile.firebaseUid, list);
            if (document.visibilityState === 'visible') {
              await markMessagesRead(id, profile.firebaseUid, list);
            }
          })();
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setChatId(null);
        setMessages([]);
        setError(err instanceof Error ? err.message : 'No se pudo abrir el chat');
      });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [profile?.firebaseUid, activeFriend?.uid]);

  useEffect(() => {
    if (!chatId || !profile || !docVisible || messages.length === 0) return;
    void markMessagesRead(chatId, profile.firebaseUid, messages);
  }, [chatId, profile?.firebaseUid, docVisible, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeUid]);

  useEffect(() => {
    function openGiftsFromCall() {
      setGiftsOpen(true);
    }
    function openGifFromCall() {
      setGifOpen(true);
    }
    function openStickersFromCall() {
      setStickerOpen(true);
    }
    window.addEventListener('liveboom:open-chat-gifts', openGiftsFromCall);
    window.addEventListener('liveboom:open-chat-gif', openGifFromCall);
    window.addEventListener('liveboom:open-chat-stickers', openStickersFromCall);
    return () => {
      window.removeEventListener('liveboom:open-chat-gifts', openGiftsFromCall);
      window.removeEventListener('liveboom:open-chat-gif', openGifFromCall);
      window.removeEventListener('liveboom:open-chat-stickers', openStickersFromCall);
    };
  }, []);

  useEffect(() => {
    setAttachOpen(false);
  }, [activeUid, recording]);

  useEffect(() => {
    return () => {
      recordCancelRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      stopVoiceMeter();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUid]);

  const giftSeededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!chatId) {
      giftSeededRef.current = null;
      seenGiftAnimRef.current.clear();
      return;
    }
    if (giftSeededRef.current !== chatId) {
      if (messages.length === 0) return;
      giftSeededRef.current = chatId;
      messages.forEach((message) => {
        if (message.giftId) seenGiftAnimRef.current.add(message.id);
      });
      return;
    }
    for (const message of messages) {
      if (!message.giftId || message.mine || seenGiftAnimRef.current.has(message.id)) continue;
      seenGiftAnimRef.current.add(message.id);
      animateGiftInChat(message.giftId);
    }
  }, [chatId, messages]);

  async function send(
    text: string,
    extras?: {
      mediaUrl?: string | null;
      mediaType?: 'image' | 'audio' | 'video' | 'file' | 'gif' | null;
      linkUrl?: string | null;
      fileName?: string | null;
      fileSize?: number | null;
      mimeType?: string | null;
      storagePath?: string | null;
      giftId?: string | null;
    },
  ) {
    if (!profile || !activeFriend || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendChatMessage(
        {
          firebaseUid: profile.firebaseUid,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        activeFriend,
        text,
        extras,
      );
      playMessagePop();
      setDraft('');
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'No se pudo enviar';
      setError(
        /insufficient permissions|permission-denied/i.test(raw)
          ? 'No se pudo enviar. Confirma que son amigos y recarga la página.'
          : raw,
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(file: File | null, mediaType: 'image' | 'audio') {
    if (!file || !profile) return;
    if (mediaType === 'image') {
      if (pendingImage) URL.revokeObjectURL(pendingImage.url);
      setPendingImage({ file, url: URL.createObjectURL(file) });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = await uploadChatMedia(profile.firebaseUid, file, file.name);
      await send('🎤 Audio', { mediaUrl: url, mediaType: 'audio' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir');
    } finally {
      setBusy(false);
    }
  }

  function onPickAttachment(file: File | null) {
    if (!file) return;
    const preview = previewChatAttachment(file);
    if ('error' in preview) {
      setError(preview.error);
      return;
    }
    setError(null);
    setFileUpload(null);
    if (preview.kind === 'image') {
      if (pendingImage) URL.revokeObjectURL(pendingImage.url);
      if (preview.previewUrl) URL.revokeObjectURL(preview.previewUrl);
      setPendingImage({ file: preview.file, url: URL.createObjectURL(preview.file) });
      setPendingFile(null);
      return;
    }
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(preview);
  }

  function removePendingFile() {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
    setFileUpload(null);
  }

  async function confirmPendingFile() {
    if (!pendingFile || !profile || !activeFriend) return;
    let conversationId = chatId || '';
    let stage = 'validate';
    setBusy(true);
    setError(null);
    setFileUpload({ stage: 'preparing', pct: 0 });
    try {
      console.info('[ChatUpload] validating conversation', { conversationId: conversationId || null });
      stage = 'ensure-chat';
      conversationId = await ensureChat(
        {
          firebaseUid: profile.firebaseUid,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        activeFriend,
      );
      if (conversationId && conversationId !== chatId) setChatId(conversationId);

      stage = 'upload';
      console.info('[ChatUpload] uploading', { conversationId });
      setFileUpload({ stage: 'uploading', pct: 0 });
      const uploaded = await uploadChatAttachment(
        profile.firebaseUid,
        pendingFile.file,
        pendingFile.name,
        pendingFile.mime,
        {
          chatId: conversationId,
          onProgress: (pct) => setFileUpload({ stage: 'uploading', pct }),
        },
      );
      console.info('[ChatUpload] upload complete', { conversationId });
      console.info('[ChatUpload] download URL created', { conversationId });

      stage = 'save-message';
      setFileUpload({ stage: 'sent', pct: 100 });
      const mediaType = pendingFile.kind;
      const label =
        mediaType === 'audio'
          ? '🎤 Audio'
          : mediaType === 'video'
            ? '🎬 Video'
            : `📎 ${pendingFile.name}`;
      await sendChatMessage(
        {
          firebaseUid: profile.firebaseUid,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        activeFriend,
        label,
        {
          mediaUrl: uploaded.url,
          mediaType,
          fileName: pendingFile.name,
          fileSize: pendingFile.size,
          mimeType: pendingFile.mime,
          storagePath: uploaded.storagePath,
        },
      );
      playMessagePop();
      console.info('[ChatUpload] message saved', { conversationId });
      removePendingFile();
      setFileUpload(null);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      console.error('[ChatUpload ERROR]', {
        conversationId: conversationId || null,
        stage,
        code: code || undefined,
      });
      setFileUpload((current) => ({ stage: 'error', pct: current?.pct || 0 }));
      const raw = err instanceof Error ? err.message : 'No se pudo enviar el archivo. Reintentar';
      setError(
        /storage\/unauthorized/i.test(raw) || code === 'storage/unauthorized'
          ? `${raw}\nNo se pudo enviar el archivo. Reintentar`
          : raw,
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendGifMessage(gif: ComposerGif) {
    setGifOpen(false);
    await send('GIF', { mediaUrl: gif.url, mediaType: 'gif' });
  }

  async function sendStickerMessage(sticker: ComposerSticker) {
    setStickerOpen(false);
    if (sticker.kind === 'text' && sticker.text) {
      await send(sticker.text);
      return;
    }
    if (sticker.src) {
      await send(sticker.label || 'Sticker', { mediaUrl: sticker.src, mediaType: 'image' });
    }
  }

  function animateGiftInChat(giftId: string, senderName?: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setGiftFloats((current) => [
      ...current.slice(-2),
      { id, giftId, left: 22 + Math.random() * 56, senderName },
    ]);
  }

  async function sendGiftMessage(giftId: string) {
    if (sendingGift || !profile || !activeFriend) return;
    const catalog = findLiveGift(giftId);
    if (!catalog) {
      setGiftError('Regalo no válido');
      return;
    }
    const coins = profile.coinsBalance ?? 0;
    if (!validateCoinsBalance(coins, catalog.coins)) {
      setGiftError('No tienes Coins suficientes');
      setRechargeNeeded(catalog.coins);
      return;
    }
    setGiftError(null);
    setRechargeNeeded(null);
    setSendingGift(giftId);
    const senderName = profile.displayName || profile.handle || 'Liveboomer';
    try {
      const result = await sendPrivateGift({
        giftId: catalog.id,
        senderUid: profile.firebaseUid,
        senderName,
        senderBalance: coins,
        recipientUsername: activeFriend.username,
        recipientUid: activeFriend.uid,
        clientId: `chat-${chatId || activeFriend.uid}-${Date.now()}`,
        roomName: `chat:${activeFriend.username}`,
      });
      setCoins(result.senderBalance);
      void setFirestoreCoins(profile.firebaseUid, result.senderBalance).catch(() => undefined);
      void addLevelXp(profile.firebaseUid, catalog.coins).catch(() => undefined);
      await send(`🎁 ${catalog.name}`, { giftId: catalog.id });
      animateGiftInChat(catalog.id, senderName);
      setGiftsOpen(false);
    } catch (err) {
      setGiftError(err instanceof Error ? err.message : 'No se pudo enviar el regalo');
      setGiftsOpen(true);
    } finally {
      setSendingGift(null);
    }
  }

  async function sendVideoNote(file: File) {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadChatMedia(profile.firebaseUid, file, file.name);
      await send('🎬 Nota de video', { mediaUrl: url, mediaType: 'video' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la nota de video');
    } finally {
      setBusy(false);
    }
  }

  async function confirmPendingImage() {
    if (!pendingImage || !profile) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadChatMedia(profile.firebaseUid, pendingImage.file, pendingImage.file.name);
      await send('📷 Foto', { mediaUrl: url, mediaType: 'image' });
      URL.revokeObjectURL(pendingImage.url);
      setPendingImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir');
    } finally {
      setBusy(false);
    }
  }

  async function removeConversation() {
    if (!profile || !chatId || !activeFriend) return;
    if (!window.confirm(`¿Eliminar la conversación con @${activeFriend.username}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteConversation(chatId, profile.firebaseUid);
      setMessages([]);
      setChatId(null);
      setActiveUid(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setBusy(false);
    }
  }

  async function removeMessage(messageId: string, scope: 'me' | 'everyone') {
    if (!chatId || !profile) return;
    setMenuMessageId(null);
    try {
      if (scope === 'everyone') {
        await deleteChatMessageForEveryone(chatId, messageId);
      } else {
        await deleteChatMessageForMe(chatId, messageId, profile.firebaseUid);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el mensaje');
    }
  }

  async function saveEdit() {
    if (!chatId || !editingId) return;
    setBusy(true);
    try {
      await editChatMessage(chatId, editingId, editDraft);
      setEditingId(null);
      setEditDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo editar');
    } finally {
      setBusy(false);
    }
  }

  function MessageTicks({ status }: { status?: ChatMessage['status'] }) {
    if (status === 'read') {
      return <CheckCheck size={12} className="text-sky-300" aria-label="Leído" />;
    }
    if (status === 'delivered') {
      return <CheckCheck size={12} className="text-white/70" aria-label="Entregado" />;
    }
    return <Check size={12} className="text-white/50" aria-label="Enviado" />;
  }

  function stopVoiceMeter() {
    if (recordRafRef.current) {
      cancelAnimationFrame(recordRafRef.current);
      recordRafRef.current = 0;
    }
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = 0;
    }
    recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordStreamRef.current = null;
    const ctx = recordCtxRef.current;
    recordCtxRef.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close();
  }

  async function startAudioRecording() {
    if (recording || draft.trim()) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const usedType = recorder.mimeType || mimeType || 'audio/webm';
      chunksRef.current = [];
      recordCancelRef.current = false;
      recordStreamRef.current = stream;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopVoiceMeter();
        setRecording(false);
        setRecordElapsed(0);
        setRecordLevels(Array(18).fill(0.18));
        recorderRef.current = null;
        if (recordCancelRef.current) return;
        const blob = new Blob(chunksRef.current, { type: usedType });
        if (blob.size < 200) {
          setError('Audio demasiado corto');
          return;
        }
        const ext = usedType.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `nota-${Date.now()}.${ext}`, { type: usedType });
        void onPickFile(file, 'audio');
      };
      recorderRef.current = recorder;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      recordCtxRef.current = audioCtx;
      const bins = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(bins);
        const step = Math.max(1, Math.floor(bins.length / 18));
        const next: number[] = [];
        for (let i = 0; i < 18; i += 1) {
          let sum = 0;
          for (let j = 0; j < step; j += 1) sum += bins[i * step + j] || 0;
          next.push(Math.min(1, sum / (step * 180)));
        }
        setRecordLevels(next);
        recordRafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setRecordElapsed(0);
      const started = Date.now();
      recordTimerRef.current = window.setInterval(() => {
        setRecordElapsed((Date.now() - started) / 1000);
      }, 200);
      recorder.start(250);
      setRecording(true);
      setError(null);
    } catch (err) {
      stopVoiceMeter();
      setError(err instanceof Error ? err.message : 'No se pudo grabar audio');
    }
  }

  function cancelAudioRecording() {
    recordCancelRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      return;
    }
    stopVoiceMeter();
    setRecording(false);
  }

  function stopAudioRecording() {
    recordCancelRef.current = false;
    recorderRef.current?.stop();
  }

  async function toggleVoice() {
    if (recording) {
      stopAudioRecording();
      return;
    }
    await startAudioRecording();
  }

  async function startCall(withVideo = false) {
    if (!chatId || !activeFriend || !profile) return;
    let allowed = canCallFromFriends(friends, activeFriend.uid);
    if (!allowed) {
      try {
        allowed = await canCallUser(profile.firebaseUid, activeFriend.uid);
      } catch {
        allowed = false;
      }
    }
    if (!allowed) {
      setError('Las llamadas están disponibles solo entre amigos.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await createCall(activeFriend.uid, withVideo ? 'video' : 'audio');
      const denied = await ensureCallMediaPermission(withVideo);
      if (denied) {
        setError(denied);
        return;
      }
      const callId = await startPrivateCall(
        chatId,
        {
          firebaseUid: profile.firebaseUid,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        activeFriend,
        withVideo,
        session.callId,
      );
      beginOutgoing({
        chatId,
        callId,
        peer: activeFriend,
        video: withVideo,
        token: session.token,
        serverUrl: session.serverUrl,
      });
    } catch (err) {
      await endPrivateCall(chatId).catch(() => undefined);
      setError(formatCallApiError(err));
    } finally {
      setBusy(false);
    }
  }

  function stopCall() {
    void hangup();
  }

  if (!profile) {
    return (
      <section className="rounded-2xl border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-400">
        Inicia sesión para chatear.
      </section>
    );
  }

  const chatOpen = Boolean(activeFriend);
  // Page móvil: lista O hilo. Desktop: lista siempre + hilo.
  const mobileHideList = isPage && chatOpen;

  if (compact) {
    return (
      <section className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
            <MessageCircle size={16} className="text-cyan-300" />
            Chat
            {totalUnread > 0 ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-violet-500 px-1.5 text-[10px] font-black">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            ) : null}
          </span>
          <Link to="/mensajes" className="text-xs font-medium text-cyan-400 hover:underline">
            Abrir completo
          </Link>
        </div>
        {people.length === 0 ? (
          <p className="text-center text-xs text-zinc-500">Sin amigos aún.</p>
        ) : (
          <ul className="max-h-28 space-y-1 overflow-y-auto">
            {people.slice(0, 6).map((friend) => (
              <li key={friend.uid}>
                <Link
                  to={`/mensajes?con=${encodeURIComponent(friend.username)}`}
                  className="flex items-center gap-2 rounded-xl px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  <Avatar url={friend.avatarUrl} name={friend.username} size={32} />
                  <span className="min-w-0 flex-1 truncate font-semibold">@{friend.username}</span>
                  {friend.unread > 0 ? (
                    <span className="rounded-full bg-violet-500 px-1.5 text-[10px] font-black">
                      {friend.unread}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const listPane = (
    <div
      className={`flex min-h-0 flex-col border-white/[0.06] bg-[#0a0a0b] ${
        isPage
          ? `w-full md:w-[min(42%,20rem)] md:shrink-0 md:border-r ${mobileHideList ? 'hidden md:flex' : 'flex'}`
          : 'flex w-full md:w-48 md:border-r'
      }`}
    >
      <div className="shrink-0 px-4 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <MessageCircle size={22} className="text-violet-400" />
            Mensajes
          </h1>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setNewMsgOpen((v) => !v)}
              className="rounded-full border border-cyan-400/50 px-3 py-1.5 text-[11px] font-bold text-cyan-300 hover:bg-cyan-400/10"
            >
              Nuevo mensaje
            </button>
            <button
              type="button"
              onClick={() => void removeConversation()}
              disabled={!activeFriend || !chatId}
              className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-zinc-300 disabled:opacity-30"
              aria-label="Más opciones"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#12131a] px-3 py-2.5">
          <Search size={16} className="shrink-0 text-zinc-500" />
          <input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Buscar conversaciones..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
        </label>

        <div className="mt-3 flex gap-4 border-b border-white/[0.06] text-sm">
          {(
            [
              { id: 'todos' as const, label: 'Todos' },
              {
                id: 'unread' as const,
                label: totalUnread > 0 ? `No leídos (${totalUnread})` : 'No leídos',
              },
              { id: 'grupos' as const, label: 'Grupos' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setListTab(tab.id)}
              className={`relative pb-2.5 text-[13px] font-semibold transition ${
                listTab === tab.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
              {listTab === tab.id ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-violet-500" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {newMsgOpen ? (
        <div className="mx-3 mb-2 max-h-36 overflow-y-auto rounded-xl border border-white/10 bg-[#12131a] p-2">
          <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Elegir amigo
          </p>
          {people.length === 0 ? (
            <p className="px-1 py-2 text-xs text-zinc-500">Sin amigos.</p>
          ) : (
            people.map((f) => (
              <button
                key={`new-${f.uid}`}
                type="button"
                onClick={() => {
                  setActiveUid(f.uid);
                  setNewMsgOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/5"
              >
                <Avatar url={f.avatarUrl} name={f.username} size={28} />
                <span className="truncate font-semibold text-white">
                  {f.displayName || f.username}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {listTab === 'grupos' ? (
          myGroups.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-zinc-500">
              Aún no estás en grupos.{' '}
              <Link to="/grupos" className="text-cyan-400 underline">
                Explorar
              </Link>
            </p>
          ) : (
            <ul className="space-y-0.5">
              {myGroups.map((g) => (
                <li key={g.id}>
                  <Link
                    to="/grupos?tab=chat"
                    className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.04]"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-violet-500/50 to-cyan-500/40 text-sm font-black text-white">
                      {g.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{g.name}</span>
                      <span className="block truncate text-xs text-zinc-500">
                        {g.memberCount} miembros · Chat del grupo
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : people.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-zinc-500">
            Aún no tienes amigos. Acepta una solicitud para empezar a chatear.
          </p>
        ) : filteredPeople.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-zinc-500">Sin resultados.</p>
        ) : (
          <ul className="space-y-0.5">
            {filteredPeople.map((friend) => {
              const isLive = liveHandles.has(friend.username.toLowerCase());
              const active = activeUid === friend.uid;
              const rowInCall = Boolean(friend.chatId && callChatId === friend.chatId && callStatus !== 'idle');
              const rowLive = rowInCall && callStatus === 'active';
              return (
                <li key={friend.uid}>
                  <button
                    type="button"
                    onClick={() => setActiveUid(friend.uid)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition ${
                      active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <Avatar
                      url={friend.avatarUrl}
                      name={friend.username}
                      size={48}
                      ring={isLive}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-sm font-semibold text-white">
                          {friend.displayName || friend.username}
                        </span>
                        <BadgeCheck size={14} className="shrink-0 fill-violet-500 text-violet-500" />
                        {rowInCall ? <Phone size={12} className="shrink-0 text-cyan-300" /> : null}
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-xs ${
                          rowInCall
                            ? 'font-semibold text-cyan-300'
                            : friend.unread > 0
                              ? 'font-medium text-zinc-300'
                              : 'text-zinc-500'
                        }`}
                      >
                        {rowLive
                          ? `En llamada · ${formatCallClock(callElapsed)}`
                          : rowInCall
                            ? 'Llamando...'
                            : friend.lastMessage || `@${friend.username}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[10px] text-zinc-500">{formatListTime(friend.lastAt)}</span>
                      {isLive ? (
                        <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                          Live
                        </span>
                      ) : friend.unread > 0 ? (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-violet-500 px-1 text-[10px] font-black text-white">
                          {friend.unread > 9 ? '9+' : friend.unread}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {isPage && friends.length > 0 ? (
        <div className="shrink-0 border-t border-white/[0.06] px-2.5 py-1.5">
          <div className="flex h-8 items-center gap-1.5 overflow-x-auto">
            {friends.slice(0, 12).map((f) => (
              <button
                key={`story-${f.uid}`}
                type="button"
                onClick={() => setActiveUid(f.uid)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full p-0"
                title={f.displayName || f.username}
              >
                <Avatar url={f.avatarUrl} name={f.username} size={28} online />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  const threadPane = activeFriend ? (
      <div
        className={`min-h-0 min-w-0 flex-1 flex-col bg-[#0a0a0b] ${
          isPage ? (chatOpen ? 'flex' : 'hidden md:flex') : 'flex'
        }`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-3">
          {isPage ? (
            <button
              type="button"
              onClick={() => setActiveUid(null)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-zinc-300 hover:bg-white/5 md:hidden"
              aria-label="Volver a chats"
            >
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <Link
            to={profileHref(activeFriend.username, activeFriend.uid)}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <Avatar url={activeFriend.avatarUrl} name={activeFriend.username} size={44} />
            <span className="min-w-0">
              <span className="flex items-center gap-1">
                <span className="truncate text-sm font-bold text-white">
                  {activeFriend.displayName || activeFriend.username}
                </span>
                <BadgeCheck size={15} className="shrink-0 fill-violet-500 text-violet-500" />
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={
                    inThisCall && callStatus === 'active'
                      ? 'font-semibold text-cyan-300'
                      : inThisCall
                        ? 'font-semibold text-cyan-200'
                        : online
                          ? 'text-emerald-400'
                          : 'text-zinc-500'
                  }
                >
                  {inThisCall && callStatus === 'active'
                    ? `En llamada · ${formatCallClock(callElapsed)}`
                    : inThisCall
                      ? 'Llamando...'
                      : online
                        ? 'En línea'
                        : 'Desconectado'}
                </span>
                <span className="rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">
                  Creador/a
                </span>
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-0.5">
            {inThisCall ? (
              <button
                type="button"
                onClick={stopCall}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-red-500/20 px-2.5 text-xs font-bold text-red-300"
              >
                <PhoneOff size={14} /> Colgar
              </button>
            ) : (
              <div className="lb-call-header-actions">
                <button
                  type="button"
                  disabled={busy || callStatus !== 'idle'}
                  onClick={() => void startCall(true)}
                  className={`lb-call-header-btn lb-call-header-btn--video${mayCall ? '' : ' is-locked'}`}
                  aria-label="Videollamada"
                  title={mayCall ? 'Videollamada' : 'Las llamadas están disponibles solo entre amigos.'}
                >
                  <Video size={16} />
                </button>
                <button
                  type="button"
                  disabled={busy || callStatus !== 'idle'}
                  onClick={() => void startCall(false)}
                  className={`lb-call-header-btn lb-call-header-btn--voice${mayCall ? '' : ' is-locked'}`}
                  aria-label="Llamada"
                  title={mayCall ? 'Llamada' : 'Las llamadas están disponibles solo entre amigos.'}
                >
                  <Phone size={16} />
                </button>
              </div>
            )}
            <Link
              to={profileHref(activeFriend.username, activeFriend.uid)}
              className="grid h-9 w-9 place-items-center rounded-lg text-zinc-300 hover:bg-white/5"
              aria-label="Info del perfil"
            >
              <Info size={18} />
            </Link>
            <button
              type="button"
              disabled={busy || !chatId}
              onClick={() => void removeConversation()}
              className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-rose-300"
              aria-label="Eliminar conversación"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div id="lb-chat-call-host" className="lb-chat-call-host" />
        <div
          className="chat-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4"
          style={{
            paddingLeft: 'max(1rem, var(--lb-safe-left))',
            paddingRight: 'max(1rem, var(--lb-safe-right))',
          }}
        >
          {messages.length === 0 ? (
            <p className="py-10 text-center text-xs text-zinc-500">Sin mensajes aún. ¡Saluda!</p>
          ) : (
            messages.map((message, index) => {
              const prev = messages[index - 1];
              const showDay = !prev || !sameCalendarDay(prev.createdAt, message.createdAt);
              const isCall = message.mediaType === 'call' || Boolean(message.callMeta);
              const isAudio = message.mediaType === 'audio' && Boolean(message.mediaUrl);
              const isVideo = message.mediaType === 'video' && Boolean(message.mediaUrl);
              const isGif = isAnimatedChatGif(message.mediaUrl, message.mediaType);
              const isFile = message.mediaType === 'file' && Boolean(message.mediaUrl);
              const isGift = Boolean(message.giftId);
              const giftItem = isGift ? findLiveGift(message.giftId) : null;
              const plainText =
                !message.deleted &&
                !isAudio &&
                !isVideo &&
                !isFile &&
                !isGift &&
                message.text &&
                !/^🎤\s*Audio$/i.test(message.text.trim()) &&
                !/^📷\s*Foto$/i.test(message.text.trim()) &&
                !/^🎬\s*Nota de video$/i.test(message.text.trim()) &&
                !/^GIF$/i.test(message.text.trim()) &&
                !/^📎/.test(message.text.trim());
              return (
                <div key={message.id}>
                  {showDay ? (
                    <p className="mb-3 text-center text-[11px] font-medium text-zinc-500">
                      {dayLabel(message.createdAt)}
                    </p>
                  ) : null}
                  {isCall && !message.deleted ? (
                    <div className="relative">
                      <CallEventBubble message={message} />
                      <div className="mt-0.5 flex items-center justify-center gap-2">
                        <span className="text-[10px] text-zinc-600">
                          {formatBubbleTime(message.createdAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setMenuMessageId((id) => (id === message.id ? null : message.id))
                          }
                          className="text-zinc-600 hover:text-zinc-300"
                          aria-label="Opciones"
                        >
                          <MoreHorizontal size={12} />
                        </button>
                      </div>
                      {menuMessageId === message.id ? (
                        <div className="absolute left-1/2 z-20 mt-1 w-44 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-zinc-950 py-1 shadow-xl">
                          <button
                            type="button"
                            onClick={() => void removeMessage(message.id, 'me')}
                            className="flex w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5"
                          >
                            Eliminar para mí
                          </button>
                          {message.mine ? (
                            <button
                              type="button"
                              onClick={() => void removeMessage(message.id, 'everyone')}
                              className="flex w-full px-3 py-2 text-left text-xs text-rose-300 hover:bg-white/5"
                            >
                              Eliminar para todos
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div
                      className={`group relative flex max-w-[min(85%,22rem)] flex-col ${
                        message.mine ? 'ml-auto items-end' : 'mr-auto items-start'
                      }`}
                    >
                      <div
                        className={`break-words ${
                          isVideo
                            ? 'bg-transparent p-0'
                            : `rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                                message.mine
                                  ? 'rounded-br-md bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white'
                                  : 'rounded-bl-md bg-[#1c1d26] text-zinc-100'
                              }`
                        }`}
                      >
                        {message.deleted ? (
                          <p className="rounded-2xl bg-[#1c1d26] px-3.5 py-2.5 italic text-zinc-400">Mensaje eliminado</p>
                        ) : (
                          <>
                            {isVideo && message.mediaUrl ? (
                              <VideoNoteBubble src={message.mediaUrl} mine={message.mine} />
                            ) : null}
                            {message.mediaType === 'image' || isGif ? (
                              message.mediaUrl ? (
                              <button
                                type="button"
                                className="mb-1 block max-w-full"
                                onClick={() =>
                                  setMediaViewer({ url: message.mediaUrl!, gif: isGif })
                                }
                              >
                                <img
                                  src={message.mediaUrl}
                                  alt=""
                                  className={`max-h-48 rounded-lg ${
                                    isGif ? 'object-contain' : 'object-cover'
                                  }`}
                                />
                              </button>
                              ) : null
                            ) : null}
                            {isFile && message.mediaUrl ? (
                              <a
                                href={message.mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mb-1 flex min-w-[12rem] items-center gap-2 rounded-xl bg-black/25 px-2.5 py-2"
                              >
                                <FileText size={18} className="shrink-0 text-cyan-300" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-semibold">
                                    {message.fileName || 'Archivo'}
                                  </span>
                                  <span className="block text-[10px] opacity-70">
                                    {message.fileSize ? formatChatFileSize(message.fileSize) : 'Documento'}
                                  </span>
                                  <span className="mt-0.5 block text-[10px] font-semibold text-cyan-300">
                                    Abrir / descargar
                                  </span>
                                </span>
                              </a>
                            ) : null}
                            {isGift ? (
                              <div className="mb-1 flex min-w-[9rem] flex-col items-center gap-1 py-1">
                                <GiftVisual gift={giftItem} size={56} />
                                <p className="text-xs font-semibold">{giftItem?.name || 'Regalo'}</p>
                                {giftItem ? (
                                  <p className="text-[10px] opacity-80">{giftItem.coins} coins</p>
                                ) : null}
                              </div>
                            ) : null}
                            {isAudio && message.mediaUrl ? (
                              <VoiceNotePlayer src={message.mediaUrl} mine={message.mine} />
                            ) : null}
                            {message.linkUrl ? (
                              <a
                                href={message.linkUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mb-1 block break-all underline opacity-90"
                              >
                                {message.linkUrl}
                              </a>
                            ) : null}
                            {editingId === message.id ? (
                              <div className="mt-1 flex gap-1">
                                <input
                                  value={editDraft}
                                  onChange={(event) => setEditDraft(event.target.value)}
                                  className="min-w-0 flex-1 rounded border border-white/20 bg-black/40 px-2 py-1 text-xs text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => void saveEdit()}
                                  className="rounded bg-white/20 px-2 text-[10px] font-bold"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="rounded px-2 text-[10px] text-zinc-300"
                                >
                                  X
                                </button>
                              </div>
                            ) : plainText ? (
                              <p className="whitespace-pre-wrap">
                                <EmojiText text={message.text || ''} size={CHAT_EMOJI_SIZE} />
                                {message.editedAt ? (
                                  <span className="ml-1 text-[9px] opacity-60">(editado)</span>
                                ) : null}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 px-1">
                        {!message.deleted ? (
                          <span className="relative flex items-center gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                            {message.mine && !isAudio && !isVideo ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(message.id);
                                  setEditDraft(message.text);
                                }}
                                className="text-zinc-500 hover:text-cyan-300"
                                aria-label="Editar"
                              >
                                <Pencil size={11} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() =>
                                setMenuMessageId((id) => (id === message.id ? null : message.id))
                              }
                              className="text-zinc-500 hover:text-rose-300"
                              aria-label="Eliminar"
                            >
                              <Trash2 size={11} />
                            </button>
                            {menuMessageId === message.id ? (
                              <div
                                className={`absolute bottom-5 z-20 w-44 overflow-hidden rounded-xl border border-white/10 bg-zinc-950 py-1 shadow-xl ${
                                  message.mine ? 'right-0' : 'left-0'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => void removeMessage(message.id, 'me')}
                                  className="flex w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5"
                                >
                                  Eliminar para mí
                                </button>
                                {message.mine ? (
                                  <button
                                    type="button"
                                    onClick={() => void removeMessage(message.id, 'everyone')}
                                    className="flex w-full px-3 py-2 text-left text-xs text-rose-300 hover:bg-white/5"
                                  >
                                    Eliminar para todos
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </span>
                        ) : null}
                        <span className="text-[10px] text-zinc-500">
                          {formatBubbleTime(message.createdAt)}
                        </span>
                        {message.mine ? <MessageTicks status={message.status} /> : null}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {pendingImage ? (
          <div className="border-t border-white/[0.06] p-3">
            <img src={pendingImage.url} alt="" className="mx-auto max-h-48 rounded-xl object-contain" />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(pendingImage.url);
                  setPendingImage(null);
                }}
                className="rounded-lg px-3 py-1 text-xs text-zinc-400"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmPendingImage()}
                className="rounded-lg bg-violet-500 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
              >
                {busy ? 'Enviando...' : 'Enviar foto'}
              </button>
            </div>
          </div>
        ) : null}

        {pendingFile ? (
          <div className="border-t border-white/[0.06] px-3 py-2">
            <div className="flex items-center gap-2 rounded-xl border border-violet-400/20 bg-[#12131a] px-3 py-2">
              {pendingFile.kind === 'video' && pendingFile.previewUrl ? (
                <video
                  src={pendingFile.previewUrl}
                  className="h-14 w-14 shrink-0 rounded-lg object-contain bg-black"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <FileText size={18} className="shrink-0 text-cyan-300" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{pendingFile.name}</p>
                <p className="text-[10px] text-zinc-500">
                  {formatChatFileSize(pendingFile.size)} · {pendingFile.kind === 'file' ? 'Archivo' : pendingFile.kind}
                </p>
                {fileUpload?.stage === 'preparing' ? (
                  <p className="text-[10px] text-violet-300">Preparando...</p>
                ) : null}
                {fileUpload?.stage === 'uploading' ? (
                  <p className="text-[10px] text-violet-300">Subiendo {fileUpload.pct}%</p>
                ) : null}
                {fileUpload?.stage === 'sent' ? (
                  <p className="text-[10px] text-emerald-300">Enviado</p>
                ) : null}
                {fileUpload?.stage === 'error' ? (
                  <p className="text-[10px] text-fuchsia-300">No se pudo enviar el archivo. Reintentar</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={removePendingFile}
                disabled={busy && fileUpload?.stage !== 'error'}
                className="grid h-11 w-11 place-items-center rounded-full text-zinc-500 hover:text-white disabled:opacity-40"
                aria-label="Quitar archivo"
              >
                <X size={14} />
              </button>
              <button
                type="button"
                disabled={busy && fileUpload?.stage !== 'error'}
                onClick={() => void confirmPendingFile()}
                className="min-h-11 rounded-lg bg-violet-500 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
              >
                {fileUpload?.stage === 'preparing'
                  ? 'Preparando...'
                  : fileUpload?.stage === 'uploading'
                    ? `Subiendo ${fileUpload.pct}%`
                    : fileUpload?.stage === 'sent'
                      ? 'Enviado'
                      : fileUpload?.stage === 'error'
                        ? 'Reintentar'
                        : 'Enviar'}
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="px-4 text-[11px] text-fuchsia-300">{error}</p> : null}

        <div
          className="lb-chat-composer flex min-w-0 shrink-0 flex-wrap items-end gap-1.5 overflow-x-hidden border-t border-white/[0.06] px-3 py-2.5"
          style={{
            paddingBottom: isPage ? '0.65rem' : 'max(0.65rem, var(--lb-safe-bottom))',
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void onPickFile(event.target.files?.[0] || null, 'image');
              event.target.value = '';
            }}
          />
          <input
            ref={attachFileRef}
            type="file"
            accept={CHAT_FILE_ACCEPT}
            className="hidden"
            onChange={(event) => {
              onPickAttachment(event.target.files?.[0] || null);
              event.target.value = '';
            }}
          />
          {recording ? (
            <ChatVoiceRecorderBar
              elapsedSec={recordElapsed}
              levels={recordLevels}
              sending={busy}
              onCancel={cancelAudioRecording}
              onSend={stopAudioRecording}
            />
          ) : (
            <>
          <div className="flex shrink-0 items-center gap-0.5">
          <div className="relative shrink-0">
            <button
              ref={attachBtnRef}
              type="button"
              onClick={() => setAttachOpen((v) => !v)}
              className={`lb-chat-composer-btn ${attachOpen ? 'is-on' : ''}`}
              aria-label="Adjuntar"
              aria-haspopup="menu"
              aria-expanded={attachOpen}
              aria-controls="lb-chat-attach-menu"
            >
              <Paperclip size={18} />
            </button>
            <ChatAttachMenu
              open={attachOpen}
              anchorRef={attachBtnRef}
              onClose={() => setAttachOpen(false)}
              onGallery={() => fileRef.current?.click()}
              onCamera={() => setCameraOpen(true)}
              onVideoNote={() => setVideoNoteOpen(true)}
              onFile={() => attachFileRef.current?.click()}
            />
          </div>
          <EmojiPickerButton
            placement="above"
            className="shrink-0"
            buttonClassName="lb-chat-composer-btn"
            onPick={(id) => setDraft((d) => insertEmojiToken(d, id))}
          />
          <button
            type="button"
            className={`lb-chat-composer-btn ${gifOpen ? 'is-on' : ''}`}
            onClick={() => setGifOpen(true)}
            aria-label="GIF"
          >
            <span className="text-[10px] font-black tracking-wide">GIF</span>
          </button>
          <button
            ref={giftTriggerRef}
            type="button"
            className={`lb-chat-composer-btn ${giftsOpen ? 'is-on' : ''}`}
            onClick={() => {
              setGiftsOpen((value) => !value);
              setGiftError(null);
              setRechargeNeeded(null);
            }}
            aria-label="Regalos"
          >
            <Gift size={18} />
          </button>
          </div>
          <form
            className="flex min-w-[10rem] flex-1 items-end gap-1 rounded-full border border-white/[0.08] bg-[#12131a] px-3 py-1.5 transition focus-within:border-violet-400/40 focus-within:shadow-[0_0_14px_rgba(139,92,246,0.18)]"
            onSubmit={(event) => {
              event.preventDefault();
              const link = detectLink(draft);
              void send(draft, link ? { linkUrl: link } : undefined);
            }}
          >
            <EmojiInput
              value={draft}
              onChange={setDraft}
              placeholder="Escribe un mensaje..."
              emojiSize={CHAT_EMOJI_SIZE}
              fieldClassName="min-w-0 flex-1"
              padClassName="py-1.5"
              mirrorTextClassName="text-white"
            />
            {draft.trim() ? (
              <button
                type="submit"
                disabled={busy}
                className="lb-chat-composer-send"
                aria-label="Enviar"
              >
                <Send size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void toggleVoice()}
                disabled={busy}
                className="lb-chat-composer-send"
                aria-label="Audio"
              >
                <Mic size={16} />
              </button>
            )}
          </form>
            </>
          )}
        </div>
        </div>
      </div>
    ) : isPage ? (
      <div className="hidden min-h-0 flex-1 place-items-center bg-[#0a0a0b] text-sm text-zinc-500 md:grid">
        Selecciona una conversación
      </div>
    ) : (
      <p className="grid flex-1 place-items-center p-4 text-xs text-zinc-500">
        Selecciona un amigo para chatear.
      </p>
    );

  const chatExtras = (
    <>
      <VideoNoteCapture
        open={videoNoteOpen}
        onClose={() => setVideoNoteOpen(false)}
        onCapture={(file) => void sendVideoNote(file)}
      />
      <FlashBoomCameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        title="Abrir cámara"
        allowPhoto
        defaultMode="photo"
        maxDurationSec={180}
        onCapture={(file) => {
          setCameraOpen(false);
          if (file.type.startsWith('image/')) {
            void onPickFile(file, 'image');
            return;
          }
          onPickAttachment(file);
        }}
      />
      <GifPickerSheet
        open={gifOpen}
        onClose={() => setGifOpen(false)}
        onPick={(gif) => void sendGifMessage(gif)}
      />
      <StickerPickerSheet
        open={stickerOpen}
        onClose={() => setStickerOpen(false)}
        onPick={(sticker) => void sendStickerMessage(sticker)}
      />
      {giftsOpen ? (
        <GiftCatalogLayer open={giftsOpen} triggerRef={giftTriggerRef} onClose={() => setGiftsOpen(false)}>
          <GiftBoxStrip
            gifts={giftCatalog}
            sendingGiftId={sendingGift}
            coins={coins}
            error={giftError}
            rechargeNeeded={rechargeNeeded}
            onRecharge={() => {
              setRechargeOpen(true);
              openRechargeCoins();
            }}
            compact
            floating
            onSelect={(id) => void sendGiftMessage(id)}
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
      {giftFloats.length > 0 && typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[112] overflow-hidden">
              {giftFloats.map((item) => (
                <FloatingGift
                  key={item.id}
                  giftId={item.giftId}
                  senderName={item.senderName}
                  left={item.left}
                  lite
                  onComplete={() =>
                    setGiftFloats((current) => current.filter((row) => row.id !== item.id))
                  }
                />
              ))}
            </div>,
            document.body,
          )
        : null}
      {mediaViewer && typeof document !== 'undefined'
        ? createPortal(
            <button
              type="button"
              className="fixed inset-0 z-[130] grid place-items-center bg-black/85 p-4"
              onClick={() => setMediaViewer(null)}
              aria-label="Cerrar"
            >
              <img
                src={mediaViewer.url}
                alt=""
                className="max-h-[90dvh] max-w-[min(100%,90vw)] object-contain"
              />
            </button>,
            document.body,
          )
        : null}
    </>
  );

  if (!isPage) {
    return (
      <>
        <section className="flex min-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
          <div className="flex items-center justify-between gap-2 p-4 pb-2">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
              <MessageCircle size={16} className="text-cyan-300" />
              Chat privado
              {totalUnread > 0 ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-fuchsia-500 px-1.5 text-[10px] font-black">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              ) : null}
            </span>
          </div>
          <div className="grid min-h-0 flex-1 md:grid-cols-[12rem_minmax(0,1fr)]">
            {listPane}
            {threadPane}
          </div>
        </section>
        {chatExtras}
      </>
    );
  }

  return (
    <>
      <section className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-[#0a0a0b] pb-[calc(var(--lb-bottom-nav-h)+var(--lb-safe-bottom))] lg:pb-0">
        {listPane}
        {threadPane}
      </section>
      {chatExtras}
    </>
  );
}
