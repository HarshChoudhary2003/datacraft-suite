import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  BarChart3,
  Play,
  Download,
  FileText,
  Link2,
  Trash2,
  GitCompare,
  Gauge,
  Timer,
  Target,
  Database,
  Clock,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import { useDataset } from "@/store/dataset-context";
import { runBenchmark, type BenchRun } from "@/lib/benchmark";
import { loadRuns, saveRun, deleteRun, clearRuns, compareRuns } from "@/lib/benchmark-history";
import { downloadReportHTML, downloadReportPDF, buildShareLink } from "@/lib/benchmark-report";
import { CHART_COLORS, tooltipStyle, axisStyle, gridStyle } from "@/lib/chart-theme";

const verdictClass = (v: BenchRun["verdict"]) =>
  v === "EXCELLENT" ? "text-emerald-500" : v === "GOOD" ? "text-primary" : "text-amber-500";

const STAGGER = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { staggerChildren: 0.1 } },
};
const ITEM = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export function BenchmarksPage() {
  const { dataset } = useDataset();
  const [runs, setRuns] = useState<BenchRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; pct: number } | null>(null);
  const [selA, setSelA] = useState<string>("");
  const [selB, setSelB] = useState<string>("");

  useEffect(() => {
    setRuns(loadRuns());
  }, []);

  const latest = runs[0] ?? null;

  const run = async () => {
    if (!dataset) {
      toast.error("Load a dataset first");
      return;
    }
    setBusy(true);
    setProgress({ phase: "Starting…", pct: 1 });
    try {
      const result = await runBenchmark(dataset.name, dataset.rows, {
        onProgress: (phase, pct) => setProgress({ phase, pct }),
      });
      const next = saveRun(result);
      setRuns(next);
      toast.success(`Benchmark complete · ${result.verdict} · ${result.latency.p50}ms p50`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Benchmark failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const share = async (r: BenchRun) => {
    try {
      await navigator.clipboard.writeText(buildShareLink(r));
      toast.success("Shareable report link copied to clipboard");
    } catch {
      window.open(buildShareLink(r), "_blank");
    }
  };

  const remove = (id: string) => {
    setRuns(deleteRun(id));
    if (selA === id) setSelA("");
    if (selB === id) setSelB("");
  };

  const a = runs.find((r) => r.id === selA) ?? null;
  const b = runs.find((r) => r.id === selB) ?? null;
  const deltas = useMemo(() => (a && b ? compareRuns(a, b) : []), [a, b]);

  const trendData = useMemo(() => {
    return [...runs].reverse().map((r, i) => ({
      name: `Run ${i + 1}`,
      time: new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      p50: r.latency.p50,
      accuracy: Number((r.accuracy.score * 100).toFixed(1)),
    }));
  }, [runs]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 gradient-text">
            <BarChart3 className="size-8 text-primary" aria-hidden="true" /> Benchmarks
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Measure UI render-pipeline latency, readiness and model accuracy evidence on your
            dataset. Track historical performance trends over time.
          </p>
        </div>
        <button
          onClick={run}
          disabled={busy || !dataset}
          className="neo-btn px-6 py-3 font-bold text-primary flex items-center gap-2 disabled:opacity-50 hover:scale-[1.02] transition-transform shadow-md"
        >
          <Play className="size-5" aria-hidden="true" /> {busy ? "Running…" : "Run Benchmark"}
        </button>
      </header>

      {!dataset && (
        <div className="neo p-6 text-center text-sm text-muted-foreground">
          No dataset loaded.{" "}
          <Link to="/" className="text-primary font-semibold underline">
            Upload a file
          </Link>{" "}
          to run a benchmark.
        </div>
      )}

      {busy && progress && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="neo p-5 border-primary/20"
          role="status"
          aria-live="polite"
        >
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-primary animate-pulse">{progress.phase}</span>
            <span className="text-sm font-mono text-muted-foreground">
              {Math.round(progress.pct)}%
            </span>
          </div>
          <div className="h-3 rounded-full neo-inset overflow-hidden">
            <div
              className="h-full gradient-bg transition-all duration-300"
              style={{ width: `${Math.max(2, progress.pct)}%` }}
            />
          </div>
        </motion.div>
      )}

      {runs.length > 1 && (
        <motion.section variants={STAGGER} initial="hidden" animate="show" className="space-y-4">
          <motion.h2 variants={ITEM} className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="size-5 text-primary" /> Historical Trends
          </motion.h2>
          <div className="grid lg:grid-cols-2 gap-4">
            <motion.div variants={ITEM}>
              <ChartCard title="Latency Over Time (p50 ms)">
                <LineChart data={trendData}>
                  <CartesianGrid {...gridStyle} />
                  <XAxis dataKey="name" {...axisStyle} />
                  <YAxis {...axisStyle} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="p50"
                    stroke="var(--primary)"
                    strokeWidth={3}
                    dot={{ fill: "var(--primary)", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ChartCard>
            </motion.div>
            <motion.div variants={ITEM}>
              <ChartCard title="Accuracy Over Time (%)">
                <LineChart data={trendData}>
                  <CartesianGrid {...gridStyle} />
                  <XAxis dataKey="name" {...axisStyle} />
                  <YAxis domain={["auto", 100]} {...axisStyle} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="var(--chart-2)"
                    strokeWidth={3}
                    dot={{ fill: "var(--chart-2)", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ChartCard>
            </motion.div>
          </div>
        </motion.section>
      )}

      {latest && (
        <motion.section
          variants={STAGGER}
          initial="hidden"
          animate="show"
          aria-label="Latest run"
          className="space-y-5 border-t border-border/50 pt-6"
        >
          <motion.div variants={ITEM} className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Gauge className="size-5 text-primary" /> Latest Run Details
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadReportHTML(latest)}
                className="neo-btn px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 hover:text-primary transition-colors"
              >
                <Download className="size-3.5" aria-hidden="true" /> Download HTML
              </button>
              <button
                onClick={() => downloadReportPDF(latest)}
                className="neo-btn px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 hover:text-primary transition-colors"
              >
                <FileText className="size-3.5" aria-hidden="true" /> Download PDF
              </button>
              <button
                onClick={() => share(latest)}
                className="neo-btn px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 hover:text-primary transition-colors"
              >
                <Link2 className="size-3.5" aria-hidden="true" /> Copy link
              </button>
            </div>
          </motion.div>

          <motion.div
            variants={ITEM}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
          >
            <Stat
              icon={Gauge}
              label="Verdict"
              value={latest.verdict}
              className={verdictClass(latest.verdict)}
            />
            <Stat icon={Timer} label="p50 latency" value={`${latest.latency.p50}ms`} />
            <Stat icon={Clock} label="p99 latency" value={`${latest.latency.p99}ms`} />
            <Stat
              icon={Target}
              label="Accuracy"
              value={`${(latest.accuracy.score * 100).toFixed(1)}%`}
            />
            <Stat icon={Database} label="Rows" value={latest.rows.toLocaleString()} />
            <Stat icon={BarChart3} label="Readiness" value={`${latest.readiness}/100`} />
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-4">
            <motion.div variants={ITEM}>
              <ChartCard title="Latency percentiles (ms)">
                <BarChart
                  data={[
                    { name: "p50", ms: latest.latency.p50 },
                    { name: "p90", ms: latest.latency.p90 },
                    { name: "p99", ms: latest.latency.p99 },
                    { name: "max", ms: latest.latency.max },
                  ]}
                >
                  <CartesianGrid {...gridStyle} vertical={false} />
                  <XAxis dataKey="name" {...axisStyle} />
                  <YAxis {...axisStyle} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  />
                  <Bar
                    dataKey="ms"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={true}
                    animationDuration={800}
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>
            </motion.div>

            <motion.div variants={ITEM}>
              <ChartCard title="Per-stage pipeline (ms)">
                <BarChart
                  layout="vertical"
                  data={latest.stages.map((s) => ({ name: s.name.split(" ")[0], ms: s.ms }))}
                >
                  <CartesianGrid {...gridStyle} horizontal={false} />
                  <XAxis type="number" {...axisStyle} />
                  <YAxis type="category" dataKey="name" width={90} {...axisStyle} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  />
                  <Bar
                    dataKey="ms"
                    radius={[0, 6, 6, 0]}
                    isAnimationActive={true}
                    animationDuration={800}
                  >
                    {latest.stages.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>
            </motion.div>
          </div>

          <motion.div variants={ITEM} className="neo p-5">
            <h3 className="font-semibold text-sm mb-4">Correctness checks & accuracy evidence</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {latest.checks.map((c) => (
                <div
                  key={c.name}
                  className="flex items-start gap-3 text-sm neo-sm p-3 hover:bg-background/50 transition-colors"
                >
                  <span className="mt-0.5" aria-hidden="true">
                    {c.passed ? "✅" : "❌"}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.section>
      )}

      {/* Compare runs */}
      {runs.length >= 2 && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4 border-t border-border/50 pt-6"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitCompare className="size-5 text-primary" aria-hidden="true" /> Compare Runs
          </h2>
          <div className="grid sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
            <RunSelect label="Baseline (A)" runs={runs} value={selA} onChange={setSelA} />
            <ArrowRight
              className="hidden sm:block size-5 text-muted-foreground mx-auto"
              aria-hidden="true"
            />
            <RunSelect label="Candidate (B)" runs={runs} value={selB} onChange={setSelB} />
          </div>

          {a && b && a.id !== b.id ? (
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="neo overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border/50">
                      <th className="p-3">Metric</th>
                      <th className="p-3 text-right">Δ</th>
                      <th className="p-3 text-right">% change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deltas.map((d) => (
                      <tr key={d.label} className="border-b border-border/30">
                        <td className="p-3 font-medium">{d.label}</td>
                        <td
                          className={`p-3 text-right font-mono ${d.improved ? "text-emerald-500" : "text-red-500"}`}
                        >
                          {d.diff > 0 ? "+" : ""}
                          {d.diff}
                          {d.unit}
                        </td>
                        <td
                          className={`p-3 text-right font-mono ${d.improved ? "text-emerald-500" : "text-red-500"}`}
                        >
                          {d.pct > 0 ? "+" : ""}
                          {d.pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ChartCard title="Diverging Deltas (%)">
                <BarChart layout="vertical" data={deltas.filter((d) => Math.abs(d.pct) > 0)}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
                  <ReferenceLine x={0} stroke="var(--foreground)" opacity={0.5} />
                  <XAxis type="number" {...axisStyle} />
                  <YAxis type="category" dataKey="label" width={100} {...axisStyle} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  />
                  <Bar dataKey="pct" radius={4} isAnimationActive={true} animationDuration={500}>
                    {deltas
                      .filter((d) => Math.abs(d.pct) > 0)
                      .map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.improved ? "oklch(0.65 0.15 150)" : "oklch(0.6 0.15 20)"}
                        />
                      ))}
                  </Bar>
                </BarChart>
              </ChartCard>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground neo-sm p-4 text-center">
              Pick two different runs to visually compare their performance deltas.
            </p>
          )}
        </motion.section>
      )}

      {/* History */}
      {runs.length > 0 && (
        <section aria-label="Run history" className="space-y-3 border-t border-border/50 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="size-5 text-primary" aria-hidden="true" /> Run History Log
            </h2>
            <button
              onClick={() => {
                clearRuns();
                setRuns([]);
              }}
              className="neo-btn px-3 py-1.5 text-xs inline-flex items-center gap-1.5 outline-none hover:text-red-500 transition-colors"
            >
              <Trash2 className="size-3.5" aria-hidden="true" /> Clear all
            </button>
          </div>
          <div className="neo overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border/50">
                  <th className="p-3">When</th>
                  <th className="p-3">Dataset</th>
                  <th className="p-3 text-right">Rows</th>
                  <th className="p-3 text-right">p50</th>
                  <th className="p-3 text-right">p99</th>
                  <th className="p-3 text-right">Accuracy</th>
                  <th className="p-3">Verdict</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/30 hover:bg-background/30 transition-colors"
                  >
                    <td className="p-3 whitespace-nowrap">
                      {new Date(r.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3 max-w-[160px] truncate" title={r.datasetName}>
                      {r.datasetName}
                    </td>
                    <td className="p-3 text-right font-mono">{r.rows.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">{r.latency.p50}ms</td>
                    <td className="p-3 text-right font-mono">{r.latency.p99}ms</td>
                    <td className="p-3 text-right font-mono">
                      {(r.accuracy.score * 100).toFixed(1)}%
                    </td>
                    <td className={`p-3 font-semibold ${verdictClass(r.verdict)}`}>{r.verdict}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => downloadReportHTML(r)}
                          className="neo-btn p-1.5 hover:text-primary transition-colors"
                          title="HTML"
                        >
                          <Download className="size-3.5" />
                        </button>
                        <button
                          onClick={() => downloadReportPDF(r)}
                          className="neo-btn p-1.5 hover:text-primary transition-colors"
                          title="PDF"
                        >
                          <FileText className="size-3.5" />
                        </button>
                        <button
                          onClick={() => remove(r.id)}
                          className="neo-btn p-1.5 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="neo-sm p-4 hover:scale-[1.02] transition-transform">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className="size-4 text-primary/70" aria-hidden="true" />
        {label}
      </div>
      <div className={`text-xl font-black ${className ?? ""}`}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="neo p-5 hover:border-primary/20 transition-colors">
      <h3 className="font-semibold text-sm mb-4 text-foreground/90">{title}</h3>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function RunSelect({
  label,
  runs,
  value,
  onChange,
}: {
  label: string;
  runs: BenchRun[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block w-full">
      <span className="text-xs font-semibold text-muted-foreground ml-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full neo-inset px-4 py-2.5 text-sm bg-transparent rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
      >
        <option value="">Select a run to compare…</option>
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {new Date(r.timestamp).toLocaleTimeString()} — {r.datasetName}
          </option>
        ))}
      </select>
    </label>
  );
}
