import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type Tab = "overview" | "users" | "tenants" | "audit";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "tenants", label: "Tenants" },
  { key: "audit", label: "Audit log" },
];

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const isSuperAdmin =
    user?.globalRole === "superadmin";

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
        {TABS.map(t => (
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
  const setEmailVerification = trpc.admin.config.setEmailVerification.useMutation(
    {
      onSuccess: () => utils.admin.config.get.invalidate(),
      onError: e => toast.error(errMessage(e)),
    }
  );
  const mode = config.data?.appMode;
  const nextMode = mode === "saas" ? "standalone" : "saas";

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
    </div>
  );
}

function UsersTab() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const users = trpc.admin.users.list.useQuery({ search: search || undefined });
  const setRole = trpc.admin.users.setGlobalRole.useMutation({
    onSuccess: () => utils.admin.users.list.invalidate(),
    onError: e => toast.error(errMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Users</CardTitle>
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mt-2 max-w-sm"
        />
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
    </Card>
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
                    assignPlan.mutate({ tenantId: t.id, planId: e.target.value })
                  }
                >
                  <option value="" disabled>
                    {t.planId ? t.planId : "No plan"}
                  </option>
                  {plans.data?.plans.map(p => (
                    <option key={p.id} value={p.id}>
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
      <Button
        size="sm"
        variant="ghost"
        disabled={exporting}
        onClick={onExport}
      >
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
