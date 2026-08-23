import { MessageCircle, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { playMessageAlert } from '../../lib/alertSound';
import {
  ensureChat,
  listenConversations,
  listenFriends,
  listenMessages,
  sendChatMessage,
  type ChatMessage,
  type Conversation,
  type FriendChip,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';

type Props = {
  compact?: boolean;
};

export function InternalChatPanel({ compact = false }: Props) {
  const profile = useAuthStore((state) => state.profile);
  const [friends, setFriends] = useState<FriendChip[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMsgCount = useRef(0);

  useEffect(() => {
    if (!profile) return;
    return listenFriends(profile.firebaseUid, setFriends);
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile) return;
    return listenConversations(profile.firebaseUid, setConversations);
  }, [profile?.firebaseUid]);

  const people = useMemo(() => {
    const map = new Map<string, FriendChip & { lastMessage?: string | null; lastAt?: string | null }>();
    for (const friend of friends) {
      map.set(friend.uid, friend);
    }
    for (const chat of conversations) {
      map.set(chat.uid, {
        uid: chat.uid,
        username: chat.username,
        displayName: chat.displayName,
        avatarUrl: chat.avatarUrl,
        lastMessage: chat.lastMessage,
        lastAt: chat.lastAt,
      });
    }
    return [...map.values()].sort((a, b) =>
      String(b.lastAt || '').localeCompare(String(a.lastAt || '')),
    );
  }, [friends, conversations]);

  useEffect(() => {
    if (!compact && people.length > 0 && !activeUid) {
      const first = people[0];
      if (first) setActiveUid(first.uid);
    }
  }, [people, compact, activeUid]);

  const activeFriend = people.find((item) => item.uid === activeUid) || null;

  useEffect(() => {
    if (!profile || !activeFriend) {
      setChatId(null);
      setMessages([]);
      return;
    }
    let unsub: (() => void) | undefined;
    void ensureChat(
      {
        firebaseUid: profile.firebaseUid,
        handle: profile.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      },
      activeFriend,
    ).then((id) => {
      setChatId(id);
      lastMsgCount.current = 0;
      unsub = listenMessages(id, profile.firebaseUid, (list) => {
        if (list.length > lastMsgCount.current && lastMsgCount.current > 0) {
          const newest = list[list.length - 1];
          if (newest && !newest.mine) playMessageAlert();
        }
        lastMsgCount.current = list.length;
        setMessages(list);
      });
    });
    return () => unsub?.();
  }, [profile?.firebaseUid, activeFriend?.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeUid]);

  async function send() {
    const text = draft.trim();
    if (!profile || !activeFriend || !text || busy) return;
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
      );
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar');
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    return (
      <section className="rounded-2xl border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-400">
        Inicia sesión para chatear.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
          <MessageCircle size={16} className="text-cyan-300" />
          Chat interno
        </span>
        {compact ? (
          <Link to="/mensajes" className="text-xs font-medium text-cyan-400 hover:underline">
            Abrir chat completo
          </Link>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500">Mensajes en tiempo real con tus amigos.</p>

      {people.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-white/10 bg-zinc-950/60 px-3 py-4 text-center text-xs text-zinc-500">
          Aún no tienes amigos. Acepta una solicitud para empezar a chatear.
        </p>
      ) : (
        <div className={`mt-3 grid gap-3 ${compact ? '' : 'md:grid-cols-[9rem_minmax(0,1fr)]'}`}>
          <ul className={`space-y-1 ${compact ? 'max-h-28 overflow-y-auto' : 'max-h-72 overflow-y-auto'}`}>
            {people.map((friend) => (
              <li key={friend.uid}>
                <button
                  type="button"
                  onClick={() => setActiveUid(friend.uid)}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs transition ${
                    activeUid === friend.uid
                      ? 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/30'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-7 w-7 place-items-center rounded-full bg-zinc-800 text-[10px] font-bold text-cyan-300">
                      {friend.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="min-w-0 truncate font-semibold">@{friend.username}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex min-h-[12rem] flex-col rounded-xl border border-white/10 bg-zinc-950/80">
            {activeFriend ? (
              <>
                <div className="border-b border-white/10 px-3 py-2 text-xs font-semibold text-white">
                  Chat con @{activeFriend.username}
                  {chatId ? <span className="ml-2 text-[10px] font-normal text-emerald-400">en vivo</span> : null}
                </div>
                <div className={`flex-1 space-y-2 overflow-y-auto p-3 ${compact ? 'max-h-40' : 'max-h-64'}`}>
                  {messages.length === 0 ? (
                    <p className="text-center text-xs text-zinc-500">Sin mensajes aún. ¡Saluda!</p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                          message.mine
                            ? 'ml-auto bg-cyan-500/20 text-cyan-100'
                            : 'bg-zinc-800 text-zinc-200'
                        }`}
                      >
                        {message.text}
                      </div>
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>
                {error ? <p className="px-3 text-[11px] text-fuchsia-300">{error}</p> : null}
                <form
                  className="flex items-center gap-2 border-t border-white/10 p-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send();
                  }}
                >
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Escribe un mensaje…"
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
