import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileText, Loader2, Search, Upload, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function Documents() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [pendingQuery, setPendingQuery] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("homevault");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const health = trpc.paperless.health.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const documents = trpc.paperless.list.useQuery(
    { query, page: 1, pageSize: 25 },
    {
      enabled: health.data?.ok === true,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  const totalLabel = useMemo(() => {
    const count = documents.data?.count ?? 0;
    return t("documents.totalDocuments", { defaultValue: "{{count}} documents", count });
  }, [documents.data?.count, t]);

  const handleSearch = () => {
    setQuery(pendingQuery.trim());
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error(t("documents.selectFileFirst", { defaultValue: "Select a file first" }));
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (title.trim()) formData.append("title", title.trim());
    if (tags.trim()) formData.append("tags", tags.trim());

    setIsUploading(true);
    try {
      const response = await fetch("/api/paperless/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || response.statusText);
      }

      toast.success(t("documents.uploadStarted", { defaultValue: "Upload sent to Paperless for processing" }));
      setSelectedFile(null);
      setTitle("");
      fileInputRef.current && (fileInputRef.current.value = "");
      await documents.refetch();
    } catch (error: any) {
      toast.error(error?.message || t("documents.uploadFailed", { defaultValue: "Upload failed" }));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("documents.title", { defaultValue: "Documents" })}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("documents.subtitle", { defaultValue: "Paperless-backed document vault, OCR, and search." })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { health.refetch(); documents.refetch(); }}>
          <RefreshCw className="h-3.5 w-3.5 me-1.5" />
          {t("documents.refresh", { defaultValue: "Refresh" })}
        </Button>
      </div>

      {health.isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("documents.checkingConnection", { defaultValue: "Checking Paperless connection…" })}
        </div>
      ) : !health.data?.ok ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">{t("documents.notConnected", { defaultValue: "Paperless is not connected" })}</p>
              <p className="mt-1">
                {health.data?.detail || t("documents.configureHint", { defaultValue: "Set PAPERLESS_URL and PAPERLESS_TOKEN in the HomeVault environment." })}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <Badge variant="outline" className="w-fit">
          {t("documents.connected", { defaultValue: "Connected to Paperless" })}
        </Badge>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <section className="rounded-lg border p-4 space-y-3 h-fit">
          <div>
            <h2 className="font-medium">{t("documents.uploadTitle", { defaultValue: "Upload to Paperless" })}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t("documents.uploadHint", { defaultValue: "HomeVault sends the file to Paperless. OCR and document processing happen there." })}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="document-file">
              {t("documents.file", { defaultValue: "File" })}
            </label>
            <Input
              ref={fileInputRef}
              id="document-file"
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="document-title">
              {t("documents.documentTitle", { defaultValue: "Title" })}
            </label>
            <Input
              id="document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("documents.titlePlaceholder", { defaultValue: "Optional title" })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="document-tags">
              {t("documents.tags", { defaultValue: "Tags" })}
            </label>
            <Input
              id="document-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder={t("documents.tagsPlaceholder", { defaultValue: "homevault, warranty, bill" })}
            />
          </div>

          <Button
            className="w-full"
            disabled={!health.data?.ok || isUploading}
            onClick={handleUpload}
          >
            {isUploading ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Upload className="h-4 w-4 me-2" />}
            {t("documents.upload", { defaultValue: "Upload" })}
          </Button>
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={pendingQuery}
                onChange={(event) => setPendingQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                placeholder={t("documents.searchPlaceholder", { defaultValue: "Search OCR text and document titles…" })}
              />
            </div>
            <Button variant="outline" onClick={handleSearch}>{t("documents.search", { defaultValue: "Search" })}</Button>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{totalLabel}</span>
            {query && (
              <button className="hover:text-foreground" onClick={() => { setQuery(""); setPendingQuery(""); }}>
                {t("common.clearFilter", { defaultValue: "Clear" })} ×
              </button>
            )}
          </div>

          {documents.isLoading ? (
            <div className="flex items-center justify-center rounded-lg border py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : documents.error ? (
            <div className="rounded-lg border border-destructive/30 px-4 py-8 text-center text-sm text-destructive">
              {documents.error.message}
            </div>
          ) : !documents.data?.results.length ? (
            <div className="rounded-lg border px-4 py-12 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                {t("documents.empty", { defaultValue: "No documents found." })}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border divide-y">
              {documents.data.results.map((document) => (
                <div key={document.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{document.title || document.original_file_name || `#${document.id}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("documents.created", { defaultValue: "Created" })}: {formatDate(document.created || document.added)}
                      {document.archive_serial_number ? ` · ${document.archive_serial_number}` : ""}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href={document.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 me-1.5" />
                      {t("common.open", { defaultValue: "Open" })}
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
