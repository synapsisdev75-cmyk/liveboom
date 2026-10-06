import { registerPlugin } from '@capacitor/core';
import { api } from './api';

/** Mismo id que quedó guardado en App Store Connect. */
export function appleBlastProductId(coins: number): string {
  return `iveboom.app.blast.${Math.floor(coins)}`;
}

type AppleTransaction = {
  productId: string;
  transactionId: string;
  signedTransaction: string;
};

type AppleIAPPlugin = {
  purchase(options: { productId: string }): Promise<AppleTransaction>;
  finish(options: { transactionId: string }): Promise<void>;
  pending(): Promise<{ transactions: AppleTransaction[] }>;
  prices(options: { productIds: string[] }): Promise<{ products: { productId: string; displayPrice: string }[] }>;
  addListener(
    eventName: 'unfinished',
    listener: (row: AppleTransaction) => void,
  ): Promise<{ remove: () => Promise<void> }>;
};

const AppleIAP = registerPlugin<AppleIAPPlugin>('AppleIAP');

export type AppleBlastCredit = {
  coins?: number;
  coinsBalance?: number;
  purchasedBlastBalance?: number;
  earnedBlastBalance?: number;
  duplicate?: boolean;
};

const crediting = new Map<string, Promise<AppleBlastCredit | null>>();

export async function loadAppleBlastPrices(coins: number[]): Promise<Record<string, string>> {
  const productIds = coins.map((amount) => appleBlastProductId(amount));
  const result = await AppleIAP.prices({ productIds });
  const prices: Record<string, string> = {};
  for (const row of result.products || []) {
    if (row.productId && row.displayPrice) prices[row.productId] = row.displayPrice;
  }
  return prices;
}

/** Acredita en el servidor y cierra la compra en Apple. Si el servidor falla, la compra queda abierta para reintentar. */
export function creditAppleBlastPurchase(row: AppleTransaction): Promise<AppleBlastCredit | null> {
  const transactionId = String(row.transactionId || '').trim();
  const signedTransaction = String(row.signedTransaction || '').trim();
  if (!transactionId || !signedTransaction) return Promise.resolve(null);
  const existing = crediting.get(transactionId);
  if (existing) return existing;
  const job = (async () => {
    const paid = await api<AppleBlastCredit>('/api/payments/apple-iap', {
      method: 'POST',
      body: JSON.stringify({ signedTransaction }),
      timeoutMs: 45_000,
    });
    try {
      await AppleIAP.finish({ transactionId });
    } catch {
      /* Apple vuelve a entregar la compra; el servidor no la suma dos veces. */
    }
    return paid;
  })().finally(() => {
    crediting.delete(transactionId);
  });
  crediting.set(transactionId, job);
  return job;
}

export async function purchaseAppleBlast(coins: number): Promise<AppleBlastCredit> {
  const row = await AppleIAP.purchase({ productId: appleBlastProductId(coins) });
  const paid = await creditAppleBlastPurchase(row);
  if (!paid) throw new Error('No se pudo sumar el BLAST de esta compra.');
  return paid;
}

export function watchUnfinishedApplePurchases(
  onPaid: (paid: AppleBlastCredit) => void,
): () => void {
  let remove = () => {};
  let closed = false;
  void AppleIAP.pending()
    .then((pending) => {
      if (closed) return;
      for (const row of pending.transactions || []) {
        void creditAppleBlastPurchase(row).then((paid) => {
          if (paid) onPaid(paid);
        });
      }
    })
    .catch(() => undefined);
  void AppleIAP.addListener('unfinished', (row) => {
    void creditAppleBlastPurchase(row).then((paid) => {
      if (paid) onPaid(paid);
    });
  })
    .then((handle) => {
      if (closed) {
        void handle.remove();
        return;
      }
      remove = () => {
        void handle.remove();
      };
    })
    .catch(() => undefined);
  return () => {
    closed = true;
    remove();
  };
}

export function applePurchaseWasCancelled(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code || '');
  const message = error instanceof Error ? error.message : String(error || '');
  return code === 'cancelled' || /cancel/i.test(message);
}
