import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useProperty } from "@/contexts/PropertyContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Minimal "add a property" dialog. Extracted from PropertySwitcher so the same
 * flow can be triggered from anywhere (sidebar switcher, Portfolio CTA) without
 * duplicating the form. On success it invalidates the property list and switches
 * to the newly created property.
 */
export default function AddPropertyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { switchProperty } = useProperty();
  const utils = trpc.useUtils();
  const createMutation = trpc.property.create.useMutation({
    onSuccess: (data: any) => {
      utils.property.list.invalidate();
      if (data?.insertId) switchProperty(data.insertId);
    },
  });
  const [newName, setNewName] = useState("");

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await createMutation.mutateAsync({ houseName: newName.trim() });
    setNewName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("common.addProperty")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <input
            autoFocus
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={t("common.propertyName")}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? t("common.adding") : t("common.add")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
