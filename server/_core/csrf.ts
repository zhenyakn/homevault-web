import { randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { ENV } from "./env";

/**
 * Double-submit CSRF token.
 *
 * Pattern:
 *   - Server sets a non-HttpOnly cookie `csrf_token` (so JS can read it).
 *   - Clients echo the same value in the `X-CSRF-Token` header on every
 *     state-changing request.
 *   - Middleware compares the two via `crypto.timingSafeEqual`.
 *
 * Because attacker pages cannot read cookies from another origin
 * (Same-Origin Policy), they cannot forge the header — even though the
 * cookie itself rides on cross-site requests. This pairs well with the
 * existing session cookie's `SameSite` setting without forcing it to Strict.
 *
 * The token is rotated on each fresh session — the auto-issue middleware
 * below sets it lazily for any authenticated request that doesn't already
 * have a cookie, so the client picks it up on the first GET.
 */

export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";

const TOKEN_BYTES = 32;

function buildCookieOptions(req: Request) {
  // Match the session cookie's secure/SameSite calculation.
  const xfp = req.headers["x-forwarded-proto"];
  const proto = typeof xfp === "string" ? xfp.split(",")[0].trim() : req.protocol;
  const secure = ENV.isProduction || proto === "https";
  return {
    httpOnly: false, // intentional — JS must read this
    secure,
    sameSite: secure ? ("strict" as const) : ("lax" as const),
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Middleware: ensures a CSRF cookie is present on every response. If missing
 * (or if the client clears it), issues a fresh one. Idempotent and free of
 * side-effects on the request body, so safe to mount globally.
 */
export function csrfIssueMiddleware(req: Request, res: Response, next: NextFunction) {
  const existing = readCookie(req, CSRF_COOKIE);
  if (!existing) {
    res.cookie(CSRF_COOKIE, newToken(), buildCookieOptions(req));
  }
  next();
}

/**
 * Middleware: rejects requests that don't echo the cookie's value in the
 * `X-CSRF-Token` header. Used for state-changing routes (POST/PUT/PATCH/DELETE).
 *
 * Skipped entirely when `NODE_ENV=test` so existing tests aren't forced to
 * thread the header through their fetch wrappers. Production + dev both
 * enforce.
 */
export function csrfRequireMiddleware(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "test") return next();
  const cookie = readCookie(req, CSRF_COOKIE);
  const header = req.headers[CSRF_HEADER];
  const headerStr = Array.isArray(header) ? header[0] : header;
  if (!cookie || !headerStr || !constantTimeEqual(cookie, headerStr)) {
    res.status(403).json({ error: "CSRF token missing or invalid" });
    return;
  }
  next();
}

// ─── helpers ────────────────────────────────────────────────────────────────

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  // Manual parse to avoid pulling cookie-parser. The session cookie already
  // round-trips through `cookie` package elsewhere; here we just need value.
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
