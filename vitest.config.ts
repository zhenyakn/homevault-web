import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/**/*.test.ts",
    ],
    setupFiles: ["server/test-setup.ts"],
    // Integration tests (gated on TEST_DATABASE_URL) share a single MySQL
    // database, including global app_settings singletons (signups, app mode,
    // email-verification). Running their files in parallel races on that shared
    // state, so serialize files when a real DB is configured. Pure unit runs
    // (no TEST_DATABASE_URL) keep full file parallelism for speed.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
