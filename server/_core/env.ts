import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
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
  PORT: z.string().default("3005"),
  HOST: z.string().default("0.0.0.0"),
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

export const ENV = {
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
};
