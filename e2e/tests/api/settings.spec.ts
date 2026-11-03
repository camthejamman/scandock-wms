import { expect, test } from '../../support/fixtures';

test.describe('settings (read side)', () => {
  test(
    'every role can read the four warehouse settings',
    { tag: '@REQ-028' },
    async ({ apiAs }) => {
      const op = await apiAs('operator');
      const s = await op.getOk('/settings');
      expect(Object.keys(s).sort()).toEqual([
        'allowNegativeInventory',
        'allowOverReceipt',
        'allowShortPick',
        'blindCounts',
      ]);
      for (const v of Object.values(s)) expect(typeof v).toBe('boolean');
    },
  );

  test(
    'unknown or empty patches are rejected (admin)',
    { tag: ['@REQ-028', '@REQ-032'] },
    async ({ api }) => {
      expect((await api.patch('/settings', {})).status).toBe(400);
      expect((await api.patch('/settings', { darkMode: true })).status).toBe(400);
      expect((await api.patch('/settings', { blindCounts: 'yes' })).status).toBe(400);
    },
  );
});
