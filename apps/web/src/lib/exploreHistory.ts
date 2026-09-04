/** Historial local de Explorar (sesión + dispositivo). No toca Inicio ni otros módulos. */

export type ExploreWatchRecord = {
  seenAt: number;
  watchCount: number;
  dwellMs: number;
  watchPct: number;
  completed: boolean;
  skipped: boolean;
  repeats: number;
  authorUid: string;
  tags: string[];
};

export type ExploreHistory = Record<string, ExploreWatchRecord>;

const HISTORY_KEY = (uid: string) => `lb.explore.history.v1.${uid}`;
const SESSION_KEY = (uid: string) => `lb.explore.seen.v1.${uid}`;

const SKIP_MS = 2000;
const MAX_HISTORY = 900;
const TRIM_TO = 700;

function canUseStorage() {
  return typeof window !== 'undefined';
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export function readExploreHistory(uid: string): ExploreHistory {
  if (!uid) return {};
  return readJson<ExploreHistory>(HISTORY_KEY(uid), {});
}

function writeExploreHistory(uid: string, history: ExploreHistory) {
  if (!uid) return;
  const entries = Object.entries(history);
  const trimmed =
    entries.length > MAX_HISTORY
      ? Object.fromEntries(entries.sort((a, b) => b[1].seenAt - a[1].seenAt).slice(0, TRIM_TO))
      : history;
  writeJson(HISTORY_KEY(uid), trimmed);
}

export function readExploreSessionSeen(uid: string): Set<string> {
  if (!uid || !canUseStorage()) return new Set();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY(uid));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function writeExploreSessionSeen(uid: string, seen: Iterable<string>) {
  if (!uid || !canUseStorage()) return;
  try {
    window.sessionStorage.setItem(SESSION_KEY(uid), JSON.stringify([...seen].slice(-400)));
  } catch {
    /* quota */
  }
}

export function markExploreSessionSeen(uid: string, postId: string, seen: Set<string>) {
  if (!postId) return seen;
  if (seen.has(postId)) return seen;
  const next = new Set(seen);
  next.add(postId);
  writeExploreSessionSeen(uid, next);
  return next;
}

export type ExploreWatchInput = {
  dwellMs: number;
  durationSec?: number | null;
  authorUid: string;
  tags: string[];
};

export function recordExploreWatch(
  uid: string,
  postId: string,
  input: ExploreWatchInput,
  prev: ExploreHistory,
): ExploreHistory {
  if (!uid || !postId) return prev;
  const dwellMs = Math.max(0, Number(input.dwellMs) || 0);
  const durationMs = Math.max(0, Number(input.durationSec) || 0) * 1000;
  const watchPct =
    durationMs > 0
      ? Math.max(0, Math.min(1, dwellMs / durationMs))
      : dwellMs >= 20_000
        ? 0.9
        : Math.max(0, Math.min(1, dwellMs / 30_000));
  const skipped = dwellMs > 0 && dwellMs < SKIP_MS;
  const completed = watchPct >= 0.8;
  const existing = prev[postId];
  const next: ExploreHistory = {
    ...prev,
    [postId]: {
      seenAt: Date.now(),
      watchCount: (existing?.watchCount || 0) + 1,
      dwellMs: (existing?.dwellMs || 0) + dwellMs,
      watchPct: Math.max(existing?.watchPct || 0, watchPct),
      completed: Boolean(existing?.completed || completed),
      skipped: skipped && !completed && watchPct < 0.35,
      repeats: (existing?.repeats || 0) + (existing ? 1 : 0),
      authorUid: input.authorUid || existing?.authorUid || '',
      tags: input.tags.length ? input.tags : existing?.tags || [],
    },
  };
  writeExploreHistory(uid, next);
  return next;
}
