import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import type { CarrierSuggestion, Paged, SalesOrder, SalesOrderDetail } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useToast } from '../../state/toast';
import { Empty, ErrorState, Loading } from '../../components/Loading';
import { StatusBadge } from '../../components/StatusBadge';

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL', 'Estes'];

export function ShipListPage() {
  const sos = useApi(
    () => api<Paged<SalesOrder>>('/sales-orders', { query: { shippable: true, pageSize: 50 } }),
    [],
  );
  return (
    <section className="card" aria-labelledby="ship-list">
      <div className="card-title">
        <h2 id="ship-list">Orders to ship</h2>
        {sos.data && <span className="muted small">{sos.data.total}</span>}
      </div>
      {sos.loading && <Loading />}
      {sos.error && <ErrorState message={sos.error} onRetry={sos.reload} />}
      {sos.data && sos.data.data.length === 0 && (
        <Empty>No picked orders are waiting to ship.</Empty>
      )}
      {sos.data && sos.data.data.length > 0 && (
        <ul className="list">
          {sos.data.data.map((so) => (
            <li key={so.id}>
              <Link className="list-item" to={`/scan/ship/${so.soNumber}`} data-testid="so-row">
                <span>
                  <span className="title">{so.soNumber}</span>
                  <div className="sub">
                    {so.customer} · {so.country} · {so.qtyPicked} units
                  </div>
                </span>
                <span className="row">
                  {so.priority === 'RUSH' && <StatusBadge status="RUSH" />}
                  <StatusBadge status={so.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ShipResult {
  soNumber: string;
  carrier: string;
  service: string;
  trackingNumber: string;
  weightLb: number;
}

export function ShipOrderPage() {
  const { soNumber = '' } = useParams();
  const toast = useToast();
  const so = useApi(
    () => api<SalesOrderDetail>(`/sales-orders/${encodeURIComponent(soNumber)}`),
    [soNumber],
  );
  const [weight, setWeight] = useState('');
  const [suggestion, setSuggestion] = useState<CarrierSuggestion | null>(null);
  const [carrier, setCarrier] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShipResult | null>(null);

  useEffect(() => {
    if (so.data) {
      setWeight(String(so.data.estimatedWeightLb));
      setSuggestion(so.data.shippingSuggestion);
      setCarrier(so.data.shippingSuggestion.carrier);
    }
  }, [so.data]);

  useEffect(() => {
    const w = Number(weight);
    if (!so.data || !(w > 0)) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      api<CarrierSuggestion>('/shipping/suggest', {
        query: { weightLb: w, country: so.data!.country, priority: so.data!.priority },
        signal: ctrl.signal,
      })
        .then((s) => {
          setSuggestion(s);
          setCarrier((c) =>
            CARRIERS.includes(c) && c !== s.carrier && suggestion && c !== suggestion.carrier
              ? c
              : s.carrier,
          );
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [weight, so.data]);

  async function ship() {
    if (!so.data) return;
    const w = Number(weight);
    if (!(w > 0)) {
      toast.error('Enter the package weight');
      return;
    }
    setBusy(true);
    try {
      const r = await api<ShipResult>(
        `/sales-orders/${encodeURIComponent(so.data.soNumber)}/ship`,
        {
          method: 'POST',
          body: {
            weightLb: w,
            carrier,
            service: suggestion && carrier === suggestion.carrier ? suggestion.service : undefined,
          },
        },
      );
      setResult(r);
      toast.success(`${r.soNumber} shipped via ${r.carrier}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (so.loading && !so.data) return <Loading />;
  if (so.error) return <ErrorState message={so.error} onRetry={so.reload} />;
  if (!so.data) return null;

  if (result) {
    return (
      <section className="card" data-testid="ship-result">
        <h2>Shipped</h2>
        <dl className="kv">
          <dt>Order</dt>
          <dd>{result.soNumber}</dd>
          <dt>Carrier</dt>
          <dd>
            {result.carrier} · {result.service}
          </dd>
          <dt>Tracking</dt>
          <dd className="mono" data-testid="tracking-number">
            {result.trackingNumber}
          </dd>
          <dt>Weight</dt>
          <dd>{result.weightLb} lb</dd>
        </dl>
        <Link to="/scan/ship" className="btn btn-primary btn-block" style={{ marginTop: '1rem' }}>
          Back to shipping
        </Link>
      </section>
    );
  }

  const picked = so.data.lines.filter((l) => l.qtyPicked > 0);

  return (
    <>
      <section className="card">
        <div className="card-title">
          <h2>{so.data.soNumber}</h2>
          <StatusBadge status={so.data.status} />
        </div>
        <div className="muted small">
          {so.data.customer} · ships to {so.data.country} · {so.data.priority.toLowerCase()}
          {so.data.shortReason ? ` · short: ${so.data.shortReason}` : ''}
        </div>
      </section>

      {so.data.status !== 'PICKED' ? (
        <div className="banner banner-info" role="status">
          <span>Only picked orders can ship. This order is {so.data.status.toLowerCase()}.</span>
          <Link to="/scan/ship" className="btn btn-sm">
            Back
          </Link>
        </div>
      ) : (
        <section className="card stack" data-testid="ship-form">
          <div className="field">
            <label htmlFor="weight">Package weight (lb)</label>
            <input
              id="weight"
              className="input"
              type="number"
              inputMode="decimal"
              min="0.1"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <div className="hint">
              Estimated from the picked items: {so.data.estimatedWeightLb} lb
            </div>
          </div>
          {suggestion && (
            <div className="banner banner-info" data-testid="carrier-suggestion">
              <span>
                Suggested: <strong>{suggestion.carrier}</strong> {suggestion.service}{' '}
                <span className="small">({suggestion.rule.replace(/_/g, ' ').toLowerCase()})</span>
              </span>
            </div>
          )}
          <div className="field">
            <label htmlFor="carrier">Carrier</label>
            <select
              id="carrier"
              className="input"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            >
              {CARRIERS.map((c) => (
                <option key={c} value={c}>
                  {c}
                  {suggestion?.carrier === c ? ' (suggested)' : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={ship}
            disabled={busy}
            data-testid="ship-button"
          >
            Ship order
          </button>
        </section>
      )}

      <section className="card" aria-labelledby="ship-lines">
        <h2 id="ship-lines">Contents</h2>
        <ul className="list">
          {picked.map((l) => (
            <li key={l.id} className="list-item" style={{ cursor: 'default' }}>
              <span>
                <span className="title">{l.sku}</span>
                <div className="sub">{l.name}</div>
              </span>
              <span className="nowrap">
                {l.qtyPicked} × {l.weightLb} lb
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
