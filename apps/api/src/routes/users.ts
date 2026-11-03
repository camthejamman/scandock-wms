import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, pool, q } from '../db/pool.js';
import { conflict, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { ROLES } from '../types.js';

const USER_COLS = `id, username, display_name AS "displayName", role, active, created_at AS "createdAt"`;

const pinSchema = z.string().regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits');

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9._-]{2,19}$/,
      'Username must be 3-20 characters: letters, digits, . _ -',
    ),
  displayName: z.string().trim().min(1).max(80),
  role: z.enum(ROLES),
  pin: pinSchema,
});

const patchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    role: z.enum(ROLES).optional(),
    active: z.boolean().optional(),
    pin: pinSchema.optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, 'At least one field is required');

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const adminOnly = { preHandler: [app.authenticate, app.requireRole('admin')] };

  app.get(
    '/users',
    { preHandler: [app.authenticate, app.requireRole('admin', 'supervisor')] },
    async () => {
      const rows = await q(pool, `SELECT ${USER_COLS} FROM users ORDER BY username`);
      return { data: rows, total: rows.length };
    },
  );

  app.post('/users', adminOnly, async (req, reply) => {
    const body = parse(createSchema, req.body ?? {}, 'user');
    if (await one(pool, 'SELECT 1 FROM users WHERE lower(username) = $1', [body.username])) {
      throw conflict('DUPLICATE_USERNAME', `Username ${body.username} is taken`);
    }
    const hash = await bcrypt.hash(body.pin, 8);
    const row = await one(
      pool,
      `INSERT INTO users (username, display_name, role, pin_hash) VALUES ($1, $2, $3, $4) RETURNING ${USER_COLS}`,
      [body.username, body.displayName, body.role, hash],
    );
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { id: string } }>('/users/:id', adminOnly, async (req) => {
    const id = Number(req.params.id);
    const user = Number.isInteger(id)
      ? await one<{ id: number; role: string }>(pool, 'SELECT id, role FROM users WHERE id = $1', [
          id,
        ])
      : undefined;
    if (!user) throw notFound('USER_NOT_FOUND', `No user with id ${req.params.id}`);
    const body = parse(patchSchema, req.body ?? {}, 'user');
    if (user.id === req.auth.id && body.active === false) {
      throw conflict('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
    }
    if (user.id === req.auth.id && body.role && body.role !== 'admin') {
      throw conflict('CANNOT_CHANGE_OWN_ROLE', 'You cannot remove your own admin role');
    }
    const hash = body.pin ? await bcrypt.hash(body.pin, 8) : null;
    const row = await one(
      pool,
      `UPDATE users SET display_name = COALESCE($2, display_name), role = COALESCE($3, role),
         active = COALESCE($4, active), pin_hash = COALESCE($5, pin_hash)
       WHERE id = $1 RETURNING ${USER_COLS}`,
      [id, body.displayName ?? null, body.role ?? null, body.active ?? null, hash],
    );
    return row;
  });
}
