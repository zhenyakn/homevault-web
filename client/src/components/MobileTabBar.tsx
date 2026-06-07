import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Calendar, Home, Menu, Receipt, Wrench } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type LucideIcon = React.ComponentType<
  React.SVGProps<SVGSVGElement> & { className?: string }
>;

const TABS: { icon: LucideIcon; key: string; path: string }[] = [
  { icon: Home, key: "nav.dashboard", path: "/" },
  { icon: Receipt, key: "nav.expenses", path: "/expenses" },
  { icon: Wrench, key: "nav.repairs", path: "/repairs" },
  { icon: Calendar, key: "nav.calendar", path: "/calendar" },
];

/**
 * Bottom navigation for mobile. Surfaces the primary routes plus a "More" entry
 * that opens the full sidebar sheet for everything else. Rendered only on mobile
 * by DashboardLayout (inside the sidebar provider, so useSidebar is available).
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
      {TABS.map(tab => {
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
