import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDateTime, formatPct, signed } from '../../lib/format';
import type { Dashboard, Item, Paged, Transaction } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { ErrorState, Loading } from '../../components/Loading';
import { StatusBadge } from '../../components/StatusBadge';

function Kpi({
  to,
  label,
  value,
  sub,
  testId,
}: {
  to: string;
  label: string;
  value: string | number;
  sub?: string;
  testId: string;
}) {
  return (
    <Link to={to} className="kpi" data-testid={testId}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </Link>
  );
}

export function DashboardPage() {
  const dash = useApi(() => api<Dashboard>('/reports/dashboard'), []);
  const recent = useApi(
    () => api<{ data: Transaction[] }>('/transactions', { query: { limit: 8 } }),
    [],
  );
  const low = useApi(
    () => api<Paged<Item>>('/items', { query: { lowStock: 'true', active: 'true', pageSize: 6 } }),
    [],
  );

  return (
    <>
      <div className="admin-topbar">
        <h1>Dashboard</h1>
        <span className="muted small">
          {dash.data ? `Updated ${formatDateTime(dash.data.generatedAt)}` : ''}
        </span>
      </div>
      {dash.error && <ErrorState message={dash.error} onRetry={dash.reload} />}
      {dash.loading && !dash.data && <Loading />}
      {dash.data && (
        <div className="kpi-grid">
          <Kpi
            to="/admin/orders?tab=po"
            label="Open POs"
            value={dash.data.openPurchaseOrders}
            sub="to receive"
            testId="kpi-open-pos"
          />
          <Kpi
            to="/admin/orders?tab=so"
            label="Orders to pick"
            value={dash.data.ordersToPick}
            sub={`${dash.data.ordersToShip} ready to ship`}
            testId="kpi-to-pick"
          />
          <Kpi
            to="/admin/orders?tab=so&status=SHIPPED"
            label="Shipped today"
            value={dash.data.shippedToday}
            testId="kpi-shipped"
          />
          <Kpi
            to="/admin/counts?status=SUBMITTED"
            label="Counts to approve"
            value={dash.data.countsPendingApproval}
            sub={`${dash.data.openCounts} open`}
            testId="kpi-counts"
          />
          <Kpi
            to="/admin/counts?status=APPROVED"
            label="Inventory accuracy"
            value={formatPct(dash.data.inventoryAccuracyPct)}
            sub={`${dash.data.countedLines30d} lines counted, 30 days`}
            testId="kpi-accuracy"
          />
          <Kpi
            to="/admin/inventory"
            label="Units on hand"
            value={dash.data.unitsOnHand.toLocaleString()}
            sub={`${dash.data.skusInStock} SKUs in stock`}
            testId="kpi-units"
          />
          <Kpi
            to="/admin/items?lowStock=true"
            label="Low stock items"
            value={dash.data.lowStockItems}
            sub="at or below reorder point"
            testId="kpi-low-stock"
          />
          <Kpi
            to="/admin/erp"
            label="ERP sync"
            value={dash.data.erpReachable ? 'Online' : 'Offline'}
            sub={
              dash.data.erpOutboxPending
                ? `${dash.data.erpOutboxPending} document(s) queued`
                : 'outbox empty'
            }
            testId="kpi-erp"
          />
        </div>
      )}

      <div className="two-col">
        <section className="card" aria-labelledby="recent-tx">
          <div className="card-title">
            <h2 id="recent-tx">Recent transactions</h2>
            <Link to="/admin/transactions" className="small">
              View all
            </Link>
          </div>
          {recent.loading && !recent.data && <Loading />}
          {recent.data && (
            <div className="table-wrap" tabIndex={0}>
              <table className="table" data-testid="recent-transactions">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>SKU</th>
                    <th>Bin</th>
                    <th className="num">Qty</th>
                    <th>Ref</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.data.data.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <StatusBadge status={t.type} />
                      </td>
                      <td>{t.sku}</td>
                      <td className="mono">{t.bin}</td>
                      <td className="num">{signed(t.qtyDelta)}</td>
                      <td className="mono small">{t.reference}</td>
                      <td className="small muted nowrap">{formatDateTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="low-stock">
          <div className="card-title">
            <h2 id="low-stock">Low stock</h2>
            <Link to="/admin/items?lowStock=true" className="small">
              View all
            </Link>
          </div>
          {low.loading && !low.data && <Loading />}
          {low.data && (
            <div className="table-wrap" tabIndex={0}>
              <table className="table" data-testid="low-stock-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th className="num">On hand</th>
                    <th className="num">Reorder</th>
                  </tr>
                </thead>
                <tbody>
                  {low.data.data.map((i) => (
                    <tr key={i.id}>
                      <td>{i.sku}</td>
                      <td>{i.name}</td>
                      <td className="num">{i.qtyOnHand}</td>
                      <td className="num">{i.reorderPoint}</td>
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
