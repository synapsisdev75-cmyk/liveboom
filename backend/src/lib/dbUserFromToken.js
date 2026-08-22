const { getBalance } = require('./walletMemory');

function dbUserFromToken(decoded) {
  const raw = decoded.name || (decoded.email ? decoded.email.split('@')[0] : decoded.uid);
  const base =
    String(raw)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20) || 'user';
  return {
    id: decoded.uid,
    firebaseUid: decoded.uid,
    email: decoded.email || `${decoded.uid}@users.liveboom.local`,
    username: `${base}_${decoded.uid.slice(0, 8)}`,
    avatarUrl: decoded.picture || null,
    bio: null,
    coinsBalance: getBalance(decoded.uid),
  };
}

module.exports = dbUserFromToken;
module.exports.dbUserFromToken = dbUserFromToken;
module.exports.default = dbUserFromToken;
