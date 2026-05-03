import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Router, Switch } from "wouter";
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

const isMockMode = import.meta.env.VITE_MOCK_MODE === "true";

function AppRoutes() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <Switch>
      {/* Auth */}
      <Route path="/login" component={Login} />
      {isMockMode && <Route path="/mock-login" component={MockLogin} />}

      {/* Protected app routes */}
      <Route path="/:rest*">
        <ProtectedRoute>
          <DashboardLayout>
            <Switch>
              <Route path="/" component={() => { window.location.replace("/dashboard"); return null; }} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/property" component={PropertyDashboard} />
              <Route path="/expenses" component={Expenses} />
              <Route path="/loans" component={Loans} />
              <Route path="/purchase-costs" component={PurchaseCosts} />
              <Route path="/repairs" component={Repairs} />
              <Route path="/upgrades" component={Upgrades} />
              <Route path="/wishlist" component={Wishlist} />
              <Route path="/calendar" component={Calendar} />
              <Route path="/inventory" component={Inventory} />
              <Route path="/settings" component={Settings} />
              <Route component={() => { window.location.replace("/dashboard"); return null; }} />
            </Switch>
          </DashboardLayout>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <Router>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </Router>
    </TooltipProvider>
  );
}
