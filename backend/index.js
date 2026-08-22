require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { prisma } = require('./src/lib/prisma');
const authRoutes = require('./src/routes/auth');
const paymentsRoutes = require('./src/routes/payments');
const webhooksRoutes = require('./src/routes/webhooks');

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/webhooks', webhooksRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', message: 'Liveboom Backend Running', db: 'connected' });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      message: 'Liveboom Backend Running',
      db: 'disconnected',
      error: error instanceof Error ? error.message : 'db error',
    });
  }
});

/**
 * Devuelve el saldo. Si el usuario no existe en Cloud SQL / PostgreSQL, lo crea con 0 coins.
 */
app.get('/api/wallet/:firebaseUid', async (req, res) => {
  const { firebaseUid } = req.params;

  try {
    const user = await prisma.user.upsert({
      where: { firebaseUid },
      update: {},
      create: {
        firebaseUid,
        email: `${firebaseUid}@liveboom.local`,
        username: firebaseUid.slice(0, 24) || 'user',
        coinsBalance: 0,
      },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        username: true,
        coinsBalance: true,
        avatarUrl: true,
        bio: true,
      },
    });

    res.json({
      firebaseUid: user.firebaseUid,
      username: user.username,
      coins: user.coinsBalance,
      coinsBalance: user.coinsBalance,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo consultar la billetera' });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`[liveboom] backend listo en http://localhost:${port}`);
  });
}

module.exports = app;
