import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, RefreshCw, Search } from 'lucide-react';
import {
  chatParticipantLabel,
  listAllPrivateChats,
  listChatMessagesAdmin,
  type AdminChatMessage,
  type AdminChatRow,
} from '../../lib/adminChatsFirestore';
import { profileHref } from '../../lib/profileFirestore';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    setError(null);
    try {
      const rows = await listAllPrivateChats(200);
      setChats(rows);
      if (selectedId && !rows.some((c) => c.chatId === selectedId)) {
        setSelectedId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar chats');
    } finally {
      setLoadingChats(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadChats();
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => chats.find((c) => c.chatId === selectedId) ?? null,
    [chats, selectedId],
  );

  const visibleChats = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, '');
    if (!needle) return chats;
    return chats.filter((c) => {
      const names = c.participants
        .map((uid) => chatParticipantLabel(c, uid).toLowerCase())
        .join(' ');
      const usernames = c.participants
        .map((uid) => String(c.profiles[uid]?.username || '').toLowerCase())
        .join(' ');
      return (
        names.includes(needle) ||
        usernames.includes(needle) ||
        String(c.lastMessage || '')
          .toLowerCase()
          .includes(needle)
      );
    });
  }, [chats, q]);

  async function openChat(chatId: string) {
    setSelectedId(chatId);
    setLoadingMsgs(true);
    setError(null);
    try {
      const msgs = await listChatMessagesAdmin(chatId);
      setMessages(msgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar mensajes');
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
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
            {chats.length} conversaciones · lectura total (incl. privadas)
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadChats()}
          disabled={loadingChats}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loadingChats ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <label className="lb-panel relative block rounded-2xl p-2">
        <Search
          size={14}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar chat por usuario o texto…"
          className="w-full rounded-xl border border-transparent bg-transparent py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
        />
      </label>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <ul className="lb-panel max-h-[70dvh] space-y-1 overflow-y-auto rounded-2xl p-2">
          {loadingChats && chats.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-zinc-500">Cargando chats…</li>
          ) : visibleChats.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-zinc-500">Sin conversaciones</li>
          ) : (
            visibleChats.map((c) => {
              const a = c.participants[0] || '';
              const b = c.participants[1] || '';
              const label = `${chatParticipantLabel(c, a)} ↔ ${chatParticipantLabel(c, b)}`;
              return (
                <li key={c.chatId}>
                  <button
                    type="button"
                    onClick={() => void openChat(c.chatId)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
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
                  {selected.participants
                    .map((uid) => chatParticipantLabel(selected, uid))
                    .join(' ↔ ')}
                </p>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                  {selected.participants.map((uid) => {
                    const uname = selected.profiles[uid]?.username || '';
                    return (
                      <Link
                        key={uid}
                        to={profileHref(uname || 'user', uid)}
                        className="text-cyan-400 hover:underline"
                      >
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
                    const fromName = selected
                      ? chatParticipantLabel(selected, m.fromUid)
                      : m.fromUid.slice(0, 8);
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
                            className="mt-1 inline-block text-[11px] text-fuchsia-300 hover:underline"
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
