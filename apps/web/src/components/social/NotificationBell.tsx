import {
  Bell,
  Check,
  Radio,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { playFriendRequestAlert, playIncomingMessageSound, playLiveAlert, playPostAlert } from '../../lib/alertSound';
import { api } from '../../lib/api';
import {
  acceptFriendRequest,
  listenConversations,
  listenFriends,
  listenIncomingRequests,
  listenPostAlerts,
  listenRecentPosts,
  rejectFriendRequest,
  deletePostAlert,
  clearPostAlerts,
  buildPostAlertTarget,
  type PostAlertItem,
  type FriendChip,
  type FriendRequest,
} from '../../lib/socialFirestore';
import { listenLiveAlerts, deleteLiveAlert, clearLiveAlerts } from '../../lib/liveGiftsFirestore';
import { profileHref } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';

type NotiItem = {
  id: string;
  kind: 'request' | 'live' | 'post' | 'message';
  text: string;
  href: string;
  at: number;
  alertMeta?: PostAlertItem;
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
  const location = useLocation();
  const navigate = useNavigate();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [items, setItems] = useState<NotiItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const friendsRef = useRef<FriendChip[]>([]);
  const knownRequestIds = useRef<Set<string> | null>(null);
  const knownPostIds = useRef<Set<string> | null>(null);
  const knownLive = useRef<Set<string> | null>(null);
  const knownMsgAt = useRef<Map<string, string>>(new Map());
  const dismissedMsgIds = useRef<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const [sheetMobile, setSheetMobile] = useState(false);

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
      if (knownPostIds.current == null) {
        knownPostIds.current = new Set(list.map((item) => item.id));
        return;
      }
      knownPostIds.current = new Set(list.map((item) => item.id));
    });

    const unsubPostAlerts = listenPostAlerts(profile.firebaseUid, (alerts) => {
      setItems((current) => {
        const without = current.filter((item) => !item.id.startsWith('post-alert-'));
        const notes = alerts.map((alert) => ({
          id: `post-alert-${alert.id}`,
          kind: 'post' as const,
          text: alert.text,
          href: alert.href,
          at: alert.at,
          alertMeta: alert,
        }));
        if (notes[0] && Date.now() - notes[0].at < 90_000) playPostAlert();
        return [...notes, ...without].slice(0, 40);
      });
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
          playIncomingMessageSound(pathRef.current.startsWith('/mensajes'));
          const msgId = `msg-${chat.chatId}-${chat.lastAt}`;
          if (dismissedMsgIds.current.has(msgId)) continue;
          setItems((current) =>
            [
              {
                id: msgId,
                kind: 'message' as const,
                text: `@${chat.username}: ${chat.lastMessage}`,
                href: `/mensajes?con=${encodeURIComponent(chat.username)}`,
                at: Date.now(),
              },
              ...current.filter((item) => item.id !== msgId),
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
          playLiveAlert();
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

    const unsubAlerts = listenLiveAlerts(profile.firebaseUid, (alerts) => {
      setItems((current) => {
        const without = current.filter((item) => !item.id.startsWith('alert-'));
        const notes = alerts.map((alert) => ({
          id: `alert-${alert.id}`,
          kind: 'live' as const,
          text: alert.text,
          href: alert.href,
          at: alert.at,
        }));
        if (notes[0] && Date.now() - notes[0].at < 90_000) playLiveAlert();
        return [...notes, ...without].slice(0, 40);
      });
    });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unsubReq();
      unsubPosts();
      unsubPostAlerts();
      unsubChats();
      unsubAlerts();
    };
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!open || !btnRef.current) {
      setAnchor(null);
      return;
    }
    function update() {
      const rect = btnRef.current!.getBoundingClientRect();
      const mobile = window.innerWidth < 1024;
      setSheetMobile(mobile);
      const width = Math.min(window.innerWidth - 24, 384);
      // Desde el sidebar izquierdo: abrir hacia la derecha (área principal).
      let left = rect.right + 10;
      if (left + width > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - width - 12);
      }
      // Si el botón está muy a la derecha, abrir a la izquierda del botón.
      if (rect.left > window.innerWidth * 0.55) {
        left = Math.max(12, rect.left - width - 10);
      }
      let top = rect.bottom + 8;
      const maxH = Math.min(window.innerHeight * 0.8, 560);
      if (top + maxH > window.innerHeight - 12) {
        top = Math.max(12, window.innerHeight - maxH - 12);
      }
      setAnchor({ top, left, width });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (!panelRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const count = requests.length + items.filter((i) => i.kind !== 'request').length;
  const otherItems = items.filter((i) => i.kind !== 'request');

  async function dismissItem(item: NotiItem) {
    setItems((current) => current.filter((i) => i.id !== item.id));
    if (!profile) return;
    if (item.id.startsWith('alert-')) {
      const alertId = item.id.slice('alert-'.length);
      await deleteLiveAlert(profile.firebaseUid, alertId).catch(() => undefined);
      return;
    }
    if (item.id.startsWith('post-alert-')) {
      const alertId = item.id.slice('post-alert-'.length);
      await deletePostAlert(profile.firebaseUid, alertId).catch(() => undefined);
      return;
    }
    if (item.id.startsWith('msg-')) {
      dismissedMsgIds.current.add(item.id);
    }
  }

  function notificationTarget(item: NotiItem) {
    if (item.alertMeta) {
      const built = buildPostAlertTarget(item.alertMeta);
      return { pathname: built.pathname, search: built.search };
    }
    try {
      const url = new URL(item.href, window.location.origin);
      return { pathname: url.pathname, search: url.search, hash: url.hash };
    } catch {
      return item.href;
    }
  }

  function openNotification(item: NotiItem) {
    setOpen(false);
    const target = notificationTarget(item);
    if (typeof target === 'string') navigate(target);
    else navigate(target);
    void dismissItem(item);
  }

  async function clearAllNotifications() {
    if (!profile) return;
    setItems((current) => current.filter((i) => i.kind === 'request'));
    await Promise.all([
      clearLiveAlerts(profile.firebaseUid),
      clearPostAlerts(profile.firebaseUid),
    ]).catch(() => undefined);
  }

  async function accept(req: { id: string; uid: string; username: string }) {
    if (!profile) return;
    setBusy(req.id);
    setActionError(null);
    try {
      await acceptFriendRequest(profile.firebaseUid, req.uid || req.username);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo aceptar');
    } finally {
      setBusy(null);
    }
  }

  async function reject(req: { id: string; uid: string; username: string }) {
    if (!profile) return;
    setBusy(req.id);
    setActionError(null);
    try {
      await rejectFriendRequest(profile.firebaseUid, req.uid || req.username);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo rechazar');
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
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 ${
          count > 0 ? 'text-cyan-400 ring-1 ring-cyan-500/30' : 'text-zinc-400'
        }`}
        aria-label="Notificaciones"
        aria-expanded={open}
      >
        <Bell size={16} />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-fuchsia-500 px-1 text-[9px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {open && anchor
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[65] bg-black/45 lg:bg-transparent"
                aria-label="Cerrar notificaciones"
                onClick={() => setOpen(false)}
              />
              <div
                ref={panelRef}
                className="fixed z-[70] flex max-h-[min(85dvh,36rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
                style={
                  sheetMobile
                    ? {
                        left: 'max(0.5rem, var(--lb-safe-left))',
                        right: 'max(0.5rem, var(--lb-safe-right))',
                        bottom:
                          'calc(var(--lb-bottom-nav-h) + max(0.5rem, var(--lb-safe-bottom)))',
                        top: 'auto',
                        width: 'auto',
                        maxHeight: 'min(70dvh, 32rem)',
                      }
                    : {
                        top: anchor.top,
                        left: anchor.left,
                        width: anchor.width,
                      }
                }
              >
              <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Notificaciones</p>
                <div className="flex items-center gap-2">
                  {otherItems.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void clearAllNotifications()}
                      className="text-[10px] font-semibold text-zinc-500 hover:text-rose-300"
                    >
                      Limpiar
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
                    <X size={14} />
                  </button>
                </div>
              </div>

              {requests.length > 0 ? (
                <div className="border-b border-white/10 px-3 py-2">
                  <p className="mb-2 text-[10px] font-semibold uppercase text-cyan-400">Solicitudes</p>
                  {actionError ? (
                    <p className="mb-2 rounded-lg bg-fuchsia-500/10 px-2 py-1.5 text-[10px] text-fuchsia-300">
                      {actionError}
                    </p>
                  ) : null}
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
                            disabled={busy === req.id}
                            onClick={() => void accept(req)}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-500/20 py-1 text-[10px] font-bold text-emerald-300 disabled:opacity-50"
                          >
                            <Check size={12} /> Aceptar
                          </button>
                          <button
                            type="button"
                            disabled={busy === req.id}
                            onClick={() => void reject(req)}
                            className="flex-1 rounded-lg bg-white/5 py-1 text-[10px] font-bold text-zinc-400 disabled:opacity-50"
                          >
                            Rechazar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
                {otherItems.length === 0 && requests.length === 0 ? (
                  <li className="px-2 py-6 text-center text-xs text-zinc-500">Sin notificaciones nuevas.</li>
                ) : (
                  otherItems.map((item) => (
                    <li key={item.id} className="group flex items-start gap-1 rounded-xl hover:bg-white/5">
                      <button
                        type="button"
                        onClick={() => openNotification(item)}
                        className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2.5 text-left text-xs text-zinc-300 hover:text-white"
                      >
                        {item.kind === 'live' ? (
                          <Radio size={14} className="mt-0.5 shrink-0 text-fuchsia-400" />
                        ) : (
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                        )}
                        <span className="min-w-0 break-words">{item.text}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void dismissItem(item)}
                        className="mt-2 mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-white/10 hover:text-rose-300"
                        aria-label="Eliminar notificación"
                        title="Eliminar"
                      >
                        <X size={14} />
                      </button>
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
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
