const { getBalance } = require('./walletMemory');
const { getProfile } = require('./profileMemory');

function usernameFromToken(decoded) {
  const fromName = String(decoded.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20);
  if (fromName && fromName.length >= 3) return fromName;
  const raw = decoded.email ? decoded.email.split('@')[0] : decoded.uid;
  const base =
    String(raw)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20) || 'user';
  return `${base}_${decoded.uid.slice(0, 8)}`;
}

function dbUserFromToken(decoded) {
  const saved = getProfile(decoded.uid);
  if (saved) {
    return {
      id: saved.id || decoded.uid,
      firebaseUid: decoded.uid,
      email: saved.email || decoded.email || `${decoded.uid}@users.liveboom.local`,
      username: saved.username,
      displayName: saved.displayName || saved.username,
      avatarUrl: saved.avatarUrl ?? decoded.picture ?? null,
      bio: saved.bio ?? null,
      birthDate: saved.birthDate ?? null,
      coinsBalance: getBalance(decoded.uid),
    };
  }
  const username = usernameFromToken(decoded);
  return {
    id: decoded.uid,
    firebaseUid: decoded.uid,
    email: decoded.email || `${decoded.uid}@users.liveboom.local`,
    username,
    displayName: decoded.name || username,
    avatarUrl: decoded.picture || null,
    bio: null,
    birthDate: null,
    coinsBalance: getBalance(decoded.uid),
  };
}

module.exports = dbUserFromToken;
module.exports.dbUserFromToken = dbUserFromToken;
module.exports.default = dbUserFromToken;
