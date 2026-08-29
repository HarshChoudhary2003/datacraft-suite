// Persisted export settings for dashboard PDF/PNG output.
//
// The same settings object drives both exporters so a PDF and a PNG of the same
// canvas always contain the same filter context and the same visual ordering.

export type PageSize = "a4" | "letter" | "a3";
export type Orientation = "landscape" | "portrait";
/** How visuals are ordered inside the export (independent of the on-screen canvas). */
export type ChartOrder = "canvas" | "kpi-first" | "alphabetical" | "type";

export interface ExportSettings {
  pageSize: PageSize;
  orientation: Orientation;
  /** Print the active slicer / cross-filter list in the export header. */
  includeFilters: boolean;
  /** Print dataset name, row scope and timestamp. */
  includeHeader: boolean;
  /** Append a page listing each visual's aggregation caption. */
  includeCaptions: boolean;
  chartOrder: ChartOrder;
  /** html2canvas pixel ratio (1–3). Higher = sharper, larger file. */
  scale: 1 | 2 | 3;
  /** White background for print, or keep the canvas theme. */
  background: "white" | "theme";
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  pageSize: "a4",
  orientation: "landscape",
  includeFilters: true,
  includeHeader: true,
  includeCaptions: true,
  chartOrder: "canvas",
  scale: 2,
  background: "white",
};

const KEY = "dataiq.dashboard.exportSettings.v1";

export function loadExportSettings(): ExportSettings {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    if (!raw) return DEFAULT_EXPORT_SETTINGS;
    return { ...DEFAULT_EXPORT_SETTINGS, ...(JSON.parse(raw) as Partial<ExportSettings>) };
  } catch {
    return DEFAULT_EXPORT_SETTINGS;
  }
}

export function saveExportSettings(s: ExportSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full / unavailable — settings simply stay session-only */
  }
}

export const PAGE_SIZE_OPTIONS = [
  { value: "a4", label: "A4 (210 × 297 mm)" },
  { value: "letter", label: "Letter (8.5 × 11 in)" },
  { value: "a3", label: "A3 (297 × 420 mm)" },
];

export const ORIENTATION_OPTIONS = [
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
];

export const CHART_ORDER_OPTIONS = [
  { value: "canvas", label: "Canvas order (as arranged)" },
  { value: "kpi-first", label: "KPIs first, then charts" },
  { value: "alphabetical", label: "Alphabetical by title" },
  { value: "type", label: "Grouped by visual type" },
];

export const SCALE_OPTIONS = [
  { value: "1", label: "Standard (1×)" },
  { value: "2", label: "High (2×)" },
  { value: "3", label: "Print (3×)" },
];

/**
 * Apply the configured ordering to a list of items that expose an id, a title
 * and a visual type. Pure so both exporters and previews stay consistent.
 */
export function orderForExport<T extends { id: string; title: string; type: string }>(
  items: T[],
  order: ChartOrder,
): T[] {
  const copy = [...items];
  switch (order) {
    case "kpi-first":
      return copy.sort((a, b) => (a.type === "kpi" ? 0 : 1) - (b.type === "kpi" ? 0 : 1));
    case "alphabetical":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "type":
      return copy.sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title));
    default:
      return copy;
  }
}
