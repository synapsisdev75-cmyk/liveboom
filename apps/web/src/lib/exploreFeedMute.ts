/**
 * Preferencia de audio compartida en Explorar y en los visores overlay (Boom Clip / Flash Boom).
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
const blockedVideos = new Set<HTMLVideoElement>();
let onSoundUnlocked: (() => void) | null = null;

function disarmSoundUnlock() {
  blockedVideos.clear();
  onSoundUnlocked = null;
  if (!soundUnlockArmed) return;
  soundUnlockArmed = false;
  window.removeEventListener('pointerdown', unlockSoundOnGesture, true);
  window.removeEventListener('keydown', unlockSoundOnGesture, true);
}

function unlockSoundOnGesture(event: Event) {
  const videos = [...blockedVideos];
  const after = onSoundUnlocked;
  disarmSoundUnlock();
  // El botón de sonido ya alterna por sí mismo dentro del gesto.
  if (event.target instanceof Element && event.target.closest('.lb-media-mute-fab')) return;
  // iOS solo deja quitar el mute dentro del gesto: aplicar al <video> en el mismo tick.
  for (const video of videos) {
    if (!video.isConnected) continue;
    video.muted = false;
    video.defaultMuted = false;
    video.removeAttribute('muted');
  }
  if (after) after();
  else setExploreFeedMuted(false);
}

function armSoundUnlock(video: HTMLVideoElement, after?: () => void) {
  if (typeof window === 'undefined') return;
  blockedVideos.add(video);
  if (after) onSoundUnlocked = after;
  if (soundUnlockArmed) return;
  soundUnlockArmed = true;
  window.addEventListener('pointerdown', unlockSoundOnGesture, true);
  window.addEventListener('keydown', unlockSoundOnGesture, true);
}

/** Explorar / visor de Boom Clip o Flash Boom arranca con sonido. Llamar antes de montar los players. */
export function enterExploreWithSound() {
  setExploreFeedMuted(false);
  return disarmSoundUnlock;
}

/**
 * play() con sonido: si el navegador bloquea el autoplay con audio, sigue en mudo
 * para no congelar el video y reactiva el sonido en el primer toque.
 * Sin `onBlocked` usa la preferencia compartida de Explorar / visores.
 */
export function playVideoWithSound(
  video: HTMLVideoElement,
  handlers?: { onBlocked: () => void; onUnlocked: () => void },
) {
  return video.play().catch((error: unknown) => {
    if (video.muted || (error as { name?: string } | null)?.name !== 'NotAllowedError') return;
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    if (handlers) handlers.onBlocked();
    else setExploreFeedMuted(true);
    armSoundUnlock(video, handlers?.onUnlocked);
    void video.play().catch(() => undefined);
  });
}

export function playExploreVideo(video: HTMLVideoElement) {
  return playVideoWithSound(video);
}
