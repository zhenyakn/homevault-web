import { useTranslation } from "react-i18next";
import { Building2, Check } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { switchTenant } from "@/lib/tenant";

/**
 * Workspace (tenant) switcher rendered as a section inside an existing account
 * dropdown. Returns null unless the user belongs to more than one workspace, so
 * single-tenant (standalone) installs see no extra chrome. The active workspace
 * is taken from the server-resolved `tenant.current`, not localStorage, so the
 * check always reflects what requests are actually scoped to.
 */
export function TenantSwitcherSection() {
  const { t } = useTranslation();
  const tenants = trpc.tenant.list.useQuery();
  const current = trpc.tenant.current.useQuery();

  if (!tenants.data || tenants.data.length <= 1) return null;
  const currentId = current.data?.id;

  return (
    <>
      <div className="px-2 py-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t("tenant.workspace")}
        </p>
      </div>
      {tenants.data.map(tn => (
        <DropdownMenuItem
          key={tn.id}
          onClick={() => switchTenant(tn.id)}
          className="cursor-pointer"
        >
          <Building2 className="h-4 w-4 me-2 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{tn.name}</span>
          {tn.id === currentId && (
            <Check className="h-3.5 w-3.5 ms-2 shrink-0" />
          )}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
    </>
  );
}
