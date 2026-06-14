import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "sonner";
import { useProperty } from "@/contexts/PropertyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DetailHeader,
  StatusStepperCard,
  NotesCard,
} from "@/components/DetailPage";
import { CandidateDialog } from "@/components/apartmentSearch/CandidateDialog";
import { StarRating } from "@/components/apartmentSearch/StarRating";
import { STAGE_STEPS, stageColor } from "@/components/apartmentSearch/stages";
import {
  Loader2,
  Star,
  Plus,
  X,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  ExternalLink,
  Home,
  CheckCircle2,
  Ban,
} from "lucide-react";

type Candidate = RouterOutputs["apartmentSearch"]["candidates"]["get"];

// ── Pros / cons editor ────────────────────────────────────────────────────────

function ProsConsList({
  candidate,
  field,
}: {
  candidate: Candidate;
  field: "pros" | "cons";
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const [draft, setDraft] = useState("");
  const items = (candidate[field] as string[] | null) ?? [];

  const update = trpc.apartmentSearch.candidates.update.useMutation({
    onSuccess: () =>
      u.apartmentSearch.candidates.get.invalidate({ id: candidate.id }),
    onError: e => toast.error(e.message),
  });

  const save = (next: string[]) =>
    update.mutate({ id: candidate.id, data: { [field]: next } });

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    save([...items, v]);
    setDraft("");
  };

  const isPro = field === "pros";

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {isPro ? (
          <ThumbsUp className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <ThumbsDown className="h-3.5 w-3.5 text-rose-600" />
        )}
        {isPro ? t("apartmentSearch.pros") : t("apartmentSearch.cons")}
      </p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div
            key={i}
            className="group flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                isPro ? "bg-green-500" : "bg-rose-500"
              )}
            />
            <span className="flex-1">{item}</span>
            <button
              type="button"
              aria-label={t("common.delete")}
              onClick={() => save(items.filter((_, idx) => idx !== i))}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={
            isPro
              ? t("apartmentSearch.addProPlaceholder")
              : t("apartmentSearch.addConPlaceholder")
          }
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          onClick={add}
          disabled={!draft.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Fact grid ───────────────────────────────────────────────────────────────

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ApartmentCandidateDetail() {
  const params = useParams<{ searchId: string; id: string }>();
  const { searchId, id } = params;
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const u = trpc.useUtils();
  const { switchProperty } = useProperty();

  const { data: candidate, isLoading } =
    trpc.apartmentSearch.candidates.get.useQuery({ id });
  const { data: search } = trpc.apartmentSearch.get.useQuery({ id: searchId });

  const [editOpen, setEditOpen] = useState(false);
  const [stageLoading, setStageLoading] = useState(false);

  const stageMut = trpc.apartmentSearch.candidates.setStage.useMutation({
    onSuccess: () => {
      u.apartmentSearch.candidates.get.invalidate({ id });
      u.apartmentSearch.candidates.list.invalidate({ searchId });
      u.apartmentSearch.counts.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const favMut = trpc.apartmentSearch.candidates.toggleFavorite.useMutation({
    onSuccess: () => {
      u.apartmentSearch.candidates.get.invalidate({ id });
      u.apartmentSearch.candidates.list.invalidate({ searchId });
    },
    onError: e => toast.error(e.message),
  });
  const ratingMut = trpc.apartmentSearch.candidates.update.useMutation({
    onSuccess: () => u.apartmentSearch.candidates.get.invalidate({ id }),
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.apartmentSearch.candidates.delete.useMutation({
    onSuccess: () => {
      u.apartmentSearch.candidates.list.invalidate({ searchId });
      u.apartmentSearch.counts.invalidate();
      navigate(`/apartment-search/${searchId}`);
    },
    onError: e => toast.error(e.message),
  });
  const convertMut =
    trpc.apartmentSearch.candidates.convertToProperty.useMutation({
      onSuccess: ({ propertyId }) => {
        u.apartmentSearch.candidates.get.invalidate({ id });
        u.property.list.invalidate();
        toast.success(t("apartmentSearch.convertedToast"));
        // Make the freshly-created property active, then jump to the portfolio.
        switchProperty(propertyId);
        navigate("/portfolio");
      },
      onError: e => toast.error(e.message),
    });

  const missing = !isLoading && !candidate;
  useEffect(() => {
    if (missing) navigate(`/apartment-search/${searchId}`, { replace: true });
  }, [missing, navigate, searchId]);

  if (isLoading || !candidate) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isRent = search?.searchType === "rent";
  const setStage = async (stage: string) => {
    if (stage === candidate.stage) return;
    setStageLoading(true);
    try {
      await stageMut.mutateAsync({ id, stage: stage as any });
    } finally {
      setStageLoading(false);
    }
  };

  const isRejected = candidate.stage === "rejected";
  const converted = candidate.convertedPropertyId != null;

  return (
    <div className="max-w-3xl space-y-6">
      <DetailHeader
        backLabel={search?.name ?? t("apartmentSearch.title")}
        onBack={() => navigate(`/apartment-search/${searchId}`)}
        title={candidate.title}
        description={candidate.address}
        meta={
          <>
            <Badge
              className={cn(
                "h-5 border-0 text-xs",
                stageColor(candidate.stage)
              )}
            >
              {t(`apartmentSearch.stage.${candidate.stage}`)}
            </Badge>
            <button
              type="button"
              aria-label={t("apartmentSearch.favorite")}
              onClick={() => favMut.mutate({ id })}
              className="inline-flex items-center"
            >
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  candidate.isFavorite
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/50 hover:text-amber-400"
                )}
              />
            </button>
          </>
        }
        editLabel={t("common.edit")}
        onEdit={() => setEditOpen(true)}
      />

      {converted && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t("apartmentSearch.alreadyConverted")}
        </div>
      )}

      <StatusStepperCard
        label={t("apartmentSearch.pipeline")}
        steps={STAGE_STEPS}
        currentStatus={candidate.stage}
        onChange={setStage}
        loading={stageLoading}
        getStepLabel={s => t(`apartmentSearch.stage.${s}`, { defaultValue: s })}
      />

      {/* Key facts */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact
            label={
              isRent
                ? t("apartmentSearch.monthlyRent")
                : t("apartmentSearch.askingPrice")
            }
            value={candidate.price ? formatCurrency(candidate.price) : "—"}
          />
          {isRent && candidate.deposit ? (
            <Fact
              label={t("apartmentSearch.deposit")}
              value={formatCurrency(candidate.deposit)}
            />
          ) : null}
          <Fact
            label={t("apartmentSearch.size")}
            value={
              candidate.squareMeters ? `${candidate.squareMeters} m²` : null
            }
          />
          <Fact
            label={t("apartmentSearch.rooms")}
            value={candidate.rooms ?? null}
          />
          <Fact
            label={t("apartmentSearch.floor")}
            value={candidate.floor ?? null}
          />
          <Fact
            label={t("apartmentSearch.availableFrom")}
            value={candidate.availableDate}
          />
          <Fact
            label={t("apartmentSearch.agentName")}
            value={candidate.agentName}
          />
          <Fact
            label={t("apartmentSearch.agentContact")}
            value={candidate.agentContact}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("apartmentSearch.rating")}
            </span>
            <StarRating
              value={candidate.rating ?? 0}
              onChange={r =>
                ratingMut.mutate({ id, data: { rating: r || undefined } })
              }
              size="sm"
            />
          </div>
          {candidate.listingUrl && (
            <a
              href={candidate.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("apartmentSearch.viewListing")}
            </a>
          )}
        </div>
      </div>

      {/* Pros & cons */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ProsConsList candidate={candidate} field="pros" />
        <ProsConsList candidate={candidate} field="cons" />
      </div>

      <NotesCard label={t("common.notes")} notes={candidate.notes} />

      {/* Decision actions */}
      <div className="flex flex-wrap items-center gap-2">
        {!converted && (
          <Button
            onClick={() => convertMut.mutate({ id })}
            disabled={convertMut.isPending}
          >
            {convertMut.isPending ? (
              <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
            ) : (
              <Home className="h-4 w-4 me-1.5" />
            )}
            {t("apartmentSearch.makeThisMyHome")}
          </Button>
        )}
        {!isRejected ? (
          <Button
            variant="outline"
            onClick={() => setStage("rejected")}
            disabled={stageLoading}
          >
            <Ban className="h-4 w-4 me-1.5" />
            {t("apartmentSearch.pass")}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setStage("saved")}
            disabled={stageLoading}
          >
            {t("apartmentSearch.reconsider")}
          </Button>
        )}
        <Button
          variant="outline"
          className="ms-auto text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm(t("apartmentSearch.deleteCandidateConfirm")))
              deleteMut.mutate({ id });
          }}
          disabled={deleteMut.isPending}
        >
          <Trash2 className="h-4 w-4 me-1.5" />
          {t("common.delete")}
        </Button>
      </div>

      {search && (
        <CandidateDialog
          searchId={searchId}
          searchType={search.searchType}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          editCandidate={candidate as any}
        />
      )}
    </div>
  );
}
