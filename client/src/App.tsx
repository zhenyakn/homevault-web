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
import Settings from "./pages/Settings";
import { Home, Loader2, LogIn, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Sign-in page ─────────────────────────────────────────────────────────────

function SignInPage() {
  const oauthUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const isConfigured = Boolean(oauthUrl && appId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo card */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 mb-4 shadow-lg">
            <Home className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">HomeVault</h1>
          <p className="text-muted-foreground mt-2">
            Your property, fully managed
          </p>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border p-8 space-y-6">
          {isConfigured ? (
            <>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-semibold">Welcome back</h2>
                <p className="text-sm text-muted-foreground">
                  Sign in to access your property dashboard
                </p>
              </div>
              <Button
                className="w-full h-11 text-base"
                onClick={() => { window.location.href = getLoginUrl(); }}
              >
                <LogIn className="w-4 h-4 mr-2" />
                Sign in
              </Button>
            </>
          ) : import.meta.env.DEV ? (
            // Dev mode — OAuth not configured, offer a one-click local login
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-semibold">Local Development</h2>
                <p className="text-sm text-muted-foreground">
                  Sign in with the built-in dev account
                </p>
              </div>
              <Button
                className="w-full h-11 text-base"
                onClick={async () => {
                  await fetch("/api/dev/login", { method: "POST" });
                  window.location.reload();
                }}
              >
                <LogIn className="w-4 h-4 mr-2" />
                Dev Login
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Only available in development mode
              </p>
            </div>
          ) : (
            // OAuth not configured — show setup instructions
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Authentication not configured
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Add the following to your <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">.env</code> file:
                  </p>
                </div>
              </div>
              <pre className="text-xs bg-muted rounded-lg p-4 overflow-x-auto font-mono">
{`VITE_OAUTH_PORTAL_URL=https://your-oauth-server
VITE_APP_ID=your-app-id
OAUTH_SERVER_URL=https://your-oauth-server
OWNER_OPEN_ID=your-open-id`}
              </pre>
              <p className="text-xs text-muted-foreground text-center">
                <a
                  href="https://github.com/zhenyakn/homevault-web#quick-start"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  See setup guide
                </a>
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          HomeVault — private property management
        </p>
      </div>
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

function Router() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <SignInPage />;
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
        <Route path="/settings" component={Settings} />
        <Route path="/settings/:section" component={Settings} />
        <Route path="/property-settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
