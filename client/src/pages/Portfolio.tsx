import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useProperty } from "@/contexts/PropertyContext";
import { useHomeVaultUI } from "@/contexts/HomeVaultUIContext";
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
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "owned_rented" | "owned_personal" | "rented";

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

export default function Portfolio() {
  const { t } = useTranslation();
  const { data: properties, isLoading } = trpc.property.list.useQuery();
  const { data: summaries } = trpc.dashboard.portfolio.useQuery();
  const { activePropertyId, switchProperty } = useProperty();
  const { enabled: hv } = useHomeVaultUI();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const deleteMutation = trpc.property.delete.useMutation({
    onSuccess: () => {
      utils.property.list.invalidate();
      utils.dashboard.portfolio.invalidate();
      setSelectedId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!properties || properties.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center gap-3">
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

  const metricsById = new Map((summaries ?? []).map(s => [s.id, s] as const));
  const selected =
    properties.find(p => p.id === selectedId) ??
    properties.find(p => p.id === activePropertyId) ??
    properties[0];
  const selMode = (selected.propertyMode as Mode) || "owned_personal";
  const SelIcon = MODE_ICON[selMode];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
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

      <div className="grid gap-5 md:grid-cols-[280px_1fr] items-start">
        {/* ── Master: property list ───────────────────────────────────── */}
        <div className="space-y-2.5">
          {properties.map(prop => {
            const mode = (prop.propertyMode as Mode) || "owned_personal";
            const Icon = MODE_ICON[mode];
            const isSel = prop.id === selected.id;
            const isActive = prop.id === activePropertyId;
            return (
              <button
                key={prop.id}
                type="button"
                onClick={() => setSelectedId(prop.id)}
                className={cn(
                  "w-full text-left rounded-xl border p-3.5 transition-colors bg-card",
                  isSel
                    ? "border-primary ring-2 ring-primary/25"
                    : "border-border hover:border-primary/40"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 grid place-items-center text-primary shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {prop.houseNickname || prop.houseName}
                    </div>
                    {prop.address && (
                      <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {prop.address}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-2.5">
                  {isActive && (
                    <Badge variant="default" className="text-[10px]">
                      {t("portfolio.active")}
                    </Badge>
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border",
                      MODE_BADGE[mode]
                    )}
                  >
                    {t(`propertyMode.${mode}`)}
                  </span>
                </div>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="w-4 h-4" />
            {t("portfolio.addNew")}
          </button>
        </div>

        {/* ── Detail: selected property editor ────────────────────────── */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center text-primary shrink-0">
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
            <div className="flex items-center gap-2 shrink-0">
              {selected.id !== activePropertyId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => switchProperty(selected.id)}
                >
                  {t("portfolio.switchTo")}
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
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
                      onClick={() =>
                        deleteMutation.mutate({ propertyId: selected.id })
                      }
                    >
                      {t("portfolio.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
