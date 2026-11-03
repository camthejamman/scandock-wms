/** Display helpers shared by the scanner and admin screens. */

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function formatQty(n: number | null | undefined, uom = ''): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const s = n.toLocaleString();
  return uom ? `${s} ${uom}` : s;
}

export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** Scanners sometimes add whitespace or send lowercase; normalise what we compare on. */
export function normalizeScan(raw: string): string {
  return raw
    .replace(/[\r\n\t]/g, '')
    .trim()
    .toUpperCase();
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}
