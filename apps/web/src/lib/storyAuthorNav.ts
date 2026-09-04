/** Navegación tipo Instagram / WhatsApp: ítems de un autor, salto entre autores. */

export const STORY_WHEEL_COOLDOWN_MS = 420;
export const STORY_WHEEL_MIN_DELTA = 24;

export type StoryGesture = 'user-next' | 'user-prev' | 'item-next' | 'item-prev';

type AuthorItem = { id: string; authorUid: string };

/** Segmentos de la barra: solo el usuario que se está viendo. */
export function authorLocalPosition(
  reels: AuthorItem[],
  index: number,
): { current: number; total: number } {
  const reel = reels[index];
  if (!reel) return { current: 1, total: Math.max(reels.length, 1) };
  let total = 0;
  let current = 1;
  for (const item of reels) {
    if (item.authorUid !== reel.authorUid) continue;
    total += 1;
    if (item.id === reel.id) current = total;
  }
  return { current, total: Math.max(total, 1) };
}

/** Primer ítem del siguiente usuario, o -1 si no hay más. */
export function nextAuthorIndex(reels: AuthorItem[], index: number): number {
  const uid = reels[index]?.authorUid;
  if (!uid) return -1;
  for (let i = index + 1; i < reels.length; i += 1) {
    const item = reels[i];
    if (item && item.authorUid !== uid) return i;
  }
  return -1;
}

/** Primer ítem del usuario anterior, o -1 si ya es el primero. */
export function prevAuthorIndex(reels: AuthorItem[], index: number): number {
  const uid = reels[index]?.authorUid;
  if (!uid) return -1;
  let i = index - 1;
  while (i >= 0 && reels[i]?.authorUid === uid) i -= 1;
  if (i < 0) return -1;
  const prevUid = reels[i]?.authorUid;
  if (!prevUid) return -1;
  while (i > 0 && reels[i - 1]?.authorUid === prevUid) i -= 1;
  return i;
}

export function classifyStoryGesture(dx: number, dy: number): StoryGesture | null {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX >= 56 && absX > absY * 1.15) {
    return dx < 0 ? 'user-next' : 'user-prev';
  }
  if (absY >= 48 && absY > absX * 1.15) {
    return dy < 0 ? 'item-next' : 'item-prev';
  }
  return null;
}
