import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Arranca PostgreSQL embebido para desarrollo local (sin Docker).
 * Datos persistentes en packages/backend/.pgdata
 */
export async function startEmbeddedPostgres(): Promise<string> {
  const databaseDir = path.resolve(here, '../.pgdata');
  await mkdir(databaseDir, { recursive: true });

  const port = 55432;
  const user = 'liveboom';
  const password = 'liveboom';
  const database = 'liveboom';

  const postgres = new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });

  try {
    if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) {
      await postgres.initialise();
    }
  } catch {
    // El cluster ya existe entre reinicios.
  }

  try {
    await postgres.start();
  } catch {
    // Puerto ocupado o cluster ya en ejecución.
  }

  try {
    await postgres.createDatabase(database);
  } catch {
    // Ya existe entre reinicios.
  }

  return `postgresql://${user}:${password}@127.0.0.1:${String(port)}/${database}?schema=public`;
}
