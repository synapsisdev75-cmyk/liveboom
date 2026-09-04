/** Historial de exposición del feed de Publicaciones (Inicio). No borra posts. */

export type HomeFeedSeenRecord = {
  seenAt: number;
  count: number;
  interacted?: boolean;
  ignored?: boolean;
};

export type HomeFeedHistory = Record<string, HomeFeedSeenRecord>;

const keyFor = (uid: string) => `lb.homeFeed.history.v1.${uid}`;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readHomeFeedHistory(uid: string): HomeFeedHistory {
  if (!uid || !canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(keyFor(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HomeFeedHistory;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeHomeFeedHistory(uid: string, history: HomeFeedHistory) {
  if (!uid || !canUseStorage()) return;
  try {
    const entries = Object.entries(history);
    const trimmed =
      entries.length > 800
        ? Object.fromEntries(entries.sort((a, b) => b[1].seenAt - a[1].seenAt).slice(0, 600))
        : history;
    window.localStorage.setItem(keyFor(uid), JSON.stringify(trimmed));
  } catch {
    /* quota */
  }
}

export function markHomeFeedSeen(uid: string, postId: string, at = Date.now()) {
  if (!uid || !postId) return;
  const history = readHomeFeedHistory(uid);
  const prev = history[postId];
  history[postId] = {
    seenAt: at,
    count: (prev?.count || 0) + 1,
    interacted: prev?.interacted,
    ignored: prev?.ignored,
  };
  writeHomeFeedHistory(uid, history);
}

export function markHomeFeedInteracted(uid: string, postId: string) {
  if (!uid || !postId) return;
  const history = readHomeFeedHistory(uid);
  const prev = history[postId] || { seenAt: Date.now(), count: 1 };
  history[postId] = { ...prev, interacted: true, ignored: false };
  writeHomeFeedHistory(uid, history);
}
