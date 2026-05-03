import { ENV } from "./_core/env";

export type PaperlessDocument = {
  id: number;
  title: string;
  correspondent?: number | null;
  document_type?: number | null;
  storage_path?: number | null;
  tags?: number[];
  created?: string | null;
  added?: string | null;
  modified?: string | null;
  archive_serial_number?: number | null;
  original_file_name?: string | null;
  content?: string | null;
};

export type PaperlessListResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type PaperlessDocumentListParams = {
  query?: string;
  page?: number;
  pageSize?: number;
};

function getBaseUrl() {
  return ENV.paperlessUrl.replace(/\/$/, "");
}

export function isPaperlessConfigured() {
  return Boolean(getBaseUrl() && ENV.paperlessToken);
}

function assertPaperlessConfigured() {
  if (!isPaperlessConfigured()) {
    throw new Error("Paperless is not configured. Set PAPERLESS_URL and PAPERLESS_TOKEN.");
  }
}

async function paperlessFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  assertPaperlessConfigured();

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${ENV.paperlessToken}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Paperless API request failed (${response.status}): ${body || response.statusText}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getPaperlessStatus() {
  if (!isPaperlessConfigured()) {
    return { configured: false, reachable: false } as const;
  }

  try {
    await paperlessFetch<PaperlessListResponse<PaperlessDocument>>("/api/documents/?page_size=1");
    return { configured: true, reachable: true } as const;
  } catch (error: any) {
    return { configured: true, reachable: false, error: error?.message ?? "Unknown Paperless error" } as const;
  }
}

export async function listPaperlessDocuments(params: PaperlessDocumentListParams = {}) {
  const search = new URLSearchParams();
  search.set("page", String(params.page ?? 1));
  search.set("page_size", String(params.pageSize ?? 25));
  search.set("ordering", "-added");

  if (params.query?.trim()) {
    search.set("query", params.query.trim());
  }

  return await paperlessFetch<PaperlessListResponse<PaperlessDocument>>(`/api/documents/?${search.toString()}`);
}

export async function getPaperlessDocument(id: number) {
  return await paperlessFetch<PaperlessDocument>(`/api/documents/${id}/`);
}

export async function uploadPaperlessDocument(file: Express.Multer.File, title?: string) {
  assertPaperlessConfigured();

  const form = new FormData();
  form.append("document", new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  if (title?.trim()) form.append("title", title.trim());

  const response = await fetch(`${getBaseUrl()}/api/documents/post_document/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${ENV.paperlessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Paperless upload failed (${response.status}): ${body || response.statusText}`);
  }

  const text = await response.text();
  try {
    return text ? JSON.parse(text) : { accepted: true };
  } catch {
    return { accepted: true, response: text };
  }
}

export function getPaperlessDocumentPreviewUrl(id: number) {
  return `${getBaseUrl()}/api/documents/${id}/preview/`;
}

export function getPaperlessDocumentDownloadUrl(id: number) {
  return `${getBaseUrl()}/api/documents/${id}/download/`;
}
