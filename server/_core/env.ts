export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  noAuth: process.env.NO_AUTH === "true",
  seedMockData: process.env.SEED_MOCK_DATA === "true",
  paperlessBaseUrl: process.env.PAPERLESS_BASE_URL ?? "",
  paperlessApiToken: process.env.PAPERLESS_API_TOKEN ?? "",
};
