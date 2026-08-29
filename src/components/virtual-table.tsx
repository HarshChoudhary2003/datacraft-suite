import { useRef, type CSSProperties, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface VTColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  className?: string;
  width?: string;
}

interface Props<T> {
  rows: T[];
  columns: VTColumn<T>[];
  rowHeight?: number;
  height?: number;
  estimateRowKey?: (row: T, i: number) => string;
  ariaLabel?: string;
  onRowClick?: (row: T) => void;
}

/**
 * Virtualized table for large datasets — only renders visible rows.
 * Falls back to a regular table when row count is small (<= 60).
 */
export function VirtualTable<T>({
  rows,
  columns,
  rowHeight = 36,
  height = 480,
  estimateRowKey,
  ariaLabel,
  onRowClick,
}: Props<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const useVirtual = rows.length > 60;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const gridTemplate: CSSProperties = {
    display: "grid",
    gridTemplateColumns: columns.map((c) => c.width ?? "minmax(80px,1fr)").join(" "),
  };

  return (
    <div className="w-full overflow-x-auto text-sm" role="table" aria-label={ariaLabel}>
      <div className="min-w-max">
        <div
          className="sticky top-0 z-10 bg-card border-b border-border text-xs text-muted-foreground font-medium"
          style={gridTemplate}
          role="row"
        >
          {columns.map((c) => (
            <div key={c.key} className={`px-3 py-2 ${c.className ?? ""}`} role="columnheader">
              {c.header}
            </div>
          ))}
        </div>

        {useVirtual ? (
          <div
            ref={parentRef}
            style={{ height, overflow: "auto", contain: "strict" }}
            aria-rowcount={rows.length}
          >
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const row = rows[vi.index];
                return (
                  <div
                    key={estimateRowKey?.(row, vi.index) ?? vi.key}
                    role="row"
                    className={`border-b border-border/60 hover:bg-muted/30 ${onRowClick ? "cursor-pointer" : ""}`}
                    onClick={() => onRowClick?.(row)}
                    style={{
                      ...gridTemplate,
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: vi.size,
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    {columns.map((c) => (
                      <div
                        key={c.key}
                        role="cell"
                        className={`px-3 py-2 truncate ${c.className ?? ""}`}
                      >
                        {c.cell(row, vi.index)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            {rows.map((row, i) => (
              <div
                key={estimateRowKey?.(row, i) ?? i}
                role="row"
                className={`border-b border-border/60 hover:bg-muted/30 ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={() => onRowClick?.(row)}
                style={gridTemplate}
              >
                {columns.map((c) => (
                  <div
                    key={c.key}
                    role="cell"
                    className={`px-3 py-2 truncate ${c.className ?? ""}`}
                  >
                    {c.cell(row, i)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
