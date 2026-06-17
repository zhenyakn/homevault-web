import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import {
  HomeVaultUIProvider,
  useHomeVaultUI,
} from "./contexts/HomeVaultUIContext";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";
import {
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
  AcceptInvitePage,
} from "./pages/Auth";
import DashboardLayout from "./components/DashboardLayout";
import HomeVaultLayout from "./components/homevault/HomeVaultLayout";
import Dashboard from "./pages/Dashboard";
import Today from "./pages/homevault/Today";
import Expenses from "./pages/Expenses";
import HVExpenses from "./pages/homevault/Expenses";
import Repairs from "./pages/Repairs";
import HVRepairs from "./pages/homevault/Repairs";
import HVProjects from "./pages/homevault/Projects";
import HVCalendar from "./pages/homevault/Calendar";
import Documents from "./pages/Documents";
import Upgrades from "./pages/Upgrades";
import Loans from "./pages/Loans";
import Wishlist from "./pages/Wishlist";
import PurchaseCosts from "./pages/PurchaseCosts";
import Calendar from "./pages/Calendar";
import Inventory from "./pages/Inventory";
import Settings from "./pages/Settings";
import Members from "./pages/Members";
import Portfolio from "./pages/Portfolio";
import UpgradeDetail from "./pages/UpgradeDetail";
import RepairDetail from "./pages/RepairDetail";
import ApartmentSearch from "./pages/ApartmentSearch";
import ApartmentSearchDetail from "./pages/ApartmentSearchDetail";
import ApartmentCandidateDetail from "./pages/ApartmentCandidateDetail";
import { Loader2 } from "lucide-react";
import { SearchModal } from "./components/SearchModal";
import { useSearch } from "./hooks/useSearch";

// ─── Auth routes (signed-out) ──────────────────────────────────────────────────

// Login / register / password-reset / email-verify / accept-invite live here;
// the default falls through to the email-password sign-in screen.
function SignedOutRoutes() {
  return (
    <Switch>
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/accept-invite" component={AcceptInvitePage} />
      <Route path="/login" component={LoginPage} />
      <Route component={LoginPage} />
    </Switch>
  );
}

// Accept an invite while already signed in: redeem the token, switch to the
// joined tenant, and return to the app.
function AuthedAcceptInvite() {
  const accept = trpc.tenant.invites.accept.useMutation({
    onSuccess: res => {
      if (res.tenantId) {
        localStorage.setItem("hv_active_tenant_id", String(res.tenantId));
      }
      window.location.hash = "#/";
      window.location.reload();
    },
  });
  useEffect(() => {
    const hash = window.location.hash;
    const q = hash.indexOf("?");
    const token =
      q === -1 ? null : new URLSearchParams(hash.slice(q + 1)).get("token");
    if (token) accept.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {accept.isError
          ? "This invitation is invalid or has expired."
          : "Joining workspace…"}
      </p>
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
    </div>
  );
}

// ─── Router ──────────────────────────────────────────────────────────────────

function AppRouter() {
  const { isAuthenticated, loading } = useAuth();
  const { enabled: hvUi } = useHomeVaultUI();
  const search = useSearch();

  const { data: noAuthData } = trpc.system.noAuth.useQuery(undefined, {
    retry: 1,
    retryDelay: 300,
    refetchOnWindowFocus: false,
  });

  if (loading) {
    return <Spinner />;
  }

  if (isAuthenticated) {
    // Opt-in HomeVault personal-premium UI. Defaults to the original design.
    const Layout = hvUi ? HomeVaultLayout : DashboardLayout;
    const HomePage = hvUi ? Today : Dashboard;
    const ExpensesPage = hvUi ? HVExpenses : Expenses;
    const RepairsPage = hvUi ? HVRepairs : Repairs;
    const ProjectsPage = hvUi ? HVProjects : Upgrades;
    const CalendarPage = hvUi ? HVCalendar : Calendar;

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
        <Layout onSearchOpen={() => search.setOpen(true)}>
          <Switch>
            <Route path="/" component={HomePage} />
            {/* Per-property dashboard + legacy property settings folded into
                the Portfolio page. */}
            <Route path="/property">
              <Redirect to="/portfolio" />
            </Route>
            <Route path="/expenses" component={ExpensesPage} />
            <Route path="/repairs" component={RepairsPage} />
            <Route path="/repairs/:id" component={RepairDetail} />
            <Route path="/documents" component={Documents} />
            <Route path="/upgrades" component={ProjectsPage} />
            <Route path="/upgrades/:id" component={UpgradeDetail} />
            <Route path="/loans" component={Loans} />
            <Route path="/wishlist" component={Wishlist} />
            <Route path="/purchase-costs" component={PurchaseCosts} />
            <Route path="/inventory" component={Inventory} />
            <Route
              path="/apartment-search/:searchId/candidate/:id"
              component={ApartmentCandidateDetail}
            />
            <Route
              path="/apartment-search/:searchId"
              component={ApartmentSearchDetail}
            />
            <Route path="/apartment-search" component={ApartmentSearch} />
            <Route path="/calendar" component={CalendarPage} />
            <Route path="/portfolio" component={Portfolio} />
            <Route path="/accept-invite" component={AuthedAcceptInvite} />
            <Route path="/verify-email" component={VerifyEmailPage} />
            <Route path="/members" component={Members} />
            <Route path="/settings" component={Settings} />
            <Route path="/settings/:section" component={Settings} />
            <Route path="/property-settings">
              <Redirect to="/portfolio" />
            </Route>
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </>
    );
  }

  if (noAuthData?.noAuth === true) {
    return <Spinner />;
  }

  return <SignedOutRoutes />;
}

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system">
        <LanguageProvider>
          <HomeVaultUIProvider>
            <TooltipProvider>
              <Toaster />
              <WouterRouter hook={useHashLocation}>
                <AppRouter />
              </WouterRouter>
            </TooltipProvider>
          </HomeVaultUIProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
