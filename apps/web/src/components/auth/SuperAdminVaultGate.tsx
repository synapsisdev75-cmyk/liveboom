import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, ShieldCheck } from 'lucide-react';
import { reauthenticateSuperAdminWithGoogle } from '../../lib/superAdminGoogleReauth';
import {
  DEFAULT_SESSION_TTL_MIN,
  getVaultLockout,
  registerVaultFailure,
  fetchSuperAdminSecurity,
} from '../../lib/superAdminSecurity';
import { useAuthStore } from '../../store/authStore';
import { useSuperAdminVaultStore } from '../../store/superAdminVaultStore';

type Props = { children: React.ReactNode };

/**
 * Bóveda Super Admin sincronizada con Google Auth:
 * 1) Ya eres allowlist Super Admin
 * 2) Re-login real con Google
 * 3) Sesión Firestore con caducidad (reglas exigen esto para escribir)
 */
export function SuperAdminVaultGate({ children }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const uid = firebaseUser?.uid || profile?.id || '';
  const email = profile?.email ?? firebaseUser?.email ?? '';

  const unlocked = useSuperAdminVaultStore((s) => s.unlocked);
  const checking = useSuperAdminVaultStore((s) => s.checking);
  const hydrate = useSuperAdminVaultStore((s) => s.hydrate);
  const unlock = useSuperAdminVaultStore((s) => s.unlock);
  const touch = useSuperAdminVaultStore((s) => s.touch);
  const lock = useSuperAdminVaultStore((s) => s.lock);

  const [ttlMin, setTtlMin] = useState(DEFAULT_SESSION_TTL_MIN);
  const [maxFailures, setMaxFailures] = useState(5);
  const [lockoutMinutes, setLockoutMinutes] = useState(30);
  const [lockedUntilMs, setLockedUntilMs] = useState(0);
  const [failures, setFailures] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    void hydrate(uid);
  }, [uid, hydrate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const sec = await fetchSuperAdminSecurity();
        if (!cancelled && sec) {
          setTtlMin(sec.sessionTtlMin);
          setMaxFailures(sec.maxFailures);
          setLockoutMinutes(sec.lockoutMinutes);
        }
      } catch {
        /* defaults OK */
      }
      if (uid) {
        try {
          const lockout = await getVaultLockout(uid);
          if (!cancelled) {
            setFailures(lockout.failures);
            setLockedUntilMs(lockout.lockedUntilMs);
          }
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!unlocked || !uid) return;
    const onActivity = () => touch(uid);
    const events = ['pointerdown', 'keydown', 'mousemove', 'touchstart', 'scroll'] as const;
    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true });
    return () => {
      for (const ev of events) window.removeEventListener(ev, onActivity);
    };
  }, [unlocked, uid, touch]);

  const lockedNow = lockedUntilMs > Date.now();
  const lockRemainingMin = useMemo(
    () => Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 60_000)),
    [lockedUntilMs],
  );

  async function handleGoogleUnlock() {
    if (!uid || !email) return;
    setBusy(true);
    setError(null);
    try {
      if (lockedNow) {
        throw new Error(`Bóveda bloqueada. Reintenta en ~${lockRemainingMin} min.`);
      }
      await reauthenticateSuperAdminWithGoogle({
        expectedUid: uid,
        expectedEmail: email,
      });
      await unlock({ uid, email, ttlMin });
      setFailures(0);
      setLockedUntilMs(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo abrir con Google';
      try {
        const result = await registerVaultFailure(uid, email, maxFailures, lockoutMinutes);
        setFailures(result.failures);
        setLockedUntilMs(result.lockedUntilMs);
      } catch {
        /* ignore */
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-zinc-950 text-sm text-zinc-500">
        Sincronizando bóveda con Google…
      </div>
    );
  }

  if (unlocked) {
    return (
      <div onPointerDown={() => touch(uid)} onKeyDown={() => touch(uid)}>
        <div className="sticky top-0 z-[80] border-b border-emerald-500/30 bg-emerald-950/90 px-3 py-2 text-center text-[11px] text-emerald-100 backdrop-blur">
          Bóveda abierta con Google · sesión limitada ·{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => void lock(uid, email)}
          >
            Cerrar bóveda
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <div className="lb-panel space-y-5 rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <Lock className="h-8 w-8 text-fuchsia-400" />
          <div>
            <h1 className="text-lg font-bold text-white">Abrir Super Admin</h1>
            <p className="text-xs text-zinc-500">
              Confirmación real con tu cuenta Google · sesión ~{ttlMin} min
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
          <p className="font-semibold text-white">Cuenta</p>
          <p className="mt-1 break-all text-cyan-200">{email || '—'}</p>
          <p className="mt-2 text-[11px] text-zinc-500">
            Google te pedirá iniciar sesión de nuevo. Debe ser exactamente esta cuenta.
          </p>
        </div>

        {lockedNow ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            Demasiados intentos. Bloqueado ~{lockRemainingMin} minutos.
          </p>
        ) : null}

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {failures > 0 && !lockedNow ? (
          <p className="text-xs text-amber-200/90">
            Intentos fallidos: {failures}/{maxFailures}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy || lockedNow || !uid}
          onClick={() => void handleGoogleUnlock()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-900 disabled:opacity-50"
        >
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          {busy ? 'Esperando Google…' : 'Abrir con Google'}
        </button>

        <Link
          to="/perfil/editar"
          className="block text-center text-sm text-zinc-400 underline hover:text-zinc-200"
        >
          Cancelar
        </Link>
      </div>
    </div>
  );
}
