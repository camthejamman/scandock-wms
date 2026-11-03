import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import type { ErpStatus } from '../lib/types';
import { useAuth } from '../state/auth';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/items', label: 'Items' },
  { to: '/admin/bins', label: 'Bins' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/counts', label: 'Cycle Counts' },
  { to: '/admin/transactions', label: 'Transactions' },
  { to: '/admin/erp', label: 'ERP Sync' },
  { to: '/admin/users', label: 'Users', adminOnly: true },
  { to: '/admin/settings', label: 'Settings', adminOnly: true },
];

export function AdminLayout() {
  const { user, logout, hasRole } = useAuth();
  const [erp, setErp] = useState<ErpStatus | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await api<ErpStatus>('/erp/status');
        if (!cancelled) setErp(s);
      } catch {
        /* the banner just stays as it was */
      }
      if (!cancelled) timer = window.setTimeout(poll, 20_000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="Admin">
        <div className="brand">
          <span aria-hidden="true">▮▯▮</span> ScanDock
        </div>
        <div className="nav-section">Warehouse</div>
        {NAV.filter((n) => !n.adminOnly || hasRole('admin')).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            {n.label}
          </NavLink>
        ))}
        <div className="nav-section">Handheld</div>
        <Link to="/scan">Open scanner</Link>
        <div className="nav-footer">
          <div>{user?.displayName}</div>
          <div className="muted small">{user?.role}</div>
          <button type="button" className="btn-link" onClick={logout}>
            Sign out
          </button>
        </div>
      </nav>
      <main className="admin-main">
        {erp && !erp.reachable && (
          <div
            className="banner banner-danger"
            role="alert"
            data-testid="erp-banner"
            style={{ marginBottom: '1rem' }}
          >
            <span>
              ERP connection lost: {erp.erpName} is not reachable. Warehouse work continues;{' '}
              {erp.outbox.pending + erp.outbox.failed} document(s) are waiting in the outbox.
            </span>
            <Link to="/admin/erp" className="btn btn-sm">
              Details
            </Link>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
