import { useCallback } from "react";
import { trpc } from "@/lib/trpc";

type EntityType = "expense" | "repair" | "upgrade" | "loan" | "wishlist" | "purchaseCost";

/**
 * Returns an `onChange` handler that immediately persists an updated
 * attachments array to the server via the appropriate tRPC update mutation.
 *
 * Usage:
 *   const handleAttachments = useAttachments("expense", expense.id);
 *   <AttachmentsPanel attachments={expense.attachments ?? []} onChange={handleAttachments} />
 */
export function useAttachments(type: EntityType, id: string) {
  const utils = trpc.useUtils();

  const expenseUpdate = trpc.expenses.update.useMutation({ onSuccess: () => utils.expenses.list.invalidate() });
  const repairUpdate = trpc.repairs.update.useMutation({ onSuccess: () => utils.repairs.list.invalidate() });
  const upgradeUpdate = trpc.upgrades.update.useMutation({ onSuccess: () => utils.upgrades.list.invalidate() });
  const loanUpdate = trpc.loans.update.useMutation({ onSuccess: () => utils.loans.list.invalidate() });
  const wishlistUpdate = trpc.wishlist.update.useMutation({ onSuccess: () => utils.wishlist.list.invalidate() });
  const purchaseCostUpdate = trpc.purchaseCosts.update.useMutation({ onSuccess: () => utils.purchaseCosts.list.invalidate() });

  const onChange = useCallback((urls: string[]) => {
    const data = { attachments: urls };
    switch (type) {
      case "expense":      expenseUpdate.mutate({ id, data }); break;
      case "repair":       repairUpdate.mutate({ id, data }); break;
      case "upgrade":      upgradeUpdate.mutate({ id, data }); break;
      case "loan":         loanUpdate.mutate({ id, data }); break;
      case "wishlist":     wishlistUpdate.mutate({ id, data }); break;
      case "purchaseCost": purchaseCostUpdate.mutate({ id, data }); break;
    }
  }, [type, id]); // eslint-disable-line react-hooks/exhaustive-deps

  return onChange;
}
