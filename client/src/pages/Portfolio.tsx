import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useProperty } from "@/contexts/PropertyContext";
import { useHomeVaultUI } from "@/contexts/HomeVaultUIContext";
import { useIsMobile } from "@/hooks/useMobile";
import { HVPageHeader } from "@/components/homevault";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import AddPropertyWizard from "@/components/AddPropertyWizard";
import PropertyEditor from "@/components/property/PropertyEditor";
import {
  Building2,
  Home,
  KeyRound,
  MapPin,
  Plus,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Trash2,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "owned_rented" | "owned_personal" | "rented";

type PropertySummary = {
  id: number;
  monthSpent: number;
  openRepairsCount: number;
  outstandingLoanBalance: number;
};

const MODE_ICON: Record<Mode, typeof Home> = {
  owned_rented: Building2,
  owned_personal: Home,
  rented: KeyRound,
};
const MODE_BADGE: Record<Mode, string> = {
  owned_rented:
    "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  owned_personal: "border-border bg-muted text-muted-foreground",
  rented: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

function formatMoney(minor: number, currencyCode: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode || "ILS",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export default function Portfolio() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { data: properties, isLoading } = trpc.property.list.useQuery();
  const { data: summaries } = trpc.dashboard.portfolio.useQuery();
  const { activePropertyId, switchProperty } = useProperty();
  const { enabled: hv } = useHomeVaultUI();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // On mobile the list and the editor are two distinct screens; this tracks
  // whether the user has drilled into a property's detail screen.
  const [mobileDetail, setMobileDetail] = useState(false);

  const utils = trpc.useUtils();
  const deleteMutation = trpc.property.delete.useMutation({
    onSuccess: () => {
      utils.property.list.invalidate();
      utils.dashboard.portfolio.invalidate();
      setSelectedId(null);
      setMobileDetail(false);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!properties || properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-3">
        <Building2 className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">{t("portfolio.emptyTitle")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("portfolio.emptyDesc")}
        </p>
        <Button className="mt-2" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          {t("common.addProperty")}
        </Button>
        <AddPropertyWizard open={addOpen} onOpenChange={setAddOpen} />
      </div>
    );
  }

  const metricsById = new Map<number, PropertySummary>(
    (summaries ?? []).map(s => [s.id, s as PropertySummary])
  );
  const selected =
    properties.find(p => p.id === selectedId) ??
    properties.find(p => p.id === activePropertyId) ??
    properties[0];
  const selMode = (selected.propertyMode as Mode) || "owned_personal";
  const SelIcon = MODE_ICON[selMode];

  const openDetail = (id: number) => {
    setSelectedId(id);
    setMobileDetail(true);
  };

  // ── A single property row in the master list ─────────────────────────────
  const renderCard = (prop: (typeof properties)[number]) => {
    const mode = (prop.propertyMode as Mode) || "owned_personal";
    const Icon = MODE_ICON[mode];
    const isSel = !isMobile && prop.id === selected.id;
    const isActive = prop.id === activePropertyId;
    const m = metricsById.get(prop.id);
    const isRental = mode === "owned_rented" || mode === "rented";
    const currencyCode = (prop.currencyCode as string) || "ILS";

    return (
      <button
        key={prop.id}
        type="button"
        onClick={() =>
          isMobile ? openDetail(prop.id) : setSelectedId(prop.id)
        }
        className={cn(
          "group w-full text-left rounded-2xl border p-4 transition-all bg-card",
          "active:scale-[0.99]",
          isSel
            ? "border-primary ring-2 ring-primary/25"
            : "border-border hover:border-primary/40 hover:shadow-sm"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 grid place-items-center text-primary shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold truncate">
                {prop.houseNickname || prop.houseName}
              </span>
              {isActive && (
                <Badge
                  variant="default"
                  className="text-[10px] px-1.5 py-0 shrink-0"
                >
                  {t("portfolio.active")}
                </Badge>
              )}
            </div>
            {prop.address && (
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 shrink-0" />
                {prop.address}
              </div>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 md:hidden" />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border",
              MODE_BADGE[mode]
            )}
          >
            {t(`propertyMode.${mode}`)}
          </span>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
            {isRental && prop.monthlyRent ? (
              <span className="font-medium text-foreground">
                {formatMoney(prop.monthlyRent, currencyCode)}
                <span className="text-muted-foreground font-normal"> / mo</span>
              </span>
            ) : (
              m && (
                <span>
                  {formatMoney(m.monthSpent, currencyCode)}{" "}
                  {t("portfolio.thisMonth").toLowerCase()}
                </span>
              )
            )}
            {m && m.openRepairsCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                {m.openRepairsCount}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const addButton = (
    <button
      type="button"
      onClick={() => setAddOpen(true)}
      className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground active:scale-[0.99]"
    >
      <Plus className="w-4 h-4" />
      {t("portfolio.addNew")}
    </button>
  );

  // ── Detail building blocks (composed differently per layout) ─────────────
  const nameBlock = (
    <div className="flex items-start gap-3 min-w-0">
      <div className="w-11 h-11 rounded-xl bg-primary/10 grid place-items-center text-primary shrink-0">
        <SelIcon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold truncate">
          {selected.houseNickname || selected.houseName}
        </h2>
        <p className="text-xs text-muted-foreground">
          {[selected.propertyType, t(`propertyMode.${selMode}`)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </div>
  );

  const deleteButton = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          disabled={properties.length <= 1}
          title={t("portfolio.delete")}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("portfolio.deleteConfirmTitle", {
              name: selected.houseNickname || selected.houseName,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("portfolio.deleteConfirmDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate({ propertyId: selected.id })}
          >
            {t("portfolio.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const switchButton = selected.id !== activePropertyId && (
    <Button
      variant="outline"
      size="sm"
      onClick={() => switchProperty(selected.id)}
    >
      {t("portfolio.switchTo")}
      <ArrowRight className="w-3.5 h-3.5 ms-1.5 rtl:rotate-180" />
    </Button>
  );

  // ── Mobile: drilled-in detail screen ─────────────────────────────────────
  if (isMobile && mobileDetail) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setMobileDetail(false)}
          className="-ms-1 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          {t("nav.portfolio")}
        </button>

        <Card className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            {nameBlock}
            {deleteButton}
          </div>
          {switchButton && (
            <div className="[&>button]:w-full">{switchButton}</div>
          )}
          <PropertyEditor
            key={selected.id}
            property={selected}
            metrics={metricsById.get(selected.id)}
          />
        </Card>

        <AddPropertyWizard open={addOpen} onOpenChange={setAddOpen} />
      </div>
    );
  }

  // ── Mobile: master list screen ───────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("nav.portfolio")}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t("portfolio.count", { count: properties.length })}
          </p>
        </div>
        <div className="space-y-3">
          {properties.map(renderCard)}
          {addButton}
        </div>
        <AddPropertyWizard open={addOpen} onOpenChange={setAddOpen} />
      </div>
    );
  }

  // ── Desktop: master-detail side by side ──────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {hv ? (
        <HVPageHeader
          title={t("nav.portfolio")}
          subtitle={t("portfolio.count", { count: properties.length })}
        />
      ) : (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("nav.portfolio")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("portfolio.count", { count: properties.length })}
          </p>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[300px_1fr] items-start">
        <div className="space-y-3">
          {properties.map(renderCard)}
          {addButton}
        </div>

        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            {nameBlock}
            <div className="flex items-center gap-2 shrink-0">
              {switchButton}
              {deleteButton}
            </div>
          </div>
          <PropertyEditor
            key={selected.id}
            property={selected}
            metrics={metricsById.get(selected.id)}
          />
        </Card>
      </div>

      <AddPropertyWizard open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
