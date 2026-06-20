/**
 * Prometheus scrape endpoint (`GET /metrics`).
 *
 * Off by default: only served when METRICS_ENDPOINT_ENABLED=true, and — when a
 * METRICS_TOKEN is set — gated by a bearer token so it can be exposed safely
 * beyond a trusted scrape network. The same RED metrics also feed the in-app
 * dashboard via tRPC; this endpoint is for an external Prometheus/OTel scraper.
 */

import { Router, type Request, type Response } from "express";
import { obsConfig } from "./_core/observability/config";
import { renderPrometheus } from "./_core/observability";
import { createLogger } from "./_core/logger";

const log = createLogger("metrics");

export const metricsRouter = Router();

metricsRouter.get("/metrics", (req: Request, res: Response) => {
  if (!obsConfig.metrics.endpointEnabled) {
    res.sendStatus(404);
    return;
  }
  const token = obsConfig.metrics.token;
  if (token) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}`) {
      log.warn({ ip: req.ip }, "rejected unauthenticated /metrics scrape");
      res.setHeader("WWW-Authenticate", "Bearer");
      res.sendStatus(401);
      return;
    }
  }
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(renderPrometheus());
});
