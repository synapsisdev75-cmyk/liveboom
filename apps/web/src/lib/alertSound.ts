/** Alerta sonora original Liveboom (Web Audio, sin archivos externos). */
let audioCtx: AudioContext | null = null;

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
  try {
    const ac = ctx();
    const t = ac.currentTime;
    tone(t, 880, 0.12, 0.14, 'triangle');
    tone(t + 0.1, 1174.7, 0.14, 0.12, 'triangle');
    tone(t + 0.22, 1396.9, 0.18, 0.1, 'sine');
  } catch {
    // Audio bloqueado hasta interacción del usuario
  }
}

/** Timbre de llamada privada */
export function playCallRing() {
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

/** Nuevo mensaje privado */
export function playMessageAlert() {
  try {
    const ac = ctx();
    const t = ac.currentTime;
    tone(t, 659.25, 0.1, 0.1, 'sine');
    tone(t + 0.09, 830.61, 0.12, 0.09, 'sine');
  } catch {
    // ignore
  }
}

/** Nueva publicación / actividad */
export function playPostAlert() {
  try {
    const ac = ctx();
    const t = ac.currentTime;
    tone(t, 523.25, 0.08, 0.08, 'square');
    tone(t + 0.08, 659.25, 0.1, 0.07, 'square');
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
