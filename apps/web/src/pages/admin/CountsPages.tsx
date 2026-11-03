import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, signed } from '../../lib/format';
import type { CycleCount, CycleCountDetail, Paged, User } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useToast } from '../../state/toast';
import { Empty, ErrorState, Loading } from '../../components/Loading';
import { Modal } from '../../components/Modal';
import { Pager } from '../../components/Pager';
import { StatusBadge } from '../../components/StatusBadge';

const STATUSES = ['', 'OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED'];

export function CountsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);
  const counts = useApi(
    () => api<Paged<CycleCount>>('/cycle-counts', { query: { status, page, pageSize: 25 } }),
    [status, page],
  );
  const users = useApi(
    () => api<{ data: User[] }>('/users').catch(() => ({ data: [] as User[] })),
    [],
  );
  const [creating, setCreating] = useState(false);
  const [bin, setBin] = useState('');
  const [assignee, setAssignee] = useState('');
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
    if (!bin.trim()) return setFormError('Bin is required');
    setBusy(true);
    try {
      const c = await api<CycleCountDetail>('/cycle-counts', {
        method: 'POST',
        body: { bin: bin.trim().toUpperCase(), assignedTo: assignee || undefined },
      });
      toast.success(`Count #${c.id} created for ${c.bin}`);
      setCreating(false);
      setBin('');
      await counts.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <h1>Cycle counts</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCreating(true)}
          data-testid="new-count"
        >
          New count
        </button>
      </div>
      <div className="tabs" role="tablist">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => set({ status: s || undefined })}
          >
            {s || 'All'}
          </button>
        ))}
      </div>
      {counts.error && <ErrorState message={counts.error} onRetry={counts.reload} />}
      {counts.loading && !counts.data && <Loading />}
      {counts.data && counts.data.data.length === 0 && <Empty>No counts with this status.</Empty>}
      {counts.data && counts.data.data.length > 0 && (
        <section className="card">
          <div className="table-wrap" tabIndex={0}>
            <table className="table" data-testid="counts-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Bin</th>
                  <th>Zone</th>
                  <th>Status</th>
                  <th>Assigned to</th>
                  <th className="num">Lines</th>
                  <th className="num">Variances</th>
                  <th>Created</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {counts.data.data.map((c) => (
                  <tr key={c.id} data-testid="count-row" data-status={c.status}>
                    <td>
                      <Link to={`/admin/counts/${c.id}`} className="row-link">
                        #{c.id}
                      </Link>
                    </td>
                    <td className="mono">{c.bin}</td>
                    <td>{c.zone}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>{c.assignedTo ?? <span className="muted">unassigned</span>}</td>
                    <td className="num">{c.lineCount}</td>
                    <td className="num">{c.varianceLines}</td>
                    <td className="small muted nowrap">{formatDateTime(c.createdAt)}</td>
                    <td className="small muted nowrap">{formatDateTime(c.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={counts.data.page}
            pageSize={counts.data.pageSize}
            total={counts.data.total}
            onPage={(p) => set({ page: String(p) })}
          />
        </section>
      )}

      <Modal
        open={creating}
        title="New cycle count"
        onClose={() => setCreating(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="count-form"
              className="btn btn-primary"
              disabled={busy}
              data-testid="save-count"
            >
              Create count
            </button>
          </>
        }
      >
        <form id="count-form" className="stack" onSubmit={create} noValidate>
          <div className="field">
            <label htmlFor="count-bin">Bin to count</label>
            <input
              id="count-bin"
              className="input mono"
              value={bin}
              onChange={(e) => setBin(e.target.value)}
              placeholder="A-01-01"
              autoCapitalize="characters"
            />
            <div className="hint">
              The expected quantities are snapshotted when the count is created.
            </div>
          </div>
          <div className="field">
            <label htmlFor="count-assignee">Assign to</label>
            <select
              id="count-assignee"
              className="input"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Anyone (unassigned)</option>
              {(users.data?.data ?? [])
                .filter((u) => u.active)
                .map((u) => (
                  <option key={u.id} value={u.username}>
                    {u.displayName} ({u.username})
                  </option>
                ))}
            </select>
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

export function CountDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const count = useApi(() => api<CycleCountDetail>(`/cycle-counts/${id}`), [id]);
  const [review, setReview] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitReview() {
    if (!review) return;
    setBusy(true);
    try {
      const r = await api<{ adjustments?: unknown[] }>(`/cycle-counts/${id}/${review}`, {
        method: 'POST',
        body: { notes: notes || undefined },
      });
      toast.success(
        review === 'approve'
          ? `Count #${id} approved (${r.adjustments?.length ?? 0} adjustment(s) posted)`
          : `Count #${id} rejected`,
      );
      setReview(null);
      setNotes('');
      await count.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (count.error) return <ErrorState message={count.error} onRetry={count.reload} />;
  if (!count.data) return <Loading />;
  const d = count.data;
  return (
    <>
      <div className="admin-topbar">
        <div>
          <Link to="/admin/counts" className="small">
            ‹ Cycle counts
          </Link>
          <h1>
            Count #{d.id} · <span className="mono">{d.bin}</span> <StatusBadge status={d.status} />
          </h1>
        </div>
        {d.status === 'SUBMITTED' && (
          <div className="row">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setReview('reject')}
              data-testid="reject-count"
            >
              Reject
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setReview('approve')}
              data-testid="approve-count"
            >
              Approve
            </button>
          </div>
        )}
        {d.status === 'OPEN' && (
          <Link to={`/scan/count/${d.id}`} className="btn">
            Count on scanner
          </Link>
        )}
      </div>
      <div className="two-col">
        <section className="card">
          <h2>Details</h2>
          <dl className="kv">
            <dt>Zone</dt>
            <dd>{d.zone}</dd>
            <dt>Assigned to</dt>
            <dd>{d.assignedTo ?? 'unassigned'}</dd>
            <dt>Created</dt>
            <dd>
              {formatDateTime(d.createdAt)} by {d.createdBy ?? '—'}
            </dd>
            <dt>Submitted</dt>
            <dd>
              {d.submittedAt ? `${formatDateTime(d.submittedAt)} by ${d.submittedBy ?? '—'}` : '—'}
            </dd>
            <dt>Reviewed</dt>
            <dd>
              {d.reviewedAt ? `${formatDateTime(d.reviewedAt)} by ${d.reviewedBy ?? '—'}` : '—'}
            </dd>
            {d.notes && (
              <>
                <dt>Notes</dt>
                <dd>{d.notes}</dd>
              </>
            )}
          </dl>
        </section>
        {d.summary && (
          <section className="card" data-testid="count-summary">
            <h2>Summary</h2>
            <dl className="kv">
              <dt>Lines</dt>
              <dd>{d.summary.lines}</dd>
              <dt>With variance</dt>
              <dd>{d.summary.linesWithVariance}</dd>
              <dt>Net variance</dt>
              <dd>{signed(d.summary.netVariance)}</dd>
              <dt>Absolute variance</dt>
              <dd>{d.summary.absVariance}</dd>
              <dt>Accuracy</dt>
              <dd>{d.summary.accuracyPct === null ? '—' : `${d.summary.accuracyPct}%`}</dd>
            </dl>
          </section>
        )}
      </div>
      <section className="card" style={{ marginTop: '0.75rem' }}>
        <h2>Lines</h2>
        {d.lines.length === 0 ? (
          <div className="muted">No lines.</div>
        ) : (
          <div className="table-wrap" tabIndex={0}>
            <table className="table" data-testid="count-lines">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Lot</th>
                  <th className="num">Expected</th>
                  <th className="num">Counted</th>
                  <th className="num">Variance</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => (
                  <tr
                    key={`${l.sku}|${l.lot}`}
                    data-testid="count-line"
                    data-variance={l.variance ?? ''}
                  >
                    <td>{l.sku}</td>
                    <td>{l.name}</td>
                    <td className="mono">{l.lot || '—'}</td>
                    <td className="num">{l.expectedQty ?? '—'}</td>
                    <td className="num">{l.countedQty ?? '—'}</td>
                    <td className="num">
                      {l.variance === null ? (
                        '—'
                      ) : (
                        <span
                          className={
                            l.variance === 0
                              ? 'muted'
                              : l.variance < 0
                                ? 'badge badge-danger'
                                : 'badge badge-warn'
                          }
                        >
                          {signed(l.variance)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Modal
        open={review !== null}
        title={review === 'approve' ? `Approve count #${d.id}?` : `Reject count #${d.id}?`}
        onClose={() => setReview(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setReview(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${review === 'approve' ? 'btn-primary' : 'btn-danger'}`}
              onClick={submitReview}
              disabled={busy}
              data-testid="confirm-review"
            >
              {review === 'approve' ? 'Approve and post adjustments' : 'Reject count'}
            </button>
          </>
        }
      >
        <p>
          {review === 'approve'
            ? 'Approving posts an inventory adjustment for every line with a variance and sends it to the ERP.'
            : 'Rejecting closes this count without changing inventory. Create a new count to recount the bin.'}
        </p>
        <div className="field">
          <label htmlFor="review-notes">Notes</label>
          <textarea
            id="review-notes"
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}
