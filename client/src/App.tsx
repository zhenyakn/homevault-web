import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./_core/hooks/useAuth";
import DashboardLayout from "./components/DashboardLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import Calendar from "./pages/Calendar";
import Dashboard from "./pages/Dashboard";
import Expenses from "./pages/Expenses";
import Inventory from "./pages/Inventory";
import Loans from "./pages/Loans";
import Login from "./pages/Login";
import MockLogin from "./pages/MockLogin";
import PropertyDashboard from "./pages/PropertyDashboard";
import PurchaseCosts from "./pages/PurchaseCosts";
import Repairs from "./pages/Repairs";
import Settings from "./pages/Settings";
import Upgrades from "./pages/Upgrades";
import Wishlist from "./pages/Wishlist";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AppRoutes() {
  const { user, loading } = useAuth();
  const isMockMode = import.meta.env.VITE_MOCK_MODE === "true";

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Auth */}
      <Route path="/login" element={<Login />} />
      {isMockMode && <Route path="/mock-login" element={<MockLogin />} />}

      {/* App */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="property" element={<PropertyDashboard />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="loans" element={<Loans />} />
        <Route path="purchase-costs" element={<PurchaseCosts />} />
        <Route path="repairs" element={<Repairs />} />
        <Route path="upgrades" element={<Upgrades />} />
        <Route path="wishlist" element={<Wishlist />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster richColors position="top-right" />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
