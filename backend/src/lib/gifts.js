/** Catálogo oficial Liveboom — sincronizado con apps/web/src/lib/liveboomGifts.ts */

const GIFTS = [
  { id: 'besito', name: 'Besito', emoji: '💋', coins: 1 },
  { id: 'corazon_latino', name: 'Corazón Latino', emoji: '❤️', coins: 2 },
  { id: 'cafecito', name: 'Cafecito', emoji: '☕', coins: 5 },
  { id: 'arepita', name: 'Arepita', emoji: '🫓', coins: 8 },
  { id: 'empanadita', name: 'Empanadita', emoji: '🥟', coins: 10 },
  { id: 'flor_tropical', name: 'Flor Tropical', emoji: '🌺', coins: 15 },
  { id: 'maracas', name: 'Maracas', emoji: '🪇', coins: 20 },
  { id: 'aguacate', name: 'Aguacate', emoji: '🥑', coins: 25 },
  { id: 'pina_tropical', name: 'Piña Tropical', emoji: '🍍', coins: 30 },
  { id: 'coco_caribeno', name: 'Coco Caribeño', emoji: '🥥', coins: 40 },
  { id: 'cafe_colombiano', name: 'Café Colombiano', emoji: '☕', coins: 50 },
  { id: 'arepa_venezolana', name: 'Arepa Venezolana', emoji: '🫓', coins: 75 },
  { id: 'sombrero_llanero', name: 'Sombrero Llanero', emoji: '👒', coins: 100 },
  { id: 'sombrero_vueltiao', name: 'Sombrero Vueltiao', emoji: '🎩', coins: 150 },
  { id: 'cuatro_venezolano', name: 'Cuatro Venezolano', emoji: '🎸', coins: 200 },
  { id: 'tucan_tropical', name: 'Tucán Tropical', emoji: '🦜', coins: 250 },
  { id: 'guacamaya', name: 'Guacamaya', emoji: '🦜', coins: 300 },
  { id: 'tambor_caribeno', name: 'Tambor Caribeño', emoji: '🥁', coins: 400 },
  { id: 'botas_llaneras', name: 'Botas Llaneras', emoji: '🥾', coins: 500 },
  { id: 'caballo_criollo', name: 'Caballo Criollo', emoji: '🐴', coins: 600 },
  { id: 'fiesta_latina', name: 'Fiesta Latina', emoji: '🎉', coins: 750 },
  { id: 'carnaval', name: 'Carnaval', emoji: '🎊', coins: 1000 },
  { id: 'orquesta_tropical', name: 'Orquesta Tropical', emoji: '🎺', coins: 2000 },
  { id: 'reina_del_live', name: 'Reina del Live', emoji: '👑', coins: 3500 },
  { id: 'rey_del_flow', name: 'Rey del Flow', emoji: '🔥', coins: 5000 },
  { id: 'yate_caribe', name: 'Yate Caribe', emoji: '🛥️', coins: 6000 },
  { id: 'disco_oro', name: 'Disco de Oro', emoji: '💿', coins: 12000 },
  { id: 'estrella_latina', name: 'Estrella Latina', emoji: '🌟', coins: 25000 },
  { id: 'leyenda_liveboom', name: 'Leyenda Liveboom', emoji: '💫', coins: 30000 },
  { id: 'millon_latino', name: 'Millón Latino', emoji: '💰', coins: 100000 },
  { id: 'dios_del_live', name: 'Dios del Live', emoji: '⚡', coins: 500000 },
];

function findGift(giftId) {
  return GIFTS.find((gift) => gift.id === giftId) ?? null;
}

module.exports = { GIFTS, findGift };
