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
  const setStatus = trpc.admin.tenants.setStatus.useMutation({
    onSuccess: () => utils.admin.tenants.list.invalidate(),
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
          <div
            key={t.id}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
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
                {t.memberCount} member(s) · {t.propertyCount} propert
                {t.propertyCount === 1 ? "y" : "ies"}
              </p>
            </div>
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
        ))}
      </CardContent>
    </Card>
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
