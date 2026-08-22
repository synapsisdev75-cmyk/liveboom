const { prisma, hasDatabase } = require('../lib/prisma');
const dbUserFromToken = require('../lib/dbUserFromToken');

function toDbUser(decoded) {
  const fn =
    typeof dbUserFromToken === 'function'
      ? dbUserFromToken
      : dbUserFromToken.dbUserFromToken || dbUserFromToken.default;
  return fn(decoded);
}

async function requireDbUser(req, res, next) {
  if (!hasDatabase || !prisma) {
    req.dbUser = toDbUser(req.user);
    next();
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.user.uid },
    });
    if (!user) {
      req.dbUser = toDbUser(req.user);
      next();
      return;
    }
    req.dbUser = user;
    next();
  } catch (error) {
    console.error('[auth] requireDbUser:', error);
    req.dbUser = toDbUser(req.user);
    next();
  }
}

module.exports = requireDbUser;
module.exports.requireDbUser = requireDbUser;
module.exports.default = requireDbUser;
