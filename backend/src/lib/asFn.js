/**
 * Normaliza exports CJS/ESM del bundler de Vercel.
 */
function asFn(mod) {
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod.default === 'function') return mod.default;
  if (mod && typeof mod.requireAuth === 'function') return mod.requireAuth;
  if (mod && typeof mod.requireDbUser === 'function') return mod.requireDbUser;
  return null;
}

module.exports = { asFn };
module.exports.asFn = asFn;
module.exports.default = asFn;
