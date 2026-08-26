import {
  Check,
  CheckCheck,
  Image as ImageIcon,
  Link2,
  MessageCircle,
  Mic,
  Pencil,
  Phone,
  PhoneOff,
  Send,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { playMessageAlert } from '../../lib/alertSound';
import { api } from '../../lib/api';
import { uploadChatMedia } from '../../lib/storage';
import {
  callRoomName,
  deleteChatMessage,
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
  fullscreen?: boolean;
};

function detectLink(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export function InternalChatPanel({ compact = false, fullscreen = false }: Props) {
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
  const [online, setOnline] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; url: string } | null>(null);
  const callStatus = useCallStore((state) => state.status);
  const callChatId = useCallStore((state) => state.chatId);
  const beginOutgoing = useCallStore((state) => state.beginOutgoing);
  const hangup = useCallStore((state) => state.hangup);
  const [recording, setRecording] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMsgCount = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    if (!profile) return;
    return listenFriends(profile.firebaseUid, setFriends);
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile) return;
    return listenConversations(profile.firebaseUid, setConversations);
  }, [profile?.firebaseUid]);

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
        };
      })
      .sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
  }, [friends, conversations]);

  useEffect(() => {
    if (!compact && people.length > 0 && !activeUid) {
      const first = people[0];
      if (first) setActiveUid(first.uid);
    }
  }, [people, compact, activeUid]);

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
            if (newest && !newest.mine) playMessageAlert();
          }
          lastMsgCount.current = list.length;
          setMessages(list);
          void markMessagesDelivered(id, profile.firebaseUid, list);
          void markMessagesRead(id, profile.firebaseUid, list);
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeUid]);

  async function send(
    text: string,
    extras?: {
      mediaUrl?: string | null;
      mediaType?: 'image' | 'audio' | 'file' | null;
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

  async function removeMessage(messageId: string) {
    if (!chatId) return;
    if (!window.confirm('¿Eliminar este mensaje?')) return;
    try {
      await deleteChatMessage(chatId, messageId);
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
      return <CheckCheck size={12} className="text-sky-400" aria-label="Leído" />;
    }
    if (status === 'delivered') {
      return <CheckCheck size={12} className="text-zinc-400" aria-label="Entregado" />;
    }
    return <Check size={12} className="text-zinc-500" aria-label="Enviado" />;
  }

  async function toggleVoice() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `nota-${Date.now()}.webm`, { type: mimeType });
        void onPickFile(file, 'audio');
      };
      recorderRef.current = recorder;
      recorder.start();
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
      await startPrivateCall(
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

  const shellClass = fullscreen
    ? 'fixed inset-0 z-40 flex flex-col bg-zinc-950'
    : compact
      ? 'rounded-2xl border border-white/10 bg-zinc-900 p-4'
      : 'flex min-h-[70dvh] flex-col rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden';

  return (
    <section className={shellClass}>
      <div className={`flex items-center justify-between gap-2 ${fullscreen ? 'border-b border-white/10 px-4 py-3' : 'p-4 pb-2'}`}>
        <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
          <MessageCircle size={16} className="text-cyan-300" />
          Chat privado
        </span>
        <div className="flex items-center gap-2">
          {compact ? (
            <Link to="/mensajes" className="text-xs font-medium text-cyan-400 hover:underline">
              Abrir completo
            </Link>
          ) : null}
          {fullscreen ? (
            <Link to="/" className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-white">
              <X size={16} />
            </Link>
          ) : null}
        </div>
      </div>
      <p className={`text-xs text-zinc-500 ${fullscreen ? 'px-4' : 'px-4'}`}>
        Solo amigos · texto, fotos, audios, enlaces y llamadas.
      </p>

      {people.length === 0 ? (
        <p className="m-4 rounded-xl border border-dashed border-white/10 bg-zinc-950/60 px-3 py-4 text-center text-xs text-zinc-500">
          Aún no tienes amigos. Acepta una solicitud para empezar a chatear.
        </p>
      ) : (
        <div
          className={`mt-2 grid min-h-0 flex-1 gap-0 ${
            fullscreen || !compact ? 'md:grid-cols-[12rem_minmax(0,1fr)]' : ''
          }`}
        >
          <ul
            className={`space-y-1 overflow-y-auto border-white/10 px-2 ${
              fullscreen ? 'max-h-none border-r py-2' : compact ? 'max-h-28' : 'max-h-72 border-r py-2'
            }`}
          >
            {people.map((friend) => (
              <li key={friend.uid} className="flex items-center gap-1">
                <Link
                  to={profileHref(friend.username, friend.uid)}
                  className="shrink-0"
                  title={`Ver perfil de @${friend.username}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10 hover:ring-cyan-400" />
                  ) : (
                    <div className="grid h-7 w-7 place-items-center rounded-full bg-zinc-800 text-[10px] font-bold text-cyan-300 hover:ring-1 hover:ring-cyan-400">
                      {friend.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => setActiveUid(friend.uid)}
                  className={`min-w-0 flex-1 rounded-xl px-2 py-2 text-left text-xs transition ${
                    activeUid === friend.uid
                      ? 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/30'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className="block truncate font-semibold">@{friend.username}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex min-h-0 flex-1 flex-col bg-zinc-950/50">
            {activeFriend ? (
              <>
                <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                  <Link
                    to={profileHref(activeFriend.username, activeFriend.uid)}
                    className="text-xs font-semibold text-white hover:text-cyan-300"
                  >
                    @{activeFriend.username}
                    <span className={`ml-2 text-[10px] font-normal ${online ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {online ? 'en linea' : 'desconectado'}
                    </span>
                  </Link>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={busy || !chatId}
                      onClick={() => void removeConversation()}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-[10px] font-bold text-zinc-400 hover:text-rose-300"
                      title="Eliminar conversación"
                    >
                      <Trash2 size={12} />
                    </button>
                    {inThisCall ? (
                      <button
                        type="button"
                        onClick={stopCall}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-500/20 px-2 py-1 text-[10px] font-bold text-red-300"
                      >
                        <PhoneOff size={12} /> Colgar
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={busy || callStatus !== 'idle'}
                          onClick={() => void startCall(false)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300"
                        >
                          <Phone size={12} /> Llamar
                        </button>
                        <button
                          type="button"
                          disabled={busy || callStatus !== 'idle'}
                          onClick={() => void startCall(true)}
                          className="inline-flex items-center gap-1 rounded-lg bg-cyan-500/15 px-2 py-1 text-[10px] font-bold text-cyan-300"
                        >
                          <Video size={12} /> Video
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className={`flex-1 space-y-2 overflow-y-auto p-3 ${compact ? 'max-h-40' : 'min-h-[12rem]'}`}>
                  {messages.length === 0 ? (
                    <p className="text-center text-xs text-zinc-500">Sin mensajes aún. ¡Saluda!</p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`group relative max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                          message.mine ? 'ml-auto bg-cyan-500/20 text-cyan-100' : 'bg-zinc-800 text-zinc-200'
                        }`}
                      >
                        {message.deleted ? (
                          <p className="italic text-zinc-500">Mensaje eliminado</p>
                        ) : (
                          <>
                            {message.mediaType === 'image' && message.mediaUrl ? (
                              <a href={message.mediaUrl} target="_blank" rel="noreferrer">
                                <img
                                  src={message.mediaUrl}
                                  alt=""
                                  className="mb-1 max-h-48 rounded-lg object-cover"
                                />
                              </a>
                            ) : null}
                            {message.mediaType === 'audio' && message.mediaUrl ? (
                              <audio src={message.mediaUrl} controls className="mb-1 w-full max-w-xs" />
                            ) : null}
                            {message.linkUrl ? (
                              <a
                                href={message.linkUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mb-1 block break-all text-cyan-300 underline"
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
                                  className="rounded bg-cyan-500 px-2 text-[10px] font-bold text-zinc-950"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="rounded px-2 text-[10px] text-zinc-400"
                                >
                                  X
                                </button>
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap">
                                {message.text}
                                {message.editedAt ? (
                                  <span className="ml-1 text-[9px] text-zinc-500">(editado)</span>
                                ) : null}
                              </p>
                            )}
                          </>
                        )}
                        <div className="mt-1 flex items-center justify-end gap-2">
                          {message.mine && !message.deleted ? (
                            <span className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(message.id);
                                  setEditDraft(message.text);
                                }}
                                className="text-zinc-400 hover:text-cyan-300"
                                aria-label="Editar"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void removeMessage(message.id)}
                                className="text-zinc-400 hover:text-rose-300"
                                aria-label="Eliminar"
                              >
                                <Trash2 size={11} />
                              </button>
                            </span>
                          ) : null}
                          {message.mine ? <MessageTicks status={message.status} /> : null}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>
                {pendingImage ? (
                  <div className="border-t border-white/10 p-3">
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
                        className="rounded-lg bg-cyan-500 px-3 py-1 text-xs font-bold text-zinc-950"
                      >
                        Enviar foto
                      </button>
                    </div>
                  </div>
                ) : null}
                {error ? <p className="px-3 text-[11px] text-fuchsia-300">{error}</p> : null}
                <div className="flex flex-wrap items-center gap-1 border-t border-white/10 p-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void onPickFile(event.target.files?.[0] || null, 'image')}
                  />
                  <input
                    ref={audioRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(event) => void onPickFile(event.target.files?.[0] || null, 'audio')}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-cyan-300"
                    aria-label="Foto"
                  >
                    <ImageIcon size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleVoice()}
                    className={`grid h-9 w-9 place-items-center rounded-lg hover:bg-white/5 ${
                      recording ? 'bg-red-500/20 text-red-300' : 'text-zinc-400 hover:text-cyan-300'
                    }`}
                    aria-label="Audio"
                  >
                    <Mic size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const url = window.prompt('Pega un enlace (https://…)');
                      if (url?.trim()) void send('🔗 Enlace', { linkUrl: url.trim() });
                    }}
                    className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-cyan-300"
                    aria-label="Enlace"
                  >
                    <Link2 size={16} />
                  </button>
                  <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const link = detectLink(draft);
                      void send(draft, link ? { linkUrl: link } : undefined);
                    }}
                  >
                    <input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Mensaje, enlace…"
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-500"
                    />
                    <button
                      type="submit"
                      disabled={busy || !draft.trim()}
                      className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-500 text-zinc-950 disabled:opacity-40"
                      aria-label="Enviar"
                    >
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <p className="grid flex-1 place-items-center p-4 text-xs text-zinc-500">
                Selecciona un amigo para chatear.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
