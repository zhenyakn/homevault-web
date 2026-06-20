import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Download, RefreshCw, Pause, Play } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
type Level = (typeof LEVELS)[number];

function errMessage(e: unknown): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : "Something went wrong";
}

const LEVEL_CLASS: Record<string, string> = {
  trace: "bg-muted text-muted-foreground",
  debug: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  info: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  warn: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  error: "bg-red-500/15 text-red-600 dark:text-red-400",
  fatal: "bg-red-600 text-white",
};

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDur(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

type SubTab = "logs" | "traces" | "metrics";

export default function ObservabilityTab() {
  const { t } = useTranslation();
  const [sub, setSub] = useState<SubTab>("logs");
  const tabs: SubTab[] = ["logs", "traces", "metrics"];
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {tabs.map(key => (
          <button
            key={key}
            onClick={() => setSub(key)}
            className={`px-3 py-1.5 text-sm rounded-md ${
              sub === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t(`admin.observability.${key}`)}
          </button>
        ))}
      </div>
      {sub === "logs" && <LogsPanel />}
      {sub === "traces" && <TracesPanel />}
      {sub === "metrics" && <MetricsPanel />}
    </div>
  );
}

// ── Logs ──────────────────────────────────────────────────────────────────────
function LogsPanel() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [minLevel, setMinLevel] = useState<Level>("trace");
  const [namespace, setNamespace] = useState<string>("__all");
  const [search, setSearch] = useState("");
  const [live, setLive] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const levels = trpc.admin.observability.logs.levels.useQuery();
  const files = trpc.admin.observability.logs.files.useQuery();
  const logs = trpc.admin.observability.logs.list.useQuery(
    {
      minLevel,
      namespace: namespace === "__all" ? undefined : namespace,
      search: search.trim() || undefined,
      limit: 300,
    },
    { refetchInterval: live ? 3000 : false }
  );

  const setLevel = trpc.admin.observability.logs.setLevel.useMutation({
    onSuccess: () => {
      utils.admin.observability.logs.levels.invalidate();
      toast.success(t("admin.observability.levelUpdated"));
    },
    onError: e => toast.error(errMessage(e)),
  });

  const records = logs.data?.records ?? [];

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("admin.observability.minLevel")}>
          <Select value={minLevel} onValueChange={v => setMinLevel(v as Level)}>
            <SelectTrigger className="w-28 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map(l => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t("admin.observability.namespace")}>
          <Select value={namespace} onValueChange={setNamespace}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("admin.observability.all")}</SelectItem>
              {(levels.data?.namespaces ?? []).map(ns => (
                <SelectItem key={ns} value={ns}>
                  {ns}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t("admin.observability.search")}>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("admin.observability.searchPlaceholder")}
            className="w-56 h-9"
          />
        </Field>

        <div className="flex gap-1 ms-auto">
          <Button
            variant={live ? "default" : "outline"}
            size="sm"
            onClick={() => setLive(v => !v)}
          >
            {live ? (
              <Pause className="w-4 h-4 me-1" />
            ) : (
              <Play className="w-4 h-4 me-1" />
            )}
            {live ? t("admin.observability.live") : t("admin.observability.paused")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => logs.refetch()}
            disabled={logs.isFetching}
          >
            <RefreshCw
              className={`w-4 h-4 ${logs.isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Runtime level + diagnostics */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {t("admin.observability.globalLevel")}:
          <Select
            value={levels.data?.level ?? "info"}
            onValueChange={v => setLevel.mutate({ level: v })}
          >
            <SelectTrigger className="w-24 h-7">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["silent", ...LEVELS].map(l => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
        {levels.data && (
          <>
            <span>
              {t("admin.observability.sampling")}:{" "}
              {Math.round((levels.data.sampleRate ?? 1) * 100)}%
            </span>
            <span>
              {t("admin.observability.buffered")}: {records.length}/
              {levels.data.bufferSize}
            </span>
            {levels.data.droppedLogs > 0 && (
              <span className="text-amber-600">
                {t("admin.observability.dropped")}: {levels.data.droppedLogs}
              </span>
            )}
          </>
        )}
      </div>

      {/* Log table */}
      <Card>
        <CardContent className="p-0 divide-y font-mono text-xs max-h-[60vh] overflow-auto">
          {logs.isLoading && (
            <div className="py-6 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!logs.isLoading && records.length === 0 && (
            <p className="py-6 text-center text-muted-foreground">
              {t("admin.observability.noLogs")}
            </p>
          )}
          {records
            .slice()
            .reverse()
            .map(r => (
              <div
                key={r.seq}
                className="px-3 py-1.5 hover:bg-muted/50 cursor-pointer"
                onClick={() => setExpanded(expanded === r.seq ? null : r.seq)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground shrink-0">
                    {fmtTime(r.time)}
                  </span>
                  <Badge
                    className={`${LEVEL_CLASS[r.level]} uppercase shrink-0 px-1.5 py-0`}
                  >
                    {r.level}
                  </Badge>
                  {r.namespace && (
                    <span className="text-primary shrink-0">{r.namespace}</span>
                  )}
                  <span className="truncate">{r.msg}</span>
                  {r.tenantId != null && (
                    <span className="ms-auto shrink-0 text-muted-foreground">
                      t{r.tenantId}
                    </span>
                  )}
                </div>
                {expanded === r.seq && (
                  <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-muted-foreground bg-muted/40 rounded p-2">
                    {JSON.stringify(
                      {
                        requestId: r.requestId,
                        traceId: r.traceId,
                        userId: r.userId,
                        tenantId: r.tenantId,
                        route: r.route,
                        ...r.fields,
                      },
                      null,
                      2
                    )}
                  </pre>
                )}
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Log files */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">
            {t("admin.observability.logFiles")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {!files.data?.enabled && (
            <p className="text-muted-foreground text-xs">
              {t("admin.observability.fileLoggingDisabled")}
            </p>
          )}
          {files.data?.enabled && files.data.files.length === 0 && (
            <p className="text-muted-foreground text-xs">
              {t("admin.observability.noFiles")}
            </p>
          )}
          {(files.data?.files ?? []).map(f => (
            <div
              key={f.name}
              className="flex items-center justify-between gap-2"
            >
              <span className="font-mono text-xs truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground ms-auto">
                {(f.bytes / 1024).toFixed(0)} KB
              </span>
              <a
                href={`/api/admin/logs/download?file=${encodeURIComponent(f.name)}`}
              >
                <Button variant="ghost" size="sm">
                  <Download className="w-4 h-4" />
                </Button>
              </a>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Traces ────────────────────────────────────────────────────────────────────
function TracesPanel() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const traces = trpc.admin.observability.traces.list.useQuery(
    { limit: 100 },
    { refetchInterval: 4000 }
  );
  const detail = trpc.admin.observability.traces.get.useQuery(
    { traceId: selected ?? "" },
    { enabled: !!selected }
  );

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">
            {t("admin.observability.recentTraces")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y max-h-[60vh] overflow-auto">
          {traces.data?.length === 0 && (
            <p className="py-6 text-center text-muted-foreground text-sm">
              {t("admin.observability.noTraces")}
            </p>
          )}
          {(traces.data ?? []).map(tr => (
            <button
              key={tr.traceId}
              onClick={() => setSelected(tr.traceId)}
              className={`w-full text-start px-3 py-2 hover:bg-muted/50 ${
                selected === tr.traceId ? "bg-muted" : ""
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    tr.status === "error" ? "bg-red-500" : "bg-green-500"
                  }`}
                />
                <span className="font-mono truncate">{tr.rootName}</span>
                <span className="ms-auto text-xs text-muted-foreground shrink-0">
                  {fmtDur(tr.durationMs)} · {tr.spanCount}
                  {t("admin.observability.spansSuffix")}
                </span>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">
            {t("admin.observability.traceDetail")}
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-[60vh] overflow-auto">
          {!selected && (
            <p className="text-muted-foreground text-sm">
              {t("admin.observability.selectTrace")}
            </p>
          )}
          {selected && detail.isLoading && (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          )}
          {detail.data && (
            <div className="space-y-3">
              <div className="space-y-1">
                {detail.data.spans.map(s => (
                  <div key={s.spanId} className="text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          s.status === "error"
                            ? "text-red-500"
                            : "text-foreground"
                        }
                      >
                        {s.parentSpanId ? "└ " : ""}
                        {s.name}
                      </span>
                      <span className="ms-auto text-muted-foreground">
                        {fmtDur(s.durationMs ?? 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2">
                <p className="text-xs font-semibold mb-1">
                  {t("admin.observability.correlatedLogs")}
                </p>
                {detail.data.logs.map(l => (
                  <div key={l.seq} className="text-[11px] font-mono">
                    <Badge
                      className={`${LEVEL_CLASS[l.level]} uppercase px-1 py-0 me-1`}
                    >
                      {l.level}
                    </Badge>
                    {l.msg}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Metrics ───────────────────────────────────────────────────────────────────
function MetricsPanel() {
  const { t } = useTranslation();
  const m = trpc.admin.observability.metrics.summary.useQuery(undefined, {
    refetchInterval: 5000,
  });

  if (m.isLoading || !m.data) {
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const d = m.data;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label={t("admin.observability.totalRequests")} value={d.totalRequests} />
        <Stat
          label={t("admin.observability.errorRate")}
          value={`${(d.errorRate * 100).toFixed(1)}%`}
          warn={d.errorRate > 0.05}
        />
        <Stat label="p95" value={fmtDur(d.latency.p95)} />
        <Stat label="p99" value={fmtDur(d.latency.p99)} />
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">
            {t("admin.observability.topRoutes")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y text-sm">
          {d.topRoutes.length === 0 && (
            <p className="py-6 text-center text-muted-foreground">
              {t("admin.observability.noData")}
            </p>
          )}
          {d.topRoutes.map(r => (
            <div
              key={`${r.transport}:${r.route}`}
              className="flex items-center gap-2 px-3 py-2"
            >
              <Badge variant="outline" className="shrink-0">
                {r.transport}
              </Badge>
              <span className="font-mono truncate">{r.route}</span>
              <span className="ms-auto text-muted-foreground shrink-0">
                {r.count} · p95 {fmtDur(r.p95)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      {!d.endpointEnabled && (
        <p className="text-xs text-muted-foreground">
          {t("admin.observability.metricsEndpointHint")}
        </p>
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-2xl font-semibold ${warn ? "text-red-600" : ""}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
