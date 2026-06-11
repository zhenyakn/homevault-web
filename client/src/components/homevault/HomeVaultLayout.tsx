import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import NotificationCenter from "@/components/NotificationCenter";
import MobileTabBar from "@/components/homevault/HomeVaultMobileNav";
import AddPropertyDialog from "@/components/AddPropertyDialog";
import { useProperty } from "@/contexts/PropertyContext";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "react-i18next";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  DollarSign,
  FileText,
  Heart,
  Home,
  LayoutGrid,
  LogOut,
  Monitor,
  Moon,
  Package,
  PanelLeft,
  PanelRight,
  Plus,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { QuickAddMenu } from "@/components/homevault/QuickAddMenu";
import {
  HVChromeProvider,
  HVTopActions,
} from "@/components/homevault/HVChrome";

// Routes whose page renders its own HVPageHeader (which already includes the
// global action cluster). Every other route gets the cluster from the layout.
const HV_HEADER_ROUTES = [
  "/",
  "/expenses",
  "/repairs",
  "/upgrades",
  "/calendar",
  "/documents",
  "/loans",
  "/portfolio",
  "/purchase-costs",
  "/inventory",
  "/wishlist",
];
import { HomeFileCompleteness } from "@/components/homevault/HomeFileCompleteness";
import {
  CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";
import { cn } from "@/lib/utils";

type LucideIcon = React.ComponentType<
  React.SVGProps<SVGSVGElement> & { className?: string }
>;
type NavItem = { icon: LucideIcon; key: string; path: string };
type NavGroup = { labelKey: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.group.overview",
    items: [
      { icon: Home, key: "nav.today", path: "/" },
      { icon: Calendar, key: "nav.calendar", path: "/calendar" },
    ],
  },
  {
    labelKey: "nav.group.finances",
    items: [
      { icon: Receipt, key: "nav.expenses", path: "/expenses" },
      { icon: DollarSign, key: "nav.loans", path: "/loans" },
      { icon: ShoppingCart, key: "nav.purchaseCosts", path: "/purchase-costs" },
    ],
  },
  {
    labelKey: "nav.group.property",
    items: [
      { icon: Wrench, key: "nav.repairs", path: "/repairs" },
      { icon: TrendingUp, key: "nav.projects", path: "/upgrades" },
      { icon: FileText, key: "nav.documents", path: "/documents" },
      { icon: Package, key: "nav.inventory", path: "/inventory" },
      { icon: Heart, key: "nav.wishlist", path: "/wishlist" },
    ],
  },
  {
    labelKey: "nav.group.account",
    items: [{ icon: Settings, key: "nav.settings", path: "/settings" }],
  },
];

// Page → (section label key, page label key) for breadcrumb
const PAGE_META: Record<string, { sectionKey: string; pageKey: string }> = {
  "/": { sectionKey: "nav.group.overview", pageKey: "nav.today" },
  "/calendar": { sectionKey: "nav.group.overview", pageKey: "nav.calendar" },
  "/portfolio": { sectionKey: "nav.group.overview", pageKey: "nav.portfolio" },
  "/expenses": { sectionKey: "nav.group.finances", pageKey: "nav.expenses" },
  "/loans": { sectionKey: "nav.group.finances", pageKey: "nav.loans" },
  "/purchase-costs": {
    sectionKey: "nav.group.finances",
    pageKey: "nav.purchaseCosts",
  },
  "/repairs": { sectionKey: "nav.group.property", pageKey: "nav.repairs" },
  "/upgrades": { sectionKey: "nav.group.property", pageKey: "nav.projects" },
  "/documents": { sectionKey: "nav.group.property", pageKey: "nav.documents" },
  "/inventory": { sectionKey: "nav.group.property", pageKey: "nav.inventory" },
  "/wishlist": { sectionKey: "nav.group.property", pageKey: "nav.wishlist" },
  "/settings": { sectionKey: "nav.group.account", pageKey: "nav.settings" },
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

// Flat navigation for the HomeVault sidebar — the concept uses a single calm
// list (no admin-style section groups). Primary items lead, Settings trails.
type HVNavItem = { key: string; path: string };
const HV_NAV: HVNavItem[] = [
  { key: "nav.today", path: "/" },
  { key: "nav.expenses", path: "/expenses" },
  { key: "nav.repairs", path: "/repairs" },
  { key: "nav.projects", path: "/upgrades" },
  { key: "nav.documents", path: "/documents" },
  { key: "nav.calendar", path: "/calendar" },
  { key: "nav.loans", path: "/loans" },
  { key: "nav.purchaseCosts", path: "/purchase-costs" },
  { key: "nav.inventory", path: "/inventory" },
  { key: "nav.wishlist", path: "/wishlist" },
];

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-red-500",
];

function getAvatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Property Switcher ─────────────────────────────────────────────────────────

function PropertySwitcher({ isCollapsed }: { isCollapsed: boolean }) {
  const { t } = useTranslation();
  const { activePropertyId, switchProperty } = useProperty();
  const { data: properties } = trpc.property.list.useQuery();

  const [showAdd, setShowAdd] = useState(false);

  const activeProperty =
    properties?.find(p => p.id === activePropertyId) ?? properties?.[0];

  if (isCollapsed) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary mx-auto">
        <Home className="h-4 w-4 text-primary-foreground" />
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 w-full px-1 py-1 rounded-md hover:bg-sidebar-accent transition-colors focus:outline-none text-left">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate leading-tight text-white">
                {activeProperty?.houseName ?? "My Home"}
              </p>
              {activeProperty?.address && (
                <p className="text-[11px] text-white/50 truncate leading-tight">
                  {activeProperty.address}
                </p>
              )}
            </div>
            <ChevronDown className="h-3 w-3 text-white/50 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {properties?.map(p => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => p.id !== activePropertyId && switchProperty(p.id)}
              className="cursor-pointer"
            >
              <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center mr-2 shrink-0">
                <Home className="h-3 w-3 text-primary" />
              </div>
              <span className="flex-1 truncate">{p.houseName}</span>
              {p.id === activePropertyId && (
                <Check className="h-3.5 w-3.5 ml-2 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowAdd(true)}
            className="cursor-pointer"
          >
            <Plus className="h-4 w-4 me-2" />
            {t("common.addProperty")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddPropertyDialog open={showAdd} onOpenChange={setShowAdd} />
    </>
  );
}

function ThemeToggle({ compact }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const options = [
    { value: "light" as const, icon: Sun, label: "Light" },
    { value: "dark" as const, icon: Moon, label: "Dark" },
    { value: "system" as const, icon: Monitor, label: "System" },
  ];

  if (compact || isCollapsed) {
    const current = options.find(o => o.value === theme) ?? options[0];
    const next = options[(options.indexOf(current) + 1) % options.length];
    return (
      <button
        onClick={() => setTheme(next.value)}
        title={`Theme: ${current.label}`}
        className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent transition-colors"
      >
        <current.icon className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1 mb-1">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          className={`flex-1 flex items-center justify-center rounded-lg p-1.5 transition-colors text-xs gap-1 ${
            theme === value
              ? "bg-white/15 text-white"
              : "text-white/55 hover:text-white hover:bg-white/5"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function HomeVaultLayout({
  children,
  onSearchOpen,
}: {
  children: React.ReactNode;
  onSearchOpen?: () => void;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            Sign in to continue
          </h1>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent
        setSidebarWidth={setSidebarWidth}
        onSearchOpen={onSearchOpen}
      >
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
  onSearchOpen,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
  onSearchOpen?: () => void;
}) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { isRTL } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const { data: profiles } = trpc.profiles.list.useQuery();
  const { data: properties } = trpc.property.list.useQuery();
  const { data: docSummary } = trpc.documents.summary.useQuery();
  const hasMultipleProperties = (properties?.length ?? 0) > 1;

  // Flat nav with Portfolio surfaced only when there's more than one property.
  const navItems: HVNavItem[] = hasMultipleProperties
    ? [
        ...HV_NAV,
        { key: "nav.portfolio", path: "/portfolio" },
        { key: "nav.settings", path: "/settings" },
      ]
    : [...HV_NAV, { key: "nav.settings", path: "/settings" }];

  const handleSearchOpen = () => {
    onSearchOpen?.();
  };

  // Active-page lookup (used by the mobile topbar label).
  const pathKey =
    Object.keys(PAGE_META).find(p =>
      p === "/"
        ? location === "/"
        : location === p || location.startsWith(p + "/")
    ) ?? "/";
  const pageMeta = PAGE_META[pathKey];

  const isActive = (path: string) =>
    path === "/"
      ? location === "/"
      : location === path || location.startsWith(path + "/");

  // Scroll affordance: when the nav list overflows and isn't scrolled to the
  // bottom, fade its lower edge so it's obvious there are more items below
  // (the pinned footer otherwise hides that the list scrolls — most visible on
  // short mobile viewports). A callback ref wires up the ResizeObserver the
  // moment the nav mounts, which matters on mobile where the sidebar lives in
  // an offcanvas sheet that mounts after the layout's first render.
  const navElRef = useRef<HTMLDivElement | null>(null);
  const navObserverRef = useRef<ResizeObserver | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  const updateScrollHint = useCallback(() => {
    const el = navElRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollHint(remaining > 4);
  }, []);

  const navRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      navObserverRef.current?.disconnect();
      navElRef.current = el;
      if (!el) return;
      updateScrollHint();
      if (typeof ResizeObserver !== "undefined") {
        navObserverRef.current = new ResizeObserver(updateScrollHint);
        navObserverRef.current.observe(el);
      }
    },
    [updateScrollHint]
  );

  return (
    <>
      <a
        href="#main-content"
        onClick={e => {
          e.preventDefault();
          const el = document.getElementById("main-content");
          el?.scrollIntoView();
          el?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-primary"
      >
        {t("nav.skipToContent")}
      </a>
      <div className="relative">
        <Sidebar
          collapsible="offcanvas"
          side={isRTL ? "right" : "left"}
          className="border-0"
        >
          {/* ── Brand ─────────────────────────────────────────────────── */}
          <SidebarHeader className="px-[22px] pb-0 pt-7">
            <div className="mb-9 flex items-center gap-3">
              <div
                className="h-[38px] w-[38px] shrink-0 rounded-[13px]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--hv-accent), #7fb093)",
                }}
              />
              <span className="text-[22px] font-extrabold tracking-[-0.02em] text-white">
                HomeVault
              </span>
            </div>
          </SidebarHeader>

          {/* ── Nav (flat, calm — matches the concept) ────────────────── */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <SidebarContent
              ref={navRefCallback}
              onScroll={updateScrollHint}
              className="overflow-y-auto px-[22px] py-0"
            >
              <SidebarMenu className="gap-2">
                {navItems.map(item => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive(item.path)}
                      onClick={() => setLocation(item.path)}
                      className="h-auto rounded-[16px] px-[14px] py-[11px] text-[14px] font-normal text-[#d6ddd6] transition-colors hover:bg-white/[0.08] hover:text-white data-[active=true]:bg-[#FFFCF7] data-[active=true]:font-bold data-[active=true]:text-[#214E3D] data-[active=true]:shadow-none data-[active=true]:hover:bg-[#FFFCF7] data-[active=true]:hover:text-[#214E3D]"
                    >
                      <span>{t(item.key)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarContent>
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-sidebar to-transparent transition-opacity duration-200",
                showScrollHint ? "opacity-100" : "opacity-0"
              )}
            />
          </div>

          {/* ── Footer: home-file widget + compact account ────────────── */}
          <SidebarFooter className="px-[22px] pb-7 pt-4">
            <HomeFileCompleteness
              compact
              percentage={docSummary?.percentage ?? 0}
              onClick={() => setLocation("/documents")}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="mt-3 flex w-full items-center gap-2.5 rounded-[14px] px-1.5 py-1.5 text-start transition-colors hover:bg-white/[0.06] focus:outline-none">
                  <Avatar className="h-8 w-8 shrink-0 border border-white/10">
                    <AvatarFallback className="bg-white/10 text-[11px] font-medium text-white">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-none text-white">
                      {user?.name || "-"}
                    </p>
                    <p className="mt-1 truncate text-[11px] leading-none text-white/45">
                      {user?.email || "-"}
                    </p>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <div className="flex gap-1 p-1">
                  {(
                    [
                      { v: "light", Icon: Sun },
                      { v: "dark", Icon: Moon },
                      { v: "system", Icon: Monitor },
                    ] as const
                  ).map(({ v, Icon }) => (
                    <button
                      key={v}
                      onClick={() => setTheme(v)}
                      title={v}
                      className={`flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors ${
                        theme === v
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
                <DropdownMenuSeparator />
                {profiles && profiles.length > 1 && (
                  <>
                    {profiles.map((profile: any, index: number) => (
                      <DropdownMenuItem
                        key={profile.id}
                        className="cursor-pointer"
                      >
                        <Avatar className="h-5 w-5 mr-2">
                          <AvatarFallback
                            className={`text-[9px] text-white ${getAvatarColor(index)}`}
                          >
                            {getInitials(profile.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">
                          {profile.name || "Unknown"}
                        </span>
                        {profile.id === user?.id && (
                          <Check className="h-3 w-3 ml-auto" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="me-2 h-4 w-4" />
                  {t("common.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
      </div>

      <SidebarInset>
        {/* Mobile topbar */}
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <span className="tracking-tight text-foreground font-medium">
                {pageMeta ? t(pageMeta.pageKey) : "Menu"}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <QuickAddMenu>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-hv-primary text-white transition-colors hover:bg-hv-primary-dark"
                  aria-label={t("homevault.quickAdd")}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </QuickAddMenu>
              <NotificationCenter />
              <button
                type="button"
                onClick={handleSearchOpen}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent transition-colors"
                aria-label={t("search.dialogTitle")}
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Desktop: pages that use HVPageHeader render the search / property /
            add cluster inline with their title (concept `.top`). Pages that
            don't (detail/settings/etc.) get the same cluster from here so the
            chrome stays consistent. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-5 pb-24 md:px-9 md:pb-9 md:pt-7 outline-none"
        >
          <HVChromeProvider openSearch={handleSearchOpen}>
            {!isMobile && !HV_HEADER_ROUTES.includes(location) && (
              <div className="mb-6 flex justify-end">
                <HVTopActions />
              </div>
            )}
            {children}
          </HVChromeProvider>
        </main>
        {isMobile && <MobileTabBar />}
      </SidebarInset>
    </>
  );
}
