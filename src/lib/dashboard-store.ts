// Dashboard builder persistence + chart snapshot store.
//
// Two responsibilities:
//   1. Persist the dashboard layout (widget list, order, theme) so a rebuilt
//      dashboard survives reloads and route changes.
//   2. Hold captured chart images ("snapshots") plus the *verified* aggregated
//      data behind each chart, so the notebook/report export can embed exactly
//      what the user sees on the dashboard.
//
// Everything lives in localStorage (small, synchronous, per-browser) — images
// are capped so we never blow the quota.

export type ChartType =
  | "bar"
  | "h-bar"
  | "line"
  | "scatter"
  | "area"
  | "pie"
  | "donut"
  | "radar"
  | "composed"
  | "funnel"
  | "boxplot"
  | "kpi"
  | "summary";

export type TimeGroup = "none" | "day" | "week" | "month" | "quarter" | "year";

export type NumberFormat = "auto" | "compact" | "full" | "currency" | "percent";
export type LegendPosition = "none" | "top" | "bottom" | "right";
export type AxisScale = "linear" | "log";

export interface Widget {
  id: string;
  type: ChartType;
  xAxis: string;
  yAxis: string;
  customTitle?: string;
  /** Optional sub-caption rendered under the visual title. */
  subtitle?: string;
  themeColor?: number;
  prefix?: string;
  suffix?: string;
  showLegend?: boolean;
  compactNumber?: boolean;
  decimals?: boolean;
  sortBy?: "desc" | "asc" | "az";
  limit?: number;
  showDataLabels?: boolean;
  showAverageLine?: boolean;
  aggregation?: "sum" | "avg" | "count" | "min" | "max" | "median" | "std";
  /** Grid footprint on the 12-column report canvas. */
  size?: "small" | "standard" | "wide" | "full";
  /** Taller card for dense category charts. */
  tall?: boolean;

  /* --- Power BI style formatting controls --- */
  /** Value formatting used for axes, labels, tooltips and KPI values. */
  numberFormat?: NumberFormat;
  /** Decimal places for the chosen number format (0-4). */
  decimalPlaces?: number;
  /** Legend placement; overrides the legacy showLegend flag when set. */
  legendPosition?: LegendPosition;
  /** Value-axis scaling. */
  yScale?: AxisScale;
  /** Manual value-axis bounds (blank/undefined = auto). */
  yMin?: number;
  yMax?: number;
  /** Toggle background gridlines. */
  hideGrid?: boolean;

  /** Secondary categorical column to group/breakdown data series. */
  breakdownBy?: string;
  /** How breakdown series are laid out: side by side or stacked. */
  stackMode?: "grouped" | "stacked" | "percent";
  /** Reference goal threshold line value. */
  referenceValue?: number;
  /** Custom label for threshold reference line. */
  referenceLabel?: string;
  /** Enable interactive zoom brush range slider. */
  enableBrush?: boolean;
  /** Custom palette selection per widget. */
  palette?: string;

  /** Bucket a datetime x-axis before aggregating (day/week/month/quarter/year). */
  timeGroup?: TimeGroup;
}

export interface DashboardLayout {
  widgets: Widget[];
  theme: string;
  datasetName: string;
  savedAt: string;
}

export interface ChartSnapshot {
  id: string;
  title: string;
  /** PNG data URL captured from the live dashboard widget. */
  image: string;
  /** Human-readable caption describing the aggregation actually plotted. */
  caption: string;
  /** The exact aggregated series behind the image (verification evidence). */
  series: { x: string; y: number }[];
}

export interface SnapshotBundle {
  datasetName: string;
  role: string;
  capturedAt: string;
  charts: ChartSnapshot[];
}

const LAYOUT_KEY = "dataiq.dashboard.layout.v1";
const SNAP_KEY = "dataiq.dashboard.snapshots.v1";
/** Guard against localStorage quota errors from very large PNG payloads. */
const MAX_BUNDLE_CHARS = 4_000_000;

function safeGet(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function saveLayout(layout: Omit<DashboardLayout, "savedAt">): void {
  safeSet(LAYOUT_KEY, JSON.stringify({ ...layout, savedAt: new Date().toISOString() }));
}

export function loadLayout(datasetName: string): DashboardLayout | null {
  const raw = safeGet(LAYOUT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DashboardLayout;
    if (!parsed || !Array.isArray(parsed.widgets)) return null;
    if (parsed.datasetName !== datasetName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLayout(): void {
  try {
    localStorage.removeItem(LAYOUT_KEY);
  } catch {
    /* ignore */
  }
}

/** Persist captured dashboard charts. Returns false when storage rejected it. */
export function saveSnapshots(bundle: SnapshotBundle): boolean {
  let charts = bundle.charts;
  let payload = JSON.stringify({ ...bundle, charts });
  // Drop the largest images until the payload fits the quota budget.
  while (payload.length > MAX_BUNDLE_CHARS && charts.length > 1) {
    charts = charts.slice(0, charts.length - 1);
    payload = JSON.stringify({ ...bundle, charts });
  }
  return safeSet(SNAP_KEY, payload);
}

export function loadSnapshots(datasetName?: string): SnapshotBundle | null {
  const raw = safeGet(SNAP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SnapshotBundle;
    if (!parsed || !Array.isArray(parsed.charts) || parsed.charts.length === 0) return null;
    if (datasetName && parsed.datasetName !== datasetName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSnapshots(): void {
  try {
    localStorage.removeItem(SNAP_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Bucket a raw x-axis value into a time period label. Falls back to the raw
 * string when the value is not parseable as a date, so mixed columns degrade
 * gracefully instead of collapsing into one bucket.
 */
export function timeBucket(raw: string, mode: TimeGroup): string {
  if (mode === "none") return raw;
  const t = Date.parse(raw);
  if (isNaN(t)) return raw;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (mode) {
    case "day":
      return `${y}-${pad(m + 1)}-${pad(d.getUTCDate())}`;
    case "week": {
      // ISO-ish week start (Monday) in UTC.
      const day = (d.getUTCDay() + 6) % 7;
      const start = new Date(Date.UTC(y, m, d.getUTCDate() - day));
      return `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`;
    }
    case "month":
      return `${y}-${pad(m + 1)}`;
    case "quarter":
      return `${y}-Q${Math.floor(m / 3) + 1}`;
    case "year":
      return String(y);
    default:
      return raw;
  }
}
