import { getPublicBaseUrl } from "../../_core/integrationsConfig";
import { getNotificationConfig, isSectionConfigured } from "../config";
import { formatEmailHtml, formatEmailSubject } from "../format";
import { getEmailTransport } from "./emailTransport";
import type { NotificationChannel } from "../types";

/**
 * Probe the configured SMTP server: open a connection and authenticate without
 * sending a message (nodemailer's `verify()`). Throws with the SMTP error when
 * the host is unreachable or the credentials are rejected — used by the admin
 * "Test connection" action so a misconfiguration is caught before a real
 * notification silently fails.
 */
export async function verifyEmailConnection(): Promise<void> {
  await getEmailTransport().verify();
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
  await getEmailTransport().sendMail({
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
    await getEmailTransport().sendMail({
      from: c.smtpFrom || c.smtpUser,
      to: recipient.email!,
      subject: formatEmailSubject(payload),
      text: payload.body,
      html: formatEmailHtml(payload, getPublicBaseUrl()),
    });
  },
};
