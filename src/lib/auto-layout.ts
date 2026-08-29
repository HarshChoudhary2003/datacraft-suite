// Power BI–like auto-layout engine.
//
// Takes the ordered widget list and packs it into a 12-column report grid so
// that:
//   * no two visuals overlap (guaranteed by row-based bin packing),
//   * no ragged trailing gaps (the last visual on a row is stretched to fill),
//   * every visual on a row shares one height (aligned baselines),
//   * spans degrade sensibly for tablet and mobile breakpoints.
//
// It is pure and synchronous, so it can run inside a `useMemo` on every widget
// change without measuring the DOM.

import type { Widget } from "./dashboard-store";

export type LayoutMode = "auto" | "manual";

export interface LayoutSlot {
  id: string;
  /** Desktop (xl) column span out of 12. */
  span: number;
  /** Tablet (lg / sm) column span out of 12. */
  spanMd: number;
  /** Row index this visual was packed into (0-based, charts only). */
  row: number;
  /** Shared pixel height for every visual on this row. */
  height: number;
  /** Tailwind classes for the grid footprint. */
  className: string;
}

const DESIRED: Record<NonNullable<Widget["size"]> | "default", number> = {
  small: 4,
  standard: 6,
  wide: 8,
  full: 12,
  default: 6,
};

/** Natural height (px) a visual wants before row alignment. */
function naturalHeight(w: Widget): number {
  if (w.type === "summary") return 190;
  if (w.tall) return 520;
  if (w.type === "pie" || w.type === "donut") return 360;
  if (w.type === "scatter") return 380;
  return 360;
}

function desiredSpan(w: Widget): number {
  if (w.type === "summary") return 12;
  return DESIRED[w.size ?? "default"] ?? 6;
}

const SPAN_CLASS: Record<number, string> = {
  3: "xl:col-span-3",
  4: "xl:col-span-4",
  5: "xl:col-span-5",
  6: "xl:col-span-6",
  7: "xl:col-span-7",
  8: "xl:col-span-8",
  9: "xl:col-span-9",
  12: "xl:col-span-12",
};
const SPAN_CLASS_MD: Record<number, string> = {
  6: "sm:col-span-6",
  12: "sm:col-span-12",
};

/**
 * Pack chart widgets into rows of exactly 12 columns.
 * `mode: "manual"` keeps each visual's configured width and only aligns
 * heights, which is what users expect after hand-tuning a canvas.
 */
export function autoLayout(widgets: Widget[], mode: LayoutMode = "auto"): Map<string, LayoutSlot> {
  const charts = widgets.filter((w) => w.type !== "kpi");
  const slots = new Map<string, LayoutSlot>();

  // 1. Row packing.
  const rows: { items: Widget[]; spans: number[] }[] = [];
  let cur: { items: Widget[]; spans: number[] } = { items: [], spans: [] };
  let used = 0;

  const flush = () => {
    if (cur.items.length > 0) rows.push(cur);
    cur = { items: [], spans: [] };
    used = 0;
  };

  for (const w of charts) {
    let span = Math.min(12, Math.max(3, desiredSpan(w)));
    if (span === 12) {
      flush();
      rows.push({ items: [w], spans: [12] });
      continue;
    }
    if (used + span > 12) flush();
    // Avoid leaving a 1-2 column sliver that nothing can fill.
    const remainingAfter = 12 - (used + span);
    if (remainingAfter > 0 && remainingAfter < 3) span += remainingAfter;
    cur.items.push(w);
    cur.spans.push(span);
    used += span;
  }
  flush();

  // 2. Stretch each row to fill 12 columns (auto mode only) and align heights.
  rows.forEach((row, rowIndex) => {
    const total = row.spans.reduce((a, b) => a + b, 0);
    if (mode === "auto" && total < 12 && row.spans.length > 0) {
      const deficit = 12 - total;
      const per = Math.floor(deficit / row.spans.length);
      let leftover = deficit - per * row.spans.length;
      for (let i = 0; i < row.spans.length; i++) {
        row.spans[i] += per + (leftover > 0 ? 1 : 0);
        if (leftover > 0) leftover--;
      }
    }
    const height = Math.max(...row.items.map(naturalHeight));
    row.items.forEach((w, i) => {
      const span = row.spans[i];
      // Two-up on tablets unless the visual is full width.
      const spanMd = span >= 12 ? 12 : row.items.length === 1 ? 12 : 6;
      slots.set(w.id, {
        id: w.id,
        span,
        spanMd,
        row: rowIndex,
        height,
        className: `col-span-12 ${SPAN_CLASS_MD[spanMd] ?? "sm:col-span-6"} ${SPAN_CLASS[span] ?? "xl:col-span-6"}`,
      });
    });
  });

  return slots;
}

/** KPI strip columns: keeps cards evenly distributed instead of orphaning one. */
export function kpiGridClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-2 lg:grid-cols-3";
  if (count % 4 === 0) return "grid-cols-2 lg:grid-cols-4";
  if (count % 3 === 0) return "grid-cols-2 lg:grid-cols-3";
  return "grid-cols-2 lg:grid-cols-4";
}
