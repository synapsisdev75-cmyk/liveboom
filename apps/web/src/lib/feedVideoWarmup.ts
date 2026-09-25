import { Capacitor } from '@capacitor/core';
import { isPublicationPost, type ContentLike } from './contentType';

/**
 * Durante el splash, abre los videos largos de Publicaciones y guarda
 * el arranque en la caché del navegador. No baja el archivo entero.
 */

const LONG_SEC = 15;
const BUFFER_SEC = 2.5;
const PER_VIDEO_MS = 4000;

type Phase = 'idle' | 'running' | 'settled';

type WarmPost = ContentLike & {
  mediaUrl?: string | null;
  durationSec?: number | null;
};

const warmedUrls = new Set<string>();
const listeners = new Set<(phase: Phase) => void>();
let phase: Phase = 'idle';

function setPhase(next: Phase) {
  phase = next;
  listeners.forEach((fn) => fn(phase));
}

export function subscribeFeedVideoWarm(listener: (phase: Phase) => void) {
  listener(phase);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function wasFeedVideoWarmed(url: string | null | undefined) {
  return Boolean(url && warmedUrls.has(url));
}

function saveDataOn() {
  if (typeof navigator === 'undefined') return false;
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (conn?.saveData) return true;
  const type = String(conn?.effectiveType || '');
  return type === 'slow-2g' || type === '2g';
}

function hostEl() {
  let host = document.getElementById('lb-feed-video-warm');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'lb-feed-video-warm';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.appendChild(host);
  return host;
}

function isLongPublication(post: WarmPost) {
  if (post.type !== 'video' || !post.mediaUrl) return false;
  if (!isPublicationPost(post)) return false;
  const duration = Number(post.durationSec);
  if (!Number.isFinite(duration) || duration <= 0) return true;
  return duration >= LONG_SEC;
}

function pickUrls(posts: WarmPost[]) {
  const native = (() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  })();
  const cap = native ? 1 : 2;
  const urls: string[] = [];
  for (const post of posts) {
    if (!isLongPublication(post)) continue;
    const url = String(post.mediaUrl || '');
    if (!url || urls.includes(url)) continue;
    urls.push(url);
    if (urls.length >= cap) break;
  }
  return urls;
}

function warmOne(url: string) {
  return new Promise<void>((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    hostEl().appendChild(video);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        video.pause();
      } catch {
        /* el elemento sigue montado para conservar la caché */
      }
      warmedUrls.add(url);
      resolve();
    };

    const timer = window.setTimeout(finish, PER_VIDEO_MS);
    const check = () => {
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          window.clearTimeout(timer);
          finish();
          return;
        }
        const buffered = video.buffered;
        if (buffered.length > 0) {
          const ahead = buffered.end(buffered.length - 1) - Math.max(0, video.currentTime);
          if (ahead >= BUFFER_SEC) {
            window.clearTimeout(timer);
            finish();
          }
        }
      } catch {
        window.clearTimeout(timer);
        finish();
      }
    };

    video.addEventListener('progress', check);
    video.addEventListener('canplay', check);
    video.addEventListener('error', () => {
      window.clearTimeout(timer);
      finish();
    });
    video.src = url;
    video.load();
    void video.play().catch(() => undefined);
  });
}

/** Primera tanda del feed. Llamadas posteriores no reinician la precarga. */
export function warmLongFeedVideos(posts: WarmPost[]) {
  if (phase !== 'idle' || typeof document === 'undefined') return;
  if (saveDataOn()) {
    setPhase('settled');
    return;
  }
  const urls = pickUrls(posts);
  if (!urls.length) return;
  setPhase('running');
  void (async () => {
    for (const url of urls) {
      await warmOne(url);
    }
    setPhase('settled');
  })();
}
