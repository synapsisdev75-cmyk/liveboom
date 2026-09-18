const persist = require('./persist');
const {
  normalizeBlastBalances,
  applySpend,
  applyCreditPurchased,
  applyCreditEarned,
  applyWithdrawEarned,
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

/** Retiro: solo descuenta blast ganados. */
function debitEarnedOnly(uid, coins) {
  const cur = getBalances(uid);
  const result = applyWithdrawEarned(cur, coins);
  if (!result.ok) return null;
  setBalances(uid, result.balances);
  return result.balances;
}

/**
 * @returns {{ ok: boolean, code?: string, balances?, chargedPurchased: number, chargedEarned: number, partial?: boolean, needsEarnedAuth?: boolean, exhausted?: boolean }}
 */
function debitSplit(uid, coins, allowEarned) {
  const cur = getBalances(uid);
  const spent = applySpend(cur, coins, Boolean(allowEarned));
  if (!spent.ok) {
    return {
      ok: false,
      code: spent.code,
      balances: spent.balances,
      chargedPurchased: 0,
      chargedEarned: 0,
      needsEarnedAuth: spent.code === 'NEEDS_EARNED_AUTH',
    };
  }
  setBalances(uid, spent.balances);
  return {
    ok: true,
    balances: spent.balances,
    chargedPurchased: spent.chargedPurchased,
    chargedEarned: spent.chargedEarned,
    partial: Boolean(spent.partial),
    needsEarnedAuth: Boolean(spent.needsEarnedAuth),
    exhausted: Boolean(spent.exhausted || spent.remainingCharge > 0),
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

function listAllWithdrawals(limit = 200) {
  const cap = Math.min(500, Math.max(1, Math.floor(Number(limit) || 200)));
  /** @type {object[]} */
  const all = [];
  for (const [uid, list] of withdrawalsByUid.entries()) {
    for (const row of list || []) {
      all.push({ ...row, uid: row.uid || uid });
    }
  }
  all.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return all.slice(0, cap);
}

function addWithdrawal(uid, record) {
  const key = String(uid);
  const list = withdrawalsByUid.get(key) || [];
  const withUid = { ...record, uid: record.uid || key };
  list.unshift(withUid);
  withdrawalsByUid.set(key, list.slice(0, 80));
  flush();
  return withUid;
}

function updateWithdrawalStatus(uid, id, status, extra = {}) {
  const key = String(uid);
  const list = withdrawalsByUid.get(key) || [];
  const idx = list.findIndex((row) => String(row.id) === String(id));
  if (idx < 0) return null;
  list[idx] = {
    ...list[idx],
    status: String(status || list[idx].status),
    ...extra,
    updatedAt: new Date().toISOString(),
  };
  withdrawalsByUid.set(key, list);
  flush();
  return list[idx];
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
  debitEarnedOnly,
  debitSplit,
  rememberOrder,
  takeOrder,
  listWithdrawals,
  listAllWithdrawals,
  addWithdrawal,
  updateWithdrawalStatus,
};
