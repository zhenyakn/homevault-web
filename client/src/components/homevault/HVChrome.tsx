import React, { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Search, Plus, Home, ChevronDown, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useProperty } from "@/contexts/PropertyContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AddPropertyDialog from "@/components/AddPropertyDialog";
import NotificationCenter from "@/components/NotificationCenter";
import { QuickAddMenu } from "@/components/homevault/QuickAddMenu";

/**
 * Lets the global chrome (search) be opened from page headers, so the
 * search / property / add controls can live on the same row as each page
 * title — matching the concept's `.top` composition instead of a separate
 * admin-style topbar.
 */
type HVChrome = { openSearch: () => void };
const HVChromeContext = createContext<HVChrome>({ openSearch: () => {} });

export function HVChromeProvider({
  openSearch,
  children,
}: {
  openSearch: () => void;
  children: React.ReactNode;
}) {
  return (
    <HVChromeContext.Provider value={{ openSearch }}>
      {children}
    </HVChromeContext.Provider>
  );
}

export const useHVChrome = () => useContext(HVChromeContext);

// ── Property selector (warm pill) ──────────────────────────────────────────────

function TopbarProperty() {
  const { t } = useTranslation();
  const { activePropertyId, switchProperty } = useProperty();
  const { data: properties } = trpc.property.list.useQuery();
  const [showAdd, setShowAdd] = React.useState(false);
  const active =
    properties?.find(p => p.id === activePropertyId) ?? properties?.[0];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-11 max-w-[200px] items-center gap-2 rounded-full border border-hv-border bg-hv-surface px-4 text-[13px] font-medium text-hv-ink transition-colors hover:bg-hv-surface-muted focus:outline-none">
            <Home className="h-4 w-4 shrink-0 text-hv-primary" />
            <span className="truncate">{active?.houseName ?? "My Home"}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-hv-muted-soft" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {properties?.map(p => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => p.id !== activePropertyId && switchProperty(p.id)}
              className="cursor-pointer"
            >
              <div className="me-2 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10">
                <Home className="h-3 w-3 text-primary" />
              </div>
              <span className="flex-1 truncate">{p.houseName}</span>
              {p.id === activePropertyId && (
                <Check className="ms-2 h-3.5 w-3.5 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowAdd(true)}
            className="cursor-pointer"
          >
            <Plus className="me-2 h-4 w-4" />
            {t("common.addProperty")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddPropertyDialog open={showAdd} onOpenChange={setShowAdd} />
    </>
  );
}

/** The global action cluster: search, property, quick-add, notifications. */
export function HVTopActions({ showQuickAdd = true }: { showQuickAdd?: boolean }) {
  const { t } = useTranslation();
  const { openSearch } = useHVChrome();
  return (
    <div className="hidden items-center gap-2.5 md:flex">
      <button
        type="button"
        onClick={openSearch}
        className="flex h-11 min-w-[210px] items-center gap-2 rounded-full border border-hv-border bg-hv-surface px-4 text-hv-muted transition-colors hover:bg-hv-surface-muted"
        aria-label={t("search.dialogTitle")}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-start text-[13px]">
          {t("search.placeholder")}
        </span>
      </button>
      <TopbarProperty />
      {showQuickAdd && (
        <QuickAddMenu>
          <button
            type="button"
            className="flex h-11 items-center gap-1.5 rounded-full bg-hv-primary px-[18px] text-[13px] font-bold text-white transition-colors hover:bg-hv-primary-dark"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden lg:inline">{t("homevault.quickAdd")}</span>
          </button>
        </QuickAddMenu>
      )}
      <NotificationCenter />
    </div>
  );
}

/**
 * Standard top row for HomeVault pages — title/subtitle on the leading edge and
 * the global action cluster on the trailing edge, on a single row (concept
 * `.top`). `actions` injects page-specific controls before the global cluster.
 */
export function HVPageHeader({
  title,
  subtitle,
  actions,
  hideQuickAdd,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Hide the global "+ Add" when the page provides its own contextual add. */
  hideQuickAdd?: boolean;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[32px] font-bold leading-tight tracking-[-0.03em] text-hv-ink">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-[14px] text-hv-muted">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        {actions}
        <HVTopActions showQuickAdd={!hideQuickAdd} />
      </div>
    </div>
  );
}

/** Shared pill styling for page-specific header actions (consistent 44px). */
export const hvHeaderBtn =
  "inline-flex h-11 items-center gap-1.5 rounded-full px-[18px] text-[13px] font-bold transition-colors";

export default HVPageHeader;
