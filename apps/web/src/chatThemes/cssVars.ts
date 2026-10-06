import type { CSSProperties } from 'react';
import { fontStack } from './fonts';
import type { ResolvedChatTheme } from './types';

/** Tinta legible (oscura o clara) sobre un color sólido; null si el color no es hex/rgb. */
function contrastInk(color: string): string | null {
  const value = color.trim();
  let rgb: number[] | null = null;
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hex) {
    const h = hex[1]!.length === 3 ? hex[1]!.replace(/./g, (c) => c + c) : hex[1]!;
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    const fn = value.match(/^rgba?\(([^)]+)\)$/i);
    if (fn) rgb = fn[1]!.split(/[\s,/]+/).slice(0, 3).map((n) => Number.parseFloat(n));
  }
  if (!rgb || rgb.some((n) => !Number.isFinite(n))) return null;
  const [r, g, b] = rgb.map((n) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#0b0f19' : '#ffffff';
}

/**
 * Convierte el tema resuelto en variables CSS para el contenedor del chat.
 * Se re-mapean los tokens semánticos globales (--text-primary, --bg-elevated…)
 * solo dentro del chat: el resto de la app no cambia y el tema manda sobre el modo claro/oscuro.
 */
export function chatThemeStyle(resolved: ResolvedChatTheme): CSSProperties {
  const t = resolved.tokens;
  const vars: Record<string, string> = {
    colorScheme: resolved.scheme,
    '--bg-primary': t.background,
    '--bg-secondary': t.background,
    '--bg-elevated': t.surfaceSecondary,
    '--surface-primary': t.surfaceSecondary,
    '--surface-secondary': t.surfaceSecondary,
    '--surface-input': t.inputBackground,
    '--surface-hover': `color-mix(in srgb, ${t.textPrimary} 9%, transparent)`,
    '--surface-selected': `color-mix(in srgb, ${t.accent} 20%, transparent)`,
    '--text-primary': t.textPrimary,
    '--text-secondary': t.textSecondary,
    '--text-muted': t.textSecondary,
    '--accent-primary': t.accent,
    '--accent-secondary': t.accentSecondary,
    '--accent-soft': `color-mix(in srgb, ${t.accent} 24%, transparent)`,
    '--text-on-accent': t.onAccent,
    '--border-default': t.border,
    '--border-soft': `color-mix(in srgb, ${t.border} 70%, transparent)`,
    '--link-default': t.reply,
    '--focus-ring': t.accentSecondary,

    '--lbct-bg': t.background,
    '--lbct-surface': t.surface,
    '--lbct-surface-2': t.surfaceSecondary,
    '--lbct-bubble-in': t.bubbleIncoming,
    '--lbct-bubble-in-text': t.bubbleIncomingText,
    '--lbct-bubble-out': t.bubbleOutgoing,
    '--lbct-bubble-out-text': t.bubbleOutgoingText,
    '--lbct-bubble-border': t.bubbleBorder,
    '--lbct-bubble-blur': `${t.bubbleBlur}px`,
    '--lbct-text': t.textPrimary,
    '--lbct-text-2': t.textSecondary,
    '--lbct-accent': t.accent,
    '--lbct-accent-2': t.accentSecondary,
    '--lbct-border': t.border,
    '--lbct-input-bg': t.inputBackground,
    '--lbct-icon': t.icon,
    '--lbct-reaction-bg': t.reactionBackground,
    '--lbct-quote-bg': t.quoteBackground,
    '--lbct-reply': t.reply,
    '--lbct-audio': t.audioWave,
    '--lbct-audio-bg': t.audioBackground,
    '--lbct-audio-fg': t.audioForeground,
    '--lbct-audio-wave': t.audioWaveInactive,
    '--lbct-audio-wave-active': t.audioWaveActive,
    '--lbct-audio-progress': t.audioProgress,
    '--lbct-audio-play': t.audioPlayButton,
    '--lbct-audio-play-icon': t.onAccent,
    '--lbct-audio-time': t.audioDurationColor,
    '--lbct-selection': t.textSelectionBackground,
    '--lb-selection-bg': t.textSelectionBackground,
    '--lb-selection-handle': t.textSelectionHandle,
    '--lb-caret-color': t.caretColor,
    '--lb-magnifier-border': t.magnifierBorder,
    '--lbct-radius': t.borderRadius,
    '--lbct-shadow': t.shadow,
    '--lbct-media-radius': t.mediaRadius,
    '--lbct-media-border': t.mediaBorder,
    '--lbct-font': fontStack(resolved.fontFamily),
    '--lbct-font-heading': fontStack(resolved.fontHeading),
    '--lbct-font-scale': String(resolved.fontScale),
    '--lbct-meta-bg': resolved.metaBackground,
    '--lbct-meta-text': resolved.metaText,
  };
  const outInk = contrastInk(t.bubbleOutgoingText);
  if (outInk) vars['--lbct-bubble-out-ink'] = outInk;
  return vars as CSSProperties;
}

export function chatThemeAttrs(resolved: ResolvedChatTheme) {
  return {
    'data-lb-chat-theme': resolved.activeThemeId,
    'data-lb-chat-scheme': resolved.scheme,
    ...(resolved.highContrast ? { 'data-lb-chat-contrast': 'high' } : null),
    ...(resolved.tokens.bubbleBlur > 0 ? { 'data-lb-chat-glass': '' } : null),
  };
}
