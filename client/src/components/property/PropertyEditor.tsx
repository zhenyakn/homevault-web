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
import { KeyRound, MapPin, Ruler, Tag, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSpecFields, SPEC_META } from "@/lib/propertySpecs";

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

const INPUT_CLS = "h-9 text-sm";

/** A titled group of fields with an icon header, divided from its siblings. */
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Tag;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      {children}
    </section>
  );
}

/** A single labelled control, label stacked above. */
function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A short muted note / callout. */
function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
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
      className={INPUT_CLS}
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
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {currency}
      </span>
      <Input
        key={major}
        defaultValue={major}
        type="number"
        min={0}
        className={cn(INPUT_CLS, "pl-8 text-right")}
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
      className={cn(INPUT_CLS, "text-right")}
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
 * tokens so it works in both the default and HomeVault UIs, and grouped into
 * clean sections so it reads well on mobile.
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

  // Spec fields relevant to this property type (e.g. houses ask for a garden
  // and number of floors; apartments ask for the storey and an elevator).
  const specFields = getSpecFields(property.propertyType);
  const numSpecs = specFields.filter(f => SPEC_META[f].kind === "num");
  const boolSpecs = specFields.filter(f => SPEC_META[f].kind === "bool");

  const set = (data: Record<string, unknown>) => save(id, data);
  const money = (v: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(v / 100);

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="mb-5 grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
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
      <TabsContent value="details" className="space-y-5">
        <Section icon={Tag} title={t("portfolio.identity")}>
          <Field label={t("wizard.name")}>
            <TextField
              value={property.houseName ?? ""}
              onSave={v => set({ houseName: v })}
            />
          </Field>
          <Field label={t("wizard.nickname")}>
            <TextField
              value={property.houseNickname ?? ""}
              onSave={v => set({ houseNickname: v })}
              testId="property-nickname"
            />
          </Field>
          <Field label={t("wizard.type")}>
            <Select
              value={property.propertyType || "Apartment"}
              onValueChange={v => set({ propertyType: v })}
            >
              <SelectTrigger className={INPUT_CLS}>
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
          </Field>
          <Field
            label={t("portfolio.howHeld")}
            hint={t("portfolio.howHeldHint")}
          >
            <ModeSelect mode={mode} onChange={m => set({ propertyMode: m })} />
          </Field>
        </Section>

        <Section icon={MapPin} title={t("portfolio.location")}>
          <Textarea
            key={property.address ?? ""}
            defaultValue={property.address ?? ""}
            rows={2}
            placeholder={t("wizard.address")}
            className="resize-none text-sm"
            onBlur={e => {
              if (e.target.value !== (property.address ?? ""))
                set({ address: e.target.value });
            }}
          />
          {property.latitude && property.longitude && (
            <p className="text-[11px] text-muted-foreground">
              {parseFloat(property.latitude).toFixed(4)},{" "}
              {parseFloat(property.longitude).toFixed(4)}
            </p>
          )}
        </Section>

        <Section icon={Ruler} title={t("portfolio.specs")}>
          <div className="grid grid-cols-2 gap-3">
            {numSpecs.map(f => (
              <Field key={f} label={t(SPEC_META[f].labelKey)}>
                <NumField
                  value={property[f]}
                  onSave={n => set({ [f]: n ?? undefined })}
                />
              </Field>
            ))}
          </div>
          {boolSpecs.map(f => (
            <div
              key={f}
              className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5"
            >
              <Label className="text-sm">{t(SPEC_META[f].labelKey)}</Label>
              <Switch
                checked={!!property[f]}
                onCheckedChange={c => set({ [f]: c })}
              />
            </div>
          ))}
        </Section>
      </TabsContent>

      {/* ── Financials ────────────────────────────────────────────────── */}
      <TabsContent value="financials" className="space-y-5">
        {!isOwned && <Callout>{t("portfolio.rentedNote")}</Callout>}

        {isOwned && (
          <Section icon={Wallet} title={t("portfolio.purchase")}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("wizard.purchasePrice")}>
                <MoneyField
                  value={property.purchasePrice}
                  currency={currency}
                  onSave={n => set({ purchasePrice: n ?? undefined })}
                />
              </Field>
              <Field label={t("wizard.purchaseDate")}>
                <TextField
                  type="date"
                  value={property.purchaseDate ?? ""}
                  onSave={v => set({ purchaseDate: v })}
                />
              </Field>
            </div>
          </Section>
        )}

        {isRental && (
          <Section
            icon={KeyRound}
            title={
              isRentedOut ? t("portfolio.rentingOut") : t("portfolio.lease")
            }
          >
            <Field
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
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("wizard.leaseStart")}>
                <TextField
                  type="date"
                  value={property.leaseStart ?? ""}
                  onSave={v => set({ leaseStart: v })}
                />
              </Field>
              <Field label={t("wizard.leaseEnd")}>
                <TextField
                  type="date"
                  value={property.leaseEnd ?? ""}
                  onSave={v => set({ leaseEnd: v })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("wizard.deposit")}>
                <MoneyField
                  value={property.deposit}
                  currency={currency}
                  onSave={n => set({ deposit: n ?? undefined })}
                />
              </Field>
              <Field label={t("wizard.landlord")}>
                <TextField
                  value={property.landlord ?? ""}
                  onSave={v => set({ landlord: v })}
                />
              </Field>
            </div>
            {isRentedOut && <Callout>{t("wizard.landlordRentNote")}</Callout>}
          </Section>
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
      <SelectTrigger className={INPUT_CLS}>
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
