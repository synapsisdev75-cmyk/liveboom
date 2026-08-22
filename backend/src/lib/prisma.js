const { PrismaClient } = require('@prisma/client');

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const localDb =
  /127\.0\.0\.1|localhost/.test(databaseUrl) || databaseUrl.includes('55432');

let prisma = null;
let hasDatabase = Boolean(databaseUrl) && !localDb;

if (localDb) {
  console.warn(
    '[prisma] DATABASE_URL apunta a Postgres local; se omite hasta que el servidor esté encendido',
  );
}

if (hasDatabase) {
  prisma = new PrismaClient();
  prisma
    .$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3)')
    .catch((error) => {
      console.warn('[prisma] no se pudo asegurar birthDate:', error.message);
    });
}

module.exports = { prisma, hasDatabase };
