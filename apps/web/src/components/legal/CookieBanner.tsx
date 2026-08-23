import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'liveboom_cookie_consent';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) setVisible(true);
  }, []);

  function accept(all: boolean) {
    localStorage.setItem(STORAGE_KEY, all ? 'all' : 'essential');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-boom-panel/95 p-4 backdrop-blur-xl sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-md sm:rounded-2xl sm:border">
      <p className="text-sm font-semibold text-white">Cookies en Liveboom</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        Usamos cookies esenciales para tu sesión y, si aceptas, analíticas para mejorar la experiencia.{' '}
        <Link to="/legal/cookies" className="text-boom-cyan underline">
          Política de cookies
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => accept(true)}
          className="rounded-xl bg-boom-cyan px-4 py-2 text-xs font-bold text-zinc-950"
        >
          Aceptar todas
        </button>
        <button
          type="button"
          onClick={() => accept(false)}
          className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-300"
        >
          Solo esenciales
        </button>
      </div>
    </div>
  );
}
