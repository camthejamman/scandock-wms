import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';

const TITLES: Array<[RegExp, string]> = [
  [/^\/scan\/receive\/.+/, 'Receive PO'],
  [/^\/scan\/receive/, 'Receiving'],
  [/^\/scan\/pick\/.+/, 'Pick Order'],
  [/^\/scan\/pick/, 'Picking'],
  [/^\/scan\/ship\/.+/, 'Ship Order'],
  [/^\/scan\/ship/, 'Shipping'],
  [/^\/scan\/transfer/, 'Bin Transfer'],
  [/^\/scan\/count\/.+/, 'Cycle Count'],
  [/^\/scan\/count/, 'Cycle Counts'],
  [/^\/scan\/inquiry/, 'Inventory Inquiry'],
  [/^\/scan\/labels/, 'Print Labels'],
];

export function ScannerLayout() {
  const { user, logout, hasRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isMenu = location.pathname === '/scan' || location.pathname === '/scan/';
  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? 'ScanDock';
  const parent = location.pathname.split('/').slice(0, -1).join('/') || '/scan';

  return (
    <div className="device-wrap">
      <div className="device" data-testid="device">
        <header className="device-bar">
          {!isMenu && (
            <button
              type="button"
              className="btn"
              onClick={() => navigate(parent)}
              aria-label="Back"
            >
              ‹ Back
            </button>
          )}
          <h1>{title}</h1>
          {isMenu && hasRole('admin', 'supervisor') && (
            <Link to="/admin" className="btn">
              Admin
            </Link>
          )}
          <button type="button" className="btn" onClick={logout} aria-label="Sign out">
            Sign out
          </button>
        </header>
        <main className="device-main">
          <Outlet />
        </main>
        <footer className="device-footer">
          <span>
            {user?.displayName} · {user?.role}
          </span>
          <span>ScanDock WMS · JAX</span>
        </footer>
      </div>
    </div>
  );
}
