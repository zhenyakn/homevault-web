import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { useHomeVaultUI } from "@/contexts/HomeVaultUIContext";
import { HVPageHeader } from "@/components/homevault";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Building2,
  ChevronRight,
  KeyRound,
  Home,
} from "lucide-react";
import { toast } from "sonner";

type Search = RouterOutputs["apartmentSearch"]["list"][number];

function NewSearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const [, navigate] = useLocation();
  const create = trpc.apartmentSearch.create.useMutation({
    onSuccess: created => {
      u.apartmentSearch.list.invalidate();
      toast.success(t("apartmentSearch.searchCreated"));
      onClose();
      // Drop straight into the new search so the user can add candidates.
      navigate(`/apartment-search/${created.id}`);
    },
    onError: e => toast.error(e.message),
  });

  const blank = { name: "", searchType: "rent", targetBudget: "" };
  const [f, setF] = useState(blank);

  const submit = () => {
    if (!f.name.trim()) return;
    create.mutate({
      name: f.name.trim(),
      searchType: f.searchType as "rent" | "buy",
      targetBudget: f.targetBudget
        ? Math.round(parseFloat(f.targetBudget) * 100)
        : undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) {
          setF(blank);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("apartmentSearch.newSearch")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>{t("apartmentSearch.searchName")}</Label>
            <Input
              value={f.name}
              onChange={e => setF({ ...f, name: e.target.value })}
              placeholder={t("apartmentSearch.searchNamePlaceholder")}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("apartmentSearch.type")}</Label>
              <Select
                value={f.searchType}
                onValueChange={v => setF({ ...f, searchType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rent">
                    {t("apartmentSearch.typeRent")}
                  </SelectItem>
                  <SelectItem value="buy">
                    {t("apartmentSearch.typeBuy")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                {f.searchType === "rent"
                  ? t("apartmentSearch.maxRent")
                  : t("apartmentSearch.maxPrice")}
              </Label>
              <Input
                type="number"
                min="0"
                value={f.targetBudget}
                onChange={e => setF({ ...f, targetBudget: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={!f.name.trim() || create.isPending}
            >
              {create.isPending && (
                <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
              )}
              {t("common.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchCard({
  search,
  count,
}: {
  search: Search;
  count?: { total: number; accepted: number };
}) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const isRent = search.searchType === "rent";

  return (
    <button
      type="button"
      onClick={() => navigate(`/apartment-search/${search.id}`)}
      className="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3.5 text-start transition-colors hover:bg-muted/40"
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          isRent
            ? "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
            : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
        }`}
      >
        {isRent ? (
          <KeyRound className="h-4 w-4" />
        ) : (
          <Home className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{search.name}</p>
          <Badge className="h-5 border-0 bg-muted text-xs text-muted-foreground">
            {isRent
              ? t("apartmentSearch.typeRent")
              : t("apartmentSearch.typeBuy")}
          </Badge>
          {search.status === "completed" && (
            <Badge className="h-5 border-0 bg-green-100 text-xs text-green-700 dark:bg-green-950/40 dark:text-green-400">
              {t("apartmentSearch.statusCompleted")}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("apartmentSearch.candidateCount", { n: count?.total ?? 0 })}
          {search.targetBudget
            ? ` · ${t("apartmentSearch.budgetLabel")} ${formatCurrency(search.targetBudget)}`
            : ""}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180 group-hover:text-foreground" />
    </button>
  );
}

export default function ApartmentSearch() {
  const { t } = useTranslation();
  const { enabled: hv } = useHomeVaultUI();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: searches = [], isLoading } =
    trpc.apartmentSearch.list.useQuery();
  const { data: counts = [] } = trpc.apartmentSearch.counts.useQuery(
    { searchIds: searches.map(s => s.id) },
    { enabled: searches.length > 0 }
  );
  const countById = new Map(counts.map(c => [c.searchId, c]));

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {hv ? (
        <HVPageHeader
          title={t("apartmentSearch.title")}
          subtitle={t("apartmentSearch.subtitle")}
          hideQuickAdd
          actions={
            <Button
              onClick={() => setDialogOpen(true)}
              className="h-11 rounded-full px-[18px]"
            >
              <Plus className="me-1.5 h-4 w-4" />
              {t("apartmentSearch.newSearch")}
            </Button>
          }
        />
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              {t("apartmentSearch.title")}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("apartmentSearch.subtitle")}
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 me-1.5" />
            {t("apartmentSearch.newSearch")}
          </Button>
        </div>
      )}

      <NewSearchDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      {searches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center">
          <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {t("apartmentSearch.emptyTitle")}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {t("apartmentSearch.emptyBody")}
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 me-1.5" />
            {t("apartmentSearch.newSearch")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {searches.map(s => (
            <SearchCard key={s.id} search={s} count={countById.get(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
