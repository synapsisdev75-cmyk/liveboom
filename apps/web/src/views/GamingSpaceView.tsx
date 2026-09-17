import { useEffect, useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  canUseGamingSpace,
  isAndroidScreenShareDisabled,
  SCREEN_SHARE_COMING_SOON_MESSAGE,
} from '../lib/liveScreenSharePolicy';
import { useAuthStore } from '../store/authStore';

/**
 * Entrada “Espacio Gaming” — desactivada en APK mientras Screen Share esté en coming soon.
 */
export function GamingSpaceView() {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(() => canUseGamingSpace());

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

  if (!profile) {
    return (
      <div className="grid min-h-[50dvh] place-items-center p-6 text-sm text-zinc-400">
        <p>
          <Link to="/login" className="text-cyan-300 underline">
            Inicia sesión
          </Link>{' '}
          para continuar.
        </p>
      </div>
    );
  }

  if (isAndroidScreenShareDisabled() || !allowed) {
    return (
      <div className="mx-auto flex min-h-[50dvh] w-full max-w-lg flex-col justify-center gap-4 p-6 text-center md:max-w-2xl">
        <Gamepad2 className="mx-auto text-cyan-300" size={36} />
        <h1 className="text-xl font-bold text-white">Espacio Gaming</h1>
        <p className="text-sm text-zinc-400">{SCREEN_SHARE_COMING_SOON_MESSAGE}</p>
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

  return (
    <div className="mx-auto flex min-h-[50dvh] w-full max-w-lg flex-col justify-center gap-4 p-6 text-center">
      <p className="text-sm text-zinc-400">{SCREEN_SHARE_COMING_SOON_MESSAGE}</p>
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
