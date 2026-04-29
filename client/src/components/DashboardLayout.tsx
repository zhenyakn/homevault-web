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
import {
  Check,
  ChevronDown,
  Home,
  LayoutGrid,
  LogOut,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  Receipt,
  Settings,
  ShoppingCart,
  Sun,
  TrendingUp,
  DollarSign,
  Heart,
  Calendar,
  Wrench,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const coreMenuItems = [
  { icon: Home,         label: "Dashboard",      path: "/" },
  { icon: Receipt,      label: "Expenses",        path: "/expenses" },
  { icon: Wrench,       label: "Repairs",         path: "/repairs" },
  { icon: TrendingUp,   label: "Upgrades",        path: "/upgrades" },
  { icon: DollarSign,   label: "Loans",           path: "/loans" },
  { icon: Heart,        label: "Wishlist",         path: "/wishlist" },
  { icon: ShoppingCart, label: "Purchase Costs",  path: "/purchase-costs" },
  { icon: Calendar,     label: "Calendar",         path: "/calendar" },
  { icon: Settings,     label: "Settings",         path: "/settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
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
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 mx-auto">
        <Home className="h-4 w-4 text-primary" />
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left">
            <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Home className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate leading-tight">
                {activeProperty?.houseName ?? "My Home"}
              </p>
              {activeProperty?.address && (
                <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                  {activeProperty.address}
                </p>
              )}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
            <Plus className="h-4 w-4 mr-2" />
            Add property
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add property</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <input
              autoFocus
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Property name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || createMutation.isPending}>
                {createMutation.isPending ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Theme Toggle ──────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const options = [
    { value: "light"  as const, icon: Sun,     label: "Light"  },
    { value: "dark"   as const, icon: Moon,    label: "Dark"   },
    { value: "system" as const, icon: Monitor, label: "System" },
  ];

  if (isCollapsed) {
    const current = options.find(o => o.value === theme) ?? options[0];
    const next = options[(options.indexOf(current) + 1) % options.length];
    return (
      <button
        onClick={() => setTheme(next.value)}
        title={`Theme: ${current.label}`}
        className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-accent transition-colors mx-auto"
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const { data: profiles } = trpc.profiles.list.useQuery();
  const { data: properties } = trpc.property.list.useQuery();
  const hasMultipleProperties = (properties?.length ?? 0) > 1;

  const menuItems = [
    ...coreMenuItems,
    ...(hasMultipleProperties
      ? [{ icon: LayoutGrid, label: "Portfolio", path: "/portfolio" }]
      : []),
  ];

  // Insert Portfolio before Settings
  const orderedItems = hasMultipleProperties
    ? [
        ...coreMenuItems.slice(0, -1),
        { icon: LayoutGrid, label: "Portfolio", path: "/portfolio" },
        coreMenuItems[coreMenuItems.length - 1],
      ]
    : coreMenuItems;

  const activeMenuItem = orderedItems.find(item =>
    item.path === location ||
    (item.path === "/settings" && (location === "/property-settings" || location.startsWith("/settings")))
  );

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
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
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-2 px-2 w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <PropertySwitcher isCollapsed={false} />
                </div>
              )}
              {isCollapsed && <PropertySwitcher isCollapsed={true} />}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {orderedItems.map(item => {
                const isActive = item.path === "/"
                  ? location === "/"
                  : item.path === "/settings"
                  ? location === "/property-settings" || location.startsWith("/settings")
                  : location.startsWith(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 font-normal"
                    >
                      <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {!isCollapsed && profiles && profiles.length > 1 && (
              <div className="px-4 pt-6 pb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Household
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

          <SidebarFooter className="p-3">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
                      <p className="text-xs font-medium text-muted-foreground">Household</p>
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
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <span className="tracking-tight text-foreground">{activeMenuItem?.label ?? "Menu"}</span>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
