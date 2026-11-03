import { expect, test } from '../../support/fixtures';

test.describe('health and routing', () => {
  test(
    'GET /api/health reports ok with a reachable database',
    { tag: ['@smoke', '@REQ-032'] },
    async ({ apiAs }) => {
      const anon = await apiAs('anonymous');
      const r = await anon.get('/health');
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: 'ok', db: 'ok', testHooks: true });
      expect(typeof r.body.version).toBe('string');
      expect(r.body.uptimeSec).toBeGreaterThanOrEqual(0);
    },
  );

  test('unknown routes return the standard 404 envelope', { tag: '@REQ-032' }, async ({ api }) => {
    const r = await api.get('/does-not-exist');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    expect(r.body.error.message).toContain('GET /api/does-not-exist');
  });

  test('malformed JSON is rejected with 400, not 500', { tag: '@REQ-032' }, async ({ api }) => {
    // A Buffer goes over the wire untouched (Playwright would re-encode a non-JSON string as a JSON string).
    const res = await api.ctx.post('/api/items', {
      headers: { 'content-type': 'application/json' },
      data: Buffer.from('{"sku": '),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('BAD_REQUEST');
  });

  test('an empty JSON body is treated as {}', { tag: '@REQ-032' }, async ({ api }) => {
    const res = await api.ctx.post('/api/erp/sync', {
      headers: { 'content-type': 'application/json' },
      data: '',
    });
    expect(res.status()).toBe(200);
  });
});
