const verifyFirebaseIdToken = require('../lib/verifyFirebaseToken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Falta el header Authorization: Bearer <token>' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Token vacío' });
    return;
  }

  const verify =
    typeof verifyFirebaseIdToken === 'function'
      ? verifyFirebaseIdToken
      : verifyFirebaseIdToken.verifyFirebaseIdToken || verifyFirebaseIdToken.default;

  Promise.resolve()
    .then(() => verify(token))
    .then((decoded) => {
      if (!decoded?.uid) {
        res.status(401).json({ error: 'Token sin uid' });
        return;
      }
      req.user = decoded;
      next();
    })
    .catch((error) => {
      console.error('[auth] JWT inválido:', error.message);
      if (!res.headersSent) {
        res.status(401).json({ error: 'Token inválido o expirado' });
      }
    });
}

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.default = requireAuth;
