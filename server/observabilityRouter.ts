/**
 * Observability console API.
 *
 * Two access tiers:
 *  - `observabilityRouter` (super-admin): full visibility — every log line,
 *    trace, metric, the live log files, and runtime level control.
 *  - `tenantLogsRouter` (tenant admin): the same log viewer scoped to the
 *    caller's active tenant, so a workspace owner can debug their own activity
 *    without seeing the rest of the instance.
 *
 * The live data comes from the in-memory ring buffers (logStore / trace
 * buffer); the durable record is the rotating log files, downloadable via
 * logsRoute.ts.
 */

import { z } from "zod";
import {
  router,
  superAdminProcedure,
  tenantAdminProcedure,
} from "./_core/trpc";
import { obsConfig } from "./_core/observability/config";
import {
  logStore,
  listLogFiles,
  recentTraces,
  getTrace,
  metricsSummary,
  getLevel,
  setLevel,
  setNamespaceLevel,
  getNamespaceLevels,
  knownNamespaces,
  droppedLogCount,
  LEVELS,
  isLevelSetting,
  type LogQuery,
} from "./_core/observability";
import * as db from "./db";

const levelEnum = z.enum(LEVELS);
const levelSettingSchema = z
  .string()
  .refine(isLevelSetting, "invalid log level");

const logQueryInput = z.object({
  minLevel: levelEnum.optional(),
  namespace: z.string().max(64).optional(),
  search: z.string().max(200).optional(),
  requestId: z.string().max(64).optional(),
  traceId: z.string().max(64).optional(),
  userId: z.number().int().optional(),
  afterSeq: z.number().int().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const observabilityRouter = router({
  // ── Logs ────────────────────────────────────────────────────────────────
  logs: router({
    list: superAdminProcedure
      .input(logQueryInput.extend({ tenantId: z.number().int().optional() }))
      .query(({ input }) => {
        const q: LogQuery = { ...input, limit: input.limit ?? 200 };
        return {
          records: logStore.query(q),
          lastSeq: logStore.lastSeq,
        };
      }),

    namespaces: superAdminProcedure.query(() => ({
      inBuffer: logStore.namespaces(),
      configured: knownNamespaces(),
    })),

    files: superAdminProcedure.query(() => ({
      enabled: obsConfig.file.enabled,
      dir: obsConfig.file.dir,
      files: obsConfig.file.enabled ? listLogFiles(obsConfig.file.dir) : [],
    })),

    // Runtime level state (global + per-namespace overrides).
    levels: superAdminProcedure.query(() => ({
      available: LEVELS,
      level: getLevel(),
      namespaceOverrides: getNamespaceLevels(),
      namespaces: knownNamespaces(),
      sampleRate: obsConfig.sampleRate,
      bufferSize: obsConfig.bufferSize,
      droppedLogs: droppedLogCount(),
    })),

    setLevel: superAdminProcedure
      .input(z.object({ level: levelSettingSchema }))
      .mutation(async ({ ctx, input }) => {
        setLevel(input.level as never);
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.observability.set_level",
          metadata: { level: input.level },
        });
        return { success: true as const, level: getLevel() };
      }),

    setNamespaceLevel: superAdminProcedure
      .input(
        z.object({
          namespace: z.string().min(1).max(64),
          level: levelSettingSchema.nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        setNamespaceLevel(input.namespace, input.level as never);
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.observability.set_namespace_level",
          metadata: { namespace: input.namespace, level: input.level },
        });
        return { success: true as const };
      }),
  }),

  // ── Traces ──────────────────────────────────────────────────────────────
  traces: router({
    list: superAdminProcedure
      .input(
        z
          .object({ limit: z.number().int().min(1).max(500).optional() })
          .optional()
      )
      .query(({ input }) => recentTraces(input?.limit ?? 100)),

    // One trace's spans + the log lines correlated to it (the drill-down view).
    get: superAdminProcedure
      .input(z.object({ traceId: z.string().min(1).max(64) }))
      .query(({ input }) => ({
        spans: getTrace(input.traceId),
        logs: logStore.query({ traceId: input.traceId, limit: 500 }),
      })),
  }),

  // ── Metrics ─────────────────────────────────────────────────────────────
  metrics: router({
    summary: superAdminProcedure.query(() => ({
      ...metricsSummary(),
      endpointEnabled: obsConfig.metrics.endpointEnabled,
    })),
  }),
});

/**
 * Tenant-scoped log viewer for tenant admins. Hard-filters every query to the
 * caller's active tenant — a tenant admin can never widen the scope.
 */
export const tenantLogsRouter = router({
  list: tenantAdminProcedure.input(logQueryInput).query(({ ctx, input }) => {
    const q: LogQuery = {
      ...input,
      tenantId: ctx.tenantId, // enforced server-side, ignores any client value
      limit: input.limit ?? 200,
    };
    return { records: logStore.query(q), lastSeq: logStore.lastSeq };
  }),
});
