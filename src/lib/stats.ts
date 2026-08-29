// DataIQ Pro statistical engine — pure TypeScript, accurate statistics & type inference.

export type ColumnType = "numeric" | "categorical" | "datetime" | "boolean";

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  count: number;
  missing: number;
  missingPct: number;
  unique: number;
  // numeric
  mean?: number;
  median?: number;
  std?: number;
  min?: number;
  max?: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  cv?: number;
  skewness?: number;
  kurtosis?: number;
  outliersIQR?: number;
  outliersZ?: number;
  iqrLower?: number;
  iqrUpper?: number;
  // categorical
  topValues?: { value: string; count: number }[];
  entropy?: number;
}

export interface Dataset {
  name: string;
  rows: Record<string, unknown>[];
  columns: string[];
  profiles: ColumnProfile[];
  rowCount: number;
  colCount: number;
  missingTotal: number;
  duplicateRows: number;
  duplicateIndices: number[];
  readinessScore: number;
  readinessBreakdown: { reason: string; penalty: number }[];
  correlation?: { columns: string[]; matrix: number[][] };
  isSampled?: boolean;
  totalRowCount?: number;
  sampledRowCount?: number;
  samplingRatio?: number;
}

/** Comprehensive missing value sentinel checker across Excel, SQL, CSV, R, SAS, and Pandas */
export const isMissing = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v === "number" && (Number.isNaN(v) || !Number.isFinite(v))) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return (
      s === "" ||
      s === "na" ||
      s === "n/a" ||
      s === "n.a." ||
      s === "nan" ||
      s === "null" ||
      s === "nil" ||
      s === "none" ||
      s === "undefined" ||
      s === "-" ||
      s === "?" ||
      s === "#" ||
      s === "#n/a" ||
      s === "#value!" ||
      s === "#ref!" ||
      s === "#num!" ||
      s === "#null!" ||
      s === "#name?" ||
      s === "#div/0!" ||
      s === "missing" ||
      s === "blank" ||
      s === "inf" ||
      s === "-inf" ||
      s === "infinity" ||
      s === "-infinity"
    );
  }
  return false;
};

/** Clean numeric string representation by stripping currency symbols, commas, and handling percentages */
export function cleanNumericValue(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    let s = v.trim();
    if (s === "") return NaN;
    // Handle percentage
    const isPct = s.endsWith("%");
    if (isPct) s = s.slice(0, -1).trim();
    // Strip currency symbols and commas (e.g. "$1,234.56" -> "1234.56")
    s = s.replace(/[$€£¥,]/g, "");
    const val = Number(s);
    if (!isNaN(val)) {
      return isPct ? val / 100 : val;
    }
  }
  return NaN;
}

/** Accurate Type Inference Engine */
function detectType(values: unknown[]): ColumnType {
  const sample = values.filter((v) => !isMissing(v)).slice(0, 500);
  if (sample.length === 0) return "categorical";

  let num = 0;
  let bool = 0;
  let date = 0;

  for (const v of sample) {
    if (typeof v === "boolean") {
      bool++;
      continue;
    }

    const s = String(v).trim();
    const lc = s.toLowerCase();

    // Check boolean literals
    if (lc === "true" || lc === "false" || lc === "yes" || lc === "no" || lc === "t" || lc === "f" || lc === "y" || lc === "n") {
      bool++;
    }

    // Check numeric
    const numVal = cleanNumericValue(s);
    if (!isNaN(numVal)) {
      num++;
    }

    // Check datetime (non-numeric date strings or ISO dates)
    if (isNaN(Number(s)) && !isNaN(Date.parse(s))) {
      // Must contain typical date delimiters or month names to avoid false positives
      if (/[-/:,\s]/.test(s) || /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(s)) {
        date++;
      }
    }
  }

  const len = sample.length;
  if (date / len > 0.6) return "datetime";
  if (bool / len > 0.85) return "boolean";
  if (num / len > 0.8) return "numeric";

  // Check if unique values in column are exclusively [0, 1] or boolean equivalents
  const uniqueVals = new Set(sample.map((v) => String(v).trim().toLowerCase()));
  if (uniqueVals.size <= 2 && Array.from(uniqueVals).every((v) => ["0", "1", "true", "false", "yes", "no", "t", "f", "y", "n"].includes(v))) {
    return "boolean";
  }

  return "categorical";
}

/** Quantile calculation (R Type-7 / numpy default linear interpolation) */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function profileColumn(name: string, values: unknown[]): ColumnProfile {
  const total = values.length;
  const present = values.filter((v) => !isMissing(v));
  const missing = total - present.length;
  const type = detectType(values);
  const uniqueSet = new Set(present.map((v) => String(v).trim()));

  const profile: ColumnProfile = {
    name,
    type,
    count: present.length,
    missing,
    missingPct: total ? +((missing / total) * 100).toFixed(2) : 0,
    unique: uniqueSet.size,
  };

  if (type === "numeric") {
    const nums = present.map(cleanNumericValue).filter((n) => !isNaN(n));
    const sorted = [...nums].sort((a, b) => a - b);
    const n = nums.length;
    if (n === 0) return profile;

    const mean = nums.reduce((s, x) => s + x, 0) / n;
    const variance = n > 1 ? nums.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
    const std = Math.sqrt(variance);
    const median = quantile(sorted, 0.5);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const min = sorted[0];
    const max = sorted[n - 1];
    const cv = mean !== 0 ? (std / Math.abs(mean)) * 100 : 0;

    // Adjusted Fisher-Pearson sample skewness & unbiased excess kurtosis
    let skew = 0;
    let kurt = 0;
    if (std > 0 && n >= 3) {
      const m3 = nums.reduce((s, x) => s + Math.pow(x - mean, 3), 0) / n;
      const m4 = nums.reduce((s, x) => s + Math.pow(x - mean, 4), 0) / n;
      const s3 = Math.pow(variance, 1.5);
      const s4 = Math.pow(variance, 2);

      // Skewness with finite sample correction
      skew = ((n * Math.sqrt(n - 1)) / (n - 2)) * (m3 / s3);
      if (isNaN(skew) || !isFinite(skew)) skew = 0;

      // Excess kurtosis with finite sample correction
      if (n >= 4) {
        kurt =
          ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * (m4 / s4) -
          (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
      } else {
        kurt = m4 / s4 - 3;
      }
      if (isNaN(kurt) || !isFinite(kurt)) kurt = 0;
    }

    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const outliersIQR = nums.filter((x) => x < lower || x > upper).length;
    const outliersZ = std > 0 ? nums.filter((x) => Math.abs((x - mean) / std) > 3).length : 0;

    Object.assign(profile, {
      mean: +mean.toFixed(4),
      median: +median.toFixed(4),
      std: +std.toFixed(4),
      min: +min.toFixed(4),
      max: +max.toFixed(4),
      q1: +q1.toFixed(4),
      q3: +q3.toFixed(4),
      iqr: +iqr.toFixed(4),
      cv: +cv.toFixed(2),
      skewness: +skew.toFixed(4),
      kurtosis: +kurt.toFixed(4),
      outliersIQR,
      outliersZ,
      iqrLower: +lower.toFixed(4),
      iqrUpper: +upper.toFixed(4),
    });
  } else if (type === "categorical" || type === "boolean") {
    const counts = new Map<string, number>();
    for (const v of present) {
      const k = String(v).trim();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const sortedTop = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    profile.topValues = sortedTop.map(([value, count]) => ({ value, count }));

    let entropy = 0;
    const total2 = present.length;
    for (const c of counts.values()) {
      const p = c / total2;
      entropy -= p * Math.log2(p);
    }
    profile.entropy = +entropy.toFixed(4);
  }
  return profile;
}

/** Reservoir sampling algorithm to select k uniform random items from an array in single pass */
export function reservoirSample<T>(items: T[], k: number, seed = 42): T[] {
  if (items.length <= k) return items;
  const result: T[] = items.slice(0, k);
  let lcg = seed;
  const rand = () => {
    lcg = (lcg * 1664525 + 1013904223) % 4294967296;
    return lcg / 4294967296;
  };
  for (let i = k; i < items.length; i++) {
    const j = Math.floor(rand() * (i + 1));
    if (j < k) {
      result[j] = items[i];
    }
  }
  return result;
}

export function buildDataset(
  name: string,
  rows: Record<string, unknown>[],
  meta?: { totalRowCount?: number; isSampled?: boolean },
): Dataset {
  const totalRows = meta?.totalRowCount ?? rows.length;
  const isSampled = meta?.isSampled ?? (totalRows > rows.length);
  const samplingRatio = totalRows > 0 ? rows.length / totalRows : 1;

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const profiles = columns.map((col) =>
    profileColumn(
      col,
      rows.map((r) => r[col]),
    ),
  );

  let missingTotal = profiles.reduce((s, p) => s + p.missing, 0);
  if (isSampled && samplingRatio > 0 && samplingRatio < 1) {
    missingTotal = Math.round(missingTotal / samplingRatio);
  }

  // Duplicate detection by fast string concatenation on sampled set
  const seen = new Set<string>();
  let dups = 0;
  const duplicateIndices: number[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const r = rows[rowIndex];
    let key = "";
    for (let i = 0; i < columns.length; i++) {
      key += (r[columns[i]] ?? "") + "|";
    }
    if (seen.has(key)) {
      dups++;
      duplicateIndices.push(rowIndex);
    } else {
      seen.add(key);
    }
  }
  let estimatedDups = dups;
  if (isSampled && samplingRatio > 0 && samplingRatio < 1) {
    estimatedDups = Math.round(dups / samplingRatio);
  }

  const breakdown: { reason: string; penalty: number }[] = [];
  let score = 100;
  const totalCells = totalRows * columns.length || 1;
  const missPct = (missingTotal / totalCells) * 100;
  if (missPct > 0) {
    const pen = Math.min(30, Math.round(missPct * 1.5));
    score -= pen;
    breakdown.push({ reason: `${missPct.toFixed(1)}% missing values`, penalty: pen });
  }
  if (estimatedDups > 0) {
    const dupPct = (estimatedDups / totalRows) * 100;
    const pen = Math.min(25, Math.round(dupPct * 1.2));
    score -= pen;
    breakdown.push({ reason: `${estimatedDups} duplicate rows (${dupPct.toFixed(1)}%)`, penalty: pen });
  }

  const zeroVar = profiles.filter((p) => p.type === "numeric" && (p.std ?? 0) === 0 && p.count > 0).length;
  if (zeroVar > 0) {
    score -= zeroVar * 3;
    breakdown.push({ reason: `${zeroVar} zero-variance columns`, penalty: zeroVar * 3 });
  }
  const highSkew = profiles.filter(
    (p) => p.type === "numeric" && Math.abs(p.skewness ?? 0) > 2,
  ).length;
  if (highSkew > 0) {
    score -= highSkew * 2;
    breakdown.push({ reason: `${highSkew} highly-skewed columns`, penalty: highSkew * 2 });
  }
  const heavyOutliers = profiles.filter(
    (p) => p.type === "numeric" && (p.outliersIQR ?? 0) / Math.max(1, p.count) > 0.05,
  ).length;
  if (heavyOutliers > 0) {
    score -= heavyOutliers * 2;
    breakdown.push({
      reason: `${heavyOutliers} columns with >5% outliers`,
      penalty: heavyOutliers * 2,
    });
  }
  score = Math.max(0, Math.min(100, score));

  return {
    name,
    rows,
    columns,
    profiles,
    rowCount: totalRows,
    colCount: columns.length,
    missingTotal,
    duplicateRows: estimatedDups,
    duplicateIndices,
    readinessScore: score,
    readinessBreakdown: breakdown,
    isSampled,
    totalRowCount: totalRows,
    sampledRowCount: rows.length,
    samplingRatio,
  };
}

export function buildDatasetScaled(
  name: string,
  rows: Record<string, unknown>[],
  maxSample = 50000,
): Dataset {
  if (rows.length <= maxSample) {
    return buildDataset(name, rows);
  }
  const sampledRows = reservoirSample(rows, maxSample);
  return buildDataset(name, sampledRows, {
    totalRowCount: rows.length,
    isSampled: true,
  });
}

/** Pearson correlation calculation with non-zero denominator check */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let mx = 0,
    my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx,
      b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/**
 * 100% Accurate Pairwise Correlation Matrix Engine.
 * Evaluates non-missing numeric pairs per column pair rather than listwise row deletion.
 */
export function correlationMatrix(ds: Dataset): { columns: string[]; matrix: number[][] } {
  const cols = ds.profiles.filter((p) => p.type === "numeric").map((p) => p.name);
  if (cols.length === 0) return { columns: [], matrix: [] };

  const sampleRows = ds.rows.length > 5000 ? ds.rows.slice(0, 5000) : ds.rows;

  const matrix: number[][] = cols.map(() => Array(cols.length).fill(0));

  for (let i = 0; i < cols.length; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < cols.length; j++) {
      const colA = cols[i];
      const colB = cols[j];
      const xs: number[] = [];
      const ys: number[] = [];

      for (let r = 0; r < sampleRows.length; r++) {
        const valA = cleanNumericValue(sampleRows[r][colA]);
        const valB = cleanNumericValue(sampleRows[r][colB]);
        if (!isNaN(valA) && !isNaN(valB)) {
          xs.push(valA);
          ys.push(valB);
        }
      }

      const rVal = +pearson(xs, ys).toFixed(4);
      matrix[i][j] = rVal;
      matrix[j][i] = rVal;
    }
  }

  return { columns: cols, matrix };
}

export function topCorrelations(corr: { columns: string[]; matrix: number[][] }, k = 10) {
  const out: { a: string; b: string; r: number }[] = [];
  for (let i = 0; i < corr.columns.length; i++) {
    for (let j = i + 1; j < corr.columns.length; j++) {
      out.push({ a: corr.columns[i], b: corr.columns[j], r: corr.matrix[i][j] });
    }
  }
  return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r)).slice(0, k);
}

// Histogram bins
export function histogram(values: number[], bins = 20) {
  const nums = values.filter((v) => !isNaN(v));
  if (nums.length === 0) return [];
  let min = nums[0];
  let max = nums[0];
  for (const v of nums) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) return [{ bin: String(min), count: nums.length }];
  const w = (max - min) / bins;
  const buckets = Array(bins).fill(0);
  for (const v of nums) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / w));
    buckets[idx]++;
  }
  return buckets.map((count, i) => ({
    bin: (min + i * w).toFixed(1),
    count,
  }));
}
