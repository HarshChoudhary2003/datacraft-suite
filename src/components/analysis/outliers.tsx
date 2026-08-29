import { useDataset } from "@/store/dataset-context";
import { VirtualTable } from "@/components/virtual-table";
import { capOutliers } from "@/lib/clean";
import { Trash2, Scissors, AlertTriangle, Database } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { tooltipStyle, axisStyle, gridStyle } from "@/lib/chart-theme";
import { motion } from "framer-motion";

export function OutliersPage() {
  const { dataset, processRows } = useDataset();
  const numRows = useMemo(
    () =>
      (dataset?.profiles ?? [])
        .filter((p) => p.type === "numeric")
        .map((p) => ({
          ...p,
          pct: p.count ? ((p.outliersIQR ?? 0) / p.count) * 100 : 0,
        })),
    [dataset],
  );

  const [selectedCol, setSelectedCol] = useState<string | null>(null);

  // Auto-select first column with highest outliers
  useEffect(() => {
    if (!selectedCol && numRows.length > 0) {
      const top = [...numRows].sort((a, b) => b.pct - a.pct)[0];
      if (top) setSelectedCol(top.name);
    }
  }, [numRows, selectedCol]);

  const scatter = useMemo(() => {
    if (!dataset || !selectedCol) return null;
    const profile = numRows.find((p) => p.name === selectedCol);
    if (!profile) return null;

    const min = profile.iqrLower ?? -Infinity;
    const max = profile.iqrUpper ?? Infinity;
    const mean = profile.mean ?? 0;
    const std = profile.std ?? 0;

    const maxPoints = 2000;
    const step = Math.max(1, Math.floor(dataset.rowCount / maxPoints));

    const data = [];
    for (let i = 0; i < dataset.rows.length; i += step) {
      const val = Number(dataset.rows[i][selectedCol]);
      if (!isNaN(val)) {
        const isIQR = val < min || val > max;
        const isZ = std > 0 && Math.abs((val - mean) / std) > 3;
        data.push({ index: i, value: val, isOutlier: isIQR || isZ });
      }
    }
    return { data, profile };
  }, [dataset, selectedCol, numRows]);

  if (!dataset)
    return (
      <div className="neo p-10 text-center">
        No dataset.{" "}
        <Link to="/" className="text-primary underline">
          Upload
        </Link>
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Outlier Analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          IQR rule (1.5×IQR fences) and Z-score (|z|&gt;3) — virtualized for large datasets.
        </p>
      </div>
      <div className="neo p-3 sm:p-5">
        <VirtualTable
          ariaLabel="Outlier statistics by column"
          rows={numRows}
          rowHeight={40}
          height={Math.min(320, Math.max(240, numRows.length * 40 + 8))}
          estimateRowKey={(r) => r.name}
          onRowClick={(r) => setSelectedCol(r.name)}
          columns={[
            {
              key: "name",
              header: "Column",
              cell: (r) => (
                <span className={`font-medium ${r.name === selectedCol ? "text-primary" : ""}`}>
                  {r.name}
                </span>
              ),
            },
            {
              key: "iqr",
              header: "IQR outliers",
              cell: (r) => <span className="font-mono">{r.outliersIQR}</span>,
            },
            {
              key: "pct",
              header: "%",
              cell: (r) => (
                <span className={`font-mono ${r.pct > 5 ? "text-destructive font-semibold" : ""}`}>
                  {r.pct.toFixed(1)}%
                </span>
              ),
            },
            {
              key: "z",
              header: "Z-score outliers",
              cell: (r) => <span className="font-mono">{r.outliersZ}</span>,
            },
            {
              key: "lo",
              header: "IQR lower",
              cell: (r) => <span className="font-mono">{r.iqrLower?.toFixed(2)}</span>,
            },
            {
              key: "hi",
              header: "IQR upper",
              cell: (r) => <span className="font-mono">{r.iqrUpper?.toFixed(2)}</span>,
            },
          ]}
        />
      </div>

      {scatter && (
        <div className="neo p-4 sm:p-5 mt-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
            <h3 className="font-semibold text-lg">
              Distribution & Outliers: <span className="text-primary">{selectedCol}</span>
            </h3>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <div className="size-3 rounded-full bg-blue-500 opacity-60" /> Normal
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-3 rounded-full bg-destructive opacity-80" /> Outlier (Red)
              </div>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="index" name="Row Index" {...axisStyle} type="number" />
                <YAxis dataKey="value" name="Value" {...axisStyle} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tooltipStyle} />
                <Scatter data={scatter.data} isAnimationActive={false}>
                  {scatter.data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isOutlier ? "var(--destructive)" : "#3b82f6"}
                      fillOpacity={entry.isOutlier ? 0.8 : 0.4}
                    />
                  ))}
                </Scatter>
                {scatter.profile.mean !== undefined && (
                  <ReferenceLine
                    y={scatter.profile.mean}
                    stroke="currentColor"
                    strokeOpacity={0.4}
                    strokeDasharray="4 4"
                    label={{
                      position: "top",
                      value: "Mean",
                      fill: "currentColor",
                      fontSize: 10,
                      opacity: 0.5,
                    }}
                  />
                )}
                {scatter.profile.iqrLower !== undefined && (
                  <ReferenceLine
                    y={scatter.profile.iqrLower}
                    stroke="var(--destructive)"
                    strokeOpacity={0.6}
                    strokeDasharray="3 3"
                  />
                )}
                {scatter.profile.iqrUpper !== undefined && (
                  <ReferenceLine
                    y={scatter.profile.iqrUpper}
                    stroke="var(--destructive)"
                    strokeOpacity={0.6}
                    strokeDasharray="3 3"
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <button
              onClick={() => {
                if (
                  !dataset ||
                  !selectedCol ||
                  scatter?.profile?.iqrLower === undefined ||
                  scatter.profile.iqrUpper === undefined
                )
                  return;
                const newRows = capOutliers(dataset.rows, {
                  [selectedCol]: { min: scatter.profile.iqrLower, max: scatter.profile.iqrUpper },
                });
                processRows(`Cap outliers in ${selectedCol}`, newRows);
              }}
              className="neo-btn px-4 py-2 text-sm flex items-center gap-2 font-medium"
            >
              <Scissors className="size-4" /> Cap at IQR Fences (Winsorize)
            </button>
            <button
              onClick={() => {
                if (
                  !dataset ||
                  !selectedCol ||
                  scatter?.profile?.iqrLower === undefined ||
                  scatter.profile.iqrUpper === undefined
                )
                  return;
                const min = scatter.profile.iqrLower;
                const max = scatter.profile.iqrUpper;
                const newRows = dataset.rows.filter((r) => {
                  const val = Number(r[selectedCol]);
                  if (isNaN(val)) return true;
                  return val >= min && val <= max;
                });
                processRows(`Drop outliers in ${selectedCol}`, newRows);
              }}
              className="neo-btn px-4 py-2 text-sm flex items-center gap-2 font-medium text-destructive border-destructive/20 hover:bg-destructive/10"
            >
              <Trash2 className="size-4" /> Drop Outlier Rows
            </button>
          </div>
        </div>
      )}

      <div className="neo-sm p-4 text-sm text-muted-foreground mt-4">
        Tip: columns with &gt;5% IQR outliers (highlighted) may distort means and ML model
        performance. Consider winsorizing or robust scaling.
      </div>
    </div>
  );
}
