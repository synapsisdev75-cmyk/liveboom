const persist = require('./persist');

const balances = new Map();
const pendingOrders = new Map();
/** @type {Map<string, object[]>} */
const withdrawalsByUid = new Map();

function hydrate() {
  const data = persist.load('wallet', { balances: {}, pendingOrders: {}, withdrawals: {} });
  for (const [uid, coins] of Object.entries(data.balances || {})) {
    balances.set(uid, Number(coins) || 0);
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

function getBalance(uid) {
  return Number(balances.get(String(uid)) || 0);
}

function setBalance(uid, coins) {
  const next = Math.max(0, Number(coins) || 0);
  balances.set(String(uid), next);
  flush();
  return next;
}

function credit(uid, coins) {
  return setBalance(uid, getBalance(uid) + Math.max(0, Number(coins) || 0));
}

function debit(uid, coins) {
  const amount = Math.max(0, Number(coins) || 0);
  const current = getBalance(uid);
  if (current < amount) return null;
  return setBalance(uid, current - amount);
}

function rememberOrder(order) {
  pendingOrders.set(order.reference, {
    uid: String(order.uid),
    coins: Number(order.coins) || 0,
    packageId: order.packageId,
    floor: Math.max(0, Number(order.floor) || 0),
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
  setBalance,
  credit,
  debit,
  rememberOrder,
  takeOrder,
  listWithdrawals,
  addWithdrawal,
};
