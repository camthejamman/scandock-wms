import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import type { Item, StockRow, TransferResult } from '../../lib/types';
import { useToast } from '../../state/toast';
import { QtyInput } from '../../components/QtyInput';
import { ScanInput } from '../../components/ScanInput';

interface ItemStock {
  item: Item;
  rows: StockRow[];
  qtyOnHand: number;
}

export function TransferPage() {
  const toast = useToast();
  const [stock, setStock] = useState<ItemStock | null>(null);
  const [fromBin, setFromBin] = useState('');
  const [lot, setLot] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<TransferResult | null>(null);

  const rowsInBin = stock?.rows.filter((r) => r.bin === fromBin) ?? [];
  const lots = rowsInBin.map((r) => r.lot).filter(Boolean);
  const availableHere =
    rowsInBin.find((r) => (stock?.item.lotTracked ? r.lot === lot : true))?.qtyOnHand ?? 0;

  function reset() {
    setStock(null);
    setFromBin('');
    setLot('');
    setQty(1);
  }

  async function onScanItem(code: string) {
    try {
      const s = await api<ItemStock>(`/inventory/item/${encodeURIComponent(code)}`);
      setStock(s);
      setFromBin('');
      setLot('');
      if (s.rows.length === 0) toast.info(`${s.item.sku} has no stock anywhere`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function chooseFrom(bin: string) {
    if (!stock) return;
    const rows = stock.rows.filter((r) => r.bin === bin);
    if (rows.length === 0) {
      toast.error(`No ${stock.item.sku} in ${bin}`);
      return;
    }
    setFromBin(bin);
    const l = rows.length === 1 ? rows[0]!.lot : '';
    setLot(l);
    setQty(Math.max(1, Math.min(rows[0]!.qtyOnHand, 1)));
  }

  async function onScanTo(toBin: string) {
    if (!stock) return;
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error('Enter a quantity greater than zero');
      return;
    }
    if (stock.item.lotTracked && !lot) {
      toast.error('Choose the lot to move');
      return;
    }
    if (toBin === fromBin) {
      toast.error('Destination must be a different bin');
      return;
    }
    setBusy(true);
    try {
      const r = await api<TransferResult>('/transfers', {
        method: 'POST',
        body: { sku: stock.item.sku, fromBin, toBin, qty, lot: lot || undefined },
      });
      setLast(r);
      toast.success(`Moved ${r.qty} × ${r.sku} from ${r.from.bin} to ${r.to.bin}`);
      reset();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {last && (
        <div className="banner banner-ok" role="status" data-testid="transfer-result">
          <span>
            {last.reference}: {last.qty} × {last.sku} {last.from.bin} → {last.to.bin} (now{' '}
            {last.from.qtyAfter} / {last.to.qtyAfter})
          </span>
        </div>
      )}

      <section className="card">
        <div className={`step ${!stock ? 'active' : 'done'}`}>
          <span className="step-no">1</span>
          <div className="grow">
            {!stock ? (
              <ScanInput
                label="Scan item"
                placeholder="Barcode or SKU"
                onScan={onScanItem}
                testId="scan-item"
              />
            ) : (
              <div className="row between">
                <span>
                  <strong>{stock.item.sku}</strong>{' '}
                  <span className="muted small">
                    {stock.item.name} · {stock.qtyOnHand} on hand
                  </span>
                </span>
                <button type="button" className="btn-link" onClick={reset}>
                  change
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={`step ${stock && !fromBin ? 'active' : fromBin ? 'done' : ''}`}>
          <span className="step-no">2</span>
          <div className="grow">
            {stock && !fromBin && (
              <>
                <ScanInput
                  label="Scan source bin"
                  placeholder="A-01-01"
                  onScan={chooseFrom}
                  testId="scan-from"
                />
                {stock.rows.length > 0 && (
                  <ul
                    className="list"
                    style={{ marginTop: '0.5rem' }}
                    aria-label="Bins holding this item"
                  >
                    {stock.rows.map((r) => (
                      <li key={`${r.bin}|${r.lot}`}>
                        <button
                          type="button"
                          className="list-item"
                          onClick={() => chooseFrom(r.bin)}
                          data-testid="stock-row"
                        >
                          <span>
                            <span className="title mono">{r.bin}</span>
                            <div className="sub">
                              {r.zone}
                              {r.lot ? ` · lot ${r.lot}` : ''}
                            </div>
                          </span>
                          <span>{r.qtyOnHand}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {fromBin && (
              <div className="row between">
                <span>
                  From <strong className="mono">{fromBin}</strong>
                  {lot ? <span className="muted small"> · lot {lot}</span> : null}
                </span>
                <button type="button" className="btn-link" onClick={() => setFromBin('')}>
                  change
                </button>
              </div>
            )}
            {!stock && <span className="muted">Source bin</span>}
          </div>
        </div>

        <div className={`step ${fromBin ? 'active' : ''}`}>
          <span className="step-no">3</span>
          <div className="grow">
            {fromBin && stock ? (
              <div className="stack">
                {stock.item.lotTracked && (
                  <div className="field">
                    <label htmlFor="transfer-lot">Lot</label>
                    <select
                      id="transfer-lot"
                      className="input"
                      value={lot}
                      onChange={(e) => setLot(e.target.value)}
                    >
                      <option value="">Choose a lot…</option>
                      {lots.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <QtyInput
                  label="Quantity"
                  value={qty}
                  onChange={setQty}
                  min={1}
                  max={Math.max(1, availableHere)}
                  hint={`${availableHere} available in ${fromBin}`}
                  testId="transfer-qty"
                />
                <ScanInput
                  label="Scan destination bin"
                  placeholder="P-01-01"
                  onScan={onScanTo}
                  disabled={busy}
                  buttonLabel="Move"
                  testId="scan-to"
                  autoFocus={false}
                />
              </div>
            ) : (
              <span className="muted">Quantity and destination</span>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
