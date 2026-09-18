/**
 * Compat: blastBalances reexporta el motor único Wallet.
 * Preferir walletEngine / walletService en código nuevo.
 */

const engine = require('./walletEngine');

function applySpend(balances, amount, allowEarned) {
  return engine.applySpend(balances, amount, allowEarned);
}

module.exports = {
  normalizeBlastBalances: engine.normalizeBlastBalances,
  applySpend,
  applyCreditPurchased: engine.applyCreditPurchased,
  applyCreditEarned: engine.applyCreditEarned,
  firestoreBalancePatch: engine.firestoreBalancePatch,
  floorNonNeg: engine.floorNonNeg,
  toSummary: engine.toSummary,
};
module.exports.default = module.exports;
