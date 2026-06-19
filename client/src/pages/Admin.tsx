import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCapabilities } from "@/hooks/useCapabilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

function errMessage(e: unknown): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : "Something went wrong";
}

type Tab = "overview" | "users" | "tenants" | "plans" | "audit";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "tenants", label: "Tenants" },
  { key: "plans", label: "Plans" },
  { key: "audit", label: "Audit log" },
];

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const { isSaas } = useCapabilities();
  const isSuperAdmin = user?.globalRole === "superadmin";
  // Plans are a hosted (SAAS) concept; hide the tab on standalone installs.
  const tabs = isSaas ? TABS : TABS.filter(t => t.key !== "plans");

  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <p className="text-sm">
              You don't have access to the admin console.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin console</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Server-wide users, workspaces, and configuration.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview />}
      {tab === "users" && <UsersTab />}
      {tab === "tenants" && <TenantsTab />}
      {tab === "plans" && isSaas && <PlansTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

function Overview() {
  const utils = trpc.useUtils();
  const stats = trpc.admin.stats.useQuery();
  const config = trpc.admin.config.get.useQuery();
  const setSignups = trpc.admin.config.setSignupsEnabled.useMutation({
    onSuccess: () => utils.admin.config.get.invalidate(),
    onError: e => toast.error(errMessage(e)),
  });
  const setAppMode = trpc.admin.config.setAppMode.useMutation({
    onSuccess: () => {
      utils.admin.config.get.invalidate();
      utils.admin.stats.invalidate();
    },
    onError: e => toast.error(errMessage(e)),
  });
  const setEmailVerification =
    trpc.admin.config.setEmailVerification.useMutation({
      onSuccess: () => utils.admin.config.get.invalidate(),
      onError: e => toast.error(errMessage(e)),
    });
  const setLocalLogin = trpc.admin.config.setLocalLogin.useMutation({
    onSuccess: (_data, vars) => {
      if (vars.enabled) {
        // Enabling drops the auto-admin session; reload so the now-signed-out
        // client lands on the login screen.
        toast.success("User login enabled — reloading…");
        setTimeout(() => window.location.reload(), 900);
      } else {
        utils.admin.config.get.invalidate();
        toast.success("Automatic admin login restored");
      }
    },
    onError: e => toast.error(errMessage(e)),
  });
  const mode = config.data?.appMode;
  const nextMode = mode === "saas" ? "standalone" : "saas";
  const localLoginOn = config.data?.localLoginEnabled ?? false;
  const credentialedAdmins = config.data?.credentialedSuperAdmins ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          ["Users", stats.data?.users],
          ["Workspaces", stats.data?.tenants],
          ["Properties", stats.data?.properties],
        ].map(([label, n]) => (
          <Card key={label as string}>
            <CardContent className="py-6 text-center">
              <div className="text-3xl font-bold">{n ?? "—"}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Server configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Deployment mode</p>
              <p className="text-xs text-muted-foreground">
                {mode === "saas"
                  ? "Cloud, multi-tenant: open registration and tenant isolation."
                  : "Single install: invite-only, preserves standalone behaviour."}
                {config.data &&
                  config.data.appMode !== config.data.appModeEnvDefault &&
                  ` Overrides the APP_MODE env default (${config.data.appModeEnvDefault}).`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{mode ?? "—"}</Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  setAppMode.isPending ||
                  config.isLoading ||
                  (nextMode === "saas" && config.data?.noAuth)
                }
                title={
                  nextMode === "saas" && config.data?.noAuth
                    ? "SAAS is incompatible with NO_AUTH mode."
                    : undefined
                }
                onClick={() => setAppMode.mutate({ mode: nextMode })}
              >
                Switch to {nextMode}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Open registration</p>
              <p className="text-xs text-muted-foreground">
                Allow anyone to create an account. Invited users can always
                join.
              </p>
            </div>
            <Button
              variant={config.data?.signupsEnabled ? "default" : "outline"}
              size="sm"
              disabled={setSignups.isPending || config.isLoading}
              onClick={() =>
                setSignups.mutate({ enabled: !config.data?.signupsEnabled })
              }
            >
              {config.data?.signupsEnabled ? "Enabled" : "Disabled"}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Require email verification</p>
              <p className="text-xs text-muted-foreground">
                Block sign-in until the address is confirmed
                {config.data?.requireEmailVerification &&
                config.data.emailVerificationGraceHours > 0
                  ? `, after a ${config.data.emailVerificationGraceHours}h grace period.`
                  : "."}
              </p>
            </div>
            <Button
              variant={
                config.data?.requireEmailVerification ? "default" : "outline"
              }
              size="sm"
              disabled={setEmailVerification.isPending || config.isLoading}
              onClick={() =>
                setEmailVerification.mutate({
                  required: !config.data?.requireEmailVerification,
                  graceHours: config.data?.emailVerificationGraceHours ?? 0,
                })
              }
            >
              {config.data?.requireEmailVerification ? "Required" : "Optional"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {config.data?.noAuth && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign-in security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">User login</p>
                <p className="text-xs text-muted-foreground">
                  {localLoginOn
                    ? "On — everyone must sign in with their own email and password."
                    : "Off — anyone who reaches this server is automatically signed in as a single admin (admin@local) with no password."}
                </p>
              </div>
              <Badge variant={localLoginOn ? "default" : "secondary"}>
                {localLoginOn ? "User login" : "Auto-admin"}
              </Badge>
            </div>

            {!localLoginOn && credentialedAdmins < 1 && (
              <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  Create a super-admin with a password first (Users → New user →
                  grant super-admin). Otherwise enabling login would lock you
                  out of the console.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {localLoginOn
                  ? "Turn this off to restore the automatic admin login."
                  : "Turn this on once at least one super-admin has a password."}
              </p>
              <Button
                variant={localLoginOn ? "outline" : "default"}
                size="sm"
                disabled={
                  setLocalLogin.isPending ||
                  config.isLoading ||
                  (!localLoginOn && credentialedAdmins < 1)
                }
                onClick={() => setLocalLogin.mutate({ enabled: !localLoginOn })}
              >
                {setLocalLogin.isPending && (
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                )}
                {localLoginOn ? "Disable user login" : "Enable user login"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UsersTab() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const users = trpc.admin.users.list.useQuery({ search: search || undefined });
  const setRole = trpc.admin.users.setGlobalRole.useMutation({
    onSuccess: () => utils.admin.users.list.invalidate(),
    onError: e => toast.error(errMessage(e)),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base">Users</CardTitle>
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mt-2 max-w-sm"
          />
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          New user
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {users.isLoading && (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {users.data?.map(u => (
          <div
            key={u.id}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {u.name || u.email || `User #${u.id}`}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {u.email} · {u.loginMethod ?? "—"}
              </p>
            </div>
            <Select
              value={u.globalRole}
              onValueChange={v =>
                setRole.mutate({
                  userId: u.id,
                  globalRole: v as "user" | "superadmin",
                })
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="superadmin">superadmin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>

      {creating && (
        <CreateUserDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            utils.admin.users.list.invalidate();
            utils.admin.stats.invalidate();
          }}
        />
      )}
    </Card>
  );
}

function CreateUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [superadmin, setSuperadmin] = useState(false);
  const create = trpc.admin.users.create.useMutation({
    onSuccess: () => {
      toast.success(`Account created for ${email}`);
      onCreated();
      onClose();
    },
    onError: e => toast.error(errMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      email: email.trim(),
      password,
      name: name.trim() || undefined,
      globalRole: superadmin ? "superadmin" : "user",
      tenantName: tenantName.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="bg-card w-full max-w-md rounded-xl border shadow-lg p-5 space-y-4 max-h-[90vh] overflow-auto"
      >
        <div>
          <h3 className="text-base font-semibold">Create a user</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Provision an account directly. The user can sign in with this email
            and password immediately — no verification email is required.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-user-email">Email</Label>
          <Input
            id="new-user-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-name">Name (optional)</Label>
          <Input
            id="new-user-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Derived from the email if left blank"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-password">Password</Label>
          <Input
            id="new-user-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <p className="text-xs text-muted-foreground">
            At least 8 characters.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-tenant">Workspace name (optional)</Label>
          <Input
            id="new-user-tenant"
            value={tenantName}
            onChange={e => setTenantName(e.target.value)}
            placeholder="A personal workspace is created if left blank"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={superadmin}
            onChange={e => setSuperadmin(e.target.checked)}
          />
          Grant server-wide super-admin
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && (
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
            )}
            Create user
          </Button>
        </div>
      </form>
    </div>
  );
}

function TenantsTab() {
  const utils = trpc.useUtils();
  const tenants = trpc.admin.tenants.list.useQuery();
  const plans = trpc.admin.billing.plans.useQuery();
  const setStatus = trpc.admin.tenants.setStatus.useMutation({
    onSuccess: () => utils.admin.tenants.list.invalidate(),
    onError: e => toast.error(errMessage(e)),
  });
  const assignPlan = trpc.admin.billing.assignPlan.useMutation({
    onSuccess: () => {
      utils.admin.tenants.list.invalidate();
      toast.success("Plan updated");
    },
    onError: e => toast.error(errMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Workspaces</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {tenants.isLoading && (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {tenants.data?.map(t => (
          <div key={t.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {t.name}{" "}
                  {t.status === "suspended" && (
                    <Badge variant="destructive" className="ms-1">
                      suspended
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.memberCount}
                  {t.maxMembers != null ? `/${t.maxMembers}` : ""} member(s) ·{" "}
                  {t.propertyCount}
                  {t.maxProperties != null ? `/${t.maxProperties}` : ""} propert
                  {t.propertyCount === 1 ? "y" : "ies"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value={t.planId ?? ""}
                  disabled={assignPlan.isPending || plans.isLoading}
                  onChange={e =>
                    assignPlan.mutate({
                      tenantId: t.id,
                      planId: e.target.value,
                    })
                  }
                >
                  <option value="" disabled>
                    {t.planId ? t.planId : "No plan"}
                  </option>
                  {plans.data?.plans.map(p => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant={t.status === "active" ? "outline" : "default"}
                  size="sm"
                  disabled={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate({
                      tenantId: t.id,
                      status: t.status === "active" ? "suspended" : "active",
                    })
                  }
                >
                  {t.status === "active" ? "Suspend" : "Reactivate"}
                </Button>
              </div>
            </div>
            <TenantLimitsEditor
              tenantId={t.id}
              name={t.name}
              maxProperties={t.maxProperties}
              maxMembers={t.maxMembers}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Inline editor for a tenant's quotas + GDPR export / delete actions. */
function TenantLimitsEditor({
  tenantId,
  name,
  maxProperties,
  maxMembers,
}: {
  tenantId: number;
  name: string;
  maxProperties: number | null;
  maxMembers: number | null;
}) {
  const utils = trpc.useUtils();
  const [props, setProps] = useState(maxProperties?.toString() ?? "");
  const [members, setMembers] = useState(maxMembers?.toString() ?? "");
  const [exporting, setExporting] = useState(false);
  const save = trpc.admin.tenants.setLimits.useMutation({
    onSuccess: () => {
      utils.admin.tenants.list.invalidate();
      toast.success("Limits updated");
    },
    onError: e => toast.error(errMessage(e)),
  });
  const del = trpc.admin.tenants.delete.useMutation({
    onSuccess: () => {
      utils.admin.tenants.list.invalidate();
      utils.admin.stats.invalidate();
      toast.success("Workspace deleted");
    },
    onError: e => toast.error(errMessage(e)),
  });
  const parse = (s: string) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const onExport = async () => {
    setExporting(true);
    try {
      const data = await utils.admin.tenants.export.fetch({ tenantId });
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workspace-${tenantId}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setExporting(false);
    }
  };
  const onDelete = () => {
    if (
      window.confirm(
        `Permanently delete "${name}" and ALL its data? This cannot be undone.`
      )
    ) {
      del.mutate({ tenantId, confirm: true });
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <span className="text-xs text-muted-foreground">Limits</span>
      <Input
        type="number"
        min={0}
        className="h-7 w-24 text-xs"
        placeholder="∞ props"
        value={props}
        onChange={e => setProps(e.target.value)}
      />
      <Input
        type="number"
        min={1}
        className="h-7 w-24 text-xs"
        placeholder="∞ members"
        value={members}
        onChange={e => setMembers(e.target.value)}
      />
      <Button
        size="sm"
        variant="ghost"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({
            tenantId,
            maxProperties: parse(props),
            maxMembers: parse(members),
          })
        }
      >
        Save
      </Button>
      <span className="mx-1 h-4 w-px bg-border" />
      <Button size="sm" variant="ghost" disabled={exporting} onClick={onExport}>
        Export
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={del.isPending}
        onClick={onDelete}
      >
        Delete
      </Button>
    </div>
  );
}

type PlanRow = {
  key: string;
  name: string;
  isPaid: boolean;
  priceCents: number;
  currency: string;
  interval: "month" | "year" | "none";
  maxProperties: number | null;
  maxMembers: number | null;
  capabilities: string[] | null;
  checkoutUrl: string | null;
  sortOrder: number;
  active: boolean;
};

const BLANK_PLAN: PlanRow = {
  key: "",
  name: "",
  isPaid: false,
  priceCents: 0,
  currency: "ils",
  interval: "none",
  maxProperties: null,
  maxMembers: null,
  capabilities: [],
  checkoutUrl: null,
  sortOrder: 0,
  active: true,
};

function PlansTab() {
  const data = trpc.admin.plans.list.useQuery();
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Plans</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Billing provider: {data.data?.provider ?? "—"}. Capabilities are
            gated by plan in SAAS mode; everything is included in standalone.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing({ ...BLANK_PLAN });
            setCreating(true);
          }}
        >
          New plan
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {data.isLoading && (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {data.data?.plans.map(p => (
          <div
            key={p.key}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {p.name}{" "}
                <span className="text-xs text-muted-foreground">({p.key})</span>
                {!p.active && (
                  <Badge variant="outline" className="ms-1">
                    hidden
                  </Badge>
                )}
                {p.isPaid ? (
                  <Badge variant="secondary" className="ms-1">
                    {(p.priceCents / 100).toLocaleString(undefined, {
                      style: "currency",
                      currency: (p.currency || "ils").toUpperCase(),
                    })}
                    /{p.interval}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ms-1">
                    free
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.maxProperties ?? "∞"} properties · {p.maxMembers ?? "∞"}{" "}
                members · caps: {(p.capabilities ?? []).join(", ") || "none"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing({ ...(p as PlanRow) });
                setCreating(false);
              }}
            >
              Edit
            </Button>
          </div>
        ))}
      </CardContent>

      {editing && (
        <PlanEditor
          plan={editing}
          isNew={creating}
          capabilities={data.data?.capabilities ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function PlanEditor({
  plan,
  isNew,
  capabilities,
  onClose,
}: {
  plan: PlanRow;
  isNew: boolean;
  capabilities: readonly { key: string; label: string; description: string }[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<PlanRow>(plan);
  const refresh = () => {
    utils.admin.plans.list.invalidate();
    utils.admin.tenants.list.invalidate();
  };
  const create = trpc.admin.plans.create.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Plan created");
      onClose();
    },
    onError: e => toast.error(errMessage(e)),
  });
  const update = trpc.admin.plans.update.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Plan saved");
      onClose();
    },
    onError: e => toast.error(errMessage(e)),
  });
  const del = trpc.admin.plans.delete.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Plan deleted");
      onClose();
    },
    onError: e => toast.error(errMessage(e)),
  });

  const num = (s: string): number | null => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const toggleCap = (key: string) =>
    setDraft(d => {
      const set = new Set(d.capabilities ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...d, capabilities: Array.from(set) };
    });

  const submit = () => {
    const payload = {
      key: draft.key.trim(),
      name: draft.name.trim(),
      isPaid: draft.isPaid,
      priceCents: draft.priceCents,
      currency: (draft.currency || "ils").toLowerCase(),
      interval: draft.interval,
      maxProperties: draft.maxProperties,
      maxMembers: draft.maxMembers,
      capabilities: draft.capabilities ?? [],
      checkoutUrl: draft.checkoutUrl?.trim() ? draft.checkoutUrl.trim() : null,
      sortOrder: draft.sortOrder,
      active: draft.active,
    };
    if (isNew) create.mutate(payload);
    else update.mutate(payload);
  };

  const busy = create.isPending || update.isPending || del.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card w-full max-w-lg rounded-xl border shadow-lg p-5 space-y-4 max-h-[90vh] overflow-auto">
        <h3 className="text-base font-semibold">
          {isNew ? "New plan" : `Edit ${plan.name}`}
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Key</span>
            <Input
              value={draft.key}
              disabled={!isNew}
              placeholder="pro"
              onChange={e => setDraft({ ...draft, key: e.target.value })}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Name</span>
            <Input
              value={draft.name}
              placeholder="Pro"
              onChange={e => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Price (cents)</span>
            <Input
              type="number"
              min={0}
              value={String(draft.priceCents)}
              onChange={e =>
                setDraft({ ...draft, priceCents: num(e.target.value) ?? 0 })
              }
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Currency</span>
            <Input
              value={draft.currency}
              maxLength={3}
              onChange={e => setDraft({ ...draft, currency: e.target.value })}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Interval</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={draft.interval}
              onChange={e =>
                setDraft({
                  ...draft,
                  interval: e.target.value as PlanRow["interval"],
                })
              }
            >
              <option value="none">none</option>
              <option value="month">month</option>
              <option value="year">year</option>
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Sort order</span>
            <Input
              type="number"
              min={0}
              value={String(draft.sortOrder)}
              onChange={e =>
                setDraft({ ...draft, sortOrder: num(e.target.value) ?? 0 })
              }
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">
              Max properties (∞ = blank)
            </span>
            <Input
              type="number"
              min={0}
              value={draft.maxProperties?.toString() ?? ""}
              onChange={e =>
                setDraft({ ...draft, maxProperties: num(e.target.value) })
              }
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">
              Max members (∞ = blank)
            </span>
            <Input
              type="number"
              min={1}
              value={draft.maxMembers?.toString() ?? ""}
              onChange={e =>
                setDraft({ ...draft, maxMembers: num(e.target.value) })
              }
            />
          </label>
        </div>

        <label className="text-xs space-y-1 block">
          <span className="text-muted-foreground">
            Checkout / payment-link URL (paid plans)
          </span>
          <Input
            value={draft.checkoutUrl ?? ""}
            placeholder="https://buy.stripe.com/…"
            onChange={e => setDraft({ ...draft, checkoutUrl: e.target.value })}
          />
        </label>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Included capabilities</p>
          <div className="space-y-1">
            {capabilities.map(c => (
              <label key={c.key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={(draft.capabilities ?? []).includes(c.key)}
                  onChange={() => toggleCap(c.key)}
                />
                <span>
                  {c.label}
                  <span className="block text-xs text-muted-foreground">
                    {c.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.isPaid}
              onChange={e => setDraft({ ...draft, isPaid: e.target.checked })}
            />
            Paid plan
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={e => setDraft({ ...draft, active: e.target.checked })}
            />
            Active (offered)
          </label>
        </div>

        <div className="flex items-center justify-between pt-2">
          {!isNew ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete plan "${plan.name}"?`)) {
                  del.mutate({ key: plan.key });
                }
              }}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {isNew ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditTab() {
  const audit = trpc.admin.audit.list.useQuery({ limit: 100 });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {audit.isLoading && (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {audit.data?.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">No activity yet.</p>
        )}
        {audit.data?.map(a => (
          <div key={a.id} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-mono">{a.action}</span>
              <span className="text-xs text-muted-foreground">
                {a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {a.targetType ? `${a.targetType}:${a.targetId ?? ""}` : ""}
              {a.tenantId ? ` · tenant ${a.tenantId}` : ""}
              {a.actorUserId ? ` · by user ${a.actorUserId}` : ""}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
