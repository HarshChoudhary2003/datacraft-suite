import { describe, expect, it } from "vitest";
import {
  buildWeeklyReportExportTrend,
  isAnalysisReportExport,
} from "@/lib/weekly-report-exports";

describe("weekly report export metric", () => {
  it("counts analysis report formats, not notebooks or data workbooks", () => {
    expect(isAnalysisReportExport("HTML report")).toBe(true);
    expect(isAnalysisReportExport("PDF report")).toBe(true);
    expect(isAnalysisReportExport("Jupyter notebook")).toBe(false);
    expect(isAnalysisReportExport("Excel workbook")).toBe(false);
  });

  it("groups counts into Monday-start weeks and shows the current week", () => {
    const now = new Date(2026, 10, 4, 12).getTime(); // Wednesday, Nov 4
    const trend = buildWeeklyReportExportTrend(
      { "2026-10-26": 3, "2026-11-02": 5 },
      now,
    );
    expect(trend).toHaveLength(8);
    expect(trend.at(-2)).toMatchObject({ weekStart: "2026-10-26", count: 3, current: false });
    expect(trend.at(-1)).toMatchObject({ weekStart: "2026-11-02", count: 5, current: true });
  });

  it("starts a new bucket on Monday while keeping Sunday in the prior week", () => {
    const sunday = buildWeeklyReportExportTrend({}, new Date(2026, 10, 1, 12).getTime(), 1);
    const monday = buildWeeklyReportExportTrend({}, new Date(2026, 10, 2, 12).getTime(), 1);
    expect(sunday[0]?.weekStart).toBe("2026-10-26");
    expect(monday[0]?.weekStart).toBe("2026-11-02");
  });
});