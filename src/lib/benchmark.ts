// In-browser benchmark engine for DataIQ Pro.
// Times the exact pure functions that drive every on-screen table & chart,
// computes latency percentiles, and produces real "accuracy evidence" via a
// lightweight Gaussian Naive-Bayes classifier with a train/val split.
import { buildDataset, correlationMatrix, histogram, type Dataset } from "./stats";
import { autoClean } from "./autoclean";

export interface BenchStage {
  name: string;
  ms: number;
  usPerRow: number;
}

export interface BenchCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface AccuracyEvidence {
  /** 0..1 model accuracy on a held-out validation split (or readiness proxy). */
  score: number;
  method: string;
  target: string | null;
  trainRows: number;
  valRows: number;
  baseline: number; // majority-class baseline accuracy
}

export interface BenchRun {
  id: string;
  timestamp: number;
  datasetName: string;
  fingerprint: string;
  rows: number;
  cols: number;
  missingPct: number;
  duplicatePct: number;
  stages: BenchStage[];
  totalMs: number;
  verdict: "EXCELLENT" | "GOOD" | "REVIEW";
  readiness: number;
  latency: { p50: number; p90: number; p99: number; max: number; samples: number };
  accuracy: AccuracyEvidence;
  checks: BenchCheck[];
}

const isMissing = (v: unknown) =>
  v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));

/** Stable, cheap fingerprint from schema + shape + a value sample. */
export function fingerprint(name: string, rows: Record<string, unknown>[]): string {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const sample = rows
    .slice(0, 50)
    .map((r) => cols.map((c) => String(r[c] ?? "")).join("\u0001"))
    .join("\u0002");
  const basis = `${cols.join(",")}|${rows.length}|${sample}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

// ---- Lightweight Gaussian Naive-Bayes accuracy evidence ----------------------
function chooseTarget(ds: Dataset): { col: string; type: "class" } | null {
  // Prefer a boolean / low-cardinality categorical column.
  const cat = ds.profiles
    .filter(
      (p) => (p.type === "boolean" || p.type === "categorical") && p.unique >= 2 && p.unique <= 20,
    )
    .sort((a, b) => a.unique - b.unique)[0];
  if (cat) return { col: cat.name, type: "class" };
  // Fall back: binarize a numeric column at its median.
  const num = ds.profiles.find((p) => p.type === "numeric" && (p.std ?? 0) > 0);
  if (num) return { col: num.name, type: "class" };
  return null;
}

function computeAccuracy(ds: Dataset): AccuracyEvidence {
  const target = chooseTarget(ds);
  const numericFeatures = ds.profiles
    .filter((p) => p.type === "numeric" && (p.std ?? 0) > 0 && p.name !== target?.col)
    .map((p) => p.name);

  if (!target || numericFeatures.length === 0) {
    return {
      score: Math.max(0, Math.min(1, ds.readinessScore / 100)),
      method: "data-readiness proxy (no suitable target/features)",
      target: target?.col ?? null,
      trainRows: 0,
      valRows: 0,
      baseline: 0,
    };
  }

  // Build labelled rows (cap at 8000 for speed).
  const targetProfile = ds.profiles.find((p) => p.name === target.col)!;
  const numericTarget = targetProfile.type === "numeric";
  const median = numericTarget ? (targetProfile.median ?? 0) : 0;
  const labelOf = (v: unknown): string => {
    if (isMissing(v)) return "\u0000missing";
    return numericTarget ? (Number(v) >= median ? "high" : "low") : String(v);
  };

  const data: { x: number[]; y: string }[] = [];
  for (const r of ds.rows) {
    if (isMissing(r[target.col])) continue;
    const x = numericFeatures.map((f) => {
      const n = Number(r[f]);
      return Number.isNaN(n) ? 0 : n;
    });
    data.push({ x, y: labelOf(r[target.col]) });
    if (data.length >= 8000) break;
  }
  if (data.length < 10) {
    return {
      score: Math.max(0, Math.min(1, ds.readinessScore / 100)),
      method: "data-readiness proxy (insufficient labelled rows)",
      target: target.col,
      trainRows: 0,
      valRows: 0,
      baseline: 0,
    };
  }

  // Deterministic 70/30 split.
  const cut = Math.floor(data.length * 0.7);
  const train = data.slice(0, cut);
  const val = data.slice(cut);

  // Gaussian NB fit per class.
  const classes = Array.from(new Set(train.map((d) => d.y)));
  const F = numericFeatures.length;
  const stats: Record<string, { count: number; mean: number[]; var: number[] }> = {};
  for (const c of classes)
    stats[c] = { count: 0, mean: new Array(F).fill(0), var: new Array(F).fill(0) };
  for (const d of train) {
    const s = stats[d.y];
    s.count++;
    for (let i = 0; i < F; i++) s.mean[i] += d.x[i];
  }
  for (const c of classes)
    for (let i = 0; i < F; i++) stats[c].mean[i] /= Math.max(1, stats[c].count);
  for (const d of train) {
    const s = stats[d.y];
    for (let i = 0; i < F; i++) {
      const dv = d.x[i] - s.mean[i];
      s.var[i] += dv * dv;
    }
  }
  for (const c of classes)
    for (let i = 0; i < F; i++)
      stats[c].var[i] = stats[c].var[i] / Math.max(1, stats[c].count) + 1e-6;

  const logPrior: Record<string, number> = {};
  for (const c of classes) logPrior[c] = Math.log(stats[c].count / train.length);

  const predict = (x: number[]): string => {
    let best = classes[0];
    let bestLp = -Infinity;
    for (const c of classes) {
      let lp = logPrior[c];
      const s = stats[c];
      for (let i = 0; i < F; i++) {
        const v = s.var[i];
        const diff = x[i] - s.mean[i];
        lp += -0.5 * Math.log(2 * Math.PI * v) - (diff * diff) / (2 * v);
      }
      if (lp > bestLp) {
        bestLp = lp;
        best = c;
      }
    }
    return best;
  };

  let correct = 0;
  for (const d of val) if (predict(d.x) === d.y) correct++;
  const score = val.length ? correct / val.length : 0;

  // Majority-class baseline.
  const counts: Record<string, number> = {};
  for (const d of train) counts[d.y] = (counts[d.y] ?? 0) + 1;
  let majority = 0;
  for (const c of Object.values(counts)) {
    if ((c as number) > majority) majority = c as number;
  }
  const baseline = train.length ? majority / train.length : 0;

  return {
    score,
    method: `Gaussian Naive-Bayes · ${F} numeric features · ${classes.length} classes`,
    target: target.col,
    trainRows: train.length,
    valRows: val.length,
    baseline,
  };
}

function buildChecks(ds: Dataset, acc: AccuracyEvidence): BenchCheck[] {
  const checks: BenchCheck[] = [];
  // Schema check
  const emptyCols = ds.profiles.filter((p) => p.missingPct >= 100).length;
  checks.push({
    name: "Schema integrity",
    passed: ds.colCount > 0 && emptyCols === 0,
    detail:
      emptyCols === 0
        ? `${ds.colCount} columns, none fully empty`
        : `${emptyCols} fully-empty column(s)`,
  });
  // Train/val split sanity
  const splitOk = acc.trainRows > 0 && acc.valRows > 0;
  checks.push({
    name: "Train/val split sanity",
    passed: splitOk,
    detail: splitOk
      ? `${acc.trainRows} train / ${acc.valRows} val rows`
      : "no usable model split (readiness proxy used)",
  });
  // Missing-value handling
  const missingPct =
    ds.rowCount * ds.colCount > 0 ? (ds.missingTotal / (ds.rowCount * ds.colCount)) * 100 : 0;
  checks.push({
    name: "Missing-value handling",
    passed: missingPct < 30,
    detail: `${missingPct.toFixed(1)}% cells missing`,
  });
  // Accuracy beats baseline
  checks.push({
    name: "Accuracy beats baseline",
    passed: splitOk ? acc.score >= acc.baseline : true,
    detail: splitOk
      ? `model ${(acc.score * 100).toFixed(1)}% vs baseline ${(acc.baseline * 100).toFixed(1)}%`
      : "n/a",
  });
  // Duplicate ratio
  const dupPct = ds.rowCount ? (ds.duplicateRows / ds.rowCount) * 100 : 0;
  checks.push({
    name: "Duplicate ratio",
    passed: dupPct < 10,
    detail: `${dupPct.toFixed(1)}% duplicate rows`,
  });
  return checks;
}

export interface RunOptions {
  /** number of repeated pipeline runs for latency percentiles (default 7). */
  iterations?: number;
  onProgress?: (phase: string, pct: number) => void;
}

export async function runBenchmark(
  name: string,
  rows: Record<string, unknown>[],
  opts: RunOptions = {},
): Promise<BenchRun> {
  const iterations = Math.max(3, opts.iterations ?? 7);
  const progress = opts.onProgress ?? (() => {});
  const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

  progress("Profiling dataset…", 8);
  const ds = buildDataset(name, rows);
  await yieldFrame();

  const cols = ds.colCount;
  const time = <T>(fn: () => T): [number, T] => {
    const t0 = performance.now();
    const out = fn();
    return [performance.now() - t0, out];
  };

  // Per-stage timings (single representative run).
  progress("Timing buildDataset…", 20);
  const [tBuild] = time(() => buildDataset(name, rows));
  await yieldFrame();
  progress("Timing correlation…", 35);
  const [tCorr] = time(() => correlationMatrix(ds));
  await yieldFrame();
  progress("Timing histogram…", 48);
  const numCol = ds.profiles.find((p) => p.type === "numeric");
  const vals = numCol
    ? rows.map((r) => Number(r[numCol.name])).filter((v) => !Number.isNaN(v))
    : [];
  const [tHist] = time(() => histogram(vals, 30));
  await yieldFrame();
  progress("Timing auto-clean…", 60);
  const [tClean] = time(() =>
    autoClean(ds, {
      actions: [
        "trimWhitespace",
        "fillMissingNumeric",
        "fillMissingCategorical",
        "dropDuplicateRows",
        "capOutliersIQR",
      ],
    }),
  );
  await yieldFrame();

  const stages: BenchStage[] = [
    { name: "buildDataset (profiling + table data)", ms: tBuild },
    { name: "correlationMatrix", ms: tCorr },
    { name: "histogram (chart prep)", ms: tHist },
    { name: "autoClean (all actions)", ms: tClean },
  ].map((s) => ({
    ...s,
    ms: +s.ms.toFixed(2),
    usPerRow: +((s.ms / Math.max(1, rows.length)) * 1000).toFixed(3),
  }));

  // Latency distribution over repeated full-pipeline runs.
  progress("Sampling latency distribution…", 72);
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const d = buildDataset(name, rows);
    correlationMatrix(d);
    histogram(vals, 30);
    samples.push(performance.now() - t0);
    if (i % 2 === 0) await yieldFrame();
    progress("Sampling latency distribution…", 72 + Math.round((i / iterations) * 12));
  }
  samples.sort((a, b) => a - b);
  const latency = {
    p50: +percentile(samples, 50).toFixed(2),
    p90: +percentile(samples, 90).toFixed(2),
    p99: +percentile(samples, 99).toFixed(2),
    max: +samples[samples.length - 1].toFixed(2),
    samples: samples.length,
  };

  progress("Evaluating accuracy evidence…", 90);
  const accuracy = computeAccuracy(ds);
  const checks = buildChecks(ds, accuracy);
  await yieldFrame();

  const totalMs = +stages.reduce((s, r) => s + r.ms, 0).toFixed(2);
  const verdict = totalMs < 1500 ? "EXCELLENT" : totalMs < 4000 ? "GOOD" : "REVIEW";
  const missingPct =
    ds.rowCount * ds.colCount > 0
      ? +((ds.missingTotal / (ds.rowCount * ds.colCount)) * 100).toFixed(2)
      : 0;
  const duplicatePct = ds.rowCount ? +((ds.duplicateRows / ds.rowCount) * 100).toFixed(2) : 0;

  progress("Done", 100);
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    datasetName: name,
    fingerprint: fingerprint(name, rows),
    rows: rows.length,
    cols,
    missingPct,
    duplicatePct,
    stages,
    totalMs,
    verdict,
    readiness: ds.readinessScore,
    latency,
    accuracy,
    checks,
  };
}
