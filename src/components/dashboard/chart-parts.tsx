/**
 * Shared chart building blocks used across the dashboard canvas, analysis and
 * export surfaces: label wrapping, a single tooltip design and one unified
 * legend so every chart type looks and behaves consistently.
 */
import type { TooltipProps, LegendProps } from "recharts";

export const truncateLabel = (value: string, maxChars: number) =>
  value.length > maxChars ? `${value.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…` : value;

export const wrapLabel = (value: string, maxChars: number, maxLines = 2) => {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) line = next;
    else if (line) {
      lines.push(line);
      line = word;
    } else {
      lines.push(truncateLabel(word, maxChars));
      line = "";
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && value.length > lines.join(" ").length)
    lines[maxLines - 1] = truncateLabel(lines[maxLines - 1], Math.max(1, maxChars - 1));
  return lines.length ? lines : ["—"];
};

/** Multi-line axis tick that keeps long categories readable (with full text in a tooltip). */
export function WrappedAxisTick({
  x,
  y,
  payload,
  maxChars = 14,
  maxLines = 2,
}: {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
  maxChars?: number;
  maxLines?: number;
}) {
  const label = String(payload?.value ?? "");
  const lines = wrapLabel(label, maxChars, maxLines);
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <title>{label}</title>
      <text textAnchor="middle" fill="var(--muted-foreground)" fontSize={10}>
        {lines.map((line, index) => (
          <tspan key={index} x="0" dy={index === 0 ? 12 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

type ChartTooltipPayload = NonNullable<TooltipProps<number, string>["payload"]>[number];

/** One tooltip design for every visual: category context, colour dots, formatted values, total. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  categoryName,
  showTotal = true,
}: TooltipProps<number, string> & {
  formatValue: (value: number) => string;
  categoryName: string;
  showTotal?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const category = String(label ?? payload[0]?.payload?.x ?? "");
  const rows = payload
    .map((entry: ChartTooltipPayload) => ({
      key: String(entry.dataKey ?? entry.name ?? ""),
      name: String(entry.name || entry.dataKey || "Value"),
      color: (entry.color as string) || "var(--primary)",
      value: typeof entry.value === "number" ? entry.value : Number(entry.value),
    }))
    .filter((r) => Number.isFinite(r.value));
  if (!rows.length) return null;
  const total = rows.reduce((acc, r) => acc + r.value, 0);
  return (
    <div className="min-w-[160px] max-w-[280px] space-y-2 rounded-xl border border-border/70 bg-popover/95 p-2.5 text-popover-foreground shadow-xl backdrop-blur-xl">
      <div className="truncate border-b border-border/60 pb-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {categoryName}: <span className="text-foreground">{truncateLabel(category, 32)}</span>
      </div>
      <div className="space-y-1">
        {rows.map((r, index) => (
          <div
            key={`${r.key}-${index}`}
            className="flex items-center justify-between gap-4 text-xs"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
              <span className="truncate">{truncateLabel(r.name, 24)}</span>
            </span>
            <strong className="shrink-0 tabular-nums">{formatValue(r.value)}</strong>
          </div>
        ))}
      </div>
      {showTotal && rows.length > 1 && (
        <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground">
          <span>Total</span>
          <strong className="tabular-nums text-foreground">{formatValue(total)}</strong>
        </div>
      )}
    </div>
  );
}

type LegendPayload = { value?: unknown; dataKey?: unknown; color?: string; inactive?: boolean };

/**
 * Unified legend: same swatch, truncation and dimming behaviour for bars, lines,
 * areas, pies and combos. Hovering an entry highlights that series.
 */
export function ChartLegend({
  payload,
  activeKey,
  onHoverSeries,
  layout = "horizontal",
}: LegendProps & {
  activeKey?: string | null;
  onHoverSeries?: (key: string | null) => void;
  layout?: "horizontal" | "vertical";
}) {
  const items = ((payload ?? []) as LegendPayload[]).filter(Boolean);
  if (!items.length) return null;
  return (
    <ul
      className={`flex list-none flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] ${
        layout === "vertical" ? "flex-col items-start" : "items-center justify-center"
      }`}
    >
      {items.map((item, index) => {
        const key = String(item.dataKey ?? item.value ?? index);
        const label = String(item.value ?? item.dataKey ?? "Series");
        const dim = !!activeKey && activeKey !== key;
        return (
          <li
            key={`${key}-${index}`}
            title={label}
            onMouseEnter={() => onHoverSeries?.(key)}
            onMouseLeave={() => onHoverSeries?.(null)}
            className="flex min-w-0 max-w-[160px] cursor-default items-center gap-1.5 transition-opacity"
            style={{ opacity: dim ? 0.35 : 1 }}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: item.color || "var(--primary)" }}
            />
            <span className="truncate text-muted-foreground">{truncateLabel(label, 20)}</span>
          </li>
        );
      })}
    </ul>
  );
}
