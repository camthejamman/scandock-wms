import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, pool } from '../db/pool.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import type { AuthUser } from '../types.js';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'username is required').max(40),
  pin: z.string().min(1, 'pin is required').max(32),
});

export function publicUser(u: AuthUser) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    active: u.active,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req, reply) => {
    const { username, pin } = parse(loginSchema, req.body ?? {}, 'login');
    const user = await one<AuthUser & { pinHash: string }>(
      pool,
      `SELECT id, username, display_name AS "displayName", role, active, pin_hash AS "pinHash"
       FROM users WHERE lower(username) = lower($1)`,
      [username],
    );
    const ok = user ? await bcrypt.compare(pin, user.pinHash) : false;
    if (!user || !ok) throw unauthorized('INVALID_CREDENTIALS', 'Username or PIN is incorrect');
    if (!user.active) throw forbidden('USER_INACTIVE', 'This user has been deactivated');
    const token = app.jwt.sign({ sub: user.id, username: user.username, role: user.role });
    return reply.send({ token, user: publicUser(user) });
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (req) => ({
    user: publicUser(req.auth),
  }));
}
