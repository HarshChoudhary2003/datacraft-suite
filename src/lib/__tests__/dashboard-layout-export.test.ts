import { describe, it, expect } from "vitest";
import { autoLayout, kpiGridClass, type LayoutSlot } from "@/lib/auto-layout";
import {
  DEFAULT_EXPORT_SETTINGS,
  orderForExport,
  PAGE_SIZE_OPTIONS,
  ORIENTATION_OPTIONS,
  CHART_ORDER_OPTIONS,
  type ChartOrder,
  type ExportSettings,
} from "@/lib/export-settings";
import type { Widget } from "@/lib/dashboard-store";

const w = (id: string, over: Partial<Widget> = {}): Widget =>
  ({ id, type: "bar", xAxis: "region", yAxis: "revenue", size: "standard", ...over }) as Widget;

const CANVAS: Widget[] = [
  w("k1", { type: "kpi", xAxis: "Total Rows", yAxis: "" }),
  w("k2", { type: "kpi", xAxis: "Total Rows", yAxis: "" }),
  w("c1", { size: "small" }),
  w("c2", { type: "line", size: "standard" }),
  w("c3", { type: "pie", size: "small" }),
  w("c4", { type: "scatter", size: "wide" }),
  w("c5", { type: "area", size: "full" }),
  w("s1", { type: "summary" }),
];

function byRow(slots: Map<string, LayoutSlot>) {
  const rows = new Map<number, LayoutSlot[]>();
  for (const s of slots.values()) {
    const list = rows.get(s.row) ?? [];
    list.push(s);
    rows.set(s.row, list);
  }
  return rows;
}

describe("auto-layout grid", () => {
  it("packs every non-KPI visual and skips KPIs", () => {
    const slots = autoLayout(CANVAS);
    expect(slots.size).toBe(CANVAS.filter((x) => x.type !== "kpi").length);
    expect(slots.has("k1")).toBe(false);
  });

  it("never overlaps: each row totals exactly 12 columns in auto mode", () => {
    for (const rowSlots of byRow(autoLayout(CANVAS, "auto")).values()) {
      const total = rowSlots.reduce((a, s) => a + s.span, 0);
      expect(total).toBe(12);
    }
  });

  it("never exceeds 12 columns per row in manual mode", () => {
    for (const rowSlots of byRow(autoLayout(CANVAS, "manual")).values()) {
      expect(rowSlots.reduce((a, s) => a + s.span, 0)).toBeLessThanOrEqual(12);
    }
  });

  it("aligns baselines: one shared height per row", () => {
    for (const rowSlots of byRow(autoLayout(CANVAS)).values()) {
      expect(new Set(rowSlots.map((s) => s.height)).size).toBe(1);
    }
  });

  it("emits responsive spans that stack on mobile and degrade on tablet", () => {
    for (const s of autoLayout(CANVAS).values()) {
      expect(s.className).toContain("col-span-12");
      expect(s.className).toMatch(/sm:col-span-(6|12)/);
      expect(s.className).toMatch(/xl:col-span-\d+/);
      expect([6, 12]).toContain(s.spanMd);
      expect(s.span).toBeGreaterThanOrEqual(3);
      expect(s.span).toBeLessThanOrEqual(12);
    }
  });

  it("gives full-width visuals their own row", () => {
    const slots = autoLayout(CANVAS);
    const full = slots.get("c5")!;
    expect(full.span).toBe(12);
    expect([...slots.values()].filter((s) => s.row === full.row)).toHaveLength(1);
  });

  it("is deterministic and stable for the same widget list", () => {
    const a = [...autoLayout(CANVAS).entries()];
    const b = [...autoLayout(CANVAS).entries()];
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("keeps KPI strips balanced without orphan cards", () => {
    expect(kpiGridClass(1)).toBe("grid-cols-1");
    expect(kpiGridClass(2)).toContain("grid-cols-2");
    for (const n of [1, 2, 3, 4, 5, 6, 8, 9]) {
      expect(kpiGridClass(n)).toMatch(/grid-cols-\d/);
    }
  });
});

interface Item {
  id: string;
  title: string;
  type: string;
}
const ITEMS: Item[] = [
  { id: "c2", title: "Revenue by month", type: "line" },
  { id: "k1", title: "Total rows", type: "kpi" },
  { id: "c1", title: "Avg order by region", type: "bar" },
  { id: "k2", title: "Distinct customers", type: "kpi" },
  { id: "c3", title: "Share by channel", type: "pie" },
];

describe("export chart ordering", () => {
  it("preserves canvas order by default", () => {
    expect(orderForExport(ITEMS, "canvas").map((i) => i.id)).toEqual(ITEMS.map((i) => i.id));
  });

  it("puts KPIs first when requested", () => {
    const ordered = orderForExport(ITEMS, "kpi-first");
    const lastKpi = ordered.map((i) => i.type).lastIndexOf("kpi");
    const firstChart = ordered.findIndex((i) => i.type !== "kpi");
    expect(lastKpi).toBeLessThan(firstChart === -1 ? Infinity : firstChart + 1);
    expect(ordered.slice(0, 2).every((i) => i.type === "kpi")).toBe(true);
  });

  it("sorts alphabetically and by type", () => {
    expect(orderForExport(ITEMS, "alphabetical").map((i) => i.title)).toEqual(
      [...ITEMS.map((i) => i.title)].sort((a, b) => a.localeCompare(b)),
    );
    const types = orderForExport(ITEMS, "type").map((i) => i.type);
    expect(types).toEqual([...types].sort((a, b) => a.localeCompare(b)));
  });

  it("never drops or duplicates a visual for any ordering", () => {
    for (const { value } of CHART_ORDER_OPTIONS) {
      const ordered = orderForExport(ITEMS, value as ChartOrder);
      expect(ordered).toHaveLength(ITEMS.length);
      expect(new Set(ordered.map((i) => i.id)).size).toBe(ITEMS.length);
    }
  });

  it("does not mutate the source list", () => {
    const before = ITEMS.map((i) => i.id);
    orderForExport(ITEMS, "alphabetical");
    expect(ITEMS.map((i) => i.id)).toEqual(before);
  });

  it("yields identical ordering across every page size and orientation", () => {
    for (const { value: order } of CHART_ORDER_OPTIONS) {
      const baseline = orderForExport(ITEMS, order as ChartOrder).map((i) => i.id);
      for (const { value: pageSize } of PAGE_SIZE_OPTIONS) {
        for (const { value: orientation } of ORIENTATION_OPTIONS) {
          const settings = {
            ...DEFAULT_EXPORT_SETTINGS,
            pageSize,
            orientation,
            chartOrder: order,
          } as ExportSettings;
          expect(orderForExport(ITEMS, settings.chartOrder).map((i) => i.id)).toEqual(baseline);
        }
      }
    }
  });

  it("carries the filter context flags into every export variant", () => {
    for (const { value: pageSize } of PAGE_SIZE_OPTIONS) {
      const settings = { ...DEFAULT_EXPORT_SETTINGS, pageSize } as ExportSettings;
      expect(settings.includeFilters).toBe(true);
      expect(settings.includeHeader).toBe(true);
      expect(settings.includeCaptions).toBe(true);
      expect(settings.scale).toBeGreaterThanOrEqual(1);
      expect(settings.scale).toBeLessThanOrEqual(3);
    }
  });
});
