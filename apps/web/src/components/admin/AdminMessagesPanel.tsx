import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, RefreshCw, Search } from 'lucide-react';
import {
  chatParticipantLabel,
  fetchAdminChatMessages,
  fetchAdminChatsPage,
  type AdminChatMessage,
  type AdminChatRow,
} from '../../admin/api';

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function AdminMessagesPanel() {
  const [chats, setChats] = useState<AdminChatRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const chatsGen = useRef(0);
  const msgsGen = useRef(0);

  const loadChats = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null; q?: string }) => {
      const gen = ++chatsGen.current;
      const append = Boolean(opts?.append);
      if (append) setLoadingMore(true);
      else setLoadingChats(true);
      setError(null);
      try {
        const page = await fetchAdminChatsPage({ q: opts?.q, cursor: opts?.cursor || null });
        if (gen !== chatsGen.current) return;
        setChats((prev) => (append ? [...prev, ...page.chats] : page.chats));
        setNextCursor(page.nextCursor || null);
        setSelectedId((current) => {
          if (current && !(append ? true : page.chats.some((c) => c.chatId === current))) {
            setMessages([]);
            return null;
          }
          return current;
        });
      } catch (err) {
        if (gen !== chatsGen.current) return;
        setError(err instanceof Error ? err.message : 'No se pudieron cargar chats');
      } finally {
        if (gen === chatsGen.current) {
          setLoadingChats(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadChats({ q: qApplied });
  }, [loadChats, qApplied]);

  const selected = useMemo(
    () => chats.find((c) => c.chatId === selectedId) ?? null,
    [chats, selectedId],
  );

  async function openChat(chatId: string) {
    const gen = ++msgsGen.current;
    setSelectedId(chatId);
    setLoadingMsgs(true);
    setError(null);
    try {
      const page = await fetchAdminChatMessages(chatId);
      if (gen !== msgsGen.current) return;
      setMessages(page.messages);
    } catch (err) {
      if (gen !== msgsGen.current) return;
      setError(err instanceof Error ? err.message : 'No se pudieron cargar mensajes');
      setMessages([]);
    } finally {
      if (gen === msgsGen.current) setLoadingMsgs(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="lb-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <MessageSquare size={18} className="text-fuchsia-300" />
            Mensajes privados
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {chats.length} conversaciones en esta página · lectura autorizada
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadChats({ q: qApplied })}
          disabled={loadingChats}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loadingChats ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <form
        className="lb-panel relative flex gap-2 rounded-2xl p-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQApplied(q.trim());
        }}
      >
        <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar esta página por usuario o texto…"
          className="min-h-11 w-full rounded-xl border border-transparent bg-transparent py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
        />
        <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-fuchsia-500/20 px-4 text-sm font-semibold text-fuchsia-100">
          Buscar
        </button>
      </form>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <ul className="lb-panel max-h-[70dvh] space-y-1 overflow-y-auto rounded-2xl p-2">
          {loadingChats && chats.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-zinc-500">Cargando chats…</li>
          ) : chats.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-zinc-500">Sin conversaciones</li>
          ) : (
            chats.map((c) => {
              const a = c.participants[0] || '';
              const b = c.participants[1] || '';
              const label = `${chatParticipantLabel(c, a)} ↔ ${chatParticipantLabel(c, b)}`;
              return (
                <li key={c.chatId}>
                  <button
                    type="button"
                    onClick={() => void openChat(c.chatId)}
                    className={`min-h-11 w-full rounded-xl px-3 py-2.5 text-left transition ${
                      selectedId === c.chatId
                        ? 'bg-fuchsia-500/20 text-fuchsia-100'
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <span className="block truncate text-xs font-semibold">{label}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
                      {c.lastMessage || '—'} · {formatWhen(c.lastAt)}
                    </span>
                  </button>
                </li>
              );
            })
          )}
          {nextCursor ? (
            <li>
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadChats({ append: true, cursor: nextCursor, q: qApplied })}
                className="min-h-11 w-full text-sm text-cyan-300 disabled:opacity-50"
              >
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </button>
            </li>
          ) : null}
        </ul>

        <div className="lb-panel flex max-h-[70dvh] flex-col rounded-2xl">
          {!selected ? (
            <p className="grid flex-1 place-items-center p-8 text-sm text-zinc-500">
              Elige un chat para ver los mensajes
            </p>
          ) : (
            <>
              <div className="border-b border-white/5 px-4 py-3">
                <p className="text-sm font-semibold text-white">
                  {selected.participants.map((uid) => chatParticipantLabel(selected, uid)).join(' ↔ ')}
                </p>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                  {selected.participants.map((uid) => {
                    const uname = selected.profiles[uid]?.username || '';
                    return (
                      <Link key={uid} to={`/u/${encodeURIComponent(uname || 'user')}?uid=${encodeURIComponent(uid)}`} className="min-h-11 text-cyan-400 hover:underline">
                        @{uname || uid.slice(0, 8)}
                      </Link>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {loadingMsgs ? (
                  <p className="py-8 text-center text-sm text-zinc-500">Cargando mensajes…</p>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500">Sin mensajes</p>
                ) : (
                  messages.map((m) => {
                    const fromName = selected ? chatParticipantLabel(selected, m.fromUid) : m.fromUid.slice(0, 8);
                    return (
                      <div
                        key={m.id}
                        className={`rounded-xl px-3 py-2 text-sm ${
                          m.deleted ? 'bg-zinc-900/50 text-zinc-500 italic' : 'bg-zinc-800/80 text-zinc-100'
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                          <span className="font-semibold text-cyan-300/90">{fromName}</span>
                          <span>{formatWhen(m.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words">{m.text || '—'}</p>
                        {m.mediaUrl ? (
                          <a
                            href={m.mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block min-h-11 text-[11px] text-fuchsia-300 hover:underline"
                          >
                            Ver adjunto ({m.mediaType || 'media'})
                          </a>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
