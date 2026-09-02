import { Clock, Image, PenLine, Radio, Upload } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BOOM_CLIP_LABEL, FLASH_BOOM_LABEL } from '../lib/brand';
import { MAX_CLIP_DURATION_SECONDS } from '../lib/contentType';
import { STORY_MAX_DURATION_SEC } from '../lib/storyLifecycle';
import { useAuthStore } from '../store/authStore';

export function CreateView() {
  const profile = useAuthStore((state) => state.profile);
  const navigate = useNavigate();

  if (!profile) {
    return (
      <div className="grid min-h-full place-items-center rounded-2xl bg-zinc-900 p-6">
        <p className="text-center text-sm text-zinc-400">
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          para crear contenido.
        </p>
      </div>
    );
  }

  const profilePath = `/u/${encodeURIComponent(profile.handle)}`;

  return (
    <div className="lb-page mx-auto flex min-h-full max-w-lg flex-col gap-5 rounded-2xl bg-zinc-900 p-4 sm:p-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-white sm:text-2xl">Crear</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {FLASH_BOOM_LABEL}, {BOOM_CLIP_LABEL} o un LIVE. Elige qué quieres compartir.
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate('/transmitir')}
        className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-fuchsia-400/40 bg-gradient-to-r from-fuchsia-500/20 to-cyan-400/10 p-3.5 text-left transition hover:brightness-110 sm:gap-4 sm:p-4"
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-fuchsia-500/25 text-fuchsia-200">
          <Radio size={22} />
        </span>
        <span>
          <span className="block text-base font-bold text-white">Iniciar LIVE</span>
          <span className="mt-0.5 block text-xs text-zinc-400">
            Checklist de seguridad, metas y transmisión en tiempo real.
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => navigate(`${profilePath}?crear=historia`)}
        className="flex items-center gap-4 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4 text-left transition hover:border-fuchsia-400/50"
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-fuchsia-500/20 text-fuchsia-200">
          <Clock size={22} />
        </span>
        <span>
          <span className="block text-base font-bold text-white">{FLASH_BOOM_LABEL}</span>
          <span className="mt-0.5 block text-xs text-zinc-400">
            Foto o video 0–{STORY_MAX_DURATION_SEC} s · 24 h · amigos y seguidores.
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => navigate(`${profilePath}?crear=video`)}
        className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/15 to-fuchsia-500/10 p-3.5 text-left transition hover:brightness-110 sm:gap-4 sm:p-4"
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-500/25 text-cyan-200">
          <Upload size={22} />
        </span>
        <span>
          <span className="block text-base font-bold text-white">Subir video · {BOOM_CLIP_LABEL}</span>
          <span className="mt-0.5 block text-xs text-zinc-400">
            Video corto 0–{MAX_CLIP_DURATION_SECONDS} s · aparece en el carrusel de Inicio.
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => navigate(`${profilePath}?crear=foto`)}
        className="flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-950 p-4 text-left transition hover:border-cyan-400/40"
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-500/15 text-amber-300">
          <Image size={22} />
        </span>
        <span>
          <span className="block text-base font-bold text-white">Publicar foto</span>
          <span className="mt-0.5 block text-xs text-zinc-400">Imagen o publicación visual.</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => navigate(`${profilePath}?crear=texto`)}
        className="flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-950 p-4 text-left transition hover:border-cyan-400/40"
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <PenLine size={22} />
        </span>
        <span>
          <span className="block text-base font-bold text-white">Escribir post</span>
          <span className="mt-0.5 block text-xs text-zinc-400">Texto con emojis y hashtags.</span>
        </span>
      </button>
    </div>
  );
}
