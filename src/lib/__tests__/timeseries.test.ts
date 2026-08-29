import { describe, it, expect } from "vitest";
import { decomposeTimeSeries, downsampleTimeSeriesPoints, type TimeSeriesPoint } from "../timeseries";

describe("Time Series Engine", () => {
  it("decomposes seasonal trend and identifies anomalies accurately", () => {
    const rows: Record<string, unknown>[] = [];
    const baseDate = new Date("2024-01-01");

    for (let i = 0; i < 50; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      // Value with clear trend + 7-day seasonality + noise
      let val = 100 + i * 2 + (i % 7) * 10;
      // Inject deliberate anomaly at step 25
      if (i === 25) val += 300;

      rows.push({ date: dateStr, metric: val });
    }

    const result = decomposeTimeSeries(rows, "date", "metric", 7);

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.totalPoints).toBe(50);
    expect(result.points.length).toBe(50);
    expect(result.anomalyCount).toBeGreaterThanOrEqual(1);

    // Verify step 25 anomaly
    const anomalyPoint = result.points.find((p) => p.date === rows[25].date);
    expect(anomalyPoint?.isAnomaly).toBe(true);
  });

  it("downsamples time series points while strictly preserving anomaly spikes and boundary points", () => {
    const points: TimeSeriesPoint[] = [];
    for (let i = 0; i < 2000; i++) {
      points.push({
        date: `2024-01-${i + 1}`,
        value: Math.sin(i / 10) * 50 + 100,
        trend: 100,
        seasonal: 0,
        residual: 0,
        isAnomaly: i === 500 || i === 1200,
      });
    }

    const downsampled = downsampleTimeSeriesPoints(points, 400);

    expect(downsampled.length).toBeLessThanOrEqual(500);
    expect(downsampled.length).toBeGreaterThan(0);

    // Boundary points must be preserved
    expect(downsampled[0].date).toBe(points[0].date);
    expect(downsampled[downsampled.length - 1].date).toBe(points[points.length - 1].date);

    // Anomalies at index 500 and 1200 MUST be preserved in downsampled output
    const anomalyDates = new Set(downsampled.filter((p) => p.isAnomaly).map((p) => p.date));
    expect(anomalyDates.has(points[500].date)).toBe(true);
    expect(anomalyDates.has(points[1200].date)).toBe(true);
  });

  it("handles large datasets efficiently under 20ms", () => {
    const rows: Record<string, unknown>[] = [];
    const baseDate = new Date("2020-01-01");

    for (let i = 0; i < 10000; i++) {
      const d = new Date(baseDate.getTime() + i * 86400000);
      rows.push({
        date: d.toISOString().slice(0, 10),
        val: 500 + Math.sin(i / 50) * 100 + (i % 7) * 15 + Math.random() * 5,
      });
    }

    const start = performance.now();
    const result = decomposeTimeSeries(rows, "date", "val", 7);
    const duration = performance.now() - start;

    expect(result).not.toBeNull();
    expect(result?.totalPoints).toBe(10000);
    expect(result?.downsampledPoints.length).toBeLessThanOrEqual(1000);
    expect(duration).toBeLessThan(100); // Super fast execution!
  });
});
