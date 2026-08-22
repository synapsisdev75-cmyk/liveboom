import 'dotenv/config';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from './embeddedPostgres.js';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const url = await startEmbeddedPostgres();
process.env.DATABASE_URL = process.env.DATABASE_URL || url;

const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL };

execSync('npx prisma db push', { stdio: 'inherit', env, cwd });
execSync('npx tsx prisma/seed.ts', { stdio: 'inherit', env, cwd });
process.exit(0);
