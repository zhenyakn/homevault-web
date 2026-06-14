import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StarRating } from "./StarRating";

type Candidate = RouterOutputs["apartmentSearch"]["candidates"]["list"][number];

const toCents = (v: string) =>
  v ? Math.round(parseFloat(v) * 100) : undefined;
const toMajor = (v: number | null | undefined) =>
  v != null ? String(v / 100) : "";
const toInt = (v: string) => (v ? Math.round(parseFloat(v)) : undefined);

/**
 * Add/edit a candidate listing. The price-related fields adapt to whether the
 * parent search is for renting (monthly rent + deposit) or buying (asking
 * price). Used from both the candidate list and the candidate detail page.
 */
export function CandidateDialog({
  searchId,
  searchType,
  open,
  onClose,
  editCandidate,
}: {
  searchId: string;
  searchType: "rent" | "buy";
  open: boolean;
  onClose: () => void;
  editCandidate?: Candidate;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const isRent = searchType === "rent";

  const create = trpc.apartmentSearch.candidates.create.useMutation({
    onSuccess: () => {
      u.apartmentSearch.candidates.list.invalidate({ searchId });
      u.apartmentSearch.counts.invalidate();
      toast.success(t("apartmentSearch.candidateAdded"));
      onClose();
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.apartmentSearch.candidates.update.useMutation({
    onSuccess: () => {
      u.apartmentSearch.candidates.list.invalidate({ searchId });
      if (editCandidate)
        u.apartmentSearch.candidates.get.invalidate({ id: editCandidate.id });
      toast.success(t("apartmentSearch.candidateUpdated"));
      onClose();
    },
    onError: e => toast.error(e.message),
  });

  const blank = {
    title: "",
    address: "",
    listingUrl: "",
    price: "",
    deposit: "",
    squareMeters: "",
    rooms: "",
    floor: "",
    availableDate: "",
    agentName: "",
    agentContact: "",
    rating: 0,
    notes: "",
  };
  const [f, setF] = useState(blank);

  useEffect(() => {
    if (open) {
      setF(
        editCandidate
          ? {
              title: editCandidate.title,
              address: editCandidate.address ?? "",
              listingUrl: editCandidate.listingUrl ?? "",
              price: toMajor(editCandidate.price),
              deposit: toMajor(editCandidate.deposit),
              squareMeters: editCandidate.squareMeters
                ? String(editCandidate.squareMeters)
                : "",
              rooms: editCandidate.rooms ? String(editCandidate.rooms) : "",
              floor:
                editCandidate.floor != null ? String(editCandidate.floor) : "",
              availableDate: editCandidate.availableDate ?? "",
              agentName: editCandidate.agentName ?? "",
              agentContact: editCandidate.agentContact ?? "",
              rating: editCandidate.rating ?? 0,
              notes: editCandidate.notes ?? "",
            }
          : blank
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editCandidate?.id]);

  const isPending = create.isPending || update.isPending;

  const submit = () => {
    if (!f.title.trim()) return;
    const data = {
      title: f.title.trim(),
      address: f.address || undefined,
      listingUrl: f.listingUrl || undefined,
      price: toCents(f.price),
      deposit: isRent ? toCents(f.deposit) : undefined,
      squareMeters: toInt(f.squareMeters),
      rooms: toInt(f.rooms),
      floor: toInt(f.floor),
      availableDate: f.availableDate || undefined,
      agentName: f.agentName || undefined,
      agentContact: f.agentContact || undefined,
      rating: f.rating > 0 ? f.rating : undefined,
      notes: f.notes || undefined,
    };
    if (editCandidate) update.mutate({ id: editCandidate.id, data });
    else create.mutate({ searchId, ...data });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editCandidate
              ? t("apartmentSearch.editCandidate")
              : t("apartmentSearch.addCandidate")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>{t("apartmentSearch.listingTitle")}</Label>
            <Input
              value={f.title}
              onChange={e => setF({ ...f, title: e.target.value })}
              placeholder={t("apartmentSearch.listingTitlePlaceholder")}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("apartmentSearch.address")}</Label>
            <Input
              value={f.address}
              onChange={e => setF({ ...f, address: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                {isRent
                  ? t("apartmentSearch.monthlyRent")
                  : t("apartmentSearch.askingPrice")}
              </Label>
              <Input
                type="number"
                min="0"
                value={f.price}
                onChange={e => setF({ ...f, price: e.target.value })}
                placeholder="0"
              />
            </div>
            {isRent && (
              <div className="space-y-1.5">
                <Label>{t("apartmentSearch.deposit")}</Label>
                <Input
                  type="number"
                  min="0"
                  value={f.deposit}
                  onChange={e => setF({ ...f, deposit: e.target.value })}
                  placeholder="0"
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t("apartmentSearch.size")}</Label>
              <Input
                type="number"
                min="0"
                value={f.squareMeters}
                onChange={e => setF({ ...f, squareMeters: e.target.value })}
                placeholder="m²"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("apartmentSearch.rooms")}</Label>
              <Input
                type="number"
                min="0"
                value={f.rooms}
                onChange={e => setF({ ...f, rooms: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("apartmentSearch.floor")}</Label>
              <Input
                type="number"
                value={f.floor}
                onChange={e => setF({ ...f, floor: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("apartmentSearch.availableFrom")}</Label>
              <Input
                type="date"
                value={f.availableDate}
                onChange={e => setF({ ...f, availableDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("apartmentSearch.listingUrl")}</Label>
              <Input
                type="url"
                inputMode="url"
                placeholder="https://"
                value={f.listingUrl}
                onChange={e => setF({ ...f, listingUrl: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("apartmentSearch.agentName")}</Label>
              <Input
                value={f.agentName}
                onChange={e => setF({ ...f, agentName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("apartmentSearch.agentContact")}</Label>
              <Input
                value={f.agentContact}
                onChange={e => setF({ ...f, agentContact: e.target.value })}
                placeholder="05x-xxx-xxxx"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("apartmentSearch.rating")}</Label>
            <StarRating
              value={f.rating}
              onChange={r => setF({ ...f, rating: r })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Textarea
              rows={2}
              value={f.notes}
              onChange={e => setF({ ...f, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={!f.title.trim() || isPending}
            >
              {isPending && (
                <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
              )}
              {editCandidate
                ? t("common.save")
                : t("apartmentSearch.addCandidate")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
