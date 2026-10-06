import { api } from './api';

export type FriendLiveStream = {
  username: string;
  displayName?: string;
};

type Listener = (streams: FriendLiveStream[]) => void;

/** Respaldo del aviso en tiempo real (liveAlerts): basta cada 30 s y solo con la app a la vista. */
const POLL_MS = 30_000;

const listeners = new Set<Listener>();
let latest: FriendLiveStream[] | null = null;
let timer = 0;
let inflight = false;
let lastFetchAt = 0;

function load() {
  if (inflight || document.visibilityState !== 'visible') return;
  inflight = true;
  lastFetchAt = Date.now();
  void api<{ streams?: FriendLiveStream[] }>('/api/stream/friends-live')
    .then((data) => {
      const streams = (data.streams || []).filter((s) => Boolean(s?.username));
      latest = streams;
      for (const listener of Array.from(listeners)) listener(streams);
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = false;
    });
}

function onVisible() {
  if (document.visibilityState === 'visible' && Date.now() - lastFetchAt > POLL_MS / 2) load();
}

/** Lista compartida de amigos en vivo (campana + mensajes) con una sola consulta periódica. */
export function subscribeFriendsLive(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = window.setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    load();
  } else if (latest) {
    const snapshot = latest;
    queueMicrotask(() => {
      if (listeners.has(listener)) listener(snapshot);
    });
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size > 0) return;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    latest = null;
  };
}
