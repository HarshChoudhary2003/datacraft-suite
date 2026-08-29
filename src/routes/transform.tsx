import { createFileRoute } from "@tanstack/react-router";
import { useDataset } from "@/store/dataset-context";
import { useState, useMemo } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Settings2,
  Play,
  GitCommitHorizontal,
  Trash2,
  Plus,
  ArrowRight,
  Wand2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { applyTransformations, type TransformOperation } from "@/lib/transform";

export const Route = createFileRoute("/transform")({
  head: () => ({ meta: [{ title: "Feature Engineering — DataIQ Pro" }] }),
  component: TransformPage,
});

const STAGGER: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const ITEM: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

function TransformPage() {
  const { dataset, processRows } = useDataset();
  const [operations, setOperations] = useState<TransformOperation[]>([]);
  const [committing, setCommitting] = useState(false);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[] | null>(null);

  if (!dataset) return null;

  const numCols = dataset.profiles.filter((p) => p.type === "numeric").map((p) => p.name);
  const catCols = dataset.profiles
    .filter((p) => p.type === "categorical" || p.type === "boolean")
    .map((p) => p.name);

  const addOperation = (type: TransformOperation["type"]) => {
    let op: TransformOperation;
    if (type === "minmax" || type === "standard") {
      if (numCols.length === 0) return toast.error("No numeric columns available.");
      op = { type, col: numCols[0], targetCol: `${numCols[0]}_${type}` };
    } else if (type === "label" || type === "onehot") {
      if (catCols.length === 0) return toast.error("No categorical columns available.");
      op = { type, col: catCols[0], targetCol: type === "label" ? `${catCols[0]}_label` : "" };
    } else {
      if (numCols.length < 2) return toast.error("Need at least 2 numeric columns for math ops.");
      op = {
        type: "math",
        colA: numCols[0],
        operator: "+",
        colB: numCols[1],
        isScalarB: false,
        targetCol: `${numCols[0]}_math`,
      };
    }
    setOperations((prev) => [...prev, op]);
    setPreviewRows(null);
  };

  const updateOp = (index: number, partial: Partial<TransformOperation>) => {
    setOperations((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...partial } as TransformOperation;
      return copy;
    });
    setPreviewRows(null);
  };

  const removeOp = (index: number) => {
    setOperations((prev) => prev.filter((_, i) => i !== index));
    setPreviewRows(null);
  };

  const runPreview = () => {
    if (operations.length === 0) return toast.info("No operations to preview.");
    try {
      // Just preview first 10 rows
      const sample = dataset.rows.slice(0, 10);
      const transformed = applyTransformations({ ...dataset, rows: sample }, operations);
      setPreviewRows(transformed);
      toast.success("Preview generated successfully.");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate preview.");
    }
  };

  const commitChanges = async () => {
    if (operations.length === 0) return;
    setCommitting(true);
    try {
      // Transform all rows synchronously (this might block UI briefly for large datasets)
      // but is generally fast enough in JS.
      const newRows = applyTransformations(dataset, operations);
      await processRows(dataset.name, newRows);
      toast.success("Transformations committed successfully.");
      setOperations([]);
      setPreviewRows(null);
    } catch (e) {
      console.error(e);
      toast.error("Failed to commit transformations.");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <motion.div
      variants={STAGGER}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-6xl mx-auto pb-12"
    >
      <motion.div
        variants={ITEM}
        className="flex flex-col sm:flex-row justify-between gap-4 sm:items-end"
      >
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 gradient-text">
            <Wand2 className="size-8 text-primary" /> Feature Engineering
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Scale, encode, and transform your columns. Changes run locally and securely update your
            dataset globally.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => addOperation("minmax")}
            className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="size-3" /> MinMax Scale
          </button>
          <button
            onClick={() => addOperation("standard")}
            className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="size-3" /> Standard Scale
          </button>
          <button
            onClick={() => addOperation("onehot")}
            className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="size-3" /> One-Hot Encode
          </button>
          <button
            onClick={() => addOperation("label")}
            className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="size-3" /> Label Encode
          </button>
          <button
            onClick={() => addOperation("math")}
            className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="size-3" /> Math Formula
          </button>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div variants={ITEM} className="space-y-4">
          <div className="neo p-5 min-h-[300px]">
            <h2 className="font-bold flex items-center gap-2 mb-4">
              <Settings2 className="size-5 text-primary" /> Transformation Pipeline
            </h2>

            <AnimatePresence>
              {operations.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-40 flex items-center justify-center text-muted-foreground border-2 border-dashed border-border/50 rounded-xl"
                >
                  Add an operation from the top right to begin.
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-3">
              {operations.map((op, i) => (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="neo-inset p-4 rounded-xl flex items-start gap-4"
                >
                  <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center font-bold text-xs shrink-0 shadow-sm border border-border/50">
                    {i + 1}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm tracking-wide uppercase text-primary">
                        {op.type === "minmax"
                          ? "MinMax Scale"
                          : op.type === "standard"
                            ? "Standardize (Z-Score)"
                            : op.type === "onehot"
                              ? "One-Hot Encode"
                              : op.type === "label"
                                ? "Label Encode"
                                : "Math Formula"}
                      </span>
                      <button
                        onClick={() => removeOp(i)}
                        className="text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {/* Render inputs based on operation type */}
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {op.type === "math" ? (
                        <>
                          <select
                            className="neo px-2 py-1 bg-background"
                            value={op.colA}
                            onChange={(e) => {
                              updateOp(i, {
                                colA: e.target.value,
                                targetCol: `${e.target.value}_math`,
                              });
                            }}
                          >
                            {numCols.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <select
                            className="neo px-2 py-1 bg-background font-mono"
                            value={op.operator}
                            onChange={(e) =>
                              updateOp(i, { operator: e.target.value as "+" | "-" | "*" | "/" })
                            }
                          >
                            {["+", "-", "*", "/"].map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          {op.isScalarB ? (
                            <input
                              type="number"
                              className="neo px-2 py-1 bg-background w-20"
                              value={op.colB}
                              onChange={(e) => updateOp(i, { colB: e.target.value })}
                            />
                          ) : (
                            <select
                              className="neo px-2 py-1 bg-background"
                              value={op.colB}
                              onChange={(e) => updateOp(i, { colB: e.target.value })}
                            >
                              {numCols.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          )}
                          <label className="flex items-center gap-1 ml-2 text-xs text-muted-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={op.isScalarB}
                              onChange={(e) =>
                                updateOp(i, {
                                  isScalarB: e.target.checked,
                                  colB: e.target.checked ? "1" : numCols[0],
                                })
                              }
                            />{" "}
                            Scalar?
                          </label>
                        </>
                      ) : (
                        <select
                          className="neo px-2 py-1 bg-background"
                          value={op.col}
                          onChange={(e) => {
                            const newCol = e.target.value;
                            let newTargetCol = (op as { targetCol?: string }).targetCol;
                            if (op.type === "minmax" || op.type === "standard")
                              newTargetCol = `${newCol}_${op.type}`;
                            else if (op.type === "label") newTargetCol = `${newCol}_label`;
                            updateOp(i, { col: newCol, targetCol: newTargetCol });
                          }}
                        >
                          {(op.type === "minmax" || op.type === "standard" ? numCols : catCols).map(
                            (c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ),
                          )}
                        </select>
                      )}

                      {op.type !== "onehot" && (
                        <>
                          <ArrowRight className="size-4 text-muted-foreground" />
                          <input
                            type="text"
                            className="neo px-2 py-1 bg-background flex-1 min-w-[120px]"
                            placeholder="Target Column Name"
                            value={(op as { targetCol?: string }).targetCol || ""}
                            onChange={(e) => updateOp(i, { targetCol: e.target.value })}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {operations.length > 0 && (
              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border/50">
                <button
                  onClick={runPreview}
                  className="neo-btn flex-1 py-2 font-semibold flex items-center justify-center gap-2"
                >
                  <Play className="size-4" /> Preview First 10 Rows
                </button>
                <button
                  disabled={committing}
                  onClick={commitChanges}
                  className="neo-btn flex-1 py-2 font-bold text-primary flex items-center justify-center gap-2 border border-primary/20 bg-primary/5 hover:bg-primary/10 disabled:opacity-50"
                >
                  <GitCommitHorizontal className="size-4" />{" "}
                  {committing ? "Processing..." : "Commit Pipeline"}
                </button>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div variants={ITEM} className="neo p-5 min-h-[300px] flex flex-col">
          <h2 className="font-bold flex items-center gap-2 mb-4">
            <Search className="size-5 text-primary" /> Dry Run Preview
          </h2>
          <div className="flex-1 overflow-auto rounded-xl border border-border/50 bg-muted/10 relative">
            {!previewRows ? (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm flex-col gap-3">
                <Play className="size-8 opacity-20" />
                Click Preview to see the impact of your pipeline.
              </div>
            ) : (
              <div className="p-4 text-sm overflow-x-auto w-full">
                <table className="w-full text-left whitespace-nowrap border-collapse">
                  <thead>
                    <tr>
                      {Object.keys(previewRows[0] || {}).map((k) => (
                        <th
                          key={k}
                          className="px-3 py-2 border-b border-border font-bold text-primary"
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-border/30 last:border-0 hover:bg-muted/30"
                      >
                        {Object.keys(previewRows[0] || {}).map((k) => (
                          <td key={k} className="px-3 py-2 text-muted-foreground">
                            {row[k] === null || row[k] === undefined || row[k] === "" ? (
                              <span className="opacity-40 italic">null</span>
                            ) : typeof row[k] === "number" ? (
                              Number(row[k]).toFixed(3)
                            ) : (
                              String(row[k])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
