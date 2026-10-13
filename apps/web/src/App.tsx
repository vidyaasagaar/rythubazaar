import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell, RequireRole, StaffLayout } from './components/layout';
import { Spinner } from './components/ui';
import { HomePage } from './pages/HomePage';
import { MarketPage } from './pages/MarketPage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { NotFoundPage } from './pages/NotFoundPage';

const PhonePage = lazy(() => import('./pages/phone/PhonePage'));
const CartPage = lazy(() => import('./pages/customer/CartPage'));
const CheckoutPage = lazy(() => import('./pages/customer/CheckoutPage'));
const OrdersPage = lazy(() => import('./pages/customer/OrdersPage'));
const OrderDetailPage = lazy(() => import('./pages/customer/OrderDetailPage'));
const SupportPage = lazy(() => import('./pages/customer/SupportPage'));
const AccountPage = lazy(() => import('./pages/customer/AccountPage'));
const FarmerOverviewPage = lazy(() => import('./pages/farmer/FarmerOverviewPage'));
const FarmerListingsPage = lazy(() => import('./pages/farmer/FarmerListingsPage'));
const ListingFormPage = lazy(() => import('./pages/farmer/ListingFormPage'));
const FarmerOrdersPage = lazy(() => import('./pages/farmer/FarmerOrdersPage'));
const FarmerPayoutsPage = lazy(() => import('./pages/farmer/FarmerPayoutsPage'));
const FarmerProfilePage = lazy(() => import('./pages/farmer/FarmerProfilePage'));
const OpsOverviewPage = lazy(() => import('./pages/ops/OpsOverviewPage'));
const OpsOrdersPage = lazy(() => import('./pages/ops/OpsOrdersPage'));
const OpsOrderDetailPage = lazy(() => import('./pages/ops/OpsOrderDetailPage'));
const OpsPayoutsPage = lazy(() => import('./pages/ops/OpsPayoutsPage'));
const OpsReturnsPage = lazy(() => import('./pages/ops/OpsReturnsPage'));
const OpsListingsPage = lazy(() => import('./pages/ops/OpsListingsPage'));
const OpsUsersPage = lazy(() => import('./pages/ops/OpsUsersPage'));
const OpsTicketsPage = lazy(() => import('./pages/ops/OpsTicketsPage'));
const OpsCallsPage = lazy(() => import('./pages/ops/OpsCallsPage'));
const OpsCallDetailPage = lazy(() => import('./pages/ops/OpsCallDetailPage'));
const OpsAuditPage = lazy(() => import('./pages/ops/OpsAuditPage'));

const L = ({ children }: { children: ReactNode }) => <Suspense fallback={<Spinner />}>{children}</Suspense>;
const customer = (el: ReactNode) => (
  <RequireRole roles={['CUSTOMER']}>
    <L>{el}</L>
  </RequireRole>
);
const farmer = (el: ReactNode) => (
  <RequireRole roles={['FARMER']}>
    <L>{el}</L>
  </RequireRole>
);

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="market" element={<MarketPage />} />
        <Route path="market/:id" element={<ListingDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route
          path="phone"
          element={
            <L>
              <PhonePage />
            </L>
          }
        />

        <Route path="cart" element={customer(<CartPage />)} />
        <Route path="checkout" element={customer(<CheckoutPage />)} />
        <Route path="orders" element={customer(<OrdersPage />)} />
        <Route path="orders/:id" element={customer(<OrderDetailPage />)} />
        <Route
          path="support"
          element={
            <RequireRole roles={['CUSTOMER', 'FARMER']}>
              <L>
                <SupportPage />
              </L>
            </RequireRole>
          }
        />
        <Route
          path="account"
          element={
            <RequireRole roles={['CUSTOMER', 'FARMER', 'SUPPORT', 'OPERATIONS', 'ADMIN']}>
              <L>
                <AccountPage />
              </L>
            </RequireRole>
          }
        />

        <Route path="farmer" element={farmer(<FarmerOverviewPage />)} />
        <Route path="farmer/listings" element={farmer(<FarmerListingsPage />)} />
        <Route path="farmer/listings/new" element={farmer(<ListingFormPage />)} />
        <Route path="farmer/listings/:id/edit" element={farmer(<ListingFormPage />)} />
        <Route path="farmer/orders" element={farmer(<FarmerOrdersPage />)} />
        <Route path="farmer/payouts" element={farmer(<FarmerPayoutsPage />)} />
        <Route path="farmer/profile" element={farmer(<FarmerProfilePage />)} />

        <Route
          path="ops"
          element={
            <RequireRole roles={['SUPPORT', 'OPERATIONS', 'ADMIN']}>
              <StaffLayout />
            </RequireRole>
          }
        >
          <Route
            index
            element={
              <L>
                <OpsOverviewPage />
              </L>
            }
          />
          <Route
            path="orders"
            element={
              <L>
                <OpsOrdersPage />
              </L>
            }
          />
          <Route
            path="orders/:id"
            element={
              <L>
                <OpsOrderDetailPage />
              </L>
            }
          />
          <Route
            path="payouts"
            element={
              <L>
                <OpsPayoutsPage />
              </L>
            }
          />
          <Route
            path="returns"
            element={
              <L>
                <OpsReturnsPage />
              </L>
            }
          />
          <Route
            path="listings"
            element={
              <L>
                <OpsListingsPage />
              </L>
            }
          />
          <Route
            path="users"
            element={
              <L>
                <OpsUsersPage />
              </L>
            }
          />
          <Route
            path="tickets"
            element={
              <L>
                <OpsTicketsPage />
              </L>
            }
          />
          <Route
            path="calls"
            element={
              <L>
                <OpsCallsPage />
              </L>
            }
          />
          <Route
            path="calls/:callId"
            element={
              <L>
                <OpsCallDetailPage />
              </L>
            }
          />
          <Route
            path="audit"
            element={
              <L>
                <OpsAuditPage />
              </L>
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
