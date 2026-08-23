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
