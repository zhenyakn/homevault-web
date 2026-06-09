import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Receipt,
  Wrench,
  FileText,
  TrendingUp,
  CalendarPlus,
} from "lucide-react";

type LucideIcon = React.ComponentType<
  React.SVGProps<SVGSVGElement> & { className?: string }
>;

const ITEMS: { icon: LucideIcon; labelKey: string; path: string }[] = [
  { icon: Receipt, labelKey: "nav.expenses", path: "/expenses" },
  { icon: Wrench, labelKey: "nav.repairs", path: "/repairs" },
  { icon: FileText, labelKey: "nav.documents", path: "/documents" },
  { icon: TrendingUp, labelKey: "nav.projects", path: "/upgrades" },
  { icon: CalendarPlus, labelKey: "nav.calendar", path: "/calendar" },
];

/**
 * The global "Add item" affordance. On a personal home app a single quick-add
 * keeps the most common actions one tap away. Each entry routes to the relevant
 * page where the existing add flow lives.
 */
export function QuickAddMenu({
  children,
  align = "end",
}: {
  children: React.ReactNode;
  align?: "start" | "end" | "center";
}) {
  const { t } = useTranslation();
  const [, nav] = useLocation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuLabel>{t("homevault.quickAddTitle")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ITEMS.map(item => (
          <DropdownMenuItem
            key={item.path}
            onClick={() => nav(item.path)}
            className="cursor-pointer"
          >
            <item.icon className="me-2 h-4 w-4" />
            {t(item.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default QuickAddMenu;
