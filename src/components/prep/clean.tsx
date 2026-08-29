import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useDataset } from "@/store/dataset-context";
import { useState, useMemo } from "react";
import { runPipeline } from "@/lib/processing-pipeline";
import {
  dropDuplicateRows,
  imputeMissingValues,
  capOutliers,
  type ImputeStrategy,
} from "@/lib/clean";
import { detectPII, anonymizePII } from "@/lib/pii";
import {
  Sparkles,
  Trash2,
  Wand2,
  Activity,
  Check,
  Loader2,
  Undo2,
  Redo2,
  ShieldAlert,
  ArrowRight,
  X,
} from "lucide-react";
import { toast } from "sonner";

type PreviewState = {
  rows: Record<string, unknown>[];
  report: {
    droppedDuplicates: number;
    imputedMissing: { col: string; strategy: string; count: number; val: unknown }[];
    cappedOutliers: { col: string; count: number }[];
    piiRedacted: { col: string; type: string; method: string }[];
  };
};

export function CleanPage() {
  const { dataset, updateDataset, undo, redo, canUndo, canRedo } = useDataset();
  const navigate = useNavigate();
  const [cleaning, setCleaning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const stats = useMemo(() => {
    if (!dataset) return null;
    return {
      duplicates: dataset.duplicateRows,
      duplicateIndices: dataset.duplicateIndices,
      missingCols: dataset.profiles.filter((p) => p.missing > 0),
      outlierCols: dataset.profiles.filter((p) => p.type === "numeric" && (p.outliersIQR ?? 0) > 0),
      piiCols: detectPII(dataset),
    };
  }, [dataset]);

  const [imputeStrats, setImputeStrats] = useState<Record<string, ImputeStrategy>>({});
  const [piiMethod, setPiiMethod] = useState<"redact" | "hash">("redact");

  if (!dataset || !stats) {
    return (
      <div className="neo p-10 text-center">
        No dataset loaded.{" "}
        <Link to="/" className="text-primary underline">
          Upload one
        </Link>
      </div>
    );
  }

  const handleDryRun = async () => {
    setCleaning(true);
    setProgress(10);
    try {
      await new Promise((r) => setTimeout(r, 50));
      let rows = dataset.rows;

      const report: PreviewState["report"] = {
        droppedDuplicates: stats.duplicates,
        imputedMissing: [],
        cappedOutliers: [],
        piiRedacted: [],
      };

      // 1. Drop duplicates
      if (stats.duplicates > 0) {
        rows = dropDuplicateRows(rows, stats.duplicateIndices);
      }
      setProgress(30);

      // 2. Impute missing
      const strategyMap: Record<string, { strategy: ImputeStrategy; replacementValue?: unknown }> =
        {};
      for (const col of stats.missingCols) {
        const strat = imputeStrats[col.name] ?? "drop";
        let val: unknown = undefined;
        if (strat === "mean") val = col.mean;
        else if (strat === "median") val = col.median;
        else if (strat === "mode") val = col.topValues?.[0]?.value;
        strategyMap[col.name] = { strategy: strat, replacementValue: val };

        report.imputedMissing.push({ col: col.name, strategy: strat, count: col.missing, val });
      }
      if (Object.keys(strategyMap).length > 0) {
        rows = imputeMissingValues(rows, strategyMap);
      }
      setProgress(50);

      // 3. Cap Outliers
      const outlierLimits: Record<string, { min: number; max: number }> = {};
      for (const col of stats.outlierCols) {
        if (col.iqrLower !== undefined && col.iqrUpper !== undefined) {
          outlierLimits[col.name] = { min: col.iqrLower, max: col.iqrUpper };
          report.cappedOutliers.push({ col: col.name, count: col.outliersIQR ?? 0 });
        }
      }
      if (Object.keys(outlierLimits).length > 0) {
        rows = capOutliers(rows, outlierLimits);
      }
      setProgress(60);

      // 4. Anonymize PII
      if (stats.piiCols.length > 0) {
        rows = anonymizePII(
          rows,
          stats.piiCols.map((p) => p.column),
          piiMethod,
        );
        stats.piiCols.forEach((p) =>
          report.piiRedacted.push({ col: p.column, type: p.type, method: piiMethod }),
        );
      }
      setProgress(100);

      if (rows.length === 0) {
        throw new Error(
          "All rows were dropped! Please change your Imputation strategies (e.g. choose 'Fill with Mean/Mode' instead of 'Drop Rows') so you don't lose your entire dataset.",
        );
      }

      setPreview({ rows, report });
      toast.success("Dry run complete. Please review the Impact Report.");
    } catch (e: unknown) {
      console.error(e);
      toast.error("Failed to dry-run data: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCleaning(false);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    setCleaning(true);
    setProgress(0);
    try {
      const res = await runPipeline({
        name: dataset.name.includes("(Cleaned)") ? dataset.name : dataset.name + " (Cleaned)",
        rows: preview.rows,
        persistJob: false,
        onProgress: (p) => setProgress(p.overallPct),
      });

      updateDataset(res.dataset, true);
      toast.success("Changes committed successfully!");
      navigate({ to: "/overview" });
    } catch (e: unknown) {
      console.error(e);
      toast.error("Failed to commit changes: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCleaning(false);
    }
  };

  const isClean =
    stats.duplicates === 0 &&
    stats.missingCols.length === 0 &&
    stats.outlierCols.length === 0 &&
    stats.piiCols.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6 max-w-4xl mx-auto"
    >
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold gradient-text flex items-center gap-3">
            <Wand2 className="size-8 text-primary" /> Data Refinery
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Automatically resolve missing values, duplicate rows, and extreme outliers safely.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="neo-btn p-2 sm:p-3 disabled:opacity-50 transition-all hover:scale-[1.05]"
            aria-label="Undo last change"
          >
            <Undo2 className="size-4 sm:size-5" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="neo-btn p-2 sm:p-3 disabled:opacity-50 transition-all hover:scale-[1.05]"
            aria-label="Redo change"
          >
            <Redo2 className="size-4 sm:size-5" />
          </button>
        </div>
      </div>

      {preview ? (
        <div className="neo p-6 space-y-6 border-2 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3 border-b border-border/50 pb-4">
            <div className="p-2 rounded-lg bg-primary/20 text-primary">
              <Check className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Cleansing Impact Report</h2>
              <p className="text-sm text-muted-foreground">
                Review the changes below before permanently committing them to your dataset.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {preview.report.droppedDuplicates > 0 && (
              <div className="flex items-center justify-between p-3 neo-sm bg-background/50">
                <span className="font-medium text-sm">Duplicate Rows Dropped</span>
                <span className="text-destructive font-mono font-bold">
                  -{preview.report.droppedDuplicates} rows
                </span>
              </div>
            )}

            {preview.report.imputedMissing.map((m, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 neo-sm bg-background/50 gap-2"
              >
                <span className="font-medium text-sm">
                  Imputed <span className="text-orange-500 font-bold">{m.count}</span> missing
                  values in <span className="font-mono">{m.col}</span>
                </span>
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                  Strategy: {m.strategy}{" "}
                  {m.val !== undefined
                    ? `(${typeof m.val === "number" ? m.val.toFixed(2) : String(m.val)})`
                    : ""}
                </span>
              </div>
            ))}

            {preview.report.cappedOutliers.map((o, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 neo-sm bg-background/50 gap-2"
              >
                <span className="font-medium text-sm">
                  Capped <span className="text-blue-500 font-bold">{o.count}</span> extreme outliers
                  in <span className="font-mono">{o.col}</span>
                </span>
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                  Winsorized at IQR fences
                </span>
              </div>
            ))}

            {preview.report.piiRedacted.map((p, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 neo-sm bg-background/50 gap-2"
              >
                <span className="font-medium text-sm">
                  Anonymized PII (<span className="uppercase">{p.type}</span>) in{" "}
                  <span className="font-mono">{p.col}</span>
                </span>
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                  Method: {p.method}
                </span>
              </div>
            ))}

            {Object.values(preview.report).every((v) =>
              Array.isArray(v) ? v.length === 0 : v === 0,
            ) && (
              <div className="text-center p-4 text-muted-foreground text-sm">
                No changes were made during the dry run.
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border/50">
            <button
              onClick={() => setPreview(null)}
              disabled={cleaning}
              className="neo-btn px-5 py-2.5 font-semibold flex items-center gap-2 hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <X className="size-4" /> Cancel & Tweak
            </button>
            <button
              onClick={handleCommit}
              disabled={cleaning}
              className="neo-btn px-6 py-2.5 font-bold flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg"
            >
              {cleaning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {cleaning ? `Committing... ${Math.round(progress)}%` : "Commit Changes"}
            </button>
          </div>
        </div>
      ) : isClean ? (
        <div className="neo p-10 text-center flex flex-col items-center">
          <div className="size-16 rounded-full bg-green-500/10 text-green-500 grid place-items-center mb-4">
            <Check className="size-8" />
          </div>
          <h2 className="text-xl font-bold">Your dataset is perfectly clean!</h2>
          <p className="text-muted-foreground mt-2">
            No missing values, duplicates, or extreme outliers detected.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 opacity-100 transition-opacity">
          {/* Duplicates */}
          <div className="neo p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Trash2 className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Duplicate Rows</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Exact row-level duplicates skew statistical significance.
                </p>
              </div>
            </div>
            {stats.duplicates > 0 ? (
              <div className="neo-sm p-4 text-sm font-medium text-destructive bg-destructive/5 flex justify-between items-center">
                <span>Found {stats.duplicates} duplicate rows.</span>
                <span className="text-muted-foreground text-xs font-normal bg-background/50 px-2 py-1 rounded-md">
                  Will be dropped
                </span>
              </div>
            ) : (
              <div className="neo-sm p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Check className="size-4 text-green-500" /> No duplicates found.
              </div>
            )}
          </div>

          {/* Missing Values */}
          <div className="neo p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Missing Values</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Select an imputation strategy to repair nulls.
                </p>
              </div>
            </div>

            {stats.missingCols.length > 0 ? (
              <div className="space-y-3">
                {stats.missingCols.map((col) => (
                  <div
                    key={col.name}
                    className="neo-sm p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{col.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {col.missing} missing ({col.missingPct.toFixed(1)}%)
                      </div>
                    </div>
                    <select
                      className="neo-btn px-3 py-2 text-sm outline-none shrink-0 bg-background/50"
                      value={imputeStrats[col.name] ?? "drop"}
                      onChange={(e) =>
                        setImputeStrats((s) => ({
                          ...s,
                          [col.name]: e.target.value as ImputeStrategy,
                        }))
                      }
                    >
                      <option value="drop">Drop Rows</option>
                      {col.type === "numeric" && (
                        <option value="mean">Fill with Mean ({col.mean?.toFixed(2)})</option>
                      )}
                      {col.type === "numeric" && (
                        <option value="median">Fill with Median ({col.median?.toFixed(2)})</option>
                      )}
                      {(col.type === "categorical" || col.type === "boolean") && (
                        <option value="mode">Fill with Mode</option>
                      )}
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              <div className="neo-sm p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Check className="size-4 text-green-500" /> No missing values found.
              </div>
            )}
          </div>

          {/* Outliers */}
          <div className="neo p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Activity className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Extreme Outliers</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Outliers beyond the Interquartile Range (1.5x IQR) will be capped (Winsorized) to
                  prevent model skew.
                </p>
              </div>
            </div>

            {stats.outlierCols.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {stats.outlierCols.map((col) => (
                  <div
                    key={col.name}
                    className="neo-sm p-3 flex justify-between items-center gap-4"
                  >
                    <div className="font-medium text-sm truncate">{col.name}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground text-right shrink-0">
                      {col.outliersIQR} outliers will be capped
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="neo-sm p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Check className="size-4 text-green-500" /> No extreme outliers detected.
              </div>
            )}
          </div>

          {/* Data Privacy (PII) */}
          <div className="neo p-5 sm:p-6 border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/20 text-primary">
                <ShieldAlert className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Data Privacy & PII</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Automatically scan and anonymize sensitive information like emails, SSNs, and
                  credit cards.
                </p>
              </div>
            </div>

            {stats.piiCols.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm font-medium">
                  Anonymization Strategy:
                  <select
                    className="neo-btn px-3 py-1 text-xs outline-none bg-background/50"
                    value={piiMethod}
                    onChange={(e) => setPiiMethod(e.target.value as "redact" | "hash")}
                  >
                    <option value="redact">Redact (replace with [REDACTED])</option>
                    <option value="hash">Hash (irreversible hash algorithm)</option>
                  </select>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {stats.piiCols.map((pii) => (
                    <div
                      key={pii.column}
                      className="neo-sm p-3 flex justify-between items-center gap-4"
                    >
                      <div className="font-medium text-sm truncate">{pii.column}</div>
                      <div className="text-xs text-primary font-semibold uppercase">
                        {pii.type} detected
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="neo-sm p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Check className="size-4 text-green-500" /> No sensitive PII detected in this
                dataset.
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleDryRun}
              disabled={cleaning}
              className="neo-btn px-6 py-3 font-bold flex items-center gap-2 text-primary transition-all hover:scale-[1.02] shadow-sm"
            >
              {cleaning ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Wand2 className="size-5" />
              )}
              {cleaning ? "Simulating..." : "Preview Cleansing Impact"}{" "}
              <ArrowRight className="size-4 ml-1" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
