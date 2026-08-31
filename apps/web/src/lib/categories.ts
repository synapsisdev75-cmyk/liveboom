export const LIVE_CATEGORIES = [
  { id: 'musica', label: 'Música', emoji: '🎵', icon: '/categories/musica.png' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮', icon: '/categories/gaming.png' },
  { id: 'charla', label: 'Charla', emoji: '💬', icon: '/categories/charla.png' },
  { id: 'deportes', label: 'Deportes', emoji: '⚽', icon: '/categories/deportes.png' },
  { id: 'arte', label: 'Arte', emoji: '🎨', icon: '/categories/arte.png' },
  { id: 'educacion', label: 'Educación', emoji: '📚', icon: '/categories/educacion.png' },
  { id: 'humor', label: 'Humor', emoji: '😂', icon: '/categories/humor.png' },
  { id: 'otro', label: 'Otro', emoji: '✨', icon: '/categories/otro.png' },
] as const;

export type LiveCategoryId = (typeof LIVE_CATEGORIES)[number]['id'];

export function categoryLabel(id: string | null | undefined) {
  return LIVE_CATEGORIES.find((item) => item.id === id)?.label ?? 'General';
}

export function categoryIcon(id: string | null | undefined) {
  return LIVE_CATEGORIES.find((item) => item.id === id)?.icon ?? null;
}
