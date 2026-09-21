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

/**
 * El dueño tiene todo.
 * Si el delegado está en la lista y no hay grants propios, conserva acceso completo (delegados anteriores).
 * Si hay lista (aunque vacía), solo esas funciones.
 */
export function hasSuperAdminCapability(
  email: string | null | undefined,
  capability: SuperAdminCapability,
  grants: SuperAdminGrants | undefined,
  allowlist: string[] = [],
): boolean {
  if (isOwnerEmail(email)) return true;
  if (!isSuperAdminEmail(email, allowlist)) return false;
  const e = normalizeEmail(email);
  if (!grants || !Object.prototype.hasOwnProperty.call(grants, e)) return true;
  return (grants[e] || []).includes(capability);
}
