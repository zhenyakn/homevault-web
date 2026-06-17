import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import net from "net";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { uploadRouter } from "../uploadRoute";
import { filesRouter } from "../filesRoute";
import { googleDriveRouter } from "../googleDriveRoute";
import { storageRouter } from "../storageRoute";
import { exportRouter } from "../exportRoute";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";
import { csrfIssueMiddleware } from "./csrf";
import * as db from "../db";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";
import { logger } from "./logger";
import { webhookCallback } from "grammy";
import { getBot } from "../bot/telegram";
import { startReminderScheduler } from "../notifications/scheduler";
import { runMigrations } from "./migrate";

// Rate limiters. NODE_ENV=test bypasses all of these so the test suite isn't
// throttled — the limit logic itself is unit-tested in its own file.
const skipInTest = () => process.env.NODE_ENV === "test";

// Auth endpoints: strict — 20 requests per 15 minutes (brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    error: "Too many authentication attempts, please try again later.",
  },
});

// General API: generous — 300 requests per minute per IP (single-household usage)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: "Too many requests, please slow down." },
});

// Upload: 30/min/IP — bounded by the 16MB cap and the in-process semaphore
// in uploadRoute.ts. Pair-of-suspenders against a remote attacker spinning
// up memory-storage churn.
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: "Too many upload attempts, please slow down." },
});

// /api/files/* — generous (300/min) for legitimate page-load attachment fans.
const filesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: "Too many file requests." },
});

// Google Drive setup endpoints — strict. These touch external OAuth and should
// never see legitimate burst traffic.
const gdriveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: "Too many Drive setup attempts, please try again later." },
});

// /api/storage/* — admin storage-backend configuration. Same envelope as the
// Drive setup endpoints: infrequent, admin-only, sensitive.
const storageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    error: "Too many storage setup attempts, please try again later.",
  },
});

// /api/export/* — very strict. Each request opens N parallel Drive downloads
// and produces a multi-MB ZIP, so it's an expensive operation.
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: "Please wait before requesting another export." },
});

// ── Seed-only mode (called from run.sh before the HTTP server starts) ─────────
// Usage: node dist/index.js --seed-mock-only
// Finds (or creates) the owner user, seeds the mock property, then exits.
if (process.argv.includes("--seed-mock-only")) {
  (async () => {
    try {
      const openId = ENV.ownerOpenId || "owner";
      await db.upsertUser({
        openId,
        name: "HomeVault Admin",
        email: "admin@local",
        role: "admin",
        lastSignedIn: new Date(),
      });
      const user = await db.getUserByOpenId(openId);
      if (!user) throw new Error("Could not find or create owner user");
      // Ensure the owner has a tenant, then seed the demo data into it.
      const { tenantId } = await db.ensurePersonalTenant(user.id, user.name);
      const propertyId = await db.seedMockProperty(user.id, tenantId);
      logger.info(
        { propertyId },
        "[Seed] Demo property created/updated. Exiting."
      );
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "[Seed] Failed");
      process.exit(1);
    }
  })();
} else {
  startServer().catch(err => logger.error({ err }, "Server startup failed"));
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3005): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function hasSessionCookie(cookieHeader?: string): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .some(part => part.trim().startsWith(`${COOKIE_NAME}=`));
}

async function startServer() {
  // Apply pending DB migrations before serving, so every deployment converges
  // on the current schema with no manual step. Skipped under test, and opt-out
  // via AUTO_MIGRATE=false (the HA add-on migrates in run.sh instead). Fail fast
  // rather than serve against a half-migrated schema.
  if (process.env.NODE_ENV !== "test" && ENV.autoMigrate) {
    try {
      await runMigrations({ log: msg => logger.info(msg) });
      logger.info("[migrate] boot migration complete");
    } catch (err) {
      logger.error(
        { err },
        "[migrate] boot migration failed — aborting startup"
      );
      process.exit(1);
    }
  }

  const app = express();
  const server = createServer(app);

  // HomeVault is meant to run behind a single reverse proxy: the Home Assistant
  // ingress, an nginx/caddy in front of the Docker container, or Cloudflare.
  // Trusting exactly one hop lets every rate limiter use the real client IP
  // from X-Forwarded-For, and makes req.ip / req.secure / req.protocol reflect
  // what the user's browser actually used. The numeric `1` is deliberate —
  // setting `true` would let a malicious client chain its own XFF values to
  // forge an arbitrary source IP.
  app.set("trust proxy", 1);

  // Tight body limits — none of HomeVault's JSON endpoints need more than
  // a few KB. File uploads go through multer (multipart) and don't traverse
  // express.json. The previous 50mb limit was a wide-open DoS vector.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // Defense-in-depth headers. The strictest headers (CSP / nosniff / CORP)
  // for proxied file downloads are set per-response in filesRoute.ts; what
  // helmet provides here is the global baseline (HSTS in prod, X-Frame-
  // Options=DENY, Referrer-Policy=no-referrer, etc).
  //
  // Dev keeps CSP off because Vite HMR uses ws:// + eval; production gets a
  // tight policy that covers the bundled SPA, Radix UI's inline styles, and
  // the Google Maps script if it's loaded. The per-route CSP in
  // filesRoute.ts (`default-src 'none'; sandbox; …`) is still the tightest
  // layer for any byte we let the user retrieve.
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production"
          ? {
              useDefaults: true,
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "https://maps.googleapis.com"],
                styleSrc: ["'self'", "'unsafe-inline'"], // Radix UI inline styles
                imgSrc: ["'self'", "data:", "blob:", "https:"],
                connectSrc: ["'self'", "https://maps.googleapis.com"],
                fontSrc: ["'self'", "data:"],
                frameSrc: ["'self'"],
                // Same-origin framing allowed so the addon renders inside the
                // Home Assistant UI's <iframe src="…/api/hassio_ingress/…">.
                // Both the HA UI and the ingress proxy are served from the same
                // origin, so 'self' lets HA embed us while still blocking
                // cross-origin clickjacking.
                frameAncestors: ["'self'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                objectSrc: ["'none'"],
                // Explicitly disable `upgrade-insecure-requests`.
                //
                // The HA addon is commonly proxied through Home Assistant on
                // plain HTTP (e.g. http://homeassistant.local:8123). With the
                // directive enabled the browser rewrites every subresource URL
                // — including the addon's own bundled JS/CSS — to https://,
                // which fails the TLS handshake on HTTP installs and leaves
                // users with a white/black blank page.
                //
                // `useDefaults: true` (above) MERGES our directives with
                // helmet's defaults, and helmet's default CSP includes
                // `upgrade-insecure-requests`. Simply omitting the key here
                // leaves the default in place — to actually drop a default
                // directive we have to set it to `null` per helmet's docs.
                //
                // `'self'` on script/style/connect already prevents mixed-
                // content downgrades from arbitrary origins; adding upgrade-
                // insecure-requests on top breaks more than it protects when
                // the operator's HA is HTTP-only.
                upgradeInsecureRequests: null,
              },
            }
          : false,
      crossOriginEmbedderPolicy: false, // breaks Google Maps iframe
      referrerPolicy: { policy: "no-referrer" },
    })
  );

  // CSRF cookie issuance is global — every response sees the cookie so the
  // SPA can read it. The verification middleware is opt-in per state-
  // changing route (uploadRoute, filesRoute DELETE, googleDriveRoute POST).
  app.use(csrfIssueMiddleware);

  app.use("/api/trpc/auth", authLimiter);
  app.use("/api/trpc", apiLimiter);
  app.use("/api/upload", uploadLimiter);
  app.use("/api/files", filesLimiter);
  app.use("/api/google-drive", gdriveLimiter);
  app.use("/api/storage", storageLimiter);
  app.use("/api/export", exportLimiter);

  registerOAuthRoutes(app);
  app.use(uploadRouter);
  app.use(filesRouter);
  app.use(googleDriveRouter);
  app.use(storageRouter);
  app.use(exportRouter);

  // Telegram bot webhook. Registered only when a bot token is configured; the
  // secret token (when set) is verified by grammy against the
  // X-Telegram-Bot-Api-Secret-Token header.
  const telegramBot = getBot();
  if (telegramBot) {
    app.post(
      "/api/bot/telegram",
      webhookCallback(telegramBot, "express", {
        secretToken: ENV.telegramWebhookSecret || undefined,
      })
    );
    logger.info("[telegram] webhook registered at /api/bot/telegram");
  }

  // Dev-only login bypass — keeps existing dev-server behavior unchanged
  if (process.env.NODE_ENV === "development") {
    app.post("/api/dev/login", authLimiter, async (req, res) => {
      try {
        const openId = ENV.ownerOpenId || "local-admin";
        await db.upsertUser({
          openId,
          name: "Dev Admin",
          email: "dev@localhost",
          role: "admin",
          lastSignedIn: new Date(),
        });
        const token = await sdk.createSessionToken(openId, {
          name: "Dev Admin",
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, token, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        res.json({ ok: true });
      } catch (err) {
        logger.error({ err }, "[Dev Login] Failed");
        res.status(500).json({ error: String(err) });
      }
    });
  }

  // No-auth mode for Home Assistant or other private environments
  if (ENV.noAuth) {
    logger.warn("[Auth] NO_AUTH mode enabled");
    app.use(async (req, res, next) => {
      try {
        if (!hasSessionCookie(req.headers.cookie)) {
          const openId = ENV.ownerOpenId || "owner";
          await db.upsertUser({
            openId,
            name: "HomeVault Admin",
            email: "admin@local",
            role: "admin",
            lastSignedIn: new Date(),
          });

          const token = await sdk.createSessionToken(openId, {
            name: "HomeVault Admin",
            expiresInMs: ONE_YEAR_MS,
          });

          const cookieOptions = getSessionCookieOptions(req);
          res.cookie(COOKIE_NAME, token, {
            ...cookieOptions,
            maxAge: ONE_YEAR_MS,
          });
        }
      } catch (err) {
        logger.error({ err }, "[NO_AUTH] Failed to create auto-session");
      }

      next();
    });
  }

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3005");
  const host = process.env.HOST || "0.0.0.0";
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logger.warn(
      { preferredPort, port },
      "Preferred port is busy, using alternative"
    );
  }

  server.listen(port, host, () => {
    logger.info({ host, port }, "Server running");
    // Start the daily reminder sweep (no-op under NODE_ENV=test).
    startReminderScheduler();
    // Best-effort: point Telegram at our webhook if a public URL is set.
    if (telegramBot && ENV.publicBaseUrl) {
      const url = `${ENV.publicBaseUrl.replace(/\/$/, "")}/api/bot/telegram`;
      telegramBot.api
        .setWebhook(url, {
          secret_token: ENV.telegramWebhookSecret || undefined,
        })
        .then(() => logger.info({ url }, "[telegram] webhook set"))
        .catch(err => logger.warn({ err }, "[telegram] failed to set webhook"));
    }
  });
}
