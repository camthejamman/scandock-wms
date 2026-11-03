import { titleCase } from '../lib/format';

const TONE: Record<string, string> = {
  OPEN: 'badge-info',
  PARTIAL: 'badge-warn',
  RECEIVED: 'badge-ok',
  CLOSED: '',
  PICKING: 'badge-warn',
  PICKED: 'badge-brand',
  SHIPPED: 'badge-ok',
  CANCELLED: 'badge-danger',
  SUBMITTED: 'badge-warn',
  APPROVED: 'badge-ok',
  REJECTED: 'badge-danger',
  PENDING: 'badge-warn',
  SENT: 'badge-ok',
  FAILED: 'badge-danger',
  OK: 'badge-ok',
  SKIPPED: 'badge-warn',
  RUSH: 'badge-danger',
  STANDARD: '',
  RECEIPT: 'badge-ok',
  PICK: 'badge-brand',
  TRANSFER_IN: 'badge-info',
  TRANSFER_OUT: 'badge-info',
  ADJUSTMENT: 'badge-warn',
  SHIP: 'badge-ok',
  admin: 'badge-danger',
  supervisor: 'badge-brand',
  operator: 'badge-info',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`badge ${TONE[status] ?? ''}`} data-status={status}>
      {label ?? titleCase(status)}
    </span>
  );
}
