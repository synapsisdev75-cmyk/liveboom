import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Minus, Plus, RefreshCw, Search, Users } from 'lucide-react';
import { listAdminUsers, type AdminUserRow } from '../../lib/adminUsersFirestore';
import { adjustLevelXp, profileHref, setLevelXp } from '../../lib/profileFirestore';

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

export function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [xpDraft, setXpDraft] = useState<Record<string, string>>({});
  const [xpBusy, setXpBusy] = useState<string | null>(null);
  const [xpMsg, setXpMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listAdminUsers(250);
      setUsers(rows);
      setXpDraft((prev) => {
        const next = { ...prev };
        for (const u of rows) {
          if (next[u.uid] === undefined) next[u.uid] = String(u.levelXp);
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onlineCount = users.filter((u) => u.online).length;
  const offlineCount = users.length - onlineCount;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, '');
    return users.filter((u) => {
      if (filter === 'online' && !u.online) return false;
      if (filter === 'offline' && u.online) return false;
      if (!needle) return true;
      return (
        u.username.toLowerCase().includes(needle) ||
        u.displayName.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle)
      );
    });
  }, [users, filter, q]);

  function patchUserXp(uid: string, nextXp: number) {
    setUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, levelXp: nextXp } : u)),
    );
    setXpDraft((prev) => ({ ...prev, [uid]: String(nextXp) }));
  }

  async function onSetXp(uid: string) {
    const raw = xpDraft[uid];
    const value = Math.max(0, Math.floor(Number(raw) || 0));
    setXpBusy(uid);
    setXpMsg(null);
    try {
      const next = await setLevelXp(uid, value);
      patchUserXp(uid, next);
      setXpMsg(`XP fijado a ${next.toLocaleString('es-CO')}`);
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
      const next = await adjustLevelXp(uid, delta);
      if (next == null) return;
      patchUserXp(uid, next);
      setXpMsg(
        delta >= 0
          ? `+${delta} XP → ${next.toLocaleString('es-CO')}`
          : `${delta} XP → ${next.toLocaleString('es-CO')}`,
      );
    } catch (err) {
      setXpMsg(err instanceof Error ? err.message : 'Error al ajustar XP');
    } finally {
      setXpBusy(null);
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
            {users.length} registrados ·{' '}
            <span className="text-emerald-400">{onlineCount} en línea</span> ·{' '}
            <span className="text-zinc-400">{offlineCount} desconectados</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {xpMsg ? (
        <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">
          {xpMsg}
        </p>
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
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === id
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="lb-panel relative block rounded-2xl p-2">
        <Search
          size={14}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, @usuario o email…"
          className="w-full rounded-xl border border-transparent bg-transparent py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
        />
      </label>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
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
                      <img
                        src={u.avatarUrl}
                        alt=""
                        className="h-11 w-11 rounded-full object-cover ring-1 ring-white/10"
                      />
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
                        <span className="ml-2 rounded bg-zinc-700/80 px-1.5 py-px text-[10px] font-bold text-zinc-400">
                          OFF
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      @{u.username || 'sin-user'} · {u.email || 'sin email'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      XP {u.levelXp.toLocaleString('es-CO')} · Coins{' '}
                      {u.coinsBalance.toLocaleString('es-CO')} · Alta {formatWhen(u.createdAt)}
                    </p>
                  </div>
                </div>
                <Link
                  to={u.profilePath || profileHref(u.username, u.uid)}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 self-start rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-200 sm:self-center"
                >
                  Ver perfil
                  <ExternalLink size={12} />
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-900/60 p-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  XP
                </span>
                <button
                  type="button"
                  disabled={xpBusy === u.uid}
                  onClick={() => void onAdjustXp(u.uid, -100)}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 text-xs font-bold text-red-200 disabled:opacity-50"
                  title="Quitar 100 XP"
                >
                  <Minus size={12} /> 100
                </button>
                <button
                  type="button"
                  disabled={xpBusy === u.uid}
                  onClick={() => void onAdjustXp(u.uid, -10)}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/5 px-2 text-xs font-semibold text-red-200/90 disabled:opacity-50"
                  title="Quitar 10 XP"
                >
                  <Minus size={12} /> 10
                </button>
                <input
                  type="number"
                  min={0}
                  value={xpDraft[u.uid] ?? String(u.levelXp)}
                  onChange={(e) =>
                    setXpDraft((prev) => ({ ...prev, [u.uid]: e.target.value }))
                  }
                  className="h-9 w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm text-white"
                />
                <button
                  type="button"
                  disabled={xpBusy === u.uid}
                  onClick={() => void onSetXp(u.uid)}
                  className="h-9 rounded-lg border border-zinc-600 px-3 text-xs font-semibold text-zinc-200 disabled:opacity-50"
                >
                  Fijar
                </button>
                <button
                  type="button"
                  disabled={xpBusy === u.uid}
                  onClick={() => void onAdjustXp(u.uid, 10)}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2 text-xs font-semibold text-emerald-200/90 disabled:opacity-50"
                  title="Sumar 10 XP"
                >
                  <Plus size={12} /> 10
                </button>
                <button
                  type="button"
                  disabled={xpBusy === u.uid}
                  onClick={() => void onAdjustXp(u.uid, 100)}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 text-xs font-bold text-emerald-200 disabled:opacity-50"
                  title="Sumar 100 XP"
                >
                  <Plus size={12} /> 100
                </button>
                <button
                  type="button"
                  disabled={xpBusy === u.uid}
                  onClick={() => {
                    void (async () => {
                      setXpBusy(u.uid);
                      try {
                        const next = await setLevelXp(u.uid, 0);
                        patchUserXp(u.uid, next);
                        setXpMsg('XP puesto en 0');
                      } catch (err) {
                        setXpMsg(err instanceof Error ? err.message : 'Error');
                      } finally {
                        setXpBusy(null);
                      }
                    })();
                  }}
                  className="h-9 rounded-lg border border-amber-500/40 px-3 text-xs font-semibold text-amber-200 disabled:opacity-50"
                >
                  Reset 0
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
