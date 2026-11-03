import { expect, test, USERS } from '../../support/fixtures';
import { uid } from '../../support/env';

test.describe('authentication', () => {
  test(
    'valid username and PIN return a token and the user profile',
    { tag: ['@smoke', '@REQ-001'] },
    async ({ apiAs }) => {
      const anon = await apiAs('anonymous');
      const r = await anon.post('/auth/login', {
        username: USERS.operator.username,
        pin: USERS.operator.pin,
      });
      expect(r.status).toBe(200);
      expect(r.body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(r.body.user).toMatchObject({
        username: 'picker1',
        role: 'operator',
        displayName: 'Pat Picker',
        active: true,
      });
      expect(r.body.user).not.toHaveProperty('pinHash');
    },
  );

  test('username matching is case-insensitive', { tag: '@REQ-001' }, async ({ apiAs }) => {
    const anon = await apiAs('anonymous');
    const r = await anon.post('/auth/login', { username: 'ADMIN', pin: '1234' });
    expect(r.status).toBe(200);
    expect(r.body.user.username).toBe('admin');
  });

  test('a wrong PIN is rejected with 401 and no token', { tag: '@REQ-001' }, async ({ apiAs }) => {
    const anon = await apiAs('anonymous');
    const r = await anon.post('/auth/login', { username: 'admin', pin: '0000' });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(r.body.token).toBeUndefined();
  });

  test(
    'an unknown user gets the same answer as a wrong PIN (no user enumeration)',
    { tag: '@REQ-001' },
    async ({ apiAs }) => {
      const anon = await apiAs('anonymous');
      const wrongPin = await anon.post('/auth/login', { username: 'admin', pin: '0000' });
      const unknown = await anon.post('/auth/login', { username: 'nobody-here', pin: '1234' });
      expect(unknown.status).toBe(401);
      expect(unknown.body.error).toEqual(wrongPin.body.error);
    },
  );

  test('a deactivated user cannot sign in', { tag: '@REQ-002' }, async ({ apiAs }) => {
    const anon = await apiAs('anonymous');
    const r = await anon.post('/auth/login', { username: 'inactive', pin: '1234' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('USER_INACTIVE');
  });

  test(
    'missing fields produce a validation error that names the fields',
    { tag: '@REQ-032' },
    async ({ apiAs }) => {
      const anon = await apiAs('anonymous');
      const r = await anon.post('/auth/login', { username: '' });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
      const paths = (r.body.error.details as Array<{ path: string }>).map((d) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['username', 'pin']));
    },
  );

  test('/auth/me requires a bearer token', { tag: '@REQ-001' }, async ({ apiAs }) => {
    const anon = await apiAs('anonymous');
    const r = await anon.get('/auth/me');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('a tampered token is rejected', { tag: '@REQ-001' }, async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.API_URL ?? 'http://localhost:4000',
      extraHTTPHeaders: {
        authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.not-a-real-signature',
      },
    });
    const res = await ctx.get('/api/auth/me');
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('/auth/me returns the signed-in user', { tag: '@REQ-001' }, async ({ apiAs }) => {
    const sup = await apiAs('supervisor');
    const r = await sup.get('/auth/me');
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ username: 'super', role: 'supervisor' });
  });

  test(
    'deactivating a user kills their existing session',
    { tag: '@REQ-002' },
    async ({ api, apiAs, factory }) => {
      const u = await factory.user({ pin: '2468' });
      const session = await apiAs({ username: u.username, pin: '2468' });
      expect((await session.get('/auth/me')).status).toBe(200);

      await api.patchOk(`/users/${u.id}`, { active: false });
      const after = await session.get('/auth/me');
      expect(after.status).toBe(403);
      expect(after.body.error.code).toBe('USER_INACTIVE');

      const relogin = await (
        await apiAs('anonymous')
      ).post('/auth/login', { username: u.username, pin: '2468' });
      expect(relogin.status).toBe(403);
    },
  );

  test(
    'a new user can sign in with the PIN they were given',
    { tag: '@REQ-033' },
    async ({ factory, apiAs }) => {
      const username = uid('login').toLowerCase();
      await factory.user({ username, pin: '9999', role: 'supervisor' });
      const anon = await apiAs('anonymous');
      const r = await anon.post('/auth/login', { username, pin: '9999' });
      expect(r.status).toBe(200);
      expect(r.body.user.role).toBe('supervisor');
    },
  );
});
