import { expect, test } from '../../support/fixtures';
import { uid } from '../../support/env';

test.describe('user administration', () => {
  test('admins list users without secrets', { tag: ['@smoke', '@REQ-033'] }, async ({ api }) => {
    const r = await api.getOk('/users');
    expect(r.data.map((u: any) => u.username)).toEqual(
      expect.arrayContaining(['admin', 'super', 'picker1', 'receiver1', 'inactive']),
    );
    for (const u of r.data) {
      expect(u).not.toHaveProperty('pinHash');
      expect(['admin', 'supervisor', 'operator']).toContain(u.role);
    }
    expect(r.data.find((u: any) => u.username === 'inactive').active).toBe(false);
  });

  test(
    'creating a user lower-cases the username and validates the input',
    { tag: '@REQ-033' },
    async ({ api }) => {
      const username = uid('New');
      const r = await api.post('/users', {
        username,
        displayName: 'New Person',
        role: 'operator',
        pin: '4321',
      });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({
        username: username.toLowerCase(),
        displayName: 'New Person',
        role: 'operator',
        active: true,
      });

      expect(
        (await api.post('/users', { username, displayName: 'Dupe', role: 'operator', pin: '4321' }))
          .body.error.code,
      ).toBe('DUPLICATE_USERNAME');
      expect(
        (
          await api.post('/users', {
            username: uid('x'),
            displayName: 'x',
            role: 'operator',
            pin: '12',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await api.post('/users', {
            username: uid('x'),
            displayName: 'x',
            role: 'operator',
            pin: 'abcd',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await api.post('/users', {
            username: 'bad user!',
            displayName: 'x',
            role: 'operator',
            pin: '1234',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await api.post('/users', {
            username: uid('x'),
            displayName: 'x',
            role: 'boss',
            pin: '1234',
          })
        ).status,
      ).toBe(400);
    },
  );

  test(
    'role changes, deactivation and PIN resets take effect immediately',
    { tag: ['@REQ-002', '@REQ-033'] },
    async ({ api, apiAs, factory }) => {
      const u = await factory.user({ pin: '1111' });
      const promoted = await api.patchOk(`/users/${u.id}`, { role: 'supervisor' });
      expect(promoted.role).toBe('supervisor');
      const asUser = await apiAs({ username: u.username, pin: '1111' });
      expect((await asUser.get('/users')).status).toBe(200);

      await api.patchOk(`/users/${u.id}`, { pin: '2222' });
      const anon = await apiAs('anonymous');
      expect((await anon.post('/auth/login', { username: u.username, pin: '1111' })).status).toBe(
        401,
      );
      expect((await anon.post('/auth/login', { username: u.username, pin: '2222' })).status).toBe(
        200,
      );

      await api.patchOk(`/users/${u.id}`, { active: false });
      expect((await anon.post('/auth/login', { username: u.username, pin: '2222' })).status).toBe(
        403,
      );
      await api.patchOk(`/users/${u.id}`, { active: true });
      expect((await anon.post('/auth/login', { username: u.username, pin: '2222' })).status).toBe(
        200,
      );
    },
  );

  test('an admin cannot lock themselves out', { tag: '@REQ-033' }, async ({ api }) => {
    const me = (await api.getOk('/auth/me')).user;
    const deact = await api.patch(`/users/${me.id}`, { active: false });
    expect(deact.status).toBe(409);
    expect(deact.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');
    const demote = await api.patch(`/users/${me.id}`, { role: 'operator' });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
    expect((await api.patch(`/users/${me.id}`, { displayName: 'Ada Admin' })).status).toBe(200);
  });

  test(
    'unknown users and empty patches are rejected',
    { tag: '@REQ-032' },
    async ({ api, factory }) => {
      expect((await api.patch('/users/999999', { active: true })).status).toBe(404);
      expect((await api.patch('/users/abc', { active: true })).status).toBe(404);
      const u = await factory.user();
      expect((await api.patch(`/users/${u.id}`, {})).status).toBe(400);
      expect((await api.patch(`/users/${u.id}`, { username: 'nope' })).status).toBe(400);
    },
  );
});
