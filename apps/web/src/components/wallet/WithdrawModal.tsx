import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatMoneyExact, statusLabel } from '../../lib/moneyDisplay';
import { fetchPayoutQuote, fetchWalletSummary, quotedCop } from '../../lib/walletApi';
import {
  fetchVerificationCase,
  prepareWithdrawal,
  statusLabel as verificationStatusLabel,
  type VerificationAccount,
  type VerificationCase,
} from '../../lib/verificationApi';
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
  const [availableMoney, setAvailableMoney] = useState<number | string>('0');
  const [minWithdrawAmount, setMinWithdrawAmount] = useState<number | string | null>(null);
  const [currency, setCurrency] = useState('COP');
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [verification, setVerification] = useState<VerificationCase | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchWalletSummary(), fetchVerificationCase().catch(() => null)])
      .then(([summary, caseRow]) => {
        if (cancelled) return;
        setEarnedBlast(
          Math.max(
            0,
            Math.floor(Number(summary.earnedBlastAvailable ?? summary.earnedAvailable) || 0),
          ),
        );
        setAvailableMoney(quotedCop(summary) ?? summary.withdrawableAmount ?? 0);
        setMinWithdrawAmount(summary.minWithdrawAmount ?? null);
        setCurrency(summary.currency || 'COP');
        setBlastBalances({
          purchasedBlastBalance: summary.purchasedBalance,
          earnedBlastBalance: summary.earnedAvailable,
          coinsBalance: summary.totalAvailable,
        });
        setVerification(caseRow);
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

  const verifiedAccounts = (verification?.accounts || []).filter(
    (item) => item.status === 'verified',
  );
  const [coins, setCoinsInput] = useState(String(Math.max(0, suggested)));
  const [quoteMoney, setQuoteMoney] = useState<number | string | null>(null);
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [doneMoney, setDoneMoney] = useState<number | string | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [issuedCode, setIssuedCode] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [confirmMeta, setConfirmMeta] = useState<{
    legalName: string;
    bank?: string;
    accountType?: string;
    accountNumberMasked?: string;
    expiresAtMs?: number;
  } | null>(null);
  const idempotencyKeyRef = useRef('');
  const boundPayloadRef = useRef('');

  useEffect(() => {
    if (!loaded) return;
    setCoinsInput(String(Math.max(0, suggested)));
  }, [loaded, suggested]);

  useEffect(() => {
    if (!accountId && verifiedAccounts[0]?.id) setAccountId(verifiedAccounts[0].id);
  }, [accountId, verifiedAccounts]);

  const coinsNum = Math.floor(Number(coins) || 0);
  const selectedAccount: VerificationAccount | undefined = verifiedAccounts.find(
    (item) => item.id === accountId,
  );

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
          setQuoteMoney(quotedCop(quote) ?? quote.moneyAmountExact ?? null);
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
  const canWithdraw = Boolean(verification?.canWithdraw && selectedAccount);

  function clientIdempotencyKey() {
    const sig = [coinsNum, accountId].join('|');
    if (!idempotencyKeyRef.current || boundPayloadRef.current !== sig) {
      idempotencyKeyRef.current = crypto.randomUUID();
      boundPayloadRef.current = sig;
    }
    return idempotencyKeyRef.current;
  }

  async function prepare() {
    if (!selectedAccount) return;
    setBusy(true);
    setNote(null);
    try {
      const prepared = await prepareWithdrawal({
        coins: coinsNum,
        accountId: selectedAccount.id,
      });
      setConfirmId(prepared.confirmId);
      setIssuedCode(prepared.code);
      setConfirmCode('');
      setConfirmMeta({
        legalName: prepared.legalName || prepared.holderName || selectedAccount.holderName,
        bank: prepared.bank || selectedAccount.bank,
        accountType: prepared.accountType || selectedAccount.accountType,
        accountNumberMasked: prepared.accountNumberMasked || selectedAccount.accountNumberMasked,
        expiresAtMs: prepared.expiresAtMs,
      });
      setQuoteMoney(prepared.moneyAmountExact);
      setStep('confirm');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo preparar el retiro');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!selectedAccount) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await api<{
        coinsBalance: number;
        purchasedBlastBalance?: number;
        earnedBlastBalance?: number;
        moneyAmountExact?: string;
        currency?: string;
      }>('/api/payments/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          coins: coinsNum,
          accountId: selectedAccount.id,
          confirmId,
          confirmCode,
          idempotencyKey: clientIdempotencyKey(),
        }),
      });
      if (result.purchasedBlastBalance != null || result.earnedBlastBalance != null) {
        setBlastBalances({
          purchasedBlastBalance: Number(result.purchasedBlastBalance) || 0,
          earnedBlastBalance: Number(result.earnedBlastBalance) || 0,
          coinsBalance: Number(result.coinsBalance) || 0,
        });
      }
      setDoneMoney(quotedCop(result) ?? result.moneyAmountExact ?? displayMoney);
      setStep('done');
      await syncProfile();
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
      <div className="lb-safe-sheet max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[color:var(--lb-line,rgba(255,255,255,0.1))] bg-[color:var(--lb-surface,#09090b)] p-4 sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[color:var(--lb-text,#fff)]">
              {step === 'done'
                ? 'Retiro solicitado'
                : step === 'confirm'
                  ? 'Confirmar retiro'
                  : 'Retirar ganancias'}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {step === 'done'
                ? 'Tu solicitud de retiro fue recibida correctamente.'
                : 'Solo BLAST ganados. Los BLAST comprados no se retiran.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 px-2 text-sm text-zinc-500 hover:text-white">
            Cerrar
          </button>
        </div>

        {step === 'done' ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-emerald-400">
              La verificación habilita la solicitud. El desembolso sigue el flujo financiero existente.
            </p>
            <div>
              <p className="text-sm font-semibold text-[color:var(--lb-text,#fff)]">Monto solicitado</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-emerald-400">
                {formatMoneyExact(doneMoney, currency)}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[color:var(--lb-text,#fff)]">Estado</p>
              <p className="mt-1 text-sm text-zinc-300">{statusLabel('REQUESTED')}</p>
            </div>
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
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-zinc-500">BLAST ganados</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-white">
              {earnedBlast.toLocaleString('es-CO')}
            </p>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-zinc-500">
              Dinero disponible para retirar
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-emerald-400">
              {formatMoneyExact(availableMoney, currency)}
            </p>
            {minWithdrawAmount ? (
              <p className="mt-1 text-xs text-zinc-500">
                Mínimo {formatMoneyExact(minWithdrawAmount, currency)}
              </p>
            ) : null}

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
              <p className="text-sm font-bold text-white">Verificación para retiros</p>
              <p className="mt-2 text-sm text-zinc-300">
                Identidad: {verificationStatusLabel(verification?.identityStatus)}
              </p>
              <p className="text-sm text-zinc-300">
                Cuenta bancaria: {verificationStatusLabel(verification?.accountStatus)}
              </p>
              {!canWithdraw ? (
                <>
                  <p className="mt-2 text-sm text-amber-100">
                    {verification?.message ||
                      'Para solicitar tu retiro, necesitamos verificar tu identidad y la cuenta donde recibirás tus ganancias.'}
                  </p>
                  <Link
                    to="/wallet/withdraw/verification"
                    className="mt-3 inline-flex min-h-11 items-center rounded-full bg-emerald-500 px-4 text-sm font-bold text-zinc-950"
                  >
                    {verification?.action?.label || 'Completar verificación'}
                  </Link>
                </>
              ) : null}
            </div>

            {step === 'confirm' ? (
              <div className="mt-5 space-y-3">
                <p className="text-sm text-zinc-300">
                  BLAST ganados a retirar:{' '}
                  <strong className="text-white">{coinsNum.toLocaleString('es-CO')}</strong>
                </p>
                <p className="text-sm text-zinc-300">
                  Importe final autorizado:{' '}
                  <strong className="text-emerald-300">{formatMoneyExact(displayMoney, currency)}</strong>
                </p>
                <p className="text-sm text-zinc-300">
                  Destino: {confirmMeta?.bank} · {confirmMeta?.accountType} · {confirmMeta?.accountNumberMasked}
                </p>
                <p className="text-sm text-zinc-300">Titular: {confirmMeta?.legalName}</p>
                <p className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                  Código LiveBoom de un solo uso: <strong className="tracking-widest">{issuedCode}</strong>
                  <span className="mt-1 block text-xs text-cyan-200/80">
                    Caduca en 10 minutos y queda ligado a este importe y destino. Si cambias alguno, se invalida.
                  </span>
                </p>
                <label className="block text-xs font-semibold text-zinc-400">
                  Escribe el código para confirmar
                  <input
                    value={confirmCode}
                    onChange={(event) => setConfirmCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm tracking-[0.3em] text-white"
                  />
                </label>
                {note ? <p className="text-sm text-fuchsia-400">{note}</p> : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setStep('form')} className="min-h-11 px-4 text-sm text-zinc-400">
                    Volver
                  </button>
                  <button
                    type="button"
                    disabled={busy || confirmCode.length !== 6}
                    onClick={() => void submit()}
                    className="min-h-11 rounded-full bg-emerald-500 px-6 text-sm font-bold uppercase tracking-wide text-zinc-950 disabled:opacity-50"
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
                {canWithdraw ? (
                  <label className="mt-4 block text-xs font-semibold text-zinc-400">
                    Cuenta verificada
                    <select
                      value={accountId}
                      onChange={(event) => setAccountId(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
                    >
                      {verifiedAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.bank} · {account.accountNumberMasked} · {account.holderName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {note ? <p className="mt-4 text-sm text-fuchsia-400">{note}</p> : null}
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={onClose} className="min-h-11 px-4 text-sm text-zinc-400">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={busy || !loaded || !canWithdraw || coinsNum <= 0 || coinsNum > earnedBlast || !quoteMoney}
                    onClick={() => void prepare()}
                    className="min-h-11 rounded-full bg-emerald-500 px-6 text-sm font-bold uppercase tracking-wide text-zinc-950 disabled:opacity-50"
                  >
                    {busy ? 'Preparando…' : 'RETIRAR'}
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
