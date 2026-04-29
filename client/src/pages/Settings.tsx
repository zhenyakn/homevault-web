/**
 * Settings
 *
 * Pattern: Vercel / Linear / GitHub
 *  - Left nav: text only, no icons, small font
 *  - Groups: border + divide-y only, bg-background (no elevation)
 *  - Rows: label left / control right, 52px min-height
 *  - Global pending indicator in content header — no per-field badges
 *  - Auto-save on every change (blur for text, change for toggles/selects)
 *  - No Save buttons, no placeholder cards
 *  - Address = text input only, map lives on the dashboard
 */

import {
  useState, useEffect, useRef, useCallback, type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
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
  Download, Sun, Moon, Monitor, ChevronRight, Trash2,
} from "lucide-react";

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { id: "property",      label: "Property"      },
  { id: "purchase",      label: "Purchase"      },
  { id: "household",     label: "Household"     },
  { id: "regional",      label: "Regional"      },
  { id: "notifications", label: "Notifications" },
  { id: "integrations",  label: "Integrations"  },
  { id: "appearance",    label: "Appearance"    },
  { id: "data",          label: "Data"          },
] as const;
type SID = typeof NAV[number]["id"];

// ─── Layout ───────────────────────────────────────────────────────────────────

/** Labelled group of rows */
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

/** Single settings row */
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

/** Row where the control spans the full width below the label */
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

/** Text input that saves on blur / Enter */
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

/** Searchable combobox (Popover + Command) */
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
            <CommandEmpty>No results.</CommandEmpty>
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

/** Small pending spinner shown in the section header */
function Pending({ show }: { show: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity duration-300",
      show ? "opacity-100" : "opacity-0 pointer-events-none",
    )}>
      <Loader2 className="h-3 w-3 animate-spin" />
      Saving
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
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({ onSuccess: () => u.property.get.invalidate(), onError: e => toast.error(e.message) });
  const save = useCallback((d: any) => m.mutate(d), [m]);
  const g = (k: string, fb: any = "") => p?.[k] ?? fb;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Property</h2>
        <Pending show={m.isPending} />
      </div>

      <Group label="Identity">
        <Row label="Name" hint="Shown in the sidebar and dashboard" htmlFor="p-name">
          <Field id="p-name" value={g("houseName")} placeholder="My Home" onSave={v => save({ houseName: v })} />
        </Row>
        <Row label="Nickname" hint="Shorter display name" htmlFor="p-nick">
          <Field id="p-nick" value={g("houseNickname")} placeholder="Home" onSave={v => save({ houseNickname: v })} />
        </Row>
        <Row label="Type">
          <Select value={g("propertyType") || "Apartment"} onValueChange={v => save({ propertyType: v })}>
            <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Apartment","House","Villa","Townhouse","Studio","Penthouse","Other"].map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Group>

      <Group label="Location">
        <FullRow label="Address" hint="Used for the map on the dashboard">
          <div className="flex gap-2">
            <Textarea
              key={g("address")}
              defaultValue={g("address")}
              placeholder="Street address, city, country"
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

      <Group label="Specifications">
        {[
          { k: "squareMeters", l: "Size",         placeholder: "sqm",  suffix: "sqm" },
          { k: "rooms",        l: "Rooms",         placeholder: "0",    step: "0.5" },
          { k: "floor",        l: "Floor",         placeholder: "0" },
          { k: "parkingSpots", l: "Parking",       placeholder: "0",    min: 0 },
          { k: "yearBuilt",    l: "Year built",    placeholder: "1998", min: 1800, max: new Date().getFullYear() },
        ].map(({ k, l, placeholder, step, min, max, suffix }) => (
          <Row key={k} label={l} htmlFor={`ps-${k}`}>
            <div className="flex items-center gap-1.5">
              <Field id={`ps-${k}`} type="number" step={step} min={min} max={max}
                value={p?.[k] ? String(p[k]) : ""} placeholder={placeholder} width="w-20"
                onSave={v => save({ [k]: v ? Number(v) : undefined })} />
              {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
            </div>
          </Row>
        ))}
        <Row label="Storage unit" hint="Dedicated on-site storage" htmlFor="ps-stor">
          <Switch id="ps-stor" checked={g("hasStorage", false)} onCheckedChange={v => save({ hasStorage: v })} />
        </Row>
      </Group>
    </div>
  );
}

function PurchaseSection({ p }: { p: any }) {
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
        <h2 className="text-sm font-semibold">Purchase</h2>
        <Pending show={m.isPending} />
      </div>

      <Group>
        <Row label="Purchase price" htmlFor="pu-price">
          <Field id="pu-price" type="number" min={0} step="0.01"
            value={price ? String(price / 100) : ""} placeholder="0.00" width="w-36"
            onSave={v => m.mutate({ purchasePrice: v ? Math.round(parseFloat(v) * 100) : undefined })} />
        </Row>
        <Row label="Purchase date" htmlFor="pu-date">
          <Field id="pu-date" type="date"
            value={p?.purchaseDate ?? ""} width="w-36"
            onSave={v => m.mutate({ purchaseDate: v || undefined })} />
        </Row>
        <Row label="Acquisition costs" hint="Legal, tax, inspection, moving">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium tabular-nums">{fmt(acq)}</span>
            <button
              type="button"
              onClick={() => nav("/purchase-costs")}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
            >
              Manage <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </Row>
      </Group>

      <Group label="Total invested">
        <div className="px-4 py-4 flex items-baseline justify-between">
          <p className="text-sm text-muted-foreground">Purchase + acquisition costs</p>
          <p className="text-base font-semibold tabular-nums">{fmt(price + acq)}</p>
        </div>
      </Group>
    </div>
  );
}

function HouseholdSection() {
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
        <h2 className="text-sm font-semibold">Household</h2>
        <Pending show={upd.isPending} />
      </div>

      <Group label="Your profile">
        <Row label="Display name" htmlFor="h-name">
          <Field id="h-name" value={me?.name ?? ""} placeholder="Your name"
            onSave={v => upd.mutate({ name: v })} />
        </Row>
        <Row label="Email">
          <span className="text-sm text-muted-foreground">{me?.email ?? "—"}</span>
        </Row>
        <Row label="Role">
          <Badge variant={me?.role === "admin" ? "default" : "secondary"} className="capitalize text-xs h-5">
            {me?.role ?? "user"}
          </Badge>
        </Row>
        <Row label="Last sign-in">
          <span className="text-sm text-muted-foreground">
            {me?.lastSignedIn ? new Date(me.lastSignedIn).toLocaleDateString() : "—"}
          </span>
        </Row>
      </Group>

      {(members?.length ?? 0) > 0 && (
        <Group label={`Members · ${members?.length}`}>
          {members?.map(m => (
            <Row
              key={m.id}
              label={m.name ?? "Unknown"}
              hint={m.email ?? m.openId}
            >
              <div className="flex items-center gap-2">
                {m.id === me?.id && (
                  <Badge variant="outline" className="text-xs h-5 font-normal">you</Badge>
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
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({ onSuccess: () => u.property.get.invalidate(), onError: e => toast.error(e.message) });
  const g = (k: string, f: any = "") => p?.[k] ?? f;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Regional</h2>
        <Pending show={m.isPending} />
      </div>

      <Group label="Currency">
        <Row label="Currency">
          <Combobox value={g("currencyCode", "ILS")} options={CURRENCIES} search="Search currencies…"
            onSelect={v => m.mutate({ currencyCode: v, currency: SYMBOLS[v] ?? v })} />
        </Row>
        <Row label="Symbol" hint="Override the default symbol" htmlFor="r-sym">
          <Field id="r-sym" value={g("currency", "₪")} placeholder="₪" width="w-16"
            onSave={v => m.mutate({ currency: v })} />
        </Row>
      </Group>

      <Group label="Date & time">
        <Row label="Timezone">
          <Combobox value={g("timezone", "Asia/Jerusalem")} options={TIMEZONES} search="Search timezones…"
            onSelect={v => m.mutate({ timezone: v })} />
        </Row>
        <Row label="Start of week">
          <ToggleGroup type="single" value={g("startOfWeek", "Sunday")} className="h-8"
            onValueChange={v => v && m.mutate({ startOfWeek: v })}>
            <ToggleGroupItem value="Sunday"  className="text-xs h-8 px-4">Sun</ToggleGroupItem>
            <ToggleGroupItem value="Monday"  className="text-xs h-8 px-4">Mon</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Group>
    </div>
  );
}

function NotificationsSection({ p }: { p: any }) {
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({ onSuccess: () => u.property.get.invalidate(), onError: e => toast.error(e.message) });
  const days = p?.reminderDaysBefore ?? 3;

  const toggles = [
    { k: "remindExpenses", l: "Recurring expenses",  d: "Before monthly or quarterly payments are due" },
    { k: "remindLoans",    l: "Loan repayments",      d: "Before loan repayment due dates" },
    { k: "remindRepairs",  l: "Open repairs",         d: "When a repair has been pending too long" },
    { k: "remindCalendar", l: "Calendar events",      d: "Before manually-added calendar events" },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Notifications</h2>
        <Pending show={m.isPending} />
      </div>

      <Group label="Lead time">
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">Remind</p>
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {days} {days === 1 ? "day" : "days"} before
            </span>
          </div>
          <Slider min={1} max={30} step={1} value={[days]}
            onValueCommit={([v]) => m.mutate({ reminderDaysBefore: v })} />
          <p className="text-xs text-muted-foreground">Applies to all reminder types below</p>
        </div>
      </Group>

      <Group label="Reminder types">
        {toggles.map(({ k, l, d }) => (
          <Row key={k} label={l} hint={d} htmlFor={`n-${k}`}>
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
  const u = trpc.useUtils();
  const m = trpc.property.update.useMutation({ onSuccess: () => u.property.get.invalidate(), onError: e => toast.error(e.message) });
  const hasKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Integrations</h2>
        <Pending show={m.isPending} />
      </div>

      <Group label="Google Calendar">
        <Row label="Sync events" hint="Push HomeVault events to Google Calendar" htmlFor="i-sync">
          <Switch id="i-sync"
            checked={p?.calendarSyncEnabled ?? false}
            onCheckedChange={v => m.mutate({ calendarSyncEnabled: v })} />
        </Row>
        <Row label="Connected account">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Not connected</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled>
              Connect
            </Button>
          </div>
        </Row>
      </Group>

      <Group label="Maps">
        <Row label="Provider">
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

function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-5">
      <h2 className="text-sm font-semibold">Appearance</h2>

      <Group>
        <Row label="Theme" hint="Saved in your browser, applies immediately">
          <ToggleGroup type="single" value={theme} className="h-8"
            onValueChange={v => v && setTheme(v as any)}>
            <ToggleGroupItem value="light"  className="h-8 px-3 text-xs gap-1.5">
              <Sun className="h-3.5 w-3.5" />Light
            </ToggleGroupItem>
            <ToggleGroupItem value="dark"   className="h-8 px-3 text-xs gap-1.5">
              <Moon className="h-3.5 w-3.5" />Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="system" className="h-8 px-3 text-xs gap-1.5">
              <Monitor className="h-3.5 w-3.5" />System
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
  const u = trpc.useUtils();
  const { refetch, isFetching } = trpc.data.exportAll.useQuery(undefined, { enabled: false });
  const del = trpc.data.deleteAll.useMutation({
    onSuccess: () => { toast.success("All records deleted"); setPhrase(""); setDanger(false); },
    onError: e => toast.error(e.message),
  });
  const delProp = trpc.property.delete.useMutation({
    onSuccess: () => {
      toast.success("Property deleted");
      u.property.list.invalidate();
      switchProperty(1);
    },
    onError: e => toast.error(e.message),
  });
  const [danger, setDanger] = useState(false);
  const [phrase, setPhrase] = useState("");
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
      <h2 className="text-sm font-semibold">Data</h2>

      <Group label="Export">
        <Row label="All data" hint="Expenses, repairs, upgrades, loans, wishlist, calendar">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportAll} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Download className="mr-1.5 h-3 w-3" />}
            {isFetching ? "Preparing…" : "Download JSON"}
          </Button>
        </Row>
        <Row label="Per module" hint="CSV available from each module page">
          <span className="text-xs text-muted-foreground">Expenses · Repairs · Loans …</span>
        </Row>
      </Group>

      <Group label="Danger zone">
        {!danger ? (
          <Row
            label="Delete all records"
            hint="Permanently removes all financial data. Property settings preserved."
          >
            <Button
              variant="outline" size="sm"
              className="h-7 text-xs text-destructive border-destructive/25 hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setDanger(true)}
            >
              Delete all…
            </Button>
          </Row>
        ) : (
          <div className="px-4 py-4 space-y-3">
            <p className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />This cannot be undone
            </p>
            <p className="text-sm text-muted-foreground">
              Type <strong className="text-foreground font-medium">{expected}</strong> to confirm.
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
                Confirm
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs"
                onClick={() => { setDanger(false); setPhrase(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {canDeleteProperty && (
          <>
            {!propDanger ? (
              <Row
                label="Delete this property"
                hint="Permanently removes the property and all its data."
              >
                <Button
                  variant="outline" size="sm"
                  className="h-7 text-xs text-destructive border-destructive/25 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => setPropDanger(true)}
                >
                  <Trash2 className="h-3 w-3 mr-1.5" />Delete property…
                </Button>
              </Row>
            ) : (
              <div className="px-4 py-4 space-y-3">
                <p className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />This will delete the property and all its data
                </p>
                <p className="text-sm text-muted-foreground">
                  Type <strong className="text-foreground font-medium">{propExpected}</strong> to confirm.
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
                    Delete property
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs"
                    onClick={() => { setPropDanger(false); setPropPhrase(""); }}>
                    Cancel
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

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [active, setActive] = useState<SID>("property");
  const { data: property, isLoading } = trpc.property.get.useQuery();
  const { data: allProperties } = trpc.property.list.useQuery();
  const { activePropertyId, switchProperty } = useProperty();
  const canDeleteProperty = (allProperties?.length ?? 0) > 1 && activePropertyId !== 1;

  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as SID;
    if (hash && NAV.find(n => n.id === hash)) setActive(hash);
  }, []);

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

      {/* Desktop left nav — text only */}
      <nav className="hidden md:block w-36 shrink-0 sticky top-4 self-start">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Settings
        </p>
        {(property?.houseNickname || property?.houseName) && (
          <p className="mb-3 px-2 text-[11px] text-muted-foreground truncate">
            Editing:{" "}
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
              "w-full text-left px-2 py-1.5 rounded text-sm transition-colors",
              active === id
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-sm">
        <div className="flex overflow-x-auto gap-0.5 px-3 py-2">
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

      {/* Content */}
      <div className="flex-1 min-w-0 max-w-xl pb-20 md:pb-0">
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
