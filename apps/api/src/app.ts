import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { one, pool } from './db/pool.js';
import { AppError, forbidden, unauthorized } from './lib/errors.js';
import type { AuthUser, Role } from './types.js';
import { registerRoutes } from './routes/index.js';

export interface BuildOptions {
  logger?: boolean | Record<string, unknown>;
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? { level: config.logLevel },
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: '12h' } });

  app.decorateRequest('auth', null as unknown as AuthUser);
  // Accept an empty body on JSON requests (treat as {}); Fastify rejects it by default.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString();
    if (text.trim() === '') return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      (err as Error & { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  app.decorate('authenticate', async function authenticate(request) {
    let payload: { sub: number };
    try {
      payload = await request.jwtVerify<{ sub: number }>();
    } catch {
      throw unauthorized('UNAUTHENTICATED', 'A valid bearer token is required');
    }
    const user = await one<AuthUser>(
      pool,
      `SELECT id, username, display_name AS "displayName", role, active FROM users WHERE id = $1`,
      [payload.sub],
    );
    if (!user) throw unauthorized('UNAUTHENTICATED', 'Unknown user');
    if (!user.active) throw forbidden('USER_INACTIVE', 'This user has been deactivated');
    request.auth = user;
  });

  app.decorate('requireRole', function requireRole(...roles: Role[]) {
    return async function checkRole(request) {
      if (!request.auth) throw unauthorized('UNAUTHENTICATED', 'A valid bearer token is required');
      if (!roles.includes(request.auth.role)) {
        throw forbidden('FORBIDDEN', `This action needs one of: ${roles.join(', ')}`);
      }
    };
  });

  app.setErrorHandler((err: FastifyError | AppError, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({
        error: { code: err.code, message: err.message, details: err.details ?? undefined },
      });
    }
    const fe = err as FastifyError & { code?: string; constraint?: string };
    if (fe.validation) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: fe.message } });
    }
    if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
      return reply
        .status(fe.statusCode)
        .send({ error: { code: fe.code ?? 'BAD_REQUEST', message: fe.message } });
    }
    if (fe.code === '23505') {
      return reply.status(409).send({
        error: {
          code: 'DUPLICATE',
          message: `Already exists (${fe.constraint ?? 'unique constraint'})`,
        },
      });
    }
    if (fe.code === '23503') {
      return reply
        .status(409)
        .send({ error: { code: 'IN_USE', message: 'This record is referenced by other records' } });
    }
    request.log.error({ err }, 'unhandled error');
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` },
    });
  });

  await app.register(registerRoutes, { prefix: '/api' });
  return app;
}
