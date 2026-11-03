import { useState } from 'react';
import { ApiError, api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { Bin, BinContentRow, Item, StockRow } from '../../lib/types';
import { useToast } from '../../state/toast';
import { ScanInput } from '../../components/ScanInput';
import { StatusBadge } from '../../components/StatusBadge';

type Result =
  | { kind: 'item'; item: Item; rows: StockRow[]; qtyOnHand: number; lowStock: boolean }
  | { kind: 'bin'; bin: Bin; rows: BinContentRow[]; unitsOnHand: number };

export function InquiryPage() {
  const toast = useToast();
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  async function lookup(code: string) {
    try {
      const r = await api<Omit<Extract<Result, { kind: 'item' }>, 'kind'>>(
        `/inventory/item/${encodeURIComponent(code)}`,
      );
      setResult({ kind: 'item', ...r });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        try {
          const b = await api<Omit<Extract<Result, { kind: 'bin' }>, 'kind'>>(
            `/inventory/bin/${encodeURIComponent(code)}`,
          );
          setResult({ kind: 'bin', ...b });
        } catch (err2) {
          if (err2 instanceof ApiError && err2.status === 404) {
            toast.error(`Nothing found for ${code}`);
            setResult(null);
            return;
          }
          toast.error(errorMessage(err2));
          return;
        }
      } else {
        toast.error(errorMessage(err));
        return;
      }
    }
    setHistory((h) => [code, ...h.filter((x) => x !== code)].slice(0, 5));
  }

  return (
    <>
      <ScanInput
        label="Scan item or bin"
        placeholder="SKU, barcode or bin code"
        onScan={lookup}
        testId="scan-inquiry"
      />
      {history.length > 0 && (
        <div className="row" aria-label="Recent lookups">
          {history.map((h) => (
            <button key={h} type="button" className="btn btn-sm mono" onClick={() => lookup(h)}>
              {h}
            </button>
          ))}
        </div>
      )}

      {result?.kind === 'item' && (
        <section className="card" data-testid="item-result">
          <div className="card-title">
            <h2>{result.item.sku}</h2>
            <span className="row">
              {result.lowStock && <span className="badge badge-warn">Low stock</span>}
              {!result.item.active && <span className="badge badge-danger">Inactive</span>}
            </span>
          </div>
          <dl className="kv">
            <dt>Name</dt>
            <dd>{result.item.name}</dd>
            <dt>Barcode</dt>
            <dd className="mono">{result.item.barcode}</dd>
            <dt>On hand</dt>
            <dd data-testid="item-on-hand">
              {result.qtyOnHand} {result.item.uom}
            </dd>
            <dt>Reorder at</dt>
            <dd>{result.item.reorderPoint}</dd>
            <dt>Lot tracked</dt>
            <dd>{result.item.lotTracked ? 'Yes' : 'No'}</dd>
          </dl>
          <div className="table-wrap" tabIndex={0} style={{ marginTop: '0.75rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Bin</th>
                  <th>Zone</th>
                  <th>Lot</th>
                  <th className="num">Qty</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No stock on hand
                    </td>
                  </tr>
                )}
                {result.rows.map((r) => (
                  <tr key={`${r.bin}|${r.lot}`}>
                    <td className="mono">{r.bin}</td>
                    <td>{r.zone}</td>
                    <td className="mono">{r.lot || '—'}</td>
                    <td className="num">{r.qtyOnHand}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result?.kind === 'bin' && (
        <section className="card" data-testid="bin-result">
          <div className="card-title">
            <h2 className="mono">{result.bin.code}</h2>
            <span className="row">
              <StatusBadge status={result.bin.zone} label={result.bin.zone} />
              {!result.bin.active && <span className="badge badge-danger">Inactive</span>}
            </span>
          </div>
          <div className="muted small">
            {result.rows.length} item(s) · {result.unitsOnHand} units
          </div>
          <div className="table-wrap" tabIndex={0} style={{ marginTop: '0.75rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Lot</th>
                  <th className="num">Qty</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      Empty bin
                    </td>
                  </tr>
                )}
                {result.rows.map((r) => (
                  <tr key={`${r.sku}|${r.lot}`}>
                    <td>
                      {r.sku}
                      <div className="muted small">{r.name}</div>
                    </td>
                    <td className="mono">{r.lot || '—'}</td>
                    <td className="num">{r.qtyOnHand}</td>
                    <td className="small muted">
                      {formatDateTime((r as BinContentRow & { updatedAt?: string }).updatedAt)}
                    </td>
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
