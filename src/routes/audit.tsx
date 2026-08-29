import { createFileRoute } from "@tanstack/react-router";
import { useDataset } from "@/store/dataset-context";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollText, Gauge, RefreshCw, Filter } from "lucide-react";
import { listAudit, type AuditEvent } from "@/lib/audit.functions";
import { listTelemetryRuns, type TelemetryRun } from "@/lib/telemetry.functions";
import { getSessionId } from "@/lib/session";
import { formatMs } from "@/lib/processing-telemetry";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit & Telemetry — DataIQ Pro" },
      {
        name: "description",
        content: "Review activity history and dataset processing performance over time.",
      },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const [tab, setTab] = useState<"activity" | "telemetry">("activity");
  return (
    <div className="flex flex-col gap-6 min-h-[calc(100vh-6rem)]">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Audit &amp; Telemetry</h1>
        <p className="text-muted-foreground text-sm mt-1">
          A durable, server-backed log of every upload, analysis, export, and code-generation action
          — plus processing performance over time.
        </p>
      </div>
      <div className="neo p-1 flex gap-1 rounded-xl w-fit">
        <TabBtn
          active={tab === "activity"}
          onClick={() => setTab("activity")}
          icon={<ScrollText className="size-4" />}
          label="Activity Log"
        />
        <TabBtn
          active={tab === "telemetry"}
          onClick={() => setTab("telemetry")}
          icon={<Gauge className="size-4" />}
          label="Performance"
        />
      </div>
      {tab === "activity" ? <ActivityLog /> : <TelemetryLog />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${active ? "neo-inset text-primary" : "text-muted-foreground hover:text-foreground"}`}
    >
      {icon}
      {label}
    </button>
  );
}

const inputCls =
  "neo-inset px-3 py-1.5 text-xs bg-transparent rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-primary";

function ActivityLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAudit({
        data: {
          sessionId: getSessionId(),
          action: action || undefined,
          since: since ? new Date(since).toISOString() : undefined,
          until: until ? new Date(until + "T23:59:59").toISOString() : undefined,
          limit: 300,
        },
      });
      setEvents(res && res.ok ? res.events : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [action, since, until]);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo(() => Array.from(new Set(events.map((e) => e.action))).sort(), [events]);

  return (
    <div className="space-y-4">
      <div className="neo p-3 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Filter className="size-3.5" /> Filters
        </div>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-muted-foreground">
          Action
          <select value={action} onChange={(e) => setAction(e.target.value)} className={inputCls}>
            <option value="">All</option>
            {["upload", "upload_resumed", "analysis", "export", "codegen", "pdf_report", ...actions]
              .filter((v, i, a) => a.indexOf(v) === i)
              .map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-muted-foreground">
          From
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-muted-foreground">
          To
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className={inputCls}
          />
        </label>
        <button
          onClick={() => void load()}
          className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-primary ml-auto"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="neo overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 font-medium">Time</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Target</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-border/50 hover:bg-muted/10">
                <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="p-3 font-semibold">{e.action}</td>
                <td className="p-3 text-muted-foreground">{e.role}</td>
                <td
                  className="p-3 text-muted-foreground max-w-[220px] truncate"
                  title={e.target ?? ""}
                >
                  {e.target ?? "—"}
                </td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${e.status === "denied" ? "bg-destructive/15 text-destructive" : e.status === "error" ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}
                  >
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
            {!events.length && !loading && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  No activity recorded yet. Upload a dataset or run an export to populate this log.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TelemetryLog() {
  const { dataset } = useDataset();
  const [runs, setRuns] = useState<TelemetryRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataName, setDataName] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTelemetryRuns({
        data: {
          sessionId: getSessionId(),
          dataset: dataName || undefined,
          since: since ? new Date(since).toISOString() : undefined,
          until: until ? new Date(until + "T23:59:59").toISOString() : undefined,
          limit: 300,
        },
      });
      setRuns(res && res.ok ? res.runs : []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [dataName, since, until]);

  useEffect(() => {
    void load();
  }, [load]);

  const avg = useMemo(() => {
    if (!runs.length) return null;
    const total = runs.reduce((s, r) => s + r.total_ms, 0) / runs.length;
    const rps = runs.reduce((s, r) => s + r.rows_per_sec, 0) / runs.length;
    return { total, rps };
  }, [runs]);

  return (
    <div className="space-y-4">
      <div className="neo p-3 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Filter className="size-3.5" /> Filters
        </div>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-muted-foreground">
          Dataset
          <input
            value={dataName}
            onChange={(e) => setDataName(e.target.value)}
            placeholder={dataset?.name ?? "name contains…"}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-muted-foreground">
          From
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase text-muted-foreground">
          To
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className={inputCls}
          />
        </label>
        <button
          onClick={() => void load()}
          className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-primary ml-auto"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {avg && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Runs" value={String(runs.length)} />
          <Stat label="Avg total time" value={formatMs(avg.total)} />
          <Stat label="Avg throughput" value={`${Math.round(avg.rps).toLocaleString()} rows/s`} />
        </div>
      )}

      <div className="neo overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 font-medium">Time</th>
              <th className="p-3 font-medium">Dataset</th>
              <th className="p-3 font-medium text-right">Rows</th>
              <th className="p-3 font-medium text-right">Total</th>
              <th className="p-3 font-medium text-right">Rows/s</th>
              <th className="p-3 font-medium">Stage breakdown</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted/10 align-top">
                <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="p-3 font-semibold max-w-[180px] truncate" title={r.dataset_name}>
                  {r.dataset_name}
                  {r.resumed && <span className="ml-1 text-[9px] text-amber-500">(resumed)</span>}
                </td>
                <td className="p-3 text-right font-mono">{r.row_count.toLocaleString()}</td>
                <td className="p-3 text-right font-mono">{formatMs(r.total_ms)}</td>
                <td className="p-3 text-right font-mono">{r.rows_per_sec.toLocaleString()}</td>
                <td className="p-3">
                  <div className="flex gap-1.5 flex-wrap">
                    {(r.stages ?? []).map((s) => (
                      <span
                        key={s.id}
                        className="neo-sm px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {s.label}: {formatMs(s.ms)}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!runs.length && !loading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No processing runs recorded yet. Upload a dataset to capture timing telemetry.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="neo p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
