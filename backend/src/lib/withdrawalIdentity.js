const { createHash } = require('crypto');

function normalizeClientKey(value) {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) return '';
  return key;
}

function withdrawalFingerprint({
  userId,
  coins,
  fullName,
  documentId,
  payoutMethod,
  accountNumber,
  accountType,
}) {
  return createHash('sha256')
    .update(
      [
        String(userId || '').trim(),
        String(Math.max(0, Math.floor(Number(coins) || 0))),
        String(fullName || '').trim(),
        String(documentId || '').trim(),
        String(payoutMethod || '').trim(),
        String(accountNumber || ''),
        String(accountType || '').trim(),
      ].join('|'),
    )
    .digest('hex');
}

function stableWithdrawalId(userId, clientKey) {
  const digest = createHash('sha256')
    .update(`${String(userId || '').trim()}:${normalizeClientKey(clientKey)}`)
    .digest('hex')
    .slice(0, 24);
  return `wd_${digest}`;
}

function outboxEventId(withdrawalId, updatedAtMs, status) {
  return createHash('sha256')
    .update(`${withdrawalId}:${updatedAtMs}:${status}`)
    .digest('hex');
}

module.exports = {
  normalizeClientKey,
  withdrawalFingerprint,
  stableWithdrawalId,
  outboxEventId,
};
module.exports.default = module.exports;
