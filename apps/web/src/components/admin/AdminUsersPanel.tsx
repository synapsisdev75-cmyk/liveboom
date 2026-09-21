import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Coins, ExternalLink, Minus, Plus, RefreshCw, Search, Shield, Users } from 'lucide-react';
import {
  fetchAdminUsersPage,
  newIdempotencyKey,
  patchAdminUserBlast,
  patchAdminUserXp,
  type AdminUserRow,
} from '../../admin/api';
import { isOwnerEmail } from '../../lib/superAdmin';
import { listenSuperAdmins, saveSuperAdminEmails } from '../../lib/superAdminsFirestore';
import { useAuthStore } from '../../store/authStore';

type Filter = 'all' | 'online' | 'offline';

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function applyBlastSummary(
  row: AdminUserRow,
  summary: {
    purchasedBalance: number;
    earnedAvailable: number;
    earnedReserved: number;
    coinsBalance: number;
  },
): AdminUserRow {
  return {
    ...row,
    purchasedBlastBalance: summary.purchasedBalance,
    earnedBlastBalance: summary.earnedAvailable,
    earnedBlastReserved: summary.earnedReserved,
    coinsBalance: summary.coinsBalance,
  };
}

export function AdminUsersPanel() {
  const profile = useAuthStore((s) => s.profile);
  const owner = isOwnerEmail(profile?.email);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [xpDraft, setXpDraft] = useState<Record<string, string>>({});
  const [purchasedDraft, setPurchasedDraft] = useState<Record<string, string>>({});
  const [earnedDraft, setEarnedDraft] = useState<Record<string, string>>({});
  const [blastExpanded, setBlastExpanded] = useState<Record<string, boolean>>({});
  const [xpBusy, setXpBusy] = useState<string | null>(null);
  const [blastBusy, setBlastBusy] = useState<string | null>(null);
  const [xpMsg, setXpMsg] = useState<string | null>(null);
  const [superEmails, setSuperEmails] = useState<string[]>([]);
  const [delegateBusy, setDelegateBusy] = useState<string | null>(null);
  const loadGen = useRef(0);

  useEffect(() => {
    if (!owner) return;
    return listenSuperAdmins((doc) => setSuperEmails(doc?.emails ?? []));
  }, [owner]);

  const superSet = useMemo(
    () => new Set(superEmails.map((e) => e.toLowerCase())),
    [superEmails],
  );

  const mergeDrafts = useCallback((rows: AdminUserRow[]) => {
    setXpDraft((prev) => {
      const next = { ...prev };
      for (const u of rows) {
        if (next[u.uid] === undefined) next[u.uid] = String(u.levelXp);
      }
      return next;
    });
    setPurchasedDraft((prev) => {
      const next = { ...prev };
      for (const u of rows) {
        if (next[u.uid] === undefined) next[u.uid] = String(u.purchasedBlastBalance);
      }
      return next;
    });
    setEarnedDraft((prev) => {
      const next = { ...prev };
      for (const u of rows) {
        if (next[u.uid] === undefined) next[u.uid] = String(u.earnedBlastBalance);
      }
      return next;
    });
  }, []);

  const load = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null; q?: string }) => {
      const gen = ++loadGen.current;
      const append = Boolean(opts?.append);
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await fetchAdminUsersPage({
          q: opts?.q,
          cursor: opts?.cursor || null,
        });
        if (gen !== loadGen.current) return;
        setUsers((prev) => (append ? [...prev, ...page.users] : page.users));
        setNextCursor(page.nextCursor || null);
        setTotal(page.total || 0);
        mergeDrafts(page.users);
      } catch (err) {
        if (gen !== loadGen.current) return;
        setError(err instanceof Error ? err.message : 'No se pudieron cargar usuarios');
      } finally {
        if (gen === loadGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [mergeDrafts],
  );

  useEffect(() => {
    void load({ q: qApplied });
  }, [load, qApplied]);

  const onlineCount = users.filter((u) => u.online).length;
  const offlineCount = users.length - onlineCount;

  const visible = useMemo(() => {
    return users.filter((u) => {
      if (filter === 'online' && !u.online) return false;
      if (filter === 'offline' && u.online) return false;
      return true;
    });
  }, [users, filter]);

  function patchUser(uid: string, patch: Partial<AdminUserRow>) {
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, ...patch } : u)));
  }

  async function onSetXp(uid: string) {
    const value = Math.max(0, Math.floor(Number(xpDraft[uid]) || 0));
    if (!window.confirm(`¿Fijar el nivel de este usuario en ${value.toLocaleString('es-CO')} XP? Dejará de subir con regalos hasta que lo liberes.`)) {
      return;
    }
    setXpBusy(uid);
    setXpMsg(null);
    try {
      const res = await patchAdminUserXp(uid, { mode: 'set', value });
      patchUser(uid, {
        levelXp: res.after.effective,
        levelXpPinned: res.after.pinned,
        levelXpOrganic: res.after.organic,
      });
      setXpDraft((prev) => ({ ...prev, [uid]: String(res.after.effective) }));
      setXpMsg(`Nivel fijado en ${res.after.effective.toLocaleString('es-CO')} XP`);
    } catch (err) {
      setXpMsg(err instanceof Error ? err.message : 'Error al guardar XP');
    } finally {
      setXpBusy(null);
    }
  }

  async function onAdjustXp(uid: string, delta: number) {
    setXpBusy(uid);
    setXpMsg(null);
    try {
      const res = await patchAdminUserXp(uid, { mode: 'adjust', value: delta });
      patchUser(uid, {
        levelXp: res.after.effective,
        levelXpPinned: res.after.pinned,
        levelXpOrganic: res.after.organic,
      });
      setXpDraft((prev) => ({ ...prev, [uid]: String(res.after.effective) }));
      setXpMsg(`${delta >= 0 ? '+' : ''}${delta} XP → ${res.after.effective.toLocaleString('es-CO')}`);
    } catch (err) {
      setXpMsg(err instanceof Error ? err.message : 'Error al ajustar XP');
    } finally {
      setXpBusy(null);
    }
  }

  async function onClearPin(uid: string) {
    setXpBusy(uid);
    setXpMsg(null);
    try {
      const res = await patchAdminUserXp(uid, { mode: 'clear' });
      patchUser(uid, {
        levelXp: res.after.effective,
        levelXpPinned: null,
        levelXpOrganic: res.after.organic,
      });
      setXpDraft((prev) => ({ ...prev, [uid]: String(res.after.effective) }));
      setXpMsg(`Nivel liberado → ${res.after.effective.toLocaleString('es-CO')} XP (orgánico)`);
    } catch (err) {
      setXpMsg(err instanceof Error ? err.message : 'Error al liberar nivel');
    } finally {
      setXpBusy(null);
    }
  }

  async function onAdjustBlast(uid: string, bucket: 'purchased' | 'earned', delta: number) {
    const label = bucket === 'purchased' ? 'BLAST comprados (no retirables)' : 'BLAST ganados (retirables)';
    if (
      !window.confirm(
        `¿Aplicar ${delta >= 0 ? '+' : ''}${delta} a ${label}? Esta operación usa la billetera oficial y queda en auditoría.`,
      )
    ) {
      return;
    }
    setBlastBusy(uid);
    setXpMsg(null);
    try {
      const res = await patchAdminUserBlast(uid, {
        bucket,
        delta,
        idempotencyKey: newIdempotencyKey('admin-blast'),
      });
      const row = users.find((u) => u.uid === uid);
      if (row && res.summary) {
        const next = applyBlastSummary(row, res.summary);
        patchUser(uid, next);
        setPurchasedDraft((prev) => ({ ...prev, [uid]: String(next.purchasedBlastBalance) }));
        setEarnedDraft((prev) => ({ ...prev, [uid]: String(next.earnedBlastBalance) }));
      }
      setXpMsg(
        `${delta >= 0 ? '+' : ''}${delta} ${bucket === 'purchased' ? 'comprados' : 'ganados'} → total ${res.summary.coinsBalance.toLocaleString('es-CO')}${
          res.duplicate ? ' (idempotente)' : ''
        }`,
      );
    } catch (err) {
      setXpMsg(err instanceof Error ? err.message : 'Error al ajustar Blast');
    } finally {
      setBlastBusy(null);
    }
  }

  async function onSetBucket(uid: string, bucket: 'purchased' | 'earned') {
    const row = users.find((u) => u.uid === uid);
    if (!row) return;
    const raw = bucket === 'purchased' ? purchasedDraft[uid] : earnedDraft[uid];
    const target = Math.max(0, Math.floor(Number(raw) || 0));
    const current = bucket === 'purchased' ? row.purchasedBlastBalance : row.earnedBlastBalance;
    const delta = target - current;
    if (!delta) {
      setXpMsg('El valor ya coincide con el saldo oficial.');
      return;
    }
    await onAdjustBlast(uid, bucket, delta);
  }

  async function onDelegate(user: AdminUserRow) {
    if (!owner || !profile?.email) return;
    const em = user.email.trim().toLowerCase();
    if (!em || isOwnerEmail(em) || superSet.has(em)) return;
    if (!window.confirm(`¿Delegar Super Admin a ${em}? Recibirá todas las funciones hasta que las limites en Delegar.`)) {
      return;
    }
    setDelegateBusy(user.uid);
    setXpMsg(null);
    try {
      await saveSuperAdminEmails([...superEmails, em], profile.email);
      setXpMsg(`Delegado Super Admin: ${em}`);
    } catch (err) {
      setXpMsg(err instanceof Error ? err.message : 'No se pudo delegar');
    } finally {
      setDelegateBusy(null);
    }
  }

  async function onRevoke(user: AdminUserRow) {
    if (!owner || !profile?.email) return;
    const em = user.email.trim().toLowerCase();
    if (!em || isOwnerEmail(em)) return;
    if (!window.confirm(`¿Quitar Super Admin a ${em}?`)) return;
    setDelegateBusy(user.uid);
    setXpMsg(null);
    try {
      await saveSuperAdminEmails(
        superEmails.filter((x) => x.toLowerCase() !== em),
        profile.email,
      );
      setXpMsg(`Revocado Super Admin: ${em}`);
    } catch (err) {
      setXpMsg(err instanceof Error ? err.message : 'No se pudo revocar');
    } finally {
      setDelegateBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="lb-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Users size={18} className="text-cyan-300" />
            Usuarios registrados
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {total.toLocaleString('es-CO')} en Firestore · esta vista {users.length}
            {' · '}
            <span className="text-emerald-400">{onlineCount} en línea (página)</span>
            {' · '}
            <span className="text-zinc-400">{offlineCount} desconectados (página)</span>
            {owner ? (
              <span className="mt-1 block">
                BLAST comprados y ganados se ajustan por separado en la billetera oficial. Los comprados no son
                retirables.
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load({ q: qApplied })}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {xpMsg ? (
        <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">{xpMsg}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', `Todos (${users.length})`],
            ['online', `En línea (${onlineCount})`],
            ['offline', `Desconectados (${offlineCount})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`min-h-11 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === id
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="lb-panel relative flex gap-2 rounded-2xl p-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQApplied(q.trim());
        }}
      >
        <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por @usuario, email o UID exacto…"
          className="min-h-11 w-full rounded-xl border border-transparent bg-transparent py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
        />
        <button
          type="submit"
          className="min-h-11 shrink-0 rounded-xl bg-cyan-500/20 px-4 text-sm font-semibold text-cyan-100"
        >
          Buscar
        </button>
      </form>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
      ) : null}

      {loading && users.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">Cargando usuarios…</p>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">No hay usuarios con ese filtro.</p>
      ) : (
        <ul className="lb-panel divide-y divide-white/5 overflow-hidden rounded-2xl">
          {visible.map((u) => (
            <li key={u.uid} className="flex flex-col gap-3 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative shrink-0">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover ring-1 ring-white/10" />
                    ) : (
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-zinc-800 text-sm font-bold text-cyan-200">
                        {(u.displayName || u.username || '?').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-zinc-900 ${
                        u.online ? 'bg-emerald-400' : 'bg-zinc-600'
                      }`}
                      title={u.online ? 'En línea' : 'Desconectado'}
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {u.displayName}
                      {u.online ? (
                        <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-px text-[10px] font-bold text-emerald-300">
                          EN LÍNEA
                        </span>
                      ) : (
                        <span className="ml-2 rounded bg-zinc-700/80 px-1.5 py-px text-[10px] font-bold text-zinc-400">OFF</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      @{u.username || 'sin-user'} · {u.email || 'sin email'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      XP {u.levelXp.toLocaleString('es-CO')}
                      {u.levelXpPinned != null ? (
                        <span className="ml-1 rounded bg-amber-500/20 px-1 py-px font-bold text-amber-300">FIJADO</span>
                      ) : null}
                      {' · '}
                      <button
                        type="button"
                        onClick={() =>
                          setBlastExpanded((prev) => ({
                            ...prev,
                            [u.uid]: !prev[u.uid],
                          }))
                        }
                        className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-amber-300 hover:text-amber-200"
                      >
                        <Coins size={10} className="inline" />
                        Total {u.coinsBalance.toLocaleString('es-CO')} · ganados {u.earnedBlastBalance.toLocaleString('es-CO')} ·
                        comprados {u.purchasedBlastBalance.toLocaleString('es-CO')}
                        <ChevronDown size={10} className={`transition ${blastExpanded[u.uid] ? 'rotate-180' : ''}`} />
                      </button>
                      {' · Alta '}
                      {formatWhen(u.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-center">
                  {owner && u.email && !isOwnerEmail(u.email) ? (
                    superSet.has(u.email.toLowerCase()) ? (
                      <button
                        type="button"
                        disabled={delegateBusy === u.uid}
                        onClick={() => void onRevoke(u)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-semibold text-rose-200 disabled:opacity-50"
                      >
                        <Shield size={12} />
                        Quitar super
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={delegateBusy === u.uid}
                        onClick={() => void onDelegate(u)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 text-xs font-semibold text-fuchsia-200 disabled:opacity-50"
                      >
                        <Shield size={12} />
                        Delegar super
                      </button>
                    )
                  ) : null}
                  {owner && isOwnerEmail(u.email) ? (
                    <span className="inline-flex min-h-11 items-center rounded-xl bg-fuchsia-500/20 px-3 text-[10px] font-bold uppercase text-fuchsia-200">
                      Dueño
                    </span>
                  ) : null}
                  <Link
                    to={u.profilePath}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-200"
                  >
                    Ver perfil
                    <ExternalLink size={12} />
                  </Link>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-900/60 p-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">XP</span>
                <button
                  type="button"
                  disabled={xpBusy === u.uid}
                  onClick={() => void onAdjustXp(u.uid, -100)}
                  className="inline-flex h-11 items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 text-xs font-bold text-red-200 disabled:opacity-50"
                >
                  <Minus size={12} /> 100
                </button>
                <button
                  type="button"
                  disabled={xpBusy === u.uid}
                  onClick={() => void onAdjustXp(u.uid, -10)}
                  className="inline-flex h-11 items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/5 px-2 text-xs font-semibold text-red-200/90 disabled:opacity-50"
                >
                  <Minus size={12} /> 10
                </button>
                <input
                  type="number"
                  min={0}
                  value={xpDraft[u.uid] ?? String(u.levelXp)}
                  onChange={(e) => setXpDraft((prev) => ({ ...prev, [u.uid]: e.target.value }))}
                  className="h-11 w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm text-white"
                />
                <button
                  type="button"
                  disabled={xpBusy === u.uid}
                  onClick={() => void onSetXp(u.uid)}
                  className="h-11 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200 disabled:opacity-50"
                >
                  Fijar
                </button>
                {u.levelXpPinned != null ? (
                  <button
                    type="button"
                    disabled={xpBusy === u.uid}
                    onClick={() => void onClearPin(u.uid)}
                    className="h-11 rounded-lg border border-zinc-600 px-3 text-xs font-semibold text-zinc-300 disabled:opacity-50"
                  >
                    Liberar
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={xpBusy === u.uid}
                  onClick={() => void onAdjustXp(u.uid, 10)}
                  className="inline-flex h-11 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2 text-xs font-semibold text-emerald-200/90 disabled:opacity-50"
                >
                  <Plus size={12} /> 10
                </button>
                <button
                  type="button"
                  disabled={xpBusy === u.uid}
                  onClick={() => void onAdjustXp(u.uid, 100)}
                  className="inline-flex h-11 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 text-xs font-bold text-emerald-200 disabled:opacity-50"
                >
                  <Plus size={12} /> 100
                </button>
              </div>

              {blastExpanded[u.uid] ? (
                <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2">
                  {u.earnedBlastReserved > 0 ? (
                    <p className="text-[11px] text-amber-100">
                      Reservado en retiro: {u.earnedBlastReserved.toLocaleString('es-CO')} (no se toca desde aquí).
                    </p>
                  ) : null}
                  {(
                    [
                      ['earned', 'Ganados (retirables)', earnedDraft, setEarnedDraft],
                      ['purchased', 'Comprados (no retirables)', purchasedDraft, setPurchasedDraft],
                    ] as const
                  ).map(([bucket, label, draft, setDraft]) => (
                    <div key={bucket} className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex min-w-[9.5rem] items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                        <Coins size={11} />
                        {label}
                      </span>
                      <button
                        type="button"
                        disabled={blastBusy === u.uid}
                        onClick={() => void onAdjustBlast(u.uid, bucket, -100)}
                        className="inline-flex h-11 items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 text-xs font-bold text-red-200 disabled:opacity-50"
                      >
                        <Minus size={12} /> 100
                      </button>
                      <button
                        type="button"
                        disabled={blastBusy === u.uid}
                        onClick={() => void onAdjustBlast(u.uid, bucket, -10)}
                        className="inline-flex h-11 items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/5 px-2 text-xs font-semibold text-red-200/90 disabled:opacity-50"
                      >
                        <Minus size={12} /> 10
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={draft[u.uid] ?? String(bucket === 'earned' ? u.earnedBlastBalance : u.purchasedBlastBalance)}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [u.uid]: e.target.value }))}
                        className="h-11 w-28 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm text-white"
                      />
                      <button
                        type="button"
                        disabled={blastBusy === u.uid}
                        onClick={() => void onSetBucket(u.uid, bucket)}
                        className="h-11 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200 disabled:opacity-50"
                      >
                        Fijar
                      </button>
                      <button
                        type="button"
                        disabled={blastBusy === u.uid}
                        onClick={() => void onAdjustBlast(u.uid, bucket, 10)}
                        className="inline-flex h-11 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2 text-xs font-semibold text-emerald-200/90 disabled:opacity-50"
                      >
                        <Plus size={12} /> 10
                      </button>
                      <button
                        type="button"
                        disabled={blastBusy === u.uid}
                        onClick={() => void onAdjustBlast(u.uid, bucket, 100)}
                        className="inline-flex h-11 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 text-xs font-bold text-emerald-200 disabled:opacity-50"
                      >
                        <Plus size={12} /> 100
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {nextCursor && !qApplied ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void load({ append: true, cursor: nextCursor, q: qApplied })}
          className="min-h-11 w-full rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 disabled:opacity-50"
        >
          {loadingMore ? 'Cargando…' : 'Cargar más'}
        </button>
      ) : null}
    </div>
  );
}
