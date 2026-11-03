import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import type {
  Paged,
  PurchaseOrder,
  PurchaseOrderDetail,
  SalesOrder,
  SalesOrderDetail,
} from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useToast } from '../../state/toast';
import { Empty, ErrorState, Loading } from '../../components/Loading';
import { Modal } from '../../components/Modal';
import { Pager } from '../../components/Pager';
import { StatusBadge } from '../../components/StatusBadge';

interface LineDraft {
  sku: string;
  qty: string;
}

function LinesEditor({
  lines,
  onChange,
}: {
  lines: LineDraft[];
  onChange: (l: LineDraft[]) => void;
}) {
  return (
    <div className="stack">
      {lines.map((l, i) => (
        <div className="row" key={i}>
          <input
            className="input grow"
            aria-label={`Line ${i + 1} SKU`}
            placeholder="SKU"
            value={l.sku}
            onChange={(e) =>
              onChange(lines.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))
            }
            autoCapitalize="characters"
          />
          <input
            className="input"
            style={{ width: 110 }}
            aria-label={`Line ${i + 1} quantity`}
            type="number"
            min={1}
            value={l.qty}
            onChange={(e) =>
              onChange(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))
            }
          />
          <button
            type="button"
            className="btn btn-sm"
            aria-label={`Remove line ${i + 1}`}
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            disabled={lines.length === 1}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => onChange([...lines, { sku: '', qty: '1' }])}
      >
        Add line
      </button>
    </div>
  );
}

export function OrdersPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'so' ? 'so' : 'po';
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);

  const pos = useApi(
    () =>
      tab === 'po'
        ? api<Paged<PurchaseOrder>>('/purchase-orders', {
            query: { status, q, page, pageSize: 25 },
          })
        : Promise.resolve(null),
    [tab, status, q, page],
  );
  const sos = useApi(
    () =>
      tab === 'so'
        ? api<Paged<SalesOrder>>('/sales-orders', { query: { status, q, page, pageSize: 25 } })
        : Promise.resolve(null),
    [tab, status, q, page],
  );

  const [creating, setCreating] = useState(false);
  const [partner, setPartner] = useState('');
  const [country, setCountry] = useState('US');
  const [priority, setPriority] = useState<'STANDARD' | 'RUSH'>('STANDARD');
  const [expected, setExpected] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ sku: '', qty: '1' }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(next: Record<string, string | undefined>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const body = {
      lines: lines.map((l) => ({ sku: l.sku.trim().toUpperCase(), qty: Number(l.qty) })),
    };
    if (!partner.trim())
      return setFormError(tab === 'po' ? 'Vendor is required' : 'Customer is required');
    if (body.lines.some((l) => !l.sku || !(l.qty > 0)))
      return setFormError('Every line needs a SKU and a quantity above zero');
    setBusy(true);
    try {
      if (tab === 'po') {
        const po = await api<PurchaseOrder>('/purchase-orders', {
          method: 'POST',
          body: { ...body, vendor: partner.trim(), expectedDate: expected || undefined },
        });
        toast.success(`${po.poNumber} created`);
      } else {
        const so = await api<SalesOrder>('/sales-orders', {
          method: 'POST',
          body: { ...body, customer: partner.trim(), country, priority },
        });
        toast.success(`${so.soNumber} created`);
      }
      setCreating(false);
      setPartner('');
      setLines([{ sku: '', qty: '1' }]);
      await (tab === 'po' ? pos.reload() : sos.reload());
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const statuses =
    tab === 'po'
      ? ['OPEN', 'PARTIAL', 'RECEIVED', 'CLOSED']
      : ['OPEN', 'PICKING', 'PICKED', 'SHIPPED', 'CANCELLED'];

  return (
    <>
      <div className="admin-topbar">
        <h1>Orders</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCreating(true)}
          data-testid="new-order"
        >
          {tab === 'po' ? 'New purchase order' : 'New sales order'}
        </button>
      </div>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'po'}
          onClick={() => set({ tab: 'po', status: undefined })}
        >
          Purchase orders
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'so'}
          onClick={() => set({ tab: 'so', status: undefined })}
        >
          Sales orders
        </button>
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: search });
        }}
      >
        <div className="field">
          <label htmlFor="orders-q">Search</label>
          <input
            id="orders-q"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'po' ? 'PO number or vendor' : 'SO number or customer'}
          />
        </div>
        <div className="field">
          <label htmlFor="orders-status">Status</label>
          <select
            id="orders-status"
            className="input"
            value={status}
            onChange={(e) => set({ status: e.target.value })}
          >
            <option value="">All</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn">
          Search
        </button>
      </form>

      {tab === 'po' && (
        <>
          {pos.error && <ErrorState message={pos.error} onRetry={pos.reload} />}
          {pos.loading && !pos.data && <Loading />}
          {pos.data && pos.data.data.length === 0 && <Empty>No purchase orders match.</Empty>}
          {pos.data && pos.data.data.length > 0 && (
            <section className="card">
              <div className="table-wrap" tabIndex={0}>
                <table className="table" data-testid="po-table">
                  <thead>
                    <tr>
                      <th>PO</th>
                      <th>Vendor</th>
                      <th>Status</th>
                      <th>Expected</th>
                      <th className="num">Lines</th>
                      <th className="num">Received</th>
                      <th>ERP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pos.data.data.map((po) => (
                      <tr key={po.id} data-testid="po-row">
                        <td>
                          <Link to={`/admin/orders/po/${po.poNumber}`} className="row-link">
                            {po.poNumber}
                          </Link>
                        </td>
                        <td>{po.vendor}</td>
                        <td>
                          <StatusBadge status={po.status} />
                        </td>
                        <td>{formatDate(po.expectedDate)}</td>
                        <td className="num">{po.lineCount}</td>
                        <td className="num">
                          {po.qtyReceived}/{po.qtyOrdered}
                        </td>
                        <td className="mono small muted">{po.erpId ?? 'manual'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={pos.data.page}
                pageSize={pos.data.pageSize}
                total={pos.data.total}
                onPage={(p) => set({ page: String(p) })}
              />
            </section>
          )}
        </>
      )}

      {tab === 'so' && (
        <>
          {sos.error && <ErrorState message={sos.error} onRetry={sos.reload} />}
          {sos.loading && !sos.data && <Loading />}
          {sos.data && sos.data.data.length === 0 && <Empty>No sales orders match.</Empty>}
          {sos.data && sos.data.data.length > 0 && (
            <section className="card">
              <div className="table-wrap" tabIndex={0}>
                <table className="table" data-testid="so-table">
                  <thead>
                    <tr>
                      <th>SO</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Ship to</th>
                      <th className="num">Picked</th>
                      <th>Carrier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sos.data.data.map((so) => (
                      <tr key={so.id} data-testid="so-row">
                        <td>
                          <Link to={`/admin/orders/so/${so.soNumber}`} className="row-link">
                            {so.soNumber}
                          </Link>
                        </td>
                        <td>{so.customer}</td>
                        <td>
                          <StatusBadge status={so.status} />
                        </td>
                        <td>
                          {so.priority === 'RUSH' ? (
                            <StatusBadge status="RUSH" />
                          ) : (
                            <span className="muted">Standard</span>
                          )}
                        </td>
                        <td>{so.country}</td>
                        <td className="num">
                          {so.qtyPicked}/{so.qtyOrdered}
                        </td>
                        <td className="small">
                          {so.carrier ? `${so.carrier} ${so.service ?? ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={sos.data.page}
                pageSize={sos.data.pageSize}
                total={sos.data.total}
                onPage={(p) => set({ page: String(p) })}
              />
            </section>
          )}
        </>
      )}

      <Modal
        open={creating}
        title={tab === 'po' ? 'New purchase order' : 'New sales order'}
        onClose={() => setCreating(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="order-form"
              className="btn btn-primary"
              disabled={busy}
              data-testid="save-order"
            >
              Create
            </button>
          </>
        }
      >
        <form id="order-form" className="stack" onSubmit={create} noValidate>
          <div className="field">
            <label htmlFor="order-partner">{tab === 'po' ? 'Vendor' : 'Customer'}</label>
            <input
              id="order-partner"
              className="input"
              value={partner}
              onChange={(e) => setPartner(e.target.value)}
            />
          </div>
          {tab === 'po' ? (
            <div className="field">
              <label htmlFor="order-expected">Expected date</label>
              <input
                id="order-expected"
                className="input"
                type="date"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
            </div>
          ) : (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="order-country">Ship-to country</label>
                <input
                  id="order-country"
                  className="input"
                  value={country}
                  maxLength={2}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                />
              </div>
              <div className="field">
                <label htmlFor="order-priority">Priority</label>
                <select
                  id="order-priority"
                  className="input"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'STANDARD' | 'RUSH')}
                >
                  <option>STANDARD</option>
                  <option>RUSH</option>
                </select>
              </div>
            </div>
          )}
          <div className="field">
            <span className="label">Lines</span>
            <LinesEditor lines={lines} onChange={setLines} />
          </div>
          {formError && (
            <div className="form-error" role="alert">
              {formError}
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}

export function PoDetailPage() {
  const { poNumber = '' } = useParams();
  const toast = useToast();
  const po = useApi(
    () => api<PurchaseOrderDetail>(`/purchase-orders/${encodeURIComponent(poNumber)}`),
    [poNumber],
  );
  const [confirm, setConfirm] = useState(false);

  async function close() {
    try {
      await api(`/purchase-orders/${encodeURIComponent(poNumber)}/close`, {
        method: 'POST',
        body: {},
      });
      toast.success(`${poNumber} closed`);
      setConfirm(false);
      await po.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (po.error) return <ErrorState message={po.error} onRetry={po.reload} />;
  if (!po.data) return <Loading />;
  const d = po.data;
  return (
    <>
      <div className="admin-topbar">
        <div>
          <Link to="/admin/orders?tab=po" className="small">
            ‹ Purchase orders
          </Link>
          <h1>
            {d.poNumber} <StatusBadge status={d.status} />
          </h1>
        </div>
        <div className="row">
          <Link to={`/scan/receive/${d.poNumber}`} className="btn">
            Receive on scanner
          </Link>
          {d.status !== 'CLOSED' && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirm(true)}
              data-testid="close-po"
            >
              Close PO
            </button>
          )}
        </div>
      </div>
      <div className="two-col">
        <section className="card">
          <h2>Details</h2>
          <dl className="kv">
            <dt>Vendor</dt>
            <dd>{d.vendor}</dd>
            <dt>Expected</dt>
            <dd>{formatDate(d.expectedDate)}</dd>
            <dt>ERP id</dt>
            <dd className="mono">{d.erpId ?? 'manual entry'}</dd>
            <dt>Created</dt>
            <dd>{formatDateTime(d.createdAt)}</dd>
          </dl>
        </section>
        <section className="card">
          <h2>Receipts</h2>
          {d.receipts.length === 0 && <div className="muted">Nothing received yet.</div>}
          {d.receipts.map((r) => (
            <div key={r.id} style={{ marginBottom: '0.6rem' }} data-testid="receipt">
              <div className="small">
                <strong>RCPT-{r.id}</strong> · {formatDateTime(r.receivedAt)} ·{' '}
                {r.receivedBy ?? '—'}
              </div>
              <ul className="small muted" style={{ margin: '0.2rem 0 0 1rem' }}>
                {r.lines.map((l, i) => (
                  <li key={i}>
                    {l.qty} × {l.sku} → {l.bin}
                    {l.lot ? ` (lot ${l.lot})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
      <section className="card" style={{ marginTop: '0.75rem' }}>
        <h2>Lines</h2>
        <div className="table-wrap" tabIndex={0}>
          <table className="table" data-testid="po-lines">
            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>Name</th>
                <th className="num">Ordered</th>
                <th className="num">Received</th>
                <th className="num">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.lineNo}</td>
                  <td>
                    {l.sku} {l.lotTracked && <span className="badge badge-info">Lot</span>}
                  </td>
                  <td>{l.name}</td>
                  <td className="num">{l.qtyOrdered}</td>
                  <td className="num">{l.qtyReceived}</td>
                  <td className="num">{l.qtyRemaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Modal
        open={confirm}
        title={`Close ${d.poNumber}?`}
        onClose={() => setConfirm(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={close}
              data-testid="confirm-close-po"
            >
              Close purchase order
            </button>
          </>
        }
      >
        <p>
          Closed purchase orders can no longer receive stock. Lines with remaining quantity stay
          unfulfilled.
        </p>
      </Modal>
    </>
  );
}

export function SoDetailPage() {
  const { soNumber = '' } = useParams();
  const toast = useToast();
  const so = useApi(
    () => api<SalesOrderDetail>(`/sales-orders/${encodeURIComponent(soNumber)}`),
    [soNumber],
  );
  const [confirm, setConfirm] = useState(false);

  async function cancel() {
    try {
      await api(`/sales-orders/${encodeURIComponent(soNumber)}/cancel`, {
        method: 'POST',
        body: {},
      });
      toast.success(`${soNumber} cancelled`);
      setConfirm(false);
      await so.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (so.error) return <ErrorState message={so.error} onRetry={so.reload} />;
  if (!so.data) return <Loading />;
  const d = so.data;
  return (
    <>
      <div className="admin-topbar">
        <div>
          <Link to="/admin/orders?tab=so" className="small">
            ‹ Sales orders
          </Link>
          <h1>
            {d.soNumber} <StatusBadge status={d.status} />{' '}
            {d.priority === 'RUSH' && <StatusBadge status="RUSH" />}
          </h1>
        </div>
        <div className="row">
          {(d.status === 'OPEN' || d.status === 'PICKING') && (
            <Link to={`/scan/pick/${d.soNumber}`} className="btn">
              Pick on scanner
            </Link>
          )}
          {d.status === 'PICKED' && (
            <Link to={`/scan/ship/${d.soNumber}`} className="btn">
              Ship on scanner
            </Link>
          )}
          {d.status === 'OPEN' && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirm(true)}
              data-testid="cancel-so"
            >
              Cancel order
            </button>
          )}
        </div>
      </div>
      <div className="two-col">
        <section className="card">
          <h2>Details</h2>
          <dl className="kv">
            <dt>Customer</dt>
            <dd>{d.customer}</dd>
            <dt>Ship to</dt>
            <dd>{d.country}</dd>
            <dt>ERP id</dt>
            <dd className="mono">{d.erpId ?? 'manual entry'}</dd>
            <dt>Est. weight</dt>
            <dd>{d.estimatedWeightLb} lb</dd>
            <dt>Suggested</dt>
            <dd>
              {d.shippingSuggestion.carrier} {d.shippingSuggestion.service}
            </dd>
            {d.shortReason && (
              <>
                <dt>Short reason</dt>
                <dd>{d.shortReason}</dd>
              </>
            )}
          </dl>
        </section>
        <section className="card">
          <h2>Fulfilment</h2>
          <dl className="kv">
            <dt>Picked</dt>
            <dd>{d.pickedAt ? `${formatDateTime(d.pickedAt)} by ${d.pickedBy ?? '—'}` : '—'}</dd>
            <dt>Shipped</dt>
            <dd>{d.shippedAt ? `${formatDateTime(d.shippedAt)} by ${d.shippedBy ?? '—'}` : '—'}</dd>
            <dt>Carrier</dt>
            <dd>{d.carrier ? `${d.carrier} ${d.service ?? ''}` : '—'}</dd>
            <dt>Tracking</dt>
            <dd className="mono" data-testid="so-tracking">
              {d.trackingNumber ?? '—'}
            </dd>
            <dt>Weight</dt>
            <dd>{d.weightLb ? `${d.weightLb} lb` : '—'}</dd>
          </dl>
        </section>
      </div>
      <section className="card" style={{ marginTop: '0.75rem' }}>
        <h2>Lines</h2>
        <div className="table-wrap" tabIndex={0}>
          <table className="table" data-testid="so-lines">
            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>Name</th>
                <th className="num">Ordered</th>
                <th className="num">Picked</th>
                <th className="num">Available</th>
                <th>Suggested bin</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.lineNo}</td>
                  <td>{l.sku}</td>
                  <td>{l.name}</td>
                  <td className="num">{l.qtyOrdered}</td>
                  <td className="num">{l.qtyPicked}</td>
                  <td className="num">{l.available}</td>
                  <td className="mono">{l.suggestions[0]?.bin ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {d.picks.length > 0 && (
        <section className="card" style={{ marginTop: '0.75rem' }}>
          <h2>Picks</h2>
          <div className="table-wrap" tabIndex={0}>
            <table className="table" data-testid="so-picks">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>SKU</th>
                  <th>Bin</th>
                  <th>Lot</th>
                  <th className="num">Qty</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {d.picks.map((p) => (
                  <tr key={p.id}>
                    <td>{p.lineNo}</td>
                    <td>{p.sku}</td>
                    <td className="mono">{p.bin}</td>
                    <td className="mono">{p.lot || '—'}</td>
                    <td className="num">{p.qty}</td>
                    <td>{p.pickedBy ?? '—'}</td>
                    <td className="small muted">{formatDateTime(p.pickedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Modal
        open={confirm}
        title={`Cancel ${d.soNumber}?`}
        onClose={() => setConfirm(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setConfirm(false)}>
              Keep order
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={cancel}
              data-testid="confirm-cancel-so"
            >
              Cancel order
            </button>
          </>
        }
      >
        <p>The order will be marked cancelled and disappear from the pick list.</p>
      </Modal>
    </>
  );
}
