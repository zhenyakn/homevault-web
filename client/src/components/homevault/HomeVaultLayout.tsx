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
import { HVChromeProvider } from "@/components/homevault/HVChrome";
import { HomeFileCompleteness } from "@/components/homevault/HomeFileCompleteness";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";

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
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

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
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const { data: profiles } = trpc.profiles.list.useQuery();
  const { data: properties } = trpc.property.list.useQuery();
  const hasMultipleProperties = (properties?.length ?? 0) > 1;

  const handleSearchOpen = () => {
    onSearchOpen?.();
  };

  // Build nav groups, inserting Portfolio into Overview when needed
  const navGroups: NavGroup[] = NAV_GROUPS.map(g => {
    if (g.labelKey !== "nav.group.overview") return g;
    const items = hasMultipleProperties
      ? [
          ...g.items,
          { icon: LayoutGrid, key: "nav.portfolio", path: "/portfolio" },
        ]
      : g.items;
    return { ...g, items };
  });

  // Breadcrumb lookup
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

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const rect = sidebarRef.current?.getBoundingClientRect();
      if (!rect) return;
      const newWidth = isRTL ? rect.right - e.clientX : e.clientX - rect.left;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH)
        setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth, isRTL]);

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
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          side={isRTL ? "right" : "left"}
          className={isRTL ? "border-l" : "border-r"}
          disableTransition={isResizing}
        >
          {/* ── Header: brand ─────────────────────────────────────────── */}
          <SidebarHeader className="h-[60px] justify-center px-3">
            <div className="flex w-full items-center gap-2.5">
              <div
                className="h-[34px] w-[34px] shrink-0 rounded-[12px]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--hv-accent), #7fb093)",
                }}
              />
              {!isCollapsed && (
                <>
                  <span className="flex-1 truncate text-[18px] font-extrabold tracking-[-0.02em] text-white">
                    HomeVault
                  </span>
                  <button
                    onClick={toggleSidebar}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/10 focus:outline-none"
                    aria-label="Collapse sidebar"
                  >
                    {isRTL ? (
                      <PanelRight className="h-3.5 w-3.5 text-white/50" />
                    ) : (
                      <PanelLeft className="h-3.5 w-3.5 text-white/50" />
                    )}
                  </button>
                </>
              )}
            </div>
          </SidebarHeader>

          {/* ── Nav (flat) ───────────────────────────────────────────── */}
          <SidebarContent className="gap-0 px-3 pt-3">
            {navGroups.map((group, gi) => (
              <div key={group.labelKey}>
                {gi > 0 && !isCollapsed && (
                  <div className="mx-1 my-2.5 border-t border-white/8" />
                )}
                <SidebarMenu className="gap-1.5">
                  {group.items.map(item => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive(item.path)}
                        onClick={() => setLocation(item.path)}
                        tooltip={t(item.key)}
                        className="h-11 rounded-[16px] px-3.5 text-[14px] font-medium text-[#d6ddd6] hover:bg-white/8 hover:text-white data-[active=true]:bg-[#fffdf8] data-[active=true]:font-[750] data-[active=true]:text-[#214e3d] data-[active=true]:hover:bg-[#fffdf8] data-[active=true]:hover:text-[#214e3d]"
                      >
                        <item.icon className="h-[18px] w-[18px]" />
                        <span>{t(item.key)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </div>
            ))}

            {/* Household members (multi-user) */}
            {!isCollapsed && profiles && profiles.length > 1 && (
              <div className="px-4 pt-4 pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-2">
                  {t("common.household")}
                </p>
                <div className="space-y-1">
                  {profiles.map((profile: any, index: number) => (
                    <div
                      key={profile.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${
                        profile.id === user?.id
                          ? "bg-white/10 text-white"
                          : "text-white/60"
                      }`}
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarFallback
                          className={`text-[10px] text-white ${getAvatarColor(index)}`}
                        >
                          {getInitials(profile.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">
                        {profile.name || "Unknown"}
                      </span>
                      {profile.id === user?.id && (
                        <Check className="h-3 w-3 ml-auto shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SidebarContent>

          {/* ── Footer: home file + theme + user ──────────────────────── */}
          <SidebarFooter className="p-3">
            {/* TODO: replace placeholder completeness with real document-coverage
                data once the documents backend lands. */}
            {!isCollapsed && (
              <HomeFileCompleteness
                compact
                percentage={72}
                onClick={() => setLocation("/documents")}
                className="mb-1"
              />
            )}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center gap-3 rounded-xl px-1 py-1 hover:bg-white/5 transition-colors w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isCollapsed ? "justify-center" : "text-start"}`}
                >
                  <Avatar className="h-9 w-9 border border-white/10 shrink-0">
                    <AvatarFallback className="bg-white/10 text-xs font-medium text-white">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-white">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-white/45 truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {profiles && profiles.length > 1 && (
                  <>
                    <div className="px-2 py-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("common.household")}
                      </p>
                    </div>
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

        {/* Resize handle */}
        <div
          className={`absolute top-0 ${isRTL ? "left-0" : "right-0"} w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (!isCollapsed) setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
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

        {/* Desktop: search / property / add live in each page header (HVPageHeader),
            on the same row as the title — matching the concept's `.top`. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-5 pb-24 md:px-9 md:pb-9 md:pt-7 outline-none"
        >
          <HVChromeProvider openSearch={handleSearchOpen}>
            {children}
          </HVChromeProvider>
        </main>
        {isMobile && <MobileTabBar />}
      </SidebarInset>
    </>
  );
}
