/**
 * Preferencia de audio compartida en Explorar (y viewers overlay del feed).
 * Unmute en un video ⇒ unmute en todos; mute ⇒ mute en todos.
 */

let exploreFeedMuted = true;
const listeners = new Set<(muted: boolean) => void>();

export function getExploreFeedMuted() {
  return exploreFeedMuted;
}

export function setExploreFeedMuted(muted: boolean) {
  const next = Boolean(muted);
  if (exploreFeedMuted === next) return;
  exploreFeedMuted = next;
  listeners.forEach((fn) => {
    try {
      fn(exploreFeedMuted);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeExploreFeedMuted(listener: (muted: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
