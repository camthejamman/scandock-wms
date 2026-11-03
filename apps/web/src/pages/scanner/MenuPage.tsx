import { Link } from 'react-router-dom';
import { useAuth } from '../../state/auth';

const TILES = [
  { to: '/scan/receive', icon: '📦', name: 'Receive', desc: 'Purchase orders' },
  { to: '/scan/pick', icon: '🛒', name: 'Pick', desc: 'Sales orders' },
  { to: '/scan/ship', icon: '🚚', name: 'Ship', desc: 'Picked orders' },
  { to: '/scan/transfer', icon: '🔁', name: 'Transfer', desc: 'Bin to bin' },
  { to: '/scan/count', icon: '🧮', name: 'Count', desc: 'Cycle counts' },
  { to: '/scan/inquiry', icon: '🔍', name: 'Inquiry', desc: 'Item or bin' },
  { to: '/scan/labels', icon: '🏷️', name: 'Labels', desc: 'Print ZPL' },
];

export function MenuPage() {
  const { user } = useAuth();
  return (
    <>
      <div>
        <h2 style={{ marginBottom: 0 }}>Hi, {user?.displayName.split(' ')[0]}</h2>
        <div className="muted small">Pick a task to start scanning.</div>
      </div>
      <nav className="menu-grid" aria-label="Warehouse tasks">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className="menu-tile">
            <span className="icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="name">{t.name}</span>
            <span className="desc">{t.desc}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
