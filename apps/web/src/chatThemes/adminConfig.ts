import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { create } from 'zustand';
import { db, storage } from '../lib/firebase';
import { CHAT_FONT_FAMILIES } from './fonts';
import { DEFAULT_ADMIN_CONFIG, isKnownChatTheme } from './registry';
import { LIVEBOOM_ORIGINAL_ID } from './themes';
import type { ChatImageVariants, ChatThemeAdminEntry, ChatThemesAdminConfig } from './types';

const DOC_PATH = 'config/chatThemes';

const TOKEN_KEYS = [
  'background',
  'surface',
  'bubbleIncoming',
  'bubbleIncomingText',
  'bubbleOutgoing',
  'bubbleOutgoingText',
  'textPrimary',
  'textSecondary',
  'accent',
  'accentSecondary',
] as const;

/** Solo colores y gradientes lineales: nada de url(), expresiones ni código. */
const SAFE_COLOR =
  /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%]+\)|linear-gradient\(\s*[-\d.]+deg\s*(,\s*(#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%]+\))\s*[\d.]*%?\s*)+\))$/i;

export function isSafeThemeColor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && SAFE_COLOR.test(value.trim());
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  return /^https:\/\//i.test(value) || /^\/chat-themes\//.test(value) ? value : undefined;
}

function normalizeVariants(raw: unknown): ChatImageVariants | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;
  const full = safeUrl(data.full);
  if (!full) return undefined;
  return { full, medium: safeUrl(data.medium) || full, thumb: safeUrl(data.thumb) || full };
}

function normalizeEntry(raw: unknown, index: number): ChatThemeAdminEntry {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const entry: ChatThemeAdminEntry = {
    enabled: data.enabled !== false,
    published: data.published !== false,
    order: typeof data.order === 'number' && Number.isFinite(data.order) ? data.order : index,
  };
  if (typeof data.name === 'string' && data.name.trim()) entry.name = data.name.trim().slice(0, 40);
  const thumbnail = safeUrl(data.thumbnail);
  if (thumbnail) entry.thumbnail = thumbnail;
  const portrait = normalizeVariants(data.portrait);
  if (portrait) entry.portrait = portrait;
  const landscape = normalizeVariants(data.landscape);
  if (landscape) entry.landscape = landscape;
  if (typeof data.luminance === 'number' && Number.isFinite(data.luminance)) {
    entry.luminance = Math.min(1, Math.max(0, data.luminance));
  }
  if (typeof data.fontFamily === 'string' && CHAT_FONT_FAMILIES.includes(data.fontFamily)) {
    entry.fontFamily = data.fontFamily;
  }
  if (typeof data.fontHeading === 'string' && CHAT_FONT_FAMILIES.includes(data.fontHeading)) {
    entry.fontHeading = data.fontHeading;
  }
  if (data.tokens && typeof data.tokens === 'object') {
    const tokens: Record<string, string> = {};
    for (const key of TOKEN_KEYS) {
      const value = (data.tokens as Record<string, unknown>)[key];
      if (isSafeThemeColor(value)) tokens[key] = value.trim();
    }
    if (Object.keys(tokens).length) entry.tokens = tokens;
  }
  return entry;
}

export function normalizeChatThemesAdmin(raw: unknown): ChatThemesAdminConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ADMIN_CONFIG, themes: {} };
  const data = raw as Record<string, unknown>;
  const themes: Record<string, ChatThemeAdminEntry> = {};
  const rawThemes = data.themes && typeof data.themes === 'object' ? (data.themes as Record<string, unknown>) : {};
  Object.entries(rawThemes).forEach(([id, value], index) => {
    if (isKnownChatTheme(id)) themes[id] = normalizeEntry(value, index);
  });
  const def = typeof data.defaultThemeId === 'string' && isKnownChatTheme(data.defaultThemeId)
    ? data.defaultThemeId
    : LIVEBOOM_ORIGINAL_ID;
  return {
    version: Math.max(1, Math.floor(Number(data.version) || 1)),
    defaultThemeId: def,
    themes,
  };
}

function entryForFirestore(entry: ChatThemeAdminEntry): Record<string, unknown> {
  const row: Record<string, unknown> = {
    enabled: entry.enabled,
    published: entry.published,
    order: entry.order,
  };
  if (entry.name) row.name = entry.name;
  if (entry.thumbnail) row.thumbnail = entry.thumbnail;
  if (entry.portrait) row.portrait = { ...entry.portrait };
  if (entry.landscape) row.landscape = { ...entry.landscape };
  if (typeof entry.luminance === 'number') row.luminance = entry.luminance;
  if (entry.fontFamily) row.fontFamily = entry.fontFamily;
  if (entry.fontHeading) row.fontHeading = entry.fontHeading;
  if (entry.tokens && Object.keys(entry.tokens).length) row.tokens = { ...entry.tokens };
  return row;
}

export function listenChatThemesAdmin(onChange: (config: ChatThemesAdminConfig) => void): Unsubscribe {
  return onSnapshot(
    doc(db, DOC_PATH),
    (snap) => onChange(normalizeChatThemesAdmin(snap.exists() ? snap.data() : null)),
    () => onChange(normalizeChatThemesAdmin(null)),
  );
}

export async function saveChatThemesAdmin(config: ChatThemesAdminConfig, updatedBy: string) {
  const normalized = normalizeChatThemesAdmin(config);
  const themes: Record<string, unknown> = {};
  for (const [id, entry] of Object.entries(normalized.themes)) themes[id] = entryForFirestore(entry);
  await setDoc(doc(db, DOC_PATH), {
    version: normalized.version + 1,
    defaultThemeId: normalized.defaultThemeId,
    themes,
    updatedBy: updatedBy || 'super-admin',
    updatedAt: serverTimestamp(),
  });
}

export async function uploadChatThemeAsset(themeId: string, name: string, blob: Blob, contentType: string) {
  const ext = contentType.includes('webp') ? 'webp' : contentType.includes('png') ? 'png' : 'jpg';
  const objectRef = ref(storage, `admin/chat-themes/${themeId}/${name}-${Date.now()}.${ext}`);
  await uploadBytes(objectRef, blob, {
    contentType,
    cacheControl: 'public, max-age=31536000, immutable',
  });
  return getDownloadURL(objectRef);
}

type AdminState = {
  ready: boolean;
  config: ChatThemesAdminConfig;
  subscribe: () => () => void;
};

let listeners = 0;
let unsub: Unsubscribe | null = null;

/** Configuración pública de temas (una sola suscripción compartida). */
export const useChatThemesAdminStore = create<AdminState>((set) => ({
  ready: false,
  config: { ...DEFAULT_ADMIN_CONFIG, themes: {} },
  subscribe: () => {
    listeners += 1;
    if (!unsub) {
      unsub = listenChatThemesAdmin((config) => set({ ready: true, config }));
    }
    return () => {
      listeners = Math.max(0, listeners - 1);
      if (!listeners && unsub) {
        unsub();
        unsub = null;
      }
    };
  },
}));
