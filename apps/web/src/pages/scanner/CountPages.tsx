import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, signed } from '../../lib/format';
import type {
  CountLine,
  CountSummary,
  CycleCount,
  CycleCountDetail,
  Item,
  Paged,
} from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useToast } from '../../state/toast';
import { Empty, ErrorState, Loading } from '../../components/Loading';
import { Modal } from '../../components/Modal';
import { ScanInput } from '../../components/ScanInput';
import { StatusBadge } from '../../components/StatusBadge';

export function CountListPage() {
  const counts = useApi(
    () => api<Paged<CycleCount>>('/cycle-counts', { query: { status: 'OPEN', pageSize: 50 } }),
    [],
  );
  return (
    <section className="card" aria-labelledby="count-list">
      <div className="card-title">
        <h2 id="count-list">Counts to do</h2>
        {counts.data && <span className="muted small">{counts.data.total}</span>}
      </div>
      {counts.loading && <Loading />}
      {counts.error && <ErrorState message={counts.error} onRetry={counts.reload} />}
      {counts.data && counts.data.data.length === 0 && (
        <Empty>No cycle counts assigned to you.</Empty>
      )}
      {counts.data && counts.data.data.length > 0 && (
        <ul className="list">
          {counts.data.data.map((c) => (
            <li key={c.id}>
              <Link className="list-item" to={`/scan/count/${c.id}`} data-testid="count-row">
                <span>
                  <span className="title mono">{c.bin}</span>
                  <div className="sub">
                    Count #{c.id} · {c.zone.toLowerCase()} · {c.assignedTo ?? 'unassigned'} ·{' '}
                    {formatDateTime(c.createdAt)}
                  </div>
                </span>
                <StatusBadge status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface LocalLine {
  key: string;
  sku: string;
  name: string;
  lot: string;
  lotTracked: boolean;
  expectedQty: number | null;
  counted: number | null;
}

export function CountPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const count = useApi(() => api<CycleCountDetail>(`/cycle-counts/${id}`), [id]);
  const [local, setLocal] = useState<LocalLine[] | null>(null);
  const [pendingLot, setPendingLot] = useState<{ item: Item } | null>(null);
  const [lotValue, setLotValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ lines: CountLine[]; summary: CountSummary | null } | null>(
    null,
  );

  const lines: LocalLine[] = useMemo(() => {
    if (local) return local;
    if (!count.data) return [];
    return count.data.lines.map((l) => ({
      key: `${l.sku}|${l.lot}`,
      sku: l.sku,
      name: l.name,
      lot: l.lot,
      lotTracked: !!l.lot,
      expectedQty: l.expectedQty,
      counted: l.countedQty,
    }));
  }, [local, count.data]);

  function update(key: string, counted: number | null) {
    setLocal(lines.map((l) => (l.key === key ? { ...l, counted } : l)));
  }

  function addOrBump(item: Item, lot: string) {
    const key = `${item.sku}|${lot}`;
    const existing = lines.find((l) => l.key === key);
    if (existing) {
      update(key, (existing.counted ?? 0) + 1);
      toast.info(`${item.sku}: ${(existing.counted ?? 0) + 1}`);
    } else {
      setLocal([
        ...lines,
        {
          key,
          sku: item.sku,
          name: item.name,
          lot,
          lotTracked: item.lotTracked,
          expectedQty: count.data?.blind ? null : 0,
          counted: 1,
        },
      ]);
      toast.info(`${item.sku} added to the count`);
    }
  }

  async function onScanItem(code: string) {
    const known = lines.find((l) => l.sku === code || l.key.startsWith(`${code}|`));
    try {
      const item = known ? null : await api<Item>(`/items/${encodeURIComponent(code)}`);
      const resolved =
        item ?? ({ sku: known!.sku, name: known!.name, lotTracked: known!.lotTracked } as Item);
      if (resolved.lotTracked) {
        setPendingLot({ item: resolved });
        setLotValue('');
        return;
      }
      addOrBump(resolved, '');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submit() {
    if (!count.data) return;
    setBusy(true);
    try {
      const r = await api<{ lines: CountLine[]; summary: CountSummary | null }>(
        `/cycle-counts/${count.data.id}/submit`,
        {
          method: 'POST',
          body: {
            lines: lines
              .filter((l) => l.counted !== null)
              .map((l) => ({ sku: l.sku, lot: l.lot || undefined, countedQty: l.counted })),
          },
        },
      );
      setResult(r);
      setConfirmOpen(false);
      toast.success(`Count #${count.data.id} submitted for review`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (count.loading && !count.data) return <Loading />;
  if (count.error) return <ErrorState message={count.error} onRetry={count.reload} />;
  if (!count.data) return null;

  const uncounted = lines.filter((l) => l.counted === null);

  if (result) {
    return (
      <section className="card" data-testid="count-result">
        <div className="card-title">
          <h2>Count #{count.data.id} submitted</h2>
          <StatusBadge status="SUBMITTED" />
        </div>
        {result.summary ? (
          <p className="muted">
            {result.summary.lines} lines · {result.summary.linesWithVariance} with variance · net{' '}
            {signed(result.summary.netVariance)} · accuracy {result.summary.accuracyPct ?? '—'}%
          </p>
        ) : (
          <p className="muted">Blind count: a supervisor will review the variances.</p>
        )}
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Lot</th>
                <th className="num">Expected</th>
                <th className="num">Counted</th>
                <th className="num">Var</th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((l) => (
                <tr key={`${l.sku}|${l.lot}`}>
                  <td>{l.sku}</td>
                  <td className="mono">{l.lot || '—'}</td>
                  <td className="num">{l.expectedQty ?? '—'}</td>
                  <td className="num">{l.countedQty ?? 0}</td>
                  <td className="num">{l.variance === null ? '—' : signed(l.variance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: '1rem' }}
          onClick={() => navigate('/scan/count')}
        >
          Done
        </button>
      </section>
    );
  }

  if (count.data.status !== 'OPEN') {
    return (
      <div className="banner banner-info" role="status">
        <span>
          Count #{count.data.id} for {count.data.bin} is {count.data.status.toLowerCase()}.
        </span>
        <Link to="/scan/count" className="btn btn-sm">
          Back
        </Link>
      </div>
    );
  }

  return (
    <>
      <section className="card">
        <div className="card-title">
          <h2>
            Bin <span className="mono">{count.data.bin}</span>
          </h2>
          <span className="row">
            {count.data.blind && <span className="badge badge-warn">Blind</span>}
            <StatusBadge status={count.data.status} />
          </span>
        </div>
        <div className="muted small">
          Count #{count.data.id} · {count.data.zone.toLowerCase()} zone
          {count.data.blind ? ' · expected quantities hidden' : ''}
        </div>
      </section>

      <ScanInput
        label="Scan item (each scan adds 1)"
        placeholder="Barcode or SKU"
        onScan={onScanItem}
        testId="scan-item"
      />

      <section className="card" aria-labelledby="count-lines">
        <div className="card-title">
          <h2 id="count-lines">Items</h2>
          <span className="muted small">
            {lines.length - uncounted.length}/{lines.length} counted
          </span>
        </div>
        {lines.length === 0 ? (
          <Empty>
            {count.data.blind
              ? 'Scan every item you find in this bin.'
              : 'The system expects this bin to be empty. Scan anything you find.'}
          </Empty>
        ) : (
          <ul className="list">
            {lines.map((l) => (
              <li
                key={l.key}
                className="list-item"
                style={{ cursor: 'default' }}
                data-testid="count-line"
                data-sku={l.sku}
              >
                <span className="grow">
                  <span className="title">{l.sku}</span>
                  <div className="sub">
                    {l.name}
                    {l.lot ? ` · lot ${l.lot}` : ''}
                    {l.expectedQty !== null ? ` · expected ${l.expectedQty}` : ''}
                  </div>
                </span>
                <label className="sr-only" htmlFor={`counted-${l.key}`}>
                  Counted quantity for {l.sku}
                </label>
                <input
                  id={`counted-${l.key}`}
                  className="input"
                  style={{ width: 90, textAlign: 'center', fontWeight: 700 }}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="—"
                  value={l.counted ?? ''}
                  onChange={(e) =>
                    update(
                      l.key,
                      e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        className="btn btn-primary btn-lg btn-block"
        disabled={busy || (lines.length === 0 && !count.data.blind)}
        onClick={() => (uncounted.length > 0 ? setConfirmOpen(true) : submit())}
        data-testid="submit-count"
      >
        Submit count
      </button>

      <Modal
        open={confirmOpen}
        title="Some lines are not counted"
        onClose={() => setConfirmOpen(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setConfirmOpen(false)}>
              Keep counting
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submit}
              disabled={busy}
              data-testid="confirm-submit"
            >
              Record them as 0
            </button>
          </>
        }
      >
        <p>
          {uncounted.length} line(s) have no count: {uncounted.map((l) => l.sku).join(', ')}.
          Submitting now records them as zero on hand.
        </p>
      </Modal>

      <Modal
        open={!!pendingLot}
        title={`Lot for ${pendingLot?.item.sku ?? ''}`}
        onClose={() => setPendingLot(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setPendingLot(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!lotValue.trim()}
              onClick={() => {
                if (pendingLot) addOrBump(pendingLot.item, lotValue.trim().toUpperCase());
                setPendingLot(null);
              }}
            >
              Add
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="count-lot">Lot number</label>
          <input
            id="count-lot"
            className="input mono"
            value={lotValue}
            onChange={(e) => setLotValue(e.target.value)}
            autoFocus
            placeholder="LOT-2409A"
          />
          {lines.filter((l) => l.sku === pendingLot?.item.sku && l.lot).length > 0 && (
            <div className="hint">
              Known lots here:{' '}
              {lines
                .filter((l) => l.sku === pendingLot?.item.sku && l.lot)
                .map((l) => l.lot)
                .join(', ')}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
