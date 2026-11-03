export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5180';
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const ERP_URL = process.env.ERP_URL ?? 'http://localhost:4100';

export type Role = 'admin' | 'supervisor' | 'operator';

/** Demo accounts from the seed. */
export const USERS: Record<Role, { username: string; pin: string; displayName: string }> = {
  admin: { username: 'admin', pin: '1234', displayName: 'Ada Admin' },
  supervisor: { username: 'super', pin: '1234', displayName: 'Sam Supervisor' },
  operator: { username: 'picker1', pin: '1234', displayName: 'Pat Picker' },
};

export const STORAGE_STATE = (role: Role) => `.auth/${role}.json`;

/** Unique suffix so parallel tests never collide on SKUs, bins or order numbers. */
export function uid(prefix = 'T'): string {
  const t = Date.now().toString(36).toUpperCase().slice(-6);
  const r = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `${prefix}-${t}${r}`;
}
