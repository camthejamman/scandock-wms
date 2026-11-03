import { expect, test } from '../../support/fixtures';

test.describe('labels (ZPL)', () => {
  test(
    'bin labels encode the code as Code 128 with the zone as text',
    { tag: '@REQ-027' },
    async ({ api }) => {
      const r = await api.getOk('/labels/bin/a-01-02');
      expect(r).toMatchObject({ type: 'bin', code: 'A-01-02', zone: 'STORAGE' });
      expect(r.zpl.startsWith('^XA')).toBe(true);
      expect(r.zpl.trim().endsWith('^XZ')).toBe(true);
      expect(r.zpl).toContain('^BCN');
      expect(r.zpl).toContain('^FDA-01-02^FS');
      expect(r.zpl).toContain('Zone: STORAGE');
    },
  );

  test(
    'item labels use the UPC-A command with the 11 data digits and an optional lot',
    { tag: '@REQ-027' },
    async ({ api }) => {
      const item = await api.getOk('/items/TOY-ROBOT-RED');
      const r = await api.getOk(`/labels/item/${item.barcode}`, { lot: 'LOT-1' });
      expect(r).toMatchObject({
        type: 'item',
        sku: 'TOY-ROBOT-RED',
        barcode: item.barcode,
        lot: 'LOT-1',
      });
      expect(r.zpl).toContain(`^BUN`);
      expect(r.zpl).toContain(`^FD${item.barcode.slice(0, 11)}^FS`);
      expect(r.zpl).toContain('Lot: LOT-1');
      const noLot = await api.getOk('/labels/item/TOY-ROBOT-RED');
      expect(noLot.lot).toBeNull();
      expect(noLot.zpl).not.toContain('Lot:');
    },
  );

  test('labels for unknown things are 404s', { tag: '@REQ-027' }, async ({ api }) => {
    expect((await api.get('/labels/bin/NOPE')).status).toBe(404);
    expect((await api.get('/labels/item/NOPE')).status).toBe(404);
  });

  test(
    'a hostile item name cannot inject ZPL commands into the label',
    { tag: '@REQ-027' },
    async ({ api, factory }) => {
      const item = await factory.item({ name: 'Evil ^XZ ^XA ~JA label' });
      const r = await api.getOk(`/labels/item/${item.sku}`);
      expect(r.zpl.match(/\^XZ/g)).toHaveLength(1);
      expect(r.zpl).not.toContain('~JA');
    },
  );
});
