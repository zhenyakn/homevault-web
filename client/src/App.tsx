import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { getLoginUrl } from "./const";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Expenses from "./pages/Expenses";
import Repairs from "./pages/Repairs";
import Upgrades from "./pages/Upgrades";
import Loans from "./pages/Loans";
import Wishlist from "./pages/Wishlist";
import PurchaseCosts from "./pages/PurchaseCosts";
import Calendar from "./pages/Calendar";
import PropertySettings from "./pages/PropertySettings";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  return <Component />;
}

function Router() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Welcome to HomeVault</h1>
          <a href={getLoginUrl()} className="text-blue-600 hover:underline">
            Sign in to continue
          </a>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/repairs" component={Repairs} />
        <Route path="/upgrades" component={Upgrades} />
        <Route path="/loans" component={Loans} />
        <Route path="/wishlist" component={Wishlist} />
        <Route path="/purchase-costs" component={PurchaseCosts} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/settings" component={PropertySettings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
