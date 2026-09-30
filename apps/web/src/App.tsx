import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { Orders } from "./pages/Orders";
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
import { Staff } from "./pages/Staff";
import { OrderPrint } from "./pages/OrderPrint";

function Guard({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="grid h-screen place-items-center text-stone-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
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
            <Layout />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/new" element={<OrderNew />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="customers" element={<Customers />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="finance" element={<Finance />} />
        <Route path="sales" element={<Sales />} />
        <Route path="audit" element={<Audit />} />
        <Route path="reports" element={<Reports />} />
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="staff" element={<Staff />} />
      </Route>
      <Route
        path="/orders/:id/print/:kind"
        element={
          <Guard>
            <OrderPrint />
          </Guard>
        }
      />
    </Routes>
  );
}
