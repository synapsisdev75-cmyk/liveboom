/** Alertas sonoras Liveboom: MP3 para notificaciones, Web Audio para regalos. */
let audioCtx: AudioContext | null = null;

const NOTIFICATION_SRC = '/sounds/notification.mp3';
let notificationAudio: HTMLAudioElement | null = null;

function playNotificationSound() {
  try {
    if (!notificationAudio) {
      notificationAudio = new Audio(NOTIFICATION_SRC);
      notificationAudio.volume = 0.82;
    }
    notificationAudio.currentTime = 0;
    void notificationAudio.play().catch(() => playNotificationFallback());
  } catch {
    playNotificationFallback();
  }
}

function playNotificationFallback() {
  try {
    const ac = ctx();
    const t = ac.currentTime;
    tone(t, 880, 0.1, 0.1, 'sine');
    tone(t + 0.09, 1174.7, 0.12, 0.09, 'triangle');
  } catch {
    // Audio bloqueado hasta interacción del usuario
  }
}

function ctx() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

function tone(at: number, freq: number, duration: number, gain = 0.12, type: OscillatorType = 'sine') {
  const ac = ctx();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** Solicitud de amistad entrante */
export function playFriendRequestAlert() {
  playNotificationSound();
}

/** Timbre de llamada privada (MP3 original Liveboom). */
const CALL_RING_SRC = '/sounds/call-ring.mp3';
let callRingAudio: HTMLAudioElement | null = null;

export function startCallRing() {
  try {
    stopCallRing();
    const audio = new Audio(CALL_RING_SRC);
    audio.loop = true;
    audio.volume = 0.88;
    callRingAudio = audio;
    void audio.play().catch(() => {
      // Fallback si el navegador bloquea autoplay
      playCallRingFallback();
    });
  } catch {
    playCallRingFallback();
  }
}

export function stopCallRing() {
  if (!callRingAudio) return;
  callRingAudio.pause();
  callRingAudio.currentTime = 0;
  callRingAudio = null;
}

function playCallRingFallback() {
  try {
    const ac = ctx();
    const t = ac.currentTime;
    tone(t, 440, 0.18, 0.12, 'sine');
    tone(t + 0.18, 554.37, 0.22, 0.11, 'sine');
    tone(t + 0.42, 440, 0.18, 0.1, 'sine');
    tone(t + 0.6, 554.37, 0.28, 0.1, 'sine');
  } catch {
    // Audio bloqueado hasta interacción del usuario
  }
}

/** @deprecated Usa startCallRing / stopCallRing para llamadas entrantes. */
export function playCallRing() {
  startCallRing();
}

/** Pop corto (enviar mensaje / recibir con la app enfocada en chats). */
export function playMessagePop() {
  try {
    const ac = ctx();
    const t = ac.currentTime;
    // Pop suave y corto
    tone(t, 620, 0.045, 0.09, 'sine');
    tone(t + 0.03, 920, 0.05, 0.06, 'triangle');
  } catch {
    // Audio bloqueado hasta interacción del usuario
  }
}

/** Alerta completa de mensaje (fuera de la app / otra pantalla). */
export function playMessageAlert() {
  playNotificationSound();
}

let lastIncomingMsgSoundAt = 0;

/**
 * Sonido al recibir mensaje privado:
 * - fuera (pestaña oculta u otra pantalla) → alerta actual
 * - dentro de Mensajes con pestaña visible → pop corto
 * Debounce evita doble tono (campana + chat abierto).
 */
export function playIncomingMessageSound(viewingMessages: boolean) {
  const now = Date.now();
  if (now - lastIncomingMsgSoundAt < 450) return;
  lastIncomingMsgSoundAt = now;
  const outside =
    typeof document === 'undefined' ||
    document.visibilityState !== 'visible' ||
    !viewingMessages;
  if (outside) playMessageAlert();
  else playMessagePop();
}

/** Nueva publicación / actividad */
export function playPostAlert() {
  playNotificationSound();
}

/** Amigo inició live */
const LIVE_ALERT_SRC = '/sounds/live-alert.mp3';
let liveAlertAudio: HTMLAudioElement | null = null;

export function playLiveAlert() {
  try {
    if (!liveAlertAudio) {
      liveAlertAudio = new Audio(LIVE_ALERT_SRC);
      liveAlertAudio.volume = 0.85;
    }
    liveAlertAudio.currentTime = 0;
    void liveAlertAudio.play().catch(() => playLiveAlertFallback());
  } catch {
    playLiveAlertFallback();
  }
}

function playLiveAlertFallback() {
  try {
    const ac = ctx();
    const t = ac.currentTime;
    tone(t, 523.25, 0.1, 0.1, 'square');
    tone(t + 0.1, 659.25, 0.14, 0.09, 'triangle');
    tone(t + 0.22, 784, 0.16, 0.08, 'sine');
  } catch {
    // ignore
  }
}

function playThematic(giftId: string | undefined, t: number) {
  if (!giftId) return;
  if (giftId === 'maracas' || giftId === 'tambor_caribeno') {
    tone(t, 180, 0.08, 0.1, 'square');
    tone(t + 0.12, 180, 0.08, 0.1, 'square');
    tone(t + 0.24, 220, 0.1, 0.09, 'square');
    return;
  }
  if (giftId === 'cuatro_venezolano' || giftId === 'orquesta_tropical') {
    tone(t, 392, 0.16, 0.1, 'triangle');
    tone(t + 0.14, 493.88, 0.16, 0.1, 'triangle');
    tone(t + 0.3, 587.33, 0.22, 0.09, 'sine');
    return;
  }
  if (giftId === 'besito' || giftId === 'corazon_latino' || giftId === 'flor_tropical') {
    tone(t, 880, 0.1, 0.08, 'sine');
    tone(t + 0.08, 1320, 0.14, 0.07, 'sine');
  }
}

/** Animación de regalo por nivel (1–5) y tema del ítem. */
export function playGiftAlert(level: number, giftId?: string) {
  try {
    const ac = ctx();
    const t = ac.currentTime;
    playThematic(giftId, t);
    if (level <= 1) {
      tone(t, 784, 0.1, 0.08, 'sine');
      tone(t + 0.08, 988, 0.12, 0.07, 'triangle');
      return;
    }
    if (level === 2) {
      tone(t, 523, 0.12, 0.1, 'triangle');
      tone(t + 0.1, 659, 0.14, 0.1, 'triangle');
      tone(t + 0.22, 784, 0.16, 0.09, 'sine');
      return;
    }
    if (level === 3) {
      tone(t, 392, 0.15, 0.12, 'sawtooth');
      tone(t + 0.12, 523, 0.18, 0.11, 'triangle');
      tone(t + 0.28, 659, 0.2, 0.1, 'sine');
      tone(t + 0.48, 880, 0.22, 0.08, 'sine');
      return;
    }
    if (level === 4) {
      tone(t, 220, 0.25, 0.14, 'sawtooth');
      tone(t + 0.2, 330, 0.28, 0.12, 'triangle');
      tone(t + 0.45, 440, 0.3, 0.11, 'sine');
      tone(t + 0.75, 660, 0.35, 0.13, 'square');
      return;
    }
    tone(t, 110, 0.35, 0.16, 'sawtooth');
    tone(t + 0.25, 220, 0.4, 0.14, 'triangle');
    tone(t + 0.55, 330, 0.45, 0.12, 'sine');
    tone(t + 0.95, 440, 0.5, 0.14, 'square');
    tone(t + 1.4, 880, 0.55, 0.1, 'sine');
  } catch {
    // ignore
  }
}
