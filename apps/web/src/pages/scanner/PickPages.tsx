import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import type { Paged, SalesOrder, SalesOrderDetail, SoLine } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useToast } from '../../state/toast';
import { Empty, ErrorState, Loading } from '../../components/Loading';
import { QtyInput } from '../../components/QtyInput';
import { ScanInput } from '../../components/ScanInput';
import { StatusBadge } from '../../components/StatusBadge';

export function PickListPage() {
  const sos = useApi(
    () => api<Paged<SalesOrder>>('/sales-orders', { query: { pickable: true, pageSize: 50 } }),
    [],
  );
  return (
    <section className="card" aria-labelledby="pick-list">
      <div className="card-title">
        <h2 id="pick-list">Orders to pick</h2>
        {sos.data && <span className="muted small">{sos.data.total}</span>}
      </div>
      {sos.loading && <Loading />}
      {sos.error && <ErrorState message={sos.error} onRetry={sos.reload} />}
      {sos.data && sos.data.data.length === 0 && <Empty>No orders waiting to be picked.</Empty>}
      {sos.data && sos.data.data.length > 0 && (
        <ul className="list">
          {sos.data.data.map((so) => (
            <li key={so.id}>
              <Link
                className="list-item"
                to={`/scan/pick/${so.soNumber}`}
                data-testid="so-row"
                data-priority={so.priority}
              >
                <span>
                  <span className="title">{so.soNumber}</span>
                  <div className="sub">
                    {so.customer} · {so.lineCount} lines · {so.qtyPicked}/{so.qtyOrdered} picked
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

const SHORT_REASONS = [
  'Stock not found in bin',
  'Damaged stock',
  'Short shipped by vendor',
  'Other',
];

type Step = 'bin' | 'item' | 'qty';

export function PickOrderPage() {
  const { soNumber = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const so = useApi(
    () => api<SalesOrderDetail>(`/sales-orders/${encodeURIComponent(soNumber)}`),
    [soNumber],
  );
  const [skipped, setSkipped] = useState<number[]>([]);
  const [step, setStep] = useState<Step>('bin');
  const [bin, setBin] = useState('');
  const [lot, setLot] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [shortReason, setShortReason] = useState(SHORT_REASONS[0]!);

  const lines = so.data?.lines ?? [];
  const current: SoLine | undefined = useMemo(
    () => lines.find((l) => l.qtyRemaining > 0 && !skipped.includes(l.lineNo)),
    [lines, skipped],
  );
  const remainingLines = lines.filter((l) => l.qtyRemaining > 0);
  const suggestion = current?.suggestions[0];
  const lotsInBin = useMemo(
    () =>
      current
        ? current.suggestions
            .filter((s) => s.bin === bin)
            .map((s) => s.lot)
            .filter(Boolean)
        : [],
    [current, bin],
  );

  useEffect(() => {
    // New line: start again at the bin step.
    setStep('bin');
    setBin('');
    setLot('');
    setQty(current ? current.qtyRemaining : 1);
  }, [current?.lineNo]);

  function onScanBin(code: string) {
    if (!current) return;
    const known = current.suggestions.find((s) => s.bin === code);
    if (!known)
      toast.info(
        `${code} is not a suggested bin for ${current.sku}; the pick will be checked against stock`,
      );
    setBin(code);
    const lots = current.suggestions
      .filter((s) => s.bin === code)
      .map((s) => s.lot)
      .filter(Boolean);
    setLot(lots.length === 1 ? lots[0]! : '');
    setQty(Math.min(current.qtyRemaining, known?.qtyOnHand ?? current.qtyRemaining) || 1);
    setStep('item');
  }

  function onScanItem(code: string) {
    if (!current) return;
    if (code !== current.barcode && code !== current.sku.toUpperCase()) {
      toast.error(`Wrong item: expected ${current.sku}`);
      return;
    }
    setStep('qty');
  }

  async function confirmPick() {
    if (!current || !so.data) return;
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error('Enter a quantity greater than zero');
      return;
    }
    if (current.lotTracked && !lot.trim()) {
      toast.error(`${current.sku} is lot tracked: choose a lot`);
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ allLinesPicked: boolean }>(
        `/sales-orders/${encodeURIComponent(so.data.soNumber)}/picks`,
        {
          method: 'POST',
          body: {
            lineNo: current.lineNo,
            bin,
            qty,
            lot: lot.trim() || undefined,
            sku: current.sku,
          },
        },
      );
      toast.success(`Picked ${qty} × ${current.sku} from ${bin}`);
      await so.reload();
      if (r.allLinesPicked) toast.info('All lines picked. Complete the pick to finish.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function completePick() {
    if (!so.data) return;
    setBusy(true);
    try {
      const short = remainingLines.length > 0;
      await api(`/sales-orders/${encodeURIComponent(so.data.soNumber)}/complete-pick`, {
        method: 'POST',
        body: short ? { shortReason } : {},
      });
      toast.success(`${so.data.soNumber} picked${short ? ' (short)' : ''}. Ready to ship.`);
      navigate('/scan/pick');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (so.loading && !so.data) return <Loading />;
  if (so.error) return <ErrorState message={so.error} onRetry={so.reload} />;
  if (!so.data) return null;

  const notPickable = so.data.status !== 'OPEN' && so.data.status !== 'PICKING';

  return (
    <>
      <section className="card">
        <div className="card-title">
          <h2>{so.data.soNumber}</h2>
          <span className="row">
            {so.data.priority === 'RUSH' && <StatusBadge status="RUSH" />}
            <StatusBadge status={so.data.status} />
          </span>
        </div>
        <div className="muted small">
          {so.data.customer} · ships to {so.data.country}
        </div>
      </section>

      {notPickable ? (
        <div className="banner banner-info" role="status">
          <span>This order is {so.data.status.toLowerCase()}; nothing to pick.</span>
          <Link to="/scan/pick" className="btn btn-sm">
            Back
          </Link>
        </div>
      ) : current ? (
        <section className="card" data-testid="pick-step" data-line={current.lineNo}>
          <div className="target">
            <div className="card">
              <div className="label">Go to bin</div>
              <div className="value" data-testid="target-bin">
                {suggestion?.bin ?? '—'}
              </div>
              {suggestion && (
                <div className="hint">
                  {suggestion.qtyOnHand} on hand{suggestion.lot ? ` · lot ${suggestion.lot}` : ''}
                </div>
              )}
            </div>
            <div className="card">
              <div className="label">Pick qty</div>
              <div className="value" data-testid="target-qty">
                {current.qtyRemaining}
              </div>
              <div className="hint">
                line {current.lineNo} of {lines.length}
              </div>
            </div>
          </div>
          <div style={{ margin: '0.75rem 0' }}>
            <div className="title" style={{ fontWeight: 700 }} data-testid="target-sku">
              {current.sku}
            </div>
            <div className="muted small">
              {current.name} · {current.available} available in the warehouse
              {current.lotTracked ? ' · lot tracked' : ''}
            </div>
          </div>

          <div className={`step ${step === 'bin' ? 'active' : 'done'}`}>
            <span className="step-no">1</span>
            <div className="grow">
              {step === 'bin' ? (
                <ScanInput
                  label="Scan bin"
                  placeholder={suggestion?.bin ?? 'A-01-01'}
                  onScan={onScanBin}
                  testId="scan-bin"
                />
              ) : (
                <div className="row between">
                  <span>
                    Bin <strong className="mono">{bin}</strong>
                  </span>
                  <button type="button" className="btn-link" onClick={() => setStep('bin')}>
                    change
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className={`step ${step === 'item' ? 'active' : step === 'qty' ? 'done' : ''}`}>
            <span className="step-no">2</span>
            <div className="grow">
              {step === 'item' ? (
                <ScanInput
                  label="Scan item"
                  placeholder={current.barcode}
                  onScan={onScanItem}
                  testId="scan-item"
                />
              ) : (
                <span className={step === 'bin' ? 'muted' : ''}>
                  Scan item{step === 'qty' ? ` · ${current.sku} ✓` : ''}
                </span>
              )}
            </div>
          </div>
          <div className={`step ${step === 'qty' ? 'active' : ''}`}>
            <span className="step-no">3</span>
            <div className="grow">
              {step === 'qty' ? (
                <div className="stack">
                  <QtyInput
                    label="Quantity picked"
                    value={qty}
                    onChange={setQty}
                    min={1}
                    max={current.qtyRemaining}
                    testId="pick-qty"
                  />
                  {current.lotTracked && (
                    <div className="field">
                      <label htmlFor="pick-lot">Lot</label>
                      {lotsInBin.length > 1 ? (
                        <select
                          id="pick-lot"
                          className="input"
                          value={lot}
                          onChange={(e) => setLot(e.target.value)}
                        >
                          <option value="">Choose a lot…</option>
                          {lotsInBin.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id="pick-lot"
                          className="input mono"
                          value={lot}
                          onChange={(e) => setLot(e.target.value)}
                          placeholder="LOT-…"
                        />
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={confirmPick}
                    disabled={busy}
                    data-testid="confirm-pick"
                  >
                    Confirm pick
                  </button>
                </div>
              ) : (
                <span className="muted">Confirm quantity</span>
              )}
            </div>
          </div>
          <div className="row" style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSkipped((s) => [...s, current.lineNo])}
              data-testid="skip-line"
            >
              Skip line (short)
            </button>
          </div>
        </section>
      ) : (
        <section className="card" data-testid="pick-complete">
          {remainingLines.length === 0 ? (
            <>
              <h2>All lines picked</h2>
              <p className="muted">Complete the pick to stage the order for shipping.</p>
            </>
          ) : (
            <>
              <h2>Short pick</h2>
              <p className="muted">
                {remainingLines.length} line(s) could not be picked in full:{' '}
                {remainingLines.map((l) => `${l.sku} (${l.qtyRemaining} short)`).join(', ')}.
              </p>
              <div className="field" style={{ marginBottom: '0.75rem' }}>
                <label htmlFor="short-reason">Reason</label>
                <select
                  id="short-reason"
                  className="input"
                  value={shortReason}
                  onChange={(e) => setShortReason(e.target.value)}
                >
                  {SHORT_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginBottom: '0.75rem' }}
                onClick={() => setSkipped([])}
              >
                Go back to skipped lines
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={completePick}
            disabled={busy || so.data.status !== 'PICKING'}
            data-testid="complete-pick"
          >
            {remainingLines.length === 0 ? 'Complete pick' : 'Complete short pick'}
          </button>
          {so.data.status !== 'PICKING' && (
            <div className="hint" style={{ marginTop: '0.5rem' }}>
              Pick at least one line before completing.
            </div>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="so-lines">
        <div className="card-title">
          <h2 id="so-lines">Order lines</h2>
          <span className="muted small">
            {lines.filter((l) => l.qtyRemaining <= 0).length}/{lines.length} done
          </span>
        </div>
        <ul className="list">
          {lines.map((l) => (
            <li
              key={l.id}
              className={`list-item ${l.qtyRemaining <= 0 ? 'done' : ''}`}
              data-testid="so-line"
              data-sku={l.sku}
              style={{ cursor: 'default' }}
            >
              <span>
                <span className="title">{l.sku}</span>
                <div className="sub">{l.name}</div>
              </span>
              <span className="nowrap small">
                {l.qtyPicked}/{l.qtyOrdered}
                {skipped.includes(l.lineNo) && l.qtyRemaining > 0 && (
                  <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                    skipped
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
