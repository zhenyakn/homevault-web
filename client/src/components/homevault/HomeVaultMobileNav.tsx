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
export default function MobileTabBar() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const { setOpenMobile } = useSidebar();

  const itemClass = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
    );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("nav.primary")}
    >
      {TABS.slice(0, 2).map(tab => {
        const Icon = tab.icon;
        const active = location === tab.path;
        return (
          <button
            key={tab.path}
            type="button"
            onClick={() => setLocation(tab.path)}
            aria-current={active ? "page" : undefined}
            className={itemClass(active)}
          >
            <Icon className="h-5 w-5" />
            <span>{t(tab.key)}</span>
          </button>
        );
      })}

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

      {TABS.slice(2).map(tab => {
        const Icon = tab.icon;
        const active = location === tab.path;
        return (
          <button
            key={tab.path}
            type="button"
            onClick={() => setLocation(tab.path)}
            aria-current={active ? "page" : undefined}
            className={itemClass(active)}
          >
            <Icon className="h-5 w-5" />
            <span>{t(tab.key)}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className={itemClass(false)}
      >
        <Menu className="h-5 w-5" />
        <span>{t("nav.more")}</span>
      </button>
    </nav>
  );
}
