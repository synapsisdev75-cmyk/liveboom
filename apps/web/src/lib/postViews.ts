import { doc, increment, onSnapshot, runTransaction, type Unsubscribe } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase';

const VIEW_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const OPEN_DWELL_MS = 500;
const VISIBLE_DWELL_MS = 1100;
const VISIBLE_RATIO = 0.45;

const remembered = new Set<string>();

function memoryKey(uid: string, postId: string) {
  return `${uid}:${postId}`;
}

function storageKey(uid: string, postId: string) {
  return `lb-view:${uid}:${postId}`;
}

function readStoredAt(uid: string, postId: string): number {
  try {
    return Number(localStorage.getItem(storageKey(uid, postId)) || 0) || 0;
  } catch {
    return 0;
  }
}

function writeStoredAt(uid: string, postId: string, atMs: number) {
  try {
    localStorage.setItem(storageKey(uid, postId), String(atMs));
  } catch {
    /* ignore quota */
  }
}

export function formatViewCount(value: number): string {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function listenPostViews(postId: string, onChange: (views: number) => void): Unsubscribe {
  const id = String(postId || '').trim();
  if (!id) {
    onChange(0);
    return () => undefined;
  }
  return onSnapshot(
    doc(db, 'posts', id),
    (snap) => {
      onChange(Number(snap.data()?.views ?? 0) || 0);
    },
    () => undefined,
  );
}

/** Una vista válida por usuario y publicación (cooldown 12 h). Ignora rerenders. */
export async function recordPostView(postId: string): Promise<boolean> {
  const user = auth.currentUser;
  const id = String(postId || '').trim();
  if (!user || !id) return false;
  if (typeof document !== 'undefined' && document.hidden) return false;

  const key = memoryKey(user.uid, id);
  if (remembered.has(key)) return false;

  const stored = readStoredAt(user.uid, id);
  if (stored && Date.now() - stored < VIEW_COOLDOWN_MS) {
    remembered.add(key);
    return false;
  }

  remembered.add(key);
  const postRef = doc(db, 'posts', id);
  const viewRef = doc(db, 'posts', id, 'views', user.uid);

  try {
    const counted = await runTransaction(db, async (tx) => {
      const viewSnap = await tx.get(viewRef);
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists()) return false;
      const last = viewSnap.exists() ? Number(viewSnap.data()?.atMs || 0) : 0;
      if (last && Date.now() - last < VIEW_COOLDOWN_MS) return false;
      const atMs = Date.now();
      tx.set(viewRef, { atMs });
      tx.update(postRef, { views: increment(1) });
      return true;
    });
    if (counted) writeStoredAt(user.uid, id, Date.now());
    if (!counted) remembered.delete(key);
    return counted;
  } catch {
    remembered.delete(key);
    return false;
  }
}

export function usePostViews(
  postId: string | null | undefined,
  mode: 'open' | 'visible',
  initialViews = 0,
) {
  const [views, setViews] = useState(() => Math.max(0, Math.floor(initialViews) || 0));
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setViews(Math.max(0, Math.floor(initialViews) || 0));
  }, [postId]);

  useEffect(() => {
    const id = String(postId || '').trim();
    if (!id) return;
    return listenPostViews(id, setViews);
  }, [postId]);

  useEffect(() => {
    const id = String(postId || '').trim();
    if (!id) return;

    let cancelled = false;
    let dwellTimer = 0;

    function clearDwell() {
      if (dwellTimer) window.clearTimeout(dwellTimer);
      dwellTimer = 0;
    }

    function arm(ms: number) {
      clearDwell();
      dwellTimer = window.setTimeout(() => {
        if (cancelled || document.hidden) return;
        void recordPostView(id);
      }, ms);
    }

    if (mode === 'open') {
      arm(OPEN_DWELL_MS);
      return () => {
        cancelled = true;
        clearDwell();
      };
    }

    if (!host || typeof IntersectionObserver === 'undefined') {
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
          arm(VISIBLE_DWELL_MS);
        } else {
          clearDwell();
        }
      },
      { threshold: [0, VISIBLE_RATIO, 0.75, 1] },
    );
    observer.observe(host);

    const onHide = () => {
      if (document.hidden) clearDwell();
    };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      cancelled = true;
      clearDwell();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [postId, mode, host]);

  return { views, setHost };
}
