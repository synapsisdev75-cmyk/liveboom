import { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Mic, Monitor, Radio, Volume2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { canUseGamingSpace } from '../lib/liveScreenSharePolicy';
import { useAuthStore } from '../store/authStore';

type ShareTarget = 'full_display' | 'single_app';

/**
 * Entrada móvil/tablet “Espacio Gaming”.
 * Fase 1: wizard de configuración + handoff a Transmitir/LIVE.
 * La captura nativa y overlays se cablean en el LIVE con flag gamingSpace.
 * Misma lógica en teléfono y tablet Android.
 */
export function GamingSpaceView() {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(() => canUseGamingSpace());
  const [shareTarget, setShareTarget] = useState<ShareTarget>('full_display');
  const [micOn, setMicOn] = useState(true);
  const [deviceAudioOn, setDeviceAudioOn] = useState(true);

  useEffect(() => {
    const refresh = () => setAllowed(canUseGamingSpace());
    refresh();
    const iv = window.setInterval(refresh, 350);
    const stop = window.setTimeout(() => window.clearInterval(iv), 8_000);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(stop);
    };
  }, []);

  const canContinue = useMemo(
    () => Boolean(profile) && micOn && deviceAudioOn,
    [profile, micOn, deviceAudioOn],
  );

  if (!profile) {
    return (
      <div className="grid min-h-[50dvh] place-items-center p-6 text-sm text-zinc-400">
        <p>
          <Link to="/login" className="text-cyan-300 underline">
            Inicia sesión
          </Link>{' '}
          para usar Espacio Gaming.
        </p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto flex min-h-[50dvh] w-full max-w-lg flex-col justify-center gap-4 p-6 text-center md:max-w-2xl">
        <Gamepad2 className="mx-auto text-cyan-300" size={36} />
        <h1 className="text-xl font-bold text-white">Espacio Gaming</h1>
        <p className="text-sm text-zinc-400">
          Disponible en la app Android de LiveBoom (móvil y tablet). En PC usa Compartir pantalla
          dentro del LIVE.
        </p>
        <button
          type="button"
          onClick={() => navigate('/crear')}
          className="min-h-11 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white"
        >
          Volver a Crear
        </button>
      </div>
    );
  }

  function startGamingLive() {
    if (!canContinue) return;
    navigate('/transmitir', {
      state: {
        gamingSpace: true,
        gamingShareTarget: shareTarget,
        gamingMicOn: micOn,
        gamingDeviceAudioOn: deviceAudioOn,
        category: 'juegos',
        title: `Gaming · ${profile?.displayName || profile?.handle || 'LiveBoom'}`,
      },
    });
  }

  return (
    <div className="lb-page mx-auto flex min-h-full w-full max-w-lg flex-col gap-5 overflow-x-hidden p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 md:max-w-2xl lg:max-w-3xl">
      <header className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300/90">
          Móvil y tablet Android
        </p>
        <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Espacio Gaming</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Transmite tu juego con chat flotante, audio del dispositivo y cámara PiP — misma
          experiencia en teléfono y tablet.
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
          <Monitor size={16} className="text-cyan-300" />
          Qué compartir
        </h2>
        <div className="grid gap-2">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <input
              type="radio"
              name="shareTarget"
              className="mt-1 accent-cyan-400"
              checked={shareTarget === 'full_display'}
              onChange={() => setShareTarget('full_display')}
            />
            <span className="text-sm text-zinc-100">
              Pantalla completa
              <span className="mt-0.5 block text-[11px] text-zinc-400">
                Recomendado (estilo Kick): todo lo que ves, estable al abrir el juego.
              </span>
            </span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 opacity-80">
            <input
              type="radio"
              name="shareTarget"
              className="mt-1 accent-cyan-400"
              checked={shareTarget === 'single_app'}
              onChange={() => setShareTarget('single_app')}
            />
            <span className="text-sm text-zinc-100">
              Una aplicación
              <span className="mt-0.5 block text-[11px] text-zinc-400">
                Solo el juego. Puede fallar si el chat flotante tapa la app (Android 14+).
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
          <Volume2 size={16} className="text-fuchsia-300" />
          Audio
        </h2>
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm text-zinc-100">
            <Mic size={15} /> Micrófono
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-cyan-400"
            checked={micOn}
            onChange={(e) => setMicOn(e.target.checked)}
          />
        </label>
        <label className="mt-2 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm text-zinc-100">
            <Volume2 size={15} /> Audio del dispositivo
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-cyan-400"
            checked={deviceAudioOn}
            onChange={(e) => setDeviceAudioOn(e.target.checked)}
          />
        </label>
        <p className="mt-3 text-[11px] leading-snug text-zinc-500">
          Obligatorio compartir audio del dispositivo. La voz tiene prioridad; el juego se atenúa
          automáticamente.
        </p>
      </section>

      <button
        type="button"
        disabled={!canContinue}
        onClick={startGamingLive}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 text-sm font-bold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Radio size={18} />
        Continuar a checklist LIVE
      </button>

      <button
        type="button"
        onClick={() => navigate('/crear')}
        className="min-h-11 text-sm font-semibold text-zinc-400"
      >
        Cancelar
      </button>
    </div>
  );
}
