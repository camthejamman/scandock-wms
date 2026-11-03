import type { preHandlerAsyncHookHandler } from 'fastify';

export type Role = 'admin' | 'supervisor' | 'operator';
export const ROLES: Role[] = ['admin', 'supervisor', 'operator'];

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: preHandlerAsyncHookHandler;
    requireRole: (...roles: Role[]) => preHandlerAsyncHookHandler;
  }
  interface FastifyRequest {
    auth: AuthUser;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number; username: string; role: Role };
  }
}
