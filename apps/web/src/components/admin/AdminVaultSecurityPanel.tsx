import { useCallback, useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { fetchAdminAuditPage, type AdminAuditLog } from '../../admin/api';
import { isOwnerEmail } from '../../lib/superAdmin';
import { DEFAULT_SESSION_TTL_MIN, SESSION_CONTINUE_ANSWER_MS, SESSION_CONTINUE_BEFORE_MS } from '../../lib/superAdminSecurity';
import { useAuthStore } from '../../store/authStore';
import { useSuperAdminVaultStore } from '../../store/superAdminVaultStore';

function formatWhen(ms: number) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Info de seguridad: la apertura va sincronizada con Google Auth. */
export function AdminVaultSecurityPanel() {
  const profile = useAuthStore((s) => s.profile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const email = profile?.email ?? '';
  const uid = firebaseUser?.uid || profile?.id || '';
  const owner = isOwnerEmail(email);
  const lock = useSuperAdminVaultStore((s) => s.lock);
  const expiresAtMs = useSuperAdminVaultStore((s) => s.expiresAtMs);
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (append = false, cursor?: string | null) => {
      if (!owner) return;
      setLoading(true);
      setError(null);
      try {
        const page = await fetchAdminAuditPage(cursor || null);
        setLogs((prev) => (append ? [...prev, ...page.logs] : page.logs));
        setNextCursor(page.nextCursor || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar la auditoría');
      } finally {
        setLoading(false);
      }
    },
    [owner],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="lb-panel space-y-4 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white">Seguridad / Google</h2>
        </div>
        <p className="text-sm text-zinc-300">
          La bóveda se abre con una <span className="text-white">reautenticación real de Google</span>{' '}
          (mismo UID y email). Las publicaciones del panel y las APIs administrativas requieren esa sesión.
        </p>
        <ul className="list-inside list-disc space-y-1 text-xs text-zinc-500">
          <li>TTL de sesión: {DEFAULT_SESSION_TTL_MIN} min (todos los Super Admins)</li>
          <li>
            Aviso «¿continúas en línea?» a los {Math.round(SESSION_CONTINUE_BEFORE_MS / 60_000)} min
            antes del cierre
          </li>
          <li>
            Sin respuesta en {Math.round(SESSION_CONTINUE_ANSWER_MS / 1000)} s → se cierra la bóveda
          </li>
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
            Solo el owner ve esta pestaña. Los delegados también deben confirmar Google para escribir.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void lock(uid, email)}
          className="min-h-11 rounded-xl border border-amber-500/40 px-4 py-2 text-sm text-amber-200 hover:border-amber-400"
        >
          Cerrar bóveda ahora
        </button>
      </div>

      {owner ? (
        <section className="lb-panel space-y-3 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white">Registro de auditoría</h3>
            <button
              type="button"
              onClick={() => void load(false)}
              className="min-h-11 rounded-xl border border-zinc-700 px-3 text-sm text-zinc-300"
            >
              Actualizar
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Inmutable. Sin contraseñas, tokens ni números de cuenta. Fecha del servidor.
          </p>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {loading && logs.length === 0 ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
          {!loading && logs.length === 0 ? (
            <p className="text-sm text-zinc-500">Aún no hay eventos administrativos.</p>
          ) : null}
          <ul className="space-y-2">
            {logs.map((log) => (
              <li key={log.id} className="rounded-xl bg-black/30 px-3 py-2 text-xs text-zinc-300">
                <p className="font-semibold text-white">
                  {log.action} · {log.result || 'ok'}
                </p>
                <p className="text-zinc-500">
                  {formatWhen(log.createdAtMs)} · {log.actorEmail} · {log.resourceType} {log.resourceId}
                </p>
                {log.reason ? <p className="mt-1 text-amber-100">{log.reason}</p> : null}
              </li>
            ))}
          </ul>
          {nextCursor ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(true, nextCursor)}
              className="min-h-11 text-sm text-cyan-300 disabled:opacity-50"
            >
              Cargar más
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
