import { useState, useMemo, useEffect } from "react";
import { useDataset } from "@/store/dataset-context";
import { decomposeTimeSeries, type TimeSeriesResult } from "@/lib/timeseries";
import { TrendingUp, Calendar, AlertTriangle, Sparkles, HelpCircle, Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

export function TimeSeriesPage() {
  const { dataset } = useDataset();

  const dateCols = useMemo(() => {
    if (!dataset) return [];
    return dataset.profiles
      .filter((p) => p.type === "datetime" || p.name.toLowerCase().includes("date") || p.name.toLowerCase().includes("time"))
      .map((p) => p.name);
  }, [dataset]);

  const numCols = useMemo(() => {
    if (!dataset) return [];
    return dataset.profiles.filter((p) => p.type === "numeric").map((p) => p.name);
  }, [dataset]);

  const [selectedDate, setSelectedDate] = useState(dateCols[0] || "");
  const [selectedValue, setSelectedValue] = useState(numCols[0] || "");
  const [decomp, setDecomp] = useState<TimeSeriesResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);

  // Sync selection if dateCols/numCols change
  useEffect(() => {
    if (dateCols.length > 0 && !dateCols.includes(selectedDate)) {
      setSelectedDate(dateCols[0]);
    }
    if (numCols.length > 0 && !numCols.includes(selectedValue)) {
      setSelectedValue(numCols[0]);
    }
  }, [dateCols, numCols, selectedDate, selectedValue]);

  // Non-blocking async calculation yielding execution to browser UI thread
  useEffect(() => {
    if (!dataset || !selectedDate || !selectedValue) {
      setDecomp(null);
      setIsComputing(false);
      return;
    }

    setIsComputing(true);
    let cancelled = false;

    const timer = setTimeout(() => {
      if (cancelled) return;
      const res = decomposeTimeSeries(dataset.rows, selectedDate, selectedValue, 7);
      if (!cancelled) {
        setDecomp(res);
        setIsComputing(false);
      }
    }, 10);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dataset, selectedDate, selectedValue]);

  if (!dataset || dateCols.length === 0 || numCols.length === 0) {
    return (
      <div className="neo p-8 text-center space-y-3">
        <HelpCircle className="size-10 mx-auto text-muted-foreground opacity-50" />
        <h3 className="font-bold text-lg">No Datetime Columns Found</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Time series seasonal trend decomposition requires at least one date column and one numeric column.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Selector */}
      <div className="neo p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="size-6 text-primary" />
          <div>
            <h2 className="text-lg font-bold">Time Series Seasonal Decomposition</h2>
            <p className="text-xs text-muted-foreground">Additive Trend, Seasonality, and Residual Z-score Anomaly Detection</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Calendar className="size-4 text-muted-foreground" /> Date:
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="neo-sm px-3 py-1.5 bg-background text-xs font-medium border-border"
            >
              {dateCols.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            Metric:
            <select
              value={selectedValue}
              onChange={(e) => setSelectedValue(e.target.value)}
              className="neo-sm px-3 py-1.5 bg-background text-xs font-medium border-border"
            >
              {numCols.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isComputing ? (
        <div className="neo p-12 text-center space-y-3 flex flex-col items-center justify-center">
          <Loader2 className="size-8 text-primary animate-spin" />
          <h3 className="font-bold text-base">Analyzing Time Series Data...</h3>
          <p className="text-xs text-muted-foreground">
            Decomposing trend, seasonality, and calculating residual Z-scores without blocking the UI.
          </p>
        </div>
      ) : decomp ? (
        <div className="space-y-6">
          {/* Status KPI */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="neo p-4">
              <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                <Calendar className="size-4 text-primary" /> Datetime Points
              </div>
              <div className="text-2xl font-black mt-2 gradient-text">
                {decomp.totalPoints.toLocaleString()}
                {decomp.downsampledPoints.length < decomp.totalPoints && (
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    (Rendered: {decomp.downsampledPoints.length.toLocaleString()})
                  </span>
                )}
              </div>
            </div>

            <div className="neo p-4">
              <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                <Sparkles className="size-4 text-accent" /> Seasonality Period
              </div>
              <div className="text-2xl font-black mt-2 gradient-text">{decomp.period} Steps</div>
            </div>

            <div className="neo p-4">
              <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                <AlertTriangle className="size-4 text-amber-500" /> Detected Anomalies
              </div>
              <div className="text-2xl font-black mt-2 text-amber-500">{decomp.anomalyCount}</div>
            </div>
          </div>

          {/* Trend & Actual Line Chart */}
          <div className="neo p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Actual Value vs Moving Average Trend</h3>
              {decomp.downsampledPoints.length < decomp.totalPoints && (
                <span className="text-xs text-muted-foreground font-medium bg-secondary/50 px-2.5 py-1 rounded-md">
                  Downsampled to {decomp.downsampledPoints.length} points for 60fps rendering
                </span>
              )}
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={decomp.downsampledPoints}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--background))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" name="Actual" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="trend" stroke="#06b6d4" name="7-Step Trend" dot={false} strokeWidth={2} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Seasonal & Residual Decomposition */}
          <div className="neo p-6 space-y-4">
            <h3 className="font-bold text-base">Additive Seasonality Index & Residual Noise</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={decomp.downsampledPoints}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--background))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="seasonal" stroke="#8b5cf6" name="Seasonality" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="residual" stroke="#f59e0b" name="Residual Noise" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="neo p-8 text-center text-muted-foreground text-sm">
          Insufficient data points to compute time series decomposition.
        </div>
      )}
    </div>
  );
}
