-- Liveboom — esquema alineado con Cloud SQL
-- Instancia: liveboom-app-instance
-- Tablas: User, Stream, Gift, Transaction, StreamGift

CREATE TABLE IF NOT EXISTS "User" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "firebaseUid"   TEXT NOT NULL UNIQUE,
  "username"      TEXT NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "avatarUrl"     TEXT,
  "bio"           TEXT,
  "coinsBalance"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Stream" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "hostId"     UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title"      TEXT NOT NULL,
  "isLive"     BOOLEAN NOT NULL DEFAULT false,
  "coverUrl"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Gift" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"       TEXT NOT NULL,
  "emoji"      TEXT NOT NULL DEFAULT '🎁',
  "price"      INTEGER NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Transaction" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"      UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "amount"      INTEGER NOT NULL,
  "amountInCop" INTEGER NOT NULL,
  "type"        TEXT NOT NULL DEFAULT 'deposit',
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "packageId"   TEXT NOT NULL,
  "reference"   TEXT NOT NULL UNIQUE,
  "wompiTxnId"  TEXT UNIQUE,
  "currency"    TEXT NOT NULL DEFAULT 'COP',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "StreamGift" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "streamId"   UUID NOT NULL REFERENCES "Stream"("id") ON DELETE CASCADE,
  "giftId"     UUID NOT NULL REFERENCES "Gift"("id") ON DELETE CASCADE,
  "senderId"   UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Stream_hostId_idx" ON "Stream"("hostId");
CREATE INDEX IF NOT EXISTS "Transaction_userId_idx" ON "Transaction"("userId");
CREATE INDEX IF NOT EXISTS "Transaction_userId_status_idx" ON "Transaction"("userId", "status");
CREATE INDEX IF NOT EXISTS "StreamGift_streamId_idx" ON "StreamGift"("streamId");
