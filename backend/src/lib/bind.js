/**
 * Vercel/rolldown a veces expone CJS como `.default`.
 * Nunca pases el resultado de un destructuring directo a router.get/post:
 * si llega `undefined`, Express tira TypeError y cae TODO el API.
 */

function resolveFn(mod, name) {
  if (!mod) return null;
  if (typeof mod[name] === 'function') return mod[name];
  if (mod.default && typeof mod.default[name] === 'function') return mod.default[name];
  if (typeof mod === 'function' && name === 'default') return mod;
  return null;
}

function loadFn(loadMod, name) {
  const mod = typeof loadMod === 'function' ? loadMod() : loadMod;
  return resolveFn(mod, name);
}

function bind(loadMod, name) {
  return function boundRoute(req, res, next) {
    try {
      const fn = loadFn(loadMod, name);
      if (typeof fn !== 'function') {
        res.status(500).json({ error: `Handler ${name} no disponible en el API` });
        return;
      }
      Promise.resolve(fn(req, res, next)).catch(next);
    } catch (error) {
      next(error);
    }
  };
}

function mw(loadMod, name) {
  return function boundMiddleware(req, res, next) {
    try {
      const fn = loadFn(loadMod, name);
      if (typeof fn !== 'function') {
        res.status(500).json({ error: `Middleware ${name} no disponible en el API` });
        return;
      }
      return fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { bind, mw, resolveFn, loadFn };
