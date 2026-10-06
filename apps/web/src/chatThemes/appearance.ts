import { clamp } from './contrast';
import type {
  ChatAppearance,
  ChatBubbleStyle,
  ChatCustomBackground,
  ChatFontChoice,
  ChatTextSize,
} from './types';

export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = {
  themeId: 'default',
  font: 'theme',
  textSize: 'md',
  bubbleStyle: 'theme',
  highContrast: false,
  customBackground: null,
  updatedAtMs: 0,
};

const FONTS: ChatFontChoice[] = ['theme', 'liveboom', 'inter', 'sora', 'manrope', 'nunito', 'space-grotesk'];
const SIZES: ChatTextSize[] = ['sm', 'md', 'lg', 'xl'];
const BUBBLES: ChatBubbleStyle[] = ['theme', 'light', 'dark', 'liveboom', 'glass'];

export const TEXT_SCALE: Record<ChatTextSize, number> = { sm: 0.9, md: 1, lg: 1.14, xl: 1.28 };

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  if (/^https:\/\//i.test(value) || value.startsWith('/') || value.startsWith('blob:')) return value;
  return null;
}

function num(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return clamp(n, min, max);
}

export function normalizeCustomBackground(raw: unknown): ChatCustomBackground | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const full = safeUrl(data.full);
  const medium = safeUrl(data.medium) || full;
  const thumb = safeUrl(data.thumb) || medium;
  if (!full || !medium || !thumb) return null;
  const rotation = Number(data.rotation);
  return {
    id: typeof data.id === 'string' ? data.id.slice(0, 64) : 'bg',
    full,
    medium,
    thumb,
    width: num(data.width, 1080, 1, 10000),
    height: num(data.height, 1920, 1, 10000),
    backgroundPositionX: num(data.backgroundPositionX, 50, 0, 100),
    backgroundPositionY: num(data.backgroundPositionY, 50, 0, 100),
    zoom: num(data.zoom, 1, 1, 4),
    rotation: rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0,
    blur: num(data.blur, 0, 0, 12),
    overlayOpacity: num(data.overlayOpacity, 0.2, 0, 0.8),
    autoReadability: data.autoReadability !== false,
    luminance: num(data.luminance, 0.3, 0, 1),
    baseColor:
      typeof data.baseColor === 'string' && /^#[0-9a-f]{6}$/i.test(data.baseColor)
        ? data.baseColor
        : '#0a0a0b',
  };
}

export function normalizeChatAppearance(raw: unknown): ChatAppearance {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CHAT_APPEARANCE };
  const data = raw as Record<string, unknown>;
  const themeId =
    typeof data.themeId === 'string' && /^[a-z0-9-]{1,64}$/.test(data.themeId) ? data.themeId : 'default';
  const updatedAtRaw = data.updatedAtMs;
  return {
    themeId,
    font: FONTS.includes(data.font as ChatFontChoice) ? (data.font as ChatFontChoice) : 'theme',
    textSize: SIZES.includes(data.textSize as ChatTextSize) ? (data.textSize as ChatTextSize) : 'md',
    bubbleStyle: BUBBLES.includes(data.bubbleStyle as ChatBubbleStyle)
      ? (data.bubbleStyle as ChatBubbleStyle)
      : 'theme',
    highContrast: data.highContrast === true,
    customBackground: normalizeCustomBackground(data.customBackground),
    updatedAtMs: typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw) ? updatedAtRaw : 0,
  };
}

/** Firestore no acepta `undefined`. */
export function appearanceForFirestore(appearance: ChatAppearance): Record<string, unknown> {
  const bg = appearance.customBackground;
  return {
    themeId: appearance.themeId,
    font: appearance.font,
    textSize: appearance.textSize,
    bubbleStyle: appearance.bubbleStyle,
    highContrast: appearance.highContrast,
    customBackground: bg
      ? {
          id: bg.id,
          thumb: bg.thumb,
          medium: bg.medium,
          full: bg.full,
          width: bg.width,
          height: bg.height,
          backgroundPositionX: bg.backgroundPositionX,
          backgroundPositionY: bg.backgroundPositionY,
          zoom: bg.zoom,
          rotation: bg.rotation,
          blur: bg.blur,
          overlayOpacity: bg.overlayOpacity,
          autoReadability: bg.autoReadability,
          luminance: bg.luminance,
          baseColor: bg.baseColor,
        }
      : null,
    updatedAtMs: appearance.updatedAtMs,
  };
}

export function sameAppearance(a: ChatAppearance, b: ChatAppearance) {
  return (
    JSON.stringify({ ...appearanceForFirestore(a), updatedAtMs: 0 }) ===
    JSON.stringify({ ...appearanceForFirestore(b), updatedAtMs: 0 })
  );
}
