export const BOOM_SALUDO_TRAVIESO = 'boom_saludo_travieso';

export type BoomAnimationDef = {
  id: string;
  src: string;
  fallbackSrc?: string;
  durationMs: number;
  transparent: true;
  placement: 'viewport-center';
};

export const BOOM_ANIMATIONS: Record<string, BoomAnimationDef> = {
  [BOOM_SALUDO_TRAVIESO]: {
    id: BOOM_SALUDO_TRAVIESO,
    src: '/assets/animations/boom_saludo_travieso.webm',
    fallbackSrc: '/assets/animations/boom_saludo_travieso.webp',
    durationMs: 8040,
    transparent: true,
    placement: 'viewport-center',
  },
};

const SHOW_EVENT = 'liveboom:boom-animation';
const ENDED_EVENT = 'liveboom:boom-animation-ended';

export function isGlobalBoomAnimation(id: string | undefined | null): boolean {
  return Boolean(id && BOOM_ANIMATIONS[id]);
}

export function showBoomAnimation(id: string) {
  if (typeof window === 'undefined') return;
  if (!BOOM_ANIMATIONS[id]) return;
  window.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: { id } }));
}

export function onBoomAnimationEnded(id: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ENDED_EVENT, { detail: { id } }));
}

export function boomAnimationShowEvent() {
  return SHOW_EVENT;
}

export function boomAnimationEndedEvent() {
  return ENDED_EVENT;
}

export function canPlayVp9Webm(): boolean {
  if (typeof document === 'undefined') return true;
  const probe = document.createElement('video');
  return probe.canPlayType('video/webm; codecs="vp9"') !== '';
}
