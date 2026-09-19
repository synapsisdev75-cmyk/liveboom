import { api } from './api';

export type BlastPurchaseResult = {
  pending?: boolean;
  coins?: number;
  coinsBalance?: number;
  purchasedBlastBalance?: number;
  earnedBlastBalance?: number;
  message?: string;
  status?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isDeclined(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error || '');
  return /declinado|DECLINED|no fue aprobado/i.test(msg);
}

/**
 * Confirma con el servidor (Wompi APPROVED verificado) y reintenta hasta acreditar.
 */
export async function confirmBlastPurchase(opts: {
  transactionId: string;
  reference?: string;
  path?: '/api/payments/reconcile' | '/api/payments/complete-redirect';
}): Promise<BlastPurchaseResult> {
  const path = opts.path || '/api/payments/reconcile';
  const transactionId = String(opts.transactionId || '').trim();
  if (!transactionId) return { pending: true };

  let lastPending: BlastPurchaseResult = { pending: true };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const paid = await api<BlastPurchaseResult>(path, {
        method: 'POST',
        body: JSON.stringify({
          transactionId,
          ...(opts.reference ? { reference: opts.reference } : {}),
        }),
      });
      if (paid?.pending) {
        lastPending = paid;
        await sleep(attempt === 0 ? 800 : 2000);
        continue;
      }
      const coins = Math.max(0, Math.floor(Number(paid?.coins) || 0));
      if (coins > 0 || paid?.purchasedBlastBalance != null) {
        return paid;
      }
      lastPending = { ...paid, pending: true };
      await sleep(2000);
    } catch (error) {
      if (isDeclined(error)) throw error;
      lastError = error instanceof Error ? error : new Error('No se pudo confirmar el pago');
      await sleep(attempt === 0 ? 800 : 2000);
    }
  }

  if (lastError && lastPending.pending) {
    return lastPending;
  }
  return lastPending;
}
