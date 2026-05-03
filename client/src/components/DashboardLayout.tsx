import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Home,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Star,
  Wallet,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";

const navItems = [
  { path: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { path: "/property", icon: Home, labelKey: "nav.property" },
  { path: "/expenses", icon: DollarSign, labelKey: "nav.expenses" },
  { path: "/loans", icon: Wallet, labelKey: "nav.loans" },
  { path: "/purchase-costs", icon: ShoppingCart, labelKey: "nav.purchaseCosts" },
  { path: "/repairs", icon: Wrench, labelKey: "nav.repairs" },
  { path: "/upgrades", icon: Star, labelKey: "nav.upgrades" },
  { path: "/wishlist", icon: ClipboardList, labelKey: "nav.wishlist" },
  { path: "/inventory", icon: Package, labelKey: "nav.inventory" },
  { path: "/calendar", icon: Calendar, labelKey: "nav.calendar" },
  { path: "/settings", icon: Settings, labelKey: "nav.settings" },
];

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const isRtl = i18n.language === "he";

  const propertyQuery = trpc.property.get.useQuery();
  const property = propertyQuery.data;

  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
  }, [isRtl]);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-e border-border bg-card transition-all duration-300 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Logo + collapse toggle */}
        <div className="flex h-14 items-center justify-between border-b border-border px-3">
          {!collapsed && (
            <span className="font-semibold text-primary text-sm tracking-tight">
              🏠 HomeVault
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ms-auto h-7 w-7 shrink-0"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? t("common.expand") : t("common.collapse")}
          >
            {isRtl ? (
              collapsed ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Property name */}
        {!collapsed && property && (
          <div className="border-b border-border px-4 py-2">
            <p className="truncate text-xs text-muted-foreground">
              {property.houseName ?? t("property.myHome")}
            </p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map(({ path, icon: Icon, labelKey }) => {
            const active = location === path || location.startsWith(path + "/");
            return (
              <Link
                key={path}
                href={path}
                className={`flex items-center gap-3 rounded-md mx-2 px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                title={collapsed ? t(labelKey) : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t(labelKey)}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={user?.picture} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.name ?? user?.email}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52">
              <DropdownMenuItem
                onClick={() => i18n.changeLanguage(i18n.language === "he" ? "en" : "he")}
              >
                🌐 {i18n.language === "he" ? "English" : "עברית"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="me-2 h-4 w-4" />
                {t("auth.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
