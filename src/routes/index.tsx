import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useDataset } from "@/store/dataset-context";
import { type ParseDiagnostics, ParseFileError } from "@/lib/parse-file-worker-client";
import { ProcessingBreakdown } from "@/components/processing-breakdown";
import { salesDataset, churnDataset, titanicDataset, millionRowsDataset } from "@/lib/sample-data";
import {
  Upload,
  FileSpreadsheet,
  Sparkles,
  BarChart3,
  ShieldCheck,
  Code2,
  MessageSquare,
  History,
  Zap,
  Database,
  CircleAlert,
  RefreshCw,
  CheckCircle2,
  Cpu,
  Laptop,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "DataIQ Pro — Dataset analysis for AI & Data teams" }] }),
  component: UploadPage,
});

function UploadPage() {
  const { processFile, processRows, dataset, processing, progress, resuming } = useDataset();
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [diagnostics, setDiagnostics] = useState<{
    status: "idle" | "success" | "error";
    fileName: string;
    message: string;
    details?: string;
    diag?: ParseDiagnostics;
  } | null>(null);
  const navigate = useNavigate();
  const busy = processing;

  const handleFile = async (file: File) => {
    if (busy) return;
    setLastFile(file);
    setDiagnostics(null);
    try {
      const { diagnostics: parseDiagnostics, rowCount } = await processFile(file);
      setDiagnostics({
        status: "success",
        fileName: file.name,
        message:
          parseDiagnostics?.finalParser === "fallback"
            ? "Upload succeeded after switching from the background worker to the main-thread fallback."
            : "Upload succeeded in the background worker.",
        diag: parseDiagnostics,
      });
      toast.success(`Loaded ${rowCount.toLocaleString()} rows`);
      navigate({ to: "/overview" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to parse file";
      const diag = e instanceof ParseFileError ? e.diagnostics : undefined;
      setDiagnostics({
        status: "error",
        fileName: file.name,
        message: explainUploadFailure(message, diag),
        details: message,
        diag,
      });
      toast.error(message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const retryUpload = () => {
    if (!lastFile || busy) return;
    void handleFile(lastFile);
  };

  const loadSample = async (which: "sales" | "churn" | "titanic" | "bigdata_1m") => {
    if (busy) return;
    const ds =
      which === "sales"
        ? salesDataset()
        : which === "churn"
          ? churnDataset()
          : which === "titanic"
            ? titanicDataset()
            : millionRowsDataset(1000000);
    try {
      await processRows(ds.name, ds.rows);
      toast.success(`Loaded ${ds.name}`);
      navigate({ to: "/overview" });
    } catch {
      toast.error("Failed to load sample dataset");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-12 sm:space-y-16"
    >
      {/* Hero */}
      <section className="relative overflow-hidden pt-2 sm:pt-6 pb-2">
        <div className="absolute inset-0 -z-10 opacity-80 pointer-events-none" aria-hidden="true">
          <div className="absolute top-0 -left-20 w-[42rem] h-[42rem] rounded-full blur-[110px] gradient-bg opacity-25 animate-mesh" />
          <div
            className="absolute -bottom-20 -right-20 w-[38rem] h-[38rem] rounded-full blur-[110px] bg-accent/25 animate-mesh"
            style={{ animationDelay: "-6s" }}
          />
        </div>
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 neo-sm px-4 py-1.5 text-xs font-semibold mb-5 animate-fade-in border-primary/30">
            <Sparkles className="size-3.5 text-primary animate-pulse" /> Role-aware AI · CSV · Excel
            · JSON
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black gradient-text leading-[1.05] tracking-tight animate-fade-in">
            DataIQ Pro
          </h1>
          <p
            className="mt-4 sm:mt-6 text-base sm:text-lg text-muted-foreground animate-fade-in font-normal leading-relaxed"
            style={{ animationDelay: "120ms" }}
          >
            Upload any dataset to get instant statistics, correlations, anomaly detection,
            role-aware AI insights, production-ready code, and exportable reports in seconds.
          </p>
        </div>
      </section>

      {/* Drop zone */}
      <motion.section
        role="button"
        whileHover={{ scale: busy ? 1 : 1.01 }}
        whileTap={{ scale: busy ? 1 : 0.99 }}
        tabIndex={0}
        aria-label="Upload dataset. Press Enter or Space to choose a file, or drop a CSV, Excel, or JSON file here."
        aria-busy={busy}
        aria-disabled={busy}
        className={`bento-card group relative overflow-hidden p-8 sm:p-14 text-center cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          drag ? "border-primary/60 bg-primary/10 shadow-2xl glow-primary" : ""
        } ${busy ? "opacity-80" : ""}`}
        onClick={() => !busy && fileRef.current?.click()}
        onKeyDown={(e) => {
          if (!busy && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !busy) handleFile(f);
        }}
      >
        {drag && (
          <div className="absolute inset-0 border-2 border-dashed border-primary rounded-[inherit] pointer-events-none animate-pulse" />
        )}
        <div
          className="mx-auto size-20 rounded-full gradient-bg grid place-items-center mb-5 shadow-lg glow-primary transition-transform group-hover:scale-110"
          aria-hidden="true"
        >
          <Upload className="size-9 text-white transition-transform group-hover:-translate-y-1" />
        </div>
        <div className="text-xl sm:text-2xl font-bold tracking-tight">
          {busy
            ? (progress?.stageLabel ?? "Processing…") + "…"
            : drag
              ? "Drop file to instant analysis"
              : "Drop your CSV, Excel, or JSON file"}
        </div>
        <div className="text-xs sm:text-sm text-muted-foreground mt-2 font-medium">
          or click / press Enter to browse · auto type detection · multi-sheet Excel supported
        </div>
        {busy && (
          <div className="mt-6 max-w-md mx-auto text-left">
            <ProcessingBreakdown progress={progress} resuming={resuming} />
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          aria-label="Choose dataset file"
          accept=".csv,.tsv,.xlsx,.xls,.json,.jsonl,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleFile(f);
          }}
        />
        <div
          className="flex flex-wrap gap-2 justify-center mt-6 text-[11px] font-mono text-muted-foreground"
          aria-hidden="true"
        >
          <span className="neo-sm px-2.5 py-1 border border-primary/20 text-foreground font-semibold">
            .csv
          </span>
          <span className="neo-sm px-2.5 py-1 border border-primary/20 text-foreground font-semibold">
            .xlsx
          </span>
          <span className="neo-sm px-2.5 py-1 border border-primary/20 text-foreground font-semibold">
            .xls
          </span>
          <span className="neo-sm px-2.5 py-1 border border-primary/20 text-foreground font-semibold">
            .tsv
          </span>
          <span className="neo-sm px-2.5 py-1 border border-primary/20 text-foreground font-semibold">
            .jsonl
          </span>
        </div>
      </motion.section>

      {diagnostics && (
        <section>
          <Alert
            variant={diagnostics.status === "error" ? "destructive" : "default"}
            className="neo border-border/70"
          >
            {diagnostics.status === "error" ? (
              <CircleAlert className="size-4" />
            ) : (
              <CheckCircle2 className="size-4 text-emerald-500" />
            )}
            <div className="space-y-4">
              <div className="space-y-1">
                <AlertTitle>Upload diagnostics · {diagnostics.fileName}</AlertTitle>
                <AlertDescription>
                  {diagnostics.message}
                  {diagnostics.details && diagnostics.details !== diagnostics.message ? (
                    <span className="block mt-1 text-xs text-muted-foreground">
                      Raw parser message: {diagnostics.details}
                    </span>
                  ) : null}
                </AlertDescription>
              </div>

              {diagnostics.diag?.attempts?.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {diagnostics.diag.attempts.map((attempt, idx) => (
                    <div
                      key={`${attempt.parser}-${idx}`}
                      className="rounded-lg border border-border/70 bg-background/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 font-medium">
                          {attempt.parser === "worker" ? (
                            <Cpu className="size-4 text-primary" />
                          ) : (
                            <Laptop className="size-4 text-primary" />
                          )}
                          {attempt.parser === "worker"
                            ? "Background worker"
                            : "Main-thread fallback"}
                        </div>
                        <span className="text-xs text-muted-foreground capitalize">
                          {attempt.status}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                        {attempt.message}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {diagnostics.status === "error" && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={retryUpload} disabled={!lastFile || busy}>
                    <RefreshCw className="size-4" />
                    Retry upload
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Retry uses the same file again and will automatically fall back if the worker
                    path fails.
                  </p>
                </div>
              )}
            </div>
          </Alert>
        </section>
      )}

      {/* Samples */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Sparkles className="size-4 text-primary" /> Try a sample dataset
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Click to load pre-configured data
          </span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              id: "sales",
              name: "Sales 2024",
              desc: "500 rows · Revenue, regions & products",
              badge: "Financial",
            },
            {
              id: "churn",
              name: "Customer Churn",
              desc: "600 rows · Classification target dataset",
              badge: "ML Ready",
            },
            {
              id: "titanic",
              name: "Titanic Passengers",
              desc: "891 rows · Classic machine learning benchmark",
              badge: "Benchmark",
            },
            {
              id: "bigdata_1m",
              name: "1 Million Rows Scale",
              desc: "1,000,000 rows · Big Data reservoir profiling",
              badge: "1M-1B Scale",
            },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() =>
                loadSample(s.id as "sales" | "churn" | "titanic" | "bigdata_1m")
              }
              className="neo-btn p-5 text-left group hover:scale-[1.02] transition-all relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="size-10 rounded-xl bg-primary/10 grid place-items-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                  <FileSpreadsheet className="size-5" />
                </div>
                <span className="text-[10px] font-mono font-semibold neo-sm px-2 py-0.5 border border-primary/20">
                  {s.badge}
                </span>
              </div>
              <div className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                {s.name}
              </div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Built for modern AI & Data teams
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Automate statistical profiling, validation, feature engineering, AutoML, and report
            exports.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="neo p-5 animate-fade-in group hover:border-primary/40 transition-all"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="size-10 rounded-xl neo-inset grid place-items-center mb-3 text-primary group-hover:scale-110 transition-transform">
                <f.icon className="size-5" />
              </div>
              <div className="font-bold text-sm text-foreground">{f.title}</div>
              <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className="neo p-6 sm:p-10 border border-primary/20 relative overflow-hidden">
        <div className="text-center max-w-xl mx-auto mb-8">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            From raw file to production model in minutes
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            End-to-end data pipeline powered by local browser execution.
          </p>
        </div>
        <div className="grid sm:grid-cols-4 gap-4 text-center">
          {STEPS.map((s, i) => (
            <div key={s.title} className="neo-sm p-4 relative group hover:border-primary/40">
              <div className="absolute -top-3 left-4 size-7 rounded-full gradient-bg text-white grid place-items-center font-black text-xs shadow-md">
                {i + 1}
              </div>
              <div className="font-bold text-sm mt-2 text-foreground">{s.title}</div>
              <div className="text-[11px] text-muted-foreground mt-1 leading-normal">{s.desc}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          {dataset && (
            <Link
              to="/overview"
              className="neo-btn px-6 py-2.5 text-sm font-bold text-primary flex items-center gap-2 border-primary/40 hover:scale-105"
            >
              Open current dataset →
            </Link>
          )}
        </div>
      </section>

      {dataset && (
        <div className="neo-sm p-4 text-sm flex items-center justify-between border-primary/30">
          <div>
            Currently loaded: <span className="font-bold text-foreground">{dataset.name}</span>
          </div>
          <span className="font-mono text-xs text-primary font-semibold">
            {dataset.rowCount.toLocaleString()} rows · {dataset.colCount} cols
          </span>
        </div>
      )}
    </motion.div>
  );
}

const FEATURES = [
  {
    title: "Statistics & Distributions",
    desc: "Mean, median, std, skew, kurtosis, IQR — with column-wise filters and live charts.",
    icon: BarChart3,
  },
  {
    title: "Validation & Auto-clean",
    desc: "Configurable rules with one-click fixes for missing values, whitespace and duplicates.",
    icon: ShieldCheck,
  },
  {
    title: "Production code generation",
    desc: "Copy-paste Python EDA, cleaning, Scikit-learn pipelines, SQL profiles and Lovable AI snippets.",
    icon: Code2,
  },
  {
    title: "Role-aware AI Insights",
    desc: "Tailored to Analyst, BA, Scientist, ML, AI or Data Engineer perspectives.",
    icon: Sparkles,
  },
  {
    title: "Data Chat",
    desc: "Ask plain-English questions about your dataset and get cited, numeric answers.",
    icon: MessageSquare,
  },
  {
    title: "Versioning & Diffs",
    desc: "Snapshot uploads and compare schema, drift and quality between versions.",
    icon: History,
  },
  {
    title: "Notebook export",
    desc: "Download a Jupyter .ipynb or interactive HTML notebook with role-tailored ML pipeline.",
    icon: FileSpreadsheet,
  },
  {
    title: "Custom report templates",
    desc: "Pick which sections to include, then export a polished HTML report.",
    icon: Database,
  },
  {
    title: "Fast & local-first",
    desc: "Statistics run in your browser — no upload to a server unless you opt in.",
    icon: Zap,
  },
];

const STEPS = [
  { title: "Upload", desc: "CSV / Excel / JSON drag-and-drop" },
  { title: "Profile", desc: "Auto stats + validation" },
  { title: "Clean & explore", desc: "One-click cleanup + AI" },
  { title: "Export", desc: "Notebook · code · report" },
];

function explainUploadFailure(message: string, diagnostics?: ParseDiagnostics) {
  const workerFailed = diagnostics?.attempts.some(
    (attempt) => attempt.parser === "worker" && attempt.status === "failed",
  );
  const fallbackFailed = diagnostics?.attempts.some(
    (attempt) => attempt.parser === "fallback" && attempt.status === "failed",
  );

  if (workerFailed && fallbackFailed) {
    return "The background worker failed first, and the fallback parser also could not read this file. Please retry or check the CSV structure.";
  }

  if (fallbackFailed) {
    return "The direct parser could not read this file. Please retry and check for malformed CSV headers, encoding issues, or inconsistent row shapes.";
  }

  if (workerFailed) {
    return "The background worker failed, but the app attempted a safe fallback path.";
  }

  if (/No rows found/i.test(message)) {
    return "The file was read, but it did not contain any data rows after the header.";
  }

  return "The upload could not be processed. Retry once, then check the file format and delimiter if it still fails.";
}
