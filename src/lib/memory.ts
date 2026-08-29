// DataIQ Pro Memory Management & Efficiency Engine
// Provides heap memory stats, row chunking, and columnar memory serialization.

export interface MemoryStats {
  usedHeapMb: number;
  totalHeapMb: number;
  heapLimitMb: number;
  usagePct: number;
}

/** Reads browser V8 memory metrics if available (Chrome/Edge/Brave). */
export function getMemoryUsage(): MemoryStats | null {
  if (typeof window === "undefined" || !("performance" in window)) return null;
  const perf = window.performance as unknown as {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };
  if (!perf.memory) return null;

  const used = perf.memory.usedJSHeapSize / (1024 * 1024);
  const total = perf.memory.totalJSHeapSize / (1024 * 1024);
  const limit = perf.memory.jsHeapSizeLimit / (1024 * 1024);
  const usagePct = limit > 0 ? (used / limit) * 100 : 0;

  return {
    usedHeapMb: Math.round(used * 10) / 10,
    totalHeapMb: Math.round(total * 10) / 10,
    heapLimitMb: Math.round(limit * 10) / 10,
    usagePct: Math.round(usagePct * 10) / 10,
  };
}

/** Splits an array into chunks of a maximum size for asynchronous processing. */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [array];
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
}

/** Estimates memory footprint of an in-memory dataset in bytes. */
export function estimateDatasetMemoryBytes(
  rows: Record<string, unknown>[],
  columns: string[],
): number {
  if (rows.length === 0) return 0;
  const sampleSize = Math.min(rows.length, 100);
  let sampleBytes = 0;

  for (let i = 0; i < sampleSize; i++) {
    const row = rows[i];
    for (const col of columns) {
      const val = row[col];
      if (val === null || val === undefined) {
        sampleBytes += 4;
      } else if (typeof val === "number") {
        sampleBytes += 8;
      } else if (typeof val === "boolean") {
        sampleBytes += 4;
      } else if (typeof val === "string") {
        sampleBytes += val.length * 2 + 16;
      } else {
        sampleBytes += 32;
      }
    }
  }

  const avgRowBytes = sampleBytes / sampleSize;
  return Math.round(avgRowBytes * rows.length);
}

/** Converts row-oriented objects into columnar typed/compact arrays to reduce object allocation overhead. */
export function rowsToColumnar(
  rows: Record<string, unknown>[],
  columns: string[],
): Record<string, (number | string | boolean | null)[]> {
  const result: Record<string, (number | string | boolean | null)[]> = {};
  const len = rows.length;

  for (const col of columns) {
    const arr = new Array(len);
    for (let i = 0; i < len; i++) {
      const v = rows[i][col];
      if (v === null || v === undefined) arr[i] = null;
      else if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") arr[i] = v;
      else arr[i] = String(v);
    }
    result[col] = arr;
  }

  return result;
}

/** Reconstructs row objects from columnar store on demand. */
export function columnarToRows(
  columnar: Record<string, (number | string | boolean | null)[]>,
  columns: string[],
  rowCount: number,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = new Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    const obj: Record<string, unknown> = {};
    for (const col of columns) {
      obj[col] = columnar[col] ? columnar[col][i] : null;
    }
    rows[i] = obj;
  }
  return rows;
}
