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

let soundUnlockArmed = false;

function disarmSoundUnlock() {
  if (!soundUnlockArmed) return;
  soundUnlockArmed = false;
  window.removeEventListener('pointerdown', unlockSoundOnGesture, true);
  window.removeEventListener('keydown', unlockSoundOnGesture, true);
}

function unlockSoundOnGesture(event: Event) {
  disarmSoundUnlock();
  // El botón de sonido ya alterna por sí mismo dentro del gesto.
  if (event.target instanceof Element && event.target.closest('.lb-media-mute-fab')) return;
  // iOS solo deja quitar el mute dentro del gesto: aplicar al <video> en el mismo tick.
  document.querySelectorAll<HTMLVideoElement>('.lb-explore-view video').forEach((video) => {
    video.muted = false;
    video.defaultMuted = false;
    video.removeAttribute('muted');
  });
  setExploreFeedMuted(false);
}

function armSoundUnlock() {
  if (soundUnlockArmed || typeof window === 'undefined') return;
  soundUnlockArmed = true;
  window.addEventListener('pointerdown', unlockSoundOnGesture, true);
  window.addEventListener('keydown', unlockSoundOnGesture, true);
}

/** Explorar arranca con sonido. Llamar antes de montar los players. */
export function enterExploreWithSound() {
  setExploreFeedMuted(false);
  return disarmSoundUnlock;
}

/**
 * play() de Explorar: si el navegador bloquea el autoplay con audio, sigue en mudo
 * para no congelar el video y reactiva el sonido en el primer toque.
 */
export function playExploreVideo(video: HTMLVideoElement) {
  return video.play().catch((error: unknown) => {
    if (video.muted || (error as { name?: string } | null)?.name !== 'NotAllowedError') return;
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    setExploreFeedMuted(true);
    armSoundUnlock();
    void video.play().catch(() => undefined);
  });
}
