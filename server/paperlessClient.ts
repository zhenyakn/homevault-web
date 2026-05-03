import { ENV } from "./_core/env";

export type PaperlessDocumentSummary = {
  id: number;
  title: string;
  created: string | null;
  modified: string | null;
  added: string | null;
  originalFileName: string | null;
  archivedFileName: string | null;
  correspondent: number | null;
  documentType: number | null;
  storagePath: number | null;
  tags: number[];
  mimeType: string | null;
  pageCount: number | null;
  contentPreview: string;
};

export type PaperlessDocumentList = {
  count: number;
  next: boolean;
  previous: boolean;
  results: PaperlessDocumentSummary[];
};

export type PaperlessStatus = {
  enabled: boolean;
  configuredBaseUrl: string | null;
  message: string;
};

type PaperlessRawDocument = {
  id: number;
  title?: string | null;
  created?: string | null;
  modified?: string | null;
  added?: string | null;
  original_file_name?: string | null;
  archived_file_name?: string | null;
  correspondent?: number | null;
  document_type?: number | null;
  storage_path?: number | null;
  tags?: number[] | null;
  mime_type?: string | null;
  page_count?: number | null;
  content?: string | null;
};

type PaperlessListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: PaperlessRawDocument[];
};

export class PaperlessNotConfiguredError extends Error {
  constructor() {
    super("Paperless is not configured. Set PAPERLESS_BASE_URL and PAPERLESS_API_TOKEN.");
    this.name = "PaperlessNotConfiguredError";
  }
}

class PaperlessRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PaperlessRequestError";
    this.status = status;
  }
}

function getConfig() {
  const baseUrl = ENV.paperlessBaseUrl.trim().replace(/\/+$/, "");
  const token = ENV.paperlessApiToken.trim();

  if (!baseUrl || !token) {
    throw new PaperlessNotConfiguredError();
  }

  return { baseUrl, token };
}

export function getPaperlessStatus(): PaperlessStatus {
  const baseUrl = ENV.paperlessBaseUrl.trim().replace(/\/+$/, "");
  const token = ENV.paperlessApiToken.trim();

  if (!baseUrl || !token) {
    return {
      enabled: false,
      configuredBaseUrl: baseUrl || null,
      message: "Paperless integration is disabled. Configure PAPERLESS_BASE_URL and PAPERLESS_API_TOKEN to enable the document vault.",
    };
  }

  return {
    enabled: true,
    configuredBaseUrl: baseUrl,
    message: "Paperless integration is configured.",
  };
}

function buildHeaders(token: string, extra?: HeadersInit): HeadersInit {
  return {
    Authorization: `Token ${token}`,
    Accept: "application/json",
    ...extra,
  };
}

async function paperlessJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, token } = getConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: buildHeaders(token, init.headers),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new PaperlessRequestError(
      response.status,
      body || `Paperless request failed with HTTP ${response.status}`,
    );
  }

  return await response.json() as T;
}

function normalizeDocument(document: PaperlessRawDocument): PaperlessDocumentSummary {
  const title = document.title?.trim()
    || document.original_file_name?.trim()
    || document.archived_file_name?.trim()
    || `Document ${document.id}`;

  return {
    id: document.id,
    title,
    created: document.created ?? null,
    modified: document.modified ?? null,
    added: document.added ?? null,
    originalFileName: document.original_file_name ?? null,
    archivedFileName: document.archived_file_name ?? null,
    correspondent: document.correspondent ?? null,
    documentType: document.document_type ?? null,
    storagePath: document.storage_path ?? null,
    tags: document.tags ?? [],
    mimeType: document.mime_type ?? null,
    pageCount: document.page_count ?? null,
    contentPreview: (document.content ?? "").replace(/\s+/g, " ").trim().slice(0, 280),
  };
}

export async function listPaperlessDocuments(input?: {
  query?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaperlessDocumentList> {
  const page = input?.page ?? 1;
  const pageSize = input?.pageSize ?? 20;
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    ordering: "-created",
  });

  const query = input?.query?.trim();
  if (query) params.set("query", query);

  const data = await paperlessJson<PaperlessListResponse>(`/api/documents/?${params.toString()}`);
  return {
    count: data.count,
    next: Boolean(data.next),
    previous: Boolean(data.previous),
    results: data.results.map(normalizeDocument),
  };
}

export async function uploadPaperlessDocument(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  title?: string;
}) {
  const { baseUrl, token } = getConfig();
  const formData = new FormData();
  formData.set(
    "document",
    new Blob([input.buffer], { type: input.mimeType || "application/octet-stream" }),
    input.filename,
  );

  const title = input.title?.trim();
  if (title) formData.set("title", title);

  const response = await fetch(`${baseUrl}/api/documents/post_document/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new PaperlessRequestError(
      response.status,
      body || `Paperless upload failed with HTTP ${response.status}`,
    );
  }

  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : { ok: true };
  } catch {
    return { ok: true, taskId: raw };
  }
}

export async function fetchPaperlessDocumentFile(id: number) {
  const { baseUrl, token } = getConfig();
  const response = await fetch(`${baseUrl}/api/documents/${id}/download/`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new PaperlessRequestError(
      response.status,
      body || `Paperless download failed with HTTP ${response.status}`,
    );
  }

  return response;
}

export function isPaperlessNotConfigured(error: unknown) {
  return error instanceof PaperlessNotConfiguredError;
}

export function getPaperlessHttpStatus(error: unknown) {
  return error instanceof PaperlessRequestError ? error.status : 500;
}
