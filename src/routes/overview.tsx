import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useDataset } from "@/store/dataset-context";
import {
  Database,
  AlertCircle,
  Table as TableIcon,
  Columns,
  Hash,
  List,
  AlertTriangle,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { CHART_COLORS, tooltipStyle, axisStyle, gridStyle } from "@/lib/chart-theme";
import { RoleDashboard } from "@/components/role-dashboard";
import { ProcessingTelemetryCard } from "@/components/processing-telemetry";

export const Route = createFileRoute("/overview")({
  head: () => ({ meta: [{ title: "Dataset Overview — DataIQ Pro" }] }),
  component: OverviewPage,
});

function NoData() {
  return (
    <div className="neo p-10 text-center">
      <AlertCircle className="size-10 mx-auto text-muted-foreground mb-3" />
      <p className="font-semibold">No dataset loaded</p>
      <Link to="/" className="mt-4 inline-block neo-btn px-5 py-2 text-sm font-semibold">
        Upload a CSV
      </Link>
    </div>
  );
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, bounce: 0, duration: 0.5 } },
};

function ScoreRing({ score }: { score: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-12 flex items-center justify-center shrink-0">
      <svg className="size-12 -rotate-90 drop-shadow-sm">
        <circle
          cx="24"
          cy="24"
          r={r}
          stroke="color-mix(in srgb, var(--border) 60%, transparent)"
          strokeWidth="4"
          fill="none"
        />
        <motion.circle
          cx="24"
          cy="24"
          r={r}
          stroke="var(--primary)"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (score / 100) * c }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      <span className="absolute text-xs font-black text-foreground">{score}</span>
    </div>
  );
}

function OverviewPage() {
  const { dataset, hydrated } = useDataset();
  const [searchCol, setSearchCol] = useState("");
  const [sortCol, setSortCol] = useState<{
    key: "name" | "type" | "missing" | "unique";
    dir: "asc" | "desc";
  } | null>(null);
  const [page, setPage] = useState(0);

  const filteredProfiles = useMemo(() => {
    if (!dataset) return [];
    let p = dataset.profiles.filter((x) => x.name.toLowerCase().includes(searchCol.toLowerCase()));
    if (sortCol) {
      p = [...p].sort((a, b) => {
        let valA = a[sortCol.key];
        let valB = b[sortCol.key];
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();
        if (valA < valB) return sortCol.dir === "asc" ? -1 : 1;
        if (valA > valB) return sortCol.dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return p;
  }, [dataset, searchCol, sortCol]);

  if (!hydrated) {
    return (
      <div className="neo p-10 text-center">
        <div className="font-semibold text-lg">Restoring dataset…</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Loading your latest upload from local storage.
        </p>
      </div>
    );
  }
  if (!dataset) return <NoData />;

  const {
    rowCount,
    colCount,
    missingTotal,
    duplicateRows,
    readinessScore,
    readinessBreakdown,
    profiles,
    rows,
  } = dataset;
  const totalCells = rowCount * colCount || 1;
  const missPct = ((missingTotal / totalCells) * 100).toFixed(2);
  const numericCols = profiles.filter((p) => p.type === "numeric").length;
  const catCols = profiles.filter((p) => p.type === "categorical").length;

  const SortHead = ({
    label,
    sortKey,
  }: {
    label: string;
    sortKey: "name" | "type" | "missing" | "unique";
  }) => {
    const active = sortCol?.key === sortKey;
    return (
      <th
        className="px-5 py-3 cursor-pointer hover:text-foreground transition-colors select-none font-semibold text-xs text-muted-foreground uppercase tracking-wider"
        onClick={() => {
          if (active && sortCol.dir === "asc") setSortCol({ key: sortKey, dir: "desc" });
          else if (active && sortCol.dir === "desc") setSortCol(null);
          else setSortCol({ key: sortKey, dir: "asc" });
        }}
      >
        <div className="flex items-center gap-1.5">
          {label}
          {active ? (
            sortCol.dir === "asc" ? (
              <ChevronUp className="size-3.5 text-primary" />
            ) : (
              <ChevronDown className="size-3.5 text-primary" />
            )
          ) : (
            <ChevronsUpDown className="size-3.5 opacity-30" />
          )}
        </div>
      </th>
    );
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black gradient-text tracking-tight">Overview</h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2 font-medium">
            <Database className="size-4 text-primary" />
            {dataset.name}
          </p>
        </div>
        <div className="flex items-center gap-3 neo-sm px-4 py-2 text-sm font-semibold border-primary/30 shadow-sm">
          <span className="text-xs text-muted-foreground">ML Readiness:</span>
          <ScoreRing score={readinessScore} />
        </div>
      </motion.div>

      <motion.div variants={item}>
        <RoleDashboard />
      </motion.div>

      {dataset.isSampled && (
        <motion.div
          variants={item}
          className="neo-sm p-4 bg-primary/10 border-primary/30 flex items-center justify-between flex-wrap gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary/20 grid place-items-center text-primary font-black text-sm">
              1M+
            </div>
            <div>
              <div className="font-bold text-sm text-foreground flex items-center gap-2">
                Big Data Mode Active (Million / Billion Row Scale)
                <span className="neo-sm px-2 py-0.5 text-[10px] font-mono bg-primary/20 text-primary border-primary/30">
                  Reservoir Profiling
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Processed total of{" "}
                <strong className="text-foreground">
                  {dataset.rowCount.toLocaleString()}
                </strong>{" "}
                rows. Statistical profiling and preview built from a high-precision reservoir sample of{" "}
                <strong className="text-foreground">
                  {dataset.sampledRowCount?.toLocaleString() ?? dataset.rows.length.toLocaleString()}
                </strong>{" "}
                rows ({(dataset.samplingRatio ? dataset.samplingRatio * 100 : 100).toFixed(2)}% sample ratio).
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div variants={item}>
        <ProcessingTelemetryCard />
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            label: "Rows",
            value: rowCount.toLocaleString(),
            icon: TableIcon,
            color: "text-primary",
          },
          { label: "Columns", value: colCount, icon: Columns, color: "text-accent" },
          { label: "Numeric", value: numericCols, icon: Hash, color: "text-cyan-500" },
          { label: "Categorical", value: catCols, icon: List, color: "text-violet-500" },
          {
            label: "Missing %",
            value: `${missPct}%`,
            icon: AlertTriangle,
            color: Number(missPct) > 5 ? "text-amber-500" : "text-emerald-500",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="neo p-4 group relative overflow-hidden hover:border-primary/40 transition-all"
          >
            <div className="absolute top-2 right-2 p-2 opacity-15 group-hover:opacity-30 transition-opacity">
              <s.icon className={`size-8 ${s.color}`} />
            </div>
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 relative z-10">
              <s.icon className={`size-3.5 ${s.color}`} />
              {s.label}
            </div>
            <div className="text-2xl font-black mt-2 gradient-text relative z-10 tracking-tight">
              {s.value}
            </div>
          </div>
        ))}
      </motion.div>

      {readinessBreakdown.length > 0 && (
        <motion.div variants={item} className="neo p-5 border-amber-500/20">
          <div className="font-bold text-sm mb-3 flex items-center gap-2 text-foreground">
            <AlertTriangle className="size-4 text-amber-500" /> Readiness Penalties
          </div>
          <div className="space-y-2">
            {readinessBreakdown.map((b, i) => (
              <div key={i} className="flex justify-between text-xs sm:text-sm neo-sm px-3 py-2">
                <span className="text-muted-foreground">{b.reason}</span>
                <span className="font-mono font-bold text-destructive">−{b.penalty}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div variants={item} className="neo p-0 overflow-hidden border-primary/20">
        <div className="p-4 sm:p-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
          <div className="font-bold text-base text-foreground">
            Column Profiles{" "}
            <span className="text-xs font-mono text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded-md ml-2">
              {filteredProfiles.length} cols
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={searchCol}
              onChange={(e) => setSearchCol(e.target.value)}
              placeholder="Search columns..."
              className="neo-inset pl-9 pr-4 py-1.5 text-xs sm:text-sm w-full sm:w-64 outline-none border border-border/40 focus:border-primary/50 transition-colors"
            />
          </div>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0 z-10 backdrop-blur-md border-b border-border/40">
              <tr className="text-left">
                <SortHead label="Column" sortKey="name" />
                <SortHead label="Type" sortKey="type" />
                <SortHead label="Missing" sortKey="missing" />
                <SortHead label="Unique" sortKey="unique" />
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((p) => (
                <tr
                  key={p.name}
                  className="border-t border-border/40 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-3 px-5 font-semibold text-foreground">{p.name}</td>
                  <td className="px-5">
                    <span
                      className={`neo-sm px-2.5 py-0.5 text-xs font-mono font-semibold ${
                        p.type === "numeric"
                          ? "bg-cyan-500/10 text-cyan-500 border-cyan-500/30"
                          : "bg-purple-500/10 text-purple-500 border-purple-500/30"
                      }`}
                    >
                      {p.type}
                    </span>
                  </td>
                  <td className="px-5 font-mono text-xs">
                    {p.missing}{" "}
                    <span className="text-muted-foreground font-sans text-xs">
                      ({p.missingPct.toFixed(1)}%)
                    </span>
                  </td>
                  <td className="px-5 font-mono text-xs text-foreground">{p.unique}</td>
                </tr>
              ))}
              {filteredProfiles.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-muted-foreground text-sm">
                    No columns match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div variants={item}>
        <DatasetVisuals />
      </motion.div>

      <motion.div variants={item} className="neo p-0 overflow-hidden border-primary/20">
        <div className="p-4 sm:p-5 border-b border-border/50 bg-muted/20 flex items-center justify-between">
          <div className="font-bold text-base text-foreground">Data Preview</div>
          <span className="text-xs text-muted-foreground font-mono">10 rows per page</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 border-b border-border/40">
              <tr>
                {dataset.columns.map((c) => (
                  <th
                    key={c}
                    className="text-left py-3 px-5 font-bold text-foreground whitespace-nowrap uppercase tracking-wider text-[11px]"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(page * 10, (page + 1) * 10).map((r, i) => (
                <tr
                  key={i}
                  className="border-t border-border/40 hover:bg-muted/40 transition-colors font-mono"
                >
                  {dataset.columns.map((c) => (
                    <td key={c} className="py-2.5 px-5 whitespace-nowrap text-muted-foreground">
                      {String(r[c] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3.5 border-t border-border/50 bg-muted/10 text-xs text-muted-foreground flex items-center justify-between">
          <span className="font-medium">
            Total: <strong className="text-foreground">{rowCount.toLocaleString()}</strong> rows (
            {duplicateRows} duplicates)
          </span>
          <div className="flex items-center gap-4">
            <span>
              Page {page + 1} of {Math.max(1, Math.ceil(rowCount / 10))}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(Math.ceil(rowCount / 10) - 1, page + 1))}
                disabled={page >= Math.ceil(rowCount / 10) - 1}
                className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DatasetVisuals() {
  const { dataset } = useDataset();
  const data = useMemo(() => {
    if (!dataset) return null;
    const types: Record<string, number> = {};
    for (const p of dataset.profiles) types[p.type] = (types[p.type] ?? 0) + 1;
    const typeData = Object.entries(types).map(([name, value]) => ({ name, value }));
    const missingData = dataset.profiles
      .filter((p) => p.missing > 0)
      .sort((a, b) => b.missingPct - a.missingPct)
      .slice(0, 10)
      .map((p) => ({ name: p.name, pct: +p.missingPct.toFixed(2) }));
    const cardinalityData = [...dataset.profiles]
      .sort((a, b) => b.unique - a.unique)
      .slice(0, 10)
      .map((p) => ({ name: p.name, unique: p.unique }));
    const dateCol = dataset.profiles.find((p) => p.type === "datetime")?.name;
    const numCol = dataset.profiles.find((p) => p.type === "numeric")?.name;
    let trend: { x: string; y: number }[] | null = null;
    if (dateCol && numCol) {
      const buckets = new Map<string, { sum: number; n: number }>();
      for (const r of dataset.rows) {
        const d = new Date(String(r[dateCol]));
        if (isNaN(d.getTime())) continue;
        const k = d.toISOString().slice(0, 10);
        const v = Number(r[numCol]);
        if (isNaN(v)) continue;
        const cur = buckets.get(k) ?? { sum: 0, n: 0 };
        cur.sum += v;
        cur.n += 1;
        buckets.set(k, cur);
      }
      trend = [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([x, v]) => ({ x, y: +(v.sum / v.n).toFixed(3) }));
    }
    // numeric distribution (histogram of first numeric)
    let hist: { bin: string; n: number }[] | null = null;
    const firstNum = dataset.profiles.find((p) => p.type === "numeric");
    if (firstNum) {
      const vals = dataset.rows.map((r) => Number(r[firstNum.name])).filter((v) => !isNaN(v));
      if (vals.length > 1) {
        let min = vals[0];
        let max = vals[0];
        for (let i = 1; i < vals.length; i++) {
          if (vals[i] < min) min = vals[i];
          if (vals[i] > max) max = vals[i];
        }
        const bins = 12;
        const w = (max - min) / bins || 1;
        const buckets = new Array(bins).fill(0);
        for (const v of vals) buckets[Math.min(bins - 1, Math.floor((v - min) / w))]++;
        hist = buckets.map((n, i) => ({ bin: (min + i * w).toFixed(1), n }));
      }
    }
    return {
      typeData,
      missingData,
      cardinalityData,
      trend,
      dateCol,
      numCol,
      hist,
      firstNum: firstNum?.name,
    };
  }, [dataset]);
  if (!data) return null;

  return (
    <section aria-label="Dataset visualizations" className="grid sm:grid-cols-2 gap-4">
      <div className="neo p-4 sm:p-5">
        <div className="font-semibold mb-3 text-sm">Column type mix</div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.typeData} dataKey="value" nameKey="name" outerRadius="70%" label>
                {data.typeData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="neo p-4 sm:p-5">
        <div className="font-semibold mb-3 text-sm">Top missingness (%)</div>
        <div className="h-56">
          {data.missingData.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4">No missing values 🎉</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.missingData} layout="vertical" margin={{ left: 20, right: 8 }}>
                <CartesianGrid {...gridStyle} />
                <XAxis type="number" {...axisStyle} />
                <YAxis dataKey="name" type="category" {...axisStyle} width={90} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="pct" fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <div className="neo p-4 sm:p-5">
        <div className="font-semibold mb-3 text-sm">Top cardinality (unique values)</div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.cardinalityData} margin={{ left: 0, right: 8, bottom: 4 }}>
              <CartesianGrid {...gridStyle} />
              <XAxis
                dataKey="name"
                {...axisStyle}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={60}
              />
              <YAxis {...axisStyle} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="unique" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {data.hist && (
        <div className="neo p-4 sm:p-5">
          <div className="font-semibold mb-3 text-sm">Distribution · {data.firstNum}</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.hist}>
                <defs>
                  <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="bin" {...axisStyle} />
                <YAxis {...axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="n"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  fill="url(#histGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {data.trend && data.trend.length > 1 && (
        <div className="neo p-4 sm:p-5 sm:col-span-2">
          <div className="font-semibold mb-3 text-sm">
            Trend · {data.numCol} by {data.dateCol}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend}>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="x" {...axisStyle} />
                <YAxis {...axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="y"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
