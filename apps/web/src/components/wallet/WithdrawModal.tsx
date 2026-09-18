import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatMoneyExact, statusLabel } from '../../lib/moneyDisplay';
import { fetchPayoutQuote, fetchWalletSummary } from '../../lib/walletApi';
import { useAuthStore } from '../../store/authStore';

type Props = {
  onClose: () => void;
  onDone?: () => void;
  initialCoins?: number;
};

type Step = 'form' | 'confirm' | 'done';

export function WithdrawModal({ onClose, onDone, initialCoins }: Props) {
  const profile = useAuthStore((state) => state.profile);
  const setBlastBalances = useAuthStore((state) => state.setBlastBalances);
  const syncProfile = useAuthStore((state) => state.syncProfile);
  const [earnedBlast, setEarnedBlast] = useState(0);
  const [availableMoney, setAvailableMoney] = useState('0.0000');
  const [minWithdrawAmount, setMinWithdrawAmount] = useState<string | null>(null);
  const [currency, setCurrency] = useState('COP');
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<Step>('form');

  useEffect(() => {
    let cancelled = false;
    void fetchWalletSummary()
      .then((summary) => {
        if (cancelled) return;
        setEarnedBlast(Math.max(0, Math.floor(Number(summary.earnedAvailable) || 0)));
        setAvailableMoney(String(summary.withdrawableAmount || '0.0000'));
        setMinWithdrawAmount(summary.minWithdrawAmount || null);
        setCurrency(summary.currency || 'COP');
        setBlastBalances({
          purchasedBlastBalance: summary.purchasedBalance,
          earnedBlastBalance: summary.earnedAvailable,
          coinsBalance: summary.totalAvailable,
        });
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.firebaseUid, setBlastBalances]);

  const suggested = Math.min(
    earnedBlast,
    initialCoins && initialCoins > 0 ? initialCoins : earnedBlast,
  );

  const [coins, setCoinsInput] = useState(String(Math.max(0, suggested)));
  const [quoteMoney, setQuoteMoney] = useState<string | null>(null);
  const [fullName, setFullName] = useState(profile?.displayName || '');
  const [documentId, setDocumentId] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('Nequi');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('ahorros');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [doneMoney, setDoneMoney] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    setCoinsInput(String(Math.max(0, suggested)));
  }, [loaded, suggested]);

  const coinsNum = Math.floor(Number(coins) || 0);

  useEffect(() => {
    if (!loaded || coinsNum <= 0) {
      setQuoteMoney(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchPayoutQuote(coinsNum)
        .then((quote) => {
          if (cancelled) return;
          setQuoteMoney(quote.moneyAmountExact);
          setNote(null);
        })
        .catch((error) => {
          if (cancelled) return;
          setQuoteMoney(null);
          setNote(error instanceof Error ? error.message : 'No se pudo cotizar el retiro');
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [coinsNum, loaded]);

  const displayMoney = quoteMoney || availableMoney;

  async function submit() {
    setBusy(true);
    setNote(null);
    try {
      const result = await api<{
        coinsBalance: number;
        purchasedBlastBalance?: number;
        earnedBlastBalance?: number;
        withdrawableBalance?: number;
        moneyAmountExact?: string;
        currency?: string;
        message?: string;
        detail?: string;
        status?: string;
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
      if (result.purchasedBlastBalance != null || result.earnedBlastBalance != null) {
        setBlastBalances({
          purchasedBlastBalance: Number(result.purchasedBlastBalance) || 0,
          earnedBlastBalance: Number(result.earnedBlastBalance) || 0,
          coinsBalance: Number(result.coinsBalance) || 0,
        });
      }
      setDoneMoney(result.moneyAmountExact || displayMoney);
      setStep('done');
      await syncProfile();
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo retirar');
      setStep('form');
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
      <div className="lb-safe-sheet max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[color:var(--lb-line,rgba(255,255,255,0.1))] bg-[color:var(--lb-surface,#09090b)] p-4 sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[color:var(--lb-text,#fff)]">
              {step === 'done' ? 'Retiro solicitado' : 'Retirar ganancias'}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {step === 'done'
                ? 'Tu solicitud de retiro fue recibida correctamente.'
                : 'Solo ganancias disponibles. Los BLAST comprados no se retiran.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 px-2 text-sm text-zinc-500 hover:text-white">
            Cerrar
          </button>
        </div>

        {step === 'done' ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-emerald-400">
              El dinero se desembolsará en tu cuenta en un plazo de 3 a 5 días hábiles.
            </p>
            <p className="text-sm font-semibold text-[color:var(--lb-text,#fff)]">
              Monto solicitado {formatMoneyExact(doneMoney, currency)}
            </p>
            <p className="text-sm text-zinc-400">Estado {statusLabel('REQUESTED')}</p>
            <button
              type="button"
              onClick={() => {
                onDone?.();
                onClose();
              }}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-bold text-zinc-950 sm:w-auto"
            >
              Listo
            </button>
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-zinc-500">
              Ganancias disponibles
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              BLAST ganados {earnedBlast.toLocaleString('es-CO')}
            </p>
            <p className="mt-2 text-2xl font-black tabular-nums text-emerald-400">
              {formatMoneyExact(availableMoney, currency)}
            </p>
            <p className="mt-1 text-xs font-semibold text-emerald-300/90">Disponible para retirar</p>
            {minWithdrawAmount ? (
              <p className="mt-1 text-xs text-zinc-500">
                Mínimo {formatMoneyExact(minWithdrawAmount, currency)}
              </p>
            ) : null}

            {step === 'confirm' ? (
              <div className="mt-5 space-y-4">
                <p className="text-lg font-bold text-[color:var(--lb-text,#fff)]">
                  Monto a retirar {formatMoneyExact(displayMoney, currency)}
                </p>
                {note ? <p className="text-sm text-fuchsia-400">{note}</p> : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setStep('form')}
                    className="min-h-11 px-4 text-sm text-zinc-400"
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    disabled={busy || !loaded}
                    onClick={() => void submit()}
                    className="min-h-11 rounded-full bg-emerald-500 px-6 text-sm font-bold text-zinc-950 disabled:opacity-50"
                  >
                    {busy ? 'Enviando…' : 'Confirmar retiro'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <label className="mt-4 block text-xs font-semibold text-zinc-400">
                  BLAST ganados a retirar
                  <input
                    type="number"
                    min={0}
                    max={earnedBlast}
                    step={1}
                    value={coins}
                    onChange={(event) => setCoinsInput(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
                  />
                </label>
                <p className="mt-2 text-sm font-semibold text-emerald-400">
                  Monto a retirar {formatMoneyExact(displayMoney, currency)}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-zinc-400 sm:col-span-2">
                    Nombre del titular
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-zinc-400">
                    Cédula / documento
                    <input
                      value={documentId}
                      onChange={(event) => setDocumentId(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-zinc-400">
                    Medio de pago
                    <select
                      value={payoutMethod}
                      onChange={(event) => setPayoutMethod(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
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
                      className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
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
                      className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
                    />
                  </label>
                </div>

                {note ? <p className="mt-4 text-sm text-fuchsia-400">{note}</p> : null}

                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={onClose} className="min-h-11 px-4 text-sm text-zinc-400">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={busy || !loaded || coinsNum <= 0 || coinsNum > earnedBlast || !quoteMoney}
                    onClick={() => setStep('confirm')}
                    className="min-h-11 rounded-full bg-emerald-500 px-6 text-sm font-bold text-zinc-950 disabled:opacity-50"
                  >
                    Retirar
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
