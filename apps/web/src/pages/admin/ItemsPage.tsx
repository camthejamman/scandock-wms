import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import type { Item, Paged } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useToast } from '../../state/toast';
import { Empty, ErrorState, Loading } from '../../components/Loading';
import { Modal } from '../../components/Modal';
import { Pager } from '../../components/Pager';

interface ItemForm {
  sku: string;
  name: string;
  barcode: string;
  category: string;
  uom: string;
  unitCost: string;
  weightLb: string;
  lotTracked: boolean;
  reorderPoint: string;
}

const EMPTY: ItemForm = {
  sku: '',
  name: '',
  barcode: '',
  category: 'General',
  uom: 'EA',
  unitCost: '0',
  weightLb: '1',
  lotTracked: false,
  reorderPoint: '0',
};

export function ItemsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = params.get('q') ?? '';
  const lowStock = params.get('lowStock') === 'true';
  const showInactive = params.get('inactive') === 'true';
  const [lowStockBox, setLowStockBox] = useState(lowStock);
  const [inactiveBox, setInactiveBox] = useState(showInactive);
  useEffect(() => setLowStockBox(lowStock), [lowStock]);
  useEffect(() => setInactiveBox(showInactive), [showInactive]);
  const page = Number(params.get('page') ?? 1);
  const items = useApi(
    () =>
      api<Paged<Item>>('/items', {
        query: {
          q: query,
          lowStock: lowStock ? 'true' : undefined,
          active: showInactive ? undefined : 'true',
          page,
          pageSize: 25,
        },
      }),
    [query, lowStock, showInactive, page],
  );
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY);
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

  function openNew() {
    setForm(EMPTY);
    setFormError(null);
    setEditing('new');
  }

  function openEdit(item: Item) {
    setForm({
      sku: item.sku,
      name: item.name,
      barcode: item.barcode,
      category: item.category,
      uom: item.uom,
      unitCost: String(item.unitCost),
      weightLb: String(item.weightLb),
      lotTracked: item.lotTracked,
      reorderPoint: String(item.reorderPoint),
    });
    setFormError(null);
    setEditing(item);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const body = {
      name: form.name.trim(),
      barcode: form.barcode.trim() || undefined,
      category: form.category.trim() || 'General',
      uom: form.uom.trim() || 'EA',
      unitCost: Number(form.unitCost),
      weightLb: Number(form.weightLb),
      lotTracked: form.lotTracked,
      reorderPoint: Number(form.reorderPoint),
    };
    if (!body.name) return setFormError('Name is required');
    if (!(body.weightLb > 0)) return setFormError('Weight must be greater than zero');
    setBusy(true);
    try {
      if (editing === 'new') {
        await api('/items', {
          method: 'POST',
          body: { ...body, sku: form.sku.trim().toUpperCase() },
        });
        toast.success(`Item ${form.sku.trim().toUpperCase()} created`);
      } else if (editing) {
        await api(`/items/${encodeURIComponent(editing.sku)}`, { method: 'PATCH', body });
        toast.success(`Item ${editing.sku} updated`);
      }
      setEditing(null);
      await items.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item: Item) {
    try {
      await api(`/items/${encodeURIComponent(item.sku)}`, {
        method: 'PATCH',
        body: { active: !item.active },
      });
      toast.success(`${item.sku} ${item.active ? 'deactivated' : 'reactivated'}`);
      await items.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const field = (key: keyof ItemForm, label: string, extra: Record<string, unknown> = {}) => (
    <div className="field">
      <label htmlFor={`item-${key}`}>{label}</label>
      <input
        id={`item-${key}`}
        className="input"
        value={String(form[key])}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...extra}
      />
    </div>
  );

  return (
    <>
      <div className="admin-topbar">
        <h1>Items</h1>
        <button type="button" className="btn btn-primary" onClick={openNew} data-testid="new-item">
          New item
        </button>
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q });
        }}
      >
        <div className="field">
          <label htmlFor="items-q">Search</label>
          <input
            id="items-q"
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="SKU, name or barcode"
          />
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
        <label className="checkbox">
          <input
            type="checkbox"
            checked={inactiveBox}
            onChange={(e) => {
              setInactiveBox(e.target.checked);
              set({ inactive: e.target.checked ? 'true' : undefined });
            }}
          />{' '}
          Include inactive
        </label>
        <button type="submit" className="btn">
          Search
        </button>
      </form>

      {items.error && <ErrorState message={items.error} onRetry={items.reload} />}
      {items.loading && !items.data && <Loading />}
      {items.data && items.data.data.length === 0 && <Empty>No items match.</Empty>}
      {items.data && items.data.data.length > 0 && (
        <section className="card">
          <div className="table-wrap" tabIndex={0}>
            <table className="table" data-testid="items-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Barcode</th>
                  <th>Category</th>
                  <th className="num">Cost</th>
                  <th className="num">Weight</th>
                  <th className="num">Reorder</th>
                  <th className="num">On hand</th>
                  <th>Flags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.data.data.map((i) => (
                  <tr key={i.id} data-testid="item-row" data-sku={i.sku}>
                    <td>
                      <strong>{i.sku}</strong>
                    </td>
                    <td>{i.name}</td>
                    <td className="mono small">{i.barcode}</td>
                    <td>{i.category}</td>
                    <td className="num">{formatMoney(i.unitCost)}</td>
                    <td className="num">{i.weightLb} lb</td>
                    <td className="num">{i.reorderPoint}</td>
                    <td className="num">{i.qtyOnHand}</td>
                    <td>
                      {i.lotTracked && <span className="badge badge-info">Lot</span>}{' '}
                      {i.lowStock && i.active && <span className="badge badge-warn">Low</span>}{' '}
                      {!i.active && <span className="badge badge-danger">Inactive</span>}
                    </td>
                    <td className="nowrap">
                      <button type="button" className="btn btn-sm" onClick={() => openEdit(i)}>
                        Edit
                      </button>{' '}
                      <button type="button" className="btn btn-sm" onClick={() => toggleActive(i)}>
                        {i.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={items.data.page}
            pageSize={items.data.pageSize}
            total={items.data.total}
            onPage={(p) => set({ page: String(p) })}
          />
        </section>
      )}

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'New item' : `Edit ${editing?.sku ?? ''}`}
        onClose={() => setEditing(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              type="submit"
              form="item-form"
              className="btn btn-primary"
              disabled={busy}
              data-testid="save-item"
            >
              {editing === 'new' ? 'Create item' : 'Save changes'}
            </button>
          </>
        }
      >
        <form id="item-form" onSubmit={save} className="stack" noValidate>
          <div className="form-grid">
            {editing === 'new'
              ? field('sku', 'SKU', {
                  placeholder: 'TOY-NEW-01',
                  autoCapitalize: 'characters',
                  required: true,
                })
              : null}
            {field('name', 'Name', { required: true })}
            {field('barcode', 'Barcode (UPC-A, blank = generate)', { placeholder: '036000291452' })}
            {field('category', 'Category')}
            {field('uom', 'Unit of measure')}
            {field('unitCost', 'Unit cost (USD)', { type: 'number', step: '0.01', min: 0 })}
            {field('weightLb', 'Weight (lb)', { type: 'number', step: '0.01', min: 0.01 })}
            {field('reorderPoint', 'Reorder point', { type: 'number', step: 1, min: 0 })}
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.lotTracked}
              onChange={(e) => setForm({ ...form, lotTracked: e.target.checked })}
            />{' '}
            Lot tracked
          </label>
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
