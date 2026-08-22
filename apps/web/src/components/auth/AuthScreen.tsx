import { useState, type FormEvent } from 'react';
import { Logo } from '../brand/Logo';
import { useAuthStore } from '../../store/authStore';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const signInEmail = useAuthStore((s) => s.signInEmail);
  const signUpEmail = useAuthStore((s) => s.signUpEmail);
  const signInGoogle = useAuthStore((s) => s.signInGoogle);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'login') {
      await signInEmail(email, password).catch(() => undefined);
      return;
    }
    await signUpEmail(name, email, password).catch(() => undefined);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,240,255,0.12),_transparent_55%)]" />
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#131417]/80 p-8 shadow-glow backdrop-blur-xl">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <h1 className="text-center text-2xl font-bold text-white">
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
          {error ? <p className="text-sm text-boom-fuchsia">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-xl bg-boom-cyan text-sm font-bold text-zinc-950 transition hover:brightness-110 disabled:opacity-60"
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
