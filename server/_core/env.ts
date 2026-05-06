import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  VITE_APP_ID: z.string().default(""),
  OAUTH_SERVER_URL: z.string().default(""),
  OWNER_OPEN_ID: z.string().default(""),
  BUILT_IN_FORGE_API_URL: z.string().default(""),
  BUILT_IN_FORGE_API_KEY: z.string().default(""),
  NO_AUTH: z.string().default("false"),
  SEED_MOCK_DATA: z.string().default("false"),
  PORT: z.string().default("3005"),
  HOST: z.string().default("0.0.0.0"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n[ENV] Server cannot start — missing or invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  ✗ ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nCheck your .env file against .env.example\n");
  process.exit(1);
}

const raw = parsed.data;

export const ENV = {
  appId:         raw.VITE_APP_ID,
  cookieSecret:  raw.JWT_SECRET,
  databaseUrl:   raw.DATABASE_URL,
  oAuthServerUrl: raw.OAUTH_SERVER_URL,
  ownerOpenId:   raw.OWNER_OPEN_ID,
  isProduction:  raw.NODE_ENV === "production",
  forgeApiUrl:   raw.BUILT_IN_FORGE_API_URL,
  forgeApiKey:   raw.BUILT_IN_FORGE_API_KEY,
  noAuth:        raw.NO_AUTH === "true",
  seedMockData:  raw.SEED_MOCK_DATA === "true",
};
