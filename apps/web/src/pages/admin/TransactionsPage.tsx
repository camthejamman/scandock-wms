import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDateTime, signed } from '../../lib/format';
import type { Transaction } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { Empty, ErrorState, Loading } from '../../components/Loading';
import { StatusBadge } from '../../components/StatusBadge';

const TYPES = ['', 'RECEIPT', 'PICK', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'SHIP'];

export function TransactionsPage() {
  const [type, setType] = useState('');
  const [sku, setSku] = useState('');
  const [applied, setApplied] = useState({ type: '', sku: '' });
  const tx = useApi(
    () =>
      api<{ data: Transaction[] }>('/transactions', {
        query: { type: applied.type, sku: applied.sku, limit: 200 },
      }),
    [applied],
  );

  return (
    <>
      <div className="admin-topbar">
        <h1>Transactions</h1>
        {tx.data && <span className="muted small">latest {tx.data.data.length}</span>}
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ type, sku });
        }}
      >
        <div className="field">
          <label htmlFor="tx-type">Type</label>
          <select
            id="tx-type"
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t || 'All types'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-sku">SKU</label>
          <input
            id="tx-sku"
            className="input"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="TOY-ROBOT-RED"
          />
        </div>
        <button type="submit" className="btn">
          Filter
        </button>
      </form>
      {tx.error && <ErrorState message={tx.error} onRetry={tx.reload} />}
      {tx.loading && !tx.data && <Loading />}
      {tx.data && tx.data.data.length === 0 && <Empty>No transactions match.</Empty>}
      {tx.data && tx.data.data.length > 0 && (
        <section className="card">
          <div className="table-wrap" tabIndex={0}>
            <table className="table" data-testid="transactions-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>SKU</th>
                  <th>Bin</th>
                  <th>Lot</th>
                  <th className="num">Delta</th>
                  <th className="num">After</th>
                  <th>Reference</th>
                  <th>User</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {tx.data.data.map((t) => (
                  <tr key={t.id} data-testid="transaction-row">
                    <td className="muted">{t.id}</td>
                    <td>
                      <StatusBadge status={t.type} />
                    </td>
                    <td>{t.sku}</td>
                    <td className="mono">{t.bin}</td>
                    <td className="mono">{t.lot || '—'}</td>
                    <td className="num">{signed(t.qtyDelta)}</td>
                    <td className="num">{t.qtyAfter}</td>
                    <td className="mono small">{t.reference}</td>
                    <td>{t.user ?? '—'}</td>
                    <td className="small muted nowrap">{formatDateTime(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
