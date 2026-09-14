const persist = require('./persist');
const {
  normalizeBlastBalances,
  applySpend,
  applyCreditPurchased,
  applyCreditEarned,
} = require('./blastBalances');

/** @type {Map<string, object>} */
const balances = new Map();
const pendingOrders = new Map();
/** @type {Map<string, object[]>} */
const withdrawalsByUid = new Map();

function hydrate() {
  const data = persist.load('wallet', { balances: {}, pendingOrders: {}, withdrawals: {} });
  for (const [uid, coins] of Object.entries(data.balances || {})) {
    if (coins && typeof coins === 'object') {
      balances.set(uid, normalizeBlastBalances(coins));
    } else {
      balances.set(uid, normalizeBlastBalances({ coinsBalance: coins }));
    }
  }
  for (const [ref, order] of Object.entries(data.pendingOrders || {})) {
    pendingOrders.set(ref, order);
  }
  for (const [uid, list] of Object.entries(data.withdrawals || {})) {
    withdrawalsByUid.set(uid, Array.isArray(list) ? list : []);
  }
}

function flush() {
  persist.debouncedSave('wallet', {
    balances: Object.fromEntries(balances),
    pendingOrders: Object.fromEntries(pendingOrders),
    withdrawals: Object.fromEntries(withdrawalsByUid),
  });
}

hydrate();

function getBalances(uid) {
  const key = String(uid);
  const cur = balances.get(key);
  if (!cur) return normalizeBlastBalances({ coinsBalance: 0 });
  return normalizeBlastBalances(cur);
}

function getBalance(uid) {
  return getBalances(uid).coinsBalance;
}

function setBalances(uid, next) {
  const normalized = normalizeBlastBalances(next);
  balances.set(String(uid), normalized);
  flush();
  return normalized;
}

function setBalance(uid, coins) {
  // Compat: writing a single total treats as purchased (legacy callers / topup floor).
  const next = normalizeBlastBalances({
    purchasedBlastBalance: Math.max(0, Number(coins) || 0),
    earnedBlastBalance: 0,
  });
  return setBalances(uid, next).coinsBalance;
}

function setBalanceFromParts(uid, parts) {
  return setBalances(uid, parts);
}

function credit(uid, coins) {
  // Legacy credit → earned (creator gifts/calls). Prefer creditPurchased/creditEarned.
  const cur = getBalances(uid);
  return setBalances(uid, applyCreditEarned(cur, coins)).coinsBalance;
}

function creditPurchased(uid, coins) {
  const cur = getBalances(uid);
  return setBalances(uid, applyCreditPurchased(cur, coins));
}

function creditEarned(uid, coins) {
  const cur = getBalances(uid);
  return setBalances(uid, applyCreditEarned(cur, coins));
}

function debit(uid, coins) {
  const cur = getBalances(uid);
  const spent = applySpend(cur, coins, true);
  if (!spent.ok) return null;
  setBalances(uid, spent.balances);
  return spent.balances.coinsBalance;
}

/**
 * @returns {null | { balances, chargedPurchased, chargedEarned, code?: string }}
 */
function debitSplit(uid, coins, allowEarned) {
  const cur = getBalances(uid);
  const spent = applySpend(cur, coins, Boolean(allowEarned));
  if (!spent.ok) {
    return { ok: false, code: spent.code, balances: spent.balances, chargedPurchased: 0, chargedEarned: 0 };
  }
  setBalances(uid, spent.balances);
  return {
    ok: true,
    balances: spent.balances,
    chargedPurchased: spent.chargedPurchased,
    chargedEarned: spent.chargedEarned,
  };
}

function rememberOrder(order) {
  pendingOrders.set(order.reference, {
    uid: String(order.uid),
    coins: Number(order.coins) || 0,
    packageId: order.packageId,
    floor: Math.max(0, Number(order.floor) || 0),
    kind: order.kind || 'coins',
    days: Number(order.days) || 0,
    hours: Number(order.hours) || 0,
    amountInCop: Number(order.amountInCop) || 0,
    regionId: order.regionId || '',
  });
  flush();
}

function takeOrder(reference, uid) {
  const order = pendingOrders.get(reference);
  if (!order || order.uid !== String(uid)) {
    return null;
  }
  pendingOrders.delete(reference);
  flush();
  return order;
}

function listWithdrawals(uid) {
  return [...(withdrawalsByUid.get(String(uid)) || [])].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  );
}

function addWithdrawal(uid, record) {
  const key = String(uid);
  const list = withdrawalsByUid.get(key) || [];
  list.unshift(record);
  withdrawalsByUid.set(key, list.slice(0, 80));
  flush();
  return record;
}

module.exports = {
  getBalance,
  getBalances,
  setBalance,
  setBalanceFromParts,
  setBalances,
  credit,
  creditPurchased,
  creditEarned,
  debit,
  debitSplit,
  rememberOrder,
  takeOrder,
  listWithdrawals,
  addWithdrawal,
};
