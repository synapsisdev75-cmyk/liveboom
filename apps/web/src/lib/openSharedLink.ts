import { Capacitor } from '@capacitor/core';
import { getPostById } from './socialFirestore';
import { useAuthStore } from '../store/authStore';

const PENDING_KEY = 'liveboom:pending-share';

export function parseSharedTarget(
  raw: string,
): { kind: 'profile'; path: string } | { kind: 'share'; postId: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  const web =
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    (host === 'liveboomapp.com' || host === 'localhost');
  const scheme = url.protocol === 'liveboom:';
  if (!web && !scheme) return null;
  if (url.pathname.startsWith('/u/')) {
    return { kind: 'profile', path: `${url.pathname}${url.search}` };
  }
  const fromPath = url.pathname.match(/^\/s\/([^/]+)/);
  if (fromPath?.[1]) {
    return { kind: 'share', postId: decodeURIComponent(fromPath[1]) };
  }
  if (scheme && host === 's') {
    const id = url.pathname.replace(/^\//, '').split('/')[0];
    if (id) return { kind: 'share', postId: decodeURIComponent(id) };
  }
  return null;
}

async function waitForAuth(maxMs = 8000) {
  const started = Date.now();
  while (!useAuthStore.getState().ready && Date.now() - started < maxMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }
}

export async function flushPendingShare() {
  const id = sessionStorage.getItem(PENDING_KEY);
  if (!id) return;
  await waitForAuth();
  if (!useAuthStore.getState().ready) return;
  if (!useAuthStore.getState().firebaseUser) {
    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/registro')) {
      window.location.assign('/login');
    }
    return;
  }
  const post = await getPostById(id).catch(() => null);
  sessionStorage.removeItem(PENDING_KEY);
  if (!post?.username) return;
  const target = `/u/${encodeURIComponent(post.username)}?post=${encodeURIComponent(post.id)}&uid=${encodeURIComponent(post.authorUid)}`;
  const here = `${window.location.pathname}${window.location.search}`;
  if (here !== target) window.location.assign(target);
}

export async function openSharedUrl(raw: string) {
  const target = parseSharedTarget(raw);
  if (!target) return;
  if (target.kind === 'profile') {
    const here = `${window.location.pathname}${window.location.search}`;
    if (here !== target.path) window.location.assign(target.path);
    return;
  }
  sessionStorage.setItem(PENDING_KEY, target.postId);
  await flushPendingShare();
}

let openerInstalled = false;

export function installSharedLinkOpener() {
  if (openerInstalled || typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
  openerInstalled = true;
  void import('@capacitor/app').then(({ App }) => {
    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) void openSharedUrl(launch.url);
    });
    void App.addListener('appUrlOpen', ({ url }) => {
      if (url) void openSharedUrl(url);
    });
  }).catch(() => undefined);
}
