/** Owner (super de supers) — único que aprueba pedidos y gestiona la lista. */
export const SUPER_ADMIN_OWNER_EMAIL = 'synapsisdev75@gmail.com';

/** @deprecated Usar SUPER_ADMIN_OWNER_EMAIL */
export const SUPER_ADMIN_EMAIL = SUPER_ADMIN_OWNER_EMAIL;

export function normalizeEmail(email: string | null | undefined): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === SUPER_ADMIN_OWNER_EMAIL.toLowerCase();
}

/** Owner siempre; el resto según lista dinámica (Firestore). */
export function isSuperAdminEmail(
  email: string | null | undefined,
  allowlist: string[] = [],
): boolean {
  const e = normalizeEmail(email);
  if (!e) return false;
  if (isOwnerEmail(e)) return true;
  return allowlist.some((x) => normalizeEmail(x) === e);
}
