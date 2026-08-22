import { Image, PenLine, Video } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';
import type { SocialPost } from './SocialPostCard';

type Props = {
  username: string;
  onCreated: (post: SocialPost) => void;
};

type PostKind = 'photo' | 'video' | 'text';

export function CreatePostModal({ username, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PostKind>('text');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCaption('');
    setMediaUrl('');
    setError(null);
  }

  async function readFile(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  }

  async function onFileChange(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await readFile(file);
      setMediaUrl(dataUrl);
      if (file.type.startsWith('video/')) setKind('video');
      else setKind('photo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archivo inválido');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ post: SocialPost }>('/api/social/posts', {
        method: 'POST',
        body: JSON.stringify({
          username,
          type: kind,
          caption,
          mediaUrl: kind === 'text' ? undefined : mediaUrl,
        }),
      });
      onCreated(result.post);
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-4 py-2 text-sm font-bold text-zinc-950"
      >
        Nueva publicación
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-zinc-950 p-4 sm:rounded-3xl sm:p-6">
            <h3 className="text-lg font-bold text-white">Publicar en tu biblioteca</h3>
            <div className="mt-4 flex gap-2">
              {(
                [
                  ['text', PenLine, 'Post'],
                  ['photo', Image, 'Foto'],
                  ['video', Video, 'Video'],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold ${
                    kind === value
                      ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300'
                      : 'border-white/10 text-zinc-400'
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder={kind === 'text' ? '¿Qué quieres compartir?' : 'Descripción (opcional)'}
              className="mt-4 h-28 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
            />
            {kind !== 'text' ? (
              <label className="mt-3 block rounded-xl border border-dashed border-white/15 p-4 text-center text-sm text-zinc-400">
                <input
                  type="file"
                  accept={kind === 'video' ? 'video/*' : 'image/*'}
                  className="hidden"
                  onChange={(event) => void onFileChange(event.target.files?.[0] || null)}
                />
                {mediaUrl ? 'Archivo listo ✓' : `Toca para elegir ${kind === 'video' ? 'video' : 'foto'}`}
              </label>
            ) : null}
            {error ? <p className="mt-2 text-sm text-fuchsia-400">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-zinc-400">
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void publish()}
                className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-bold text-zinc-950 disabled:opacity-60"
              >
                {busy ? 'Publicando…' : 'Publicar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
