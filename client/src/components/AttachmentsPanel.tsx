import { useRef, useState, useCallback } from "react";
import { Upload, X, FileText, Image as ImageIcon, Eye, Loader2, AlertTriangle, File } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export interface Attachment {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface AttachmentsPanelProps {
  /** Current list of attachment URLs stored on the entity */
  attachments: string[];
  /** Called with the updated full array after add or remove */
  onChange: (urls: string[]) => void;
  /** Whether the panel is in a read-only state (e.g. while parent form is submitting) */
  disabled?: boolean;
  /** Maximum number of files allowed (default 10) */
  maxFiles?: number;
}

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"]);

function guessType(url: string): "image" | "pdf" | "doc" | "sheet" | "file" {
  const lower = url.toLowerCase().split("?")[0];
  if (/\.(jpe?g|png|gif|webp|heic|heif)$/.test(lower)) return "image";
  if (/\.pdf$/.test(lower)) return "pdf";
  if (/\.(doc|docx)$/.test(lower)) return "doc";
  if (/\.(xls|xlsx)$/.test(lower)) return "sheet";
  return "file";
}

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const parts = path.split("/");
    const last = parts[parts.length - 1];
    // Strip leading timestamp prefix like "1234567890_filename.pdf"
    return decodeURIComponent(last).replace(/^\d+_/, "");
  } catch {
    return url.split("/").pop() ?? "file";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type, className = "w-5 h-5" }: { type: ReturnType<typeof guessType>; className?: string }) {
  if (type === "image") return <ImageIcon className={className} />;
  if (type === "pdf") return <FileText className={className} />;
  return <File className={className} />;
}

export function AttachmentsPanel({
  attachments,
  onChange,
  disabled = false,
  maxFiles = 10,
}: AttachmentsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    if (attachments.length >= maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error("File too large (max 16 MB)");
      return;
    }
    if (!ALLOWED_MIME.has(file.type)) {
      toast.error(`File type '${file.type}' is not allowed`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setStorageError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Use XHR so we can track progress
      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const result = JSON.parse(xhr.responseText);
            resolve(result.url as string);
          } else {
            const err = JSON.parse(xhr.responseText).error ?? "Upload failed";
            reject(new Error(err));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(formData);
      });

      onChange([...attachments, url]);
      toast.success("File attached");
    } catch (err: any) {
      const msg: string = err?.message ?? "Upload failed";
      const isStorageConfig =
        msg.includes("storage is not configured") ||
        msg.includes("STORAGE_ENDPOINT") ||
        msg.includes("BUILT_IN_FORGE") ||
        msg.includes("503");
      if (isStorageConfig) {
        setStorageError(msg);
      } else {
        toast.error(msg);
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [attachments, maxFiles, onChange]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  const handleRemove = (index: number) => {
    const updated = attachments.filter((_, i) => i !== index);
    onChange(updated);
  };

  const canUpload = !disabled && attachments.length < maxFiles;

  return (
    <div className="space-y-3">
      {/* Storage config error banner */}
      {storageError && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">File storage not configured</p>
            <p className="mt-0.5 text-xs opacity-80">
              Set <code>STORAGE_ENDPOINT</code> (Cloudflare R2) or <code>BUILT_IN_FORGE_API_URL</code> in your .env to enable file uploads.
            </p>
          </div>
        </div>
      )}

      {/* File list */}
      {attachments.length > 0 && (
        <ul className="space-y-1.5">
          {attachments.map((url, i) => {
            const type = guessType(url);
            const name = filenameFromUrl(url);
            return (
              <li
                key={i}
                className="group flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
              >
                <FileIcon type={type} className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-primary hover:underline"
                  title={name}
                >
                  {name}
                </a>
                {type === "image" && (
                  <button
                    type="button"
                    onClick={() => setPreview(url)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                    aria-label="Preview image"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                    aria-label="Remove attachment"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Upload zone */}
      {canUpload && (
        <div
          className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-sm transition-colors ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/30"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={handleFileInput}
            disabled={uploading}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-muted-foreground">
                Uploading{uploadProgress > 0 ? ` ${uploadProgress}%` : "…"}
              </span>
              {uploadProgress > 0 && (
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <>
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground">
                Drag & drop or{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => inputRef.current?.click()}
                >
                  browse
                </button>
              </span>
              <span className="text-xs text-muted-foreground">
                Images, PDF, Word, Excel · max 16 MB
              </span>
            </>
          )}
        </div>
      )}

      {/* Image lightbox */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-3xl p-2">
          {preview && (
            <img
              src={preview}
              alt="Preview"
              className="max-h-[80vh] w-full rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
