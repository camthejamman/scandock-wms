import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Paged, PoLine, PurchaseOrder, PurchaseOrderDetail } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useToast } from '../../state/toast';
import { Empty, ErrorState, Loading } from '../../components/Loading';
import { QtyInput } from '../../components/QtyInput';
import { ScanInput } from '../../components/ScanInput';
import { StatusBadge } from '../../components/StatusBadge';

export function ReceivePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const pos = useApi(
    () => api<Paged<PurchaseOrder>>('/purchase-orders', { query: { open: true, pageSize: 50 } }),
    [],
  );

  async function onScan(code: string) {
    try {
      const po = await api<PurchaseOrderDetail>(`/purchase-orders/${encodeURIComponent(code)}`);
      if (po.status === 'RECEIVED' || po.status === 'CLOSED') {
        toast.error(`${po.poNumber} is already ${po.status.toLowerCase()}`);
        return;
      }
      navigate(`/scan/receive/${po.poNumber}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <ScanInput label="Scan PO number" placeholder="PO-1001" onScan={onScan} testId="scan-po" />
      <section className="card" aria-labelledby="open-pos">
        <div className="card-title">
          <h2 id="open-pos">Open purchase orders</h2>
          {pos.data && <span className="muted small">{pos.data.total}</span>}
        </div>
        {pos.loading && <Loading />}
        {pos.error && <ErrorState message={pos.error} onRetry={pos.reload} />}
        {pos.data && pos.data.data.length === 0 && <Empty>Nothing to receive right now.</Empty>}
        {pos.data && pos.data.data.length > 0 && (
          <ul className="list">
            {pos.data.data.map((po) => (
              <li key={po.id}>
                <Link
                  className="list-item"
                  to={`/scan/receive/${po.poNumber}`}
                  data-testid="po-row"
                >
                  <span>
                    <span className="title">{po.poNumber}</span>
                    <div className="sub">
                      {po.vendor} · {po.lineCount} lines · due {formatDate(po.expectedDate)}
                    </div>
                  </span>
                  <span className="row">
                    <span className="small muted nowrap">
                      {po.qtyReceived}/{po.qtyOrdered}
                    </span>
                    <StatusBadge status={po.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function ReceivePoPage() {
  const { poNumber = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const po = useApi(
    () => api<PurchaseOrderDetail>(`/purchase-orders/${encodeURIComponent(poNumber)}`),
    [poNumber],
  );
  const [selected, setSelected] = useState<PoLine | null>(null);
  const [qty, setQty] = useState(0);
  const [lot, setLot] = useState('');
  const [posting, setPosting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);

  const lines = po.data?.lines ?? [];
  const complete = useMemo(
    () => lines.length > 0 && lines.every((l) => l.qtyRemaining <= 0),
    [lines],
  );
  const closed = po.data?.status === 'RECEIVED' || po.data?.status === 'CLOSED';

  function selectLine(line: PoLine) {
    setSelected(line);
    setQty(Math.max(1, line.qtyRemaining));
    setLot('');
  }

  function onScanItem(code: string) {
    const match = lines.find((l) => l.barcode === code || l.sku.toUpperCase() === code);
    if (!match) {
      toast.error(`${code} is not on ${poNumber}`);
      return;
    }
    if (match.qtyRemaining <= 0) toast.info(`Line ${match.lineNo} is already fully received`);
    selectLine(match);
  }

  async function onScanBin(bin: string) {
    if (!selected || !po.data) return;
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error('Enter a quantity greater than zero');
      return;
    }
    if (selected.lotTracked && !lot.trim()) {
      toast.error(`${selected.sku} is lot tracked: enter the lot number first`);
      return;
    }
    setPosting(true);
    try {
      const result = await api<{ poStatus: string; lines: Array<{ qtyRemaining: number }> }>(
        `/purchase-orders/${encodeURIComponent(po.data.poNumber)}/receipts`,
        {
          method: 'POST',
          body: {
            lines: [
              {
                lineNo: selected.lineNo,
                sku: selected.sku,
                qty,
                bin,
                lot: lot.trim() || undefined,
              },
            ],
          },
        },
      );
      const msg = `Received ${qty} × ${selected.sku} into ${bin}`;
      toast.success(msg);
      setLastReceipt(msg);
      setSelected(null);
      await po.reload();
      if (result.poStatus === 'RECEIVED') toast.info(`${po.data.poNumber} is fully received`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPosting(false);
    }
  }

  if (po.loading && !po.data) return <Loading />;
  if (po.error) return <ErrorState message={po.error} onRetry={po.reload} />;
  if (!po.data) return null;

  return (
    <>
      <section className="card">
        <div className="card-title">
          <h2>{po.data.poNumber}</h2>
          <StatusBadge status={po.data.status} />
        </div>
        <div className="muted small">
          {po.data.vendor} · due {formatDate(po.data.expectedDate)}
        </div>
      </section>

      {complete || closed ? (
        <div className="banner banner-ok" role="status" data-testid="po-complete">
          <span>All lines received{lastReceipt ? ` · ${lastReceipt}` : ''}.</span>
          <button type="button" className="btn btn-sm" onClick={() => navigate('/scan/receive')}>
            Done
          </button>
        </div>
      ) : !selected ? (
        <ScanInput
          label="Scan item"
          placeholder="Barcode or SKU"
          hint="Or tap a line below"
          onScan={onScanItem}
          testId="scan-item"
        />
      ) : (
        <section className="card" data-testid="receive-form">
          <div className="card-title">
            <h2>
              Line {selected.lineNo} · {selected.sku}
            </h2>
            <button type="button" className="btn btn-sm" onClick={() => setSelected(null)}>
              Change
            </button>
          </div>
          <div className="muted small" style={{ marginBottom: '0.6rem' }}>
            {selected.name} · {selected.qtyRemaining} remaining of {selected.qtyOrdered}
          </div>
          <div className="stack">
            <QtyInput label="Quantity" value={qty} onChange={setQty} min={1} testId="receive-qty" />
            {selected.lotTracked && (
              <div className="field">
                <label htmlFor="lot">Lot number</label>
                <input
                  id="lot"
                  className="input mono"
                  value={lot}
                  onChange={(e) => setLot(e.target.value)}
                  placeholder="LOT-2411A"
                  autoCapitalize="characters"
                />
                <div className="hint">This item is lot tracked.</div>
              </div>
            )}
            <ScanInput
              label="Scan put-away bin"
              placeholder="RECV-01"
              hint="Posting the receipt happens when the bin is scanned."
              onScan={onScanBin}
              disabled={posting}
              autoFocus={!selected.lotTracked}
              buttonLabel="Post"
              testId="scan-bin"
            />
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="po-lines">
        <div className="card-title">
          <h2 id="po-lines">Lines</h2>
          <span className="muted small">
            {lines.filter((l) => l.qtyRemaining <= 0).length}/{lines.length} done
          </span>
        </div>
        <ul className="list">
          {lines.map((l) => {
            const pct = l.qtyOrdered
              ? Math.min(100, Math.round((l.qtyReceived / l.qtyOrdered) * 100))
              : 0;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  className={`list-item ${selected?.lineNo === l.lineNo ? 'selected' : ''} ${l.qtyRemaining <= 0 ? 'done' : ''}`}
                  onClick={() => selectLine(l)}
                  data-testid="po-line"
                  data-sku={l.sku}
                  disabled={complete || closed}
                >
                  <span className="grow">
                    <span className="title">{l.sku}</span>
                    <div className="sub">{l.name}</div>
                    <div className="progress" style={{ marginTop: '0.35rem' }} aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  </span>
                  <span className="nowrap small">
                    {l.qtyReceived}/{l.qtyOrdered}
                    {l.lotTracked && (
                      <span className="badge badge-info" style={{ marginLeft: 6 }}>
                        Lot
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
