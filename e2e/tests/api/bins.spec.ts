import { expect, test } from '../../support/fixtures';
import { uid } from '../../support/env';

test.describe('bins', () => {
  test(
    'lists bins with zone, item and unit counts',
    { tag: ['@smoke', '@REQ-006'] },
    async ({ api }) => {
      const r = await api.get('/bins');
      expect(r.status).toBe(200);
      expect(r.body.total).toBeGreaterThanOrEqual(37);
      const a0101 = r.body.data.find((b: any) => b.code === 'A-01-01');
      expect(a0101).toMatchObject({ zone: 'STORAGE', active: true, warehouse: 'JAX' });
      expect(a0101.itemCount).toBeGreaterThan(0);
      expect(a0101.unitsOnHand).toBeGreaterThan(0);
    },
  );

  test(
    'zone filter returns only that zone; invalid zones are rejected',
    { tag: '@REQ-006' },
    async ({ api }) => {
      const r = await api.getOk('/bins', { zone: 'PICKING' });
      expect(r.data.length).toBeGreaterThanOrEqual(8);
      for (const b of r.data) expect(b.zone).toBe('PICKING');
      expect((await api.get('/bins', { zone: 'ATTIC' })).status).toBe(400);
    },
  );

  test(
    'bin detail lists contents and the unit total matches',
    { tag: '@REQ-007' },
    async ({ api }) => {
      const r = await api.getOk('/bins/a-01-01');
      expect(r.code).toBe('A-01-01');
      expect(r.contents.map((c: any) => c.sku)).toEqual(
        expect.arrayContaining(['TOY-ROBOT-RED', 'TOY-ROBOT-BLU']),
      );
      expect(r.unitsOnHand).toBe(r.contents.reduce((s: number, c: any) => s + c.qtyOnHand, 0));
      expect((await api.get('/bins/NOPE-99')).status).toBe(404);
    },
  );

  test(
    'creating a bin upper-cases the code and rejects duplicates / bad input',
    { tag: '@REQ-006' },
    async ({ api }) => {
      const code = uid('tb').toLowerCase();
      const created = await api.post('/bins', { code, zone: 'STORAGE' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        code: code.toUpperCase(),
        zone: 'STORAGE',
        active: true,
      });

      expect((await api.post('/bins', { code, zone: 'PICKING' })).body.error.code).toBe(
        'DUPLICATE_BIN',
      );
      expect((await api.post('/bins', { code: uid('TB'), zone: 'ATTIC' })).status).toBe(400);
      expect((await api.post('/bins', { code: 'bad code!', zone: 'STORAGE' })).status).toBe(400);
    },
  );

  test(
    'a bin holding stock cannot be deactivated; an empty one can and can come back',
    { tag: '@REQ-006' },
    async ({ api, factory }) => {
      const { bin } = await factory.stockedItem(2);
      const blocked = await api.patch(`/bins/${bin.code}`, { active: false });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('BIN_NOT_EMPTY');

      const empty = await factory.bin('STORAGE');
      const off = await api.patchOk(`/bins/${empty.code}`, { active: false });
      expect(off.active).toBe(false);
      const on = await api.patchOk(`/bins/${empty.code}`, { active: true, zone: 'PICKING' });
      expect(on).toMatchObject({ active: true, zone: 'PICKING' });
    },
  );
});
