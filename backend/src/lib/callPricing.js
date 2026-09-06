const { findGift } = require('./gifts');

const ALLOWED_CALL_GIFT_VALUES = [1, 2, 5, 8, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150];
const MAX_CALL_RATE_BLASTS = 150;
const LIVE_ONLY_PREFIX = 'ar_';

function isAllowedCallGiftValue(value) {
  const n = Math.floor(Number(value) || 0);
  return ALLOWED_CALL_GIFT_VALUES.includes(n) && n <= MAX_CALL_RATE_BLASTS;
}

function validateCallGiftId(giftId) {
  const gift = findGift(String(giftId || '').trim());
  if (!gift) {
    const err = new Error('Regalo no válido');
    err.code = 'CALL_GIFT_INVALID';
    throw err;
  }
  if (String(gift.id).startsWith(LIVE_ONLY_PREFIX)) {
    const err = new Error('Ese regalo solo se puede usar en LIVE');
    err.code = 'CALL_GIFT_LIVE_ONLY';
    throw err;
  }
  if (!isAllowedCallGiftValue(gift.coins)) {
    const err = new Error('La tarifa de llamada no puede superar 150 Blasts ni usar valores no permitidos');
    err.code = 'CALL_RATE_NOT_ALLOWED';
    throw err;
  }
  return {
    giftId: gift.id,
    giftName: gift.name,
    giftEmoji: gift.emoji,
    rateBlasts: gift.coins,
  };
}

module.exports = {
  ALLOWED_CALL_GIFT_VALUES,
  MAX_CALL_RATE_BLASTS,
  isAllowedCallGiftValue,
  validateCallGiftId,
};
