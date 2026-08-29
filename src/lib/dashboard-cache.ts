// Aggregation cache for dashboard visuals.
//
// Slicer changes re-aggregate every visual on the page. Because the aggregation
// only depends on (visual spec + filter signature), results are memoized in a
// bounded LRU so toggling a slicer back and forth is instant and re-renders
// avoid recomputation entirely.

export interface Point {
  x: string;
  y: number;
}

const MAX_ENTRIES = 240;
const cache = new Map<string, Point[]>();

/** Stable signature for the currently applied page filters. */
export function filterSignature(
  slicers: Record<string, string[]>,
  crossFilter: { col: string; val: string } | null,
  rowCount: number,
): string {
  const parts = Object.entries(slicers)
    .filter(([, v]) => v.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${[...v].sort().join(",")}`);
  if (crossFilter) parts.push(`~${crossFilter.col}=${crossFilter.val}`);
  return `${rowCount}|${parts.join("&")}`;
}

/** Memoize an aggregation. `compute` only runs on a cache miss. */
export function cachedAggregate(key: string, compute: () => Point[]): Point[] {
  const hit = cache.get(key);
  if (hit) {
    // Refresh recency for the LRU.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = compute();
  cache.set(key, value);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return value;
}

/** Drop everything (new dataset loaded, or data mutated in place). */
export function clearAggregateCache(): void {
  cache.clear();
}

export function aggregateCacheSize(): number {
  return cache.size;
}
