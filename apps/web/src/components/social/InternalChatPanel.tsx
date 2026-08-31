import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Check,
  CheckCheck,
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
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmojiPickerButton } from './EmojiPicker';
import { VideoNoteBubble, VideoNoteCapture } from './ChatVideoNote';
import { EmojiInput } from './EmojiInput';
import { EmojiText } from './EmojiText';
import { insertEmojiToken, CHAT_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import { playIncomingMessageSound, playMessagePop } from '../../lib/alertSound';
import { api } from '../../lib/api';
import { listenMyGroups, type LiveGroup } from '../../lib/groupsFirestore';
import { uploadChatMedia } from '../../lib/storage';
import {
  callRoomName,
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
import { useCallStore } from '../../store/callStore';
import { profileHref } from '../../lib/profileFirestore';

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
  const callStatus = useCallStore((state) => state.status);
  const callChatId = useCallStore((state) => state.chatId);
  const beginOutgoing = useCallStore((state) => state.beginOutgoing);
  const hangup = useCallStore((state) => state.hangup);
  const [recording, setRecording] = useState(false);
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const attachWrapRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

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
    if (!attachOpen) return;
    function onDoc(event: MouseEvent) {
      if (!attachWrapRef.current?.contains(event.target as Node)) setAttachOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [attachOpen]);

  async function send(
    text: string,
    extras?: {
      mediaUrl?: string | null;
      mediaType?: 'image' | 'audio' | 'video' | 'file' | null;
      linkUrl?: string | null;
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

  async function toggleVoice() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
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
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
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
      recorder.start(250);
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo grabar audio');
    }
  }

  async function startCall(withVideo = false) {
    if (!chatId || !activeFriend || !profile) return;
    setBusy(true);
    setError(null);
    try {
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
      );
      const session = await api<{ token: string; serverUrl: string }>(
        `/api/stream/token/${encodeURIComponent(callRoomName(chatId))}`,
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
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la llamada');
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
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-xs ${
                          friend.unread > 0 ? 'font-medium text-zinc-300' : 'text-zinc-500'
                        }`}
                      >
                        {friend.lastMessage || `@${friend.username}`}
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
                <span className={online ? 'text-emerald-400' : 'text-zinc-500'}>
                  {online ? 'En línea' : 'Desconectado'}
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
              <>
                <button
                  type="button"
                  disabled={busy || callStatus !== 'idle'}
                  onClick={() => void startCall(true)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-zinc-300 hover:bg-white/5"
                  aria-label="Videollamada"
                >
                  <Video size={18} />
                </button>
                <button
                  type="button"
                  disabled={busy || callStatus !== 'idle'}
                  onClick={() => void startCall(false)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-zinc-300 hover:bg-white/5"
                  aria-label="Llamar"
                >
                  <Phone size={18} />
                </button>
              </>
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
              const plainText =
                !message.deleted &&
                !isAudio &&
                !isVideo &&
                message.text &&
                !/^🎤\s*Audio$/i.test(message.text.trim()) &&
                !/^📷\s*Foto$/i.test(message.text.trim()) &&
                !/^🎬\s*Nota de video$/i.test(message.text.trim());
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
                            {message.mediaType === 'image' && message.mediaUrl ? (
                              <a href={message.mediaUrl} target="_blank" rel="noreferrer">
                                <img
                                  src={message.mediaUrl}
                                  alt=""
                                  className="mb-1 max-h-48 rounded-lg object-cover"
                                />
                              </a>
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
                className="rounded-lg bg-violet-500 px-3 py-1 text-xs font-bold text-white"
              >
                Enviar foto
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="px-4 text-[11px] text-fuchsia-300">{error}</p> : null}

        <div
          className="flex shrink-0 items-center gap-2 border-t border-white/[0.06] px-3 py-2.5"
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
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              void onPickFile(event.target.files?.[0] || null, 'image');
              event.target.value = '';
            }}
          />
          <div ref={attachWrapRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setAttachOpen((v) => !v)}
              className={`grid h-10 w-10 place-items-center rounded-xl transition ${
                attachOpen ? 'bg-white/10 text-cyan-300' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
              aria-label="Adjuntar"
              aria-expanded={attachOpen}
            >
              <Paperclip size={18} />
            </button>
            {attachOpen ? (
              <div className="absolute bottom-full left-0 z-30 mb-2 w-44 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 py-1 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    fileRef.current?.click();
                    setAttachOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs text-zinc-200 hover:bg-white/5"
                >
                  <ImageIcon size={16} className="text-violet-300" />
                  Galería
                </button>
                <button
                  type="button"
                  onClick={() => {
                    cameraRef.current?.click();
                    setAttachOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs text-zinc-200 hover:bg-white/5"
                >
                  <Camera size={16} className="text-cyan-300" />
                  Tomar foto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVideoNoteOpen(true);
                    setAttachOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs text-zinc-200 hover:bg-white/5"
                >
                  <Video size={16} className="text-fuchsia-300" />
                  Nota de video
                </button>
              </div>
            ) : null}
          </div>
          <form
            className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-white/[0.08] bg-[#12131a] px-3 py-1.5"
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
            <EmojiPickerButton
              placement="above"
              onPick={(id) => setDraft((d) => insertEmojiToken(d, id))}
            />
            {draft.trim() ? (
              <button
                type="submit"
                disabled={busy}
                className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white disabled:opacity-40"
                aria-label="Enviar"
              >
                <Send size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void toggleVoice()}
                className={`grid h-9 w-9 place-items-center rounded-full ${
                  recording
                    ? 'bg-red-500/30 text-red-300'
                    : 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white'
                }`}
                aria-label="Audio"
              >
                <Mic size={16} />
              </button>
            )}
          </form>
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
        <VideoNoteCapture
          open={videoNoteOpen}
          onClose={() => setVideoNoteOpen(false)}
          onCapture={(file) => void sendVideoNote(file)}
        />
      </>
    );
  }

  return (
    <>
      <section className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-[#0a0a0b] pb-[calc(var(--lb-bottom-nav-h)+var(--lb-safe-bottom))] lg:pb-0">
        {listPane}
        {threadPane}
      </section>
      <VideoNoteCapture
        open={videoNoteOpen}
        onClose={() => setVideoNoteOpen(false)}
        onCapture={(file) => void sendVideoNote(file)}
      />
    </>
  );
}
