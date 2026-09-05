/** Sugerencias de clips a partir de picos de audio y recortes de duración. Sin API externa. */

export type HighlightSuggestion = {
  id: string;
  startSec: number;
  endSec: number;
  title: string;
  hint: string;
};

const TITLES = [
  { title: 'Inicio impactante', hint: 'Presentación y mensaje clave' },
  { title: 'Punto principal', hint: 'Momento con más energía' },
  { title: 'Dato relevante', hint: 'Cambio de ritmo o énfasis' },
  { title: 'Cierre fuerte', hint: 'Final destacado del video' },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function windowsFromPeaks(peaks: number[], duration: number, maxDurationSec: number, count: number) {
  const span = clamp(Math.min(maxDurationSec, Math.max(8, duration / (count + 1))), 4, maxDurationSec);
  const out: { start: number; end: number }[] = [];
  for (const peak of peaks) {
    let start = clamp(peak - span * 0.28, 0, Math.max(0, duration - 1));
    let end = clamp(start + span, start + 1, duration);
    if (end - start > maxDurationSec) end = start + maxDurationSec;
    const overlaps = out.some((item) => !(end <= item.start + 1.2 || start >= item.end - 1.2));
    if (overlaps) continue;
    out.push({ start, end });
    if (out.length >= count) break;
  }
  return out;
}

async function audioPeaks(file: File, durationHint: number): Promise<number[]> {
  const buffer = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buffer.slice(0));
    const channel = audio.getChannelData(0);
    const sampleRate = audio.sampleRate;
    const step = Math.max(1, Math.floor(sampleRate * 0.45));
    const scores: { t: number; e: number }[] = [];
    for (let i = 0; i < channel.length; i += step) {
      let sum = 0;
      const end = Math.min(channel.length, i + step);
      for (let j = i; j < end; j += 8) {
        const sample = channel[j] ?? 0;
        sum += sample * sample;
      }
      scores.push({ t: i / sampleRate, e: sum / Math.max(1, (end - i) / 8) });
    }
    const sorted = [...scores].sort((a, b) => b.e - a.e);
    const peaks: number[] = [];
    for (const item of sorted) {
      if (peaks.every((t) => Math.abs(t - item.t) > 6)) peaks.push(item.t);
      if (peaks.length >= 8) break;
    }
    return peaks.sort((a, b) => a - b);
  } catch {
    const n = Math.max(3, Math.min(4, Math.round(durationHint / 25)));
    return Array.from({ length: n }, (_, i) => (durationHint * (i + 0.18)) / (n + 0.2));
  } finally {
    void ctx.close();
  }
}

function fallbackWindows(duration: number, maxDurationSec: number) {
  const count = duration <= maxDurationSec + 1 ? 1 : duration < maxDurationSec * 3 ? 3 : 4;
  const span = Math.min(maxDurationSec, Math.max(6, duration / count));
  return Array.from({ length: count }, (_, i) => {
    const start = clamp((duration - span) * (count === 1 ? 0 : i / (count - 1)), 0, Math.max(0, duration - 1));
    return { start, end: clamp(start + span, start + 1, duration) };
  });
}

function toSuggestions(windows: { start: number; end: number }[]) {
  return windows.map((item, index) => {
    const meta = TITLES[index] || TITLES[TITLES.length - 1];
    return {
      id: `ai-${index}-${Math.round(item.start * 10)}`,
      startSec: Number(item.start.toFixed(1)),
      endSec: Number(item.end.toFixed(1)),
      title: meta?.title || `Clip ${index + 1}`,
      hint: meta?.hint || 'Momento destacado',
    };
  });
}

export async function suggestHighlightClips(
  file: File,
  durationSec: number,
  maxDurationSec: number,
): Promise<HighlightSuggestion[]> {
  const duration = Math.max(1, durationSec);
  const cap = Math.max(4, maxDurationSec);
  const fallback = toSuggestions(fallbackWindows(duration, cap));
  if (file.size > 28 * 1024 * 1024) return fallback;

  try {
    const peaks = await Promise.race([
      audioPeaks(file, duration),
      new Promise<number[]>((_, reject) => {
        window.setTimeout(() => reject(new Error('timeout')), 8000);
      }),
    ]);
    const windows = windowsFromPeaks(peaks, duration, cap, duration > cap * 2 ? 4 : 3);
    if (windows.length === 0) return fallback;
    return toSuggestions(windows);
  } catch {
    return fallback;
  }
}
