import { z } from "zod";
import { obsConfig } from "./observability/config";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  // Deployment mode. `standalone` = today's single-install behaviour (OAuth or
  // NO_AUTH). `saas` = cloud, multi-tenant, native email/password registration;
  // NO_AUTH is forbidden and session/email config is enforced (see below).
  APP_MODE: z.enum(["standalone", "saas"]).default("standalone"),
  // Billing provider for SAAS. "stub" records plan state locally without an
  // external account; real providers (stripe, …) are wired in billing/provider.
  BILLING_PROVIDER: z.string().default("stub"),
  // Per-tenant + per-IP request rate limiting. On by default; auto-off under
  // tests so integration callers can hammer a single tenant freely.
  RATE_LIMIT_ENABLED: z.string().default("true"),
  VITE_APP_ID: z.string().default(""),
  OAUTH_SERVER_URL: z.string().default(""),
  OWNER_OPEN_ID: z.string().default(""),
  // Forge API powers the optional Manus features (LLM, voice, maps, push)
  // and is unrelated to file STORAGE — Drive/S3 handle that now.
  BUILT_IN_FORGE_API_URL: z.string().default(""),
  BUILT_IN_FORGE_API_KEY: z.string().default(""),
  STORAGE_BACKEND: z.string().default(""),
  // Local-filesystem backend: base directory for stored files. Must be a
  // persistent, writable path (a Docker volume, or the HA add-on's /data dir).
  STORAGE_DIR: z.string().default(""),
  // S3-compatible backend (Cloudflare R2 / Backblaze B2 / AWS S3 / MinIO). The
  // backend reads these directly from process.env; declared here for validation
  // and so the env is self-documenting. They may also be set from the UI.
  STORAGE_ENDPOINT: z.string().default(""),
  STORAGE_BUCKET: z.string().default(""),
  STORAGE_REGION: z.string().default(""),
  STORAGE_ACCESS_KEY_ID: z.string().default(""),
  STORAGE_SECRET_ACCESS_KEY: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default(""),
  // Required to use Drive endpoints when NO_AUTH=true. Without it, the auto-
  // admin session middleware would let any LAN client bind/unbind the Drive.
  ADMIN_SETUP_TOKEN: z.string().default(""),
  NO_AUTH: z.string().default("false"),
  SEED_MOCK_DATA: z.string().default("false"),
  // Run pending drizzle/*.sql migrations on server boot. Default on; the HA
  // add-on sets this false because run.sh already migrates via its own script.
  AUTO_MIGRATE: z.string().default("true"),
  PORT: z.string().default("3005"),
  HOST: z.string().default("0.0.0.0"),
  // ── Notifications (all optional; each adapter no-ops when unset) ──────────
  // Public origin used to register the Telegram webhook and build links.
  PUBLIC_BASE_URL: z.string().default(""),
  // Email (SMTP) channel.
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.string().default(""),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""),
  // Telegram bot (two-way) + outbound channel.
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  // Browser Web Push (VAPID). Generate with: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:admin@homevault.local"),
  // WhatsApp Cloud API (Meta). The channel is active when both the phone number
  // id and a permanent access token are set. API version is rarely changed.
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().default(""),
  WHATSAPP_API_VERSION: z.string().default("v21.0"),
  // ── Observability (logging / tracing / metrics) ──────────────────────────
  // Service identity stamped onto every log line and span (OTel resource attrs).
  SERVICE_NAME: z.string().default("homevault"),
  SERVICE_VERSION: z.string().default("1.0.0"),
  // Minimum level emitted. Empty → derived from NODE_ENV (debug in dev, info in
  // prod, silent under test). One of: trace|debug|info|warn|error|fatal|silent.
  LOG_LEVEL: z.string().default(""),
  // Console format. Empty → pretty in dev, json in prod.
  LOG_FORMAT: z.enum(["json", "pretty", ""]).default(""),
  // Rotating local log files. Disabled automatically under NODE_ENV=test.
  LOG_FILE_ENABLED: z.string().default("true"),
  LOG_DIR: z.string().default("logs"),
  LOG_MAX_FILE_SIZE: z.string().default("10MB"),
  LOG_MAX_FILES: z.string().default("10"),
  LOG_RETENTION_DAYS: z.string().default("30"),
  LOG_COMPRESS: z.string().default("true"),
  // In-memory ring buffer size that backs the in-app log viewer.
  LOG_BUFFER_SIZE: z.string().default("2000"),
  // Access-log sampling: fraction (0..1) of successful, low-value HTTP/RPC
  // access logs to keep. 1 = keep everything. Errors are never sampled out.
  LOG_SAMPLE_RATE: z.string().default("1"),
  // Distributed tracing (in-process spans, OTel-shaped).
  TRACE_ENABLED: z.string().default("true"),
  TRACE_BUFFER_SIZE: z.string().default("500"),
  // RED metrics + optional Prometheus endpoint (off by default; expose
  // deliberately behind your own auth/network policy).
  METRICS_ENABLED: z.string().default("true"),
  METRICS_ENDPOINT_ENABLED: z.string().default("false"),
  // Optional bearer token guarding /metrics (recommended when the endpoint is
  // reachable beyond a trusted scrape network). Empty = no token required.
  METRICS_TOKEN: z.string().default(""),
  // Reserved seam for remote export (OTLP/Loki/Datadog/…). Empty = disabled;
  // wiring an exporter to this endpoint is the "pluggable later" step.
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(
    "\n[ENV] Server cannot start — missing or invalid environment variables:\n"
  );
  for (const issue of parsed.error.issues) {
    process.stderr.write(`  ✗ ${issue.path.join(".")}: ${issue.message}\n`);
  }
  process.stderr.write("\nCheck your .env file against .env.example\n\n");
  process.exit(1);
}

const raw = parsed.data;

export type EnvConfigInput = {
  NODE_ENV: string;
  APP_MODE: string;
  NO_AUTH: string;
  VITE_APP_ID: string;
  PUBLIC_BASE_URL: string;
};

/**
 * Cross-field runtime validation that the per-field schema can't express. Pure
 * (no process.exit) so it can be unit-tested; the module wires the result to
 * stderr + exit below.
 *
 * The most important rule: native (non-NO_AUTH) sessions embed VITE_APP_ID in
 * the JWT and verifySession rejects an empty appId — so without it nobody can
 * ever log in, which otherwise fails silently as a blank login screen.
 *
 * Skipped under NODE_ENV=test so the suite (which imports this module) isn't
 * tripped by an absent appId. In development a missing appId is a warning; in
 * production / saas it is fatal.
 */
export function validateEnvConfig(cfg: EnvConfigInput): {
  fatal: string[];
  warn: string[];
} {
  const fatal: string[] = [];
  const warn: string[] = [];
  if (cfg.NODE_ENV === "test") return { fatal, warn };

  const isSaas = cfg.APP_MODE === "saas";
  const noAuth = cfg.NO_AUTH === "true";

  if (isSaas && noAuth) {
    fatal.push(
      "APP_MODE=saas is incompatible with NO_AUTH=true — SAAS requires every request to be an authenticated, tenant-scoped user."
    );
  }
  // Sessions are in use whenever NO_AUTH is off. They can't be verified without
  // a non-empty VITE_APP_ID.
  if (!noAuth && !cfg.VITE_APP_ID) {
    const msg =
      "VITE_APP_ID is required when NO_AUTH is not enabled — sessions embed it and cannot be verified without it (logins would silently fail).";
    if (isSaas || cfg.NODE_ENV === "production") fatal.push(msg);
    else warn.push(msg);
  }
  // SAAS sends transactional emails (verify / reset / invite) whose links are
  // built from PUBLIC_BASE_URL.
  if (isSaas && !cfg.PUBLIC_BASE_URL) {
    fatal.push(
      "APP_MODE=saas requires PUBLIC_BASE_URL so verification / reset / invite links resolve."
    );
  }
  return { fatal, warn };
}

{
  const { fatal, warn } = validateEnvConfig(raw);
  for (const w of warn) process.stderr.write(`[ENV] warning: ${w}\n`);
  if (fatal.length > 0) {
    process.stderr.write(
      "\n[ENV] Server cannot start — invalid environment configuration:\n"
    );
    for (const f of fatal) process.stderr.write(`  ✗ ${f}\n`);
    process.stderr.write("\nCheck your .env file against .env.example\n\n");
    process.exit(1);
  }
}

export const ENV = {
  appMode: raw.APP_MODE,
  isSaas: raw.APP_MODE === "saas",
  billingProvider: raw.BILLING_PROVIDER,
  rateLimitEnabled:
    raw.RATE_LIMIT_ENABLED !== "false" && raw.NODE_ENV !== "test",
  appId: raw.VITE_APP_ID,
  cookieSecret: raw.JWT_SECRET,
  databaseUrl: raw.DATABASE_URL,
  oAuthServerUrl: raw.OAUTH_SERVER_URL,
  ownerOpenId: raw.OWNER_OPEN_ID,
  isProduction: raw.NODE_ENV === "production",
  forgeApiUrl: raw.BUILT_IN_FORGE_API_URL,
  forgeApiKey: raw.BUILT_IN_FORGE_API_KEY,
  storageBackend: raw.STORAGE_BACKEND,
  storageDir: raw.STORAGE_DIR,
  googleClientId: raw.GOOGLE_CLIENT_ID,
  googleClientSecret: raw.GOOGLE_CLIENT_SECRET,
  googleOAuthRedirectUri: raw.GOOGLE_OAUTH_REDIRECT_URI,
  adminSetupToken: raw.ADMIN_SETUP_TOKEN,
  noAuth: raw.NO_AUTH === "true",
  seedMockData: raw.SEED_MOCK_DATA === "true",
  autoMigrate: raw.AUTO_MIGRATE !== "false",
  publicBaseUrl: raw.PUBLIC_BASE_URL,
  smtpHost: raw.SMTP_HOST,
  smtpPort: raw.SMTP_PORT,
  smtpUser: raw.SMTP_USER,
  smtpPass: raw.SMTP_PASS,
  smtpFrom: raw.SMTP_FROM,
  telegramBotToken: raw.TELEGRAM_BOT_TOKEN,
  telegramWebhookSecret: raw.TELEGRAM_WEBHOOK_SECRET,
  vapidPublicKey: raw.VAPID_PUBLIC_KEY,
  vapidPrivateKey: raw.VAPID_PRIVATE_KEY,
  vapidSubject: raw.VAPID_SUBJECT,
  whatsappPhoneNumberId: raw.WHATSAPP_PHONE_NUMBER_ID,
  whatsappAccessToken: raw.WHATSAPP_ACCESS_TOKEN,
  whatsappApiVersion: raw.WHATSAPP_API_VERSION,
  // Parsed, typed observability configuration. Built in observability/config.ts
  // (self-contained, process.env-driven) so the logging stack never depends on
  // ENV being fully constructed. The zod fields above validate/document them.
  observability: obsConfig,
};
