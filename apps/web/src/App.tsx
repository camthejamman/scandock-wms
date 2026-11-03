import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './state/auth';
import type { Role } from './lib/types';
import { Loading } from './components/Loading';
import { ScannerLayout } from './layouts/ScannerLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { ForbiddenPage, NotFoundPage } from './pages/NotFoundPage';
import { MenuPage } from './pages/scanner/MenuPage';
import { ReceivePage, ReceivePoPage } from './pages/scanner/ReceivePages';
import { PickListPage, PickOrderPage } from './pages/scanner/PickPages';
import { ShipListPage, ShipOrderPage } from './pages/scanner/ShipPages';
import { TransferPage } from './pages/scanner/TransferPage';
import { CountListPage, CountPage } from './pages/scanner/CountPages';
import { InquiryPage } from './pages/scanner/InquiryPage';
import { LabelPage } from './pages/scanner/LabelPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { InventoryPage } from './pages/admin/InventoryPage';
import { ItemsPage } from './pages/admin/ItemsPage';
import { BinsPage } from './pages/admin/BinsPage';
import { OrdersPage, PoDetailPage, SoDetailPage } from './pages/admin/OrdersPages';
import { CountDetailPage, CountsPage } from './pages/admin/CountsPages';
import { UsersPage } from './pages/admin/UsersPage';
import { ErpPage } from './pages/admin/ErpPage';
import { TransactionsPage } from './pages/admin/TransactionsPage';
import { SettingsPage } from './pages/admin/SettingsPage';

function RequireAuth() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading label="Starting ScanDock…" />;
  if (!user)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  return <Outlet />;
}

function RequireRole({ roles }: { roles: Role[] }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) return <ForbiddenPage />;
  return <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/scan" replace />} />
      <Route element={<RequireAuth />}>
        <Route path="/scan" element={<ScannerLayout />}>
          <Route index element={<MenuPage />} />
          <Route path="receive" element={<ReceivePage />} />
          <Route path="receive/:poNumber" element={<ReceivePoPage />} />
          <Route path="pick" element={<PickListPage />} />
          <Route path="pick/:soNumber" element={<PickOrderPage />} />
          <Route path="ship" element={<ShipListPage />} />
          <Route path="ship/:soNumber" element={<ShipOrderPage />} />
          <Route path="transfer" element={<TransferPage />} />
          <Route path="count" element={<CountListPage />} />
          <Route path="count/:id" element={<CountPage />} />
          <Route path="inquiry" element={<InquiryPage />} />
          <Route path="labels" element={<LabelPage />} />
        </Route>
        <Route element={<RequireRole roles={['admin', 'supervisor']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="items" element={<ItemsPage />} />
            <Route path="bins" element={<BinsPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/po/:poNumber" element={<PoDetailPage />} />
            <Route path="orders/so/:soNumber" element={<SoDetailPage />} />
            <Route path="counts" element={<CountsPage />} />
            <Route path="counts/:id" element={<CountDetailPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="erp" element={<ErpPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
