import { MessageCircle, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

type Conversation = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastAt: string | null;
};

type ChatMessage = {
  id: string;
  text: string;
  mine: boolean;
  createdAt: string;
};

type Props = {
  compact?: boolean;
};

export function InternalChatPanel({ compact = false }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api<{ conversations: Conversation[] }>('/api/messages/conversations')
      .then((data) => {
        const list = data.conversations || [];
        setConversations(list);
        if (!compact && list.length > 0) {
          const first = list[0];
          if (first) setActive((current) => current ?? first.username);
        }
      })
      .catch(() => undefined);
  }, [compact]);

  useEffect(() => {
    if (!active) {
      setMessages([]);
      return;
    }
    void api<{ messages: ChatMessage[] }>(`/api/messages/${encodeURIComponent(active)}`)
      .then((data) => setMessages(data.messages || []))
      .catch(() => setMessages([]));
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, active]);

  async function send() {
    const text = draft.trim();
    if (!active || !text || busy) return;
    setBusy(true);
    try {
      const data = await api<{ message: ChatMessage }>(
        `/api/messages/${encodeURIComponent(active)}`,
        { method: 'POST', body: JSON.stringify({ text }) },
      );
      setMessages((current) => [...current, { ...data.message, mine: true }]);
      setDraft('');
      setConversations((current) =>
        current.map((item) =>
          item.username === active
            ? { ...item, lastMessage: text, lastAt: data.message.createdAt }
            : item,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const activeFriend = conversations.find((item) => item.username === active);

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
      <p className="mt-1 text-xs text-zinc-500">Mensajes privados solo con tus amigos.</p>

      {conversations.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-white/10 bg-zinc-950/60 px-3 py-4 text-center text-xs text-zinc-500">
          Aún no tienes amigos con chat. Acepta solicitudes o envía una para empezar a conversar.
        </p>
      ) : (
        <div className={`mt-3 grid gap-3 ${compact ? '' : 'md:grid-cols-[9rem_minmax(0,1fr)]'}`}>
          <ul className={`space-y-1 ${compact ? 'max-h-28 overflow-y-auto' : 'max-h-72 overflow-y-auto'}`}>
            {conversations.map((friend) => (
              <li key={friend.username}>
                <button
                  type="button"
                  onClick={() => setActive(friend.username)}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs transition ${
                    active === friend.username
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
