// Env para local y Cloud Functions.
// `.env` / `.env.local` están en ignore del deploy; `.env.liveboom-app` sí se empaqueta
// y Firebase CLI lo inyecta al desplegar al proyecto liveboom-app.
// LIVEKIT_* se pisa desde esos archivos para no dejar un proyecto/clave viejo en Cloud Run.
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const LIVEKIT_ENV_KEYS = new Set(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']);

function fillEnvFromFile(filePath, options = {}) {
  try {
    if (!fs.existsSync(filePath)) return;
    const parsed = dotenv.parse(fs.readFileSync(filePath));
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined || String(value).trim() === '') continue;
      const cur = process.env[key];
      const override = Boolean(options.overrideKeys && options.overrideKeys.has(key));
      if (override || cur === undefined || String(cur).trim() === '') {
        process.env[key] = value;
      }
    }
  } catch {
    /* ignore */
  }
}

require('dotenv').config({ path: path.join(__dirname, '.env'), override: false });
require('dotenv').config({ path: path.join(__dirname, '.env.local'), override: false });
fillEnvFromFile(path.join(__dirname, '.env.liveboom-app'), { overrideKeys: LIVEKIT_ENV_KEYS });
fillEnvFromFile(path.join(__dirname, '.env.functions'), { overrideKeys: LIVEKIT_ENV_KEYS });
fillEnvFromFile(path.join(__dirname, '../.env'), { overrideKeys: LIVEKIT_ENV_KEYS });

const http = require('http');
const express = require('express');
const cors = require('cors');
const { prisma } = require('./src/lib/prisma');

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
  let livekitConfigured = false;
  let livekitHost = '';
  try {
    const lk = require('./src/lib/livekit');
    livekitConfigured = typeof lk.livekitEnabled === 'function' && lk.livekitEnabled();
    const raw = typeof lk.publicLiveKitUrl === 'function' ? lk.publicLiveKitUrl() : '';
    if (raw) {
      livekitHost = new URL(raw.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')).host;
    }
  } catch {
    livekitConfigured = false;
  }
  res.json({
    status: 'ok',
    message: 'Liveboom Backend Running',
    db: prisma ? 'connected-or-ready' : 'disconnected',
    api: 'https://liveboomapp.com',
    auth: 'firebase-jwt-crypto',
    livekitConfigured,
    livekitHost,
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
mount('/api/reports', () => require('./src/routes/reports'));
mount('/api/ads', () => require('./src/routes/ads'));
mount('/api/reconstructions', () => require('./src/routes/reconstructions'));
mount('/api/translate', () => require('./src/routes/translate'));
mount('/api/push', () => require('./src/routes/push'));
mount('/api/wallet', () => require('./src/routes/wallet'));
mount('/api/verification', () => require('./src/routes/verification'));

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
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason || 'unknown');
    console.warn('[liveboom] unhandledRejection', msg);
  });
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
      memory: '1GiB',
      timeoutSeconds: 180,
    },
    app,
  );
} catch (error) {
  console.warn('[liveboom] firebase-functions no disponible (solo dev local):', error.message);
}

try {
  const { onSchedule } = require('firebase-functions/v2/scheduler');
  module.exports.syncWithdrawalReport = onSchedule(
    {
      region: 'us-central1',
      schedule: 'every 1 minutes',
      memory: '1GiB',
      timeoutSeconds: 180,
    },
    async () => {
      const { processWithdrawalReportQueue } = require('./src/lib/withdrawalReport');
      const stats = await processWithdrawalReportQueue();
      console.log('[liveboom] reporte retiros', {
        ok: stats?.ok,
        skipped: stats?.skipped,
        rowCount: stats?.rowCount || 0,
      });
    },
  );
  module.exports.reconcileBlastPurchases = onSchedule(
    {
      region: 'us-central1',
      schedule: 'every 5 minutes',
      memory: '256MiB',
      timeoutSeconds: 120,
    },
    async () => {
      const { reconcileStalePending } = require('./src/lib/blastPurchaseService');
      const stats = await reconcileStalePending(25);
      console.log('[liveboom] reconcile compras', stats);
    },
  );
  module.exports.purgeVerificationEvidence = onSchedule(
    {
      region: 'us-central1',
      schedule: 'every sunday 05:00',
      timeZone: 'America/Bogota',
      memory: '512MiB',
      timeoutSeconds: 180,
    },
    async () => {
      const { purgeExpiredEvidence } = require('./src/lib/verificationService');
      const stats = await purgeExpiredEvidence({ limit: 25 });
      console.log('[liveboom] purge verificación', stats);
    },
  );
  module.exports.processGiftAlphaQueue = onSchedule(
    {
      region: 'us-central1',
      schedule: 'every 1 minutes',
      memory: '2GiB',
      timeoutSeconds: 540,
      maxInstances: 1,
      cpu: 2,
    },
    async () => {
      const { processGiftAlphaQueue } = require('./src/lib/giftAlphaConvert');
      const stats = await processGiftAlphaQueue();
      console.log('[liveboom] gift alpha queue', stats);
    },
  );
  module.exports.expirePromoCampaigns = onSchedule(
    {
      region: 'us-central1',
      schedule: 'every 1 minutes',
      memory: '256MiB',
      timeoutSeconds: 60,
    },
    async () => {
      const { expireDueCampaigns } = require('./src/lib/promoCampaigns');
      const stats = await expireDueCampaigns();
      if (stats?.expired) console.log('[liveboom] ads expire', stats);
    },
  );
} catch (error) {
  console.warn('[liveboom] scheduler functions no disponible:', error.message);
}

try {
  const { onDocumentWritten } = require('firebase-functions/v2/firestore');
  module.exports.processGiftAlphaJob = onDocumentWritten(
    {
      document: 'gift_alpha_jobs/{jobId}',
      region: 'us-central1',
      memory: '2GiB',
      timeoutSeconds: 540,
      cpu: 2,
    },
    async (event) => {
      const before = event.data?.before?.data() || null;
      const after = event.data?.after?.data() || null;
      if (!after) return;
      if (after.status !== 'queued' && after.status !== 'retry') return;
      if (before && before.status === after.status) return;
      const { processGiftAlphaJob } = require('./src/lib/giftAlphaConvert');
      await processGiftAlphaJob(event.params.jobId);
    },
  );
} catch (error) {
  console.warn('[liveboom] firestore trigger gift-alpha no disponible:', error.message);
}

try {
  const { onDocumentWritten } = require('firebase-functions/v2/firestore');
  module.exports.processGiftBgJob = onDocumentWritten(
    {
      document: 'gift_bg_jobs/{jobId}',
      region: 'us-central1',
      memory: '2GiB',
      timeoutSeconds: 540,
      cpu: 2,
    },
    async (event) => {
      const before = event.data?.before?.data() || null;
      const after = event.data?.after?.data() || null;
      if (!after) return;
      if (after.status !== 'queued' && after.status !== 'retry') return;
      if (before && before.status === after.status) return;
      const { processGiftBgJob } = require('./src/lib/giftBgRemove');
      await processGiftBgJob(event.params.jobId);
    },
  );
} catch (error) {
  console.warn('[liveboom] firestore trigger gift-bg no disponible:', error.message);
}
