import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Shield, Trash2, UserPlus } from 'lucide-react';
import { listAdminUsers, type AdminUserRow } from '../../lib/adminUsersFirestore';
import {
  SUPER_ADMIN_CAPABILITIES,
  SUPER_ADMIN_CAPABILITY_LABELS,
  SUPER_ADMIN_OWNER_EMAIL,
  allSuperAdminCapabilities,
  isOwnerEmail,
  type SuperAdminCapability,
  type SuperAdminGrants,
} from '../../lib/superAdmin';
import { listenSuperAdmins, saveSuperAdminDelegation } from '../../lib/superAdminsFirestore';
import { useAuthStore } from '../../store/authStore';

function capsFor(email: string, grants: SuperAdminGrants): SuperAdminCapability[] {
  if (Object.prototype.hasOwnProperty.call(grants, email)) return grants[email] || [];
  return allSuperAdminCapabilities();
}

function CapabilityGrid({
  value,
  onChange,
  disabled,
}: {
  value: SuperAdminCapability[];
  onChange: (next: SuperAdminCapability[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(value);
  const allOn = SUPER_ADMIN_CAPABILITIES.every((id) => selected.has(id));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(allSuperAdminCapabilities())}
          className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${
            allOn ? 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40' : 'bg-zinc-800 text-zinc-300'
          }`}
        >
          Dar todo
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([])}
          className="min-h-10 rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-zinc-300"
        >
          Quitar todo
        </button>
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {SUPER_ADMIN_CAPABILITIES.map((id) => {
          const on = selected.has(id);
          return (
            <label
              key={id}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm ${
                on ? 'bg-fuchsia-500/15 text-fuchsia-100' : 'bg-zinc-900/80 text-zinc-400'
              }`}
            >
              <input
                type="checkbox"
                className="accent-fuchsia-400"
                checked={on}
                disabled={disabled}
                onChange={() => {
                  if (on) onChange(value.filter((item) => item !== id));
                  else onChange(SUPER_ADMIN_CAPABILITIES.filter((item) => item === id || selected.has(item)));
                }}
              />
              {SUPER_ADMIN_CAPABILITY_LABELS[id]}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Solo el owner: delegar Super Admin y elegir qué función puede hacer cada uno.
 */
export function AdminDelegatePanel() {
  const profile = useAuthStore((s) => s.profile);
  const email = profile?.email ?? '';
  const owner = isOwnerEmail(email);

  const [superEmails, setSuperEmails] = useState<string[]>([]);
  const [grants, setGrants] = useState<SuperAdminGrants>({});
  const [drafts, setDrafts] = useState<SuperAdminGrants>({});
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [newCaps, setNewCaps] = useState<SuperAdminCapability[]>(allSuperAdminCapabilities());
  const [q, setQ] = useState('');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!owner) return;
    return listenSuperAdmins((doc) => {
      const emails = doc?.emails ?? [SUPER_ADMIN_OWNER_EMAIL];
      const nextGrants = doc?.grants ?? {};
      setSuperEmails(emails);
      setGrants(nextGrants);
      setDrafts((prev) => {
        const merged: SuperAdminGrants = { ...prev };
        for (const item of emails) {
          if (isOwnerEmail(item)) continue;
          if (!Object.prototype.hasOwnProperty.call(merged, item)) {
            merged[item] = capsFor(item, nextGrants);
          }
        }
        return merged;
      });
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

  async function persist(nextEmails: string[], nextGrants: SuperAdminGrants, okMsg: string) {
    setSaving(true);
    setNote(null);
    try {
      await saveSuperAdminDelegation(nextEmails, nextGrants, email);
      setGrants(nextGrants);
      setNote(okMsg);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo guardar la delegación');
    } finally {
      setSaving(false);
    }
  }

  function grantsForSave(extra?: { email: string; caps: SuperAdminCapability[] }): SuperAdminGrants {
    const next: SuperAdminGrants = {};
    for (const item of delegated) {
      next[item] = drafts[item] ?? capsFor(item, grants);
    }
    if (extra) next[extra.email] = extra.caps;
    return next;
  }

  async function delegateEmail(target: string, caps = newCaps) {
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
      setNote('Ya es super admin. Ajusta sus funciones abajo.');
      return;
    }
    await persist(
      [...superEmails, e],
      grantsForSave({ email: e, caps }),
      caps.length === SUPER_ADMIN_CAPABILITIES.length
        ? `Delegado con todas las funciones: ${e}`
        : `Delegado: ${e} (${caps.map((id) => SUPER_ADMIN_CAPABILITY_LABELS[id]).join(', ') || 'sin funciones'})`,
    );
    setManualEmail('');
    setDrafts((prev) => ({ ...prev, [e]: caps }));
  }

  async function savePerson(target: string) {
    const caps = drafts[target] ?? capsFor(target, grants);
    await persist(
      superEmails,
      grantsForSave({ email: target, caps }),
      `Funciones actualizadas para ${target}`,
    );
  }

  async function revokeEmail(target: string) {
    if (isOwnerEmail(target)) return;
    const nextEmails = superEmails.filter((x) => x.toLowerCase() !== target.toLowerCase());
    const nextGrants = { ...grantsForSave() };
    delete nextGrants[target];
    await persist(nextEmails, nextGrants, `Revocado: ${target}`);
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[target];
      return copy;
    });
  }

  if (!owner) {
    return (
      <div className="lb-panel rounded-2xl p-6 text-center text-sm text-zinc-400">
        Solo el dueño ({SUPER_ADMIN_OWNER_EMAIL}) decide qué hace cada Super Admin.
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
          Tú eres el dueño. Puedes dar <span className="text-zinc-300">todas</span> las funciones a
          una persona o limitarlas: mensajes, regalos, Blast, publicidad, niveles de marcos,
          comunidad, solicitudes, retiro y verificación. El dueño no se puede quitar.
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
          <ul className="mt-2 space-y-3">
            {delegated.map((e) => {
              const match = users.find((u) => u.email.toLowerCase() === e.toLowerCase());
              const caps = drafts[e] ?? capsFor(e, grants);
              return (
                <li key={e} className="space-y-3 rounded-xl bg-zinc-900/80 p-3">
                  <div className="flex items-center justify-between gap-2">
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
                  </div>
                  <CapabilityGrid
                    value={caps}
                    disabled={saving}
                    onChange={(next) => setDrafts((prev) => ({ ...prev, [e]: next }))}
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void savePerson(e)}
                    className="min-h-11 w-full rounded-xl bg-cyan-500/20 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-400/30 disabled:opacity-50"
                  >
                    Guardar funciones
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-zinc-500">
          Añadir por email
        </h3>
        <p className="mt-1 text-[11px] text-zinc-500">
          Elige las funciones antes de delegar. “Dar todo” asigna las nueve.
        </p>
        <div className="mt-2 space-y-3">
          <input
            type="email"
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
            placeholder="correo@gmail.com (el de su cuenta LiveBoom)"
            className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
          <CapabilityGrid value={newCaps} onChange={setNewCaps} disabled={saving} />
          <button
            type="button"
            disabled={saving || !manualEmail.trim()}
            onClick={() => void delegateEmail(manualEmail, newCaps)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 text-sm font-bold text-zinc-950 disabled:opacity-50"
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
          Usa las mismas funciones marcadas arriba (o cámbialas) y delega con un toque.
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
                  onClick={() => void delegateEmail(u.email, newCaps)}
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
