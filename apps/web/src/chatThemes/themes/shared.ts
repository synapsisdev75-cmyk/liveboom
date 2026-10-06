import type { ChatImageVariants, ChatThemeBackground } from '../types';

const ROOT = '/chat-themes';

function variants(id: string, orientation: 'portrait' | 'landscape'): ChatImageVariants {
  const base = `${ROOT}/${id}/${orientation}`;
  return { thumb: `${base}-thumb.webp`, medium: `${base}-medium.webp`, full: `${base}-full.webp` };
}

export function themeBackground(
  id: string,
  luminance: number,
  gradient?: string,
): ChatThemeBackground {
  return {
    portrait: variants(id, 'portrait'),
    landscape: variants(id, 'landscape'),
    luminance,
    gradient,
  };
}

export function themeThumbnail(id: string) {
  return `${ROOT}/${id}/preview.webp`;
}
