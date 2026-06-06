/**
 * Notification formatting — PURE. Turns a NotificationPayload into the shapes
 * each transport needs (plain text for Telegram/WhatsApp, subject + HTML for
 * email). Kept dependency-free and unit-tested (format.test.ts).
 */

import type { NotificationPayload } from "./types";

/** Plain text for chat transports (Telegram / WhatsApp). */
export function formatPlainText(payload: NotificationPayload): string {
  return `${payload.title}\n${payload.body}`;
}

/** Email subject line. */
export function formatEmailSubject(payload: NotificationPayload): string {
  return payload.title;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Minimal email HTML. `baseUrl` (optional) turns a relative `url` into an
 * absolute "View in HomeVault" link.
 */
export function formatEmailHtml(
  payload: NotificationPayload,
  baseUrl?: string
): string {
  const title = escapeHtml(payload.title);
  const body = escapeHtml(payload.body).replace(/\n/g, "<br>");
  let link = "";
  if (payload.url) {
    const href =
      baseUrl && payload.url.startsWith("/")
        ? `${baseUrl.replace(/\/$/, "")}/#${payload.url}`
        : payload.url;
    link = `<p><a href="${escapeHtml(href)}">View in HomeVault</a></p>`;
  }
  return `<div><h2>${title}</h2><p>${body}</p>${link}</div>`;
}
