/**
 * Settings
 *
 * Pattern: Vercel / Linear / GitHub
 *  - Side nav: text only, no icons, small font (flips to right in RTL)
 *  - Groups: border + divide-y only, bg-background (no elevation)
 *  - Rows: label left / control right, 52px min-height
 *  - Global pending indicator in content header — no per-field badges
 *  - Auto-save on every change (blur for text, change for toggles/selects)
 *  - No Save buttons, no placeholder cards
 *  - Address = text input only, map lives on the dashboard
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProperty } from "@/contexts/PropertyContext";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Check,
  ChevronsUpDown,
  AlertTriangle,
  Download,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  Trash2,
  RefreshCw,
  Cloud,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  Server,
  Info,
  Calendar as CalendarIcon,
  Map as MapIcon,
  Home,
  Wallet,
  Users,
  Globe,
  Bell,
  Blocks,
  Palette,
  Database,
  Mail,
  Send,
  MessageCircle,
  Smartphone,
  Copy,
  type LucideIcon,
} from "lucide-react";
import { csrfHeaders } from "@/lib/csrf";
import BotPreview from "@/components/BotPreview";
import { subscribeToWebPush, webPushSupported } from "@/lib/webpush";

type ChannelKey =
  | "inapp"
  | "push"
  | "email"
  | "webpush"
  | "telegram"
  | "whatsapp";
const CHANNEL_ORDER: ChannelKey[] = [
  "inapp",
  "push",
  "email",
  "webpush",
  "telegram",
  "whatsapp",
];

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV_IDS = [
  "property",
  "purchase",
  "household",
  "regional",
  "notifications",
  "integrations",
  "appearance",
  "data",
] as const;
type SID = (typeof NAV_IDS)[number];

/** Nav items grouped into logical sections with a leading icon. */
const NAV_GROUPS: {
  groupKey: string;
  items: { id: SID; icon: LucideIcon }[];
}[] = [
  {
    groupKey: "property",
    items: [
      { id: "property", icon: Home },
      { id: "purchase", icon: Wallet },
      { id: "household", icon: Users },
    ],
  },
  {
    groupKey: "preferences",
    items: [
      { id: "regional", icon: Globe },
      { id: "notifications", icon: Bell },
      { id: "appearance", icon: Palette },
    ],
  },
  {
    groupKey: "system",
    items: [
      { id: "integrations", icon: Blocks },
      { id: "data", icon: Database },
    ],
  },
];

/** Flattened, group-ordered list for the mobile nav strip. */
const NAV_FLAT = NAV_GROUPS.flatMap(g => g.items);

// ─── Layout ───────────────────────────────────────────────────────────────────

function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <p className="px-1 text-xs font-medium text-muted-foreground">
          {label}
        </p>
      )}
      <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3 min-h-[52px]">
      <div className="min-w-0 flex-1">
        <label
          htmlFor={htmlFor}
          className={cn(
            "block text-sm font-medium leading-none",
            htmlFor && "cursor-pointer"
          )}
        >
          {label}
        </label>
        {hint && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
            {hint}
          </p>
        )}
      </div>
      <div className="shrink-0 flex items-center">{children}</div>
    </div>
  );
}

function FullRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-3.5 space-y-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Design-system primitives ───────────────────────────────────────────────

/** Standard width for a section's right-hand control, so every form field in
 *  the page aligns to one column. Short numeric inputs use NUM_W. */
const CONTROL_W = "w-48";
const NUM_W = "w-24";

/** Section title + one-line description + auto-save indicator. Used by every
 *  settings section so the hierarchy and spacing are identical across pages. */
function SectionHeader({
  title,
  description,
  pending,
}: {
  title: string;
  description?: string;
  pending?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h2 className="text-base font-semibold leading-none">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground leading-snug">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0 pt-0.5">
        <Pending show={pending ?? false} />
      </div>
    </div>
  );
}

/** Inline notice. Wraps the shared Alert with semantic intent colors so we
 *  stop hand-rolling amber/destructive blocks throughout the page. */
function Callout({
  variant = "info",
  icon,
  children,
  className,
}: {
  variant?: "info" | "warning" | "success";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const styles: Record<string, string> = {
    info: "border-border bg-muted/40 text-foreground [&>svg]:text-muted-foreground",
    warning:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400",
    success:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400",
  };
  const fallbackIcon =
    variant === "warning" ? (
      <AlertTriangle />
    ) : variant === "success" ? (
      <CheckCircle2 />
    ) : (
      <Info />
    );
  return (
    <Alert className={cn(styles[variant], className)}>
      {icon ?? fallbackIcon}
      <AlertDescription className="text-current/90">
        {children}
      </AlertDescription>
    </Alert>
  );
}

/** Labelled sub-input used inside the storage config forms (Local / S3 /
 *  Drive) so label spacing and input height are uniform. */
function SubField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Highlighted summary figure (e.g. total invested). */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

/** Destructive confirmation modal with an optional type-to-confirm phrase.
 *  Replaces the inline expand-in-place danger blocks. */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmPhrase,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: ReactNode;
  confirmPhrase?: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const [phrase, setPhrase] = useState("");
  useEffect(() => {
    if (!open) setPhrase("");
  }, [open]);
  const ready = !confirmPhrase || phrase === confirmPhrase;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <div>{description}</div>
              {confirmPhrase && (
                <Input
                  value={phrase}
                  placeholder={confirmPhrase}
                  className="h-9 text-sm"
                  onChange={e => setPhrase(e.target.value)}
                  autoFocus
                />
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              "bg-destructive text-white hover:bg-destructive/90",
              (!ready || pending) && "pointer-events-none opacity-50"
            )}
            disabled={!ready || pending}
            onClick={e => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Input helpers ────────────────────────────────────────────────────────────

function Field({
  id,
  value,
  onSave,
  placeholder,
  type = "text",
  min,
  max,
  step,
  width = CONTROL_W,
}: {
  id?: string;
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  step?: string;
  width?: string;
}) {
  const [v, setV] = useState(value);
  const dirty = useRef(false);
  useEffect(() => {
    setV(value);
  }, [value]);

  const commit = () => {
    if (!dirty.current) return;
    onSave(v);
    dirty.current = false;
  };

  return (
    <Input
      id={id}
      type={type}
      min={min}
      max={max}
      step={step}
      value={v}
      placeholder={placeholder}
      className={cn("h-8 text-sm", width)}
      onChange={e => {
        setV(e.target.value);
        dirty.current = true;
      }}
      onBlur={commit}
      onKeyDown={e =>
        e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()
      }
    />
  );
}

function Combobox({
  value,
  onSelect,
  options,
  placeholder = "Select…",
  search = "Search…",
  width = CONTROL_W,
}: {
  value: string;
  onSelect: (v: string) => void;
  options: { value: string; label: string; sub?: string }[];
  placeholder?: string;
  search?: string;
  width?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const sel = options.find(o => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("h-8 justify-between text-sm font-normal", width)}
        >
          <span className="truncate">{sel?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", width)} align="end">
        <Command>
          <CommandInput placeholder={search} className="h-8 text-sm" />
          <CommandList>
            <CommandEmpty>{t("settings.noResults")}</CommandEmpty>
            <CommandGroup>
              {options.map(o => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  keywords={[o.label, o.sub ?? ""]}
                  onSelect={() => {
                    onSelect(o.value);
                    setOpen(false);
                  }}
                  className="text-sm"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5 shrink-0",
                      value === o.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span>{o.label}</span>
                  {o.sub && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {o.sub}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Pending({ show }: { show: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity duration-300",
        show ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      {t("common.saving")}
    </span>
  );
}

// ─── Static options ───────────────────────────────────────────────────────────

const CURRENCIES = [
  { value: "ILS", label: "ILS", sub: "Israeli Shekel ₪" },
  { value: "USD", label: "USD", sub: "US Dollar $" },
  { value: "EUR", label: "EUR", sub: "Euro €" },
  { value: "GBP", label: "GBP", sub: "British Pound £" },
  { value: "JPY", label: "JPY", sub: "Japanese Yen ¥" },
  { value: "CAD", label: "CAD", sub: "Canadian Dollar CA$" },
  { value: "AUD", label: "AUD", sub: "Australian Dollar A$" },
  { value: "CHF", label: "CHF", sub: "Swiss Franc Fr" },
  { value: "SGD", label: "SGD", sub: "Singapore Dollar S$" },
  { value: "AED", label: "AED", sub: "UAE Dirham د.إ" },
];
const SYMBOLS: Record<string, string> = {
  ILS: "₪",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CAD: "CA$",
  AUD: "A$",
  CHF: "Fr",
  SGD: "S$",
  AED: "د.إ",
};
const TIMEZONES = [
  { value: "Asia/Jerusalem", label: "Asia/Jerusalem", sub: "UTC+3" },
  { value: "Asia/Dubai", label: "Asia/Dubai", sub: "UTC+4" },
  { value: "Asia/Riyadh", label: "Asia/Riyadh", sub: "UTC+3" },
  { value: "Europe/London", label: "Europe/London", sub: "UTC+1" },
  { value: "Europe/Paris", label: "Europe/Paris", sub: "UTC+2" },
  { value: "Europe/Berlin", label: "Europe/Berlin", sub: "UTC+2" },
  { value: "Europe/Amsterdam", label: "Europe/Amsterdam", sub: "UTC+2" },
  { value: "America/New_York", label: "America/New_York", sub: "UTC-4" },
  { value: "America/Chicago", label: "America/Chicago", sub: "UTC-5" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles", sub: "UTC-7" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo", sub: "UTC-3" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo", sub: "UTC+9" },
  { value: "Asia/Singapore", label: "Asia/Singapore", sub: "UTC+8" },
  { value: "Australia/Sydney", label: "Australia/Sydney", sub: "UTC+10" },
  { value: "UTC", label: "UTC", sub: "UTC+0" },
];

// ─── Sections ─────────────────────────────────────────────────────────────────

function PropertySection({ p }: { p: any }) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({
    onSuccess: () => u.property.get.invalidate(),
    onError: e => toast.error(e.message),
  });
  const save = useCallback((d: any) => m.mutate(d), [m]);
  const g = (k: string, fb: any = "") => p?.[k] ?? fb;

  const specs = [
    {
      k: "squareMeters",
      lKey: "settings.size",
      placeholder: t("settings.sqm"),
      suffix: t("settings.sqm"),
    },
    { k: "rooms", lKey: "settings.rooms", placeholder: "0", step: "0.5" },
    { k: "floor", lKey: "settings.floor", placeholder: "0" },
    { k: "parkingSpots", lKey: "settings.parking", placeholder: "0", min: 0 },
    {
      k: "yearBuilt",
      lKey: "settings.yearBuilt",
      placeholder: "1998",
      min: 1800,
      max: new Date().getFullYear(),
    },
  ] as const;

  return (
    <div className="space-y-5">
      <SectionHeader
        title={t("settings.property")}
        description={t("settings.propertyDesc")}
        pending={m.isPending}
      />

      <Group label={t("settings.identity")}>
        <Row
          label={t("common.name")}
          hint={t("settings.propertyNameHint")}
          htmlFor="p-name"
        >
          <Field
            id="p-name"
            value={g("houseName")}
            placeholder={t("settings.placeholderMyHome")}
            onSave={v => save({ houseName: v })}
          />
        </Row>
        <Row
          label={t("settings.nickname")}
          hint={t("settings.nicknameHint")}
          htmlFor="p-nick"
        >
          <Field
            id="p-nick"
            value={g("houseNickname")}
            placeholder={t("settings.placeholderHome")}
            onSave={v => save({ houseNickname: v })}
          />
        </Row>
        <Row label={t("common.type")}>
          <Select
            value={g("propertyType") || "Apartment"}
            onValueChange={v => save({ propertyType: v })}
          >
            <SelectTrigger className={cn("h-8 text-sm", CONTROL_W)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "Apartment",
                "House",
                "Villa",
                "Townhouse",
                "Studio",
                "Penthouse",
                "Other",
              ].map(ptype => (
                <SelectItem key={ptype} value={ptype}>
                  {t(`propertyType.${ptype}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Group>

      <Group label={t("settings.location")}>
        <FullRow label={t("settings.address")} hint={t("settings.addressHint")}>
          <div className="flex gap-2">
            <Textarea
              key={g("address")}
              defaultValue={g("address")}
              placeholder={t("settings.addressPlaceholder")}
              rows={2}
              className="text-sm resize-none"
              onBlur={e => {
                if (e.target.value !== g("address"))
                  save({ address: e.target.value });
              }}
            />
          </div>
          {g("latitude") && g("longitude") && (
            <Callout variant="info">
              {t("settings.coordinates")}:{" "}
              {parseFloat(g("latitude")).toFixed(5)},{" "}
              {parseFloat(g("longitude")).toFixed(5)}
            </Callout>
          )}
        </FullRow>
      </Group>

      <Group label={t("settings.specifications")}>
        {specs.map(({ k, lKey, placeholder, step, min, max, suffix }: any) => (
          <Row key={k} label={t(lKey)} htmlFor={`ps-${k}`}>
            <div className="flex items-center justify-end gap-1.5">
              <Field
                id={`ps-${k}`}
                type="number"
                step={step}
                min={min}
                max={max}
                value={p?.[k] ? String(p[k]) : ""}
                placeholder={placeholder}
                width={NUM_W}
                onSave={v => save({ [k]: v ? Number(v) : undefined })}
              />
              <span className="w-10 shrink-0 text-xs text-muted-foreground">
                {suffix ?? ""}
              </span>
            </div>
          </Row>
        ))}
        <Row
          label={t("settings.storageUnit")}
          hint={t("settings.storageUnitHint")}
          htmlFor="ps-stor"
        >
          <Switch
            id="ps-stor"
            checked={g("hasStorage", false)}
            onCheckedChange={v => save({ hasStorage: v })}
          />
        </Row>
      </Group>
    </div>
  );
}

function PurchaseSection({ p }: { p: any }) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({
    onSuccess: () => u.property.get.invalidate(),
    onError: e => toast.error(e.message),
  });
  const { data: costs } = trpc.purchaseCosts.list.useQuery();
  const [, nav] = useLocation();
  const price = p?.purchasePrice ?? 0;
  const acq = costs?.reduce((s, c) => s + c.amount, 0) ?? 0;
  const code = p?.currencyCode ?? "ILS";
  const fmt = (c: number) => formatCurrency(c, code);

  return (
    <div className="space-y-5">
      <SectionHeader
        title={t("settings.purchase")}
        description={t("settings.purchaseDesc")}
        pending={m.isPending}
      />

      <Group>
        <Row label={t("settings.purchasePrice")} htmlFor="pu-price">
          <Field
            id="pu-price"
            type="number"
            min={0}
            step="0.01"
            value={price ? String(price / 100) : ""}
            placeholder="0.00"
            onSave={v =>
              m.mutate({
                purchasePrice: v ? Math.round(parseFloat(v) * 100) : undefined,
              })
            }
          />
        </Row>
        <Row label={t("settings.purchaseDate")} htmlFor="pu-date">
          <Field
            id="pu-date"
            type="date"
            value={p?.purchaseDate ?? ""}
            onSave={v => m.mutate({ purchaseDate: v || undefined })}
          />
        </Row>
        <Row
          label={t("settings.acquisitionCosts")}
          hint={t("settings.acquisitionCostsHint")}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium tabular-nums">{fmt(acq)}</span>
            <button
              type="button"
              onClick={() => nav("/purchase-costs")}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
            >
              {t("settings.manage")} <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </Row>
      </Group>

      <StatCard
        label={t("settings.totalInvestedDesc")}
        value={fmt(price + acq)}
      />
    </div>
  );
}

function HouseholdSection() {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const { data: me } = trpc.profiles.current.useQuery();
  const { data: members } = trpc.profiles.list.useQuery();
  const upd = trpc.profiles.updateMe.useMutation({
    onSuccess: () => {
      u.profiles.current.invalidate();
      u.profiles.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const ini = (n?: string | null) =>
    (n ?? "?")
      .split(" ")
      .map(w => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="space-y-5">
      <SectionHeader
        title={t("settings.household")}
        description={t("settings.householdDesc")}
        pending={upd.isPending}
      />

      <Group label={t("settings.yourProfile")}>
        <Row label={t("settings.displayName")} htmlFor="h-name">
          <Field
            id="h-name"
            value={me?.name ?? ""}
            placeholder={t("settings.yourName")}
            onSave={v => upd.mutate({ name: v })}
          />
        </Row>
        <Row label={t("settings.email")}>
          <span className="text-sm text-muted-foreground">
            {me?.email ?? "—"}
          </span>
        </Row>
        <Row label={t("settings.role")}>
          <Badge
            variant={me?.role === "admin" ? "default" : "secondary"}
            className="capitalize text-xs h-5"
          >
            {me?.role ?? "user"}
          </Badge>
        </Row>
        <Row label={t("settings.lastSignIn")}>
          <span className="text-sm text-muted-foreground">
            {me?.lastSignedIn ? formatDate(String(me.lastSignedIn)) : "—"}
          </span>
        </Row>
      </Group>

      {(members?.length ?? 0) > 0 && (
        <Group label={`${t("settings.members")} · ${members?.length}`}>
          {members?.map(m => (
            <Row
              key={m.id}
              label={m.name ?? "Unknown"}
              hint={m.email ?? m.openId}
            >
              <div className="flex items-center gap-2">
                {m.id === me?.id && (
                  <Badge variant="outline" className="text-xs h-5 font-normal">
                    {t("settings.you")}
                  </Badge>
                )}
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs font-medium">
                    {ini(m.name)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </Row>
          ))}
        </Group>
      )}
    </div>
  );
}

function RegionalSection({ p }: { p: any }) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({
    onSuccess: () => u.property.get.invalidate(),
    onError: e => toast.error(e.message),
  });
  const g = (k: string, f: any = "") => p?.[k] ?? f;

  return (
    <div className="space-y-5">
      <SectionHeader
        title={t("settings.regional")}
        description={t("settings.regionalDesc")}
        pending={m.isPending}
      />

      <Group label={t("settings.currency")}>
        <Row label={t("settings.currency")}>
          <Combobox
            value={g("currencyCode", "ILS")}
            options={CURRENCIES}
            search={t("settings.searchCurrencies")}
            onSelect={v =>
              m.mutate({ currencyCode: v, currency: SYMBOLS[v] ?? v })
            }
          />
        </Row>
        <Row
          label={t("settings.symbol")}
          hint={t("settings.symbolHint")}
          htmlFor="r-sym"
        >
          <Field
            id="r-sym"
            value={g("currency", "₪")}
            placeholder="₪"
            width={NUM_W}
            onSave={v => m.mutate({ currency: v })}
          />
        </Row>
      </Group>

      <Group label={t("settings.dateTime")}>
        <Row label={t("settings.timezone")}>
          <Combobox
            value={g("timezone", "Asia/Jerusalem")}
            options={TIMEZONES}
            search={t("settings.searchTimezones")}
            onSelect={v => m.mutate({ timezone: v })}
          />
        </Row>
        <Row label={t("settings.startOfWeek")}>
          <ToggleGroup
            type="single"
            value={g("startOfWeek", "Sunday")}
            className="h-8"
            onValueChange={v => v && m.mutate({ startOfWeek: v })}
          >
            <ToggleGroupItem value="Sunday" className="text-xs h-8 px-4">
              {t("settings.sun")}
            </ToggleGroupItem>
            <ToggleGroupItem value="Monday" className="text-xs h-8 px-4">
              {t("settings.mon")}
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Group>
    </div>
  );
}

function NotificationsSection({ p }: { p: any }) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({
    onSuccess: () => u.property.get.invalidate(),
    onError: e => toast.error(e.message),
  });
  const days = p?.reminderDaysBefore ?? 3;

  const toggles = [
    {
      k: "remindExpenses",
      lKey: "settings.remindExpenses",
      dKey: "settings.remindExpensesHint",
    },
    {
      k: "remindLoans",
      lKey: "settings.remindLoans",
      dKey: "settings.remindLoansHint",
    },
    {
      k: "remindRepairs",
      lKey: "settings.remindRepairs",
      dKey: "settings.remindRepairsHint",
    },
    {
      k: "remindCalendar",
      lKey: "settings.remindCalendar",
      dKey: "settings.remindCalendarHint",
    },
  ] as const;

  return (
    <div className="space-y-5">
      <SectionHeader
        title={t("settings.notifications")}
        description={t("settings.notificationsDesc")}
        pending={m.isPending}
      />

      <Group label={t("settings.leadTime")}>
        <div className="px-4 py-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t("settings.remind")}</p>
            <Badge variant="secondary" className="tabular-nums font-medium">
              {days} {t("settings.daysBefore")}
            </Badge>
          </div>
          <Slider
            min={1}
            max={30}
            step={1}
            value={[days]}
            onValueCommit={([v]) => m.mutate({ reminderDaysBefore: v })}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings.appliesAll")}
          </p>
        </div>
      </Group>

      <Group label={t("settings.reminderTypes")}>
        {toggles.map(({ k, lKey, dKey }) => (
          <Row key={k} label={t(lKey)} hint={t(dKey)} htmlFor={`n-${k}`}>
            <Switch
              id={`n-${k}`}
              checked={p?.[k] ?? true}
              onCheckedChange={v => m.mutate({ [k]: v })}
            />
          </Row>
        ))}
      </Group>

      <ChannelsBlock />
    </div>
  );
}

/** Channel metadata: icon + whether the channel requires setup (a destination
 *  or connection) before it can deliver. Setup lives under the Integrations tab;
 *  the on/off toggles live here under Notifications. */
const CHANNEL_META: Record<ChannelKey, { icon: LucideIcon; needsSetup: boolean }> =
  {
    inapp: { icon: Bell, needsSetup: false },
    push: { icon: Smartphone, needsSetup: false },
    email: { icon: Mail, needsSetup: true },
    webpush: { icon: Globe, needsSetup: true },
    telegram: { icon: Send, needsSetup: true },
    whatsapp: { icon: MessageCircle, needsSetup: true },
  };

type ChannelStatus = {
  email: string | null;
  whatsappPhone: string | null;
  telegramLinked: boolean;
  webPushAvailable: boolean;
};

/** Whether a channel has everything it needs to deliver (drives Set up vs Test). */
function channelConfigured(ch: ChannelKey, status?: ChannelStatus): boolean {
  switch (ch) {
    case "inapp":
    case "push":
      return true;
    case "email":
      return Boolean(status?.email);
    case "telegram":
      return Boolean(status?.telegramLinked);
    case "whatsapp":
      return Boolean(status?.whatsappPhone);
    case "webpush":
      return (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      );
  }
}

/**
 * Delivery-channel toggles — the "what" of notifications lives here under
 * Notifications: choose which channels deliver. Connecting a channel
 * (destinations, the Telegram bot, browser push) lives under Integrations. A
 * channel that's enabled but not yet connected shows a "Set up" shortcut.
 */
function ChannelsBlock() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const u = trpc.useUtils();
  const { data: prefs } = trpc.notification.getPrefs.useQuery();
  const { data: status } = trpc.notification.getStatus.useQuery();
  const setPref = trpc.notification.setPref.useMutation({
    onMutate: () => {
      // optimistic: nothing fancy, just refetch after
    },
    onSuccess: () => u.notification.getPrefs.invalidate(),
    onError: e => toast.error(e.message),
  });
  const sendTest = trpc.notification.sendTest.useMutation({
    onSuccess: (res, vars) => {
      const label = t(`settings.ch.${vars.channel as ChannelKey}`);
      if (res.status === "sent") {
        toast.success(t("settings.ch.testSent", { channel: label }));
      } else {
        toast.error(
          t("settings.ch.testFailed", {
            channel: label,
            reason: res.reason ?? res.status,
          })
        );
      }
      u.notification.listInApp.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Group label={t("settings.ch.title")}>
      <div className="px-4 py-2.5">
        <p className="text-xs text-muted-foreground">{t("settings.ch.desc")}</p>
      </div>
      {CHANNEL_ORDER.map(ch => {
        const meta = CHANNEL_META[ch];
        const Icon = meta.icon;
        const enabled = prefs?.[ch] ?? false;
        const configured = channelConfigured(ch, status);
        const needsConfig = meta.needsSetup && !configured;
        return (
          <div
            key={ch}
            className="flex items-center justify-between gap-4 px-4 py-3 min-h-[52px]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-none">
                  {t(`settings.ch.${ch}`)}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground leading-snug">
                  {t(`settings.ch.${ch}Hint`)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {enabled &&
                (needsConfig ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => setLocation("/settings/integrations")}
                  >
                    {t("settings.ch.setUp")}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={sendTest.isPending}
                    onClick={() => sendTest.mutate({ channel: ch })}
                  >
                    {t("settings.ch.sendTest")}
                  </Button>
                ))}
              <Switch
                checked={enabled}
                onCheckedChange={v => setPref.mutate({ channel: ch, enabled: v })}
              />
            </div>
          </div>
        );
      })}
    </Group>
  );
}

/** Directory-style integration entry: icon, name, description, status badge,
 *  an action slot, and optional footer (e.g. an inline notice). */
function IntegrationCard({
  icon,
  name,
  description,
  badge,
  action,
  footer,
}: {
  icon: ReactNode;
  name: string;
  description: string;
  badge?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
            {icon}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{name}</p>
              {badge}
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {description}
            </p>
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {footer}
    </div>
  );
}

/** Status pill shown on a notification-channel integration card. */
function ChannelStatusBadge({ configured }: { configured: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={configured ? "secondary" : "outline"}
      className="text-[10px] font-normal"
    >
      {configured ? t("settings.ch.connected") : t("settings.ch.notConnected")}
    </Badge>
  );
}

/**
 * Telegram bot connection (Integrations). Generates a real link code via tRPC;
 * the user sends "/link <code>" to the bot which binds their chat. Shows the
 * connected state from notification.getStatus, plus the bot preview.
 */
function TelegramConnectCard() {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const { data: status } = trpc.notification.getStatus.useQuery();
  const connected = Boolean(status?.telegramLinked);
  const [code, setCode] = useState<string | null>(null);

  const createCode = trpc.notification.createTelegramLinkCode.useMutation({
    onSuccess: r => setCode(r.code),
    onError: e => toast.error(e.message),
  });
  const unlink = trpc.notification.unlinkTelegram.useMutation({
    onSuccess: () => u.notification.getStatus.invalidate(),
    onError: e => toast.error(e.message),
  });

  const copyCode = () => {
    if (code) navigator.clipboard?.writeText(code).catch(() => {});
    toast.success(t("settings.ch.codeCopied"));
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
            <Send className="h-4 w-4" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{t("settings.ch.botTitle")}</p>
              <ChannelStatusBadge configured={connected} />
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {t("settings.ch.telegramHint")}
            </p>
          </div>
        </div>
      </div>

      {connected ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <p className="text-sm">{t("settings.ch.connected")}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={unlink.isPending}
            onClick={() => unlink.mutate()}
          >
            {t("settings.ch.disconnect")}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground leading-snug">
            {t("settings.ch.botInstructions")}
          </p>
          {code ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-sm font-mono tracking-wider">
                {code}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={copyCode}
                aria-label={t("settings.ch.copyCode")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="h-8 w-full text-xs"
              disabled={createCode.isPending}
              onClick={() => createCode.mutate()}
            >
              {t("settings.ch.generateCode")}
            </Button>
          )}
        </>
      )}

      <BotPreview />
    </div>
  );
}

/** Editable destination input that saves on blur via setDestinations. */
function DestinationInput({
  field,
  value,
  placeholder,
}: {
  field: "email" | "whatsappPhone";
  value: string;
  placeholder: string;
}) {
  const u = trpc.useUtils();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = trpc.notification.setDestinations.useMutation({
    onSuccess: () => u.notification.getStatus.invalidate(),
    onError: e => toast.error(e.message),
  });
  return (
    <Input
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) save.mutate({ [field]: draft } as any);
      }}
      placeholder={placeholder}
      className="h-8 text-sm"
    />
  );
}

/**
 * Notification channels under Integrations — the "plumbing": connect the
 * Telegram bot, set email / WhatsApp destinations, enable browser push. Whether
 * each channel actually delivers is toggled under Notifications.
 */
function NotificationChannelsIntegration() {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const { data: status } = trpc.notification.getStatus.useQuery();
  const { data: vapid } = trpc.notification.getVapidPublicKey.useQuery();

  const subscribe = trpc.notification.subscribeWebPush.useMutation({
    onSuccess: async () => {
      await Promise.all([
        u.notification.getStatus.invalidate(),
        u.notification.getPrefs.invalidate(),
      ]);
      toast.success(t("settings.ch.webpushEnabled"));
    },
    onError: e => toast.error(e.message),
  });
  const setPref = trpc.notification.setPref.useMutation({
    onSuccess: () => u.notification.getPrefs.invalidate(),
  });

  const enableWebPush = async () => {
    if (!vapid?.key) {
      toast.error(t("settings.ch.webpushUnavailable"));
      return;
    }
    try {
      const sub = await subscribeToWebPush(vapid.key);
      await subscribe.mutateAsync(sub);
      setPref.mutate({ channel: "webpush", enabled: true });
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    }
  };

  const webPushGranted =
    typeof Notification !== "undefined" && Notification.permission === "granted";

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-medium text-muted-foreground">
        {t("settings.ch.integrationsTitle")}
      </p>
      <div className="space-y-2">
        <TelegramConnectCard />

        <IntegrationCard
          icon={<Mail className="h-4 w-4" />}
          name={t("settings.ch.email")}
          description={t("settings.ch.emailCardDesc")}
          badge={<ChannelStatusBadge configured={Boolean(status?.email)} />}
          footer={
            <DestinationInput
              field="email"
              value={status?.email ?? ""}
              placeholder={t("settings.ch.emailDest")}
            />
          }
        />

        <IntegrationCard
          icon={<MessageCircle className="h-4 w-4" />}
          name={t("settings.ch.whatsapp")}
          description={t("settings.ch.whatsappCardDesc")}
          badge={
            <ChannelStatusBadge configured={Boolean(status?.whatsappPhone)} />
          }
          footer={
            <DestinationInput
              field="whatsappPhone"
              value={status?.whatsappPhone ?? ""}
              placeholder={t("settings.ch.whatsappDest")}
            />
          }
        />

        <IntegrationCard
          icon={<Globe className="h-4 w-4" />}
          name={t("settings.ch.webpush")}
          description={t("settings.ch.webpushCardDesc")}
          badge={<ChannelStatusBadge configured={webPushGranted} />}
          action={
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={subscribe.isPending || !webPushSupported()}
              onClick={enableWebPush}
            >
              {webPushGranted
                ? t("settings.ch.reEnable")
                : t("settings.ch.enableWebpush")}
            </Button>
          }
        />

        <IntegrationCard
          icon={<Smartphone className="h-4 w-4" />}
          name={t("settings.ch.push")}
          description={t("settings.ch.pushCardDesc")}
          badge={
            <Badge variant="secondary" className="text-[10px] font-normal">
              {t("settings.ch.builtIn")}
            </Badge>
          }
        />
      </div>
    </div>
  );
}

function IntegrationsSection({ p }: { p: any }) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({
    onSuccess: () => u.property.get.invalidate(),
    onError: e => toast.error(e.message),
  });
  const hasKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  const mapsProvider = p?.mapsProvider ?? "google";
  // Selected storage backend is owned here so the Google Drive panel only
  // renders when Drive is the selected backend (not always, as before).
  const [selectedBackend, setSelectedBackend] = useState<BackendName | null>(
    null
  );

  return (
    <div className="space-y-5">
      <SectionHeader
        title={t("settings.integrations")}
        description={t("settings.integrationsDesc")}
        pending={m.isPending}
      />

      <StorageBackendGroup onSelectedChange={setSelectedBackend} />
      {selectedBackend === "gdrive" && <FileStorageGroup />}
      <StoredFilesGroup />

      <NotificationChannelsIntegration />

      <div className="space-y-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          {t("settings.moreIntegrations")}
        </p>
        <div className="space-y-2">
          <IntegrationCard
            icon={<CalendarIcon className="h-4 w-4" />}
            name={t("settings.calendar")}
            description={t("settings.syncEventsHint")}
            badge={
              <Badge variant="secondary" className="text-[10px] font-normal">
                {t("settings.comingSoon")}
              </Badge>
            }
          />
          <IntegrationCard
            icon={<MapIcon className="h-4 w-4" />}
            name={t("settings.maps")}
            description={t("settings.mapsHint")}
            action={
              <ToggleGroup
                type="single"
                value={mapsProvider}
                className="h-8"
                onValueChange={v => v && m.mutate({ mapsProvider: v as any })}
              >
                <ToggleGroupItem value="google" className="text-xs h-8 px-4">
                  Google
                </ToggleGroupItem>
                <ToggleGroupItem value="osm" className="text-xs h-8 px-4">
                  OpenStreetMap
                </ToggleGroupItem>
              </ToggleGroup>
            }
            footer={
              !hasKey && mapsProvider === "google" ? (
                <Callout variant="warning">
                  <span>
                    {t("settings.mapsKeyPrefix")}{" "}
                    <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code>{" "}
                    {t("settings.mapsKeySuffix")}
                  </span>
                </Callout>
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}

// ─── Storage backend selector (Drive / Local disk / S3) ──────────────────────

type BackendName = "gdrive" | "local" | "s3";

type StorageStatus = {
  activeBackend: BackendName;
  source: "db" | "env" | "auto";
  backends: {
    gdrive: { configured: boolean };
    s3: {
      configured: boolean;
      endpoint: string | null;
      bucket: string | null;
      region: string;
      secretExists: boolean;
      fromEnv: boolean;
    };
    local: {
      configured: boolean;
      dir: string;
      fromEnv: boolean;
      writable: boolean;
    };
  };
};

/**
 * Lets an admin pick WHICH storage backend is active and configure the two
 * self-hostable ones (Local disk, S3-compatible) inline — no .env editing or
 * restart. Google Drive keeps its dedicated panel below for the OAuth flow.
 */
function StorageBackendGroup({
  onSelectedChange,
}: {
  onSelectedChange?: (backend: BackendName) => void;
}) {
  const { t } = useTranslation();
  const { data: me } = trpc.profiles.current.useQuery();
  const isAdmin = me?.role === "admin";

  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BackendName>("local");
  const [busy, setBusy] = useState(false);

  // Notify the parent whenever the selected backend changes so it can render
  // the Google Drive panel only when Drive is selected.
  useEffect(() => {
    onSelectedChange?.(tab);
  }, [tab, onSelectedChange]);

  // Local form
  const [localDir, setLocalDir] = useState("");
  // S3 form
  const [s3, setS3] = useState({
    endpoint: "",
    bucket: "",
    region: "auto",
    accessKeyId: "",
    secret: "",
  });
  const [showS3Secret, setShowS3Secret] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("api/storage/status");
      if (!resp.ok) {
        setStatus(null);
        return;
      }
      const data = (await resp.json()) as StorageStatus;
      setStatus(data);
      setTab(data.activeBackend);
      setLocalDir(data.backends.local.dir ?? "");
      setS3(s => ({
        ...s,
        endpoint: data.backends.s3.endpoint ?? "",
        bucket: data.backends.s3.bucket ?? "",
        region: data.backends.s3.region ?? "auto",
      }));
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void loadStatus();
  }, [isAdmin, loadStatus]);

  async function makeActive(backend: BackendName) {
    setBusy(true);
    try {
      const resp = await fetch("api/storage/active", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({ backend }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) throw new Error(data.error ?? `Failed (${resp.status})`);
      toast.success(t("settings.storage.madeActive"));
      await loadStatus();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLocal() {
    if (!localDir.trim()) {
      toast.error(t("settings.storage.local.dirRequired"));
      return;
    }
    setBusy(true);
    try {
      const resp = await fetch("api/storage/local", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({ dir: localDir.trim() }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) throw new Error(data.error ?? `Failed (${resp.status})`);
      toast.success(t("settings.storage.local.saved"));
      await loadStatus();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveS3() {
    if (!s3.endpoint.trim() || !s3.bucket.trim() || !s3.accessKeyId.trim()) {
      toast.error(t("settings.storage.s3.fieldsRequired"));
      return;
    }
    if (!status?.backends.s3.secretExists && !s3.secret.trim()) {
      toast.error(t("settings.storage.s3.secretRequired"));
      return;
    }
    setBusy(true);
    try {
      const resp = await fetch("api/storage/s3", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({
          endpoint: s3.endpoint.trim(),
          bucket: s3.bucket.trim(),
          region: s3.region.trim() || "auto",
          accessKeyId: s3.accessKeyId.trim(),
          secretAccessKey: s3.secret.trim() || undefined,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) throw new Error(data.error ?? `Failed (${resp.status})`);
      toast.success(t("settings.storage.s3.saved"));
      setS3(s => ({ ...s, secret: "" }));
      await loadStatus();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function testBackend(backend: BackendName, body?: Record<string, any>) {
    setBusy(true);
    try {
      const resp = await fetch("api/storage/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({ backend, ...body }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (data.ok) toast.success(t("settings.storage.testOk"));
      else
        toast.error(
          t("settings.storage.testFailed", {
            error: data.error ?? `HTTP ${resp.status}`,
          })
        );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return null;

  const active = status?.activeBackend;
  const configured = (b: BackendName) =>
    status ? status.backends[b].configured : false;

  const OPTIONS: { id: BackendName; label: string; icon: typeof Cloud }[] = [
    {
      id: "local",
      label: t("settings.storage.backend.local"),
      icon: HardDrive,
    },
    { id: "s3", label: t("settings.storage.backend.s3"), icon: Server },
    { id: "gdrive", label: t("settings.storage.backend.gdrive"), icon: Cloud },
  ];

  return (
    <Group label={t("settings.storage.groupLabel")}>
      <div className="px-4 py-3.5 space-y-1.5 bg-muted/30">
        <p className="text-sm font-medium">{t("settings.storage.title")}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("settings.storage.desc")}
        </p>
      </div>

      {loading ? (
        <div className="px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />{" "}
          {t("settings.fileStorage.loadingStatus")}
        </div>
      ) : (
        <>
          {/* Backend selector */}
          <div className="px-4 py-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {OPTIONS.map(opt => {
                const Icon = opt.icon;
                const isActive = active === opt.id;
                const sel = tab === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTab(opt.id)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors",
                      sel
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{opt.label}</span>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("settings.storage.active")}
                      </span>
                    ) : configured(opt.id) ? (
                      <span className="text-xs text-muted-foreground">
                        {t("settings.storage.configured")}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/70">
                        {t("settings.storage.notConfigured")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Local disk panel */}
          {tab === "local" && (
            <FullRow
              label={t("settings.storage.local.label")}
              hint={t("settings.storage.local.hint")}
            >
              <div className="space-y-3">
                <SubField
                  label={t("settings.storage.local.dir")}
                  hint={
                    status?.backends.local.fromEnv
                      ? t("settings.storage.local.fromEnv")
                      : undefined
                  }
                >
                  <Input
                    value={localDir}
                    onChange={e => setLocalDir(e.target.value)}
                    placeholder="/data/uploads"
                    className="h-8 text-xs font-mono"
                  />
                </SubField>
                <div className="flex items-center justify-between pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={busy}
                    onClick={() => void testBackend("local", { dir: localDir })}
                  >
                    {t("settings.storage.test")}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="text-xs"
                      disabled={busy}
                      onClick={() => void saveLocal()}
                    >
                      {busy && (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      )}
                      {t("settings.storage.save")}
                    </Button>
                    {active !== "local" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-xs"
                        disabled={busy || !configured("local")}
                        onClick={() => void makeActive("local")}
                      >
                        {t("settings.storage.makeActive")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </FullRow>
          )}

          {/* S3 panel */}
          {tab === "s3" && (
            <FullRow
              label={t("settings.storage.s3.label")}
              hint={t("settings.storage.s3.hint")}
            >
              <div className="space-y-3">
                {status?.backends.s3.fromEnv && (
                  <p className="text-xs text-muted-foreground italic">
                    {t("settings.storage.s3.fromEnv")}
                  </p>
                )}
                <SubField label={t("settings.storage.s3.endpoint")}>
                  <Input
                    value={s3.endpoint}
                    onChange={e =>
                      setS3(s => ({ ...s, endpoint: e.target.value }))
                    }
                    placeholder="https://<account>.r2.cloudflarestorage.com"
                    className="h-8 text-xs font-mono"
                  />
                </SubField>
                <div className="grid grid-cols-2 gap-2">
                  <SubField label={t("settings.storage.s3.bucket")}>
                    <Input
                      value={s3.bucket}
                      onChange={e =>
                        setS3(s => ({ ...s, bucket: e.target.value }))
                      }
                      placeholder="homevault"
                      className="h-8 text-xs font-mono"
                    />
                  </SubField>
                  <SubField label={t("settings.storage.s3.region")}>
                    <Input
                      value={s3.region}
                      onChange={e =>
                        setS3(s => ({ ...s, region: e.target.value }))
                      }
                      placeholder="auto"
                      className="h-8 text-xs font-mono"
                    />
                  </SubField>
                </div>
                <SubField label={t("settings.storage.s3.accessKeyId")}>
                  <Input
                    value={s3.accessKeyId}
                    onChange={e =>
                      setS3(s => ({ ...s, accessKeyId: e.target.value }))
                    }
                    className="h-8 text-xs font-mono"
                  />
                </SubField>
                <SubField label={t("settings.storage.s3.secret")}>
                  <div className="relative">
                    <Input
                      type={showS3Secret ? "text" : "password"}
                      value={s3.secret}
                      onChange={e =>
                        setS3(s => ({ ...s, secret: e.target.value }))
                      }
                      placeholder={
                        status?.backends.s3.secretExists
                          ? t("settings.storage.s3.secretPlaceholder")
                          : ""
                      }
                      className="h-8 text-xs font-mono pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowS3Secret(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showS3Secret ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </SubField>
                <div className="flex items-center justify-between pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={busy}
                    onClick={() =>
                      void testBackend("s3", {
                        endpoint: s3.endpoint,
                        bucket: s3.bucket,
                        region: s3.region,
                        accessKeyId: s3.accessKeyId,
                        secretAccessKey: s3.secret || undefined,
                      })
                    }
                  >
                    {t("settings.storage.test")}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="text-xs"
                      disabled={busy}
                      onClick={() => void saveS3()}
                    >
                      {busy && (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      )}
                      {t("settings.storage.save")}
                    </Button>
                    {active !== "s3" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-xs"
                        disabled={busy || !configured("s3")}
                        onClick={() => void makeActive("s3")}
                      >
                        {t("settings.storage.makeActive")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </FullRow>
          )}

          {/* Google Drive: configured via the dedicated panel below */}
          {tab === "gdrive" && (
            <FullRow
              label={t("settings.storage.backend.gdrive")}
              hint={t("settings.storage.gdrive.hint")}
            >
              <div className="flex items-center gap-3">
                {active === "gdrive" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("settings.storage.active")}
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                    disabled={busy || !configured("gdrive")}
                    onClick={() => void makeActive("gdrive")}
                  >
                    {t("settings.storage.makeActive")}
                  </Button>
                )}
              </div>
            </FullRow>
          )}
        </>
      )}
    </Group>
  );
}

// ─── File Storage (Google Drive) ─────────────────────────────────────────────

/**
 * Google only allows `localhost` / `127.0.0.1` as redirect URIs for local
 * development — not arbitrary LAN IPs (192.168.x, 10.x, etc.). When the app
 * is accessed via a private IP we rewrite the origin to localhost so the
 * pre-filled redirect URI is one Google will actually accept.
 */
function defaultRedirectUri(): string {
  const { hostname, port } = window.location;
  const isPrivateIp =
    hostname !== "localhost" &&
    hostname !== "127.0.0.1" &&
    (/^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname));
  const base = isPrivateIp
    ? `http://localhost${port ? `:${port}` : ""}`
    : window.location.origin;
  return `${base}/api/google-drive/callback`;
}

type GDriveStatus = {
  configured: boolean;
  connected: boolean;
  // True when a recent Drive call returned invalid_grant — the cookie says
  // "connected" but the underlying refresh token is no longer usable. UI
  // flips to an amber "Reconnect needed" banner.
  needsReconnect: boolean;
  // Server returns a masked form ("o***@gmail.com") to avoid leaking the full
  // Google address in shared screenshots / log dumps. The full address is
  // shown only in the one-shot "Connected as foo@gmail.com" toast immediately
  // after the OAuth callback.
  emailMasked: string | null;
  clientId: string | null;
  secretExists: boolean;
  redirectUri: string | null;
  fromEnv: boolean;
};

function FileStorageGroup() {
  const { t } = useTranslation();
  const { data: me } = trpc.profiles.current.useQuery();
  const isAdmin = me?.role === "admin";
  const [status, setStatus] = useState<GDriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credForm, setCredForm] = useState({
    clientId: "",
    secret: "",
    redirectUri: "",
  });
  const [showSecret, setShowSecret] = useState(false);
  const [editingCreds, setEditingCreds] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("api/google-drive/status");
      if (resp.status === 401 || resp.status === 403) {
        setStatus(null);
        setError(null);
        return;
      }
      if (resp.status === 404) {
        // Route unreachable (env vars not set or path issue) — show setup instructions.
        setStatus({
          configured: false,
          connected: false,
          needsReconnect: false,
          emailMasked: null,
          clientId: null,
          secretExists: false,
          redirectUri: null,
          fromEnv: false,
        });
        setError(null);
        return;
      }
      if (!resp.ok) {
        setError(`Status request failed (${resp.status})`);
        return;
      }
      setStatus((await resp.json()) as GDriveStatus);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void loadStatus();

    // OAuth callback returns to /?gdrive=connected[&email=...]#/settings/integrations
    const q = new URLSearchParams(window.location.search);
    if (q.get("gdrive") === "connected") {
      const email = q.get("email");
      toast.success(email ? `Connected as ${email}` : "Google Drive connected");
      // Remove the one-shot params so a refresh doesn't repeat the toast.
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState(null, "", url.toString());
    } else if (q.get("gdrive") === "error") {
      toast.error(q.get("message") || "Failed to connect");
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState(null, "", url.toString());
    }
  }, [isAdmin, loadStatus]);

  useEffect(() => {
    if (!status) return;
    setCredForm(f => ({
      clientId: status.clientId ?? f.clientId,
      secret: "",
      redirectUri: status.redirectUri ?? f.redirectUri,
    }));
    if (!status.configured) setEditingCreds(true);
  }, [status]);

  useEffect(() => {
    setCredForm(f => ({
      ...f,
      redirectUri: f.redirectUri || defaultRedirectUri(),
    }));
  }, []);

  async function handleDisconnect() {
    if (!confirm(t("settings.fileStorage.disconnectConfirm"))) return;
    setBusy(true);
    try {
      const resp = await fetch("api/google-drive/disconnect", {
        method: "POST",
        // CSRF: server verifies this header matches the csrf_token cookie.
        headers: csrfHeaders(),
        credentials: "include",
      });
      if (!resp.ok) throw new Error(`Disconnect failed (${resp.status})`);
      toast.success(t("settings.fileStorage.disconnected"));
      await loadStatus();
    } catch (err) {
      toast.error(
        (err as Error).message || t("settings.fileStorage.disconnectFailed")
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveCredentials() {
    if (!credForm.clientId.trim()) {
      toast.error(t("settings.fileStorage.creds.clientIdRequired"));
      return;
    }
    if (!credForm.redirectUri.trim()) {
      toast.error(t("settings.fileStorage.creds.redirectUriRequired"));
      return;
    }
    if (!status?.secretExists && !credForm.secret.trim()) {
      toast.error(t("settings.fileStorage.creds.secretRequired"));
      return;
    }
    setSavingCreds(true);
    try {
      const resp = await fetch("api/google-drive/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({
          clientId: credForm.clientId.trim(),
          clientSecret: credForm.secret.trim() || undefined,
          redirectUri: credForm.redirectUri.trim(),
        }),
      });
      if (!resp.ok) {
        const data = (await resp.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `Save failed (${resp.status})`);
      }
      toast.success(t("settings.fileStorage.creds.saved"));
      setEditingCreds(false);
      setCredForm(f => ({ ...f, secret: "" }));
      await loadStatus();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingCreds(false);
    }
  }

  async function handleManualToken() {
    if (!manualToken.trim()) {
      toast.error(t("settings.fileStorage.manualToken.required"));
      return;
    }
    setSavingToken(true);
    try {
      const resp = await fetch("api/google-drive/manual-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({ refreshToken: manualToken.trim() }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        email?: string;
        error?: string;
      };
      if (!resp.ok) throw new Error(data.error ?? `Failed (${resp.status})`);
      toast.success(
        data.email
          ? `Connected as ${data.email}`
          : t("settings.fileStorage.manualToken.success")
      );
      setManualToken("");
      setShowManualToken(false);
      await loadStatus();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingToken(false);
    }
  }

  return (
    <Group label={t("settings.fileStorage.groupLabel")}>
      {/* Always-visible header explaining what this section configures */}
      <div className="px-4 py-3.5 space-y-1.5 bg-muted/30">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">
            {t("settings.fileStorage.title")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("settings.fileStorage.desc", {
            folder: "HomeVault/property-<id>/<userId>/",
          })}
        </p>
      </div>

      {/* Permission disclosure — explicit so users know exactly what they're granting */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium">
              {t("settings.fileStorage.permissionTitle")}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("settings.fileStorage.permissionDesc")}{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground inline-flex items-center gap-0.5"
              >
                {t("settings.fileStorage.permissionLink")}{" "}
                <ExternalLink className="h-3 w-3" />
              </a>
              .
            </p>
          </div>
        </div>
      </div>

      {/* ── Credentials (admin only) ────────────────────────────────────── */}
      {isAdmin && !loading && !error && (
        <>
          {/* fromEnv: credentials come from env vars — show read-only notice */}
          {status?.fromEnv ? (
            <FullRow
              label={t("settings.fileStorage.creds.label")}
              hint={t("settings.fileStorage.creds.fromEnvHint")}
            >
              <p className="text-xs text-muted-foreground italic">
                {t("settings.fileStorage.creds.fromEnv")}
              </p>
            </FullRow>
          ) : editingCreds || !status?.configured ? (
            /* Editable credentials form */
            <FullRow
              label={t("settings.fileStorage.creds.label")}
              hint={t("settings.fileStorage.creds.setupHint")}
            >
              <div className="space-y-3">
                {/* Client ID */}
                <SubField label={t("settings.fileStorage.creds.clientId")}>
                  <Input
                    value={credForm.clientId}
                    onChange={e =>
                      setCredForm(f => ({ ...f, clientId: e.target.value }))
                    }
                    placeholder="123456789-xxxx.apps.googleusercontent.com"
                    className="h-8 text-xs font-mono"
                  />
                </SubField>
                {/* Client Secret */}
                <SubField
                  label={t("settings.fileStorage.creds.clientSecret")}
                  hint={
                    status?.secretExists
                      ? t("settings.fileStorage.creds.secretSaved")
                      : undefined
                  }
                >
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      value={credForm.secret}
                      onChange={e =>
                        setCredForm(f => ({ ...f, secret: e.target.value }))
                      }
                      placeholder={
                        status?.secretExists
                          ? t("settings.fileStorage.creds.secretPlaceholder")
                          : ""
                      }
                      className="h-8 text-xs font-mono pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(s => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecret ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </SubField>
                {/* Redirect URI */}
                <SubField
                  label={t("settings.fileStorage.creds.redirectUri")}
                  hint={t("settings.fileStorage.creds.redirectUriHint")}
                >
                  <Input
                    value={credForm.redirectUri}
                    onChange={e =>
                      setCredForm(f => ({ ...f, redirectUri: e.target.value }))
                    }
                    placeholder="https://your-server/api/google-drive/callback"
                    className="h-8 text-xs font-mono"
                  />
                </SubField>
                {/* Actions */}
                <div className="flex items-center justify-between pt-1">
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground underline hover:text-foreground inline-flex items-center gap-1"
                  >
                    Google Cloud Console <ExternalLink className="h-3 w-3" />
                  </a>
                  <div className="flex items-center gap-2">
                    {status?.configured && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setEditingCreds(false);
                          setCredForm(f => ({ ...f, secret: "" }));
                        }}
                        disabled={savingCreds}
                      >
                        {t("settings.fileStorage.creds.cancel")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={() => void handleSaveCredentials()}
                      disabled={savingCreds}
                    >
                      {savingCreds && (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      )}
                      {t("settings.fileStorage.creds.save")}
                    </Button>
                  </div>
                </div>
              </div>
            </FullRow>
          ) : (
            /* Credentials summary (configured, not currently editing) */
            <Row
              label={t("settings.fileStorage.creds.label")}
              hint={status.clientId ? status.clientId : undefined}
            >
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setEditingCreds(true)}
              >
                {t("settings.fileStorage.creds.edit")}
              </Button>
            </Row>
          )}
        </>
      )}

      {/* ── Loading / auth gate / error ─────────────────────────────────── */}
      {loading ? (
        <div className="px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />{" "}
          {t("settings.fileStorage.loadingStatus")}
        </div>
      ) : !isAdmin ? (
        <div className="px-4 py-3 text-xs text-muted-foreground">
          {t("settings.fileStorage.adminOnly")}
        </div>
      ) : error ? (
        <div className="px-4 py-3 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </div>
      ) : null}

      {/* ── Connection status (only when credentials are configured) ────── */}
      {!loading && isAdmin && !error && status?.configured && (
        <>
          {status.connected && status.needsReconnect ? (
            <FullRow
              label={t("settings.fileStorage.reconnectNeeded")}
              hint={
                status.emailMasked
                  ? t("settings.fileStorage.reconnectHintWithEmail", {
                      email: status.emailMasked,
                    })
                  : t("settings.fileStorage.reconnectHintNoEmail")
              }
            >
              <Callout variant="warning">
                <div className="flex items-center gap-3">
                  <span className="flex-1">
                    {t("settings.fileStorage.reconnectBannerBody")}
                  </span>
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      window.location.href = new URL(
                        "api/google-drive/connect",
                        window.location.href
                      ).href;
                    }}
                    disabled={busy}
                  >
                    {t("settings.fileStorage.reconnect")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={handleDisconnect}
                    disabled={busy}
                  >
                    {t("settings.fileStorage.disconnect")}
                  </Button>
                </div>
              </Callout>
            </FullRow>
          ) : status.connected ? (
            <Row
              label={t("settings.fileStorage.statusLabel")}
              hint={
                status.emailMasked
                  ? t("settings.fileStorage.connectedHintWithEmail", {
                      email: status.emailMasked,
                    })
                  : t("settings.fileStorage.connectedHintNoEmail")
              }
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />{" "}
                  {t("settings.fileStorage.connected")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={handleDisconnect}
                  disabled={busy}
                >
                  {busy && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                  {t("settings.fileStorage.disconnect")}
                </Button>
              </div>
            </Row>
          ) : (
            <>
              <Row
                label={t("settings.fileStorage.statusLabel")}
                hint={t("settings.fileStorage.notConnectedHint")}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {t("settings.notConnected")}
                  </span>
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      window.location.href = new URL(
                        "api/google-drive/connect",
                        window.location.href
                      ).href;
                    }}
                    disabled={busy}
                  >
                    {t("settings.connect")}
                  </Button>
                </div>
              </Row>
              {/* Manual token fallback */}
              {!showManualToken ? (
                <div className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setShowManualToken(true)}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    {t("settings.fileStorage.manualToken.toggle")}
                  </button>
                </div>
              ) : (
                <FullRow
                  label={t("settings.fileStorage.manualToken.label")}
                  hint={t("settings.fileStorage.manualToken.hint")}
                >
                  <div className="space-y-2">
                    <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
                      <li>{t("settings.fileStorage.manualToken.step1")}</li>
                      <li>{t("settings.fileStorage.manualToken.step2")}</li>
                      <li>{t("settings.fileStorage.manualToken.step3")}</li>
                      <li>{t("settings.fileStorage.manualToken.step4")}</li>
                    </ol>
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href="https://developers.google.com/oauthplayground"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground underline hover:text-foreground inline-flex items-center gap-1 shrink-0"
                      >
                        OAuth Playground <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <Input
                      type="password"
                      value={manualToken}
                      onChange={e => setManualToken(e.target.value)}
                      placeholder={t(
                        "settings.fileStorage.manualToken.placeholder"
                      )}
                      className="h-8 text-xs font-mono"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setShowManualToken(false);
                          setManualToken("");
                        }}
                        disabled={savingToken}
                      >
                        {t("settings.fileStorage.creds.cancel")}
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs"
                        onClick={() => void handleManualToken()}
                        disabled={savingToken}
                      >
                        {savingToken && (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        )}
                        {t("settings.fileStorage.manualToken.save")}
                      </Button>
                    </div>
                  </div>
                </FullRow>
              )}
            </>
          )}
        </>
      )}
    </Group>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  const THEMES = [
    { value: "light", label: t("settings.themeLight"), icon: Sun },
    { value: "dark", label: t("settings.themeDark"), icon: Moon },
    { value: "system", label: t("settings.themeSystem"), icon: Monitor },
  ] as const;

  return (
    <div className="space-y-5">
      <SectionHeader
        title={t("settings.appearance")}
        description={t("settings.appearanceDesc")}
      />

      <Group label={t("settings.theme")}>
        <FullRow label={t("settings.theme")} hint={t("settings.themeHint")}>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(({ value, label, icon: Icon }) => {
              const selected = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value as any)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-md border p-3 text-xs transition-colors",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50"
                  )}
                  aria-pressed={selected}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{label}</span>
                </button>
              );
            })}
          </div>
        </FullRow>
      </Group>

      <Group label={t("settings.language")}>
        <Row label={t("settings.language")} hint={t("settings.languageHint")}>
          <ToggleGroup
            type="single"
            value={language}
            className="h-8"
            onValueChange={v => v && setLanguage(v as any)}
          >
            <ToggleGroupItem value="en" className="h-8 px-3 text-xs">
              English
            </ToggleGroupItem>
            <ToggleGroupItem value="he" className="h-8 px-3 text-xs" dir="rtl">
              עברית
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Group>
    </div>
  );
}

function DataSection({
  p,
  canDeleteProperty,
  activePropertyId,
  switchProperty,
}: {
  p: any;
  canDeleteProperty: boolean;
  activePropertyId: number;
  switchProperty: (id: number) => void;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const { refetch, isFetching } = trpc.data.exportAll.useQuery(undefined, {
    enabled: false,
  });
  const del = trpc.data.deleteAll.useMutation({
    onSuccess: () => {
      toast.success(t("settings.allRecordsDeleted"));
      setDanger(false);
    },
    onError: e => toast.error(e.message),
  });
  const delProp = trpc.property.delete.useMutation({
    onSuccess: () => {
      toast.success(t("settings.propertyDeleted"));
      u.property.list.invalidate();
      setPropDanger(false);
      switchProperty(1);
    },
    onError: e => toast.error(e.message),
  });
  const [danger, setDanger] = useState(false);
  const seed = trpc.data.seedMock.useMutation({
    onSuccess: ({ propertyId }) => {
      toast.success(t("settings.demoRestored"));
      u.property.list.invalidate();
      switchProperty(propertyId);
    },
    onError: e => toast.error(e.message),
  });
  const [propDanger, setPropDanger] = useState(false);
  const expected = p?.houseName ?? "My Home";

  const exportAll = async () => {
    const r = await refetch();
    if (!r.data) return;
    const blob = new Blob([JSON.stringify(r.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `homevault_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title={t("settings.data")}
        description={t("settings.dataDesc")}
      />

      <Group label={t("settings.demoData")}>
        <Row
          label={t("settings.restoreDemo")}
          hint={t("settings.restoreDemoHint")}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => seed.mutate()}
            disabled={seed.isPending}
          >
            {seed.isPending ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3 w-3" />
            )}
            {seed.isPending
              ? t("settings.restoringDemo")
              : t("settings.restoreDemoBtn")}
          </Button>
        </Row>
      </Group>

      <Group label={t("settings.export")}>
        <Row label={t("settings.allData")} hint={t("settings.allDataHint")}>
          <Button
            variant="outline"
            size="sm"
            onClick={exportAll}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3 w-3" />
            )}
            {isFetching ? t("settings.preparing") : t("settings.downloadJson")}
          </Button>
        </Row>
        <Row
          label={t("settings.exportFilesZipLabel")}
          hint={t("settings.exportFilesZipHint")}
        >
          <Button variant="outline" size="sm" asChild>
            <a href="/api/export/files.zip" download>
              <Download className="mr-1.5 h-3 w-3" />
              {t("settings.exportFilesZipBtn")}
            </a>
          </Button>
        </Row>
        <Row label={t("settings.perModule")} hint={t("settings.perModuleHint")}>
          <span className="text-xs text-muted-foreground">
            {t("settings.perModuleList")}
          </span>
        </Row>
      </Group>

      <Group label={t("settings.dangerZone")}>
        <Row label={t("settings.deleteAll")} hint={t("settings.deleteAllHint")}>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/25 hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setDanger(true)}
          >
            {t("settings.deleteAllBtn")}
          </Button>
        </Row>

        {canDeleteProperty && (
          <Row
            label={t("settings.deleteProperty")}
            hint={t("settings.deletePropertyHint")}
          >
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/25 hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setPropDanger(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {t("settings.deletePropertyBtn")}
            </Button>
          </Row>
        )}
      </Group>

      <ConfirmDialog
        open={danger}
        onOpenChange={setDanger}
        title={t("settings.cannotUndo")}
        confirmPhrase={expected}
        confirmLabel={t("settings.confirm")}
        pending={del.isPending}
        onConfirm={() => del.mutate({ confirmationPhrase: expected })}
        description={
          <>
            {t("settings.typePrefix")}{" "}
            <strong className="text-foreground font-medium">{expected}</strong>{" "}
            {t("settings.typeSuffix")}
          </>
        }
      />

      <ConfirmDialog
        open={propDanger}
        onOpenChange={setPropDanger}
        title={t("settings.deletePropertyConfirm")}
        confirmPhrase={expected}
        confirmLabel={t("settings.deletePropertyConfirmBtn")}
        pending={delProp.isPending}
        onConfirm={() => delProp.mutate({ propertyId: activePropertyId })}
        description={
          <>
            {t("settings.typePrefix")}{" "}
            <strong className="text-foreground font-medium">{expected}</strong>{" "}
            {t("settings.typeSuffix")}
          </>
        }
      />
    </div>
  );
}

// ─── Stored files (browser + bulk actions) ───────────────────────────────────

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const FILES_PAGE_SIZE = 50;

function StoredFilesGroup() {
  const { t } = useTranslation();
  const { data: me } = trpc.profiles.current.useQuery();
  const { activePropertyId } = useProperty();
  const utils = trpc.useUtils();
  // Always-loaded summary so the section header reads naturally even when
  // the list is collapsed. Filter to the current property by default; users
  // can flip to "all properties" to find legacy files.
  const [scope, setScope] = useState<"property" | "all">("property");
  const [expanded, setExpanded] = useState(false);
  // Pagination — accumulate pages locally as the user clicks "Load more".
  // Resets to page 0 when the scope toggle changes.
  const [page, setPage] = useState(0);
  const queryInput = useMemo(() => {
    const base: any = {
      limit: FILES_PAGE_SIZE,
      offset: page * FILES_PAGE_SIZE,
    };
    if (scope === "property") base.propertyId = activePropertyId;
    return base;
  }, [scope, page, activePropertyId]);
  const list = trpc.files.list.useQuery(queryInput);

  type FileItem = NonNullable<typeof list.data>["items"][number];
  const [allItems, setAllItems] = useState<FileItem[]>([]);

  // When a new page arrives, append. When the scope toggle changes (page
  // resets to 0), replace.
  useEffect(() => {
    if (!list.data) return;
    if (page === 0) setAllItems(list.data.items);
    else setAllItems(prev => [...prev, ...list.data!.items]);
  }, [list.data, page]);

  // Reset pagination state on scope toggle.
  useEffect(() => {
    setPage(0);
    setAllItems([]);
  }, [scope, activePropertyId]);

  const deleteFile = trpc.files.delete.useMutation({
    onSuccess: () => {
      setPage(0);
      setAllItems([]);
      utils.files.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const reap = trpc.files.reapOrphans.useMutation({
    onError: e => toast.error(e.message),
  });

  if (!me) return null;
  const isAdmin = me.role === "admin";

  const totalCount = list.data?.totalCount ?? 0;
  const totalBytes = list.data?.totalBytes ?? 0;
  const hasMore = allItems.length < totalCount;

  return (
    <Group label={t("settings.storedFiles.groupLabel")}>
      <FullRow
        label={
          list.isLoading && page === 0
            ? t("settings.storedFiles.summaryLoading")
            : t("settings.storedFiles.summaryEmpty", {
                count: totalCount,
                bytes: prettyBytes(totalBytes),
              })
        }
        hint={
          scope === "property"
            ? t("settings.storedFiles.summaryHintProperty")
            : t("settings.storedFiles.summaryHintAll")
        }
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <ToggleGroup
            type="single"
            value={scope}
            className="h-7"
            onValueChange={v => v && setScope(v as "property" | "all")}
          >
            <ToggleGroupItem value="property" className="text-xs h-7 px-3">
              {t("settings.storedFiles.scopeProperty")}
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="text-xs h-7 px-3">
              {t("settings.storedFiles.scopeAll")}
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setExpanded(e => !e)}
              disabled={list.isLoading || totalCount === 0}
            >
              {expanded
                ? t("settings.storedFiles.hide")
                : t("settings.storedFiles.browse")}
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={async () => {
                  try {
                    const r = await reap.mutateAsync();
                    toast.success(
                      t("settings.storedFiles.cleanupResult", {
                        retried: r.retried,
                        ok: r.succeeded,
                        failed: r.failed,
                      })
                    );
                    setPage(0);
                    setAllItems([]);
                    await utils.files.list.invalidate();
                  } catch {}
                }}
                disabled={reap.isPending}
              >
                {reap.isPending && (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                )}
                {t("settings.storedFiles.cleanupOrphans")}
              </Button>
            )}
          </div>
        </div>
      </FullRow>

      {expanded && allItems.length > 0 && (
        <div className="px-4 py-3 max-h-96 overflow-y-auto divide-y divide-border">
          {allItems.map(f => (
            <div key={f.id} className="flex items-center gap-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{f.originalName}</p>
                <p className="text-xs text-muted-foreground">
                  {prettyBytes(f.size)} ·{" "}
                  {new Date(f.createdAt).toLocaleDateString()} ·{" "}
                  {f.propertyId == null
                    ? t("settings.storedFiles.legacyLabel")
                    : t("settings.storedFiles.propertyLabel", {
                        id: f.propertyId,
                      })}
                </p>
              </div>
              <a
                href={f.downloadUrl}
                className="text-xs underline text-muted-foreground hover:text-foreground"
                download={f.originalName}
              >
                {t("settings.storedFiles.download")}
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive"
                onClick={() => {
                  if (
                    confirm(
                      t("settings.storedFiles.deleteConfirm", {
                        name: f.originalName,
                      })
                    )
                  ) {
                    deleteFile.mutate({ id: f.id });
                  }
                }}
                disabled={deleteFile.isPending}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {hasMore && (
            <div className="pt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {t("settings.storedFiles.loadedOf", {
                  loaded: allItems.length,
                  total: totalCount,
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setPage(p => p + 1)}
                disabled={list.isFetching}
              >
                {list.isFetching && (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                )}
                {t("settings.storedFiles.loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}
    </Group>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { t } = useTranslation();
  const routeParams = useParams<{ section?: string }>();
  const initialSection: SID =
    routeParams.section &&
    (NAV_IDS as readonly string[]).includes(routeParams.section)
      ? (routeParams.section as SID)
      : "property";
  const [active, setActive] = useState<SID>(initialSection);
  const { data: property, isLoading } = trpc.property.get.useQuery();
  const { data: allProperties } = trpc.property.list.useQuery();
  const { activePropertyId, switchProperty } = useProperty();
  const canDeleteProperty =
    (allProperties?.length ?? 0) > 1 && activePropertyId !== 1;

  // Sync active tab when the wouter route param changes (e.g. after OAuth
  // callback redirects to /#/settings/integrations).
  useEffect(() => {
    if (
      routeParams.section &&
      (NAV_IDS as readonly string[]).includes(routeParams.section)
    ) {
      setActive(routeParams.section as SID);
    }
  }, [routeParams.section]);

  const go = (id: SID) => {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex gap-12 min-h-full">
      {/* Desktop side nav — grouped, order flips in RTL via flex direction */}
      <nav className="hidden md:block w-44 shrink-0 sticky top-4 self-start space-y-5">
        <div>
          <p className="px-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("settings.title")}
          </p>
          {(property?.houseNickname || property?.houseName) && (
            <p className="mt-1 px-2 text-[11px] text-muted-foreground truncate">
              {t("settings.editing")}:{" "}
              <span className="text-foreground font-medium">
                {property.houseNickname || property.houseName}
              </span>
            </p>
          )}
        </div>
        {NAV_GROUPS.map(group => (
          <div key={group.groupKey} className="space-y-0.5">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {t(`settings.navGroup.${group.groupKey}`)}
            </p>
            {group.items.map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => go(id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
                  active === id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t(`settings.${id}`)}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 max-w-xl">
        {/* Mobile top nav — inline horizontal scroll strip */}
        <div className="md:hidden -mx-4 mb-4 px-4 border-b">
          <div className="flex overflow-x-auto gap-1 pb-2">
            {NAV_FLAT.map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => go(id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors",
                  active === id
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`settings.${id}`)}
              </button>
            ))}
          </div>
        </div>
        {active === "property" && <PropertySection p={property} />}
        {active === "purchase" && <PurchaseSection p={property} />}
        {active === "household" && <HouseholdSection />}
        {active === "regional" && <RegionalSection p={property} />}
        {active === "notifications" && <NotificationsSection p={property} />}
        {active === "integrations" && <IntegrationsSection p={property} />}
        {active === "appearance" && <AppearanceSection />}
        {active === "data" && (
          <DataSection
            p={property}
            canDeleteProperty={canDeleteProperty}
            activePropertyId={activePropertyId}
            switchProperty={switchProperty}
          />
        )}
      </div>
    </div>
  );
}
