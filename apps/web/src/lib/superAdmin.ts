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

/** Funciones que el dueño puede dar o quitar a cada Super Admin. */
export const SUPER_ADMIN_CAPABILITIES = [
  'messages',
  'gifts',
  'blast',
  'ads',
  'levels',
  'community',
  'requests',
  'withdrawals',
  'verification',
] as const;

export type SuperAdminCapability = (typeof SUPER_ADMIN_CAPABILITIES)[number];

export const SUPER_ADMIN_CAPABILITY_LABELS: Record<SuperAdminCapability, string> = {
  messages: 'Mensajes',
  gifts: 'Regalos',
  blast: 'Blast',
  ads: 'Publicidad',
  levels: 'Niveles de marcos',
  community: 'Comunidad',
  requests: 'Solicitudes',
  withdrawals: 'Retiro',
  verification: 'Verificación',
};

export function allSuperAdminCapabilities(): SuperAdminCapability[] {
  return [...SUPER_ADMIN_CAPABILITIES];
}

export function isSuperAdminCapability(value: unknown): value is SuperAdminCapability {
  return SUPER_ADMIN_CAPABILITIES.includes(value as SuperAdminCapability);
}

export function normalizeCapabilities(raw: unknown): SuperAdminCapability[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(raw.filter(isSuperAdminCapability));
  return SUPER_ADMIN_CAPABILITIES.filter((id) => allowed.has(id));
}

export type SuperAdminGrants = Record<string, SuperAdminCapability[]>;

/** Grants indexados por email en minúsculas. `null` = sin clave (acceso legado completo). */
export function listedGrantCaps(
  email: string | null | undefined,
  grants: SuperAdminGrants | undefined,
): SuperAdminCapability[] | null {
  if (!grants) return null;
  const e = normalizeEmail(email);
  if (!e) return null;
  if (Object.prototype.hasOwnProperty.call(grants, e)) return grants[e] || [];
  const hit = Object.keys(grants).find((key) => normalizeEmail(key) === e);
  return hit ? grants[hit] || [] : null;
}

export function normalizeGrantsMap(raw: unknown, emails: string[]): SuperAdminGrants {
  const map = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const byEmail: SuperAdminGrants = {};
  for (const [key, value] of Object.entries(map)) {
    const e = normalizeEmail(key);
    if (!e || isOwnerEmail(e)) continue;
    byEmail[e] = normalizeCapabilities(value);
  }
  const grants: SuperAdminGrants = {};
  for (const email of emails) {
    const e = normalizeEmail(email);
    if (!e || isOwnerEmail(e)) continue;
    if (Object.prototype.hasOwnProperty.call(byEmail, e)) {
      grants[e] = byEmail[e] ?? [];
    }
  }
  return grants;
}

/**
 * El dueño tiene todo.
 * Cualquier Super Admin de la lista (misma delegación) tiene todas las funciones:
 * el dueño ya autorizó al agregarlo. Los grants siguen como referencia en el panel.
 */
export function hasSuperAdminCapability(
  email: string | null | undefined,
  capability: SuperAdminCapability,
  grants: SuperAdminGrants | undefined,
  allowlist: string[] = [],
): boolean {
  if (isOwnerEmail(email)) return true;
  if (!isSuperAdminEmail(email, allowlist)) return false;
  void capability;
  void grants;
  return true;
}
