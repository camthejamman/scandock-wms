import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { Role, User } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../state/auth';
import { useToast } from '../../state/toast';
import { ErrorState, Loading } from '../../components/Loading';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';

const ROLES: Role[] = ['operator', 'supervisor', 'admin'];

export function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const users = useApi(() => api<{ data: User[] }>('/users'), []);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    username: '',
    displayName: '',
    role: 'operator' as Role,
    pin: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinFor, setPinFor] = useState<User | null>(null);
  const [newPin, setNewPin] = useState('');

  async function create(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await api('/users', {
        method: 'POST',
        body: {
          ...form,
          username: form.username.trim().toLowerCase(),
          displayName: form.displayName.trim(),
        },
      });
      toast.success(`User ${form.username.trim().toLowerCase()} created`);
      setCreating(false);
      setForm({ username: '', displayName: '', role: 'operator', pin: '' });
      await users.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function patch(u: User, body: Record<string, unknown>, ok: string) {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body });
      toast.success(ok);
      await users.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <h1>Users</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCreating(true)}
          data-testid="new-user"
        >
          New user
        </button>
      </div>
      {users.error && <ErrorState message={users.error} onRetry={users.reload} />}
      {users.loading && !users.data && <Loading />}
      {users.data && (
        <section className="card">
          <div className="table-wrap" tabIndex={0}>
            <table className="table" data-testid="users-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.data.data.map((u) => (
                  <tr key={u.id} data-testid="user-row" data-username={u.username}>
                    <td className="mono">{u.username}</td>
                    <td>{u.displayName}</td>
                    <td>
                      <label className="sr-only" htmlFor={`role-${u.id}`}>
                        Role for {u.username}
                      </label>
                      <select
                        id={`role-${u.id}`}
                        className="input"
                        style={{ minHeight: 34, width: 'auto' }}
                        value={u.role}
                        disabled={u.id === me?.id}
                        onChange={(e) =>
                          patch(
                            u,
                            { role: e.target.value },
                            `${u.username} is now ${e.target.value}`,
                          )
                        }
                      >
                        {ROLES.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {u.active ? (
                        <StatusBadge status="OK" label="Active" />
                      ) : (
                        <StatusBadge status="FAILED" label="Inactive" />
                      )}
                    </td>
                    <td className="small muted nowrap">{formatDateTime(u.createdAt)}</td>
                    <td className="nowrap">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setPinFor(u);
                          setNewPin('');
                        }}
                      >
                        Reset PIN
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={u.id === me?.id}
                        onClick={() =>
                          patch(
                            u,
                            { active: !u.active },
                            `${u.username} ${u.active ? 'deactivated' : 'reactivated'}`,
                          )
                        }
                        data-testid="toggle-active"
                      >
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Modal
        open={creating}
        title="New user"
        onClose={() => setCreating(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="user-form"
              className="btn btn-primary"
              disabled={busy}
              data-testid="save-user"
            >
              Create user
            </button>
          </>
        }
      >
        <form id="user-form" className="stack" onSubmit={create} noValidate>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="user-username">Username</label>
              <input
                id="user-username"
                className="input"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoCapitalize="none"
              />
            </div>
            <div className="field">
              <label htmlFor="user-name">Display name</label>
              <input
                id="user-name"
                className="input"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="user-role">Role</label>
              <select
                id="user-role"
                className="input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="user-pin">PIN (4-6 digits)</label>
              <input
                id="user-pin"
                className="input"
                inputMode="numeric"
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value })}
              />
            </div>
          </div>
          {formError && (
            <div className="form-error" role="alert">
              {formError}
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={!!pinFor}
        title={`Reset PIN for ${pinFor?.username ?? ''}`}
        onClose={() => setPinFor(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setPinFor(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!/^\d{4,6}$/.test(newPin)}
              onClick={async () => {
                if (pinFor)
                  await patch(pinFor, { pin: newPin }, `PIN reset for ${pinFor.username}`);
                setPinFor(null);
              }}
            >
              Save PIN
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="new-pin">New PIN</label>
          <input
            id="new-pin"
            className="input"
            inputMode="numeric"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
