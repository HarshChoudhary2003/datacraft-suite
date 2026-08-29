// Reusable advanced chart filter bar.
// Lets users pick columns, time ranges (for datetime cols), and numeric thresholds.
import { useMemo, useState, useEffect } from "react";
import type { Dataset } from "@/lib/stats";
import { Filter, X, ChevronDown } from "lucide-react";

export interface ChartFilterState {
  selectedColumns: string[];
  timeColumn: string | null;
  timeRange: [number, number] | null; // ms timestamps
  thresholds: Record<string, [number, number]>; // column → [min, max]
}

interface Props {
  dataset: Dataset;
  state: ChartFilterState;
  onChange: (s: ChartFilterState) => void;
  /** Restrict column picker to a type. */
  columnType?: "numeric" | "categorical" | "datetime" | "any";
  /** Max columns selectable (default unlimited). */
  maxColumns?: number;
}

export function makeInitialFilterState(
  ds: Dataset,
  type: Props["columnType"] = "numeric",
): ChartFilterState {
  const cols = ds.profiles.filter((p) => type === "any" || p.type === type).map((p) => p.name);
  const dateCol = ds.profiles.find((p) => p.type === "datetime")?.name ?? null;
  const thresholds: Record<string, [number, number]> = {};
  for (const p of ds.profiles) {
    if (p.type === "numeric" && p.min !== undefined && p.max !== undefined) {
      thresholds[p.name] = [p.min, p.max];
    }
  }
  let timeRange: [number, number] | null = null;
  if (dateCol) {
    const stamps = ds.rows.map((r) => Date.parse(String(r[dateCol]))).filter((n) => !isNaN(n));
    if (stamps.length) {
      let min = stamps[0];
      let max = stamps[0];
      for (let j = 1; j < stamps.length; j++) {
        if (stamps[j] < min) min = stamps[j];
        if (stamps[j] > max) max = stamps[j];
      }
      timeRange = [min, max];
    }
  }
  return { selectedColumns: cols.slice(0, 5), timeColumn: dateCol, timeRange, thresholds };
}

/** Apply filters to dataset rows. Returns filtered rows. */
export function applyFilters(ds: Dataset, state: ChartFilterState): Record<string, unknown>[] {
  return ds.rows.filter((r) => {
    if (state.timeColumn && state.timeRange) {
      const t = Date.parse(String(r[state.timeColumn]));
      if (isNaN(t) || t < state.timeRange[0] || t > state.timeRange[1]) return false;
    }
    for (const [col, [lo, hi]] of Object.entries(state.thresholds)) {
      if (!state.selectedColumns.includes(col)) continue;
      const v = Number(r[col]);
      if (isNaN(v)) continue;
      if (v < lo || v > hi) return false;
    }
    return true;
  });
}

export function ChartFilters({
  dataset,
  state,
  onChange,
  columnType = "numeric",
  maxColumns,
}: Props) {
  const [open, setOpen] = useState(false);
  const availableColumns = useMemo(
    () =>
      dataset.profiles
        .filter((p) => columnType === "any" || p.type === columnType)
        .map((p) => p.name),
    [dataset, columnType],
  );
  const dateColumns = useMemo(
    () => dataset.profiles.filter((p) => p.type === "datetime").map((p) => p.name),
    [dataset],
  );

  // Ensure all selected cols are valid
  useEffect(() => {
    const valid = state.selectedColumns.filter((c) => availableColumns.includes(c));
    if (valid.length !== state.selectedColumns.length)
      onChange({ ...state, selectedColumns: valid });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableColumns]);

  const toggleCol = (c: string) => {
    const has = state.selectedColumns.includes(c);
    if (has) onChange({ ...state, selectedColumns: state.selectedColumns.filter((x) => x !== c) });
    else {
      if (maxColumns && state.selectedColumns.length >= maxColumns) {
        onChange({ ...state, selectedColumns: [...state.selectedColumns.slice(1), c] });
      } else {
        onChange({ ...state, selectedColumns: [...state.selectedColumns, c] });
      }
    }
  };

  const setThreshold = (col: string, idx: 0 | 1, val: number) => {
    const cur = state.thresholds[col] ?? [0, 0];
    const next: [number, number] = [...cur] as [number, number];
    next[idx] = val;
    onChange({ ...state, thresholds: { ...state.thresholds, [col]: next } });
  };

  const setTimeRange = (idx: 0 | 1, val: number) => {
    if (!state.timeRange) return;
    const next: [number, number] = [...state.timeRange] as [number, number];
    next[idx] = val;
    onChange({ ...state, timeRange: next });
  };

  const activeCount =
    state.selectedColumns.length +
    (state.timeColumn ? 1 : 0) +
    Object.entries(state.thresholds).filter(([col, [lo, hi]]) => {
      const p = dataset.profiles.find((pp) => pp.name === col);
      return p && (lo > (p.min ?? -Infinity) || hi < (p.max ?? Infinity));
    }).length;

  return (
    <div className="neo-sm p-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <Filter className="size-4 text-primary" />
          Advanced filters
          <span className="neo-inset px-2 py-0.5 text-xs font-mono">{activeCount}</span>
        </span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          {/* Columns */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              Columns {maxColumns ? `(max ${maxColumns})` : ""}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableColumns.map((c) => {
                const on = state.selectedColumns.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCol(c)}
                    className={`px-2.5 py-1 text-xs rounded-lg shrink-0 transition-all ${on ? "neo-inset text-primary font-semibold" : "neo-btn"}`}
                  >
                    {c}
                    {on && <X className="size-3 inline ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time range */}
          {dateColumns.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Time range</div>
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  className="neo-btn px-2 py-1 text-xs bg-transparent"
                  value={state.timeColumn ?? ""}
                  onChange={(e) => {
                    const col = e.target.value || null;
                    let range: [number, number] | null = null;
                    if (col) {
                      const stamps = dataset.rows
                        .map((r) => Date.parse(String(r[col])))
                        .filter((n) => !isNaN(n));
                      if (stamps.length) {
                        let min = stamps[0];
                        let max = stamps[0];
                        for (let j = 1; j < stamps.length; j++) {
                          if (stamps[j] < min) min = stamps[j];
                          if (stamps[j] > max) max = stamps[j];
                        }
                        range = [min, max];
                      }
                    }
                    onChange({ ...state, timeColumn: col, timeRange: range });
                  }}
                >
                  <option value="">— none —</option>
                  {dateColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {state.timeColumn && state.timeRange && (
                  <>
                    <input
                      type="date"
                      className="neo-btn px-2 py-1 text-xs bg-transparent"
                      value={new Date(state.timeRange[0]).toISOString().slice(0, 10)}
                      onChange={(e) => setTimeRange(0, new Date(e.target.value).getTime())}
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <input
                      type="date"
                      className="neo-btn px-2 py-1 text-xs bg-transparent"
                      value={new Date(state.timeRange[1]).toISOString().slice(0, 10)}
                      onChange={(e) => setTimeRange(1, new Date(e.target.value).getTime())}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Thresholds */}
          {state.selectedColumns.filter((c) => state.thresholds[c]).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Thresholds</div>
              <div className="space-y-2">
                {state.selectedColumns
                  .filter((c) => state.thresholds[c])
                  .map((c) => {
                    const p = dataset.profiles.find((pp) => pp.name === c);
                    if (!p || p.type !== "numeric") return null;
                    const [lo, hi] = state.thresholds[c];
                    const min = p.min ?? 0;
                    const max = p.max ?? 100;
                    return (
                      <div key={c} className="flex items-center gap-2 text-xs">
                        <span className="w-32 truncate font-medium">{c}</span>
                        <input
                          type="number"
                          step="any"
                          className="neo-btn px-2 py-1 w-24 bg-transparent font-mono"
                          value={lo}
                          min={min}
                          max={max}
                          onChange={(e) => setThreshold(c, 0, Number(e.target.value))}
                        />
                        <span className="text-muted-foreground">to</span>
                        <input
                          type="number"
                          step="any"
                          className="neo-btn px-2 py-1 w-24 bg-transparent font-mono"
                          value={hi}
                          min={min}
                          max={max}
                          onChange={(e) => setThreshold(c, 1, Number(e.target.value))}
                        />
                        <span className="text-muted-foreground">
                          (range {min.toFixed?.(2) ?? min} – {max.toFixed?.(2) ?? max})
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <button
            onClick={() => onChange(makeInitialFilterState(dataset, columnType))}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
