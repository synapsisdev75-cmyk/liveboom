/** Coordina videos del feed para evitar eco (dos <video> con audio a la vez). */

type Handle = {
  id: string;
  pause: () => void;
  mute: () => void;
};

const registry = new Map<string, Handle>();
let unmutedId: string | null = null;
let expandedId: string | null = null;

export function registerFeedVideo(handle: Handle) {
  registry.set(handle.id, handle);
  return () => {
    registry.delete(handle.id);
    if (unmutedId === handle.id) unmutedId = null;
    if (expandedId === handle.id) expandedId = null;
  };
}

/** Solo un video puede ir con sonido. */
export function claimUnmuted(id: string) {
  unmutedId = id;
  for (const [otherId, h] of registry) {
    if (otherId !== id) h.mute();
  }
}

export function releaseUnmuted(id: string) {
  if (unmutedId === id) unmutedId = null;
}

/** Al expandir / reproducir con foco: pausa el resto (incl. reels muted). */
export function claimExclusivePlayback(id: string) {
  expandedId = id;
  for (const [otherId, h] of registry) {
    if (otherId !== id) h.pause();
  }
}

export function releaseExclusivePlayback(id: string) {
  if (expandedId === id) expandedId = null;
}

export function isExclusiveHeldByOther(id: string) {
  return expandedId != null && expandedId !== id;
}
