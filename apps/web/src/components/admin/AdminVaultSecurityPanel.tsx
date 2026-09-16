import { Shield } from 'lucide-react';
import { isOwnerEmail } from '../../lib/superAdmin';
import { DEFAULT_SESSION_TTL_MIN, IDLE_LOCK_MS } from '../../lib/superAdminSecurity';
import { useAuthStore } from '../../store/authStore';
import { useSuperAdminVaultStore } from '../../store/superAdminVaultStore';

/** Info de seguridad: la apertura va sincronizada con Google Auth. */
export function AdminVaultSecurityPanel() {
  const profile = useAuthStore((s) => s.profile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const email = profile?.email ?? '';
  const uid = firebaseUser?.uid || profile?.id || '';
  const owner = isOwnerEmail(email);
  const lock = useSuperAdminVaultStore((s) => s.lock);
  const expiresAtMs = useSuperAdminVaultStore((s) => s.expiresAtMs);

  return (
    <div className="lb-panel space-y-4 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-cyan-400" />
        <h2 className="text-base font-bold text-white">Seguridad / Google</h2>
      </div>
      <p className="text-sm text-zinc-300">
        La bóveda se abre con una <span className="text-white">reautenticación real de Google</span>{' '}
        (mismo UID y email). Las publicaciones del panel requieren esa sesión en Firestore.
      </p>
      <ul className="list-inside list-disc space-y-1 text-xs text-zinc-500">
        <li>TTL de sesión por defecto: {DEFAULT_SESSION_TTL_MIN} min</li>
        <li>Cierre por inactividad: {Math.round(IDLE_LOCK_MS / 60_000)} min</li>
        <li>Al cerrar sesión de la app, la bóveda también se cierra</li>
        {expiresAtMs > Date.now() ? (
          <li>
            Sesión actual válida hasta{' '}
            {new Date(expiresAtMs).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </li>
        ) : null}
      </ul>
      {owner ? (
        <p className="text-[11px] text-amber-200/80">
          Solo el owner ve esta pestaña. Los delegados también deben confirmar Google para
          escribir.
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void lock(uid, email)}
        className="rounded-xl border border-amber-500/40 px-4 py-2 text-sm text-amber-200 hover:border-amber-400"
      >
        Cerrar bóveda ahora
      </button>
    </div>
  );
}
