import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Loose shape — the full property row returned by trpc.property.list. */
type Property = Record<string, any>;
type Mode = "owned_rented" | "owned_personal" | "rented";

const PROPERTY_TYPES = [
  "Apartment",
  "House",
  "Villa",
  "Townhouse",
  "Studio",
  "Penthouse",
  "Other",
];

/** Save a partial update to a specific property (not necessarily the active one). */
function usePropertySave() {
  const utils = trpc.useUtils();
  const m = trpc.property.update.useMutation({
    onSuccess: () => {
      utils.property.list.invalidate();
      utils.dashboard.portfolio.invalidate();
      utils.property.get.invalidate();
    },
  });
  return {
    save: (propertyId: number, data: Record<string, unknown>) =>
      m.mutate({ propertyId, ...data } as any),
    isPending: m.isPending,
  };
}

/** agorot (minor units) → major display string, and back. */
const toMajor = (v: number | null | undefined) =>
  v == null ? "" : String(v / 100);
const toMinor = (s: string): number | null => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2.5 border-b border-border/70 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <Label className="text-sm text-foreground/90">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="w-full sm:w-52 sm:shrink-0">{children}</div>
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-5 mb-1 first:mt-0">
      {children}
    </p>
  );
}

/** Text input that saves on blur when the value changed. */
function TextField({
  value,
  onSave,
  placeholder,
  type = "text",
  testId,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  type?: string;
  testId?: string;
}) {
  return (
    <Input
      key={value}
      defaultValue={value}
      type={type}
      placeholder={placeholder}
      data-testid={testId}
      className="h-8 text-sm"
      onBlur={e => {
        if (e.target.value !== value) onSave(e.target.value);
      }}
    />
  );
}

/** Money input shown in major units, persisted as agorot. */
function MoneyField({
  value,
  currency,
  onSave,
}: {
  value: number | null | undefined;
  currency: string;
  onSave: (minor: number | null) => void;
}) {
  const major = toMajor(value);
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {currency}
      </span>
      <Input
        key={major}
        defaultValue={major}
        type="number"
        min={0}
        className="h-8 text-sm pl-7 text-right"
        onBlur={e => {
          if (e.target.value !== major) onSave(toMinor(e.target.value));
        }}
      />
    </div>
  );
}

function NumField({
  value,
  onSave,
}: {
  value: number | null | undefined;
  onSave: (n: number | null) => void;
}) {
  const s = value == null ? "" : String(value);
  return (
    <Input
      key={s}
      defaultValue={s}
      type="number"
      className="h-8 text-sm text-right"
      onBlur={e => {
        if (e.target.value !== s) {
          const n = parseInt(e.target.value, 10);
          onSave(Number.isFinite(n) ? n : null);
        }
      }}
    />
  );
}

/**
 * Tabbed per-property editor: Overview (read-only glance), Details (identity /
 * location / specs, relocated from Settings), Financials (purchase + mortgage
 * for owned modes, lease/rent for rentals). Mode-aware. Styled with semantic
 * tokens so it works in both the default and HomeVault UIs.
 */
export default function PropertyEditor({
  property,
  metrics,
}: {
  property: Property;
  metrics?: {
    monthSpent: number;
    openRepairsCount: number;
    outstandingLoanBalance: number;
  };
}) {
  const { t } = useTranslation();
  const { save } = usePropertySave();
  const id = property.id as number;
  const currency = (property.currency as string) || "₪";
  const currencyCode = (property.currencyCode as string) || "ILS";
  const mode = (property.propertyMode as Mode) || "owned_personal";
  const isOwned = mode === "owned_rented" || mode === "owned_personal";
  const isRentedOut = mode === "owned_rented";
  const isRental = mode === "owned_rented" || mode === "rented";

  const set = (data: Record<string, unknown>) => save(id, data);
  const money = (v: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(v / 100);

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="mb-4 grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
        <TabsTrigger value="overview">{t("portfolio.tabOverview")}</TabsTrigger>
        <TabsTrigger value="details">{t("portfolio.tabDetails")}</TabsTrigger>
        <TabsTrigger value="financials">
          {t("portfolio.tabFinancials")}
        </TabsTrigger>
      </TabsList>

      {/* ── Overview ──────────────────────────────────────────────────── */}
      <TabsContent value="overview" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric
            label={t("portfolio.thisMonth")}
            value={money(metrics?.monthSpent ?? 0)}
          />
          <Metric
            label={t("portfolio.openRepairs")}
            value={String(metrics?.openRepairsCount ?? 0)}
          />
          {isRental ? (
            <Metric
              label={
                isRentedOut
                  ? t("portfolio.rentalIncome")
                  : t("portfolio.rentPaid")
              }
              value={property.monthlyRent ? money(property.monthlyRent) : "—"}
              className="col-span-2 sm:col-span-1"
              accent
            />
          ) : (
            <Metric
              label={t("portfolio.loanBalance")}
              value={money(metrics?.outstandingLoanBalance ?? 0)}
              className="col-span-2 sm:col-span-1"
            />
          )}
        </div>
        {isRental && property.leaseEnd && (
          <p className="text-xs text-muted-foreground">
            {t("portfolio.leaseUntil", { date: property.leaseEnd })}
          </p>
        )}
      </TabsContent>

      {/* ── Details ───────────────────────────────────────────────────── */}
      <TabsContent value="details">
        <GroupTitle>{t("portfolio.identity")}</GroupTitle>
        <Row label={t("wizard.name")}>
          <TextField
            value={property.houseName ?? ""}
            onSave={v => set({ houseName: v })}
          />
        </Row>
        <Row label={t("wizard.nickname")}>
          <TextField
            value={property.houseNickname ?? ""}
            onSave={v => set({ houseNickname: v })}
            testId="property-nickname"
          />
        </Row>
        <Row label={t("wizard.type")}>
          <Select
            value={property.propertyType || "Apartment"}
            onValueChange={v => set({ propertyType: v })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPES.map(p => (
                <SelectItem key={p} value={p}>
                  {t(`propertyType.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label={t("portfolio.howHeld")} hint={t("portfolio.howHeldHint")}>
          <ModeSelect mode={mode} onChange={m => set({ propertyMode: m })} />
        </Row>

        <GroupTitle>{t("portfolio.location")}</GroupTitle>
        <div className="py-2.5 border-b border-border/70">
          <Textarea
            key={property.address ?? ""}
            defaultValue={property.address ?? ""}
            rows={2}
            placeholder={t("wizard.address")}
            className="text-sm resize-none"
            onBlur={e => {
              if (e.target.value !== (property.address ?? ""))
                set({ address: e.target.value });
            }}
          />
          {property.latitude && property.longitude && (
            <p className="text-xs text-muted-foreground mt-1.5">
              {parseFloat(property.latitude).toFixed(4)},{" "}
              {parseFloat(property.longitude).toFixed(4)}
            </p>
          )}
        </div>

        <GroupTitle>{t("portfolio.specs")}</GroupTitle>
        <Row label={t("wizard.sizeM2")}>
          <NumField
            value={property.squareMeters}
            onSave={n => set({ squareMeters: n ?? undefined })}
          />
        </Row>
        <Row label={t("wizard.rooms")}>
          <NumField
            value={property.rooms}
            onSave={n => set({ rooms: n ?? undefined })}
          />
        </Row>
        <Row label={t("wizard.floor")}>
          <NumField
            value={property.floor}
            onSave={n => set({ floor: n ?? undefined })}
          />
        </Row>
        <Row label={t("wizard.parking")}>
          <NumField
            value={property.parkingSpots}
            onSave={n => set({ parkingSpots: n ?? undefined })}
          />
        </Row>
        <Row label={t("wizard.yearBuilt")}>
          <NumField
            value={property.yearBuilt}
            onSave={n => set({ yearBuilt: n ?? undefined })}
          />
        </Row>
        <Row label={t("wizard.storage")}>
          <Switch
            checked={!!property.hasStorage}
            onCheckedChange={c => set({ hasStorage: c })}
          />
        </Row>
      </TabsContent>

      {/* ── Financials ────────────────────────────────────────────────── */}
      <TabsContent value="financials">
        {!isOwned && (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-2.5 mb-3">
            {t("portfolio.rentedNote")}
          </p>
        )}

        {isOwned && (
          <>
            <GroupTitle>{t("portfolio.purchase")}</GroupTitle>
            <Row label={t("wizard.purchasePrice")}>
              <MoneyField
                value={property.purchasePrice}
                currency={currency}
                onSave={n => set({ purchasePrice: n ?? undefined })}
              />
            </Row>
            <Row label={t("wizard.purchaseDate")}>
              <TextField
                type="date"
                value={property.purchaseDate ?? ""}
                onSave={v => set({ purchaseDate: v })}
              />
            </Row>
          </>
        )}

        {isRental && (
          <>
            <GroupTitle>
              {isRentedOut ? t("portfolio.rentingOut") : t("portfolio.lease")}
            </GroupTitle>
            <Row
              label={
                isRentedOut
                  ? t("wizard.monthlyRentIncome")
                  : t("wizard.monthlyRentPaid")
              }
            >
              <MoneyField
                value={property.monthlyRent}
                currency={currency}
                onSave={n => set({ monthlyRent: n ?? undefined })}
              />
            </Row>
            <Row label={t("wizard.leaseStart")}>
              <TextField
                type="date"
                value={property.leaseStart ?? ""}
                onSave={v => set({ leaseStart: v })}
              />
            </Row>
            <Row label={t("wizard.leaseEnd")}>
              <TextField
                type="date"
                value={property.leaseEnd ?? ""}
                onSave={v => set({ leaseEnd: v })}
              />
            </Row>
            <Row label={t("wizard.deposit")}>
              <MoneyField
                value={property.deposit}
                currency={currency}
                onSave={n => set({ deposit: n ?? undefined })}
              />
            </Row>
            <Row label={t("wizard.landlord")}>
              <TextField
                value={property.landlord ?? ""}
                onSave={v => set({ landlord: v })}
              />
            </Row>
            {isRentedOut && (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-2.5 mt-3">
                {t("wizard.landlordRentNote")}
              </p>
            )}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

function Metric({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg bg-muted/50 p-3 text-center", className)}>
      <p
        className={cn(
          "text-sm sm:text-base font-semibold tabular-nums truncate",
          accent && "text-primary"
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function ModeSelect({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  const { t } = useTranslation();
  const opts: Mode[] = ["owned_rented", "owned_personal", "rented"];
  return (
    <Select value={mode} onValueChange={v => onChange(v as Mode)}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opts.map(m => (
          <SelectItem key={m} value={m}>
            {t(`propertyMode.${m}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
