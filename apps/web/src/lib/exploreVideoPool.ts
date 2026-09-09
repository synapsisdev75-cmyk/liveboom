/**
 * Pool de <video> solo para Explorar: latest-wins + prefetch N-1 / N+1 / N+2.
 * No se usa en Boom Clip, Flash Boom ni Publicaciones.
 */

type NavBudget = {
  plus2: boolean;
  preload: 'auto' | 'metadata';
  warmPlay: boolean;
};

type Slot = {
  el: HTMLVideoElement;
  url: string | null;
  abort: AbortController | null;
  gen: number;
};

const MAX_SLOTS = 4;

let navGen = 0;
let warmRaf = 0;
let lastSyncedUrl: string | null = null;
let visibleEl: HTMLVideoElement | null = null;
let visibleUrl: string | null = null;
const slots: Slot[] = [];
const metrics = {
  cancelled: 0,
  prefetch: 0,
  gestureUiMs: 0,
  gestureFrameMs: 0,
};

function connectionBudget(): NavBudget {
  if (typeof navigator === 'undefined') return { plus2: true, preload: 'auto', warmPlay: true };
  const conn = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean; downlink?: number };
    }
  ).connection;
  if (conn?.saveData) return { plus2: false, preload: 'metadata', warmPlay: false };
  const type = String(conn?.effectiveType || '');
  if (type === 'slow-2g' || type === '2g') return { plus2: false, preload: 'metadata', warmPlay: false };
  if (type === '3g' || (typeof conn?.downlink === 'number' && conn.downlink > 0 && conn.downlink < 1.2)) {
    return { plus2: false, preload: 'auto', warmPlay: false };
  }
  return { plus2: true, preload: 'auto', warmPlay: true };
}

function makeEl(preload: 'auto' | 'metadata') {
  const el = document.createElement('video');
  el.muted = true;
  el.defaultMuted = true;
  el.playsInline = true;
  el.preload = preload;
  el.controls = false;
  el.setAttribute('playsinline', '');
  el.setAttribute('webkit-playsinline', '');
  el.setAttribute('muted', '');
  return el;
}

function abortSlot(slot: Slot) {
  slot.abort?.abort();
  slot.abort = null;
  if (!slot.url && !slot.el.getAttribute('src') && !slot.el.src) {
    slot.gen = 0;
    return;
  }
  try {
    slot.el.pause();
    slot.el.removeAttribute('src');
    slot.el.load();
  } catch {
    /* ignore */
  }
  slot.url = null;
  slot.gen = 0;
  metrics.cancelled += 1;
}

function ensureSlots() {
  while (slots.length < MAX_SLOTS) {
    slots.push({ el: makeEl('auto'), url: null, abort: null, gen: 0 });
  }
}

function slotFor(url: string) {
  return slots.find((item) => item.url === url) || null;
}

function takeSlot(keep: Set<string>) {
  return slots.find((item) => !item.url) || slots.find((item) => item.url && !keep.has(item.url)) || null;
}

function sameSrc(el: HTMLVideoElement, url: string) {
  const attr = el.getAttribute('src') || '';
  if (attr === url) return true;
  try {
    return el.currentSrc === url || (el.currentSrc && el.currentSrc.endsWith(url));
  } catch {
    return false;
  }
}

function warm(url: string, gen: number, budget: NavBudget, keep: Set<string>) {
  if (!url || gen !== navGen) return;
  if (url === visibleUrl) return;
  if (slotFor(url)) return;
  const slot = takeSlot(keep);
  if (!slot) return;
  if (slot.url) abortSlot(slot);
  const abort = new AbortController();
  slot.abort = abort;
  slot.url = url;
  slot.gen = gen;
  slot.el.muted = true;
  slot.el.preload = budget.preload;
  slot.el.src = url;
  metrics.prefetch += 1;
  if (!budget.warmPlay) return;
  const playWarm = slot.el.play();
  if (!playWarm) return;
  void playWarm
    .then(() => {
      if (abort.signal.aborted || gen !== navGen || slot.url !== url) return;
      try {
        slot.el.pause();
        if (slot.el.currentTime > 0.12) slot.el.currentTime = 0;
      } catch {
        /* ignore */
      }
    })
    .catch(() => undefined);
}

function releasePoolUrl(url: string) {
  const slot = slotFor(url);
  if (!slot) return;
  abortSlot(slot);
}

/** Cancela cargas ajenas al video actual y precarga vecinos. Devuelve la generación activa. */
export function exploreNavSync(input: {
  currentUrl: string;
  prevUrl?: string | null;
  nextUrl?: string | null;
  next2Url?: string | null;
}): number {
  const gen = input.currentUrl === lastSyncedUrl ? navGen : ++navGen;
  lastSyncedUrl = input.currentUrl || null;
  ensureSlots();
  const budget = connectionBudget();
  const keep = new Set<string>();
  if (input.currentUrl) keep.add(input.currentUrl);
  if (input.prevUrl) keep.add(input.prevUrl);
  if (input.nextUrl) keep.add(input.nextUrl);
  if (budget.plus2 && input.next2Url) keep.add(input.next2Url);

  for (const slot of slots) {
    if (!slot.url) continue;
    if (!keep.has(slot.url)) abortSlot(slot);
  }

  if (warmRaf) window.cancelAnimationFrame(warmRaf);
  warmRaf = window.requestAnimationFrame(() => {
    warmRaf = 0;
    if (gen !== navGen) return;
    const neighbors = [input.nextUrl, input.prevUrl, budget.plus2 ? input.next2Url : null];
    for (const url of neighbors) {
      if (url && url !== input.currentUrl) warm(url, gen, budget, keep);
    }
  });
  return gen;
}

export function exploreNavBindPlayer(video: HTMLVideoElement, url: string, gen: number) {
  visibleEl = video;
  visibleUrl = url;
  if (!url || gen !== navGen) return;

  const warmed = slotFor(url);
  if (!sameSrc(video, url)) {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.src = url;
  }

  if (warmed && warmed.el !== video && warmed.el.readyState >= 2) {
    try {
      if (warmed.el.currentTime > 0.02 && video.readyState < 2) video.currentTime = 0;
    } catch {
      /* ignore */
    }
    const release = () => {
      if (gen !== navGen || visibleUrl !== url) return;
      releasePoolUrl(url);
    };
    if (video.readyState >= 2) release();
    else video.addEventListener('loadeddata', release, { once: true });
  }
}

export function exploreNavUnbindPlayer(video: HTMLVideoElement) {
  if (visibleEl !== video) return;
  visibleEl = null;
  visibleUrl = null;
}

export function exploreNavAbortVisible(video: HTMLVideoElement | null) {
  if (!video) return;
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch {
    /* ignore */
  }
}

export function exploreNavRelease() {
  navGen += 1;
  lastSyncedUrl = null;
  if (warmRaf) window.cancelAnimationFrame(warmRaf);
  warmRaf = 0;
  visibleEl = null;
  visibleUrl = null;
  for (const slot of slots) abortSlot(slot);
}

export function exploreNavIsCurrent(gen: number) {
  return gen === navGen;
}

export function exploreNavCurrentGen() {
  return navGen;
}

export function exploreNavMarkGesture() {
  return performance.now();
}

export function exploreNavRecordUi(startedAt: number) {
  if (startedAt <= 0) return;
  metrics.gestureUiMs = Math.round(performance.now() - startedAt);
}

export function exploreNavRecordFrame(startedAt: number) {
  if (startedAt <= 0) return;
  metrics.gestureFrameMs = Math.round(performance.now() - startedAt);
  if (import.meta.env.DEV) {
    console.debug('[explore-nav]', exploreNavMetrics());
  }
}

export function exploreNavMetrics() {
  return {
    ...metrics,
    gen: navGen,
    players: slots.filter((item) => Boolean(item.url)).length + (visibleUrl ? 1 : 0),
    buffering: slots.filter((item) => item.el && item.el.readyState < 3 && Boolean(item.url)).length,
  };
}
