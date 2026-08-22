import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { loadEnv } from './env.js';
import { startEmbeddedPostgres } from './embeddedPostgres.js';
import { initFirebaseAdmin } from './lib/firebaseAdmin.js';
import { prisma } from './lib/prisma.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { giftsRouter } from './routes/gifts.js';
import { streamsRouter } from './routes/streams.js';
import { walletRouter } from './routes/wallet.js';
import { webhooksRouter } from './routes/webhooks.js';
import { attachSocket } from './socket.js';

async function main() {
  if (process.env.USE_EMBEDDED_POSTGRES !== 'false') {
    const url = await startEmbeddedPostgres();
    process.env.DATABASE_URL = process.env.DATABASE_URL || url;
  }

  const env = loadEnv();
  initFirebaseAdmin(env);

  const app = express();
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'liveboom-api' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/streams', streamsRouter);
  app.use('/api/streams', giftsRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/webhooks', webhooksRouter);

  app.use(errorHandler);

  const server = createServer(app);
  attachSocket(server, env.CLIENT_ORIGIN);

  server.listen(env.PORT, () => {
    console.log(`[liveboom-api] http://localhost:${String(env.PORT)}`);
  });
}

main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
