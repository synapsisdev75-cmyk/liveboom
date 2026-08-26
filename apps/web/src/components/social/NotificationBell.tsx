import {
  Bell,
  Check,
  Radio,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { playFriendRequestAlert, playMessageAlert, playPostAlert } from '../../lib/alertSound';
import { api } from '../../lib/api';
import {
  acceptFriendRequest,
  listenConversations,
  listenFriends,
  listenIncomingRequests,
  listenRecentPosts,
  rejectFriendRequest,
  type FriendChip,
  type FriendRequest,
} from '../../lib/socialFirestore';
import { profileHref } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';

type NotiItem = {
  id: string;
  kind: 'request' | 'live' | 'post' | 'message';
  text: string;
  href: string;
  at: number;
};

type ActiveStream = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  title: string;
  viewers: number;
};

/** Campanita con solicitudes, lives/posts de amigos y mensajes en tiempo real. */
export function NotificationBell() {
  const profile = useAuthStore((state) => state.profile);
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [items, setItems] = useState<NotiItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const friendsRef = useRef<FriendChip[]>([]);
  const knownRequestIds = useRef<Set<string> | null>(null);
  const knownPostIds = useRef<Set<string> | null>(null);
  const knownLive = useRef<Set<string> | null>(null);
  const knownMsgAt = useRef<Map<string, string>>(new Map());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    return listenFriends(profile.firebaseUid, (list) => {
      friendsRef.current = list;
    });
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile) {
      setRequests([]);
      setItems([]);
      return;
    }

    const unsubReq = listenIncomingRequests(profile.firebaseUid, (list) => {
      if (knownRequestIds.current == null) {
        knownRequestIds.current = new Set(list.map((item) => item.id));
      } else {
        const fresh = list.filter((item) => !knownRequestIds.current!.has(item.id));
        if (fresh.length > 0) playFriendRequestAlert();
        knownRequestIds.current = new Set(list.map((item) => item.id));
      }
      setRequests(list);
      setItems((current) => {
        const without = current.filter((item) => item.kind !== 'request');
        const notes = list.map((item) => ({
          id: `req-${item.id}`,
          kind: 'request' as const,
          text: `@${item.username} te envió solicitud de amistad`,
          href: profileHref(item.username, item.uid),
          at: Date.now(),
        }));
        return [...notes, ...without].slice(0, 40);
      });
    });

    const unsubPosts = listenRecentPosts((list) => {
      const friendUids = new Set(friendsRef.current.map((f) => f.uid));
      if (knownPostIds.current == null) {
        knownPostIds.current = new Set(list.map((item) => item.id));
        return;
      }
      const fresh = list.filter(
        (item) =>
          !knownPostIds.current!.has(item.id) &&
          item.authorUid !== profile.firebaseUid &&
          friendUids.has(item.authorUid),
      );
      if (fresh.length > 0) {
        playPostAlert();
        setItems((current) => {
          const notes = fresh.map((item) => ({
            id: `post-${item.id}`,
            kind: 'post' as const,
            text: `@${item.username} publicó algo nuevo`,
            href: profileHref(item.username, item.authorUid),
            at: Date.now(),
          }));
          return [...notes, ...current].slice(0, 40);
        });
      }
      knownPostIds.current = new Set(list.map((item) => item.id));
    });

    const unsubChats = listenConversations(profile.firebaseUid, (list) => {
      for (const chat of list) {
        if (!chat.lastMessage || !chat.lastAt) continue;
        const prev = knownMsgAt.current.get(chat.chatId);
        if (prev == null) {
          knownMsgAt.current.set(chat.chatId, chat.lastAt);
          continue;
        }
        if (chat.lastAt > prev) {
          knownMsgAt.current.set(chat.chatId, chat.lastAt);
          playMessageAlert();
          setItems((current) =>
            [
              {
                id: `msg-${chat.chatId}-${chat.lastAt}`,
                kind: 'message' as const,
                text: `@${chat.username}: ${chat.lastMessage}`,
                href: `/mensajes?con=${encodeURIComponent(chat.username)}`,
                at: Date.now(),
              },
              ...current,
            ].slice(0, 40),
          );
        }
      }
    });

    let cancelled = false;
    async function pollLives() {
      try {
        const data = await api<{ streams: ActiveStream[] }>('/api/stream/friends-live').catch(() => ({
          streams: [] as ActiveStream[],
        }));
        if (cancelled) return;
        const streams = data.streams || [];
        if (knownLive.current == null) {
          knownLive.current = new Set(streams.map((s) => s.username));
          return;
        }
        const fresh = streams.filter((s) => !knownLive.current!.has(s.username));
        if (fresh.length > 0) {
          playPostAlert();
          setItems((current) => {
            const notes = fresh.map((s) => ({
              id: `live-${s.username}-${Date.now()}`,
              kind: 'live' as const,
              text: `${s.displayName || s.username} está en vivo`,
              href: `/stream/${encodeURIComponent(s.username)}`,
              at: Date.now(),
            }));
            return [...notes, ...current].slice(0, 40);
          });
        }
        knownLive.current = new Set(streams.map((s) => s.username));
      } catch {
        // ignore
      }
    }
    void pollLives();
    const timer = window.setInterval(() => void pollLives(), 12000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unsubReq();
      unsubPosts();
      unsubChats();
    };
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const count = requests.length + items.filter((i) => i.kind !== 'request').length;

  async function accept(username: string) {
    if (!profile) return;
    setBusy(username);
    try {
      await acceptFriendRequest(profile.firebaseUid, username);
    } finally {
      setBusy(null);
    }
  }

  async function reject(username: string) {
    if (!profile) return;
    setBusy(username);
    try {
      await rejectFriendRequest(profile.firebaseUid, username);
    } finally {
      setBusy(null);
    }
  }

  if (!profile) {
    return (
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 text-zinc-500">
        <Bell size={16} />
      </span>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 ${
          count > 0 ? 'text-cyan-400 ring-1 ring-cyan-500/30' : 'text-zinc-400'
        }`}
        aria-label="Notificaciones"
      >
        <Bell size={16} />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-fuchsia-500 px-1 text-[9px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Notificaciones</p>
            <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
              <X size={14} />
            </button>
          </div>

          {requests.length > 0 ? (
            <div className="border-b border-white/10 px-3 py-2">
              <p className="mb-2 text-[10px] font-semibold uppercase text-cyan-400">Solicitudes</p>
              <ul className="max-h-40 space-y-2 overflow-y-auto">
                {requests.map((req) => (
                  <li key={req.id} className="rounded-xl bg-zinc-900/80 px-2 py-2">
                    <Link
                      to={profileHref(req.username, req.uid)}
                      onClick={() => setOpen(false)}
                      className="text-xs font-semibold text-white hover:text-cyan-300"
                    >
                      @{req.username}
                    </Link>
                    <p className="text-[10px] text-zinc-500">{req.displayName}</p>
                    <div className="mt-1.5 flex gap-1">
                      <button
                        type="button"
                        disabled={busy === req.username}
                        onClick={() => void accept(req.username)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-500/20 py-1 text-[10px] font-bold text-emerald-300"
                      >
                        <Check size={12} /> Aceptar
                      </button>
                      <button
                        type="button"
                        disabled={busy === req.username}
                        onClick={() => void reject(req.username)}
                        className="flex-1 rounded-lg bg-white/5 py-1 text-[10px] font-bold text-zinc-400"
                      >
                        Rechazar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ul className="max-h-56 space-y-1 overflow-y-auto p-2">
            {items.filter((i) => i.kind !== 'request').length === 0 && requests.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-zinc-500">Sin notificaciones nuevas.</li>
            ) : (
              items
                .filter((i) => i.kind !== 'request')
                .map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-2 rounded-xl px-2 py-2 text-xs text-zinc-300 hover:bg-white/5"
                    >
                      {item.kind === 'live' ? (
                        <Radio size={14} className="mt-0.5 shrink-0 text-fuchsia-400" />
                      ) : (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                      )}
                      <span>{item.text}</span>
                    </Link>
                  </li>
                ))
            )}
          </ul>
          <div className="border-t border-white/10 px-3 py-2">
            <Link
              to="/buscar"
              onClick={() => setOpen(false)}
              className="text-[11px] font-semibold text-cyan-400 hover:underline"
            >
              Ver solicitudes en Buscar
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
