import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldAlert, MoreVertical } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

function errMessage(e: unknown): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : "Something went wrong";
}

type Tab = "overview" | "users" | "tenants" | "plans" | "audit";
const TAB_KEYS: Tab[] = ["overview", "users", "tenants", "plans", "audit"];

export default function Admin() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const { isSaas } = useCapabilities();
  const isSuperAdmin = user?.globalRole === "superadmin";
  // Plans are a hosted (SAAS) concept; hide the tab on standalone installs.
  const tabs = isSaas ? TAB_KEYS : TAB_KEYS.filter(k => k !== "plans");

  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <p className="text-sm">{t("admin.noAccess")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("admin.title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("admin.subtitle")}
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(key => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`admin.tabs.${key}`)}
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
  const { t } = useTranslation();
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
        toast.success(t("admin.loginEnabledReloading"));
        setTimeout(() => window.location.reload(), 900);
      } else {
        utils.admin.config.get.invalidate();
        toast.success(t("admin.autoAdminRestored"));
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
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          [t("admin.statUsers"), stats.data?.users],
          [t("admin.statWorkspaces"), stats.data?.tenants],
          [t("admin.statProperties"), stats.data?.properties],
        ].map(([label, n]) => (
          <Card key={label as string}>
            <CardContent className="px-2 py-6 text-center sm:px-6">
              <div className="text-3xl font-bold">{n ?? "—"}</div>
              <div className="text-xs text-muted-foreground mt-1 truncate">
                {label}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.serverConfig")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("admin.deploymentMode")}</p>
              <p className="text-xs text-muted-foreground">
                {mode === "saas"
                  ? t("admin.deploymentSaas")
                  : t("admin.deploymentStandalone")}
                {config.data &&
                  config.data.appMode !== config.data.appModeEnvDefault &&
                  t("admin.overridesEnvDefault", {
                    mode: config.data.appModeEnvDefault,
                  })}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
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
                    ? t("admin.saasIncompatibleNoAuth")
                    : undefined
                }
                onClick={() => setAppMode.mutate({ mode: nextMode })}
              >
                {t("admin.switchTo", { mode: nextMode })}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {t("admin.openRegistration")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("admin.openRegistrationDesc")}
              </p>
            </div>
            <Button
              variant={config.data?.signupsEnabled ? "default" : "outline"}
              size="sm"
              className="shrink-0 self-start sm:self-auto"
              disabled={setSignups.isPending || config.isLoading}
              onClick={() =>
                setSignups.mutate({ enabled: !config.data?.signupsEnabled })
              }
            >
              {config.data?.signupsEnabled
                ? t("admin.enabled")
                : t("admin.disabled")}
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {t("admin.requireEmailVerification")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("admin.requireEmailVerificationDesc")}
                {config.data?.requireEmailVerification &&
                config.data.emailVerificationGraceHours > 0
                  ? t("admin.graceSuffix", {
                      hours: config.data.emailVerificationGraceHours,
                    })
                  : "."}
              </p>
            </div>
            <Button
              variant={
                config.data?.requireEmailVerification ? "default" : "outline"
              }
              size="sm"
              className="shrink-0 self-start sm:self-auto"
              disabled={setEmailVerification.isPending || config.isLoading}
              onClick={() =>
                setEmailVerification.mutate({
                  required: !config.data?.requireEmailVerification,
                  graceHours: config.data?.emailVerificationGraceHours ?? 0,
                })
              }
            >
              {config.data?.requireEmailVerification
                ? t("admin.required")
                : t("admin.optional")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {config.data?.noAuth && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("admin.signinSecurity")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t("admin.userLogin")}</p>
                <p className="text-xs text-muted-foreground">
                  {localLoginOn
                    ? t("admin.userLoginOn")
                    : t("admin.userLoginOff")}
                </p>
              </div>
              <Badge variant={localLoginOn ? "default" : "secondary"}>
                {localLoginOn
                  ? t("admin.userLoginBadge")
                  : t("admin.autoAdminBadge")}
              </Badge>
            </div>

            {!localLoginOn && credentialedAdmins < 1 && (
              <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{t("admin.noCredentialedAdminWarning")}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {localLoginOn
                  ? t("admin.userLoginOnHint")
                  : t("admin.userLoginOffHint")}
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
                {localLoginOn
                  ? t("admin.disableUserLogin")
                  : t("admin.enableUserLogin")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UsersTab() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  // The user currently being edited (rename) or password-reset, if any.
  const [editing, setEditing] = useState<{
    userId: number;
    name: string;
  } | null>(null);
  const [resetting, setResetting] = useState<{ userId: number } | null>(null);
  const users = trpc.admin.users.list.useQuery({ search: search || undefined });
  const invalidate = () => utils.admin.users.list.invalidate();
  const setRole = trpc.admin.users.setGlobalRole.useMutation({
    onSuccess: invalidate,
    onError: e => toast.error(errMessage(e)),
  });
  const setStatus = trpc.admin.users.setStatus.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("admin.saved"));
    },
    onError: e => toast.error(errMessage(e)),
  });
  const del = trpc.admin.users.delete.useMutation({
    onSuccess: () => {
      invalidate();
      utils.admin.stats.invalidate();
      toast.success(t("admin.userDeleted"));
    },
    onError: e => toast.error(errMessage(e)),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base">{t("admin.usersTitle")}</CardTitle>
          <Input
            placeholder={t("admin.searchUsers")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mt-2 max-w-sm"
          />
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          {t("admin.newUser")}
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {users.isLoading && (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {users.data?.map(u => {
          const isSelf = u.id === me?.id;
          const disabled = u.status === "disabled";
          return (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate flex items-center gap-2">
                  {u.name || u.email || `User #${u.id}`}
                  {isSelf && (
                    <Badge variant="outline" className="text-xs h-5">
                      {t("admin.you")}
                    </Badge>
                  )}
                  {disabled && (
                    <Badge variant="destructive" className="text-xs h-5">
                      {t("admin.disabled")}
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {u.email} · {u.loginMethod ?? "—"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
                    <SelectItem value="user">{t("admin.roleUser")}</SelectItem>
                    <SelectItem value="superadmin">
                      {t("admin.roleSuperadmin")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t("admin.actions")}>
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        setEditing({ userId: u.id, name: u.name ?? "" })
                      }
                    >
                      {t("admin.editName")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setResetting({ userId: u.id })}
                    >
                      {t("admin.resetPassword")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={isSelf}
                      onClick={() =>
                        setStatus.mutate({
                          userId: u.id,
                          status: disabled ? "active" : "disabled",
                        })
                      }
                    >
                      {disabled ? t("admin.enable") : t("admin.disable")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={isSelf}
                      onClick={() => {
                        if (window.confirm(t("admin.confirmDeleteUser")))
                          del.mutate({ userId: u.id, confirm: true });
                      }}
                    >
                      {t("admin.deleteUser")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
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
      {editing && (
        <EditNameDialog
          initial={editing.name}
          userId={editing.userId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {resetting && (
        <ResetPasswordDialog
          userId={resetting.userId}
          onClose={() => setResetting(null)}
          onDone={() => setResetting(null)}
        />
      )}
    </Card>
  );
}

function EditNameDialog({
  initial,
  userId,
  onClose,
  onSaved,
}: {
  initial: string;
  userId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const update = trpc.admin.users.update.useMutation({
    onSuccess: () => {
      toast.success(t("admin.saved"));
      onSaved();
    },
    onError: e => toast.error(errMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={e => {
          e.preventDefault();
          update.mutate({ userId, name: name.trim() });
        }}
        className="bg-card w-full max-w-sm rounded-xl border shadow-lg p-5 space-y-4"
      >
        <h3 className="font-semibold">{t("admin.editName")}</h3>
        <div className="space-y-2">
          <Label htmlFor="edit-name">{t("admin.name")}</Label>
          <Input
            id="edit-name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("admin.cancel")}
          </Button>
          <Button type="submit" disabled={update.isPending || !name.trim()}>
            {t("admin.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ResetPasswordDialog({
  userId,
  onClose,
  onDone,
}: {
  userId: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const reset = trpc.admin.users.resetPassword.useMutation({
    onSuccess: () => {
      toast.success(t("admin.passwordReset"));
      onDone();
    },
    onError: e => toast.error(errMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={e => {
          e.preventDefault();
          reset.mutate({ userId, password });
        }}
        className="bg-card w-full max-w-sm rounded-xl border shadow-lg p-5 space-y-4"
      >
        <h3 className="font-semibold">{t("admin.resetPassword")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("admin.resetPasswordHint")}
        </p>
        <div className="space-y-2">
          <Label htmlFor="reset-pw">{t("admin.newPassword")}</Label>
          <Input
            id="reset-pw"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("admin.cancel")}
          </Button>
          <Button type="submit" disabled={reset.isPending || password.length < 8}>
            {t("admin.resetPassword")}
          </Button>
        </div>
      </form>
    </div>
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
  const { t } = useTranslation();
  const create = trpc.admin.users.create.useMutation({
    onSuccess: () => {
      toast.success(t("admin.accountCreated", { email }));
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
          <h3 className="text-base font-semibold">{t("admin.createUser")}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t("admin.createUserDesc")}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-user-email">{t("common.email")}</Label>
          <Input
            id="new-user-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-name">{t("admin.nameOptional")}</Label>
          <Input
            id="new-user-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t("admin.namePlaceholderDerive")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-password">{t("common.password")}</Label>
          <Input
            id="new-user-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t("admin.passwordMin")}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-tenant">
            {t("admin.workspaceOptional")}
          </Label>
          <Input
            id="new-user-tenant"
            value={tenantName}
            onChange={e => setTenantName(e.target.value)}
            placeholder={t("admin.workspacePlaceholder")}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={superadmin}
            onChange={e => setSuperadmin(e.target.checked)}
          />
          {t("admin.grantSuperadmin")}
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={create.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && (
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
            )}
            {t("admin.createUserBtn")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function TenantsTab() {
  const { t } = useTranslation();
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
      toast.success(t("admin.planUpdated"));
    },
    onError: e => toast.error(errMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("admin.workspacesTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {tenants.isLoading && (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {tenants.data?.map(tn => (
          <div key={tn.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {tn.name}{" "}
                  {tn.status === "suspended" && (
                    <Badge variant="destructive" className="ms-1">
                      {t("admin.suspended")}
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tn.memberCount}
                  {tn.maxMembers != null ? `/${tn.maxMembers}` : ""}{" "}
                  {t("admin.membersLabel")} · {tn.propertyCount}
                  {tn.maxProperties != null ? `/${tn.maxProperties}` : ""}{" "}
                  {t("admin.propertiesLabel")}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value={tn.planId ?? ""}
                  disabled={assignPlan.isPending || plans.isLoading}
                  onChange={e =>
                    assignPlan.mutate({
                      tenantId: tn.id,
                      planId: e.target.value,
                    })
                  }
                >
                  <option value="" disabled>
                    {tn.planId ? tn.planId : t("admin.noPlan")}
                  </option>
                  {plans.data?.plans.map(p => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant={tn.status === "active" ? "outline" : "default"}
                  size="sm"
                  disabled={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate({
                      tenantId: tn.id,
                      status: tn.status === "active" ? "suspended" : "active",
                    })
                  }
                >
                  {tn.status === "active"
                    ? t("admin.suspend")
                    : t("admin.reactivate")}
                </Button>
              </div>
            </div>
            <TenantLimitsEditor
              tenantId={tn.id}
              name={tn.name}
              maxProperties={tn.maxProperties}
              maxMembers={tn.maxMembers}
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
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [props, setProps] = useState(maxProperties?.toString() ?? "");
  const [members, setMembers] = useState(maxMembers?.toString() ?? "");
  const [exporting, setExporting] = useState(false);
  const save = trpc.admin.tenants.setLimits.useMutation({
    onSuccess: () => {
      utils.admin.tenants.list.invalidate();
      toast.success(t("admin.limitsUpdated"));
    },
    onError: e => toast.error(errMessage(e)),
  });
  const del = trpc.admin.tenants.delete.useMutation({
    onSuccess: () => {
      utils.admin.tenants.list.invalidate();
      utils.admin.stats.invalidate();
      toast.success(t("admin.workspaceDeleted"));
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
    if (window.confirm(t("admin.deleteWorkspaceConfirm", { name }))) {
      del.mutate({ tenantId, confirm: true });
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <span className="text-xs text-muted-foreground">{t("admin.limits")}</span>
      <Input
        type="number"
        min={0}
        className="h-7 w-24 text-xs"
        placeholder={t("admin.propsPlaceholder")}
        value={props}
        onChange={e => setProps(e.target.value)}
      />
      <Input
        type="number"
        min={1}
        className="h-7 w-24 text-xs"
        placeholder={t("admin.membersPlaceholder")}
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
        {t("common.save")}
      </Button>
      <span className="mx-1 h-4 w-px bg-border" />
      <Button size="sm" variant="ghost" disabled={exporting} onClick={onExport}>
        {t("admin.export")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={del.isPending}
        onClick={onDelete}
      >
        {t("common.delete")}
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
  const { t } = useTranslation();
  const data = trpc.admin.plans.list.useQuery();
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{t("admin.plansTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t("admin.billingProvider", {
              provider: data.data?.provider ?? "—",
            })}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing({ ...BLANK_PLAN });
            setCreating(true);
          }}
        >
          {t("admin.newPlan")}
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
                    {t("admin.hidden")}
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
                    {t("admin.free")}
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("admin.planUsage", {
                  properties: p.maxProperties ?? "∞",
                  members: p.maxMembers ?? "∞",
                  caps: (p.capabilities ?? []).join(", ") || t("admin.none"),
                })}
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
              {t("common.edit")}
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
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<PlanRow>(plan);
  const refresh = () => {
    utils.admin.plans.list.invalidate();
    utils.admin.tenants.list.invalidate();
  };
  const create = trpc.admin.plans.create.useMutation({
    onSuccess: () => {
      refresh();
      toast.success(t("admin.planCreated"));
      onClose();
    },
    onError: e => toast.error(errMessage(e)),
  });
  const update = trpc.admin.plans.update.useMutation({
    onSuccess: () => {
      refresh();
      toast.success(t("admin.planSaved"));
      onClose();
    },
    onError: e => toast.error(errMessage(e)),
  });
  const del = trpc.admin.plans.delete.useMutation({
    onSuccess: () => {
      refresh();
      toast.success(t("admin.planDeleted"));
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
          {isNew
            ? t("admin.newPlan")
            : t("admin.editPlan", { name: plan.name })}
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">{t("admin.key")}</span>
            <Input
              value={draft.key}
              disabled={!isNew}
              placeholder="pro"
              onChange={e => setDraft({ ...draft, key: e.target.value })}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">{t("common.name")}</span>
            <Input
              value={draft.name}
              placeholder="Pro"
              onChange={e => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">
              {t("admin.priceCents")}
            </span>
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
            <span className="text-muted-foreground">{t("admin.currency")}</span>
            <Input
              value={draft.currency}
              maxLength={3}
              onChange={e => setDraft({ ...draft, currency: e.target.value })}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">{t("admin.interval")}</span>
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
              <option value="none">{t("admin.intervalNone")}</option>
              <option value="month">{t("admin.intervalMonth")}</option>
              <option value="year">{t("admin.intervalYear")}</option>
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">
              {t("admin.sortOrder")}
            </span>
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
              {t("admin.maxProperties")}
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
              {t("admin.maxMembers")}
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
            {t("admin.checkoutUrl")}
          </span>
          <Input
            value={draft.checkoutUrl ?? ""}
            placeholder="https://buy.stripe.com/…"
            onChange={e => setDraft({ ...draft, checkoutUrl: e.target.value })}
          />
        </label>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {t("admin.includedCapabilities")}
          </p>
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
            {t("admin.paidPlan")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={e => setDraft({ ...draft, active: e.target.checked })}
            />
            {t("admin.activeOffered")}
          </label>
        </div>

        <div className="flex items-center justify-between pt-2">
          {!isNew ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    t("admin.deletePlanConfirm", { name: plan.name })
                  )
                ) {
                  del.mutate({ key: plan.key });
                }
              }}
            >
              {t("common.delete")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {isNew ? t("common.create") : t("common.save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditTab() {
  const { t } = useTranslation();
  const audit = trpc.admin.audit.list.useQuery({ limit: 100 });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.recentActivity")}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {audit.isLoading && (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {audit.data?.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            {t("admin.noActivity")}
          </p>
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
