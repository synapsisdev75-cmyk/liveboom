/** Catálogo oficial Liveboom — precios en coins y niveles de animación. */

export type GiftLevel = 1 | 2 | 3 | 4 | 5;

export type LiveGift = {
  id: string;
  name: string;
  emoji: string;
  /** PNG con fondo transparente en /gifts (si existe). */
  image?: string;
  /** WebM con alpha para animación al enviar el regalo. */
  video?: string;
  coins: number;
  level: GiftLevel;
  /** Descripción corta de la animación (UI). */
  animation: string;
};

export function giftLevelFromCoins(coins: number): GiftLevel {
  if (coins <= 40) return 1;
  if (coins <= 600) return 2;
  if (coins <= 5000) return 3;
  if (coins <= 25000) return 4;
  return 5;
}

/** Duración, tamaño de pantalla y estilo por nivel. */
export const GIFT_LEVEL_FX: Record<
  GiftLevel,
  { duration: number; screenPct: number; label: string }
> = {
  1: { duration: 2, screenPct: 20, label: 'Básico' },
  2: { duration: 3.2, screenPct: 32, label: 'Popular' },
  3: { duration: 5, screenPct: 52, label: 'Especial' },
  4: { duration: 7, screenPct: 72, label: 'Premium' },
  5: { duration: 10, screenPct: 95, label: 'Legendario' },
};

export const LIVEBOOM_GIFTS: LiveGift[] = [
  // Nivel 1 — Básicos (1–40)
  { id: 'besito', name: 'Besito', emoji: '💋', image: '/gifts/besito.png', coins: 1, level: 1, animation: 'Face Mesh: beso en labios + rastro' },
  { id: 'corazon_latino', name: 'Corazón Latino', emoji: '❤️', image: '/gifts/corazon_latino.png', coins: 2, level: 1, animation: 'Face Mesh: pulso cerca de la cara' },
  { id: 'cafecito', name: 'Cafecito', emoji: '☕', image: '/gifts/cafecito.png', coins: 5, level: 1, animation: 'Taza con vapor en forma de corazón' },
  { id: 'arepita', name: 'Arepita', emoji: '🫓', image: '/gifts/arepita.png', coins: 8, level: 1, animation: 'Gira como moneda y brillo dorado' },
  { id: 'empanadita', name: 'Empanadita', emoji: '🥟', image: '/gifts/empanadita.png', coins: 10, level: 1, animation: 'Vuelta rápida y migas brillantes' },
  { id: 'flor_tropical', name: 'Flor Tropical', emoji: '🌺', image: '/gifts/flor_tropical.png', coins: 15, level: 1, animation: 'Face Mesh: flor anclada a la frente' },
  { id: 'maracas', name: 'Maracas', emoji: '🪇', image: '/gifts/maracas.png', coins: 20, level: 1, animation: 'Agitación rítmica chispeante' },
  { id: 'aguacate', name: 'Aguacate', emoji: '🥑', image: '/gifts/aguacate.png', video: '/gifts/aguacate.webm', coins: 25, level: 1, animation: 'Animación especial al caer' },
  { id: 'pina_tropical', name: 'Piña Tropical', emoji: '🍍', image: '/gifts/pina_tropical.png', coins: 30, level: 1, animation: 'Gira y explota en destellos' },
  { id: 'coco_caribeno', name: 'Coco Caribeño', emoji: '🥥', image: '/gifts/coco_caribeno.png', video: '/gifts/coco_caribeno.webm', coins: 40, level: 1, animation: 'Animación WebM con sonido al enviar' },
  // Nivel 2 — Populares (50–600)
  { id: 'cafe_colombiano', name: 'Café Colombiano', emoji: '☕', image: '/gifts/cafe_colombiano.png', coins: 50, level: 2, animation: 'Taza elegante y vapor de montaña' },
  { id: 'arepa_venezolana', name: 'Arepa Venezolana', emoji: '🫓', image: '/gifts/arepa_venezolana.png', coins: 75, level: 2, animation: 'Bandeja dorada y brillo cálido' },
  { id: 'sombrero_llanero', name: 'Sombrero Llanero', emoji: '👒', image: '/gifts/sombrero_llanero.png', coins: 100, level: 2, animation: 'Face Mesh: anclado a frente y sienes' },
  { id: 'sombrero_vueltiao', name: 'Sombrero Vueltiao', emoji: '🎩', image: '/gifts/sombrero_vueltiao.png', coins: 150, level: 2, animation: 'Face Mesh: espiral anclada a la cabeza' },
  { id: 'cuatro_venezolano', name: 'Cuatro Venezolano', emoji: '🎸', image: '/gifts/cuatro_venezolano.png', coins: 200, level: 2, animation: 'Notas y ondas sonoras' },
  { id: 'tucan_tropical', name: 'Tucán Tropical', emoji: '🦜', image: '/gifts/tucan_tropical.png', coins: 250, level: 2, animation: 'Face Mesh: posado sobre la cabeza' },
  { id: 'guacamaya', name: 'Guacamaya', emoji: '🦜', image: '/gifts/guacamaya.png', coins: 300, level: 2, animation: 'Face Mesh: plumas ancladas a la cabeza' },
  { id: 'tambor_caribeno', name: 'Tambor Caribeño', emoji: '🥁', image: '/gifts/tambor_caribeno.png', coins: 400, level: 2, animation: 'Tres golpes con ondas' },
  { id: 'botas_llaneras', name: 'Botas Llaneras', emoji: '🥾', image: '/gifts/botas_llaneras.png', coins: 500, level: 2, animation: 'Zapateo con polvo brillante' },
  { id: 'caballo_criollo', name: 'Caballo Criollo', emoji: '🐴', image: '/gifts/caballo_criollo.png', coins: 600, level: 2, animation: 'Trote y polvo al centro' },
  // Nivel 3 — Especiales (750–5000)
  { id: 'fiesta_latina', name: 'Fiesta Latina', emoji: '🎉', image: '/gifts/fiesta_latina.png', coins: 750, level: 3, animation: 'Confeti, serpentinas y luces de golpe' },
  { id: 'carnaval', name: 'Carnaval', emoji: '🎊', image: '/gifts/carnaval.png', coins: 1000, level: 3, animation: 'Escena de carnaval con nombre visible' },
  { id: 'orquesta_tropical', name: 'Orquesta Tropical', emoji: '🎺', image: '/gifts/orquesta_tropical.png', coins: 2000, level: 3, animation: 'Escena musical temática' },
  { id: 'reina_del_live', name: 'Reina del Live', emoji: '👑', image: '/gifts/reina_del_live.png', coins: 3500, level: 3, animation: 'Face Mesh: corona anclada a frente y sienes' },
  { id: 'rey_del_flow', name: 'Rey del Flow', emoji: '🔥', image: '/gifts/rey_del_flow.png', coins: 5000, level: 3, animation: 'Fuego y nombre protagonista' },
  // Nivel 4 — Premium (6000–25000)
  { id: 'yate_caribe', name: 'Yate Caribe', emoji: '🛥️', coins: 6000, level: 4, animation: 'Recorrido completo con fondo' },
  { id: 'disco_oro', name: 'Disco de Oro', emoji: '💿', coins: 12000, level: 4, animation: 'Escena épica con golpe final' },
  { id: 'estrella_latina', name: 'Estrella Latina', emoji: '🌟', coins: 25000, level: 4, animation: 'El live se detiene un instante' },
  // Nivel 5 — Legendarios (30000–500000)
  { id: 'leyenda_liveboom', name: 'Leyenda Liveboom', emoji: '💫', coins: 30000, level: 5, animation: 'Takeover cinematográfico' },
  { id: 'millon_latino', name: 'Millón Latino', emoji: '💰', coins: 100000, level: 5, animation: 'Pantalla completa y protagonista' },
  { id: 'dios_del_live', name: 'Dios del Live', emoji: '⚡', coins: 500000, level: 5, animation: 'Escena total — vino a facturar' },
];

export function findLiveGift(giftId: string | undefined | null): LiveGift | null {
  if (!giftId) return null;
  return LIVEBOOM_GIFTS.find((g) => g.id === giftId) ?? null;
}

export function giftsByLevel(level: GiftLevel) {
  return LIVEBOOM_GIFTS.filter((g) => g.level === level);
}
