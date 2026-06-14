import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { asArray } from "@/lib/utils";
import { FileUpload } from "@/components/FileUpload";
import { toast } from "sonner";

type UploadedFile = {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
};

/**
 * Attach photos and documents to a candidate — apartment photos, a floor plan,
 * a draft contract, etc. Stores file URLs in the candidate's `attachments`
 * array; the server reaps any that get removed.
 */
export function AttachmentsCard({
  candidateId,
  attachments,
}: {
  candidateId: string;
  attachments: string[] | null | undefined;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();

  // Stored as bare URL strings; FileUpload wants richer objects, so rebuild
  // minimal ones (the filename is derived from the URL tail).
  const files: UploadedFile[] = asArray<string>(attachments).map(url => ({
    url,
    filename: url.split("/").pop() || "file",
    mimeType: "application/octet-stream",
    size: 0,
  }));

  const update = trpc.apartmentSearch.candidates.update.useMutation({
    onSuccess: () =>
      u.apartmentSearch.candidates.get.invalidate({ id: candidateId }),
    onError: e => toast.error(e.message),
  });
  const save = (next: UploadedFile[]) =>
    update.mutate({
      id: candidateId,
      data: { attachments: next.map(f => f.url) },
    });

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t("common.attachments")}
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("apartmentSearch.attachmentsHint")}
      </p>
      <FileUpload
        existingFiles={files}
        onUpload={file => save([...files, file])}
        onRemove={i => save(files.filter((_, idx) => idx !== i))}
        maxFiles={10}
      />
    </div>
  );
}
