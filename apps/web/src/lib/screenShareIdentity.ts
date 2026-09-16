/** Identity técnica del participante Screen Share nativo (misma sala, no es un viewer). */

export function screenShareIdentityFor(
  ownerUid: string | null | undefined,
  sessionId?: string | null,
): string {
  const uid = String(ownerUid || '').trim();
  const sid = String(sessionId || '').trim();
  if (!uid) return 'screen:unknown';
  return sid ? `screen:${uid}:${sid}` : `screen:${uid}`;
}

export function isScreenShareIdentity(identity: string | null | undefined): boolean {
  return /^screen:/i.test(String(identity || ''));
}

/** Extrae ownerUid de `screen:<uid>` o `screen:<uid>:<sessionId>`. */
export function ownerUidFromScreenIdentity(identity: string | null | undefined): string | null {
  const raw = String(identity || '');
  if (!/^screen:/i.test(raw)) return null;
  const rest = raw.slice(raw.indexOf(':') + 1);
  const owner = rest.split(':')[0]?.trim() || '';
  return owner || null;
}

export function isScreenShareForOwner(
  identity: string | null | undefined,
  ownerUid: string | null | undefined,
): boolean {
  if (!ownerUid || !identity) return false;
  const owner = ownerUidFromScreenIdentity(identity);
  return Boolean(owner && owner === String(ownerUid).trim());
}

export function isHostOrScreenParticipant(
  identity: string | null | undefined,
  hostUid: string | null | undefined,
): boolean {
  if (!identity) return false;
  if (hostUid && identity === hostUid) return true;
  if (hostUid && isScreenShareForOwner(identity, hostUid)) return true;
  return isScreenShareIdentity(identity);
}

export type ScreenShareTransport = 'native' | 'legacy' | null;
