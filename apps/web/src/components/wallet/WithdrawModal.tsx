import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import {
  MIN_WITHDRAW_COINS,
  coinsToCop,
  formatCop,
} from '../../lib/coinPackages';
import { useAuthStore } from '../../store/authStore';

type Props = {
  onClose: () => void;
  onDone?: () => void;
  initialCoins?: number;
};

export function WithdrawModal({ onClose, onDone, initialCoins }: Props) {
  const profile = useAuthStore((state) => state.profile);
  const setCoins = useAuthStore((state) => state.setCoins);
  const syncProfile = useAuthStore((state) => state.syncProfile);
  const balance = profile?.coinsBalance ?? 0;
  const suggested = Math.min(
    balance,
    initialCoins && initialCoins > 0
      ? initialCoins
      : Math.max(MIN_WITHDRAW_COINS, Math.min(balance, 100)),
  );

  const [coins, setCoinsInput] = useState(String(Math.max(0, suggested)));
  const [fullName, setFullName] = useState(profile?.displayName || '');
  const [documentId, setDocumentId] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('Nequi');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('ahorros');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const coinsNum = Math.floor(Number(coins) || 0);
  const payoutCop = useMemo(() => coinsToCop(coinsNum), [coinsNum]);

  async function submit() {
    setBusy(true);
    setNote(null);
    try {
      const result = await api<{
        coinsBalance: number;
        message?: string;
      }>('/api/payments/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          coins: coinsNum,
          fullName,
          documentId,
          payoutMethod,
          accountNumber,
          accountType,
        }),
      });
      setCoins(result.coinsBalance);
      await syncProfile();
      setNote(result.message || 'Retiro solicitado.');
      onDone?.();
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo retirar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lb-safe-sheet max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-4 sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Retirar blast</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Retira tu blast a pesos colombianos (COP).
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-white">
            Cerrar
          </button>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Saldo disponible: {balance.toLocaleString('es-CO')} blast · Mínimo {MIN_WITHDRAW_COINS} blast
          {initialCoins && initialCoins > 0
            ? ` · Generado en este live: ${initialCoins.toLocaleString('es-CO')}`
            : ''}
        </p>

        <label className="mt-4 block text-xs font-semibold text-zinc-400">
          Blast a retirar
          <input
            type="number"
            min={MIN_WITHDRAW_COINS}
            max={balance}
            value={coins}
            onChange={(event) => setCoinsInput(event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
          />
        </label>
        <p className="mt-2 text-sm font-semibold text-emerald-400">
          Recibirás {formatCop(payoutCop)}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-zinc-400 sm:col-span-2">
            Nombre del titular
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
            />
          </label>
          <label className="block text-xs font-semibold text-zinc-400">
            Cédula / documento
            <input
              value={documentId}
              onChange={(event) => setDocumentId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
            />
          </label>
          <label className="block text-xs font-semibold text-zinc-400">
            Medio de pago
            <select
              value={payoutMethod}
              onChange={(event) => setPayoutMethod(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
            >
              <option>Nequi</option>
              <option>Daviplata</option>
              <option>Bancolombia</option>
              <option>Davivienda</option>
              <option>Otro banco</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-zinc-400">
            Tipo de cuenta
            <select
              value={accountType}
              onChange={(event) => setAccountType(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="ahorros">Ahorros</option>
              <option value="corriente">Corriente</option>
              <option value="billetera">Billetera digital</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-zinc-400 sm:col-span-2">
            Número de cuenta / celular
            <input
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
            />
          </label>
        </div>

        {note ? (
          <p
            className={`mt-4 text-sm ${
              note.includes('registrada') || note.includes('Solicitud') ? 'text-emerald-400' : 'text-fuchsia-400'
            }`}
          >
            {note}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zinc-400">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || coinsNum < MIN_WITHDRAW_COINS || coinsNum > balance}
            onClick={() => void submit()}
            className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50"
          >
            {busy ? 'Enviando…' : `Retirar ${formatCop(payoutCop)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
