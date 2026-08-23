export const LIVE_CATEGORIES = [
  { id: 'musica', label: 'Música', emoji: '🎵' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
  { id: 'charla', label: 'Charla', emoji: '💬' },
  { id: 'deportes', label: 'Deportes', emoji: '⚽' },
  { id: 'arte', label: 'Arte', emoji: '🎨' },
  { id: 'educacion', label: 'Educación', emoji: '📚' },
  { id: 'humor', label: 'Humor', emoji: '😂' },
  { id: 'otro', label: 'Otro', emoji: '✨' },
] as const;

export type LiveCategoryId = (typeof LIVE_CATEGORIES)[number]['id'];

export function categoryLabel(id: string | null | undefined) {
  return LIVE_CATEGORIES.find((item) => item.id === id)?.label ?? 'General';
}
