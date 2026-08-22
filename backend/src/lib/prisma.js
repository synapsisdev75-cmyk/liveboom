const { PrismaClient } = require('@prisma/client');

const hasDatabase = Boolean(process.env.DATABASE_URL);
let prisma = null;

if (hasDatabase) {
  prisma = new PrismaClient();
  prisma
    .$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3)')
    .catch((error) => {
      console.warn('[prisma] no se pudo asegurar birthDate:', error.message);
    });
} else {
  console.warn('[prisma] DATABASE_URL no está definida; sync y pagos siguen en modo sin PostgreSQL');
}

module.exports = { prisma, hasDatabase };
