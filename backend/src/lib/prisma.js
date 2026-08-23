let prisma = null;
let hasDatabase = false;

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const localDb =
  /127\.0\.0\.1|localhost/.test(databaseUrl) || databaseUrl.includes('55432');

if (localDb) {
  console.warn(
    '[prisma] DATABASE_URL apunta a Postgres local; se omite (usa Cloud SQL en producción)',
  );
}

if (databaseUrl && !localDb) {
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    hasDatabase = true;
    prisma
      .$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3)')
      .catch((error) => {
        console.warn('[prisma] no se pudo asegurar birthDate:', error.message);
      });
    prisma
      .$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT')
      .catch((error) => {
        console.warn('[prisma] no se pudo asegurar displayName:', error.message);
      });
    prisma
      .$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "category" TEXT')
      .catch((error) => {
        console.warn('[prisma] no se pudo asegurar category:', error.message);
      });
  } catch (error) {
    console.warn('[prisma] cliente no disponible:', error.message);
    prisma = null;
    hasDatabase = false;
  }
}

module.exports = { prisma, hasDatabase };
