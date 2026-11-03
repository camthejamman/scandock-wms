/** Runtime configuration, all from environment variables with local-dev defaults. */
export const config = {
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://scandock:scandock@localhost:5433/scandock',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me',
  erpUrl: (process.env.ERP_URL ?? 'http://localhost:4100').replace(/\/$/, ''),
  /** Enables POST /api/test/reset. Never true in a real deployment. */
  testHooks: (process.env.TEST_HOOKS ?? 'false') === 'true',
  /** 0 disables the background ERP outbox flusher. */
  outboxIntervalMs: Number(process.env.OUTBOX_INTERVAL_MS ?? 10_000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  version: process.env.APP_VERSION ?? '0.1.0',
};
