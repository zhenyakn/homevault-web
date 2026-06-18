import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Home, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProperty } from "@/contexts/PropertyContext";
import { trpc } from "@/lib/trpc";
import AddPropertyWizard from "@/components/AddPropertyWizard";
import { resolveActiveProperty, propertyDisplayName } from "@/lib/property";

/**
 * Quick property switcher for the mobile top bar.
 *
 * On mobile the only way to change the active property used to be the hamburger
 * sheet or the Portfolio page — both several taps away. This surfaces the active
 * property as a tappable pill right in the top bar (mirroring the desktop
 * sidebar switcher) so switching is a single tap from anywhere in the app.
 *
 * Shared by both layouts (default `DashboardLayout` and the premium
 * `HomeVaultLayout`); their mobile top bars both use the standard surface tokens
 * so the same styling fits both.
 */
export default function MobilePropertySwitcher() {
  const { t } = useTranslation();
  const { activePropertyId, switchProperty } = useProperty();
  const { data: properties } = trpc.property.list.useQuery();
  const [showAdd, setShowAdd] = useState(false);

  const activeProperty = resolveActiveProperty(properties, activePropertyId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("common.switchProperty")}
            className="flex min-w-0 items-center gap-1.5 rounded-lg bg-muted/60 px-2 py-1.5 text-start transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Home className="h-3.5 w-3.5" />
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              {propertyDisplayName(activeProperty, t("common.myHome"))}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {properties?.map(p => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => p.id !== activePropertyId && switchProperty(p.id)}
              className="cursor-pointer"
            >
              <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center me-2 shrink-0">
                <Home className="h-3 w-3 text-primary" />
              </div>
              <span className="flex-1 truncate">{p.houseName}</span>
              {p.id === activePropertyId && (
                <Check className="h-3.5 w-3.5 ms-2 shrink-0" />
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

      <AddPropertyWizard open={showAdd} onOpenChange={setShowAdd} />
    </>
  );
}
