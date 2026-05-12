/**
 * Browser-side CSRF helper.
 *
 * The server (`server/_core/csrf.ts`) sets a non-HttpOnly cookie called
 * `csrf_token` on the first response. State-changing requests must echo the
 * value as an `X-CSRF-Token` header so the server can verify the requester
 * is from this origin (attacker-controlled origins can't read the cookie).
 *
 * Usage:
 *   fetch("/api/upload", { headers: csrfHeaders(), method: "POST", body });
 *
 *   trpc:
 *     const utils = trpc.useUtils();  // automatic via httpBatchLink headers
 */

export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "X-CSRF-Token";

/** Returns the token value, or empty string if the cookie hasn't been set yet
 * (e.g. on the very first page load before any server response). */
export function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const raw = document.cookie ?? "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === CSRF_COOKIE) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return "";
}

/** Convenience header object — empty when the cookie isn't set so callers can
 * spread it unconditionally without breaking GET requests. */
export function csrfHeaders(): Record<string, string> {
  const token = readCsrfToken();
  return token ? { [CSRF_HEADER]: token } : {};
}
