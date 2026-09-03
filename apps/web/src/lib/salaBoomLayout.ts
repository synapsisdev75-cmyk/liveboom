export const SALA_BOOM_LAYOUTS = ['grid', 'featured', 'mosaic'] as const;

export type SalaBoomLayout = (typeof SALA_BOOM_LAYOUTS)[number];

export type SalaCameraAction =
  | 'mute_mic'
  | 'unmute_mic'
  | 'mute_cam'
  | 'unmute_cam'
  | 'kick'
  | 'pin'
  | 'restore';

export const SALA_BOOM_LAYOUT_META: Record<
  SalaBoomLayout,
  { label: string; hint: string; maxSlots: number }
> = {
  grid: {
    label: 'Grilla',
    hint: 'Todos del mismo tamaño · se adapta a cuántos hay',
    maxSlots: 9,
  },
  featured: {
    label: 'Destacado',
    hint: 'Uno grande · el resto en franja · pin para elegir',
    maxSlots: 8,
  },
  mosaic: {
    label: 'Mosaico',
    hint: 'Quien habla (o el pin) se ve más grande',
    maxSlots: 8,
  },
};

export function parseSalaBoomLayout(value: unknown): SalaBoomLayout {
  return value === 'featured' || value === 'mosaic' || value === 'grid' ? value : 'grid';
}

/** Franja de miniaturas (destacado): una sola fila hasta 4. */
export function salaStripRows(count: number): number[] {
  const n = Math.max(1, count);
  if (n <= 4) return [n];
  if (n === 5) return [3, 2];
  if (n === 6) return [3, 3];
  if (n === 7) return [4, 3];
  return [4, 4];
}
export function salaEqualRows(count: number, ratio: '16:9' | '9:16'): number[] {
  const n = Math.max(1, count);
  if (n === 1) return [1];
  if (n === 2) return ratio === '9:16' ? [1, 1] : [2];
  if (n === 3) return ratio === '9:16' ? [1, 1, 1] : [3];
  if (n === 4) return [2, 2];
  if (n === 5) return ratio === '9:16' ? [2, 3] : [3, 2];
  if (n === 6) return ratio === '9:16' ? [2, 2, 2] : [3, 3];
  if (n === 7) return ratio === '9:16' ? [3, 4] : [4, 3];
  if (n === 8) return [4, 4];
  return [3, 3, 3];
}

export function salaGridClass(count: number, ratio: '16:9' | '9:16'): string {
  const n = Math.max(1, count);
  if (n === 1) return 'grid-cols-1 grid-rows-1';
  if (n === 2) return ratio === '9:16' ? 'grid-cols-1 grid-rows-2' : 'grid-cols-2 grid-rows-1';
  if (n === 3) return ratio === '9:16' ? 'grid-cols-1 grid-rows-3' : 'grid-cols-3 grid-rows-1';
  if (n === 4) return 'grid-cols-2 grid-rows-2';
  if (n <= 6) return ratio === '9:16' ? 'grid-cols-2 grid-rows-3' : 'grid-cols-3 grid-rows-2';
  return 'grid-cols-3 grid-rows-3';
}
