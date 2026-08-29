// Persisted benchmark run history (localStorage) + comparison helpers.
import type { BenchRun } from "./benchmark";

const KEY = "dataiq.benchmark.runs.v1";
const MAX = 50;

export function loadRuns(): BenchRun[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as BenchRun[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveRun(run: BenchRun): BenchRun[] {
  const runs = [run, ...loadRuns()].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(runs));
  } catch {
    /* quota */
  }
  return runs;
}

export function deleteRun(id: string): BenchRun[] {
  const runs = loadRuns().filter((r) => r.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(runs));
  } catch {
    /* noop */
  }
  return runs;
}

export function clearRuns(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export interface RunDelta {
  label: string;
  a: number;
  b: number;
  diff: number;
  pct: number;
  /** true when B is better than A for this metric. */
  improved: boolean;
  unit: string;
  lowerIsBetter: boolean;
}

const pctChange = (a: number, b: number) =>
  a === 0 ? (b === 0 ? 0 : 100) : ((b - a) / Math.abs(a)) * 100;

/** Compare run A (baseline) vs run B (candidate). */
export function compareRuns(a: BenchRun, b: BenchRun): RunDelta[] {
  const metric = (
    label: string,
    av: number,
    bv: number,
    unit: string,
    lowerIsBetter: boolean,
  ): RunDelta => {
    const diff = bv - av;
    const improved = lowerIsBetter ? diff <= 0 : diff >= 0;
    return {
      label,
      a: av,
      b: bv,
      diff: +diff.toFixed(2),
      pct: +pctChange(av, bv).toFixed(1),
      improved,
      unit,
      lowerIsBetter,
    };
  };
  return [
    metric("p50 latency", a.latency.p50, b.latency.p50, "ms", true),
    metric("p90 latency", a.latency.p90, b.latency.p90, "ms", true),
    metric("p99 latency", a.latency.p99, b.latency.p99, "ms", true),
    metric("Max latency", a.latency.max, b.latency.max, "ms", true),
    metric("Pipeline total", a.totalMs, b.totalMs, "ms", true),
    metric(
      "Accuracy",
      +(a.accuracy.score * 100).toFixed(1),
      +(b.accuracy.score * 100).toFixed(1),
      "%",
      false,
    ),
    metric("Readiness", a.readiness, b.readiness, "/100", false),
    metric("Missing cells", a.missingPct, b.missingPct, "%", true),
    metric("Duplicate rows", a.duplicatePct, b.duplicatePct, "%", true),
  ];
}
