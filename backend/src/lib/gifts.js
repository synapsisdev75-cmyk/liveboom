const GIFTS = [
  { id: 'heart', name: 'Corazón', emoji: '❤️', coins: 10 },
  { id: 'rose', name: 'Rosa', emoji: '🌹', coins: 50 },
  { id: 'star', name: 'Estrella', emoji: '⭐', coins: 100 },
  { id: 'diamond', name: 'Diamante', emoji: '💎', coins: 200 },
  { id: 'crown', name: 'Corona', emoji: '👑', coins: 500 },
  { id: 'lion', name: 'León', emoji: '🦁', coins: 1000 },
];

function findGift(giftId) {
  return GIFTS.find((gift) => gift.id === giftId) ?? null;
}

module.exports = { GIFTS, findGift };
