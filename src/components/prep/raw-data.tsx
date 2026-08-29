import { useDataset } from "@/store/dataset-context";
import { VirtualTable, type VTColumn } from "@/components/virtual-table";
import { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  Database,
  ListFilter,
  Edit3,
  Save,
  XCircle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { toast } from "sonner";

const STAGGER: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const ITEM: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export function RawDataPage() {
  const { dataset, processRows } = useDataset();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchCol, setSearchCol] = useState<string>("__all__");
  const [editMode, setEditMode] = useState(false);
  const [activeEditCell, setActiveEditCell] = useState<{ row: number; col: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draftRows, setDraftRows] = useState<Record<string, unknown>[] | null>(null);
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(
    null,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState(800);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTableHeight(Math.max(100, entry.contentRect.height));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleCellEdit = (rowIndex: number, colName: string, newValue: unknown) => {
    setDraftRows((prev) => {
      if (!prev) return prev;
      const newDrafts = [...prev];
      newDrafts[rowIndex] = { ...newDrafts[rowIndex], [colName]: newValue };
      return newDrafts;
    });

    setEditedCells((prev) => {
      const next = new Set(prev);
      next.add(`${rowIndex}-${colName}`);
      return next;
    });
  };

  type RowWrapper = { original: Record<string, unknown>; originalIndex: number };

  // Define Columns dynamically
  const columns: VTColumn<RowWrapper>[] = useMemo(() => {
    if (!dataset) return [];

    const handleSort = (colKey: string) => {
      let direction: "asc" | "desc" = "asc";
      if (sortConfig && sortConfig.key === colKey && sortConfig.direction === "asc") {
        direction = "desc";
      }
      setSortConfig({ key: colKey, direction });
    };

    // Add row index as the first column
    const cols: VTColumn<RowWrapper>[] = [
      {
        key: "__index",
        header: <div className="text-muted-foreground w-12 text-center">#</div>,
        cell: (rowWrapper: { originalIndex: number; original: Record<string, unknown> }) => (
          <div className="text-muted-foreground w-12 text-center text-xs">
            {rowWrapper.originalIndex + 1}
          </div>
        ),
        width: "60px",
      },
    ];

    cols.push(
      ...dataset.columns.map((c) => ({
        key: c,
        header: (
          <div
            className="font-semibold text-sm truncate px-3 py-2 text-primary bg-primary/5 rounded-md cursor-pointer hover:bg-primary/10 transition-colors flex items-center justify-between gap-2 group"
            title={`Sort by ${c}`}
            onClick={() => handleSort(c)}
          >
            <span className="truncate">{c}</span>
            {sortConfig?.key === c ? (
              sortConfig.direction === "asc" ? (
                <ArrowUp className="size-3 shrink-0" />
              ) : (
                <ArrowDown className="size-3 shrink-0" />
              )
            ) : (
              <ArrowUp className="size-3 opacity-0 shrink-0 group-hover:opacity-30 transition-opacity" />
            )}
          </div>
        ),
        cell: (rowWrapper: { originalIndex: number; original: Record<string, unknown> }) => {
          const r = rowWrapper.original as Record<string, unknown>;
          const i = rowWrapper.originalIndex as number;
          const val = r[c];
          const isNull = val === null || val === undefined || val === "";
          const isEdited = editedCells.has(`${i}-${c}`);
          const isEditingCell = activeEditCell?.row === i && activeEditCell?.col === c;

          if (editMode) {
            if (isEditingCell) {
              return (
                <div
                  className={`px-1 py-1 h-full flex items-center transition-colors ${isEdited ? "bg-primary/10 rounded-md" : ""}`}
                >
                  <input
                    autoFocus
                    defaultValue={isNull ? "" : String(val)}
                    onBlur={(e) => {
                      let newVal: string | number | null = e.target.value;
                      if (newVal === "") newVal = null;
                      else if (!isNaN(Number(newVal)) && newVal.trim() !== "")
                        newVal = Number(newVal);

                      if (newVal !== r[c]) {
                        handleCellEdit(i, c, newVal);
                      }
                      setActiveEditCell(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                      if (e.key === "Escape") {
                        setActiveEditCell(null);
                      }
                    }}
                    className={`w-full h-full neo-inset px-2 py-1 text-sm bg-transparent rounded-md focus:outline-none focus:ring-1 focus:ring-primary transition-all ${isEdited ? "text-primary font-medium border border-primary/20 shadow-[0_0_10px_rgba(var(--primary),0.1)]" : "border-none"}`}
                  />
                </div>
              );
            } else {
              return (
                <div
                  className={`truncate px-3 py-1.5 text-sm cursor-text hover:bg-primary/5 transition-colors h-full flex items-center ${isEdited ? "bg-primary/10 rounded-md text-primary font-medium" : ""}`}
                  onClick={() => setActiveEditCell({ row: i, col: c })}
                  title="Click to edit"
                >
                  {isNull ? (
                    <span className="text-muted-foreground opacity-50 italic">null</span>
                  ) : (
                    String(val)
                  )}
                </div>
              );
            }
          }

          return (
            <div
              className={`truncate px-3 py-1.5 text-sm h-full flex items-center cursor-pointer hover:bg-primary/5 transition-colors ${
                isEdited ? "bg-primary/10 rounded-md text-primary font-medium" : ""
              }`}
              onDoubleClick={() => {
                if (!editMode && dataset) {
                  setDraftRows(structuredClone(dataset.rows));
                  setEditMode(true);
                  setEditedCells(new Set());
                }
                setActiveEditCell({ row: i, col: c });
              }}
              title="Double click to edit cell"
            >
              {isNull ? (
                <span className="text-muted-foreground opacity-50 italic">null</span>
              ) : (
                String(val)
              )}
            </div>
          );
        },
        width: "180px",
      })),
    );

    return cols;
  }, [dataset, editMode, editedCells, activeEditCell, sortConfig]);

  // Filter Rows
  const processedIndices = useMemo(() => {
    if (!dataset) return [];
    let indices = Array.from({ length: dataset.rows.length }, (_, i) => i);

    // Filter
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      indices = indices.filter((i) => {
        const r = dataset.rows[i] as Record<string, unknown>;
        if (searchCol === "__all__") {
          return dataset.columns.some((c) =>
            String(r[c] ?? "")
              .toLowerCase()
              .includes(lower),
          );
        } else {
          return String(r[searchCol] ?? "")
            .toLowerCase()
            .includes(lower);
        }
      });
    }

    // Sort
    if (sortConfig !== null) {
      indices.sort((i, j) => {
        const aVal = (dataset.rows[i] as Record<string, unknown>)[sortConfig.key];
        const bVal = (dataset.rows[j] as Record<string, unknown>)[sortConfig.key];
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
        }

        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        if (aStr < bStr) return sortConfig.direction === "asc" ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return indices;
  }, [dataset, debouncedSearch, searchCol, sortConfig]);

  const tableRows = useMemo(() => {
    if (!dataset) return [];
    const sourceRows = editMode && draftRows ? draftRows : dataset.rows;
    return processedIndices.map((i) => ({
      original: sourceRows[i],
      originalIndex: i,
    }));
  }, [processedIndices, editMode, draftRows, dataset]);

  const handleSave = async () => {
    if (!draftRows || !dataset) return;
    setIsSaving(true);
    try {
      await processRows(dataset.name, draftRows);
      setDraftRows(null);
      setEditMode(false);
      setEditedCells(new Set());
      toast.success("Changes saved successfully!");
    } catch (e: unknown) {
      console.error("Failed to save changes:", e);
      toast.error(
        (e instanceof Error ? e.message : "") || "Failed to save changes. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = () => {
    if (!dataset) return;
    setSearchInput("");
    setDebouncedSearch("");
    setDraftRows(structuredClone(dataset.rows));
    setEditMode(true);
    setEditedCells(new Set());
    setActiveEditCell(null);
  };

  const cancelEdit = () => {
    setDraftRows(null);
    setEditMode(false);
    setEditedCells(new Set());
    setActiveEditCell(null);
  };

  if (!dataset) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-muted-foreground flex-col gap-4">
        <Database className="size-12 opacity-50" />
        <p>No dataset loaded. Go to Overview to upload a CSV.</p>
      </div>
    );
  }

  return (
    <motion.div
      variants={STAGGER}
      initial="hidden"
      animate="show"
      className="h-[calc(100vh-6rem)] flex flex-col gap-4"
    >
      <motion.div
        variants={ITEM}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0"
      >
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 gradient-text">
            <ListFilter className="size-8 text-primary" aria-hidden="true" /> Raw Data Explorer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scroll smoothly through {dataset.rowCount.toLocaleString()} rows of data.
          </p>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          {!editMode ? (
            <button
              onClick={startEdit}
              className="neo-btn px-4 py-2 text-sm font-semibold flex items-center gap-2 hover:text-primary transition-colors whitespace-nowrap"
            >
              <Edit3 className="size-4" /> Edit Data
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={cancelEdit}
                disabled={isSaving}
                className="neo-btn px-4 py-2 text-sm font-semibold flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              >
                <XCircle className="size-4" /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="neo-btn px-4 py-2 text-sm font-semibold flex items-center gap-2 text-emerald-500 hover:text-emerald-400 transition-colors whitespace-nowrap"
              >
                {isSaving ? (
                  <div className="size-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {isSaving ? "Saving..." : "Save Edits"}
              </button>
            </div>
          )}

          <select
            className="neo-inset px-3 py-2 text-sm bg-transparent border-none outline-none focus:ring-1 focus:ring-primary rounded-xl"
            value={searchCol}
            onChange={(e) => setSearchCol(e.target.value)}
            disabled={editMode}
          >
            <option value="__all__">All Columns</option>
            {dataset.columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              placeholder="Search data..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              disabled={editMode}
              className="neo-inset w-full pl-9 pr-4 py-2 text-sm bg-transparent rounded-xl focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={ITEM}
        className="neo border-primary/20 bg-background/50 flex-1 overflow-hidden flex flex-col rounded-2xl relative"
      >
        <div className="text-xs text-muted-foreground px-4 py-2 bg-muted/30 border-b border-border/50 shrink-0 font-medium flex justify-between items-center">
          <span>
            Showing {processedIndices.length.toLocaleString()} of{" "}
            {dataset.rowCount.toLocaleString()} rows
          </span>
          {editMode && editedCells.size > 0 && (
            <span className="text-primary bg-primary/10 px-2 py-0.5 rounded-full font-semibold">
              {editedCells.size} cell(s) edited
            </span>
          )}
        </div>
        <div className="flex-1 overflow-hidden relative" ref={containerRef}>
          <VirtualTable rows={tableRows} columns={columns} rowHeight={40} height={tableHeight} />
        </div>
      </motion.div>
    </motion.div>
  );
}
