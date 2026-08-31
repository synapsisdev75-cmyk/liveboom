/** Super administrador LiveBoom — acceso restringido por email. */
export const SUPER_ADMIN_EMAIL = 'synapsisdev75@gmail.com';

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return String(email || '')
    .trim()
    .toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}
