import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../_core/logger";
import { getPublicBaseUrl } from "../_core/integrationsConfig";
import {
  getNotificationConfig,
  isSectionConfigured,
} from "../notifications/config";

// Transactional auth emails (verify address, reset password). Reuses the same
// SMTP configuration as notification emails (resolved env-first, then the
// admin-set override). Sending is best-effort: a failure is logged but never
// blocks the auth flow that triggered it (e.g. a user can still register if the
// verification email can't be sent).

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

export function isEmailConfigured(): boolean {
  return isSectionConfigured("email");
}

function appUrl(path: string): string {
  return `${getPublicBaseUrl()}${path}`;
}

async function send(
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<void> {
  if (!isEmailConfigured()) {
    logger.warn({ to, subject }, "[auth-email] SMTP not configured — skipped");
    return;
  }
  try {
    const c = getNotificationConfig();
    await getTransport().sendMail({
      from: c.smtpFrom || c.smtpUser,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    logger.error(
      { to, subject, err: (err as Error).message },
      "[auth-email] send failed"
    );
  }
}

export async function sendVerificationEmail(
  to: string,
  rawToken: string
): Promise<void> {
  const link = appUrl(`/#/verify-email?token=${encodeURIComponent(rawToken)}`);
  await send(
    to,
    "Verify your HomeVault email",
    `Confirm your email address by opening this link:\n\n${link}\n\nIf you didn't create a HomeVault account, you can ignore this message.`,
    `<p>Confirm your email address to finish setting up HomeVault:</p>
     <p><a href="${link}">Verify my email</a></p>
     <p>If you didn't create a HomeVault account, you can ignore this message.</p>`
  );
}

export async function sendInviteEmail(
  to: string,
  rawToken: string,
  tenantName: string
): Promise<void> {
  const link = appUrl(`/#/accept-invite?token=${encodeURIComponent(rawToken)}`);
  await send(
    to,
    `You've been invited to ${tenantName} on HomeVault`,
    `You've been invited to join "${tenantName}" on HomeVault.\n\nAccept the invitation:\n\n${link}\n\nIf you weren't expecting this, you can ignore this message.`,
    `<p>You've been invited to join <strong>${tenantName}</strong> on HomeVault.</p>
     <p><a href="${link}">Accept the invitation</a></p>
     <p>If you weren't expecting this, you can ignore this message.</p>`
  );
}

export async function sendPasswordResetEmail(
  to: string,
  rawToken: string
): Promise<void> {
  const link = appUrl(
    `/#/reset-password?token=${encodeURIComponent(rawToken)}`
  );
  await send(
    to,
    "Reset your HomeVault password",
    `Reset your password by opening this link:\n\n${link}\n\nThis link expires in 1 hour. If you didn't request a reset, you can ignore this message.`,
    `<p>Reset your HomeVault password:</p>
     <p><a href="${link}">Choose a new password</a></p>
     <p>This link expires in 1 hour. If you didn't request a reset, you can ignore this message.</p>`
  );
}
