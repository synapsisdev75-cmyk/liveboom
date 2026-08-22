const balances = new Map();
const pendingOrders = new Map();

function getBalance(uid) {
  return Number(balances.get(String(uid)) || 0);
}

function setBalance(uid, coins) {
  const next = Math.max(0, Number(coins) || 0);
  balances.set(String(uid), next);
  return next;
}

function credit(uid, coins) {
  return setBalance(uid, getBalance(uid) + Math.max(0, Number(coins) || 0));
}

function rememberOrder(order) {
  pendingOrders.set(order.reference, {
    uid: String(order.uid),
    coins: Number(order.coins) || 0,
    packageId: order.packageId,
  });
}

function takeOrder(reference, uid) {
  const order = pendingOrders.get(reference);
  if (!order || order.uid !== String(uid)) {
    return null;
  }
  pendingOrders.delete(reference);
  return order;
}

module.exports = { getBalance, setBalance, credit, rememberOrder, takeOrder };
