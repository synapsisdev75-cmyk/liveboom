/** Color del nombre en chat según coins regalados en la sala. */
export function chatAuthorClass(author: string, giftCoinsByName: Record<string, number>): string {
  const key = String(author || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  const coins = Number(giftCoinsByName[key] || 0);
  if (coins >= 2000) return 'text-amber-300'; // quien más aporta
  if (coins >= 200) return 'text-fuchsia-300';
  if (coins >= 40) return 'text-emerald-300';
  if (coins > 0) return 'text-sky-300';
  return 'text-cyan-300'; // poco o nada
}
