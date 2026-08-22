const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

prisma
  .$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3)')
  .catch(() => {
    /* Sin DATABASE_URL o sin tabla User todavía */
  });

module.exports = { prisma };
