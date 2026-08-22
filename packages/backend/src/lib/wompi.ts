import { createHash } from 'node:crypto';
import type { Env } from '../env.js';

export type WompiEvent = {
  event: string;
  data: {
    transaction?: {
      id: string;
      status: string;
      reference?: string;
      amount_in_cents?: number;
    };
  };
  timestamp: number;
  signature?: {
    checksum: string;
    properties: string[];
  };
};

export function wompiConfigured(env: Env): boolean {
  return Boolean(env.WOMPI_PRIVATE_KEY && env.WOMPI_PUBLIC_KEY);
}

function readPath(source: unknown, path: string): string {
  const parts = path.split('.');
  let current: unknown = source;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null || !(part in current)) {
      return '';
    }
    current = (current as Record<string, unknown>)[part];
  }
  return String(current ?? '');
}

/** Valida el checksum de eventos Wompi (cuenta empresarial / jurídica). */
export function verifyWompiChecksum(env: Env, payload: WompiEvent): boolean {
  if (!env.WOMPI_EVENTS_SECRET) {
    return env.NODE_ENV !== 'production';
  }
  const properties = payload.signature?.properties ?? [
    'transaction.id',
    'transaction.status',
    'transaction.amount_in_cents',
  ];
  const concat =
    properties.map((path) => readPath(payload.data, path)).join('') +
    String(payload.timestamp) +
    env.WOMPI_EVENTS_SECRET;
  const digest = createHash('sha256').update(concat).digest('hex');
  return digest === payload.signature?.checksum;
}

export async function createPaymentLink(
  env: Env,
  input: { name: string; amountCents: number; sku: string },
): Promise<{ id: string; url: string }> {
  const response = await fetch(`${env.WOMPI_BASE_URL}/payment_links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WOMPI_PRIVATE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: input.name,
      description: `Recarga Liveboom — ${input.name}`,
      single_use: true,
      collect_shipping: false,
      currency: 'COP',
      amount_in_cents: input.amountCents,
      redirect_url: env.WOMPI_REDIRECT_URL,
      sku: input.sku,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Wompi payment link failed: ${response.status} ${body}`);
  }

  const json = (await response.json()) as {
    data: { id: string };
  };

  const base =
    env.WOMPI_BASE_URL.includes('sandbox')
      ? 'https://checkout.wompi.co/l'
      : 'https://checkout.wompi.co/l';

  return { id: json.data.id, url: `${base}/${json.data.id}` };
}
