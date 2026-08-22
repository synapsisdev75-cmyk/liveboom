/** Compat: reexporta middlewares nuevos sin firebase-admin / jose. */
const requireAuth = require('./requireAuth');
const requireDbUser = require('./requireDbUser');
const dbUserFromToken = require('../lib/dbUserFromToken');
const verifyFirebaseIdToken = require('../lib/verifyFirebaseToken');

function asFn(mod) {
  if (typeof mod === 'function') return mod;
  return mod?.default || mod?.requireAuth || mod?.requireDbUser || mod?.verifyFirebaseIdToken || null;
}

module.exports = {
  requireAuth: asFn(requireAuth),
  requireDbUser: asFn(requireDbUser),
  dbUserFromToken: asFn(dbUserFromToken),
  verifyFirebaseIdToken: asFn(verifyFirebaseIdToken),
};
module.exports.default = module.exports;
