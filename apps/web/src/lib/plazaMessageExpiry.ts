/** Cada mensaje del chat del video se borra a los 3 min de enviado: el más viejo sale primero. */
export const PLAZA_MESSAGE_VISIBLE_MS = 3 * 60_000;
export const PLAZA_MESSAGE_FADE_MS = 600;

/** `live`: llegó con el chat ya abierto, así que es nuevo aunque el reloj local no coincida. */
export function plazaMessageExpiresAt(now: number, createdAtMs: number, live: boolean): number {
  const age = live ? 0 : Math.min(PLAZA_MESSAGE_VISIBLE_MS, Math.max(0, now - createdAtMs));
  return now + PLAZA_MESSAGE_VISIBLE_MS - age;
}

/** Quita los vencidos, marca los que se están yendo y dice cuándo volver a revisar. */
export function visiblePlazaMessages<T extends { id: string }>(
  messages: T[],
  expiresAt: ReadonlyMap<string, number>,
  now: number,
): { visible: Array<T & { leaving: boolean }>; nextAt: number | null } {
  const visible: Array<T & { leaving: boolean }> = [];
  let nextAt: number | null = null;
  for (const message of messages) {
    const end = expiresAt.get(message.id) ?? 0;
    if (now >= end) continue;
    const fadeAt = end - PLAZA_MESSAGE_FADE_MS;
    const leaving = now >= fadeAt;
    visible.push({ ...message, leaving });
    const at = leaving ? end : fadeAt;
    nextAt = nextAt === null ? at : Math.min(nextAt, at);
  }
  return { visible, nextAt };
}
