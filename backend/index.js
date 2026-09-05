// Wompi sandbox — env cargado desde backend/.env en Firebase deploy
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
require('dotenv').config({ path: path.join(__dirname, '.env.local'), override: true });
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: false });

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
app.use(express.json({ limit: '5mb' }));

// Health primero: si una ruta falla al montar, esto igual puede responder en deploys previos.
app.get('/api/health', async (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Liveboom Backend Running',
    db: prisma ? 'connected-or-ready' : 'disconnected',
    api: 'https://liveboomapp.com',
    auth: 'firebase-jwt-crypto',
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
mount('/api/calls', () => require('./src/routes/calls'));
mount('/api/stream', () => require('./src/routes/stream'));
mount('/api/battle', () => require('./src/routes/battle'));
mount('/api/gifts', () => require('./src/routes/gifts'));
mount('/api/users', () => require('./src/routes/users'));
mount('/api/social', () => require('./src/routes/social'));
mount('/api/messages', () => require('./src/routes/messages'));
mount('/api/ads', () => require('./src/routes/ads'));

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

const isServerless = Boolean(
  process.env.FUNCTION_TARGET ||
  process.env.K_SERVICE ||
  process.env.FIREBASE_CONFIG ||
  process.env.AWS_LAMBDA_FUNCTION_NAME,
);

if (!isServerless && require.main === module) {
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
    const { livekitMissing } = require('./src/lib/livekit');
    const missing = livekitMissing();
    console.log(`[liveboom] backend listo en http://localhost:${port}`);
    console.log(
      missing.length
        ? `[liveboom] LiveKit: falta ${missing.join(', ')}`
        : '[liveboom] LiveKit: configurado',
    );
  });
}

module.exports = app;
module.exports.default = app;

try {
  const { onRequest } = require('firebase-functions/v2/https');
  module.exports.api = onRequest(
    {
      region: 'us-central1',
      memory: '512MiB',
      timeoutSeconds: 120,
    },
    app,
  );
} catch (error) {
  console.warn('[liveboom] firebase-functions no disponible (solo dev local):', error.message);
}
