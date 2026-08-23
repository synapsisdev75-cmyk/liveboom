import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BrandBackground } from './BrandBackground';
import { BrandVideo } from './BrandVideo';
import { LegalFooter } from '../legal/LegalFooter';
import { ageFromBirthYear } from '../../lib/birthDate';
import { useAuthStore } from '../../store/authStore';

const currentYear = new Date().getFullYear();
const minBirthYear = currentYear - 100;
const maxBirthYear = currentYear - 18;

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthYear, setBirthYear] = useState(String(maxBirthYear));
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const signInEmail = useAuthStore((s) => s.signInEmail);
  const signUpEmail = useAuthStore((s) => s.signUpEmail);
  const signInGoogle = useAuthStore((s) => s.signInGoogle);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (mode === 'register' && !acceptedTerms) {
      setLocalError('Debes aceptar los Términos y el Aviso de Privacidad.');
      return;
    }
    if (mode === 'login') {
      await signInEmail(email, password).catch(() => undefined);
      return;
    }
    const year = Number(birthYear);
    if (!Number.isFinite(year) || year < minBirthYear || year > maxBirthYear) {
      setLocalError('Ingresa un año de nacimiento válido (mayor de 18 años).');
      return;
    }
    const age = ageFromBirthYear(year);
    if (age < 18) {
      setLocalError('Debes ser mayor de 18 años para registrarte.');
      return;
    }
    await signUpEmail(name, email, password, year).catch(() => undefined);
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <BrandBackground />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandVideo />
        </div>

        <div className="rounded-3xl border border-white/10 bg-boom-panel/88 p-6 shadow-glow backdrop-blur-xl sm:p-8">
          <h1 className="text-center text-xl font-bold text-white sm:text-2xl">
            {mode === 'login' ? 'Entra a Liveboom' : 'Crea tu cuenta'}
          </h1>
          <p className="mt-2 text-center text-sm text-zinc-400">
            Lives, regalos y comunidad en un solo lugar.
          </p>

          <form className="mt-8 space-y-3" onSubmit={(event) => void onSubmit(event)}>
            {mode === 'register' ? (
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre"
                className="h-11 w-full rounded-xl bg-black/40 px-4 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-boom-cyan/60"
              />
            ) : null}
            {mode === 'register' ? (
              <label className="block text-left text-xs text-zinc-400">
                Año de nacimiento
                <input
                  required
                  type="number"
                  min={minBirthYear}
                  max={maxBirthYear}
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl bg-black/40 px-4 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-boom-cyan/60"
                />
              </label>
            ) : null}
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo"
              className="h-11 w-full rounded-xl bg-black/40 px-4 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-boom-cyan/60"
            />
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              className="h-11 w-full rounded-xl bg-black/40 px-4 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-boom-cyan/60"
            />
            {mode === 'register' ? (
              <label className="flex items-start gap-2 text-left text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 accent-boom-cyan"
                />
                <span>
                  Acepto los{' '}
                  <Link to="/legal/terminos" className="text-boom-cyan underline">
                    Términos y Condiciones
                  </Link>
                  , el{' '}
                  <Link to="/legal/privacidad" className="text-boom-cyan underline">
                    Aviso de Privacidad
                  </Link>{' '}
                  y la{' '}
                  <Link to="/legal/cookies" className="text-boom-cyan underline">
                    Política de Cookies
                  </Link>
                  .
                </span>
              </label>
            ) : null}
            {localError ? <p className="text-sm text-boom-fuchsia">{localError}</p> : null}
            {error ? <p className="text-sm text-boom-fuchsia">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="h-11 w-full rounded-xl bg-gradient-to-r from-boom-cyan to-boom-orange text-sm font-bold text-zinc-950 transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? 'Entrando…' : mode === 'login' ? 'Continuar' : 'Crear cuenta'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            <span className="h-px flex-1 bg-white/10" />
            o
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void signInGoogle().catch(() => undefined)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-zinc-900"
          >
            <GoogleIcon />
            Continuar con Google
          </button>

          <button
            type="button"
            className="mt-6 w-full text-center text-sm text-zinc-400 hover:text-white"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>

          <LegalFooter compact />
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.5v2.9h3.8c2.3-2.1 3.6-5.2 3.6-8.5z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.4v3.1C3.4 21.4 7.4 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.4c-.2-.7-.4-1.4-.4-2.4s.1-1.7.4-2.4V6.5H1.4C.5 8.2 0 10.1 0 12s.5 3.8 1.4 5.5l3.9-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.7 0 3.3.6 4.5 1.7l3.4-3.4C17.9 1.1 15.2 0 12 0 7.4 0 3.4 2.6 1.4 6.5l3.9 3.1C6.2 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}
