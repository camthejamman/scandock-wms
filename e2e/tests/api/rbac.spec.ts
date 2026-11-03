import { expect, test } from '../../support/fixtures';
import { uid } from '../../support/env';

/**
 * Role matrix. Each row is an endpoint and the status each role must get.
 * 2xx means "allowed" (the request is otherwise valid or at least passes the role check).
 */
const matrix: Array<{
  name: string;
  call: (c: { post: Function; get: Function; patch: Function }) => Promise<{ status: number }>;
  anonymous: number;
  operator: number;
  supervisor: number;
  admin: number;
}> = [
  {
    name: 'GET /users',
    call: (c) => c.get('/users'),
    anonymous: 401,
    operator: 403,
    supervisor: 200,
    admin: 200,
  },
  {
    name: 'POST /users',
    call: (c) =>
      c.post('/users', {
        username: uid('rb').toLowerCase(),
        displayName: 'x',
        role: 'operator',
        pin: '1234',
      }),
    anonymous: 401,
    operator: 403,
    supervisor: 403,
    admin: 201,
  },
  {
    name: 'PATCH /settings',
    call: (c) => c.patch('/settings', { allowShortPick: true }),
    anonymous: 401,
    operator: 403,
    supervisor: 403,
    admin: 200,
  },
  {
    name: 'GET /settings',
    call: (c) => c.get('/settings'),
    anonymous: 401,
    operator: 200,
    supervisor: 200,
    admin: 200,
  },
  {
    name: 'POST /items',
    call: (c) => c.post('/items', { sku: uid('RB'), name: 'rbac item' }),
    anonymous: 401,
    operator: 403,
    supervisor: 201,
    admin: 201,
  },
  {
    name: 'POST /bins',
    call: (c) => c.post('/bins', { code: uid('RB'), zone: 'STORAGE' }),
    anonymous: 401,
    operator: 403,
    supervisor: 201,
    admin: 201,
  },
  {
    name: 'POST /purchase-orders',
    call: (c) =>
      c.post('/purchase-orders', { vendor: 'v', lines: [{ sku: 'TOY-ROBOT-RED', qty: 1 }] }),
    anonymous: 401,
    operator: 403,
    supervisor: 201,
    admin: 201,
  },
  {
    name: 'POST /sales-orders',
    call: (c) =>
      c.post('/sales-orders', { customer: 'c', lines: [{ sku: 'TOY-ROBOT-RED', qty: 1 }] }),
    anonymous: 401,
    operator: 403,
    supervisor: 201,
    admin: 201,
  },
  {
    // A bin that does not exist: allowed roles pass the role gate and hit the 404, so the row is order-independent.
    name: 'POST /cycle-counts (unknown bin)',
    call: (c) => c.post('/cycle-counts', { bin: 'NO-SUCH-BIN' }),
    anonymous: 401,
    operator: 403,
    supervisor: 404,
    admin: 404,
  },
  {
    name: 'POST /erp/sync',
    call: (c) => c.post('/erp/sync'),
    anonymous: 401,
    operator: 403,
    supervisor: 200,
    admin: 200,
  },
  {
    name: 'GET /erp/status',
    call: (c) => c.get('/erp/status'),
    anonymous: 401,
    operator: 200,
    supervisor: 200,
    admin: 200,
  },
  {
    name: 'GET /items',
    call: (c) => c.get('/items'),
    anonymous: 401,
    operator: 200,
    supervisor: 200,
    admin: 200,
  },
  {
    name: 'GET /reports/dashboard',
    call: (c) => c.get('/reports/dashboard'),
    anonymous: 401,
    operator: 200,
    supervisor: 200,
    admin: 200,
  },
  {
    name: 'POST /transfers (validation passes the role gate)',
    call: (c) =>
      c.post('/transfers', { sku: 'NOPE-SKU', fromBin: 'A-01-01', toBin: 'A-01-02', qty: 1 }),
    anonymous: 401,
    operator: 404,
    supervisor: 404,
    admin: 404,
  },
];

test.describe('role-based access control', () => {
  for (const role of ['anonymous', 'operator', 'supervisor', 'admin'] as const) {
    test(
      `${role} gets the expected status on every guarded endpoint`,
      { tag: ['@REQ-003'] },
      async ({ apiAs }) => {
        const client = await apiAs(role);
        const failures: string[] = [];
        for (const row of matrix) {
          const r = await row.call(client as never);
          const expected = row[role];
          const ok = r.status === expected;
          if (!ok) failures.push(`${row.name}: expected ${expected}, got ${r.status}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
      },
    );
  }

  test(
    'forbidden responses say which roles are allowed',
    { tag: '@REQ-003' },
    async ({ apiAs }) => {
      const op = await apiAs('operator');
      const r = await op.patch('/settings', { blindCounts: false });
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('FORBIDDEN');
      expect(r.body.error.message).toContain('admin');
    },
  );

  test(
    'operators can only approve nothing: count review endpoints are supervisor+',
    { tag: ['@REQ-003', '@REQ-021'] },
    async ({ apiAs, factory }) => {
      const { bin } = await factory.stockedItem(3);
      const count = await factory.cycleCount(bin.code);
      const op = await apiAs('operator');
      expect((await op.post(`/cycle-counts/${count.id}/approve`)).status).toBe(403);
      expect((await op.post(`/cycle-counts/${count.id}/reject`)).status).toBe(403);
    },
  );
});
