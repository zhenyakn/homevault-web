import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSpecFields, SPEC_META, type SpecField } from "@/lib/propertySpecs";

type Candidate = RouterOutputs["apartmentSearch"]["candidates"]["list"][number];

// Property types offered — mirrors the Add-Property wizard.
const PROPERTY_TYPES = [
  "Apartment",
  "House",
  "Villa",
  "Townhouse",
  "Studio",
  "Penthouse",
  "Other",
];

// The numeric spec fields a candidate can carry (the bool ones are toggles).
const NUM_SPEC_FIELDS = [
  "squareMeters",
  "gardenSize",
  "rooms",
  "floor",
  "floors",
  "parkingSpots",
  "yearBuilt",
] as const;
const BOOL_SPEC_FIELDS = ["hasElevator", "hasStorage"] as const;

const toCents = (v: string) =>
  v ? Math.round(parseFloat(v) * 100) : undefined;
const toMajor = (v: number | null | undefined) =>
  v != null ? String(v / 100) : "";
const toInt = (v: string) => (v ? Math.round(parseFloat(v)) : undefined);
const numStr = (v: number | null | undefined) => (v != null ? String(v) : "");

type SpecState = Record<(typeof NUM_SPEC_FIELDS)[number], string> &
  Record<(typeof BOOL_SPEC_FIELDS)[number], boolean>;

/**
 * Add/edit a candidate listing. Captures the same technical details as a real
 * property (driven by propertyType via propertySpecs), so a converted candidate
 * loses nothing. Price fields adapt to rent (monthly + deposit) vs buy (asking).
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
    propertyType: "Apartment",
    availableDate: "",
    agentName: "",
    agentContact: "",
    rating: "",
    notes: "",
    squareMeters: "",
    gardenSize: "",
    rooms: "",
    floor: "",
    floors: "",
    parkingSpots: "",
    yearBuilt: "",
    hasElevator: false,
    hasStorage: false,
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
              propertyType: editCandidate.propertyType ?? "Apartment",
              availableDate: editCandidate.availableDate ?? "",
              agentName: editCandidate.agentName ?? "",
              agentContact: editCandidate.agentContact ?? "",
              rating: numStr(editCandidate.rating),
              notes: editCandidate.notes ?? "",
              squareMeters: numStr(editCandidate.squareMeters),
              gardenSize: numStr(editCandidate.gardenSize),
              rooms: numStr(editCandidate.rooms),
              floor: numStr(editCandidate.floor),
              floors: numStr(editCandidate.floors),
              parkingSpots: numStr(editCandidate.parkingSpots),
              yearBuilt: numStr(editCandidate.yearBuilt),
              hasElevator: editCandidate.hasElevator ?? false,
              hasStorage: editCandidate.hasStorage ?? false,
            }
          : blank
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editCandidate?.id]);

  const isPending = create.isPending || update.isPending;
  const specFields = getSpecFields(f.propertyType);

  const submit = () => {
    if (!f.title.trim()) return;
    const score = toInt(f.rating);
    // Only persist the spec fields relevant to the chosen property type;
    // irrelevant ones are cleared so a type switch doesn't keep stale values.
    const rel = new Set<SpecField>(specFields);
    const num = (field: SpecField, v: string) =>
      rel.has(field) ? toInt(v) : undefined;
    const bool = (field: SpecField, v: boolean) =>
      rel.has(field) ? v : undefined;
    const data = {
      title: f.title.trim(),
      address: f.address || undefined,
      listingUrl: f.listingUrl || undefined,
      price: toCents(f.price),
      deposit: isRent ? toCents(f.deposit) : undefined,
      propertyType: f.propertyType,
      availableDate: f.availableDate || undefined,
      agentName: f.agentName || undefined,
      agentContact: f.agentContact || undefined,
      rating: score && score >= 1 && score <= 10 ? score : undefined,
      notes: f.notes || undefined,
      squareMeters: num("squareMeters", f.squareMeters),
      gardenSize: num("gardenSize", f.gardenSize),
      rooms: num("rooms", f.rooms),
      floor: num("floor", f.floor),
      floors: num("floors", f.floors),
      parkingSpots: num("parkingSpots", f.parkingSpots),
      yearBuilt: num("yearBuilt", f.yearBuilt),
      hasElevator: bool("hasElevator", f.hasElevator),
      hasStorage: bool("hasStorage", f.hasStorage),
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

          {/* Technical details — type-relevant, mirroring real properties. */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("apartmentSearch.technicalDetails")}
            </p>
            <div className="space-y-1.5">
              <Label>{t("apartmentSearch.propertyType")}</Label>
              <Select
                value={f.propertyType}
                onValueChange={v => setF({ ...f, propertyType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map(pt => (
                    <SelectItem key={pt} value={pt}>
                      {t(`propertyType.${pt}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {specFields
                .filter(field => SPEC_META[field].kind === "num")
                .map(field => (
                  <div key={field} className="space-y-1.5">
                    <Label>{t(SPEC_META[field].labelKey)}</Label>
                    <Input
                      type="number"
                      value={
                        (f as SpecState)[
                          field as (typeof NUM_SPEC_FIELDS)[number]
                        ]
                      }
                      onChange={e => setF({ ...f, [field]: e.target.value })}
                    />
                  </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {specFields
                .filter(field => SPEC_META[field].kind === "bool")
                .map(field => (
                  <label
                    key={field}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Switch
                      checked={
                        (f as SpecState)[
                          field as (typeof BOOL_SPEC_FIELDS)[number]
                        ]
                      }
                      onCheckedChange={v => setF({ ...f, [field]: v })}
                    />
                    {t(SPEC_META[field].labelKey)}
                  </label>
                ))}
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
            <Label>{t("apartmentSearch.scoreLabel")}</Label>
            <Input
              type="number"
              min="1"
              max="10"
              value={f.rating}
              onChange={e => setF({ ...f, rating: e.target.value })}
              placeholder={t("apartmentSearch.scorePlaceholder")}
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
