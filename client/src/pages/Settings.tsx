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
  useState, useEffect, useRef, useCallback, useMemo, type ReactNode,
} from "react";
import { useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProperty } from "@/contexts/PropertyContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from "@/components/ui/command";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Check, ChevronsUpDown, AlertTriangle,
  Download, Sun, Moon, Monitor, ChevronRight, Trash2, RefreshCw,
  Cloud, CheckCircle2, ShieldCheck, ExternalLink,
} from "lucide-react";
import { csrfHeaders } from "@/lib/csrf";

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV_IDS = [
  "property", "purchase", "household", "regional",
  "notifications", "integrations", "appearance", "data",
] as const;
type SID = typeof NAV_IDS[number];

// ─── Layout ───────────────────────────────────────────────────────────────────

function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <p className="px-1 text-xs font-medium text-muted-foreground">{label}</p>
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
            htmlFor && "cursor-pointer",
          )}
        >
          {label}
        </label>
        {hint && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{hint}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center">{children}</div>
    </div>
  );
}

function FullRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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
  width = "w-44",
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
  useEffect(() => { setV(value); }, [value]);

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
      onChange={e => { setV(e.target.value); dirty.current = true; }}
      onBlur={commit}
      onKeyDown={e => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

function Combobox({
  value,
  onSelect,
  options,
  placeholder = "Select…",
  search = "Search…",
  width = "w-52",
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
                  onSelect={() => { onSelect(o.value); setOpen(false); }}
                  className="text-sm"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span>{o.label}</span>
                  {o.sub && <span className="ml-2 text-xs text-muted-foreground">{o.sub}</span>}
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
    <span className={cn(
      "inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity duration-300",
      show ? "opacity-100" : "opacity-0 pointer-events-none",
    )}>
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
  ILS:"₪", USD:"$", EUR:"€", GBP:"£", JPY:"¥",
  CAD:"CA$", AUD:"A$", CHF:"Fr", SGD:"S$", AED:"د.إ",
};
const TIMEZONES = [
  { value: "Asia/Jerusalem",      label: "Asia/Jerusalem",      sub: "UTC+3"  },
  { value: "Asia/Dubai",          label: "Asia/Dubai",          sub: "UTC+4"  },
  { value: "Asia/Riyadh",         label: "Asia/Riyadh",         sub: "UTC+3"  },
  { value: "Europe/London",       label: "Europe/London",       sub: "UTC+1"  },
  { value: "Europe/Paris",        label: "Europe/Paris",        sub: "UTC+2"  },
  { value: "Europe/Berlin",       label: "Europe/Berlin",       sub: "UTC+2"  },
  { value: "Europe/Amsterdam",    label: "Europe/Amsterdam",    sub: "UTC+2"  },
  { value: "America/New_York",    label: "America/New_York",    sub: "UTC-4"  },
  { value: "America/Chicago",     label: "America/Chicago",     sub: "UTC-5"  },
  { value: "America/Los_Angeles", label: "America/Los_Angeles", sub: "UTC-7"  },
  { value: "America/Sao_Paulo",   label: "America/Sao_Paulo",   sub: "UTC-3"  },
  { value: "Asia/Tokyo",          label: "Asia/Tokyo",          sub: "UTC+9"  },
  { value: "Asia/Singapore",      label: "Asia/Singapore",      sub: "UTC+8"  },
  { value: "Australia/Sydney",    label: "Australia/Sydney",    sub: "UTC+10" },
  { value: "UTC",                 label: "UTC",                 sub: "UTC+0"  },
];

// ─── Sections ─────────────────────────────────────────────────────────────────

function PropertySection({ p }: { p: any }) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({ onSuccess: () => u.property.get.invalidate(), onError: e => toast.error(e.message) });
  const save = useCallback((d: any) => m.mutate(d), [m]);
  const g = (k: string, fb: any = "") => p?.[k] ?? fb;

  const specs = [
    { k: "squareMeters", lKey: "settings.size",      placeholder: t("settings.sqm"), suffix: t("settings.sqm") },
    { k: "rooms",        lKey: "settings.rooms",     placeholder: "0",    step: "0.5" },
    { k: "floor",        lKey: "settings.floor",     placeholder: "0" },
    { k: "parkingSpots", lKey: "settings.parking",   placeholder: "0",    min: 0 },
    { k: "yearBuilt",    lKey: "settings.yearBuilt", placeholder: "1998", min: 1800, max: new Date().getFullYear() },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("settings.property")}</h2>
        <Pending show={m.isPending} />
      </div>

      <Group label={t("settings.identity")}>
        <Row label={t("common.name")} hint={t("settings.propertyNameHint")} htmlFor="p-name">
          <Field id="p-name" value={g("houseName")} placeholder={t("settings.placeholderMyHome")} onSave={v => save({ houseName: v })} />
        </Row>
        <Row label={t("settings.nickname")} hint={t("settings.nicknameHint")} htmlFor="p-nick">
          <Field id="p-nick" value={g("houseNickname")} placeholder={t("settings.placeholderHome")} onSave={v => save({ houseNickname: v })} />
        </Row>
        <Row label={t("common.type")}>
          <Select value={g("propertyType") || "Apartment"} onValueChange={v => save({ propertyType: v })}>
            <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Apartment","House","Villa","Townhouse","Studio","Penthouse","Other"].map(ptype => (
                <SelectItem key={ptype} value={ptype}>{t(`propertyType.${ptype}`)}</SelectItem>
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
              onBlur={e => { if (e.target.value !== g("address")) save({ address: e.target.value }); }}
            />
          </div>
          {g("latitude") && g("longitude") && (
            <p className="text-xs text-muted-foreground">
              {parseFloat(g("latitude")).toFixed(5)}, {parseFloat(g("longitude")).toFixed(5)}
            </p>
          )}
        </FullRow>
      </Group>

      <Group label={t("settings.specifications")}>
        {specs.map(({ k, lKey, placeholder, step, min, max, suffix }: any) => (
          <Row key={k} label={t(lKey)} htmlFor={`ps-${k}`}>
            <div className="flex items-center gap-1.5">
              <Field id={`ps-${k}`} type="number" step={step} min={min} max={max}
                value={p?.[k] ? String(p[k]) : ""} placeholder={placeholder} width="w-20"
                onSave={v => save({ [k]: v ? Number(v) : undefined })} />
              {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
            </div>
          </Row>
        ))}
        <Row label={t("settings.storageUnit")} hint={t("settings.storageUnitHint")} htmlFor="ps-stor">
          <Switch id="ps-stor" checked={g("hasStorage", false)} onCheckedChange={v => save({ hasStorage: v })} />
        </Row>
      </Group>
    </div>
  );
}

function PurchaseSection({ p }: { p: any }) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({ onSuccess: () => u.property.get.invalidate(), onError: e => toast.error(e.message) });
  const { data: costs } = trpc.purchaseCosts.list.useQuery();
  const [, nav] = useLocation();
  const price = p?.purchasePrice ?? 0;
  const acq = costs?.reduce((s, c) => s + c.amount, 0) ?? 0;
  const cur = p?.currency ?? "₪";
  const fmt = (c: number) => `${cur}${(c / 100).toLocaleString()}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("settings.purchase")}</h2>
        <Pending show={m.isPending} />
      </div>

      <Group>
        <Row label={t("settings.purchasePrice")} htmlFor="pu-price">
          <Field id="pu-price" type="number" min={0} step="0.01"
            value={price ? String(price / 100) : ""} placeholder="0.00" width="w-36"
            onSave={v => m.mutate({ purchasePrice: v ? Math.round(parseFloat(v) * 100) : undefined })} />
        </Row>
        <Row label={t("settings.purchaseDate")} htmlFor="pu-date">
          <Field id="pu-date" type="date"
            value={p?.purchaseDate ?? ""} width="w-36"
            onSave={v => m.mutate({ purchaseDate: v || undefined })} />
        </Row>
        <Row label={t("settings.acquisitionCosts")} hint={t("settings.acquisitionCostsHint")}>
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

      <Group label={t("settings.totalInvested")}>
        <div className="px-4 py-4 flex items-baseline justify-between">
          <p className="text-sm text-muted-foreground">{t("settings.totalInvestedDesc")}</p>
          <p className="text-base font-semibold tabular-nums">{fmt(price + acq)}</p>
        </div>
      </Group>
    </div>
  );
}

function HouseholdSection() {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const { data: me } = trpc.profiles.current.useQuery();
  const { data: members } = trpc.profiles.list.useQuery();
  const upd = trpc.profiles.updateMe.useMutation({
    onSuccess: () => { u.profiles.current.invalidate(); u.profiles.list.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const ini = (n?: string | null) => (n ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("settings.household")}</h2>
        <Pending show={upd.isPending} />
      </div>

      <Group label={t("settings.yourProfile")}>
        <Row label={t("settings.displayName")} htmlFor="h-name">
          <Field id="h-name" value={me?.name ?? ""} placeholder={t("settings.yourName")}
            onSave={v => upd.mutate({ name: v })} />
        </Row>
        <Row label={t("settings.email")}>
          <span className="text-sm text-muted-foreground">{me?.email ?? "—"}</span>
        </Row>
        <Row label={t("settings.role")}>
          <Badge variant={me?.role === "admin" ? "default" : "secondary"} className="capitalize text-xs h-5">
            {me?.role ?? "user"}
          </Badge>
        </Row>
        <Row label={t("settings.lastSignIn")}>
          <span className="text-sm text-muted-foreground">
            {me?.lastSignedIn ? new Date(me.lastSignedIn).toLocaleDateString() : "—"}
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
                  <Badge variant="outline" className="text-xs h-5 font-normal">{t("settings.you")}</Badge>
                )}
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                  {ini(m.name)}
                </div>
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
  const m = trpc.property.update.useMutation({ onSuccess: () => u.property.get.invalidate(), onError: e => toast.error(e.message) });
  const g = (k: string, f: any = "") => p?.[k] ?? f;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("settings.regional")}</h2>
        <Pending show={m.isPending} />
      </div>

      <Group label={t("settings.currency")}>
        <Row label={t("settings.currency")}>
          <Combobox value={g("currencyCode", "ILS")} options={CURRENCIES} search={t("settings.searchCurrencies")}
            onSelect={v => m.mutate({ currencyCode: v, currency: SYMBOLS[v] ?? v })} />
        </Row>
        <Row label={t("settings.symbol")} hint={t("settings.symbolHint")} htmlFor="r-sym">
          <Field id="r-sym" value={g("currency", "₪")} placeholder="₪" width="w-16"
            onSave={v => m.mutate({ currency: v })} />
        </Row>
      </Group>

      <Group label={t("settings.dateTime")}>
        <Row label={t("settings.timezone")}>
          <Combobox value={g("timezone", "Asia/Jerusalem")} options={TIMEZONES} search={t("settings.searchTimezones")}
            onSelect={v => m.mutate({ timezone: v })} />
        </Row>
        <Row label={t("settings.startOfWeek")}>
          <ToggleGroup type="single" value={g("startOfWeek", "Sunday")} className="h-8"
            onValueChange={v => v && m.mutate({ startOfWeek: v })}>
            <ToggleGroupItem value="Sunday"  className="text-xs h-8 px-4">{t("settings.sun")}</ToggleGroupItem>
            <ToggleGroupItem value="Monday"  className="text-xs h-8 px-4">{t("settings.mon")}</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Group>
    </div>
  );
}

function NotificationsSection({ p }: { p: any }) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({ onSuccess: () => u.property.get.invalidate(), onError: e => toast.error(e.message) });
  const days = p?.reminderDaysBefore ?? 3;

  const toggles = [
    { k: "remindExpenses", lKey: "settings.remindExpenses", dKey: "settings.remindExpensesHint" },
    { k: "remindLoans",    lKey: "settings.remindLoans",    dKey: "settings.remindLoansHint" },
    { k: "remindRepairs",  lKey: "settings.remindRepairs",  dKey: "settings.remindRepairsHint" },
    { k: "remindCalendar", lKey: "settings.remindCalendar", dKey: "settings.remindCalendarHint" },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("settings.notifications")}</h2>
        <Pending show={m.isPending} />
      </div>

      <Group label={t("settings.leadTime")}>
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">{t("settings.remind")}</p>
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {days} {t("settings.daysBefore")}
            </span>
          </div>
          <Slider min={1} max={30} step={1} value={[days]}
            onValueCommit={([v]) => m.mutate({ reminderDaysBefore: v })} />
          <p className="text-xs text-muted-foreground">{t("settings.appliesAll")}</p>
        </div>
      </Group>

      <Group label={t("settings.reminderTypes")}>
        {toggles.map(({ k, lKey, dKey }) => (
          <Row key={k} label={t(lKey)} hint={t(dKey)} htmlFor={`n-${k}`}>
            <Switch id={`n-${k}`}
              checked={p?.[k] ?? true}
              onCheckedChange={v => m.mutate({ [k]: v })} />
          </Row>
        ))}
      </Group>
    </div>
  );
}

function IntegrationsSection({ p }: { p: any }) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({ onSuccess: () => u.property.get.invalidate(), onError: e => toast.error(e.message) });
  const hasKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("settings.integrations")}</h2>
        <Pending show={m.isPending} />
      </div>

      <FileStorageGroup />
      <StoredFilesGroup />

      <Group label="Google Calendar">
        <Row label={t("settings.syncEvents")} hint={t("settings.syncEventsHint")} htmlFor="i-sync">
          <Switch id="i-sync"
            checked={p?.calendarSyncEnabled ?? false}
            onCheckedChange={v => m.mutate({ calendarSyncEnabled: v })} />
        </Row>
        <Row label={t("settings.connectedAccount")}>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{t("settings.notConnected")}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled>
              {t("settings.connect")}
            </Button>
          </div>
        </Row>
      </Group>

      <Group label={t("settings.maps")}>
        <Row label={t("settings.provider")}>
          <ToggleGroup type="single" value={p?.mapsProvider ?? "google"} className="h-8"
            onValueChange={v => v && m.mutate({ mapsProvider: v as any })}>
            <ToggleGroupItem value="google" className="text-xs h-8 px-4">Google</ToggleGroupItem>
            <ToggleGroupItem value="osm"    className="text-xs h-8 px-4">OpenStreetMap</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        {!hasKey && (p?.mapsProvider ?? "google") === "google" && (
          <div className="px-4 py-3 text-xs text-muted-foreground border-t bg-amber-50/60 dark:bg-amber-950/20">
            Add <code className="font-mono text-amber-700 dark:text-amber-400">VITE_GOOGLE_MAPS_API_KEY</code> to <code className="font-mono">.env</code> for geocoding.
          </div>
        )}
      </Group>
    </div>
  );
}

// ─── File Storage (Google Drive) ─────────────────────────────────────────────

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
};

function FileStorageGroup() {
  const { t } = useTranslation();
  const { data: me } = trpc.profiles.current.useQuery();
  const isAdmin = me?.role === "admin";
  const [status, setStatus] = useState<GDriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setStatus({ configured: false, connected: false, needsReconnect: false, emailMasked: null });
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
      toast.error((err as Error).message || t("settings.fileStorage.disconnectFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Group label={t("settings.fileStorage.groupLabel")}>
      {/* Always-visible header explaining what this section configures */}
      <div className="px-4 py-3.5 space-y-1.5 bg-muted/30">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">{t("settings.fileStorage.title")}</p>
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
            <p className="text-sm font-medium">{t("settings.fileStorage.permissionTitle")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("settings.fileStorage.permissionDesc")}{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground inline-flex items-center gap-0.5"
              >
                {t("settings.fileStorage.permissionLink")} <ExternalLink className="h-3 w-3" />
              </a>
              .
            </p>
          </div>
        </div>
      </div>

      {/* Status + actions */}
      {loading ? (
        <div className="px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> {t("settings.fileStorage.loadingStatus")}
        </div>
      ) : !isAdmin ? (
        <div className="px-4 py-3 text-xs text-muted-foreground">
          {t("settings.fileStorage.adminOnly")}
        </div>
      ) : error ? (
        <div className="px-4 py-3 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </div>
      ) : status && !status.configured ? (
        <FullRow
          label={t("settings.fileStorage.notConfiguredLabel")}
          hint={t("settings.fileStorage.notConfiguredHint")}
        >
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md p-3 space-y-2">
            <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">
              {t("settings.fileStorage.howTo")}
            </p>
            <ol className="text-xs text-amber-700 dark:text-amber-300 list-decimal ml-4 space-y-1">
              <li>{t("settings.fileStorage.howToStep1")}</li>
              <li>{t("settings.fileStorage.howToStep2")}</li>
              <li>
                {t("settings.fileStorage.howToStep3")}{" "}
                <code className="font-mono text-[11px] bg-amber-100 dark:bg-amber-900/60 px-1 rounded">
                  {window.location.origin}/api/google-drive/callback
                </code>
              </li>
              <li>
                {t("settings.fileStorage.howToStep4")}
                <pre className="text-[11px] bg-amber-100 dark:bg-amber-900/60 rounded p-2 mt-1 overflow-x-auto font-mono">
{`GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=${window.location.origin}/api/google-drive/callback`}
                </pre>
              </li>
            </ol>
          </div>
        </FullRow>
      ) : status && status.connected && status.needsReconnect ? (
        <FullRow
          label={t("settings.fileStorage.reconnectNeeded")}
          hint={
            status.emailMasked
              ? t("settings.fileStorage.reconnectHintWithEmail", { email: status.emailMasked })
              : t("settings.fileStorage.reconnectHintNoEmail")
          }
        >
          <div className="flex items-center gap-3 border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 rounded-md p-3">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0" />
            <span className="text-xs text-amber-800 dark:text-amber-200 flex-1">
              {t("settings.fileStorage.reconnectBannerBody")}
            </span>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => { window.location.href = new URL("api/google-drive/connect", window.location.href).href; }}
              disabled={busy}
            >
              {t("settings.fileStorage.reconnect")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleDisconnect}
              disabled={busy}
            >
              {t("settings.fileStorage.disconnect")}
            </Button>
          </div>
        </FullRow>
      ) : status && status.connected ? (
        <Row
          label={t("settings.fileStorage.statusLabel")}
          hint={
            status.emailMasked
              ? t("settings.fileStorage.connectedHintWithEmail", { email: status.emailMasked })
              : t("settings.fileStorage.connectedHintNoEmail")
          }
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("settings.fileStorage.connected")}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleDisconnect}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              {t("settings.fileStorage.disconnect")}
            </Button>
          </div>
        </Row>
      ) : (
        <Row
          label={t("settings.fileStorage.statusLabel")}
          hint={t("settings.fileStorage.notConnectedHint")}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{t("settings.notConnected")}</span>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                window.location.href = new URL("api/google-drive/connect", window.location.href).href;
              }}
              disabled={busy}
            >
              {t("settings.connect")}
            </Button>
          </div>
        </Row>
      )}
    </Group>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <h2 className="text-sm font-semibold">{t("settings.appearance")}</h2>

      <Group>
        <Row label={t("settings.theme")} hint={t("settings.themeHint")}>
          <ToggleGroup type="single" value={theme} className="h-8"
            onValueChange={v => v && setTheme(v as any)}>
            <ToggleGroupItem value="light"  className="h-8 px-3 text-xs gap-1.5">
              <Sun className="h-3.5 w-3.5" />{t("settings.themeLight")}
            </ToggleGroupItem>
            <ToggleGroupItem value="dark"   className="h-8 px-3 text-xs gap-1.5">
              <Moon className="h-3.5 w-3.5" />{t("settings.themeDark")}
            </ToggleGroupItem>
            <ToggleGroupItem value="system" className="h-8 px-3 text-xs gap-1.5">
              <Monitor className="h-3.5 w-3.5" />{t("settings.themeSystem")}
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row label={t("settings.language")} hint={t("settings.languageHint")}>
          <ToggleGroup type="single" value={language} className="h-8"
            onValueChange={v => v && setLanguage(v as any)}>
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
  p, canDeleteProperty, activePropertyId, switchProperty,
}: {
  p: any;
  canDeleteProperty: boolean;
  activePropertyId: number;
  switchProperty: (id: number) => void;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const { refetch, isFetching } = trpc.data.exportAll.useQuery(undefined, { enabled: false });
  const del = trpc.data.deleteAll.useMutation({
    onSuccess: () => { toast.success(t("settings.allRecordsDeleted")); setPhrase(""); setDanger(false); },
    onError: e => toast.error(e.message),
  });
  const delProp = trpc.property.delete.useMutation({
    onSuccess: () => {
      toast.success(t("settings.propertyDeleted"));
      u.property.list.invalidate();
      switchProperty(1);
    },
    onError: e => toast.error(e.message),
  });
  const [danger, setDanger] = useState(false);
  const [phrase, setPhrase] = useState("");
  const seed = trpc.data.seedMock.useMutation({
    onSuccess: ({ propertyId }) => {
      toast.success(t("settings.demoRestored"));
      u.property.list.invalidate();
      switchProperty(propertyId);
    },
    onError: e => toast.error(e.message),
  });
  const [propDanger, setPropDanger] = useState(false);
  const [propPhrase, setPropPhrase] = useState("");
  const expected = p?.houseName ?? "My Home";
  const propExpected = p?.houseName ?? "My Home";

  const exportAll = async () => {
    const r = await refetch();
    if (!r.data) return;
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `homevault_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <h2 className="text-sm font-semibold">{t("settings.data")}</h2>

      <Group label={t("settings.demoData")}>
        <Row label={t("settings.restoreDemo")} hint={t("settings.restoreDemoHint")}>
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => seed.mutate()}
            disabled={seed.isPending}
          >
            {seed.isPending
              ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              : <RefreshCw className="mr-1.5 h-3 w-3" />}
            {seed.isPending ? t("settings.restoringDemo") : t("settings.restoreDemoBtn")}
          </Button>
        </Row>
      </Group>

      <Group label={t("settings.export")}>
        <Row label={t("settings.allData")} hint={t("settings.allDataHint")}>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportAll} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Download className="mr-1.5 h-3 w-3" />}
            {isFetching ? t("settings.preparing") : t("settings.downloadJson")}
          </Button>
        </Row>
        <Row
          label={t("settings.exportFilesZipLabel")}
          hint={t("settings.exportFilesZipHint")}
        >
          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
            <a href="/api/export/files.zip" download>
              <Download className="mr-1.5 h-3 w-3" />
              {t("settings.exportFilesZipBtn")}
            </a>
          </Button>
        </Row>
        <Row label={t("settings.perModule")} hint={t("settings.perModuleHint")}>
          <span className="text-xs text-muted-foreground">{t("settings.perModuleList")}</span>
        </Row>
      </Group>

      <Group label={t("settings.dangerZone")}>
        {!danger ? (
          <Row label={t("settings.deleteAll")} hint={t("settings.deleteAllHint")}>
            <Button
              variant="outline" size="sm"
              className="h-7 text-xs text-destructive border-destructive/25 hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setDanger(true)}
            >
              {t("settings.deleteAllBtn")}
            </Button>
          </Row>
        ) : (
          <div className="px-4 py-4 space-y-3">
            <p className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />{t("settings.cannotUndo")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("settings.typePrefix")} <strong className="text-foreground font-medium">{expected}</strong> {t("settings.typeSuffix")}
            </p>
            <Input
              value={phrase}
              placeholder={expected}
              className="h-8 text-sm"
              onChange={e => setPhrase(e.target.value)}
              onKeyDown={e => e.key === "Escape" && setDanger(false)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="destructive" size="sm" className="h-7 text-xs"
                disabled={phrase !== expected || del.isPending}
                onClick={() => del.mutate({ confirmationPhrase: phrase })}
              >
                {del.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                {t("settings.confirm")}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs"
                onClick={() => { setDanger(false); setPhrase(""); }}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}

        {canDeleteProperty && (
          <>
            {!propDanger ? (
              <Row label={t("settings.deleteProperty")} hint={t("settings.deletePropertyHint")}>
                <Button
                  variant="outline" size="sm"
                  className="h-7 text-xs text-destructive border-destructive/25 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => setPropDanger(true)}
                >
                  <Trash2 className="h-3 w-3 mr-1.5" />{t("settings.deletePropertyBtn")}
                </Button>
              </Row>
            ) : (
              <div className="px-4 py-4 space-y-3">
                <p className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />{t("settings.deletePropertyConfirm")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("settings.typePrefix")} <strong className="text-foreground font-medium">{propExpected}</strong> {t("settings.typeSuffix")}
                </p>
                <Input
                  value={propPhrase}
                  placeholder={propExpected}
                  className="h-8 text-sm"
                  onChange={e => setPropPhrase(e.target.value)}
                  onKeyDown={e => e.key === "Escape" && setPropDanger(false)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive" size="sm" className="h-7 text-xs"
                    disabled={propPhrase !== propExpected || delProp.isPending}
                    onClick={() => delProp.mutate({ propertyId: activePropertyId })}
                  >
                    {delProp.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                    {t("settings.deletePropertyConfirmBtn")}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs"
                    onClick={() => { setPropDanger(false); setPropPhrase(""); }}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Group>
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
    const base: any = { limit: FILES_PAGE_SIZE, offset: page * FILES_PAGE_SIZE };
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
    else setAllItems((prev) => [...prev, ...list.data!.items]);
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
    onError: (e) => toast.error(e.message),
  });
  const reap = trpc.files.reapOrphans.useMutation({
    onError: (e) => toast.error(e.message),
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
            onValueChange={(v) => v && setScope(v as "property" | "all")}
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
              className="h-7 text-xs"
              onClick={() => setExpanded((e) => !e)}
              disabled={list.isLoading || totalCount === 0}
            >
              {expanded ? t("settings.storedFiles.hide") : t("settings.storedFiles.browse")}
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={async () => {
                  try {
                    const r = await reap.mutateAsync();
                    toast.success(
                      t("settings.storedFiles.cleanupResult", {
                        retried: r.retried,
                        ok: r.succeeded,
                        failed: r.failed,
                      }),
                    );
                    setPage(0);
                    setAllItems([]);
                    await utils.files.list.invalidate();
                  } catch {}
                }}
                disabled={reap.isPending}
              >
                {reap.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                {t("settings.storedFiles.cleanupOrphans")}
              </Button>
            )}
          </div>
        </div>
      </FullRow>

      {expanded && allItems.length > 0 && (
        <div className="px-4 py-3 max-h-96 overflow-y-auto divide-y divide-border">
          {allItems.map((f) => (
            <div key={f.id} className="flex items-center gap-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{f.originalName}</p>
                <p className="text-xs text-muted-foreground">
                  {prettyBytes(f.size)} · {new Date(f.createdAt).toLocaleDateString()} ·{" "}
                  {f.propertyId == null
                    ? t("settings.storedFiles.legacyLabel")
                    : t("settings.storedFiles.propertyLabel", { id: f.propertyId })}
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
                  if (confirm(t("settings.storedFiles.deleteConfirm", { name: f.originalName }))) {
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
                {t("settings.storedFiles.loadedOf", { loaded: allItems.length, total: totalCount })}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPage((p) => p + 1)}
                disabled={list.isFetching}
              >
                {list.isFetching && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
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
  const initialSection: SID = (routeParams.section && (NAV_IDS as readonly string[]).includes(routeParams.section)
    ? (routeParams.section as SID)
    : "property");
  const [active, setActive] = useState<SID>(initialSection);
  const { data: property, isLoading } = trpc.property.get.useQuery();
  const { data: allProperties } = trpc.property.list.useQuery();
  const { activePropertyId, switchProperty } = useProperty();
  const canDeleteProperty = (allProperties?.length ?? 0) > 1 && activePropertyId !== 1;

  const NAV = NAV_IDS.map(id => ({ id, label: t(`settings.${id}`) }));

  // Sync active tab when the wouter route param changes (e.g. after OAuth
  // callback redirects to /#/settings/integrations).
  useEffect(() => {
    if (routeParams.section && (NAV_IDS as readonly string[]).includes(routeParams.section)) {
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

      {/* Desktop side nav — text only, order flips in RTL via flex direction */}
      <nav className="hidden md:block w-36 shrink-0 sticky top-4 self-start">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("settings.title")}
        </p>
        {(property?.houseNickname || property?.houseName) && (
          <p className="mb-3 px-2 text-[11px] text-muted-foreground truncate">
            {t("settings.editing")}:{" "}
            <span className="text-foreground font-medium">
              {property.houseNickname || property.houseName}
            </span>
          </p>
        )}
        {NAV.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => go(id)}
            className={cn(
              "w-full text-start px-2 py-1.5 rounded text-sm transition-colors",
              active === id
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 max-w-xl">
        {/* Mobile top nav — inline horizontal scroll strip */}
        <div className="md:hidden -mx-4 mb-4 px-4 border-b">
          <div className="flex overflow-x-auto gap-0.5 pb-2">
            {NAV.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => go(id)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors",
                  active === id
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {active === "property"      && <PropertySection      p={property} />}
        {active === "purchase"      && <PurchaseSection      p={property} />}
        {active === "household"     && <HouseholdSection />}
        {active === "regional"      && <RegionalSection      p={property} />}
        {active === "notifications" && <NotificationsSection p={property} />}
        {active === "integrations"  && <IntegrationsSection  p={property} />}
        {active === "appearance"    && <AppearanceSection />}
        {active === "data"          && <DataSection          p={property} canDeleteProperty={canDeleteProperty} activePropertyId={activePropertyId} switchProperty={switchProperty} />}
      </div>
    </div>
  );
}
