import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Shield, Trash2, UserPlus } from 'lucide-react';
import { listAdminUsers, type AdminUserRow } from '../../lib/adminUsersFirestore';
import { isOwnerEmail, SUPER_ADMIN_OWNER_EMAIL } from '../../lib/superAdmin';
import { listenSuperAdmins, saveSuperAdminEmails } from '../../lib/superAdminsFirestore';
import { useAuthStore } from '../../store/authStore';

/**
 * Solo el owner: delegar acceso Super Admin a otros emails registrados.
 */
export function AdminDelegatePanel() {
  const profile = useAuthStore((s) => s.profile);
  const email = profile?.email ?? '';
  const owner = isOwnerEmail(email);

  const [superEmails, setSuperEmails] = useState<string[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [q, setQ] = useState('');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!owner) return;
    return listenSuperAdmins((doc) => {
      setSuperEmails(doc?.emails ?? [SUPER_ADMIN_OWNER_EMAIL]);
    });
  }, [owner]);

  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    setLoadingUsers(true);
    void listAdminUsers(300)
      .then((rows) => {
        if (!cancelled) setUsers(rows);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [owner]);

  const delegated = useMemo(
    () => superEmails.filter((e) => !isOwnerEmail(e)),
    [superEmails],
  );

  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, '');
    const superSet = new Set(superEmails.map((e) => e.toLowerCase()));
    return users
      .filter((u) => {
        const em = (u.email || '').toLowerCase();
        if (!em || isOwnerEmail(em) || superSet.has(em)) return false;
        if (!needle) return true;
        return (
          u.username.toLowerCase().includes(needle) ||
          u.displayName.toLowerCase().includes(needle) ||
          em.includes(needle)
        );
      })
      .slice(0, 40);
  }, [users, superEmails, q]);

  async function persist(next: string[], okMsg: string) {
    setSaving(true);
    setNote(null);
    try {
      await saveSuperAdminEmails(next, email);
      setNote(okMsg);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo guardar la delegación');
    } finally {
      setSaving(false);
    }
  }

  async function delegateEmail(target: string) {
    const e = target.trim().toLowerCase();
    if (!e.includes('@')) {
      setNote('Email inválido.');
      return;
    }
    if (isOwnerEmail(e)) {
      setNote('Ese email ya es el dueño.');
      return;
    }
    if (superEmails.map((x) => x.toLowerCase()).includes(e)) {
      setNote('Ya es super admin.');
      return;
    }
    await persist([...superEmails, e], `Delegado: ${e} ya puede entrar a /super-admin`);
    setManualEmail('');
  }

  async function revokeEmail(target: string) {
    if (isOwnerEmail(target)) return;
    await persist(
      superEmails.filter((x) => x.toLowerCase() !== target.toLowerCase()),
      `Revocado: ${target}`,
    );
  }

  if (!owner) {
    return (
      <div className="lb-panel rounded-2xl p-6 text-center text-sm text-zinc-400">
        Solo el dueño ({SUPER_ADMIN_OWNER_EMAIL}) puede delegar Super Admin.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="lb-panel rounded-2xl p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Shield size={16} className="text-fuchsia-400" />
          Delegar Super Admin
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Quienes delegues podrán abrir <span className="text-zinc-300">/super-admin</span>, ver el
          panel y enviar pedidos de UI. Solo tú apruebas pedidos y gestionas esta lista. El dueño no
          se puede quitar.
        </p>

        <div className="mt-4 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-100">
          Dueño: <span className="font-semibold">{SUPER_ADMIN_OWNER_EMAIL}</span>
        </div>

        {note ? (
          <p className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            {note}
          </p>
        ) : null}

        <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-zinc-500">
          Delegados actuales ({delegated.length})
        </h3>
        {delegated.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Aún no has delegado a nadie.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {delegated.map((e) => {
              const match = users.find((u) => u.email.toLowerCase() === e.toLowerCase());
              return (
                <li
                  key={e}
                  className="flex items-center justify-between gap-2 rounded-xl bg-zinc-900/80 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {match ? `@${match.username}` : e}
                    </p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {match ? `${match.displayName} · ${e}` : 'Email delegado'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void revokeEmail(e)}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-rose-500/15 px-3 text-xs font-semibold text-rose-200 ring-1 ring-rose-400/30 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    Quitar
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-zinc-500">
          Añadir por email
        </h3>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
            placeholder="correo@gmail.com (el de su cuenta LiveBoom)"
            className="min-h-11 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            disabled={saving || !manualEmail.trim()}
            onClick={() => void delegateEmail(manualEmail)}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 text-sm font-bold text-zinc-950 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Delegar
          </button>
        </div>
      </section>

      <section className="lb-panel rounded-2xl p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <UserPlus size={16} className="text-cyan-300" />
          Delegar desde usuarios registrados
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Busca por @usuario, nombre o email y delegan con un toque.
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar usuario…"
          className="mt-3 w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
        />
        {loadingUsers ? (
          <p className="mt-4 text-center text-sm text-zinc-500">Cargando usuarios…</p>
        ) : candidates.length === 0 ? (
          <p className="mt-4 text-center text-sm text-zinc-500">
            No hay candidatos (sin email, ya delegados, o sin coincidencias).
          </p>
        ) : (
          <ul className="mt-3 max-h-[50dvh] space-y-2 overflow-y-auto overscroll-contain">
            {candidates.map((u) => (
              <li
                key={u.uid}
                className="flex items-center justify-between gap-2 rounded-xl bg-zinc-900/70 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {u.avatarUrl ? (
                    <img
                      src={u.avatarUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fuchsia-600/30 text-sm font-bold text-fuchsia-100">
                      {(u.displayName || u.username).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">@{u.username}</p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {u.displayName} · {u.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void delegateEmail(u.email)}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-cyan-500/20 px-3 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-400/30 disabled:opacity-50"
                >
                  <Shield size={14} />
                  Delegar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
