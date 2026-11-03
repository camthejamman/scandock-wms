import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { InventoryRow, Paged } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { Empty, ErrorState, Loading } from '../../components/Loading';
import { Pager } from '../../components/Pager';

const ZONES = ['', 'RECEIVING', 'STORAGE', 'PICKING', 'SHIPPING', 'QUARANTINE'];

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const zone = params.get('zone') ?? '';
  const lowStock = params.get('lowStock') === 'true';
  // Mirror the checkbox locally so it toggles instantly while the URL update is in flight.
  const [lowStockBox, setLowStockBox] = useState(lowStock);
  useEffect(() => setLowStockBox(lowStock), [lowStock]);
  const page = Number(params.get('page') ?? 1);
  const query = params.get('q') ?? '';

  const inv = useApi(
    () =>
      api<Paged<InventoryRow>>('/inventory', {
        query: { q: query, zone, lowStock: lowStock ? 'true' : undefined, page, pageSize: 25 },
      }),
    [query, zone, lowStock, page],
  );

  function set(next: Record<string, string | undefined>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p);
  }

  return (
    <>
      <div className="admin-topbar">
        <h1>Inventory</h1>
        {inv.data && <span className="muted small">{inv.data.total} rows</span>}
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q });
        }}
      >
        <div className="field">
          <label htmlFor="inv-q">Search</label>
          <input
            id="inv-q"
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="SKU, name, barcode or bin"
          />
        </div>
        <div className="field">
          <label htmlFor="inv-zone">Zone</label>
          <select
            id="inv-zone"
            className="input"
            value={zone}
            onChange={(e) => set({ zone: e.target.value })}
          >
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z || 'All zones'}
              </option>
            ))}
          </select>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={lowStockBox}
            onChange={(e) => {
              setLowStockBox(e.target.checked);
              set({ lowStock: e.target.checked ? 'true' : undefined });
            }}
          />{' '}
          Low stock only
        </label>
        <button type="submit" className="btn">
          Search
        </button>
      </form>

      {inv.error && <ErrorState message={inv.error} onRetry={inv.reload} />}
      {inv.loading && !inv.data && <Loading />}
      {inv.data && inv.data.data.length === 0 && <Empty>No inventory matches these filters.</Empty>}
      {inv.data && inv.data.data.length > 0 && (
        <section className="card">
          <div className="table-wrap" tabIndex={0}>
            <table className="table" data-testid="inventory-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Bin</th>
                  <th>Zone</th>
                  <th>Lot</th>
                  <th className="num">In bin</th>
                  <th className="num">Item total</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {inv.data.data.map((r) => (
                  <tr key={`${r.sku}|${r.bin}|${r.lot}`} data-testid="inventory-row">
                    <td>
                      {r.sku}
                      {r.lowStock && (
                        <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                          Low
                        </span>
                      )}
                    </td>
                    <td>{r.name}</td>
                    <td className="mono">{r.bin}</td>
                    <td>{r.zone}</td>
                    <td className="mono">{r.lot || '—'}</td>
                    <td className="num">{r.qtyOnHand}</td>
                    <td className="num muted">{r.itemQtyOnHand}</td>
                    <td className="small muted nowrap">{formatDateTime(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={inv.data.page}
            pageSize={inv.data.pageSize}
            total={inv.data.total}
            onPage={(p) => set({ page: String(p) })}
          />
        </section>
      )}
    </>
  );
}
