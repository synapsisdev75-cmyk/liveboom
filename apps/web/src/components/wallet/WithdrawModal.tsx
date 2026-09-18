import { useMemo, useState } from 'react';
import {
  COIN_TO_COP,
  MIN_WITHDRAW_COINS,
  coinsToCop,
  formatCop,
} from '../../lib/coinPackages';
import { normalizeBlastBalances } from '../../lib/blastBalances';
import { createWithdrawalRequest } from '../../lib/withdrawalsFirestore';
import { useAuthStore } from '../../store/authStore';

type Props = {
  onClose: () => void;
  onDone?: () => void;
  initialCoins?: number;
};

export function WithdrawModal({ onClose, onDone, initialCoins }: Props) {
  const profile = useAuthStore((state) => state.profile);
  const setBlastBalances = useAuthStore((state) => state.setBlastBalances);
  const syncProfile = useAuthStore((state) => state.syncProfile);

  const balances = normalizeBlastBalances({
    coinsBalance: profile?.coinsBalance,
    purchasedBlastBalance: profile?.purchasedBlastBalance,
    earnedBlastBalance: profile?.earnedBlastBalance,
    earnedBlastSpent: profile?.earnedBlastSpent,
    earnedBlastWithdrawn: profile?.earnedBlastWithdrawn,
  });
  /** Solo los Blast ganados (regalos, llamadas y videollamadas) son retirables. */
  const withdrawable = balances.earnedBlastBalance;
  const purchased = balances.purchasedBlastBalance;

  const suggested = Math.min(
    withdrawable,
    initialCoins && initialCoins > 0
      ? initialCoins
      : Math.max(MIN_WITHDRAW_COINS, Math.min(withdrawable, 100)),
  );

  const [coins, setCoinsInput] = useState(String(Math.max(0, suggested)));
  const [fullName, setFullName] = useState(profile?.displayName || '');
  const [documentId, setDocumentId] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('Nequi');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('ahorros');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const coinsNum = Math.floor(Number(coins) || 0);
  const payoutCop = useMemo(() => coinsToCop(coinsNum), [coinsNum]);

  async function submit() {
    if (!profile?.firebaseUid) {
      setNote('Inicia sesión para retirar');
      return;
    }
    setBusy(true);
    setNote(null);
    setOk(false);
    try {
      const result = await createWithdrawalRequest({
        uid: profile.firebaseUid,
        username: profile.handle || '',
        displayName: profile.displayName || profile.handle || 'Usuario',
        email: profile.email || '',
        avatarUrl: profile.avatarUrl ?? null,
        blast: coinsNum,
        fullName,
        documentId,
        payoutMethod,
        accountNumber,
        accountType,
      });
      setBlastBalances({
        purchasedBlastBalance: result.purchasedBlastBalance,
        earnedBlastBalance: result.earnedBlastBalance,
        coinsBalance: result.coinsBalance,
      });
      void syncProfile().catch(() => undefined);
      setOk(true);
      setNote(
        `Solicitud registrada: ${result.blast.toLocaleString('es-CO')} blast = ${formatCop(
          result.amountCop,
        )}. El Super Admin la revisará.`,
      );
      onDone?.();
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo registrar el retiro');
    } finally {
      setBusy(false);
    }
  }

  const belowMin = coinsNum < MIN_WITHDRAW_COINS;
  const overBalance = coinsNum > withdrawable;

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
            <h2 className="text-lg font-bold text-white">Retirar ganancias</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Solo se retiran los Blast ganados por regalos, llamadas y videollamadas.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-white">
            Cerrar
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/5 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/90">
              Ganados (retirables)
            </p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-200">
              {withdrawable.toLocaleString('es-CO')} blast · {formatCop(coinsToCop(withdrawable))}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
              Comprados (no retirables)
            </p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-300">
              {purchased.toLocaleString('es-CO')} blast
            </p>
          </div>
        </div>

        <p className="mt-2 text-xs text-zinc-500">
          Mínimo de retiro: {MIN_WITHDRAW_COINS.toLocaleString('es-CO')} blast (
          {formatCop(coinsToCop(MIN_WITHDRAW_COINS))})
          {initialCoins && initialCoins > 0
            ? ` · De este live: ${formatCop(coinsToCop(initialCoins))}`
            : ''}
        </p>

        <label className="mt-4 block text-xs font-semibold text-zinc-400">
          Monto a retirar (COP)
          <input
            type="number"
            inputMode="numeric"
            min={coinsToCop(MIN_WITHDRAW_COINS)}
            max={coinsToCop(withdrawable)}
            step={COIN_TO_COP}
            value={coinsNum > 0 ? String(coinsToCop(coinsNum)) : coins}
            onChange={(event) => {
              const cop = Math.max(0, Math.floor(Number(event.target.value) || 0));
              const asBlast = Math.floor(cop / COIN_TO_COP);
              setCoinsInput(String(asBlast));
            }}
            className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-emerald-400">
            Recibirás {formatCop(payoutCop)} ({coinsNum.toLocaleString('es-CO')} blast)
          </p>
          {withdrawable >= MIN_WITHDRAW_COINS ? (
            <button
              type="button"
              onClick={() => setCoinsInput(String(withdrawable))}
              className="rounded-full border border-emerald-400/40 px-3 py-1 text-[11px] font-semibold text-emerald-200"
            >
              Retirar todo
            </button>
          ) : null}
        </div>

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
              <option>PayPal</option>
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
          <p className={`mt-4 text-sm ${ok ? 'text-emerald-400' : 'text-fuchsia-400'}`}>{note}</p>
        ) : null}
        {!note && overBalance ? (
          <p className="mt-4 text-sm text-fuchsia-400">
            Solo puedes retirar tus Blast ganados ({withdrawable.toLocaleString('es-CO')}). Las
            recargas no son retirables.
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-4 py-2 text-sm text-zinc-400"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || belowMin || overBalance}
            onClick={() => void submit()}
            className="min-h-11 rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50"
          >
            {busy ? 'Enviando…' : `Solicitar ${formatCop(payoutCop)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
