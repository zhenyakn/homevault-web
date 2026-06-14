import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailHeader } from "@/components/DetailPage";
import { CandidateDialog } from "@/components/apartmentSearch/CandidateDialog";
import { ScoreSelect } from "@/components/apartmentSearch/ScoreSelect";
import { stageColor } from "@/components/apartmentSearch/stages";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Building2,
  Star,
  ChevronRight,
  Ruler,
  DoorOpen,
} from "lucide-react";

type Candidate = RouterOutputs["apartmentSearch"]["candidates"]["list"][number];

function CandidateRow({
  candidate,
  searchId,
  isRent,
}: {
  candidate: Candidate;
  searchId: string;
  isRent: boolean;
}) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const u = trpc.useUtils();
  const open = () =>
    navigate(`/apartment-search/${searchId}/candidate/${candidate.id}`);

  // Rate in place — the score is set here, after viewing, not in the add form.
  const rateMut = trpc.apartmentSearch.candidates.update.useMutation({
    onSuccess: () => u.apartmentSearch.candidates.list.invalidate({ searchId }),
    onError: e => toast.error(e.message),
  });

  return (
    <div className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30">
      <button
        type="button"
        onClick={open}
        className="flex min-w-0 flex-1 items-center gap-4 text-start"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {candidate.isFavorite && (
              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
            )}
            <p className="truncate text-sm font-medium">{candidate.title}</p>
            <Badge
              className={cn(
                "h-5 border-0 text-xs",
                stageColor(candidate.stage)
              )}
            >
              {t(`apartmentSearch.stage.${candidate.stage}`)}
            </Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {candidate.propertyType && (
              <span>{t(`propertyType.${candidate.propertyType}`)}</span>
            )}
            {candidate.address && (
              <span className="truncate max-w-[200px]">
                {candidate.address}
              </span>
            )}
            {candidate.squareMeters ? (
              <span className="inline-flex items-center gap-1">
                <Ruler className="h-3 w-3" />
                {candidate.squareMeters} m²
              </span>
            ) : null}
            {candidate.rooms ? (
              <span className="inline-flex items-center gap-1">
                <DoorOpen className="h-3 w-3" />
                {t("apartmentSearch.roomsCount", { n: candidate.rooms })}
              </span>
            ) : null}
          </div>
          {candidate.notes && (
            <p className="mt-1 truncate text-xs italic text-muted-foreground">
              {candidate.notes}
            </p>
          )}
        </div>
        <div className="shrink-0 text-end">
          {candidate.price ? (
            <p className="text-sm font-semibold tabular-nums">
              {formatCurrency(candidate.price)}
              {isRent && (
                <span className="text-xs font-normal text-muted-foreground">
                  {t("apartmentSearch.perMonthSuffix")}
                </span>
              )}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("apartmentSearch.noPrice")}
            </p>
          )}
        </div>
      </button>
      {/* Interactive score picker — sibling of the navigate button so it isn't
          nested inside it. */}
      <ScoreSelect
        value={candidate.rating}
        disabled={rateMut.isPending}
        onChange={score =>
          rateMut.mutate({ id: candidate.id, data: { rating: score ?? null } })
        }
      />
      <button
        type="button"
        onClick={open}
        aria-label={candidate.title}
        className="shrink-0"
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180 group-hover:text-foreground" />
      </button>
    </div>
  );
}

export default function ApartmentSearchDetail() {
  const params = useParams<{ searchId: string }>();
  const searchId = params.searchId;
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: search, isLoading: loadingSearch } =
    trpc.apartmentSearch.get.useQuery({ id: searchId });
  const { data: candidates = [], isLoading: loadingCandidates } =
    trpc.apartmentSearch.candidates.list.useQuery({ searchId });

  // If the search disappears (deleted / not owned), bounce to the list.
  const missing = !loadingSearch && !search;
  useEffect(() => {
    if (missing) navigate("/apartment-search", { replace: true });
  }, [missing, navigate]);

  if (loadingSearch || !search) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isRent = search.searchType === "rent";
  const favorites = candidates.filter(c => c.isFavorite).length;
  const accepted = candidates.filter(c => c.stage === "accepted").length;

  // Active candidates first, decided ones (accepted/rejected) sink to the end.
  const decided = (s: string) => s === "accepted" || s === "rejected";
  const sorted = [...candidates].sort((a, b) => {
    if (decided(a.stage) !== decided(b.stage)) return decided(a.stage) ? 1 : 0;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });

  return (
    <div className="max-w-3xl space-y-6">
      <DetailHeader
        backLabel={t("apartmentSearch.title")}
        onBack={() => navigate("/apartment-search")}
        title={search.name}
        meta={
          <Badge className="h-5 border-0 bg-muted text-xs text-muted-foreground">
            {isRent
              ? t("apartmentSearch.typeRent")
              : t("apartmentSearch.typeBuy")}
          </Badge>
        }
        editLabel={t("apartmentSearch.addCandidate")}
        onEdit={() => setDialogOpen(true)}
      />

      <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border">
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">
            {t("apartmentSearch.totalCandidates")}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {candidates.length}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">
            {t("apartmentSearch.favorites")}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{favorites}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">
            {t("apartmentSearch.accepted")}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{accepted}</p>
        </div>
      </div>

      <CandidateDialog
        searchId={searchId}
        searchType={search.searchType}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />

      {loadingCandidates ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : candidates.length === 0 ? (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex w-full flex-col items-center rounded-lg border border-dashed border-border px-4 py-12 text-center transition-colors hover:bg-muted/30"
        >
          <Building2 className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {t("apartmentSearch.noCandidatesTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("apartmentSearch.noCandidatesBody")}
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            <Plus className="h-3.5 w-3.5" />
            {t("apartmentSearch.addCandidate")}
          </span>
        </button>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {sorted.map(c => (
            <CandidateRow
              key={c.id}
              candidate={c}
              searchId={searchId}
              isRent={isRent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
