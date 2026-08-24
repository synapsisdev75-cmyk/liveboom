import { Globe, Image, Lock, PenLine, Users, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPost } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import type { SocialPost } from './SocialPostCard';

type Props = {
  username: string;
  onCreated: (post: SocialPost) => void;
};

type PostKind = 'photo' | 'video' | 'text';
type Visibility = 'public' | 'friends' | 'private';

export function CreatePostModal({ username, onCreated }: Props) {
  const profile = useAuthStore((state) => state.profile);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PostKind>('text');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [caption, setCaption] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'compose' | 'preview'>('compose');

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCaption('');
    setMediaFile(null);
    setPreviewUrl(null);
    setError(null);
    setVisibility('public');
    setStep('compose');
  }

  function onFileChange(file: File | null) {
    if (!file) return;
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setMediaFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    if (file.type.startsWith('video/')) setKind('video');
    else setKind('photo');
    setStep('preview');
  }

  async function publish() {
    if (!profile) {
      setError('Inicia sesión para publicar.');
      return;
    }
    if (kind !== 'text' && !mediaFile) {
      setError(kind === 'video' ? 'Elige un video.' : 'Elige una foto.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createPost({
        authorUid: profile.firebaseUid,
        username: profile.handle || username,
        type: kind,
        caption,
        mediaFile: kind === 'text' ? null : mediaFile,
        visibility,
      });
      onCreated({
        id: created.id,
        authorUid: profile.firebaseUid,
        authorUsername: profile.handle || username,
        type: kind,
        caption: caption.trim() || null,
        mediaUrl: created.mediaUrl,
        visibility: created.visibility,
        createdAt: new Date().toISOString(),
        likes: 0,
        dislikes: 0,
        viewerReaction: null,
      });
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
            <h3 className="text-lg font-bold text-white">
              {step === 'preview' ? 'Vista previa' : 'Publicar en tu biblioteca'}
            </h3>

            {step === 'preview' && previewUrl ? (
              <div className="mt-4 space-y-3">
                {kind === 'photo' ? (
                  <img src={previewUrl} alt="" className="mx-auto max-h-[50dvh] rounded-2xl object-contain" />
                ) : (
                  <video src={previewUrl} className="mx-auto max-h-[50dvh] rounded-2xl" controls playsInline />
                )}
                <p className="text-center text-xs text-zinc-500">{mediaFile?.name}</p>
                <button
                  type="button"
                  onClick={() => setStep('compose')}
                  className="w-full rounded-xl border border-white/10 py-2 text-sm text-zinc-300"
                >
                  Seguir editando
                </button>
              </div>
            ) : (
              <>
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
                      onClick={() => {
                        setKind(value);
                        if (value === 'text') {
                          if (previewUrl) URL.revokeObjectURL(previewUrl);
                          setMediaFile(null);
                          setPreviewUrl(null);
                        }
                      }}
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
                      onChange={(event) => onFileChange(event.target.files?.[0] || null)}
                    />
                    {mediaFile ? (
                      <span className="block space-y-2">
                        <span className="block text-cyan-300">Archivo listo ✓ {mediaFile.name}</span>
                        {previewUrl && kind === 'photo' ? (
                          <img src={previewUrl} alt="" className="mx-auto max-h-40 rounded-lg object-contain" />
                        ) : null}
                        {previewUrl && kind === 'video' ? (
                          <video src={previewUrl} className="mx-auto max-h-40 rounded-lg" muted playsInline controls />
                        ) : null}
                        <button
                          type="button"
                          className="text-xs font-semibold text-cyan-400"
                          onClick={(event) => {
                            event.preventDefault();
                            setStep('preview');
                          }}
                        >
                          Ver vista previa grande
                        </button>
                      </span>
                    ) : (
                      `Toca para elegir ${kind === 'video' ? 'video' : 'foto'}`
                    )}
                  </label>
                ) : null}
              </>
            )}

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Quién puede verlo</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ['public', Globe, 'Público'],
                  ['friends', Users, 'Amigos'],
                  ['private', Lock, 'Privado'],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVisibility(value)}
                  className={`rounded-xl border px-2 py-2 text-[11px] font-semibold ${
                    visibility === value
                      ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/10 text-zinc-400'
                  }`}
                >
                  <Icon size={14} className="mx-auto mb-1" />
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              {visibility === 'public'
                ? 'Visible para todas las cuentas registradas.'
                : visibility === 'friends'
                  ? 'Solo tus amigos.'
                  : 'Solo tú en tu perfil. Puedes cambiarlo después.'}
            </p>

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
                {busy ? 'Subiendo…' : 'Publicar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
