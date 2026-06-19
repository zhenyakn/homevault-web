import nodemailer, { type Transporter } from "nodemailer";
import { getNotificationConfig } from "../config";

/**
 * The single SMTP transport shared by ALL outgoing mail — notification emails
 * (channels/email.ts) and transactional account emails (auth/email.ts). Keeping
 * one transport means the admin "Test connection" / "Send test email" actions
 * validate exactly the path every real email takes, so the two can never drift.
 *
 * The transport is cached but keyed on the resolved SMTP credentials, so it is
 * rebuilt when an admin changes them at runtime (env-only installs build it once
 * and reuse it forever).
 */
let transporter: Transporter | null = null;
let transporterKey = "";

export function getEmailTransport(): Transporter {
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
