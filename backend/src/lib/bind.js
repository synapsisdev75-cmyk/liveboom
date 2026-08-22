/**
 * Vercel/rolldown a veces expone CJS como `.default`.
 * Esto evita `TypeError: argument handler must be a function` al montar rutas.
 */
function resolveFn(mod, name) {
  if (!mod) return null;
  if (typeof mod[name] === 'function') return mod[name];
  if (mod.default && typeof mod.default[name] === 'function') return mod.default[name];
  if (typeof mod.default === 'function' && name === 'default') return mod.default;
  return null;
}

function bind(loadMod, name) {
  return function boundRoute(req, res, next) {
    try {
      const mod = typeof loadMod === 'function' ? loadMod() : loadMod;
      const fn = resolveFn(mod, name);
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

function bindExport(loadMod, name) {
  const wrapped = bind(loadMod, name);
  // Validación temprana en local; en Vercel se resuelve en el primer request.
  return wrapped;
}

module.exports = { bind, bindExport, resolveFn };
