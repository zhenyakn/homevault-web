import nodemailer, { type Transporter } from "nodemailer";
import { ENV } from "../../_core/env";
import { formatEmailHtml, formatEmailSubject } from "../format";
import type { NotificationChannel } from "../types";

let transporter: Transporter | null = null;

function getTransport(): Transporter {
  if (!transporter) {
    const port = ENV.smtpPort ? Number(ENV.smtpPort) : 587;
    transporter = nodemailer.createTransport({
      host: ENV.smtpHost,
      port,
      secure: port === 465,
      auth: ENV.smtpUser
        ? { user: ENV.smtpUser, pass: ENV.smtpPass }
        : undefined,
    });
  }
  return transporter;
}

/** Email via SMTP (nodemailer). Configured when a host + a from/user is set. */
export const emailChannel: NotificationChannel = {
  key: "email",
  isConfigured: () => Boolean(ENV.smtpHost && (ENV.smtpFrom || ENV.smtpUser)),
  canDeliverTo: r => Boolean(r.email),
  async send(recipient, payload) {
    await getTransport().sendMail({
      from: ENV.smtpFrom || ENV.smtpUser,
      to: recipient.email!,
      subject: formatEmailSubject(payload),
      text: payload.body,
      html: formatEmailHtml(payload, ENV.publicBaseUrl),
    });
  },
};
