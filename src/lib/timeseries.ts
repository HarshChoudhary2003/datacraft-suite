// Pure TypeScript Time Series Engine — Seasonal Trend Decomposition & Z-Score Anomaly Detection

export interface TimeSeriesPoint {
  date: string;
  value: number;
  trend?: number;
  seasonal?: number;
  residual?: number;
  isAnomaly?: boolean;
}

export interface TimeSeriesResult {
  dateCol: string;
  valueCol: string;
  points: TimeSeriesPoint[];
  downsampledPoints: TimeSeriesPoint[];
  totalPoints: number;
  anomalyCount: number;
  period: number;
}

/**
 * Adaptive min-max downsampling for SVG charting.
 * Retains exact anomaly spikes, local extrema, and boundary points while keeping rendering fast and within maxPoints bound.
 */
export function downsampleTimeSeriesPoints(
  points: TimeSeriesPoint[],
  maxPoints = 800,
): TimeSeriesPoint[] {
  if (points.length <= maxPoints) return points;

  const bucketSize = points.length / maxPoints;
  const includedIndices = new Set<number>([0, points.length - 1]);

  for (let b = 0; b < maxPoints; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(points.length - 1, Math.floor((b + 1) * bucketSize));
    if (start >= end) continue;

    let minIdx = start;
    let maxIdx = start;
    let minVal = points[start].value;
    let maxVal = points[start].value;

    for (let i = start; i <= end; i++) {
      const pt = points[i];
      if (pt.isAnomaly) {
        includedIndices.add(i);
      }
      if (pt.value < minVal) {
        minVal = pt.value;
        minIdx = i;
      }
      if (pt.value > maxVal) {
        maxVal = pt.value;
        maxIdx = i;
      }
    }

    includedIndices.add(minIdx);
    includedIndices.add(maxIdx);
  }

  let sortedIndices = Array.from(includedIndices).sort((a, b) => a - b);

  // If accumulated anomalies + extrema exceeds maxPoints, subsample evenly to guarantee maxPoints ceiling
  if (sortedIndices.length > maxPoints) {
    const stride = sortedIndices.length / maxPoints;
    const cappedIndices: number[] = [sortedIndices[0]];
    for (let k = 1; k < maxPoints - 1; k++) {
      const idx = Math.floor(k * stride);
      cappedIndices.push(sortedIndices[idx]);
    }
    cappedIndices.push(sortedIndices[sortedIndices.length - 1]);
    sortedIndices = Array.from(new Set(cappedIndices)).sort((a, b) => a - b);
  }

  const result: TimeSeriesPoint[] = [];
  for (const idx of sortedIndices) {
    result.push(points[idx]);
  }

  return result;
}

export function decomposeTimeSeries(
  rows: Record<string, unknown>[],
  dateCol: string,
  valueCol: string,
  period = 7,
): TimeSeriesResult | null {
  if (!rows || rows.length === 0) return null;

  // 1. Single-pass mapping and date parsing
  const valid: { dateStr: string; ts: number; val: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rawDate = r[dateCol];
    const rawVal = r[valueCol];
    if (rawDate === undefined || rawDate === null || rawVal === undefined || rawVal === null) continue;

    const dateStr = String(rawDate);
    const ts = Date.parse(dateStr);
    const val = Number(rawVal);
    if (!isNaN(ts) && !isNaN(val)) {
      valid.push({ dateStr, ts, val });
    }
  }

  // Sort rows chronologically by pre-parsed timestamp
  valid.sort((a, b) => a.ts - b.ts);

  if (valid.length < period * 2) return null;

  const n = valid.length;
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    values[i] = valid[i].val;
  }

  // 2. High-performance O(N) Prefix-Sum Moving Average Trend Estimation
  const prefixSum = new Float64Array(n + 1);
  prefixSum[0] = 0;
  for (let i = 0; i < n; i++) {
    prefixSum[i + 1] = prefixSum[i] + values[i];
  }

  const trend = new Float64Array(n);
  const half = Math.floor(period / 2);

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(n - 1, i + half);
    const sum = prefixSum[end + 1] - prefixSum[start];
    trend[i] = sum / (end - start + 1);
  }

  // 3. Detrend & Compute Seasonal Indices
  const seasonalPattern = new Float64Array(period);
  const seasonalCounts = new Uint32Array(period);

  for (let i = 0; i < n; i++) {
    const pIdx = i % period;
    seasonalPattern[pIdx] += values[i] - trend[i];
    seasonalCounts[pIdx]++;
  }

  for (let p = 0; p < period; p++) {
    seasonalPattern[p] = seasonalCounts[p] > 0 ? seasonalPattern[p] / seasonalCounts[p] : 0;
  }

  // 4. Compute Residuals & Z-Score Anomaly Detection
  const residuals = new Float64Array(n);
  let resSum = 0;

  for (let i = 0; i < n; i++) {
    const seasonal = seasonalPattern[i % period];
    const res = values[i] - trend[i] - seasonal;
    residuals[i] = res;
    resSum += res;
  }

  const meanRes = resSum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = residuals[i] - meanRes;
    varSum += diff * diff;
  }

  const stdRes = Math.sqrt(varSum / Math.max(1, n - 1)) || 1;

  let anomalyCount = 0;
  const points: TimeSeriesPoint[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const zScore = Math.abs((residuals[i] - meanRes) / stdRes);
    const isAnomaly = zScore > 2.5;
    if (isAnomaly) anomalyCount++;

    const seasonal = seasonalPattern[i % period];
    points[i] = {
      date: valid[i].dateStr,
      value: valid[i].val,
      trend: +trend[i].toFixed(2),
      seasonal: +seasonal.toFixed(2),
      residual: +residuals[i].toFixed(2),
      isAnomaly,
    };
  }

  // Adaptive downsampling for chart UI rendering
  const downsampledPoints = downsampleTimeSeriesPoints(points, 800);

  return {
    dateCol,
    valueCol,
    points,
    downsampledPoints,
    totalPoints: n,
    anomalyCount,
    period,
  };
}
