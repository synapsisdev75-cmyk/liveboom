import { useEffect, useState } from 'react';
import { formatMoneyExact, statusLabel } from '../../lib/moneyDisplay';
import { fetchWalletWithdrawals, quotedCop, type PublicWithdrawal } from '../../lib/walletApi';
import { useT } from '../../i18n';

function formatRequestedAt(value: string | null | undefined) {
  if (!value) return '';
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString('es-CO');
}

export function WithdrawalRequestsPanel() {
  const t = useT();
  const [rows, setRows] = useState<PublicWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchWalletWithdrawals()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-400">{t('common.loading')}</p>;
  }
  if (error) {
    return <p className="text-sm text-fuchsia-300">{error}</p>;
  }
  if (!rows.length) {
    return <p className="text-sm text-zinc-400">{t('settings.withdrawalsEmpty')}</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row, index) => {
        const money = quotedCop(row) ?? 0;
        const key = row.withdrawalId || row.paymentReference || `wd-${index}`;
        return (
          <li
            key={key}
            className="flex min-h-11 flex-col gap-1 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                {t('settings.withdrawalsAmount')}
              </p>
              <p className="text-sm font-semibold text-white">
                {formatMoneyExact(money, row.currency || 'COP')}
              </p>
              <p className="text-xs text-zinc-500">{formatRequestedAt(row.requestedAt)}</p>
            </div>
            <div className="shrink-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                {t('settings.withdrawalsStatus')}
              </p>
              <p className="text-sm font-semibold text-emerald-300">{statusLabel(row.status)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
