import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { ErpLogRow, ErpStatus, OutboxRow } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useToast } from '../../state/toast';
import { Empty, ErrorState, Loading } from '../../components/Loading';
import { StatusBadge } from '../../components/StatusBadge';

interface SyncResult {
  pulled: {
    purchaseOrders: number;
    salesOrders: number;
    skipped: Array<{ number: string; reason: string }>;
  };
  pushed: { sent: number; failed: number };
}

export function ErpPage() {
  const toast = useToast();
  const status = useApi(() => api<ErpStatus>('/erp/status'), []);
  const outbox = useApi(() => api<{ data: OutboxRow[] }>('/erp/outbox'), []);
  const log = useApi(() => api<{ data: ErpLogRow[] }>('/erp/log', { query: { limit: 100 } }), []);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<SyncResult | null>(null);

  async function sync() {
    setBusy(true);
    try {
      const r = await api<SyncResult>('/erp/sync', { method: 'POST', body: {} });
      setLast(r);
      toast.success(
        `Synced: ${r.pulled.purchaseOrders} PO(s), ${r.pulled.salesOrders} SO(s) pulled; ${r.pushed.sent} document(s) pushed`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      await Promise.all([status.reload(), outbox.reload(), log.reload()]);
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <h1>ERP sync</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={sync}
          disabled={busy}
          data-testid="sync-now"
        >
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      {status.error && <ErrorState message={status.error} onRetry={status.reload} />}
      {status.loading && !status.data && <Loading />}
      {status.data && (
        <div className="kpi-grid" data-testid="erp-status">
          <div className="kpi">
            <div className="kpi-label">{status.data.erpName}</div>
            <div className="kpi-value">
              {status.data.reachable ? (
                <span style={{ color: 'var(--ok)' }}>Online</span>
              ) : (
                <span style={{ color: 'var(--danger)' }}>Offline</span>
              )}
            </div>
            <div className="kpi-sub mono">{status.data.error ?? status.data.erpUrl}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Last pull</div>
            <div className="kpi-value" style={{ fontSize: '1.1rem' }}>
              {formatDateTime(status.data.lastSyncAt)}
            </div>
            <div className="kpi-sub">
              {status.data.lastFailure
                ? `Last failure: ${status.data.lastFailure.message}`
                : 'no recent failures'}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Outbox</div>
            <div className="kpi-value" data-testid="outbox-pending">
              {status.data.outbox.pending + status.data.outbox.failed}
            </div>
            <div className="kpi-sub">
              {status.data.outbox.pending} pending · {status.data.outbox.failed} failed ·{' '}
              {status.data.outbox.sent} sent
            </div>
          </div>
        </div>
      )}
      {last && (
        <div
          className="banner banner-info"
          data-testid="sync-result"
          style={{ marginBottom: '0.75rem' }}
        >
          <span>
            Pulled {last.pulled.purchaseOrders} purchase order(s) and {last.pulled.salesOrders}{' '}
            sales order(s); pushed {last.pushed.sent}, failed {last.pushed.failed}.
            {last.pulled.skipped.length > 0 &&
              ` Skipped: ${last.pulled.skipped.map((s) => `${s.number} (${s.reason})`).join(', ')}.`}
          </span>
        </div>
      )}
      <div className="two-col">
        <section className="card">
          <h2>Outbox (documents to the ERP)</h2>
          {outbox.data && outbox.data.data.length === 0 && <Empty>Nothing queued.</Empty>}
          {outbox.data && outbox.data.data.length > 0 && (
            <div className="table-wrap" tabIndex={0}>
              <table className="table" data-testid="outbox-table">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Reference</th>
                    <th>Status</th>
                    <th className="num">Tries</th>
                    <th>ERP ref / error</th>
                  </tr>
                </thead>
                <tbody>
                  {outbox.data.data.map((o) => (
                    <tr key={o.id} data-testid="outbox-row" data-status={o.status}>
                      <td>{o.kind}</td>
                      <td className="mono">{o.reference}</td>
                      <td>
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="num">{o.attempts}</td>
                      <td className="small">
                        {o.status === 'SENT' ? (
                          <span className="mono">{o.erpRef}</span>
                        ) : (
                          <span className="muted">{o.lastError ?? '—'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card">
          <h2>Sync log</h2>
          {log.data && log.data.data.length === 0 && <Empty>No sync activity yet.</Empty>}
          {log.data && log.data.data.length > 0 && (
            <div className="table-wrap" tabIndex={0}>
              <table className="table" data-testid="sync-log">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Dir</th>
                    <th>Entity</th>
                    <th>Status</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {log.data.data.map((l) => (
                    <tr key={l.id} data-testid="sync-log-row" data-status={l.status}>
                      <td className="small muted nowrap">{formatDateTime(l.createdAt)}</td>
                      <td>{l.direction}</td>
                      <td>{l.entity}</td>
                      <td>
                        <StatusBadge status={l.status} />
                      </td>
                      <td className="small">{l.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
