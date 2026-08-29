import { useDataset } from "@/store/dataset-context";
import { correlationMatrix, topCorrelations } from "@/lib/stats";
import { useMemo, useState } from "react";
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { tooltipStyle, axisStyle, gridStyle, correlationColor } from "@/lib/chart-theme";
import { useIsDark } from "@/hooks/use-theme-mode";
import { Link } from "@tanstack/react-router";
import { Download, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

export function CorrelationPage() {
  const { dataset } = useDataset();
  const isDark = useIsDark();
  const corr = useMemo(
    () => (dataset ? dataset.correlation || correlationMatrix(dataset) : null),
    [dataset],
  );
  const allTop = useMemo(() => (corr ? topCorrelations(corr, 50) : []), [corr]);

  const [selectedPairIndex, setSelectedPairIndex] = useState(0);
  const [threshold, setThreshold] = useState(0);

  const top = useMemo(
    () => allTop.filter((t) => Math.abs(t.r) >= threshold).slice(0, 12),
    [allTop, threshold],
  );

  const topPair = top[selectedPairIndex] || top[0];

  const scatterData = useMemo(() => {
    if (!topPair || !dataset) return [];
    const maxPoints = 800;
    const step = Math.max(1, Math.floor(dataset.rows.length / maxPoints));
    const result = [];
    for (let i = 0; i < dataset.rows.length && result.length < maxPoints; i += step) {
      const x = Number(dataset.rows[i][topPair.a]);
      const y = Number(dataset.rows[i][topPair.b]);
      if (!isNaN(x) && !isNaN(y)) {
        result.push({ x, y });
      }
    }
    return result;
  }, [dataset, topPair]);

  const trendlineData = useMemo(() => {
    if (scatterData.length < 2) return [];
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;
    let minX = Infinity,
      maxX = -Infinity;
    for (const d of scatterData) {
      sumX += d.x;
      sumY += d.y;
      sumXY += d.x * d.y;
      sumX2 += d.x * d.x;
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
    }
    const n = scatterData.length;
    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return [];
    const m = (n * sumXY - sumX * sumY) / denominator;
    const b = (sumY - m * sumX) / n;
    return [
      { x: minX, trendY: m * minX + b },
      { x: maxX, trendY: m * maxX + b },
    ];
  }, [scatterData]);

  if (!dataset)
    return (
      <div className="neo p-10 text-center">
        No dataset.{" "}
        <Link to="/" className="text-primary underline">
          Upload
        </Link>
      </div>
    );
  if (!corr || corr.columns.length < 2)
    return (
      <div className="neo p-10 text-center">Need at least 2 numeric columns for correlation.</div>
    );

  const downloadHeatmap = () => {
    const svg = buildHeatmapSVG(corr, isDark);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataset.name.replace(/\.[^.]+$/, "")}_correlation_heatmap.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Heatmap SVG downloaded");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold gradient-text">Correlation Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pearson r — values near ±1 indicate strong linear relationships.
          </p>
        </div>
        <button
          onClick={downloadHeatmap}
          className="neo-btn px-4 py-2 text-sm font-semibold flex items-center gap-2 hover:text-primary transition-colors self-start sm:self-auto"
        >
          <Download className="size-4" /> Download heatmap
        </button>
      </div>

      {/* Threshold filter */}
      <div className="neo p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
        <div className="flex items-center gap-2 text-sm font-medium shrink-0">
          <SlidersHorizontal className="size-4 text-primary" /> Minimum |r|
        </div>
        <input
          type="range"
          min={0}
          max={0.95}
          step={0.05}
          value={threshold}
          onChange={(e) => {
            setThreshold(Number(e.target.value));
            setSelectedPairIndex(0);
          }}
          className="flex-1 accent-[var(--primary)] min-w-0"
          aria-label="Minimum absolute correlation"
        />
        <div className="font-mono text-sm w-28 text-right shrink-0">
          ≥ {threshold.toFixed(2)}{" "}
          <span className="text-muted-foreground">({top.length} pairs)</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4 lg:gap-6">
        <div className="neo p-4 sm:p-5 lg:col-span-3 overflow-hidden">
          <div className="font-semibold mb-3">Correlation matrix</div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="text-[10px] sm:text-xs border-separate border-spacing-1 mx-auto">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--card)]"></th>
                  {corr.columns.map((c) => (
                    <th
                      key={c}
                      className="px-1 py-1 font-medium text-muted-foreground h-24 align-bottom"
                    >
                      <div
                        className="-rotate-45 origin-bottom-left w-4 whitespace-nowrap text-[10px]"
                        title={c}
                      >
                        {truncate(c, 14)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corr.matrix.map((row, i) => (
                  <tr key={i}>
                    <th
                      className="sticky left-0 z-10 bg-[var(--card)] text-right pr-2 font-medium text-muted-foreground whitespace-nowrap text-[10px] sm:text-xs max-w-[8rem] truncate"
                      title={corr.columns[i]}
                    >
                      {truncate(corr.columns[i], 16)}
                    </th>
                    {row.map((v, j) => {
                      const dim = i !== j && Math.abs(v) < threshold;
                      return (
                        <td
                          key={j}
                          className="size-8 sm:size-9 md:size-10 text-center font-mono rounded-md transition-opacity"
                          style={{
                            background: correlationColor(v, isDark),
                            color: Math.abs(v) > 0.6 ? "white" : "var(--foreground)",
                            opacity: dim ? 0.15 : 1,
                          }}
                          title={`${corr.columns[i]} vs ${corr.columns[j]}: ${v.toFixed(3)}`}
                        >
                          {v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
            <span className="shrink-0">−1</span>
            <div
              className="flex-1 h-2 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${correlationColor(-1, isDark)}, ${correlationColor(0, isDark)}, ${correlationColor(1, isDark)})`,
              }}
            />
            <span className="shrink-0">+1</span>
          </div>
        </div>

        <div className="neo p-4 sm:p-5 lg:col-span-2">
          <div className="font-semibold mb-3">Top correlated pairs</div>
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {top.length === 0 && (
              <div className="text-sm text-muted-foreground p-3">
                No pairs meet the |r| ≥ {threshold.toFixed(2)} threshold.
              </div>
            )}
            {top.map((t, i) => (
              <button
                key={i}
                onClick={() => setSelectedPairIndex(i)}
                className={`w-full text-left neo-sm p-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${i === selectedPairIndex ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/30"}`}
              >
                <div className="text-xs sm:text-sm truncate min-w-0">
                  <span className="font-medium">{t.a}</span>{" "}
                  <span className="text-muted-foreground">↔</span>{" "}
                  <span className="font-medium">{t.b}</span>
                </div>
                <div
                  className="font-mono font-bold text-sm shrink-0"
                  style={{ color: correlationColor(t.r >= 0 ? 0.9 : -0.9, isDark) }}
                >
                  {t.r.toFixed(3)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {topPair && scatterData.length > 0 && (
        <div className="neo p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
            <h3 className="font-semibold text-sm sm:text-base truncate">
              Scatter: <span className="text-primary">{topPair.a}</span> vs{" "}
              <span className="text-primary">{topPair.b}</span>
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5 font-mono text-muted-foreground">
                r = {topPair.r.toFixed(3)}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-destructive" /> Line of best fit
              </div>
            </div>
          </div>
          <div className="h-64 sm:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid {...gridStyle} />
                <XAxis
                  dataKey="x"
                  name={topPair.a}
                  {...axisStyle}
                  type="number"
                  domain={["dataMin", "dataMax"]}
                />
                <YAxis dataKey="y" name={topPair.b} {...axisStyle} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tooltipStyle} />
                <Scatter
                  data={scatterData}
                  fill="var(--chart-1)"
                  fillOpacity={0.55}
                  isAnimationActive={false}
                />
                {trendlineData.length > 0 && (
                  <Line
                    data={trendlineData}
                    dataKey="trendY"
                    type="linear"
                    stroke="var(--destructive)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={true}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Build a standalone, self-contained SVG heatmap for download. */
function buildHeatmapSVG(corr: { columns: string[]; matrix: number[][] }, isDark: boolean): string {
  const cols = corr.columns;
  const cell = 44;
  const labelPad = 130;
  const size = cols.length * cell;
  const w = labelPad + size + 20;
  const h = labelPad + size + 20;
  const fg = isDark ? "#e2e8f0" : "#1e293b";
  const bg = isDark ? "#0f172a" : "#ffffff";
  let cells = "";
  for (let i = 0; i < cols.length; i++) {
    for (let j = 0; j < cols.length; j++) {
      const v = corr.matrix[i][j];
      const x = labelPad + j * cell;
      const y = labelPad + i * cell;
      const color = correlationColor(v, isDark);
      const txt = Math.abs(v) > 0.6 ? "#ffffff" : fg;
      cells += `<rect x="${x}" y="${y}" width="${cell - 2}" height="${cell - 2}" rx="4" fill="${color}"/>`;
      cells += `<text x="${x + (cell - 2) / 2}" y="${y + (cell - 2) / 2 + 4}" font-size="11" font-family="monospace" fill="${txt}" text-anchor="middle">${v.toFixed(2)}</text>`;
    }
  }
  let labels = "";
  for (let i = 0; i < cols.length; i++) {
    const name = truncate(cols[i], 16);
    labels += `<text x="${labelPad - 8}" y="${labelPad + i * cell + cell / 2}" font-size="11" font-family="sans-serif" fill="${fg}" text-anchor="end">${escapeXml(name)}</text>`;
    const cx = labelPad + i * cell + cell / 2;
    labels += `<text x="${cx}" y="${labelPad - 8}" font-size="11" font-family="sans-serif" fill="${fg}" text-anchor="start" transform="rotate(-45 ${cx} ${labelPad - 8})">${escapeXml(name)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/><text x="12" y="24" font-size="16" font-weight="bold" font-family="sans-serif" fill="${fg}">Correlation heatmap</text>${labels}${cells}</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
