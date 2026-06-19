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
