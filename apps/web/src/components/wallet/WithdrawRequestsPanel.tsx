import { useEffect, useMemo, useState } from 'react';
import { formatCop } from '../../lib/coinPackages';
import {
  WITHDRAWAL_STATUS_CLASS,
  WITHDRAWAL_STATUS_LABEL,
  formatWithdrawalDate,
  listenMyWithdrawalRequests,
  summarizeWithdrawals,
  type WithdrawalRequest,
} from '../../lib/withdrawalsFirestore';

type Props = {
  uid: string | null | undefined;
};

/** Espacio del cliente: sus solicitudes de retiro con fecha, hora, blast y estado. */
export function WithdrawRequestsPanel({ uid }: Props) {
  const [rows, setRows] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = listenMyWithdrawalRequests(
      uid,
      (list) => {
        setRows(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  const totals = useMemo(() => summarizeWithdrawals(rows), [rows]);

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Mis solicitudes de retiro</h2>
          <p className="text-[11px] text-zinc-500">
            Solo se retiran Blast ganados por regalos, llamadas y videollamadas.
          </p>
        </div>
        {totals.count > 0 ? (
          <div className="text-right text-[11px] text-zinc-400">
            <p>
              En revisión:{' '}
              <span className="font-bold text-amber-200">
                {totals.pendingBlast.toLocaleString('es-CO')} blast
              </span>
            </p>
            <p>
              Pagado:{' '}
              <span className="font-bold text-emerald-300">{formatCop(totals.paidCop)}</span>
            </p>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-3 text-sm text-zinc-500">Cargando solicitudes…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          Aún no has solicitado retiros. Las recargas aparecen en tu saldo al instante.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((item) => (
            <li key={item.id} className="rounded-xl bg-black/30 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-white">
                    −{item.blast.toLocaleString('es-CO')} blast → {formatCop(item.amountCop)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatWithdrawalDate(item.createdAtMs)} · {item.payoutMethod || '—'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    WITHDRAWAL_STATUS_CLASS[item.status]
                  }`}
                >
                  {WITHDRAWAL_STATUS_LABEL[item.status]}
                </span>
              </div>
              {item.reviewNote ? (
                <p className="mt-1.5 text-[11px] text-zinc-400">Nota: {item.reviewNote}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
