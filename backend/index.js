require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { prisma } = require('./src/lib/prisma');
const { getBalance } = require('./src/lib/walletMemory');

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

// Health primero: si una ruta falla al montar, esto igual puede responder en deploys previos.
app.get('/api/health', async (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Liveboom Backend Running',
    db: prisma ? 'connected-or-ready' : 'disconnected',
    api: 'https://liveboom.vercel.app',
    auth: 'jwks+firebase-admin',
  });
});

function mount(path, loader) {
  try {
    const mod = loader();
    const router =
      (typeof mod === 'function' && mod) ||
      (mod && typeof mod.default === 'function' && mod.default) ||
      (mod && typeof mod.router === 'function' && mod.router) ||
      null;
    if (!router) {
      console.error(`[liveboom] no se pudo montar ${path}: export inválido`, mod && Object.keys(mod));
      return;
    }
    app.use(path, router);
    console.log(`[liveboom] montado ${path}`);
  } catch (error) {
    console.error(`[liveboom] error montando ${path}:`, error.message);
  }
}

mount('/api/auth', () => require('./src/routes/auth'));
mount('/api/payments', () => require('./src/routes/payments'));
mount('/api/webhooks', () => require('./src/routes/webhooks'));
mount('/api/livekit', () => require('./src/routes/livekit'));
mount('/api/stream', () => require('./src/routes/stream'));
mount('/api/gifts', () => require('./src/routes/gifts'));
mount('/api/users', () => require('./src/routes/users'));

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
    const { initSocket } = require('./src/lib/socket');
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
module.exports.default = app;
