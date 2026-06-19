import nodemailer, { type Transporter } from "nodemailer";
import { getPublicBaseUrl } from "../../_core/integrationsConfig";
import { getNotificationConfig, isSectionConfigured } from "../config";
import { formatEmailHtml, formatEmailSubject } from "../format";
import type { NotificationChannel } from "../types";

// Cache the transporter, but key it on the resolved SMTP config so it is rebuilt
// when an admin changes the credentials at runtime (env-only installs build it
// once and reuse it forever).
let transporter: Transporter | null = null;
let transporterKey = "";

function getTransport(): Transporter {
  const c = getNotificationConfig();
  const port = c.smtpPort ? Number(c.smtpPort) : 587;
  const key = JSON.stringify([c.smtpHost, port, c.smtpUser, c.smtpPass]);
  if (!transporter || transporterKey !== key) {
    transporter = nodemailer.createTransport({
      host: c.smtpHost,
      port,
      secure: port === 465,
      auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPass } : undefined,
    });
    transporterKey = key;
  }
  return transporter;
}

/**
 * Probe the configured SMTP server: open a connection and authenticate without
 * sending a message (nodemailer's `verify()`). Throws with the SMTP error when
 * the host is unreachable or the credentials are rejected — used by the admin
 * "Test connection" action so a misconfiguration is caught before a real
 * notification silently fails.
 */
export async function verifyEmailConnection(): Promise<void> {
  await getTransport().verify();
}

/**
 * Send a real test email to `to` through the configured SMTP transport. Unlike
 * {@link verifyEmailConnection}, this exercises the full send path (envelope,
 * relay acceptance, `from` header) so an admin can confirm a message actually
 * lands in an inbox — not just that the handshake succeeds. Throws with the SMTP
 * error when the send is rejected.
 */
export async function sendTestEmail(to: string): Promise<void> {
  const c = getNotificationConfig();
  const payload = {
    dedupeKey: "smtp-test",
    category: "system" as const,
    title: "HomeVault SMTP test",
    body: "This is a test email confirming your HomeVault SMTP settings work. If you received it, outgoing email is configured correctly.",
  };
  await getTransport().sendMail({
    from: c.smtpFrom || c.smtpUser,
    to,
    subject: formatEmailSubject(payload),
    text: payload.body,
    html: formatEmailHtml(payload, getPublicBaseUrl()),
  });
}

/** Email via SMTP (nodemailer). Configured when a host + a from/user is set. */
export const emailChannel: NotificationChannel = {
  key: "email",
  isConfigured: () => isSectionConfigured("email"),
  canDeliverTo: r => Boolean(r.email),
  async send(recipient, payload) {
    const c = getNotificationConfig();
    await getTransport().sendMail({
      from: c.smtpFrom || c.smtpUser,
      to: recipient.email!,
      subject: formatEmailSubject(payload),
      text: payload.body,
      html: formatEmailHtml(payload, getPublicBaseUrl()),
    });
  },
};
