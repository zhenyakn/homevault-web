import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";
import { getLoginUrl } from "./const";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Timeline from "./pages/Timeline";
import Expenses from "./pages/Expenses";
import Repairs from "./pages/Repairs";
import Upgrades from "./pages/Upgrades";
import Loans from "./pages/Loans";
import Wishlist from "./pages/Wishlist";
import PurchaseCosts from "./pages/PurchaseCosts";
import Calendar from "./pages/Calendar";
import Documents from "./pages/Documents";
import SecurityBackups from "./pages/SecurityBackups";
import PropertySettings from "./pages/PropertySettings";
import Settings from "./pages/Settings";
import Portfolio from "./pages/Portfolio";
import UpgradeDetail from "./pages/UpgradeDetail";
import RepairDetail from "./pages/RepairDetail";
import { Home, Loader2, LogIn, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchModal } from "./components/SearchModal";
import { useSearch } from "./hooks/useSearch";

function SignInPage() {
  const oauthUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const isConfigured = Boolean(oauthUrl && appId);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/30">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 shadow-lg shadow-blue-600/20">
            <Home className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">HomeVault</h1>
          <p className="mt-2 text-muted-foreground">Private property management and document vault</p>
        </div>

        <div className="space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
          {isConfigured ? (
            <>
              <div className="space-y-1 text-center">
                <h2 className="text-xl font-semibold">Welcome back</h2>
                <p className="text-sm text-muted-foreground">
                  Sign in to access your property dashboard
                </p>
              </div>
              <Button
                className="h-11 w-full text-base"
                onClick={() => { window.location.href = getLoginUrl(); }}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Sign in
              </Button>
            </>
          ) : import.meta.env.DEV ? (
            <div className="space-y-4">
              <div className="space-y-1 text-center">
                <h2 className="text-xl font-semibold">Local Development</h2>
                <p className="text-sm text-muted-foreground">
                  Sign in with the built-in dev account
                </p>
              </div>
              <Button
                className="h-11 w-full text-base"
                onClick={async () => {
                  await fetch("api/dev/login", { method: "POST" });
                  window.location.reload();
                }}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Dev Login
              </Button>
              <p className="text-center text-xs text-muted-foreground">Only available in development mode</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Authentication not configured
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Add OAuth variables to your{" "}
                    <code className="rounded bg-amber-100 px-1 font-mono dark:bg-amber-900/50">.env</code>{" "}
                    file.
                  </p>
                </div>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs">
{`VITE_OAUTH_PORTAL_URL=https://your-oauth-server
VITE_APP_ID=your-app-id
OAUTH_SERVER_URL=https://your-oauth-server
OWNER_OPEN_ID=your-open-id`}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function AppRouter() {
  const { isAuthenticated, loading } = useAuth();
  const search = useSearch();

  const { data: noAuthData } = trpc.system.noAuth.useQuery(undefined, {
    retry: 1,
    retryDelay: 300,
    refetchOnWindowFocus: false,
  });

  if (loading) return <Spinner />;

  if (isAuthenticated) {
    return (
      <>
        <SearchModal
          open={search.open}
          onClose={search.close}
          query={search.query}
          onQueryChange={search.setQuery}
          results={search.results}
          isFetching={search.isFetching}
        />
        <DashboardLayout onSearchOpen={() => search.setOpen(true)}>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/timeline" component={Timeline} />
            <Route path="/expenses" component={Expenses} />
            <Route path="/repairs" component={Repairs} />
            <Route path="/repairs/:id" component={RepairDetail} />
            <Route path="/upgrades" component={Upgrades} />
            <Route path="/upgrades/:id" component={UpgradeDetail} />
            <Route path="/loans" component={Loans} />
            <Route path="/wishlist" component={Wishlist} />
            <Route path="/purchase-costs" component={PurchaseCosts} />
            <Route path="/calendar" component={Calendar} />
            <Route path="/documents" component={Documents} />
            <Route path="/backups" component={SecurityBackups} />
            <Route path="/security" component={SecurityBackups} />
            <Route path="/portfolio" component={Portfolio} />
            <Route path="/settings" component={Settings} />
            <Route path="/settings/:section" component={Settings} />
            <Route path="/property-settings" component={PropertySettings} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </DashboardLayout>
      </>
    );
  }

  if (noAuthData?.noAuth === true) return <Spinner />;

  return <SignInPage />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system">
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <WouterRouter hook={useHashLocation}>
              <AppRouter />
            </WouterRouter>
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
