import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { FileText, Home, Menu, Plus, Receipt } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { QuickAddMenu } from "@/components/homevault/QuickAddMenu";
import { cn } from "@/lib/utils";

type LucideIcon = React.ComponentType<
  React.SVGProps<SVGSVGElement> & { className?: string }
>;

const TABS: { icon: LucideIcon; key: string; path: string }[] = [
  { icon: Home, key: "nav.today", path: "/" },
  { icon: Receipt, key: "nav.expenses", path: "/expenses" },
  { icon: FileText, key: "nav.documents", path: "/documents" },
];

/**
 * Bottom navigation for mobile. Prioritises the personal essentials — Today,
 * Expenses, a central quick-add, Documents — plus a "More" entry that opens the
 * full sidebar sheet. Rendered only on mobile by DashboardLayout (inside the
 * sidebar provider, so useSidebar is available).
 */
/**
 * Mark a tab active when the current location matches its path or sits within
 * one of its sub-routes (e.g. /expenses/123 keeps the Expenses tab active),
 * mirroring the desktop sidebar's matching logic. The root path matches exactly.
 */
function isTabActive(location: string, path: string) {
  return path === "/"
    ? location === "/"
    : location === path || location.startsWith(path + "/");
}

export default function MobileTabBar() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const { setOpenMobile } = useSidebar();

  const itemClass = (active: boolean) =>
    cn(
      "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors",
      active ? "text-hv-primary" : "text-muted-foreground hover:text-foreground"
    );

  const renderTab = (tab: (typeof TABS)[number]) => {
    const Icon = tab.icon;
    const active = isTabActive(location, tab.path);
    return (
      <button
        key={tab.path}
        type="button"
        onClick={() => setLocation(tab.path)}
        aria-current={active ? "page" : undefined}
        className={itemClass(active)}
      >
        {active && (
          <span className="absolute inset-x-0 top-0 mx-auto h-0.5 w-8 rounded-full bg-hv-primary" />
        )}
        <span
          className={cn(
            "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
            active && "bg-hv-primary/10"
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span>{t(tab.key)}</span>
      </button>
    );
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("nav.primary")}
    >
      {TABS.slice(0, 2).map(renderTab)}

      {/* Central quick-add */}
      <div className="flex flex-1 items-start justify-center">
        <QuickAddMenu align="center">
          <button
            type="button"
            aria-label={t("homevault.quickAdd")}
            className="-mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-hv-primary text-white shadow-lg shadow-hv-primary/30 transition-colors hover:bg-hv-primary-dark"
          >
            <Plus className="h-5 w-5" />
          </button>
        </QuickAddMenu>
      </div>

      {TABS.slice(2).map(renderTab)}

      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className={itemClass(false)}
      >
        <span className="flex h-7 w-12 items-center justify-center">
          <Menu className="h-5 w-5" />
        </span>
        <span>{t("nav.more")}</span>
      </button>
    </nav>
  );
}
