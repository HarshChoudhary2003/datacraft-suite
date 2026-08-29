import { useDataset } from "@/store/dataset-context";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ChartFilters,
  applyFilters,
  makeInitialFilterState,
  type ChartFilterState,
} from "@/components/chart-filters";
import { profileColumn, histogram, type ColumnProfile } from "@/lib/stats";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { VirtualTable } from "@/components/virtual-table";

export function StatsPage() {
  const { dataset } = useDataset();
  const [filters, setFilters] = useState<ChartFilterState | null>(null);
  const [bins, setBins] = useState(20);

  // initialize when dataset arrives
  const initial = useMemo(
    () => (dataset ? makeInitialFilterState(dataset, "numeric") : null),
    [dataset],
  );
  const state = filters ?? initial;

  const filteredRows = useMemo(
    () => (dataset && state ? applyFilters(dataset, state) : []),
    [dataset, state],
  );

  // recompute profiles for selected columns over filtered rows
  const liveProfiles = useMemo(
    () =>
      state
        ? state.selectedColumns.map((col) =>
            profileColumn(
              col,
              filteredRows.map((r) => r[col]),
            ),
          )
        : [],
    [state, filteredRows],
  );

  if (!dataset)
    return (
      <div className="neo p-10 text-center">
        No dataset.{" "}
        <Link to="/" className="text-primary underline">
          Upload
        </Link>
      </div>
    );
  if (!state) return null;

  const interpretSkew = (s?: number) =>
    s === undefined ? "" : Math.abs(s) < 0.5 ? "Symmetric" : s > 0 ? "Right-skewed" : "Left-skewed";
  const interpretKurt = (k?: number) =>
    k === undefined ? "" : k > 1 ? "Leptokurtic" : k < -1 ? "Platykurtic" : "Mesokurtic";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Descriptive Statistics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredRows.length.toLocaleString()} of {dataset.rowCount.toLocaleString()} rows after
            filters · {state.selectedColumns.length} columns
          </p>
        </div>
      </div>

      <ChartFilters dataset={dataset} state={state} onChange={setFilters} columnType="numeric" />

      <div className="neo p-3 sm:p-5">
        <div className="font-semibold mb-3 px-2">Central tendency & spread (live)</div>
        <VirtualTable
          ariaLabel="Descriptive statistics"
          rows={liveProfiles}
          rowHeight={40}
          height={Math.min(560, Math.max(200, liveProfiles.length * 40 + 8))}
          estimateRowKey={(p) => p.name}
          columns={[
            {
              key: "name",
              header: "Column",
              cell: (p) => <span className="font-medium">{p.name}</span>,
            },
            { key: "mean", header: "Mean", cell: (p) => p.mean?.toFixed(3) },
            { key: "median", header: "Median", cell: (p) => p.median?.toFixed(3) },
            { key: "std", header: "Std", cell: (p) => p.std?.toFixed(3) },
            { key: "min", header: "Min", cell: (p) => String(p.min) },
            { key: "q1", header: "Q1", cell: (p) => p.q1?.toFixed(2) },
            { key: "q3", header: "Q3", cell: (p) => p.q3?.toFixed(2) },
            { key: "max", header: "Max", cell: (p) => String(p.max) },
            { key: "iqr", header: "IQR", cell: (p) => p.iqr?.toFixed(2) },
            { key: "cv", header: "CV%", cell: (p) => p.cv?.toFixed(1) },
          ]}
        />
      </div>

      <div className="neo p-3 sm:p-5">
        <div className="font-semibold mb-3 px-2">Distribution shape</div>
        <VirtualTable
          ariaLabel="Distribution shape"
          rows={liveProfiles}
          rowHeight={40}
          height={Math.min(420, Math.max(160, liveProfiles.length * 40 + 8))}
          estimateRowKey={(p) => p.name}
          columns={[
            {
              key: "name",
              header: "Column",
              cell: (p) => <span className="font-medium">{p.name}</span>,
            },
            {
              key: "skew",
              header: "Skewness",
              cell: (p) => <span className="font-mono">{p.skewness?.toFixed(3)}</span>,
            },
            { key: "skewi", header: "Interpretation", cell: (p) => interpretSkew(p.skewness) },
            {
              key: "kurt",
              header: "Excess Kurtosis",
              cell: (p) => <span className="font-mono">{p.kurtosis?.toFixed(3)}</span>,
            },
            { key: "kurti", header: "Interpretation", cell: (p) => interpretKurt(p.kurtosis) },
          ]}
        />
      </div>

      {/* Histograms */}
      {state.selectedColumns.length > 0 && (
        <div className="space-y-4">
          <div className="neo p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div className="font-semibold px-2">Numeric distributions</div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground w-16">Bins: {bins}</span>
              <input
                type="range"
                min="5"
                max="50"
                value={bins}
                onChange={(e) => setBins(parseInt(e.target.value))}
                className="w-32 accent-primary"
              />
            </div>
          </div>
          <HistogramGrid
            columns={state.selectedColumns.slice(0, 12)}
            rows={filteredRows}
            bins={bins}
          />
        </div>
      )}

      {dataset.profiles.filter((p) => p.type !== "numeric").length > 0 && (
        <div className="neo p-5">
          <div className="font-semibold mb-4 px-2">Categorical distributions (Top 10)</div>
          <CategoricalGrid profiles={dataset.profiles.filter((p) => p.type !== "numeric")} />
        </div>
      )}
    </div>
  );
}

function HistogramGrid({
  columns,
  rows,
  bins,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  bins: number;
}) {
  const charts = useMemo(
    () =>
      columns.map((col) => ({
        col,
        data: histogram(
          rows.map((r) => Number(r[col])),
          bins,
        ),
      })),
    [columns, rows, bins],
  );
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {charts.map(({ col, data }) => (
        <div key={col} className="neo p-4">
          <div className="font-semibold text-sm mb-2">{col}</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="bin"
                  stroke="currentColor"
                  fontSize={10}
                  interval="preserveStartEnd"
                />
                <YAxis stroke="currentColor" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "none",
                    borderRadius: 12,
                    boxShadow: "var(--shadow-neo-sm)",
                  }}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                />
                <Bar
                  dataKey="count"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoricalGrid({ profiles }: { profiles: ColumnProfile[] }) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {profiles.map((p) => {
        const data =
          p.topValues?.slice(0, 10).map((t: { value: unknown; count: number }) => ({
            name: String(t.value),
            count: t.count,
          })) || [];
        return (
          <div key={p.name} className="neo-sm p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-sm truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                entropy: {p.entropy?.toFixed(2)}
              </span>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  layout="vertical"
                  margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
                  <XAxis type="number" fontSize={10} hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    fontSize={10}
                    width={80}
                    tickFormatter={(val) => (val.length > 10 ? val.substring(0, 10) + "..." : val)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "none",
                      borderRadius: 12,
                      boxShadow: "var(--shadow-neo-sm)",
                    }}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--primary)"
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                  >
                    {data.map((_: unknown, i: number) => (
                      <Cell key={i} fill={`var(--chart-${(i % 5) + 1})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
