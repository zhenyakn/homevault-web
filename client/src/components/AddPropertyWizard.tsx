import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useProperty } from "@/contexts/PropertyContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Home,
  Building2,
  KeyRound,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSpecFields, SPEC_META } from "@/lib/propertySpecs";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

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

type FormValues = {
  mode: Mode;
  houseName: string;
  houseNickname: string;
  propertyType: string;
  address: string;
  latitude: string;
  longitude: string;
  squareMeters: string;
  rooms: string;
  floor: string;
  floors: string;
  gardenSize: string;
  parkingSpots: string;
  yearBuilt: string;
  hasStorage: boolean;
  hasElevator: boolean;
  hasShelter: boolean;
  purchasePrice: string;
  purchaseDate: string;
  monthlyRent: string;
  leaseStart: string;
  leaseEnd: string;
  deposit: string;
  landlord: string;
  addMortgage: boolean;
  lender: string;
  loanOriginal: string;
  loanBalance: string;
  loanRate: string;
  loanMonthly: string;
  createRentExpense: boolean;
  purchaseCosts: { name: string; amount: string; category: string }[];
};

const DEFAULTS: FormValues = {
  mode: "owned_personal",
  houseName: "",
  houseNickname: "",
  propertyType: "Apartment",
  address: "",
  latitude: "",
  longitude: "",
  squareMeters: "",
  rooms: "",
  floor: "",
  floors: "",
  gardenSize: "",
  parkingSpots: "",
  yearBuilt: "",
  hasStorage: false,
  hasElevator: false,
  hasShelter: false,
  purchasePrice: "",
  purchaseDate: "",
  monthlyRent: "",
  leaseStart: "",
  leaseEnd: "",
  deposit: "",
  landlord: "",
  addMortgage: false,
  lender: "",
  loanOriginal: "",
  loanBalance: "",
  loanRate: "",
  loanMonthly: "",
  createRentExpense: true,
  purchaseCosts: [],
};

const TOTAL_STEPS = 4;

/** Major currency units (e.g. ₪) → agorot (integer minor units). */
function toMinor(v: string): number | undefined {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}
function toInt(v: string): number | undefined {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}
function clean(v: string): string | undefined {
  const t = v.trim();
  return t === "" ? undefined : t;
}

/**
 * Multi-step "Add a property" wizard. Branches by how the user holds the
 * property (bought & rented out / bought personal / rented). Styled with
 * semantic tokens so it adapts to both the default and HomeVault (.hv-ui) UIs.
 * Replaces the old single-field AddPropertyDialog.
 */
export default function AddPropertyWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { switchProperty } = useProperty();
  const utils = trpc.useUtils();
  const [step, setStep] = useState(1);

  const form = useForm<FormValues>({ defaultValues: DEFAULTS });
  const { register, handleSubmit, watch, setValue, control, reset } = form;
  const costs = useFieldArray({ control, name: "purchaseCosts" });

  const mode = watch("mode");
  const isOwned = mode === "owned_rented" || mode === "owned_personal";
  const isRentedOut = mode === "owned_rented";
  const isTenant = mode === "rented";

  const createMutation = trpc.property.createWithWizard.useMutation({
    onSuccess: (data: any) => {
      utils.property.list.invalidate();
      if (data?.insertId) switchProperty(data.insertId);
      close();
    },
  });

  function close() {
    onOpenChange(false);
    // Reset after the close animation so the form doesn't flash empty.
    setTimeout(() => {
      reset(DEFAULTS);
      setStep(1);
    }, 200);
  }

  function next() {
    // Minimal gating: the only hard requirement is a name on step 2.
    if (step === 2 && !watch("houseName").trim()) return;
    setStep(s => Math.min(TOTAL_STEPS, s + 1));
  }
  function back() {
    setStep(s => Math.max(1, s - 1));
  }

  function onSubmit(v: FormValues) {
    const payload: any = {
      mode: v.mode,
      houseName: v.houseName.trim(),
      houseNickname: clean(v.houseNickname),
      propertyType: v.propertyType,
      address: clean(v.address),
      latitude: clean(v.latitude),
      longitude: clean(v.longitude),
      squareMeters: toInt(v.squareMeters),
      rooms: toInt(v.rooms),
      floor: toInt(v.floor),
      floors: toInt(v.floors),
      gardenSize: toInt(v.gardenSize),
      parkingSpots: toInt(v.parkingSpots),
      yearBuilt: toInt(v.yearBuilt),
      hasStorage: v.hasStorage,
      hasElevator: v.hasElevator,
      hasShelter: v.hasShelter,
    };

    if (isOwned) {
      payload.purchasePrice = toMinor(v.purchasePrice);
      payload.purchaseDate = clean(v.purchaseDate);
      if (v.addMortgage && toMinor(v.loanOriginal)) {
        payload.loan = {
          lender: clean(v.lender),
          originalAmount: toMinor(v.loanOriginal),
          currentBalance: toMinor(v.loanBalance),
          interestRate: parseFloat(v.loanRate) || undefined,
          monthlyPayment: toMinor(v.loanMonthly),
        };
      }
      const validCosts = v.purchaseCosts
        .filter(c => c.name.trim() && toMinor(c.amount))
        .map(c => ({
          name: c.name.trim(),
          amount: toMinor(c.amount)!,
          category: clean(c.category),
        }));
      if (validCosts.length) payload.purchaseCosts = validCosts;
    }

    if (isRentedOut || isTenant) {
      payload.monthlyRent = toMinor(v.monthlyRent);
      payload.leaseStart = clean(v.leaseStart);
      payload.leaseEnd = clean(v.leaseEnd);
      payload.deposit = toMinor(v.deposit);
      payload.landlord = clean(v.landlord);
    }

    if (isTenant && v.createRentExpense && toMinor(v.monthlyRent)) {
      payload.rentExpense = {
        amount: toMinor(v.monthlyRent)!,
        recurringInterval: "monthly",
        date: clean(v.leaseStart) ?? new Date().toISOString().slice(0, 10),
      };
    }

    createMutation.mutate(payload);
  }

  const stepTitle =
    step === 1
      ? t("wizard.title")
      : step === 2
        ? t("wizard.step2Title")
        : step === 3
          ? isTenant
            ? t("wizard.step3RentTitle")
            : t("wizard.step3PurchaseTitle")
          : t("wizard.reviewTitle");

  return (
    <Dialog open={open} onOpenChange={o => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>{stepTitle}</DialogTitle>
            <span className="text-xs text-muted-foreground shrink-0">
              {t("wizard.stepOf", { n: step, total: TOTAL_STEPS })}
            </span>
          </div>
          <Progress value={(step / TOTAL_STEPS) * 100} className="h-1.5 mt-2" />
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-1">
          {step === 1 && (
            <StepMode mode={mode} onPick={m => setValue("mode", m)} />
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Field label={t("wizard.name")} required>
                <Input
                  autoFocus
                  placeholder={t("settings.placeholderMyHome")}
                  {...register("houseName")}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("wizard.nickname")}>
                  <Input {...register("houseNickname")} />
                </Field>
                <Field label={t("wizard.type")}>
                  <Select
                    value={watch("propertyType")}
                    onValueChange={v => setValue("propertyType", v)}
                  >
                    <SelectTrigger>
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
              </div>
              <Field label={t("wizard.address")} hint={t("wizard.addressHint")}>
                <AddressAutocomplete
                  value={watch("address")}
                  placeholder={t("wizard.addressPlaceholder")}
                  onChange={text => {
                    setValue("address", text);
                    // Typing freely invalidates a previously picked location.
                    setValue("latitude", "");
                    setValue("longitude", "");
                  }}
                  onSelect={sel => {
                    setValue("address", sel.address);
                    setValue("latitude", sel.latitude);
                    setValue("longitude", sel.longitude);
                  }}
                />
              </Field>
              <SpecsFields form={form} />
            </div>
          )}

          {step === 3 && isOwned && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("wizard.purchasePrice")}>
                  <Input type="number" min={0} {...register("purchasePrice")} />
                </Field>
                <Field label={t("wizard.purchaseDate")}>
                  <Input type="date" {...register("purchaseDate")} />
                </Field>
              </div>

              <ToggleRow
                title={t("wizard.addMortgage")}
                desc={t("wizard.addMortgageDesc")}
                checked={watch("addMortgage")}
                onChange={c => setValue("addMortgage", c)}
              />
              {watch("addMortgage") && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 grid grid-cols-2 gap-3">
                  <Field label={t("wizard.lender")}>
                    <Input {...register("lender")} />
                  </Field>
                  <Field label={t("wizard.originalAmount")}>
                    <Input
                      type="number"
                      min={0}
                      {...register("loanOriginal")}
                    />
                  </Field>
                  <Field label={t("wizard.currentBalance")}>
                    <Input type="number" min={0} {...register("loanBalance")} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t("wizard.ratePct")}>
                      <Input
                        type="number"
                        step="0.01"
                        {...register("loanRate")}
                      />
                    </Field>
                    <Field label={t("wizard.monthly")}>
                      <Input
                        type="number"
                        min={0}
                        {...register("loanMonthly")}
                      />
                    </Field>
                  </div>
                </div>
              )}

              <div>
                <ToggleRow
                  title={t("wizard.addPurchaseCosts")}
                  desc={t("wizard.addPurchaseCostsDesc")}
                  checked={costs.fields.length > 0}
                  onChange={c =>
                    c
                      ? costs.append({
                          name: "",
                          amount: "",
                          category: "Other",
                        })
                      : costs.remove()
                  }
                />
                {costs.fields.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {costs.fields.map((f, i) => (
                      <div key={f.id} className="flex gap-2 items-center">
                        <Input
                          className="flex-1"
                          placeholder={t("wizard.costName")}
                          {...register(`purchaseCosts.${i}.name` as const)}
                        />
                        <Input
                          className="w-32"
                          type="number"
                          min={0}
                          placeholder={t("wizard.amount")}
                          {...register(`purchaseCosts.${i}.amount` as const)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => costs.remove(i)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        costs.append({
                          name: "",
                          amount: "",
                          category: "Other",
                        })
                      }
                    >
                      <Plus className="w-3.5 h-3.5 me-1" />
                      {t("wizard.addCost")}
                    </Button>
                  </div>
                )}
              </div>

              {isRentedOut && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("wizard.rentingOut")}
                  </p>
                  <RentalFields form={form} incomeLabel />
                  <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-2.5">
                    {t("wizard.landlordRentNote")}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && isTenant && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-2.5">
                {t("wizard.tenantNote")}
              </p>
              <RentalFields form={form} incomeLabel={false} />
              <ToggleRow
                title={t("wizard.createRentExpense")}
                desc={t("wizard.createRentExpenseDesc")}
                checked={watch("createRentExpense")}
                onChange={c => setValue("createRentExpense", c)}
              />
            </div>
          )}

          {step === 4 && <StepReview form={form} />}

          <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <span className="text-xs text-muted-foreground">
              {step === 4 ? t("wizard.switchNote") : t("wizard.changeLater")}
            </span>
            <div className="flex justify-end gap-2">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={back}
                >
                  <ArrowLeft className="w-3.5 h-3.5 me-1 rtl:rotate-180" />
                  {t("common.back")}
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={close}>
                  {t("common.cancel")}
                </Button>
              )}
              {step < TOTAL_STEPS ? (
                <Button type="button" size="sm" onClick={next}>
                  {t("wizard.next")}
                  <ArrowRight className="w-3.5 h-3.5 ms-1 rtl:rotate-180" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending
                    ? t("common.adding")
                    : t("wizard.createProperty")}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground/80">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <Switch checked={checked} onCheckedChange={onChange} />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}

function StepMode({ mode, onPick }: { mode: Mode; onPick: (m: Mode) => void }) {
  const { t } = useTranslation();
  const opts: { id: Mode; icon: typeof Home; title: string; desc: string }[] = [
    {
      id: "owned_rented",
      icon: Building2,
      title: t("wizard.modeOwnedRentedTitle"),
      desc: t("wizard.modeOwnedRentedDesc"),
    },
    {
      id: "owned_personal",
      icon: Home,
      title: t("wizard.modeOwnedPersonalTitle"),
      desc: t("wizard.modeOwnedPersonalDesc"),
    },
    {
      id: "rented",
      icon: KeyRound,
      title: t("wizard.modeRentedTitle"),
      desc: t("wizard.modeRentedDesc"),
    },
  ];
  return (
    <div>
      <p className="text-sm font-medium mb-3">{t("wizard.step1Q")}</p>
      <div className="grid sm:grid-cols-3 gap-3">
        {opts.map(o => {
          const Icon = o.icon;
          const sel = mode === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onPick(o.id)}
              className={cn(
                "text-start rounded-xl border p-4 transition-colors",
                sel
                  ? "border-primary bg-primary/5 ring-2 ring-primary/25"
                  : "border-border hover:border-primary/40"
              )}
            >
              <Icon
                className={cn(
                  "w-6 h-6 mb-2",
                  sel ? "text-primary" : "text-muted-foreground"
                )}
              />
              <div className="text-sm font-semibold">{o.title}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-snug">
                {o.desc}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Type-aware spec inputs: only renders the fields relevant to the chosen type. */
function SpecsFields({
  form,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
}) {
  const { t } = useTranslation();
  const { register, watch, setValue } = form;
  const fields = getSpecFields(watch("propertyType"));
  const numFields = fields.filter(f => SPEC_META[f].kind === "num");
  const boolFields = fields.filter(f => SPEC_META[f].kind === "bool");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {numFields.map(f => (
          <Field key={f} label={t(SPEC_META[f].labelKey)}>
            <Input type="number" min={0} {...register(f as keyof FormValues)} />
          </Field>
        ))}
      </div>
      {boolFields.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
          {boolFields.map(f => (
            <label key={f} className="flex items-center gap-2">
              <Switch
                checked={!!watch(f as keyof FormValues)}
                onCheckedChange={c => (setValue as any)(f, c)}
              />
              <span className="text-sm">{t(SPEC_META[f].labelKey)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function RentalFields({
  form,
  incomeLabel,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  incomeLabel: boolean;
}) {
  const { t } = useTranslation();
  const { register } = form;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field
        label={
          incomeLabel
            ? t("wizard.monthlyRentIncome")
            : t("wizard.monthlyRentPaid")
        }
      >
        <Input type="number" min={0} {...register("monthlyRent")} />
      </Field>
      <Field label={t("wizard.deposit")}>
        <Input type="number" min={0} {...register("deposit")} />
      </Field>
      <Field label={t("wizard.leaseStart")}>
        <Input type="date" {...register("leaseStart")} />
      </Field>
      <Field label={t("wizard.leaseEnd")}>
        <Input type="date" {...register("leaseEnd")} />
      </Field>
      <div className="col-span-2">
        <Field label={t("wizard.landlord")}>
          <Input {...register("landlord")} />
        </Field>
      </div>
    </div>
  );
}

function StepReview({
  form,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
}) {
  const { t } = useTranslation();
  const v = form.watch();
  const isOwned = v.mode === "owned_rented" || v.mode === "owned_personal";
  const isRentedOut = v.mode === "owned_rented";
  const isTenant = v.mode === "rented";

  const rows: [string, string][] = [];
  if (isOwned && v.purchasePrice)
    rows.push([
      t("wizard.purchasePrice"),
      `${v.purchasePrice}${v.purchaseDate ? ` · ${v.purchaseDate}` : ""}`,
    ]);
  if (v.squareMeters || v.rooms)
    rows.push([
      t("wizard.sizeM2"),
      [v.squareMeters && `${v.squareMeters} m²`, v.rooms && `${v.rooms} rooms`]
        .filter(Boolean)
        .join(" · "),
    ]);
  if (v.monthlyRent)
    rows.push([
      isTenant ? t("wizard.monthlyRentPaid") : t("wizard.monthlyRentIncome"),
      `${v.monthlyRent}${v.leaseEnd ? ` · ${t("wizard.leaseEnd")} ${v.leaseEnd}` : ""}`,
    ]);

  const created: string[] = [];
  if (isOwned && v.addMortgage && v.loanOriginal)
    created.push(t("wizard.willCreateMortgage", { lender: v.lender || "—" }));
  if (isOwned && v.purchaseCosts.some(c => c.name && c.amount))
    created.push(
      t("wizard.willCreatePurchaseCosts", {
        n: v.purchaseCosts.filter(c => c.name && c.amount).length,
      })
    );
  if (isTenant && v.createRentExpense && v.monthlyRent)
    created.push(t("wizard.willCreateRent"));
  if ((isRentedOut || isTenant) && v.leaseEnd)
    created.push(t("wizard.willCreateLeaseReminder", { date: v.leaseEnd }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center text-primary">
          <Home className="w-5 h-5" />
        </div>
        <div>
          <div className="font-semibold">{v.houseName || "—"}</div>
          <div className="text-xs text-muted-foreground">
            {[v.propertyType, v.address].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      <div className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
        {t(`propertyMode.${v.mode}`)}
      </div>
      <div className="divide-y divide-border">
        {rows.map(([k, val]) => (
          <div key={k} className="flex justify-between py-2 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">{val}</span>
          </div>
        ))}
      </div>
      {created.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t("wizard.recordsCreated")}
          </p>
          <div className="space-y-1.5">
            {created.map(c => (
              <div
                key={c}
                className="flex items-center gap-2 text-sm text-primary"
              >
                <Check className="w-4 h-4" />
                {c}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
