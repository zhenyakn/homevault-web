import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, UserPlus, Trash2, Mail, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Role = "owner" | "admin" | "member" | "viewer";
const MANAGE_ROLES: Role[] = ["owner", "admin", "member", "viewer"];
const INVITE_ROLES: Role[] = ["admin", "member", "viewer"];

function errMessage(e: unknown): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : "Something went wrong";
}

export default function Members() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const current = trpc.tenant.current.useQuery();
  const canManage =
    current.data?.role === "owner" || current.data?.role === "admin";

  // Non-admins don't get the management surface.
  if (current.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!canManage) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <p className="text-sm">{t("members.onlyOwnersAdmins")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("members.title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("members.subtitle", {
            name: current.data?.name ?? t("members.thisWorkspace"),
          })}
        </p>
      </div>

      <InviteForm onChanged={() => utils.tenant.invites.list.invalidate()} />
      <PendingInvites />
      <MemberList ownRole={current.data!.role as Role} />
    </div>
  );
}

function InviteForm({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const invite = trpc.tenant.invites.create.useMutation({
    onSuccess: () => {
      toast.success(t("members.inviteSent", { email }));
      setEmail("");
      onChanged();
    },
    onError: e => toast.error(errMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> {t("members.inviteSomeone")}
        </CardTitle>
        <CardDescription>{t("members.inviteDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col sm:flex-row gap-3 sm:items-end"
          onSubmit={e => {
            e.preventDefault();
            invite.mutate({
              email,
              role: role as "admin" | "member" | "viewer",
            });
          }}
        >
          <div className="flex-1 space-y-2">
            <Label htmlFor="invite-email">{t("common.email")}</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("members.role")}</Label>
            <Select value={role} onValueChange={v => setRole(v as Role)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map(r => (
                  <SelectItem key={r} value={r}>
                    {t(`members.roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending && (
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
            )}
            {t("members.sendInvite")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PendingInvites() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const invites = trpc.tenant.invites.list.useQuery();
  const revoke = trpc.tenant.invites.revoke.useMutation({
    onSuccess: () => utils.tenant.invites.list.invalidate(),
    onError: e => toast.error(errMessage(e)),
  });

  if (!invites.data || invites.data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4" /> {t("members.pendingInvitations")}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {invites.data.map(inv => (
          <div
            key={inv.id}
            className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
          >
            <div>
              <p className="text-sm font-medium">{inv.email}</p>
              <p className="text-xs text-muted-foreground">
                {t("members.invitedAs", {
                  role: t(`members.roles.${inv.role}`),
                })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => revoke.mutate({ id: inv.id })}
              disabled={revoke.isPending}
            >
              {t("members.revoke")}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MemberList({ ownRole }: { ownRole: Role }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const members = trpc.tenant.members.useQuery();
  const setRole = trpc.tenant.setMemberRole.useMutation({
    onSuccess: () => utils.tenant.members.invalidate(),
    onError: e => toast.error(errMessage(e)),
  });
  const remove = trpc.tenant.removeMember.useMutation({
    onSuccess: () => utils.tenant.members.invalidate(),
    onError: e => toast.error(errMessage(e)),
  });

  // Only owners can hand out the owner role.
  const assignable = ownRole === "owner" ? MANAGE_ROLES : MANAGE_ROLES.slice(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("members.currentMembers")}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {members.isLoading && (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {members.data?.map(m => (
          <div
            key={m.userId}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {m.name || m.email || `User #${m.userId}`}
              </p>
              {m.email && (
                <p className="text-xs text-muted-foreground truncate">
                  {m.email}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Select
                value={m.role}
                onValueChange={v =>
                  setRole.mutate({ userId: m.userId, role: v as Role })
                }
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignable.map(r => (
                    <SelectItem key={r} value={r}>
                      {t(`members.roles.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                title={t("members.removeMember")}
                onClick={() => remove.mutate({ userId: m.userId })}
                disabled={remove.isPending}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
