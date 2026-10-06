import type { ChatTheme, ChatThemeAdminEntry, ChatThemesAdminConfig } from './types';
import { LIVEBOOM_ORIGINAL_ID } from './themes/liveboomOriginal';

const registry = new Map<string, ChatTheme>();
const registrationOrder: string[] = [];

/** Agrega (o reemplaza) un tema. Un tema nuevo = un archivo en `themes/` + esta llamada. */
export function registerChatTheme(theme: ChatTheme) {
  if (!registry.has(theme.id)) registrationOrder.push(theme.id);
  registry.set(theme.id, theme);
}

export function getBaseChatTheme(id: string): ChatTheme | undefined {
  return registry.get(id);
}

export function listBaseChatThemes(): ChatTheme[] {
  return registrationOrder.map((id) => registry.get(id)!).filter(Boolean);
}

export function isKnownChatTheme(id: string) {
  return registry.has(id);
}

export const DEFAULT_ADMIN_CONFIG: ChatThemesAdminConfig = {
  version: 1,
  defaultThemeId: LIVEBOOM_ORIGINAL_ID,
  themes: {},
};

function entryFor(admin: ChatThemesAdminConfig, id: string): ChatThemeAdminEntry | undefined {
  return admin.themes[id];
}

/** Activo = el tema funciona para quien lo tenga elegido. LiveBoom Original siempre activo. */
export function isChatThemeEnabled(admin: ChatThemesAdminConfig, id: string) {
  const theme = registry.get(id);
  if (!theme) return false;
  if (theme.locked) return true;
  return entryFor(admin, id)?.enabled !== false;
}

/** Publicado = aparece en el selector. */
export function isChatThemePublished(admin: ChatThemesAdminConfig, id: string) {
  const theme = registry.get(id);
  if (!theme) return false;
  if (theme.locked) return true;
  const entry = entryFor(admin, id);
  return entry?.enabled !== false && entry?.published !== false;
}

/** Aplica lo publicado por el Super Admin (nombre, miniatura, imágenes, colores, fuentes). */
export function applyAdminOverrides(theme: ChatTheme, entry?: ChatThemeAdminEntry): ChatTheme {
  if (!entry) return theme;
  const tokens = { ...theme.tokens, ...(entry.tokens || {}) };
  if (entry.fontFamily) tokens.fontFamily = entry.fontFamily;
  if (entry.fontHeading) tokens.fontHeading = entry.fontHeading;
  const background = {
    ...theme.background,
    ...(entry.portrait ? { portrait: entry.portrait } : null),
    ...(entry.landscape ? { landscape: entry.landscape } : null),
    ...(typeof entry.luminance === 'number' ? { luminance: entry.luminance } : null),
  };
  return {
    ...theme,
    name: entry.name?.trim() || theme.name,
    thumbnail: entry.thumbnail || theme.thumbnail,
    tokens,
    background,
    fonts: Array.from(new Set([...theme.fonts, tokens.fontFamily, tokens.fontHeading])),
  };
}

export function getChatTheme(admin: ChatThemesAdminConfig, id: string): ChatTheme {
  const base = registry.get(id) ?? registry.get(LIVEBOOM_ORIGINAL_ID)!;
  return applyAdminOverrides(base, entryFor(admin, base.id));
}

/** Temas en el orden del Super Admin (o el de registro). */
export function listChatThemes(
  admin: ChatThemesAdminConfig,
  options: { includeHidden?: boolean } = {},
): ChatTheme[] {
  return listBaseChatThemes()
    .map((theme, index) => ({ theme, index, order: entryFor(admin, theme.id)?.order }))
    .filter(({ theme }) => options.includeHidden || isChatThemePublished(admin, theme.id))
    .sort((a, b) => (a.order ?? a.index) - (b.order ?? b.index))
    .map(({ theme }) => applyAdminOverrides(theme, entryFor(admin, theme.id)));
}

export function defaultChatThemeId(admin: ChatThemesAdminConfig) {
  const id = admin.defaultThemeId;
  return id && isChatThemeEnabled(admin, id) ? id : LIVEBOOM_ORIGINAL_ID;
}

/**
 * Id que se muestra realmente. Un tema desactivado cae temporalmente al por defecto
 * sin tocar la preferencia guardada: al reactivarlo vuelve solo.
 */
export function resolveActiveThemeId(admin: ChatThemesAdminConfig, chosenId: string) {
  const id = !chosenId || chosenId === 'default' ? defaultChatThemeId(admin) : chosenId;
  return isChatThemeEnabled(admin, id) ? id : defaultChatThemeId(admin);
}
