import { Music2, Pause, Play, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clampMusicStart,
  findMusicTrack,
  MUSIC_CLIP_SEC,
  MUSIC_GENRE_LABELS,
  MUSIC_LIBRARY,
  type MusicGenre,
  type MusicTrack,
  type SelectedMusicClip,
} from '../../lib/musicLibrary';
import { renderMusicPreset } from '../../lib/musicSynthesizer';

type Props = {
  onCancel: () => void;
  onConfirm: (clip: SelectedMusicClip) => void;
  initial?: SelectedMusicClip | null;
};

export function MusicPickerModal({ onCancel, onConfirm, initial }: Props) {
  const [genre, setGenre] = useState<MusicGenre | 'all'>('all');
  const [selectedId, setSelectedId] = useState(initial?.trackId ?? MUSIC_LIBRARY[0]?.id ?? '');
  const [startSec, setStartSec] = useState(initial?.startSec ?? 0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);

  const track = useMemo(() => findMusicTrack(selectedId), [selectedId]);
  const visible = useMemo(
    () => (genre === 'all' ? MUSIC_LIBRARY : MUSIC_LIBRARY.filter((t) => t.genre === genre)),
    [genre],
  );

  useEffect(() => {
    return () => stopPreview();
  }, []);

  useEffect(() => {
    if (!track) return;
    setStartSec((prev) => clampMusicStart(prev, track, MUSIC_CLIP_SEC));
    let cancelled = false;
    setBusy(true);
    void renderMusicPreset(track.preset, track.durationSec)
      .then((buffer) => {
        if (cancelled) return;
        bufferRef.current = buffer;
        setBusy(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('No se pudo cargar la pista');
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [track]);

  function stopPreview() {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPlaying(false);
  }

  async function togglePreview() {
    if (!track || !bufferRef.current) return;
    if (playing) {
      stopPreview();
      return;
    }
    stopPreview();
    const ctx = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = ctx;
    if (ctx.state === 'suspended') await ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = bufferRef.current;
    const safeStart = clampMusicStart(startSec, track, MUSIC_CLIP_SEC);
    source.connect(ctx.destination);
    source.onended = () => setPlaying(false);
    source.start(0, safeStart, MUSIC_CLIP_SEC);
    sourceRef.current = source;
    setPlaying(true);
  }

  function selectTrack(next: MusicTrack) {
    stopPreview();
    setSelectedId(next.id);
    setStartSec(0);
    setError(null);
  }

  const panel = (
    <div className="fixed inset-0 z-[135] grid place-items-end bg-black/80 p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-4 sm:rounded-3xl sm:p-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Music2 size={18} className="text-fuchsia-300" />
            <h3 className="text-lg font-bold text-white">Biblioteca musical</h3>
          </div>
          <button type="button" onClick={onCancel} className="text-zinc-400 hover:text-white" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-zinc-400">
          Música libre de derechos · elige un tramo de {MUSIC_CLIP_SEC} s para tu video.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setGenre('all')}
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              genre === 'all' ? 'bg-cyan-500/25 text-cyan-200' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            Todas
          </button>
          {(Object.keys(MUSIC_GENRE_LABELS) as MusicGenre[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setGenre(id)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                genre === id ? 'bg-fuchsia-500/25 text-fuchsia-200' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {MUSIC_GENRE_LABELS[id]}
            </button>
          ))}
        </div>

        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => selectTrack(item)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                  item.id === selectedId
                    ? 'bg-fuchsia-500/15 ring-1 ring-fuchsia-400/40'
                    : 'bg-zinc-900/80 hover:bg-zinc-800'
                }`}
              >
                <span>
                  <span className="font-semibold text-white">{item.title}</span>
                  <span className="ml-2 text-[10px] text-zinc-500">{item.mood}</span>
                </span>
                <span className="text-[10px] text-zinc-500">{item.durationSec}s</span>
              </button>
            </li>
          ))}
        </ul>

        {track ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-zinc-900/50 p-3">
            <p className="text-sm font-semibold text-white">{track.title}</p>
            <p className="text-[10px] text-zinc-500">
              Libre de derechos · {MUSIC_GENRE_LABELS[track.genre]} · sin copyright
            </p>
            <label className="block text-xs font-semibold text-zinc-400">
              Inicio del tramo: {startSec.toFixed(1)} s
              <input
                type="range"
                min={0}
                max={Math.max(0, track.durationSec - MUSIC_CLIP_SEC)}
                step={0.1}
                value={startSec}
                onChange={(event) => {
                  stopPreview();
                  setStartSec(Number(event.target.value));
                }}
                className="mt-1 w-full accent-fuchsia-400"
                disabled={busy}
              />
            </label>
            <p className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 px-3 py-2 text-center text-xs font-semibold text-fuchsia-200">
              Clip: {startSec.toFixed(1)} s → {(startSec + MUSIC_CLIP_SEC).toFixed(1)} s ({MUSIC_CLIP_SEC} s)
            </p>
            <button
              type="button"
              disabled={busy || !bufferRef.current}
              onClick={() => void togglePreview()}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? 'Detener preview' : 'Escuchar tramo'}
            </button>
          </div>
        ) : null}

        {error ? <p className="mt-2 text-sm text-fuchsia-400">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-zinc-400">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!track || busy}
            onClick={() => {
              if (!track) return;
              stopPreview();
              onConfirm({
                trackId: track.id,
                startSec: clampMusicStart(startSec, track, MUSIC_CLIP_SEC),
                clipSec: MUSIC_CLIP_SEC,
              });
            }}
            className="rounded-full bg-fuchsia-500 px-5 py-2 text-sm font-bold text-zinc-950 disabled:opacity-60"
          >
            Usar esta música
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
}
