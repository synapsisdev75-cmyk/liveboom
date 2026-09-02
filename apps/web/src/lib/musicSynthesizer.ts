import type { MusicPresetId } from './musicLibrary';

const SR = 44100;

function scheduleTone(
  ctx: OfflineAudioContext,
  freq: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function scheduleNoiseHit(ctx: OfflineAudioContext, start: number, duration: number, volume: number) {
  const bufferSize = Math.floor(SR * duration);
  const noise = ctx.createBuffer(1, bufferSize, SR);
  const data = noise.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 6000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

function renderBossa(ctx: OfflineAudioContext, durationSec: number) {
  const bpm = 108;
  const beat = 60 / bpm;
  const steps = Math.floor(durationSec / beat);
  const chords = [261.63, 293.66, 329.63, 392.0];
  for (let i = 0; i < steps; i++) {
    const t = i * beat;
    if (i % 2 === 0) scheduleNoiseHit(ctx, t, 0.04, 0.08);
    if (i % 4 === 0) scheduleTone(ctx, 82.41, t, 0.28, 0.18, 'triangle');
    if (i % 8 === 0) {
      const chord = chords[(i / 8) % chords.length]!;
      scheduleTone(ctx, chord, t, 0.5, 0.06, 'sine');
      scheduleTone(ctx, chord * 1.25, t, 0.5, 0.04, 'sine');
    }
  }
}

function renderUrban(ctx: OfflineAudioContext, durationSec: number) {
  const bpm = 92;
  const beat = 60 / bpm;
  const steps = Math.floor(durationSec / (beat / 2));
  for (let i = 0; i < steps; i++) {
    const t = (i * beat) / 2;
    if (i % 2 === 0) scheduleTone(ctx, 55, t, 0.35, 0.28, 'sine');
    if (i % 4 !== 0) scheduleNoiseHit(ctx, t, 0.03, 0.1);
    if (i % 16 === 0) scheduleTone(ctx, 110, t, 0.15, 0.12, 'square');
  }
}

function renderPop(ctx: OfflineAudioContext, durationSec: number) {
  const bpm = 120;
  const beat = 60 / bpm;
  const steps = Math.floor(durationSec / beat);
  const melody = [523.25, 587.33, 659.25, 587.33, 493.88, 523.25];
  for (let i = 0; i < steps; i++) {
    const t = i * beat;
    if (i % 4 === 0) scheduleTone(ctx, 130.81, t, 0.2, 0.2, 'triangle');
    if (i % 2 === 0) scheduleNoiseHit(ctx, t, 0.05, 0.06);
    if (i % 8 === 0) {
      const note = melody[(i / 8) % melody.length]!;
      scheduleTone(ctx, note, t, 0.35, 0.1, 'sine');
    }
  }
}

function renderElectro(ctx: OfflineAudioContext, durationSec: number) {
  const bpm = 124;
  const beat = 60 / bpm;
  const steps = Math.floor(durationSec / beat);
  for (let i = 0; i < steps; i++) {
    const t = i * beat;
    scheduleTone(ctx, 60, t, 0.12, 0.32, 'sine');
    if (i % 2 === 1) scheduleNoiseHit(ctx, t, 0.04, 0.12);
    if (i % 8 === 4) scheduleTone(ctx, 220, t, 0.08, 0.14, 'square');
  }
}

function renderChill(ctx: OfflineAudioContext, durationSec: number) {
  const bpm = 72;
  const beat = 60 / bpm;
  const steps = Math.floor(durationSec / beat);
  const pads = [146.83, 164.81, 196.0, 220.0];
  for (let i = 0; i < steps; i++) {
    const t = i * beat;
    if (i % 4 === 0) {
      const pad = pads[(i / 4) % pads.length]!;
      scheduleTone(ctx, pad, t, beat * 3.5, 0.07, 'sine');
      scheduleTone(ctx, pad * 2, t, beat * 3.5, 0.03, 'sine');
    }
  }
}

function renderFiesta(ctx: OfflineAudioContext, durationSec: number) {
  const bpm = 96;
  const beat = 60 / bpm;
  const steps = Math.floor(durationSec / (beat / 2));
  for (let i = 0; i < steps; i++) {
    const t = (i * beat) / 2;
    const dembow = i % 4;
    if (dembow === 0 || dembow === 2) scheduleTone(ctx, 65.41, t, 0.2, 0.26, 'sine');
    if (dembow === 1 || dembow === 3) scheduleNoiseHit(ctx, t, 0.05, 0.14);
    if (i % 16 === 0) scheduleTone(ctx, 329.63, t, 0.2, 0.1, 'triangle');
  }
}

function renderBright(ctx: OfflineAudioContext, durationSec: number) {
  const bpm = 128;
  const beat = 60 / bpm;
  const steps = Math.floor(durationSec / beat);
  for (let i = 0; i < steps; i++) {
    const t = i * beat;
    if (i % 2 === 0) scheduleTone(ctx, 98, t, 0.15, 0.2, 'triangle');
    if (i % 4 === 0) scheduleNoiseHit(ctx, t, 0.06, 0.08);
    if (i % 8 === 0) scheduleTone(ctx, 392, t, 0.25, 0.09, 'sine');
  }
}

const RENDERERS: Record<MusicPresetId, (ctx: OfflineAudioContext, durationSec: number) => void> = {
  bossa: renderBossa,
  urban: renderUrban,
  pop: renderPop,
  electro: renderElectro,
  chill: renderChill,
  fiesta: renderFiesta,
  bright: renderBright,
  groove: renderUrban,
};

const bufferCache = new Map<string, Promise<AudioBuffer>>();

export async function renderMusicPreset(
  preset: MusicPresetId,
  durationSec: number,
): Promise<AudioBuffer> {
  const safeDuration = Math.max(12, Math.min(120, durationSec));
  const key = `${preset}:${safeDuration}`;
  const cached = bufferCache.get(key);
  if (cached) return cached;

  const task = (async () => {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * safeDuration), SR);
    const render = RENDERERS[preset] ?? renderPop;
    render(ctx, safeDuration);
    return ctx.startRendering();
  })();

  bufferCache.set(key, task);
  return task;
}

export async function readAudioBufferDurationSec(buffer: AudioBuffer) {
  return buffer.duration;
}

/** Extrae un clip y lo repite para cubrir targetDurationSec. */
export function buildLoopedMusicBuffer(
  ctx: AudioContext | OfflineAudioContext,
  source: AudioBuffer,
  startSec: number,
  clipSec: number,
  targetDurationSec: number,
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const startSample = Math.floor(Math.max(0, startSec) * sampleRate);
  const clipSamples = Math.floor(Math.max(0.5, clipSec) * sampleRate);
  const maxStart = Math.max(0, source.length - clipSamples);
  const safeStart = Math.min(startSample, maxStart);
  const outSamples = Math.floor(Math.max(0.5, targetDurationSec) * sampleRate);
  const out = ctx.createBuffer(source.numberOfChannels, outSamples, sampleRate);

  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const src = source.getChannelData(ch);
    const dst = out.getChannelData(ch);
    let pos = 0;
    while (pos < outSamples) {
      const remain = outSamples - pos;
      const take = Math.min(clipSamples, remain);
      for (let i = 0; i < take; i++) {
        dst[pos + i] = src[safeStart + i] ?? 0;
      }
      pos += take;
    }
  }
  return out;
}
