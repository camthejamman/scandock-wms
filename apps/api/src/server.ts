import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { seedIfEmpty } from './db/seed.js';
import { startOutboxFlusher } from './services/erp.js';

async function main() {
  const app = await buildApp({
    logger: {
      level: config.logLevel,
      ...(process.stdout.isTTY
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : {}),
    },
  });

  // Wait for Postgres (compose starts it first, but local dev may race it).
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate();
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      app.log.warn(`database not ready (attempt ${attempt}): ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (await seedIfEmpty()) app.log.info('seeded demo data');

  const stopFlusher = startOutboxFlusher(config.outboxIntervalMs, app.log);

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    stopFlusher();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `ScanDock API ${config.version} ready (test hooks ${config.testHooks ? 'ON' : 'off'})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
