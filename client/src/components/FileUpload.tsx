import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText, Image } from "lucide-react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf";

interface UploadedFile {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface FileUploadProps {
  onUpload: (file: UploadedFile) => void;
  existingFiles?: UploadedFile[];
  onRemove?: (index: number) => void;
  accept?: string;
  maxFiles?: number;
}

export function FileUpload({
  onUpload,
  existingFiles = [],
  onRemove,
  accept = "image/*,.pdf,.doc,.docx,.xls,.xlsx",
  maxFiles = 5,
}: FileUploadProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (existingFiles.length >= maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }

    if (file.size > 16 * 1024 * 1024) {
      toast.error("File too large (max 16MB)");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        // CSRF: server verifies this header matches the csrf_token cookie.
        headers: csrfHeaders(),
        credentials: "include",
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: t("fileUpload.uploadFailed"), code: undefined }));
        // Specific UX paths for the two error codes the server promises.
        // Falling through to the generic toast for anything else.
        if (err.code === "RECONNECT_REQUIRED") {
          toast.error(t("fileUpload.reconnectTitle"), {
            description: t("fileUpload.reconnectDesc"),
            action: {
              label: t("fileUpload.openSettings"),
              onClick: () => { window.location.hash = "#/settings/integrations"; },
            },
          });
          return;
        }
        if (err.code === "DRIVE_QUOTA_EXCEEDED") {
          toast.error(t("fileUpload.quotaTitle"), {
            description: t("fileUpload.quotaDesc"),
          });
          return;
        }
        throw new Error(err.error);
      }

      const result = await resp.json();
      onUpload(result);
      toast.success("File uploaded");
    } catch (error: any) {
      toast.error(error.message || t("fileUpload.uploadFailed"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <Image className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      {existingFiles.length > 0 && (
        <div className="space-y-1">
          {existingFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 border rounded-md bg-muted/30 text-sm"
            >
              {getFileIcon(file.mimeType)}
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate text-blue-600 hover:underline"
              >
                {file.filename}
              </a>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatSize(file.size)}
              </span>
              {onRemove && (
                <button
                  onClick={() => onRemove(index)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {existingFiles.length < maxFiles && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? "Uploading..." : "Attach File"}
          </Button>
        </div>
      )}
    </div>
  );
}
