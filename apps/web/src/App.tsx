import { useEffect } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { canModule } from "./lib/access";
import { PageTitleProvider } from "./lib/page-title";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { OrderNew } from "./pages/OrderNew";
import { OrderDetail } from "./pages/OrderDetail";
import { Customers } from "./pages/Customers";
import { Approvals } from "./pages/Approvals";
import { Finance } from "./pages/Finance";
import { Sales } from "./pages/Sales";
import { Audit } from "./pages/Audit";
import { Reports } from "./pages/Reports";
import { Dispatch } from "./pages/Dispatch";
import { Vendors } from "./pages/Vendors";
import { OrderPrint } from "./pages/OrderPrint";
import { Procurement } from "./pages/Procurement";
import { PurchaseNew } from "./pages/PurchaseNew";
import { PurchaseDetail } from "./pages/PurchaseDetail";
import { Settings } from "./pages/Settings";
import { HR } from "./pages/HR";

function Guard({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="grid h-screen place-items-center text-stone-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function OrderRedirect() {
  const { id } = useParams();
  return <Navigate to={`/sales/${id}`} replace />;
}

function PrintRedirect() {
  const { id, kind } = useParams();
  return <Navigate to={`/sales/${id}/print/${kind}`} replace />;
}

function ModuleRoute({ module: mod, children }: { module: string | string[]; children: React.ReactNode }) {
  const { user } = useAuth();
  const allowed = (Array.isArray(mod) ? mod : [mod]).some((m) => canModule(user, m));
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const hydrate = useAuth((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Guard>
            <PageTitleProvider>
              <Layout />
            </PageTitleProvider>
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={<ModuleRoute module="inventory"><Inventory /></ModuleRoute>} />
        <Route path="procurement" element={<ModuleRoute module="procurement"><Procurement /></ModuleRoute>} />
        <Route path="procurement/new" element={<ModuleRoute module="procurement"><PurchaseNew /></ModuleRoute>} />
        <Route path="procurement/:id" element={<ModuleRoute module="procurement"><PurchaseDetail /></ModuleRoute>} />
        <Route path="sales" element={<ModuleRoute module="sales"><Sales /></ModuleRoute>} />
        <Route path="sales/new" element={<ModuleRoute module="sales"><OrderNew /></ModuleRoute>} />
        <Route path="sales/:id" element={<ModuleRoute module={["sales", "dispatch"]}><OrderDetail /></ModuleRoute>} />
        <Route path="orders" element={<Navigate to="/sales" replace />} />
        <Route path="orders/new" element={<Navigate to="/sales/new" replace />} />
        <Route path="orders/:id" element={<OrderRedirect />} />
        <Route path="customers" element={<ModuleRoute module="customers"><Customers /></ModuleRoute>} />
        <Route path="approvals" element={<ModuleRoute module="approvals"><Approvals /></ModuleRoute>} />
        <Route path="finance" element={<ModuleRoute module="finance"><Finance /></ModuleRoute>} />
        <Route path="audit" element={<ModuleRoute module="audit"><Audit /></ModuleRoute>} />
        <Route path="reports" element={<ModuleRoute module="reports"><Reports /></ModuleRoute>} />
        <Route path="dispatch" element={<ModuleRoute module="dispatch"><Dispatch /></ModuleRoute>} />
        <Route path="vendors" element={<ModuleRoute module="vendors"><Vendors /></ModuleRoute>} />
        <Route path="staff" element={<Navigate to="/hr" replace />} />
        <Route path="hr" element={<HR />} />
        <Route path="payroll" element={<Navigate to="/hr" replace />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<Navigate to="/settings" replace />} />
        <Route path="more" element={<Navigate to="/settings" replace />} />
      </Route>
      <Route
        path="/sales/:id/print/:kind"
        element={
          <Guard>
            <OrderPrint />
          </Guard>
        }
      />
      <Route
        path="/orders/:id/print/:kind"
        element={
          <Guard>
            <PrintRedirect />
          </Guard>
        }
      />
    </Routes>
  );
}
