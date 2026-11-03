import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api';
import type { Bin, Label } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useToast } from '../../state/toast';
import { Empty, ErrorState, Loading } from '../../components/Loading';
import { Modal } from '../../components/Modal';

const ZONES = ['RECEIVING', 'STORAGE', 'PICKING', 'SHIPPING', 'QUARANTINE'];

export function BinsPage() {
  const toast = useToast();
  const [zone, setZone] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const bins = useApi(
    () =>
      api<{ data: Bin[] }>('/bins', { query: { zone, active: showInactive ? undefined : 'true' } }),
    [zone, showInactive],
  );
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [newZone, setNewZone] = useState('STORAGE');
  const [formError, setFormError] = useState<string | null>(null);
  const [label, setLabel] = useState<Label | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await api('/bins', {
        method: 'POST',
        body: { code: code.trim().toUpperCase(), zone: newZone },
      });
      toast.success(`Bin ${code.trim().toUpperCase()} created`);
      setCreating(false);
      setCode('');
      await bins.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(bin: Bin) {
    try {
      await api(`/bins/${encodeURIComponent(bin.code)}`, {
        method: 'PATCH',
        body: { active: !bin.active },
      });
      toast.success(`${bin.code} ${bin.active ? 'deactivated' : 'reactivated'}`);
      await bins.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function showLabel(bin: Bin) {
    try {
      setLabel(await api<Label>(`/labels/bin/${encodeURIComponent(bin.code)}`));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <h1>Bins</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCreating(true)}
          data-testid="new-bin"
        >
          New bin
        </button>
      </div>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="bins-zone">Zone</label>
          <select
            id="bins-zone"
            className="input"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          >
            <option value="">All zones</option>
            {ZONES.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />{' '}
          Include inactive
        </label>
      </div>
      {bins.error && <ErrorState message={bins.error} onRetry={bins.reload} />}
      {bins.loading && !bins.data && <Loading />}
      {bins.data && bins.data.data.length === 0 && <Empty>No bins.</Empty>}
      {bins.data && bins.data.data.length > 0 && (
        <section className="card">
          <div className="table-wrap" tabIndex={0}>
            <table className="table" data-testid="bins-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Zone</th>
                  <th className="num">Items</th>
                  <th className="num">Units</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bins.data.data.map((b) => (
                  <tr key={b.id} data-testid="bin-row" data-code={b.code}>
                    <td className="mono">
                      <strong>{b.code}</strong>
                    </td>
                    <td>{b.zone}</td>
                    <td className="num">{b.itemCount}</td>
                    <td className="num">{b.unitsOnHand}</td>
                    <td>
                      {b.active ? (
                        <span className="badge badge-ok">Active</span>
                      ) : (
                        <span className="badge badge-danger">Inactive</span>
                      )}
                    </td>
                    <td className="nowrap">
                      <button type="button" className="btn btn-sm" onClick={() => showLabel(b)}>
                        Label
                      </button>{' '}
                      <button type="button" className="btn btn-sm" onClick={() => toggleActive(b)}>
                        {b.active ? 'Deactivate' : 'Activate'}
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
        title="New bin"
        onClose={() => setCreating(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="bin-form"
              className="btn btn-primary"
              disabled={busy}
              data-testid="save-bin"
            >
              Create bin
            </button>
          </>
        }
      >
        <form id="bin-form" className="stack" onSubmit={create} noValidate>
          <div className="field">
            <label htmlFor="bin-code">Bin code</label>
            <input
              id="bin-code"
              className="input mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="C-01-01"
              autoCapitalize="characters"
            />
          </div>
          <div className="field">
            <label htmlFor="bin-zone">Zone</label>
            <select
              id="bin-zone"
              className="input"
              value={newZone}
              onChange={(e) => setNewZone(e.target.value)}
            >
              {ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </div>
          {formError && (
            <div className="form-error" role="alert">
              {formError}
            </div>
          )}
        </form>
      </Modal>

      <Modal open={!!label} title={`Label for ${label?.code ?? ''}`} onClose={() => setLabel(null)}>
        <pre className="zpl" data-testid="zpl" tabIndex={0}>
          {label?.zpl}
        </pre>
      </Modal>
    </>
  );
}
