import { useMemo } from "react";
import { motion } from "framer-motion";
import { X, Download, Table2 } from "lucide-react";
import { VirtualTable, type VTColumn } from "@/components/virtual-table";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { downloadCSV } from "@/lib/csv";
import { formatValue } from "@/lib/number-format";
import type { Dataset } from "@/lib/stats";

export interface DrillSpec {
  /** Visual the drill was launched from. */
  title: string;
  /** Dimension + value when drilling from a bar/slice/point (absent for KPIs). */
  column?: string;
  value?: string;
  /** Additional dimension filters for a selected breakdown series. */
  filters?: Array<{ column: string; value: string }>;
  /** Measure column, when the source visual had one. */
  measure?: string;
  /** Human-readable description of the source aggregation. */
  caption?: string;
}

type Row = Record<string, unknown>;

/**
 * Drill-through detail view: the underlying rows behind a clicked KPI or chart
 * segment, with per-measure aggregations and a CSV download of exactly the
 * filtered rows shown.
 */
export function DrillThrough({
  spec,
  dataset,
  activeFilters,
  onClose,
}: {
  spec: DrillSpec;
  /** Page-level filtered dataset (slicers + cross-filter already applied). */
  dataset: Dataset;
  activeFilters: string[];
  onClose: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);

  const rows = useMemo<Row[]>(() => {
    const filters = [
      ...(spec.column && spec.value !== undefined
        ? [{ column: spec.column, value: spec.value }]
        : []),
      ...(spec.filters ?? []),
    ];
    if (filters.length === 0) return dataset.rows;
    return dataset.rows.filter((r) =>
      filters.every(({ column, value }) => String(r[column] ?? "") === value),
    );
  }, [dataset, spec.column, spec.value, spec.filters]);

  const numericCols = useMemo(
    () => dataset.profiles.filter((p) => p.type === "numeric").map((p) => p.name),
    [dataset],
  );

  const aggregations = useMemo(() => {
    const measures =
      spec.measure && numericCols.includes(spec.measure)
        ? [spec.measure, ...numericCols.filter((c) => c !== spec.measure)]
        : numericCols;
    return measures.slice(0, 6).map((col) => {
      const vals = rows.map((r) => Number(r[col])).filter((n) => !isNaN(n));
      const sum = vals.reduce((a, b) => a + b, 0);
      return {
        col,
        count: vals.length,
        sum,
        avg: vals.length ? sum / vals.length : 0,
        min: vals.length ? Math.min(...vals) : 0,
        max: vals.length ? Math.max(...vals) : 0,
      };
    });
  }, [rows, numericCols, spec.measure]);

  const columns: VTColumn<Row>[] = useMemo(
    () =>
      dataset.columns.slice(0, 14).map((c) => ({
        key: c,
        header: c,
        width: "minmax(120px,1fr)",
        cell: (r) => {
          const v = r[c];
          return v === null || v === undefined || v === "" ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            String(v)
          );
        },
      })),
    [dataset.columns],
  );

  const exportRows = () => {
    const name = `drill_${(spec.column ?? spec.title).replace(/\W+/g, "_")}${spec.value ? `_${spec.value.replace(/\W+/g, "_")}` : ""}`;
    downloadCSV(name, rows as Record<string, unknown>[], dataset.columns);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <motion.div
        ref={trapRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drill-through-title"
        aria-describedby="drill-through-desc"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="bento-card flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden outline-none"
      >
        <header className="flex flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
              <Table2 className="size-3.5" /> Drill-through
            </div>
            <h2
              id="drill-through-title"
              className="mt-1 truncate text-base font-bold tracking-tight sm:text-lg"
            >
              {spec.column ? `${spec.column}: ${spec.value}` : spec.title}
            </h2>
            <p id="drill-through-desc" className="mt-0.5 text-xs text-muted-foreground">
              {rows.length.toLocaleString()} of {dataset.rowCount.toLocaleString()} rows in scope
              {spec.caption ? ` · ${spec.caption}` : ""}
            </p>
            {activeFilters.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeFilters.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={exportRows}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
            >
              <Download className="size-3.5" /> CSV
            </button>
            <button
              onClick={onClose}
              aria-label="Close drill-through"
              className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {aggregations.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {aggregations.map((a) => (
                <div key={a.col} className="rounded-2xl border border-border bg-background/50 p-3">
                  <div className="truncate text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {a.col}
                  </div>
                  <div className="mt-1 truncate text-xl font-black tabular-nums tracking-tight">
                    {formatValue(a.sum, { format: "compact" })}
                  </div>
                  <dl className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <dt>Avg</dt>
                      <dd className="tabular-nums">
                        {formatValue(a.avg, { format: "full", decimals: 2 })}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Min / Max</dt>
                      <dd className="tabular-nums">
                        {formatValue(a.min, { format: "compact" })} /{" "}
                        {formatValue(a.max, { format: "compact" })}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Non-null</dt>
                      <dd className="tabular-nums">{a.count.toLocaleString()}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <VirtualTable
              rows={rows}
              columns={columns}
              height={420}
              ariaLabel="Underlying rows"
              estimateRowKey={(_r, i) => `row-${i}`}
            />
            {rows.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No rows match this selection.
              </div>
            )}
          </div>
          {dataset.columns.length > 14 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Showing the first 14 columns — the CSV download includes all {dataset.columns.length}.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
