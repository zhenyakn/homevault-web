import { ENV } from "./_core/env";

export type PaperlessDocument = {
  id: number;
  title: string;
  created?: string;
  added?: string;
  correspondent?: number | null;
  document_type?: number | null;
  storage_path?: number | null;
  tags?: number[];
  archive_serial_number?: string | null;
  original_file_name?: string | null;
};

export type PaperlessDocumentList = {
  count: number;
  next: string | null;
  previous: string | null;
  results: PaperlessDocument[];
};

export type PaperlessHealth = {
  configured: boolean;
  ok: boolean;
  detail?: string;
};

function getBaseUrl() {
  return ENV.paperlessUrl.replace(/\/$/, "");
}

function ensureConfigured() {
  if (!ENV.paperlessUrl || !ENV.paperlessToken) {
    throw new Error("Paperless integration is not configured. Set PAPERLESS_URL and PAPERLESS_TOKEN.");
  }
}

async function paperlessFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  ensureConfigured();

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${ENV.paperlessToken}`,
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Paperless API request failed (${response.status}): ${body || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getPaperlessHealth(): Promise<PaperlessHealth> {
  if (!ENV.paperlessUrl || !ENV.paperlessToken) {
    return { configured: false, ok: false, detail: "Missing PAPERLESS_URL or PAPERLESS_TOKEN" };
  }

  try {
    await paperlessFetch<PaperlessDocumentList>("/api/documents/?page_size=1");
    return { configured: true, ok: true };
  } catch (error: any) {
    return { configured: true, ok: false, detail: error?.message ?? "Paperless health check failed" };
  }
}

export async function listPaperlessDocuments(params: { query?: string; page?: number; pageSize?: number }) {
  const search = new URLSearchParams();
  search.set("page", String(params.page ?? 1));
  search.set("page_size", String(params.pageSize ?? 25));
  search.set("ordering", "-created");

  if (params.query?.trim()) {
    search.set("query", params.query.trim());
  }

  return paperlessFetch<PaperlessDocumentList>(`/api/documents/?${search.toString()}`);
}

export async function uploadPaperlessDocument(input: { file: Express.Multer.File; title?: string; tags?: string }) {
  const form = new FormData();
  const blob = new Blob([input.file.buffer], { type: input.file.mimetype || "application/octet-stream" });
  form.append("document", blob, input.file.originalname);

  if (input.title?.trim()) {
    form.append("title", input.title.trim());
  }

  if (input.tags?.trim()) {
    form.append("tags", input.tags.trim());
  }

  return paperlessFetch<{ task_id?: string; document?: number }>("/api/documents/post_document/", {
    method: "POST",
    body: form,
  });
}

export function getPaperlessDocumentUrl(id: number) {
  ensureConfigured();
  return `${getBaseUrl()}/documents/${id}/details`;
}
