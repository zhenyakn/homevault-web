import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { SearchModal } from "./SearchModal";
import { useSearch } from "@/hooks/useSearch";

type LucideIcon = React.ComponentType<React.SVGProps<SVGSVGElement> & { className?: string }>;
type NavItem = { icon: LucideIcon; key: string; path: string };
type NavGroup = { labelKey: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.group.overview",
    items: [
      { icon: Home,    key: "nav.dashboard", path: "/" },
      { icon: Calendar, key: "nav.calendar", path: "/calendar" },
    ],
  },
  {
    labelKey: "nav.group.finances",
    items: [
      { icon: Receipt,      key: "nav.expenses",      path: "/expenses" },
      { icon: DollarSign,   key: "nav.loans",          path: "/loans" },
      { icon: ShoppingCart, key: "nav.purchaseCosts",  path: "/purchase-costs" },
    ],
  },
  {
    labelKey: "nav.group.property",
    items: [
      { icon: Wrench,     key: "nav.repairs",   path: "/repairs" },
      { icon: TrendingUp, key: "nav.upgrades",  path: "/upgrades" },
      { icon: Package,    key: "nav.inventory", path: "/inventory" },
      { icon: Heart,      key: "nav.wishlist",  path: "/wishlist" },
    ],
  },
  {
    labelKey: "nav.group.account",
    items: [
      { icon: Settings, key: "nav.settings", path: "/settings" },
    ],
  },
];

// Page → (section label key, page label key) for breadcrumb
const PAGE_META: Record<string, { sectionKey: string; pageKey: string }> = {
  "/":               { sectionKey: "nav.group.overview",  pageKey: "nav.dashboard"     },
  "/calendar":       { sectionKey: "nav.group.overview",  pageKey: "nav.calendar"      },
  "/portfolio":      { sectionKey: "nav.group.overview",  pageKey: "nav.portfolio"     },
  "/expenses":       { sectionKey: "nav.group.finances",  pageKey: "nav.expenses"      },
  "/loans":          { sectionKey: "nav.group.finances",  pageKey: "nav.loans"         },
  "/purchase-costs": { sectionKey: "nav.group.finances",  pageKey: "nav.purchaseCosts" },
  "/repairs":        { sectionKey: "nav.group.property",  pageKey: "nav.repairs"       },
  "/upgrades":       { sectionKey: "nav.group.property",  pageKey: "nav.upgrades"      },
  "/inventory":      { sectionKey: "nav.group.property",  pageKey: "nav.inventory"     },
  "/wishlist":       { sectionKey: "nav.group.property",  pageKey: "nav.wishlist"      },
  "/settings":       { sectionKey: "nav.group.account",   pageKey: "nav.settings"      },
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

const AVATAR_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500",
];

function getAvatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── Property Switcher ─────────────────────────────────────────────────────────

function PropertySwitcher({ isCollapsed }: { isCollapsed: boolean }) {
  const { t } = useTranslation();
  const { activePropertyId, switchProperty } = useProperty();
  const { data: properties } = trpc.property.list.useQuery();
  const utils = trpc.useUtils();
  const createMutation = trpc.property.create.useMutation({
    onSuccess: (data: any) => {
      utils.property.list.invalidate();
      if (data?.insertId) switchProperty(data.insertId);
    },
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const activeProperty = properties?.find(p => p.id === activePropertyId) ?? properties?.[0];

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await createMutation.mutateAsync({ houseName: newName.trim() });
    setNewName("");
    setShowAdd(false);
  };

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
              <p className="text-[13px] font-semibold truncate leading-tight text-sidebar-foreground">
                {activeProperty?.houseName ?? "My Home"}
              </p>
              {activeProperty?.address && (
                <p className="text-[11px] text-muted-foreground truncate leading-tight">
                  {activeProperty.address}
                </p>
              )}
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
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
              {p.id === activePropertyId && <Check className="h-3.5 w-3.5 ml-2 shrink-0" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowAdd(true)} className="cursor-pointer">
            <Plus className="h-4 w-4 me-2" />
            {t("common.addProperty")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("common.addProperty")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <input
              autoFocus
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t("common.propertyName")}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>{t("common.cancel")}</Button>
              <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || createMutation.isPending}>
                {createMutation.isPending ? t("common.adding") : t("common.add")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Theme Toggle ──────────────────────────────────────────────────────────────

function ThemeToggle({ compact }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const options = [
    { value: "light"  as const, icon: Sun,     label: "Light"  },
    { value: "dark"   as const, icon: Moon,    label: "Dark"   },
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
    <div className="flex items-center gap-1 rounded-lg border p-1 mb-1">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          className={`flex-1 flex items-center justify-center rounded p-1.5 transition-colors text-xs gap-1 ${
            theme === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
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

export default function DashboardLayout({ children, onSearchOpen }: { children: React.ReactNode; onSearchOpen?: () => void }) {
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
          <h1 className="text-2xl font-semibold tracking-tight text-center">Sign in to continue</h1>
          <Button onClick={() => { window.location.href = getLoginUrl(); }} size="lg" className="w-full">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth} onSearchOpen={onSearchOpen}>
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

  const search = useSearch();

  const handleSearchOpen = () => {
    search.setOpen(true);
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
  const pathKey = Object.keys(PAGE_META).find(p =>
    p === "/" ? location === "/" : location === p || location.startsWith(p + "/")
  ) ?? "/";
  const pageMeta = PAGE_META[pathKey];

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location === path || location.startsWith(path + "/");

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const rect = sidebarRef.current?.getBoundingClientRect();
      if (!rect) return;
      const newWidth = isRTL ? rect.right - e.clientX : e.clientX - rect.left;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
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
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" side={isRTL ? "right" : "left"} className={isRTL ? "border-l" : "border-r"} disableTransition={isResizing}>

          {/* ── Header: logo + property ───────────────────────────────── */}
          <SidebarHeader className="h-14 justify-center">
            <div className="flex items-center gap-2 px-2 w-full">
              {isCollapsed ? (
                <button
                  onClick={toggleSidebar}
                  className="flex items-center justify-center w-full focus:outline-none"
                  aria-label="Expand sidebar"
                >
                  <PropertySwitcher isCollapsed={true} />
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary shrink-0">
                    <Home className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <PropertySwitcher isCollapsed={false} />
                  </div>
                  <button
                    onClick={toggleSidebar}
                    className="h-7 w-7 flex items-center justify-center hover:bg-sidebar-accent rounded-md transition-colors focus:outline-none shrink-0"
                    aria-label="Collapse sidebar"
                  >
                    {isRTL ? <PanelRight className="h-3.5 w-3.5 text-muted-foreground" /> : <PanelLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </>
              )}
            </div>
          </SidebarHeader>

          {/* ── Nav groups ───────────────────────────────────────────── */}
          <SidebarContent className="gap-0">
            {/* Search bar */}
            {!isCollapsed ? (
              <div className="px-2 pb-2">
                <button
                  type="button"
                  onClick={handleSearchOpen}
                  className="flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  aria-label={t("search.dialogTitle")}
                >
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 text-start text-xs">{t("search.placeholder")}</span>
                  <kbd className="hidden sm:inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    ⌘K
                  </kbd>
                </button>
              </div>
            ) : (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={handleSearchOpen}
                  className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors"
                  aria-label={t("search.dialogTitle")}
                  title={`${t("search.dialogTitle")} (⌘K)`}
                >
                  <Search className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            )}

            {navGroups.map(group => (
              <div key={group.labelKey} className="mb-1">
                {!isCollapsed && (
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {t(group.labelKey)}
                  </p>
                )}
                <SidebarMenu className="px-2">
                  {group.items.map(item => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive(item.path)}
                        onClick={() => setLocation(item.path)}
                        tooltip={t(item.key)}
                        className="h-9 text-[13px]"
                      >
                        <item.icon className="h-4 w-4" />
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
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
                  {t("common.household")}
                </p>
                <div className="space-y-1">
                  {profiles.map((profile: any, index: number) => (
                    <div
                      key={profile.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${
                        profile.id === user?.id ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className={`text-[10px] text-white ${getAvatarColor(index)}`}>
                          {getInitials(profile.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{profile.name || "Unknown"}</span>
                      {profile.id === user?.id && <Check className="h-3 w-3 ml-auto shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SidebarContent>

          {/* ── Footer: theme + user ──────────────────────────────────── */}
          <SidebarFooter className="p-3">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isCollapsed ? "justify-center" : "text-start"}`}>
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">{user?.name || "-"}</p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">{user?.email || "-"}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {profiles && profiles.length > 1 && (
                  <>
                    <div className="px-2 py-1.5">
                      <p className="text-xs font-medium text-muted-foreground">{t("common.household")}</p>
                    </div>
                    {profiles.map((profile: any, index: number) => (
                      <DropdownMenuItem key={profile.id} className="cursor-pointer">
                        <Avatar className="h-5 w-5 mr-2">
                          <AvatarFallback className={`text-[9px] text-white ${getAvatarColor(index)}`}>
                            {getInitials(profile.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{profile.name || "Unknown"}</span>
                        {profile.id === user?.id && <Check className="h-3 w-3 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
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
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
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
            <button
              type="button"
              onClick={handleSearchOpen}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent transition-colors"
              aria-label={t("search.dialogTitle")}
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Desktop topbar: breadcrumb + search */}
        {!isMobile && (
          <div className="flex h-[54px] items-center border-b bg-background px-5 gap-4 flex-shrink-0">
            <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground select-none">
              {pageMeta && (
                <>
                  <span>{t(pageMeta.sectionKey)}</span>
                  <ChevronRight className="h-3 w-3 opacity-50" />
                  <span className="text-foreground font-medium">{t(pageMeta.pageKey)}</span>
                </>
              )}
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleSearchOpen}
              className="flex h-8 items-center gap-2 rounded-full border bg-muted/40 px-3 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors min-w-[180px]"
              aria-label={t("search.dialogTitle")}
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-xs text-start">{t("search.placeholder")}</span>
              <kbd className="hidden sm:inline-flex items-center rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                ⌘K
              </kbd>
            </button>
            <ThemeToggle compact />
          </div>
        )}

        <main className="flex-1 p-4 md:p-5">{children}</main>
      </SidebarInset>

      <SearchModal
        open={search.open}
        onClose={search.close}
        query={search.query}
        onQueryChange={search.setQuery}
        results={search.results}
        isFetching={search.isFetching}
      />
    </>
  );
}
