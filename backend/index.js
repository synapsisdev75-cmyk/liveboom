require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { prisma } = require('./src/lib/prisma');
const { getBalance } = require('./src/lib/walletMemory');
const { initSocket } = require('./src/lib/socket');
const authRoutes = require('./src/routes/auth');
const paymentsRoutes = require('./src/routes/payments');
const webhooksRoutes = require('./src/routes/webhooks');
const livekitRoutes = require('./src/routes/livekit');
const streamRoutes = require('./src/routes/stream');
const giftsRoutes = require('./src/routes/gifts');
const usersRoutes = require('./src/routes/users');

const app = express();
const httpServer = http.createServer(app);
const port = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/gifts', giftsRoutes);
app.use('/api/users', usersRoutes);

app.get('/api/health', async (_req, res) => {
  if (!prisma) {
    res.json({ status: 'ok', message: 'Liveboom Backend Running', db: 'disconnected' });
    return;
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', message: 'Liveboom Backend Running', db: 'connected' });
  } catch (error) {
    res.json({
      status: 'ok',
      message: 'Liveboom Backend Running',
      db: 'disconnected',
    });
  }
});

/**
 * Devuelve el saldo. Si el usuario no existe en Cloud SQL / PostgreSQL, lo crea con 0 coins.
 */
app.get('/api/wallet/:firebaseUid', async (req, res) => {
  const { firebaseUid } = req.params;

  if (!prisma) {
    const coins = getBalance(firebaseUid);
    res.json({
      firebaseUid,
      username: firebaseUid.slice(0, 24) || 'user',
      coins,
      coinsBalance: coins,
    });
    return;
  }

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

app.use((error, _req, res, _next) => {
  console.error('[liveboom] error no controlado', error);
  if (res.headersSent) return;
  res.status(500).json({
    error: error instanceof Error ? error.message : 'Error interno del API',
  });
});

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

if (!isServerless) {
  try {
    initSocket(httpServer);
  } catch (error) {
    console.warn('[liveboom] Socket.io no iniciado:', error.message);
  }
  httpServer.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE') {
      console.error(`[liveboom] el puerto ${port} ya está ocupado. Cierra el otro proceso e inicia de nuevo.`);
      process.exit(1);
    }
    console.error('[liveboom] error del servidor http', error);
  });
  httpServer.listen(port, () => {
    console.log(`[liveboom] backend listo en http://localhost:${port}`);
  });
}

module.exports = app;



