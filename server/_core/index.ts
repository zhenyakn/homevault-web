import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { uploadRouter } from "../uploadRoute";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";
import * as db from "../db";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";
import { logger } from "./logger";

// Auth endpoints: strict — 20 requests per 15 minutes (brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
});

// General API: generous — 300 requests per minute per IP (single-household usage)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
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
      const propertyId = await db.seedMockProperty(user.id);
      logger.info({ propertyId }, "[Seed] Demo property created/updated. Exiting.");
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
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use("/api/trpc/auth", authLimiter);
  app.use("/api/trpc", apiLimiter);

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(uploadRouter);

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
        res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
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
    logger.warn({ preferredPort, port }, "Preferred port is busy, using alternative");
  }

  server.listen(port, host, () => {
    logger.info({ host, port }, "Server running");
  });
}
