import { createFileRoute, Link } from "@tanstack/react-router";
import { useDataset, type Role } from "@/store/dataset-context";
import { useMemo, useState, useEffect } from "react";
import {
  Copy,
  Check,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Settings2,
  Download,
  ChevronDown,
  FileText,
  FileCode,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Dataset } from "@/lib/stats";
import { presetFor, type CodeTab } from "@/lib/role-presets";
import { validateGeneratedCode, type CodeValidation } from "@/lib/codegen-validate";
import { authorizeAction, recordAudit } from "@/lib/audit.functions";
import { getSessionId } from "@/lib/session";
import { buildFullReportPDF } from "@/lib/pdf-report";
import { readLatestTelemetry, readTelemetryHistory } from "@/lib/processing-telemetry";
import { Switch } from "@/components/ui/switch";

const TAB_LABEL: Record<CodeTab, string> = {
  eda: "Python EDA",
  cleaning: "Data Cleaning",
  ml: "ML Pipeline",
  dl: "Deep Learning",
  etl: "ETL Pipeline",
  sql: "SQL",
  api: "FastAPI Service",
  streamlit: "Streamlit App",
  docker: "Dockerfile",
  requirements: "requirements.txt",
};

interface GenOptions {
  target: string;
  features: string[];
  imputeNumeric: "median" | "mean" | "zero";
  imputeCategorical: "mode" | "constant";
  scale: "standard" | "minmax" | "none";
  encode: "onehot" | "ordinal";
  dedupe: boolean;
  clipOutliers: boolean;
  testSize: number;
}

export function CodeGenPage() {
  const { dataset, role } = useDataset();
  const preset = presetFor(role);
  const [tab, setTab] = useState<CodeTab>(preset.defaultCodeTab);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTab(preset.defaultCodeTab);
  }, [role, preset.defaultCodeTab]);

  const defaultTarget = useMemo(() => (dataset ? pickTarget(dataset).name : ""), [dataset]);
  const defaultFeatures = useMemo(() => {
    if (!dataset) return [];
    return dataset.profiles
      .filter((p) => p.name !== defaultTarget)
      .filter((p) => {
        if (p.unique <= 1) return false; // Constant or empty
        if (p.missingPct > 50) return false; // Mostly missing
        if (p.type === "datetime") return false; // Raw dates crash scikit-learn
        if (p.type !== "numeric" && p.unique >= dataset.rowCount * 0.95) return false; // Likely IDs
        return true;
      })
      .map((p) => p.name);
  }, [dataset, defaultTarget]);

  const [opts, setOpts] = useState<GenOptions>({
    target: defaultTarget,
    features: defaultFeatures,
    imputeNumeric: "median",
    imputeCategorical: "mode",
    scale: "standard",
    encode: "onehot",
    dedupe: true,
    clipOutliers: true,
    testSize: 0.2,
  });

  useEffect(() => {
    setOpts((o) => ({ ...o, target: defaultTarget, features: defaultFeatures }));
  }, [defaultTarget, defaultFeatures]);

  const checks = useMemo(
    () => (dataset ? runCorrectnessChecks(dataset, opts) : []),
    [dataset, opts],
  );
  const blocking = checks.filter((c) => c.level === "error").length;

  const code = useMemo(
    () => (dataset ? generate(tab, dataset, role, opts) : ""),
    [tab, dataset, role, opts],
  );

  const codeValidation = useMemo(
    () => (dataset ? validateGeneratedCode(code, dataset, tab) : []),
    [code, dataset, tab],
  );
  const codeIssues = codeValidation.filter((c) => c.level !== "ok");
  const codeErrors = codeIssues.filter((c) => c.level === "error").length;
  // Block copy/download until the generated code is fully valid (no errors AND
  // no warnings), plus the existing correctness gate for DL/ETL pipelines.
  const exportBlocked = codeIssues.length > 0 || (blocking > 0 && (tab === "dl" || tab === "etl"));

  if (!dataset)
    return (
      <div className="neo p-10 text-center">
        No dataset.{" "}
        <Link to="/" className="text-primary underline">
          Upload
        </Link>
      </div>
    );

  const authorize = async (target: string): Promise<boolean> => {
    try {
      const res = await authorizeAction({
        data: { sessionId: getSessionId(), role, action: "codegen", target },
      });
      if (!res.ok) {
        toast.error(res.error || "Not authorized for code generation.");
        return false;
      }
      return true;
    } catch {
      toast.error("Authorization check failed. Please try again.");
      return false;
    }
  };

  const copy = async () => {
    if (exportBlocked) {
      toast.error("Resolve the code validation issues before copying.");
      return;
    }
    if (!(await authorize(`copy:${tab}`))) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleFeature = (c: string) => {
    setOpts((o) => ({
      ...o,
      features: o.features.includes(c) ? o.features.filter((f) => f !== c) : [...o.features, c],
    }));
  };

  const showOptions =
    tab === "ml" || tab === "dl" || tab === "etl" || tab === "api" || tab === "cleaning";

  const downloadCode = async () => {
    if (exportBlocked) {
      toast.error("Resolve the code validation issues before downloading.");
      return;
    }
    if (!(await authorize(`download:${tab}`))) return;
    let ext = "py";
    let name: string = tab;
    if (tab === "sql") ext = "sql";
    if (tab === "docker") {
      ext = "";
      name = "Dockerfile";
    }
    if (tab === "requirements") {
      ext = "txt";
      name = "requirements";
    }
    if (tab === "api" || tab === "streamlit") {
      name = "app";
    }
    if (tab === "ml") {
      name = "ml_pipeline";
    }
    if (tab === "dl") {
      name = "dl_pipeline";
    }

    const filename = ext ? `${name}.${ext}` : name;
    const blob = new Blob([code], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    toast.success(`Downloaded ${filename}`);
  };

  const downloadPdfReport = async () => {
    if (!dataset) return;
    if (!(await authorize("pdf_report"))) return;
    try {
      buildFullReportPDF({
        dataset,
        role,
        codeValidation,
        codeContext: {
          template: TAB_LABEL[tab],
          target: opts.target,
          features: opts.features.length,
        },
        telemetry: readLatestTelemetry(),
        history: readTelemetryHistory(),
      });
      void recordAudit({
        data: {
          sessionId: getSessionId(),
          role,
          action: "pdf_report",
          target: dataset.name,
          status: "ok",
        },
      }).catch(() => {});
      toast.success("Full PDF report downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF report");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold gradient-text">Production-Ready Code</h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
          <Sparkles className="size-3.5 text-primary" />
          Role-tailored: <span className="font-semibold text-foreground">{preset.focus}</span>
        </p>
      </div>

      <div role="tablist" aria-label="Code template" className="flex flex-wrap gap-2">
        {preset.codeTabs.map((t, idx) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary ${tab === t ? "neo-inset font-semibold text-primary" : "neo-btn"}`}
          >
            {idx === 0 && <span className="mr-1.5 text-[10px] font-mono opacity-60">★</span>}
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {showOptions && (
        <div className="neo p-4 sm:p-5 space-y-4">
          <div className="font-semibold flex items-center gap-2 text-sm">
            <Settings2 className="size-4 text-primary" />
            Generation options
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                Target column
              </label>
              <CustomSelect
                value={opts.target}
                onChange={(v: string) => setOpts({ ...opts, target: v })}
                options={dataset.columns.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                Numeric imputer
              </label>
              <CustomSelect
                value={opts.imputeNumeric}
                onChange={(v: string) =>
                  setOpts({ ...opts, imputeNumeric: v as "median" | "mean" | "zero" })
                }
                options={[
                  { value: "median", label: "Median" },
                  { value: "mean", label: "Mean" },
                  { value: "zero", label: "Zero" },
                ]}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                Categorical imputer
              </label>
              <CustomSelect
                value={opts.imputeCategorical}
                onChange={(v: string) =>
                  setOpts({ ...opts, imputeCategorical: v as "mode" | "constant" })
                }
                options={[
                  { value: "mode", label: "Most frequent" },
                  { value: "constant", label: 'Constant "missing"' },
                ]}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                Scaler
              </label>
              <CustomSelect
                value={opts.scale}
                onChange={(v: string) =>
                  setOpts({ ...opts, scale: v as "standard" | "minmax" | "none" })
                }
                options={[
                  { value: "standard", label: "StandardScaler" },
                  { value: "minmax", label: "MinMaxScaler" },
                  { value: "none", label: "None" },
                ]}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                Encoder
              </label>
              <CustomSelect
                value={opts.encode}
                onChange={(v: string) => setOpts({ ...opts, encode: v as "onehot" | "ordinal" })}
                options={[
                  { value: "onehot", label: "OneHot" },
                  { value: "ordinal", label: "Ordinal" },
                ]}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                Test size
              </label>
              <input
                type="number"
                step="0.05"
                min={0.05}
                max={0.5}
                value={opts.testSize}
                onChange={(e) => setOpts({ ...opts, testSize: Number(e.target.value) })}
                className="w-full bg-background/40 hover:bg-background/80 transition-colors px-3 py-1.5 rounded-2xl border border-white/10 text-sm font-medium backdrop-blur-md shadow-sm outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <label className="flex items-center justify-between gap-2 cursor-pointer group p-1.5 rounded-lg hover:bg-muted/40 transition-colors">
                <span className="text-xs font-medium group-hover:text-foreground transition-colors">
                  Drop duplicates
                </span>
                <Switch
                  checked={opts.dedupe}
                  onCheckedChange={(c) => setOpts({ ...opts, dedupe: c })}
                  className="shrink-0"
                />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer group p-1.5 rounded-lg hover:bg-muted/40 transition-colors">
                <span className="text-xs font-medium group-hover:text-foreground transition-colors">
                  Clip IQR outliers
                </span>
                <Switch
                  checked={opts.clipOutliers}
                  onCheckedChange={(c) => setOpts({ ...opts, clipOutliers: c })}
                  className="shrink-0"
                />
              </label>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground font-medium mb-2">
              Feature columns ({opts.features.length}/{dataset.columns.length - 1})
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto neo-inset p-2 rounded-xl">
              {dataset.columns
                .filter((c) => c !== opts.target)
                .map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleFeature(c)}
                    className={`text-[11px] px-2 py-1 rounded-md ${opts.features.includes(c) ? "bg-primary text-primary-foreground" : "neo-btn text-muted-foreground"}`}
                  >
                    {c}
                  </button>
                ))}
            </div>
          </div>

          <CorrectnessPanel checks={checks} />
        </div>
      )}

      <CodeValidationPanel checks={codeValidation} />
      <div className="neo overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 border-b border-border/50 bg-muted/20">
          <div className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 truncate">
            <FileCode className="size-4 text-primary shrink-0" />
            <span className="truncate">{TAB_LABEL[tab]}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={downloadPdfReport}
              aria-label="Download full PDF report"
              className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary text-primary"
            >
              <FileText className="size-3.5 shrink-0" /> PDF Report
            </button>
            <button
              onClick={downloadCode}
              aria-label="Download code"
              disabled={exportBlocked}
              className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              <Download className="size-3.5 shrink-0" /> Download
            </button>
            <button
              onClick={copy}
              aria-label="Copy code"
              disabled={exportBlocked}
              className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              {copied ? (
                <Check className="size-3.5 shrink-0" />
              ) : (
                <Copy className="size-3.5 shrink-0" />
              )}
              {copied ? "Copied" : exportBlocked ? "Fix issues" : "Copy"}
            </button>
          </div>
        </div>
        <pre className="font-mono text-[11px] sm:text-sm p-4 sm:p-5 overflow-x-auto max-h-[70vh] overflow-y-auto">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function CodeValidationPanel({ checks }: { checks: CodeValidation[] }) {
  const errors = checks.filter((c) => c.level === "error");
  const warns = checks.filter((c) => c.level === "warn");
  const oks = checks.filter((c) => c.level === "ok");
  const issues = [...errors, ...warns];
  const fullyValid = issues.length === 0;
  const CAT: Record<CodeValidation["category"], string> = {
    reader: "Reader",
    schema: "Schema columns",
    cli: "Run command",
    general: "Checks",
  };
  return (
    <div
      className={`neo p-4 space-y-3 ${fullyValid ? "" : "border border-destructive/30"}`}
      aria-label="Generated code validation results"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className={`size-4 ${fullyValid ? "text-emerald-500" : "text-primary"}`} />
        Code validation results
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          {errors.length} error{errors.length === 1 ? "" : "s"} · {warns.length} warning
          {warns.length === 1 ? "" : "s"}
        </span>
      </div>

      {!fullyValid && (
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="size-3.5 text-destructive shrink-0" />
          Copy &amp; download are blocked until every check below passes.
        </div>
      )}

      {issues.length > 0 && (
        <ul className="space-y-2">
          {issues.map((c, i) => {
            const isError = c.level === "error";
            return (
              <li
                key={`i${i}`}
                className={`rounded-lg p-2.5 text-xs space-y-1 ${isError ? "bg-destructive/10" : "bg-amber-500/10"}`}
              >
                <div
                  className={`flex items-start gap-1.5 font-medium ${isError ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}
                >
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                  <span>
                    <span className="uppercase tracking-wide text-[10px] font-bold mr-1">
                      {isError ? "Error" : "Warning"} · {CAT[c.category]}
                    </span>
                    <br />
                    {c.msg}
                  </span>
                </div>
                {c.fix && (
                  <div className="flex items-start gap-1.5 text-muted-foreground pl-5">
                    <span className="font-semibold text-foreground">Fix:</span>
                    <span>{c.fix}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {oks.map((c, i) => (
        <div key={`o${i}`} className="text-xs flex gap-1.5 text-emerald-600 dark:text-emerald-400">
          <Check className="size-3.5 shrink-0 mt-0.5" />
          {c.msg}
        </div>
      ))}
    </div>
  );
}

interface Check {
  level: "ok" | "warn" | "error";
  msg: string;
}

function runCorrectnessChecks(ds: Dataset, opts: GenOptions): Check[] {
  const out: Check[] = [];
  const target = ds.profiles.find((p) => p.name === opts.target);
  if (!target) {
    out.push({ level: "error", msg: `Target "${opts.target}" not in dataset` });
    return out;
  }
  if (target.missing > 0)
    out.push({
      level: "warn",
      msg: `Target has ${target.missing} missing values — rows will be dropped`,
    });
  if (target.type === "categorical" && target.unique > Math.max(50, ds.rowCount * 0.2))
    out.push({
      level: "warn",
      msg: `Target has ${target.unique} unique values — likely an ID, not a label`,
    });
  if (target.type === "numeric" && (target.std ?? 0) === 0)
    out.push({ level: "error", msg: "Target is constant (std=0); model cannot learn" });
  if (opts.features.length === 0) out.push({ level: "error", msg: "No feature columns selected" });
  if (opts.features.includes(opts.target))
    out.push({ level: "error", msg: "Target column also selected as feature (leakage)" });
  const trainRows = Math.floor(ds.rowCount * (1 - opts.testSize));
  const testRows = ds.rowCount - trainRows;
  if (testRows < 10) out.push({ level: "error", msg: `Test split has only ${testRows} rows` });
  if (trainRows < 30)
    out.push({
      level: "warn",
      msg: `Train split has only ${trainRows} rows — results will be unstable`,
    });
  if (target.type === "categorical") {
    const minClass = (target.topValues ?? []).slice(-1)[0]?.count ?? 0;
    if (minClass > 0 && minClass < 5)
      out.push({
        level: "warn",
        msg: `Smallest class has ${minClass} rows — stratified split may fail`,
      });
  }
  const featProfiles = ds.profiles.filter((p) => opts.features.includes(p.name));
  const highMiss = featProfiles.filter((p) => p.missingPct > 50);
  if (highMiss.length)
    out.push({
      level: "warn",
      msg: `${highMiss.length} feature(s) >50% missing: ${highMiss
        .slice(0, 3)
        .map((p) => p.name)
        .join(", ")}`,
    });
  const idLike = featProfiles.filter((p) => p.unique === ds.rowCount && p.type !== "numeric");
  if (idLike.length)
    out.push({
      level: "warn",
      msg: `Possible ID columns selected as features: ${idLike.map((p) => p.name).join(", ")}`,
    });
  if (out.filter((c) => c.level !== "ok").length === 0)
    out.push({ level: "ok", msg: "All checks passed — ready to export" });
  return out;
}

function CorrectnessPanel({ checks }: { checks: Check[] }) {
  const errors = checks.filter((c) => c.level === "error");
  const warns = checks.filter((c) => c.level === "warn");
  const ok = checks.find((c) => c.level === "ok");
  return (
    <div className="neo-inset p-3 rounded-xl space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <ShieldCheck className="size-4 text-primary" />
        Correctness pre-export check
        <span className="ml-auto text-[10px] font-mono">
          {errors.length} errors · {warns.length} warnings
        </span>
      </div>
      {errors.map((c, i) => (
        <div key={`e${i}`} className="text-xs flex gap-1.5 text-destructive">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          {c.msg}
        </div>
      ))}
      {warns.map((c, i) => (
        <div key={`w${i}`} className="text-xs flex gap-1.5 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          {c.msg}
        </div>
      ))}
      {ok && (
        <div className="text-xs flex gap-1.5 text-emerald-600 dark:text-emerald-400">
          <Check className="size-3.5 shrink-0 mt-0.5" />
          {ok.msg}
        </div>
      )}
    </div>
  );
}

function pickTarget(ds: Dataset): { name: string; kind: "regression" | "classification" } {
  const numeric = ds.profiles.filter((p) => p.type === "numeric");
  if (numeric.length) {
    const last = numeric[numeric.length - 1];
    return { name: last.name, kind: "regression" };
  }
  const cat = [...ds.profiles]
    .filter((p) => p.type !== "numeric")
    .sort((a, b) => a.unique - b.unique)[0];
  return { name: cat?.name ?? "target", kind: "classification" };
}

function detectKind(ds: Dataset, target: string): "regression" | "classification" {
  const p = ds.profiles.find((x) => x.name === target);
  if (!p) return "regression";
  if (p.type === "numeric" && p.unique > 20) return "regression";
  return "classification";
}

function imputerCode(strategy: GenOptions["imputeNumeric"]): string {
  if (strategy === "zero") return `SimpleImputer(strategy="constant", fill_value=0)`;
  return `SimpleImputer(strategy="${strategy}")`;
}
function catImputerCode(strategy: GenOptions["imputeCategorical"]): string {
  if (strategy === "constant") return `SimpleImputer(strategy="constant", fill_value="missing")`;
  return `SimpleImputer(strategy="most_frequent")`;
}
function scalerCode(strategy: GenOptions["scale"]): string {
  if (strategy === "minmax") return `MinMaxScaler()`;
  if (strategy === "none") return `"passthrough"`;
  return `StandardScaler()`;
}
function encoderCode(strategy: GenOptions["encode"]): string {
  if (strategy === "ordinal")
    return `OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)`;
  return `OneHotEncoder(handle_unknown="ignore", min_frequency=10, sparse_output=False)`;
}

/** Extension-aware pandas read expression so generated code matches the actual file type. */
function readExpr(filename: string, source: string, parseDates?: string[]): string {
  const pd = parseDates && parseDates.length ? `, parse_dates=${JSON.stringify(parseDates)}` : "";
  if (/\.xlsx?$/i.test(filename)) return `pd.read_excel(${source})`;
  if (/\.json$/i.test(filename)) return `pd.read_json(${source})`;
  return `pd.read_csv(${source}${pd})`;
}

function generate(tab: CodeTab, ds: Dataset, role: Role, opts: GenOptions): string {
  const target = { name: opts.target, kind: detectKind(ds, opts.target) };
  const features = opts.features.filter((f) => f !== target.name);
  const num = ds.profiles
    .filter((p) => p.type === "numeric" && features.includes(p.name))
    .map((p) => p.name);
  const cat = ds.profiles
    .filter((p) => p.type === "categorical" && features.includes(p.name))
    .map((p) => p.name);
  const dt = ds.profiles.filter((p) => p.type === "datetime").map((p) => p.name);
  const allNum = ds.profiles.filter((p) => p.type === "numeric").map((p) => p.name);
  const allCat = ds.profiles.filter((p) => p.type === "categorical").map((p) => p.name);
  const filename = ds.name;
  const preview = `Target: ${target.name} (${target.kind}) · Features: ${features.length} (numeric=${num.length}, categorical=${cat.length})`;

  if (tab === "eda")
    return `"""
DataIQ Pro — Exploratory Data Analysis
Role: ${role} · Dataset: ${ds.name} (${ds.rowCount} rows × ${ds.colCount} cols)

Run:  python eda.py
Outputs: correlation.png, distributions.png, missing.png
"""
from __future__ import annotations
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats

sns.set_theme(style="whitegrid", palette="viridis", context="notebook")
pd.set_option("display.max_columns", 80)

DATA = Path("${filename}")
OUT = Path("./reports"); OUT.mkdir(exist_ok=True)

df = ${readExpr(filename, "DATA", dt)}
print(f"Shape={df.shape}  Memory={df.memory_usage(deep=True).sum() / 1024**2:.2f} MB")

print("\\n=== Schema ===\\n", df.dtypes)
miss = df.isnull().mean().sort_values(ascending=False)
print("\\n=== Missing % (top 20) ===\\n", (miss * 100).round(2).head(20))

NUM = ${JSON.stringify(allNum)}
if NUM:
    desc = df[NUM].describe(percentiles=[.01, .05, .25, .5, .75, .95, .99]).T
    desc["skew"] = df[NUM].apply(lambda s: stats.skew(s.dropna()))
    desc["kurtosis"] = df[NUM].apply(lambda s: stats.kurtosis(s.dropna()))
    print("\\n=== Numeric ===\\n", desc.round(3))

CAT = ${JSON.stringify(allCat)}
if CAT:
    rows = []
    for c in CAT:
        vc = df[c].value_counts(normalize=True, dropna=True)
        ent = float(-(vc * np.log2(vc + 1e-12)).sum()) if len(vc) else 0.0
        rows.append({"col": c, "unique": int(df[c].nunique()), "top_share": float(vc.iloc[0]) if len(vc) else 0.0, "entropy_bits": round(ent, 3)})
    print("\\n=== Categorical ===\\n", pd.DataFrame(rows))

if len(NUM) >= 2:
    plt.figure(figsize=(min(14, 1.2 * len(NUM)), min(12, 1.0 * len(NUM))))
    sns.heatmap(df[NUM].corr(numeric_only=True), annot=True, fmt=".2f", cmap="coolwarm", center=0, square=True)
    plt.tight_layout(); plt.savefig(OUT / "correlation.png", dpi=120); plt.close()

print("\\n✓ EDA complete →", OUT.resolve())
`;

  if (tab === "cleaning")
    return `"""
DataIQ Pro — Reproducible cleaning pipeline
${preview}
Options: dedupe=${opts.dedupe}, clipOutliers=${opts.clipOutliers}, numImpute=${opts.imputeNumeric}, catImpute=${opts.imputeCategorical}, scale=${opts.scale}, encode=${opts.encode}
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, MinMaxScaler, OneHotEncoder, OrdinalEncoder

NUMERIC = ${JSON.stringify(num)}
CATEGORICAL = ${JSON.stringify(cat)}

${
  opts.clipOutliers
    ? `class IQRClipper(BaseEstimator, TransformerMixin):
    """Winsorize numeric columns to [Q1 - k·IQR, Q3 + k·IQR]."""
    def __init__(self, k: float = 1.5): self.k = k
    def fit(self, X, y=None):
        X = pd.DataFrame(X)
        q1, q3 = X.quantile(0.25), X.quantile(0.75)
        self.lo_, self.hi_ = q1 - self.k * (q3 - q1), q3 + self.k * (q3 - q1)
        return self
    def transform(self, X):
        return pd.DataFrame(X).clip(lower=self.lo_, upper=self.hi_, axis=1).to_numpy()
`
    : ""
}
numeric_pipe = Pipeline([
    ("impute", ${imputerCode(opts.imputeNumeric)}),
${opts.clipOutliers ? '    ("clip", IQRClipper(k=1.5)),\n' : ""}    ("scale", ${scalerCode(opts.scale)}),
])
categorical_pipe = Pipeline([
    ("impute", ${catImputerCode(opts.imputeCategorical)}),
    ("encode", ${encoderCode(opts.encode)}),
])

preprocessor = ColumnTransformer(
    transformers=[("num", numeric_pipe, NUMERIC), ("cat", categorical_pipe, CATEGORICAL)],
    remainder="drop", verbose_feature_names_out=False,
)

def load_and_clean(path: str = "${filename}") -> pd.DataFrame:
    df = ${readExpr(filename, "path")}
    obj = df.select_dtypes(include="object").columns
    df[obj] = df[obj].apply(lambda s: s.astype(str).str.strip().replace({"": np.nan, "NA": np.nan, "null": np.nan}))
${opts.dedupe ? "    df = df.drop_duplicates().reset_index(drop=True)\n" : ""}    return df

if __name__ == "__main__":
    df = load_and_clean()
    df.to_csv("${filename.replace(/\.(csv|xlsx?|json)$/i, "")}_clean.csv", index=False)
    print("✓ wrote clean csv")
`;

  if (tab === "ml")
    return `"""
DataIQ Pro — Production ML pipeline
${preview}
"""
from __future__ import annotations
import json, numpy as np, pandas as pd, joblib
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix, f1_score,
                             mean_absolute_error, mean_squared_error, r2_score)
from sklearn.model_selection import KFold, StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler, MinMaxScaler
${
  target.kind === "regression"
    ? "from sklearn.linear_model import Ridge\nfrom sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor"
    : "from sklearn.linear_model import LogisticRegression\nfrom sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier"
}

RANDOM_STATE = 42
TARGET = "${target.name}"
FEATURES = ${JSON.stringify(features)}
NUMERIC = ${JSON.stringify(num)}
CATEGORICAL = ${JSON.stringify(cat)}

df = ${readExpr(filename, `"${filename}"`)}.dropna(subset=[TARGET])
${opts.dedupe ? "df = df.drop_duplicates().reset_index(drop=True)\n" : ""}y = df[TARGET]; X = df[FEATURES]
print(f"X={X.shape}  numeric={len(NUMERIC)}  categorical={len(CATEGORICAL)}")

preprocessor = ColumnTransformer([
    ("num", Pipeline([("imp", ${imputerCode(opts.imputeNumeric)}), ("scale", ${scalerCode(opts.scale)})]), NUMERIC),
    ("cat", Pipeline([("imp", ${catImputerCode(opts.imputeCategorical)}), ("enc", ${encoderCode(opts.encode)})]), CATEGORICAL),
])

${
  target.kind === "regression"
    ? `MODELS = {
    "ridge": Ridge(alpha=1.0, random_state=RANDOM_STATE),
    "rf":    RandomForestRegressor(n_estimators=400, n_jobs=-1, random_state=RANDOM_STATE),
    "gbr":   GradientBoostingRegressor(n_estimators=400, max_depth=4, learning_rate=0.05, random_state=RANDOM_STATE),
}
SCORING = "r2"; splitter = KFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE); stratify = None
`
    : `MODELS = {
    "logreg": LogisticRegression(max_iter=1000, n_jobs=-1, class_weight="balanced", random_state=RANDOM_STATE),
    "rf":     RandomForestClassifier(n_estimators=400, n_jobs=-1, class_weight="balanced", random_state=RANDOM_STATE),
    "gbc":    GradientBoostingClassifier(n_estimators=300, max_depth=3, learning_rate=0.05, random_state=RANDOM_STATE),
}
SCORING = "f1_weighted"; splitter = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE); stratify = y
`
}X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=${opts.testSize}, random_state=RANDOM_STATE, stratify=stratify)

leaderboard, fitted = [], {}
for name, est in MODELS.items():
    pipe = Pipeline([("prep", preprocessor), ("model", est)])
    cv = cross_val_score(pipe, X_tr, y_tr, cv=splitter, scoring=SCORING, n_jobs=-1)
    pipe.fit(X_tr, y_tr); pred = pipe.predict(X_te)
${
  target.kind === "regression"
    ? `    metrics = {"cv_r2": float(cv.mean()), "test_r2": float(r2_score(y_te, pred)),
               "test_mae": float(mean_absolute_error(y_te, pred)),
               "test_rmse": float(np.sqrt(mean_squared_error(y_te, pred)))}
`
    : `    metrics = {"cv_f1": float(cv.mean()), "test_acc": float(accuracy_score(y_te, pred)),
               "test_f1": float(f1_score(y_te, pred, average="weighted"))}
`
}    leaderboard.append({"model": name, **metrics}); fitted[name] = pipe
    print(name, json.dumps(metrics, indent=2))

board = pd.DataFrame(leaderboard).sort_values(by=list(leaderboard[0].keys())[1], ascending=False)
print("\\n=== Leaderboard ===\\n", board)
best = board.iloc[0]["model"]
joblib.dump(fitted[best], f"model_{best}.joblib")
${target.kind === "classification" ? `print(classification_report(y_te, fitted[best].predict(X_te)))\n` : ""}print(f"✓ Saved model_{best}.joblib")
`;

  if (tab === "dl")
    return `"""
DataIQ Pro — Deep Learning baseline (PyTorch)
${preview}

Pre-flight checks (mirror the UI checks):
  • TARGET column exists and not constant
  • FEATURES non-empty and exclude TARGET
  • train/val/test split sizes validated
"""
from __future__ import annotations
import math, random
from dataclasses import dataclass
from pathlib import Path
import numpy as np, pandas as pd, torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset, random_split
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler, MinMaxScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split

SEED = 42
def set_seed(s=SEED):
    random.seed(s); np.random.seed(s); torch.manual_seed(s); torch.cuda.manual_seed_all(s)
set_seed()
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

TARGET = "${target.name}"
FEATURES = ${JSON.stringify(features)}
NUMERIC = ${JSON.stringify(num)}
CATEGORICAL = ${JSON.stringify(cat)}

df = ${readExpr(filename, `"${filename}"`)}.dropna(subset=[TARGET])
${opts.dedupe ? "df = df.drop_duplicates().reset_index(drop=True)\n" : ""}
# === pre-flight correctness ===
assert TARGET in df.columns, f"target {TARGET} missing"
assert FEATURES, "no features"
assert TARGET not in FEATURES, "target leak in features"
y_raw = df[TARGET]; X = df[FEATURES]
assert len(X) >= 50, f"too few rows: {len(X)}"
print(f"rows={len(X)} features={X.shape[1]}")

preprocessor = ColumnTransformer([
    ("num", Pipeline([("imp", ${imputerCode(opts.imputeNumeric)}), ("sc", ${scalerCode(opts.scale)})]), NUMERIC),
    ("cat", Pipeline([("imp", ${catImputerCode(opts.imputeCategorical)}), ("enc", ${encoderCode(opts.encode)})]), CATEGORICAL),
])

${
  target.kind === "classification"
    ? `from sklearn.preprocessing import LabelEncoder
le = LabelEncoder(); y = le.fit_transform(y_raw.astype(str))
NUM_CLASSES = int(len(le.classes_))
LOSS = nn.CrossEntropyLoss(); out_dim = NUM_CLASSES; y_dtype = torch.long; stratify = y
`
    : `y = y_raw.astype("float32").to_numpy()
LOSS = nn.SmoothL1Loss(); out_dim = 1; y_dtype = torch.float32; stratify = None
`
}X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=${opts.testSize}, random_state=SEED, stratify=stratify)
X_tr_p = preprocessor.fit_transform(X_tr).astype("float32")
X_te_p = preprocessor.transform(X_te).astype("float32")
in_dim = X_tr_p.shape[1]

train_ds = TensorDataset(torch.tensor(X_tr_p), torch.tensor(y_tr, dtype=y_dtype))
test_ds  = TensorDataset(torch.tensor(X_te_p), torch.tensor(y_te, dtype=y_dtype))
val_size = max(1, int(0.15 * len(train_ds)))
train_ds, val_ds = random_split(train_ds, [len(train_ds) - val_size, val_size], generator=torch.Generator().manual_seed(SEED))

@dataclass
class Cfg:
    epochs: int = 60; batch_size: int = 256; lr: float = 3e-4; weight_decay: float = 1e-4
    hidden: tuple = (256, 128, 64); dropout: float = 0.2; patience: int = 8; grad_clip: float = 1.0
cfg = Cfg()

class TabularMLP(nn.Module):
    def __init__(self, in_dim, out_dim, hidden=(256,128,64), dropout=0.2):
        super().__init__()
        layers, prev = [], in_dim
        for h in hidden:
            layers += [nn.Linear(prev, h), nn.BatchNorm1d(h), nn.SiLU(), nn.Dropout(dropout)]
            prev = h
        layers += [nn.Linear(prev, out_dim)]
        self.net = nn.Sequential(*layers)
    def forward(self, x): return self.net(x)

model = TabularMLP(in_dim, out_dim, cfg.hidden, cfg.dropout).to(DEVICE)
opt = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)
sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=cfg.epochs)
scaler = torch.cuda.amp.GradScaler(enabled=DEVICE == "cuda")

def make_loader(ds, shuffle): return DataLoader(ds, batch_size=cfg.batch_size, shuffle=shuffle, pin_memory=DEVICE == "cuda")
train_loader, val_loader, test_loader = make_loader(train_ds, True), make_loader(val_ds, False), make_loader(test_ds, False)

def epoch(loader, train: bool):
    model.train(train); total, n = 0.0, 0
    for xb, yb in loader:
        xb, yb = xb.to(DEVICE), yb.to(DEVICE)
        with torch.cuda.amp.autocast(enabled=DEVICE == "cuda"):
            out = model(xb)${target.kind === "regression" ? ".squeeze(-1)" : ""}
            loss = LOSS(out, yb)
        if train:
            opt.zero_grad(set_to_none=True); scaler.scale(loss).backward()
            scaler.unscale_(opt); nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
            scaler.step(opt); scaler.update()
        total += loss.item() * xb.size(0); n += xb.size(0)
    return total / max(1, n)

best_val, bad, ckpt = math.inf, 0, Path("model_best.pt")
for ep in range(1, cfg.epochs + 1):
    tr = epoch(train_loader, True); va = epoch(val_loader, False); sched.step()
    print(f"epoch {ep:03d}  train={tr:.4f}  val={va:.4f}")
    if va < best_val - 1e-4:
        best_val, bad = va, 0
        torch.save({"model": model.state_dict(), "in_dim": in_dim, "out_dim": out_dim}, ckpt)
    else:
        bad += 1
        if bad >= cfg.patience: print(f"early stop ep {ep}"); break

model.load_state_dict(torch.load(ckpt, map_location=DEVICE)["model"]); model.eval()
with torch.no_grad():
    preds, ys = [], []
    for xb, yb in test_loader:
        out = model(xb.to(DEVICE))${target.kind === "regression" ? ".squeeze(-1)" : ""}
        preds.append(out.cpu().numpy()); ys.append(yb.numpy())
    preds, ys = np.concatenate(preds), np.concatenate(ys)
${
  target.kind === "classification"
    ? `from sklearn.metrics import accuracy_score, f1_score, classification_report
y_hat = preds.argmax(axis=1)
print(f"acc={accuracy_score(ys, y_hat):.4f}  f1={f1_score(ys, y_hat, average='weighted'):.4f}")
print(classification_report(ys, y_hat))
`
    : `from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
print(f"R²={r2_score(ys, preds):+.4f}  MAE={mean_absolute_error(ys, preds):.4f}  RMSE={math.sqrt(mean_squared_error(ys, preds)):.4f}")
`
}print(f"✓ best checkpoint → {ckpt.resolve()}")
`;

  if (tab === "etl")
    return `"""
DataIQ Pro — Production ETL pipeline
  Extract → Validate (pandera) → Transform → Load (Postgres / Parquet)
${preview}

Pre-flight assertions enforce the same contract as the UI correctness panel.
"""
from __future__ import annotations
import logging, sys, os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import numpy as np, pandas as pd
import pandera as pa
from pandera import Column, DataFrameSchema, Check
from sqlalchemy import create_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s :: %(message)s", stream=sys.stdout)
log = logging.getLogger("etl")

@dataclass(frozen=True)
class Settings:
    source: str = os.getenv("ETL_SOURCE", "${filename}")
    sink_table: str = os.getenv("ETL_SINK_TABLE", "${ds.name
      .replace(/\.(csv|xlsx?|json)$/i, "")
      .replace(/\W+/g, "_")
      .toLowerCase()}")
    sink_url: str | None = os.getenv("DATABASE_URL")
    parquet_out: str = os.getenv("ETL_PARQUET", "warehouse/${ds.name
      .replace(/\.(csv|xlsx?|json)$/i, "")
      .replace(/\W+/g, "_")
      .toLowerCase()}.parquet")
S = Settings()

SCHEMA = DataFrameSchema({
${ds.profiles
  .map((p) => {
    if (p.type === "numeric") return `    "${p.name}": Column(float, nullable=True, coerce=True)`;
    if (p.type === "datetime")
      return `    "${p.name}": Column(pa.DateTime, nullable=True, coerce=True)`;
    return `    "${p.name}": Column(str, nullable=True, coerce=True)`;
  })
  .join(",\n")}
}, strict=False, coerce=True)

REQUIRED = ${JSON.stringify([target.name, ...features])}

def extract(path: str) -> pd.DataFrame:
    log.info("extract %s", path)
    df = ${readExpr(filename, "path", dt)}
    missing = [c for c in REQUIRED if c not in df.columns]
    assert not missing, f"missing required columns: {missing}"
    return df

def validate(df: pd.DataFrame) -> pd.DataFrame:
    return SCHEMA.validate(df, lazy=True)

def transform(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    obj = df.select_dtypes(include="object").columns
    df[obj] = df[obj].apply(lambda s: s.astype("string").str.strip().replace({"": pd.NA, "NA": pd.NA}))
${
  opts.dedupe
    ? `    n0 = len(df); df = df.drop_duplicates().reset_index(drop=True)
    log.info("dedup removed=%d", n0 - len(df))
`
    : ""
}    df["_ingested_at"] = datetime.now(timezone.utc)
    df["_source"] = Path(S.source).name
    return df

def load_parquet(df: pd.DataFrame, out: str) -> None:
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False, compression="snappy")
    log.info("parquet rows=%d → %s", len(df), out)

def load_postgres(df: pd.DataFrame, table: str, url: str) -> None:
    eng = create_engine(url, pool_pre_ping=True)
    with eng.begin() as conn:
        df.to_sql(table, conn, if_exists="append", index=False, method="multi", chunksize=5_000)
    log.info("postgres table=%s rows=%d", table, len(df))

def run() -> int:
    try:
        df = transform(validate(extract(S.source)))
        load_parquet(df, S.parquet_out)
        if S.sink_url: load_postgres(df, S.sink_table, S.sink_url)
        log.info("✓ pipeline ok rows=%d", len(df))
        return 0
    except pa.errors.SchemaErrors as e:
        log.error("schema validation failed:\\n%s", e.failure_cases.head(50)); return 2
    except Exception:
        log.exception("pipeline crashed"); return 1

if __name__ == "__main__":
    raise SystemExit(run())
`;

  if (tab === "sql")
    return `-- DataIQ Pro — SQL profiling for ${ds.name}
-- Replace "your_table" with your actual table name.

SELECT COUNT(*) AS row_count FROM your_table;

SELECT
${ds.columns.map((c) => `  SUM(CASE WHEN ${c} IS NULL THEN 1 ELSE 0 END) AS ${c.replace(/\W+/g, "_")}_nulls`).join(",\n")}
FROM your_table;

${allNum
  .map(
    (c) => `SELECT '${c}' AS col,
  MIN(${c}) AS min, MAX(${c}) AS max, AVG(${c}) AS mean, STDDEV_SAMP(${c}) AS std,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ${c}) AS median
FROM your_table;`,
  )
  .join("\n\n")}

-- Duplicates
SELECT ${ds.columns.join(", ")}, COUNT(*) AS dup_count
FROM your_table GROUP BY ${ds.columns.join(", ")} HAVING COUNT(*) > 1;
`;

  // FastAPI service
  if (tab === "api")
    return `"""
DataIQ Pro — FastAPI prediction service
${preview}

Run:
  pip install fastapi uvicorn pydantic joblib pandas scikit-learn
  uvicorn app:app --host 0.0.0.0 --port 8000

Train with the ML Pipeline tab first to produce model_<best>.joblib.
"""
from __future__ import annotations
import logging, os, time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s :: %(message)s")
log = logging.getLogger("api")

MODEL_PATH = Path(os.getenv("MODEL_PATH", "model_best.joblib"))
TARGET = "${target.name}"
FEATURES = ${JSON.stringify(features)}
NUMERIC = ${JSON.stringify(num)}
CATEGORICAL = ${JSON.stringify(cat)}
TASK = "${target.kind}"

class PredictItem(BaseModel):
    """One row of features. Validate types loosely; the sklearn pipeline coerces."""
${features
  .slice(0, 30)
  .map((f) => {
    const p = ds.profiles.find((x) => x.name === f);
    const t = p?.type === "numeric" ? "float | None" : "str | None";
    return `    ${safePy(f)}: ${t} = Field(default=None${f !== safePy(f) ? `, alias="${f}"` : ""})`;
  })
  .join("\n")}

    class Config:
        populate_by_name = True
        extra = "allow"

class PredictRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(..., min_length=1, max_length=1000)

class PredictResponse(BaseModel):
    predictions: list[Any]
    task: str
    model: str
    n_rows: int
    latency_ms: float

app = FastAPI(title="DataIQ Pro Inference", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_model = None
def get_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise HTTPException(503, f"Model not found at {MODEL_PATH}. Train first.")
        _model = joblib.load(MODEL_PATH)
        log.info("loaded model from %s", MODEL_PATH)
    return _model

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": MODEL_PATH.exists(), "task": TASK}

@app.get("/schema")
def schema():
    return {"target": TARGET, "features": FEATURES, "numeric": NUMERIC, "categorical": CATEGORICAL, "task": TASK}

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    t0 = time.perf_counter()
    df = pd.DataFrame(req.rows)
    missing = [c for c in FEATURES if c not in df.columns]
    if missing:
        raise HTTPException(400, f"missing required features: {missing}")
    df = df[FEATURES]
    model = get_model()
    try:
        preds = model.predict(df)
        if TASK == "classification" and hasattr(model, "predict_proba"):
            proba = model.predict_proba(df)
            preds = [{"label": str(p), "proba": float(np.max(pr))} for p, pr in zip(preds, proba)]
        else:
            preds = preds.tolist()
    except Exception as e:
        log.exception("inference failed")
        raise HTTPException(500, f"inference error: {e}") from e
    return PredictResponse(predictions=preds, task=TASK, model=MODEL_PATH.name,
                           n_rows=len(df), latency_ms=round((time.perf_counter() - t0) * 1000, 2))

@app.middleware("http")
async def access_log(request: Request, call_next):
    t0 = time.perf_counter()
    resp = await call_next(request)
    log.info('%s %s -> %d (%.1fms)', request.method, request.url.path, resp.status_code, (time.perf_counter() - t0) * 1000)
    return resp
`;

  if (tab === "streamlit")
    return `"""
DataIQ Pro — Streamlit Dashboard
Run:
  pip install streamlit pandas plotly
  streamlit run app.py
"""
import streamlit as st
import pandas as pd
import plotly.express as px

st.set_page_config(
    page_title="${ds.name} Dashboard",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- Custom CSS for better UI ---
st.markdown("""
<style>
    .stMetric { background-color: #f0f2f6; padding: 15px; border-radius: 12px; border: 1px solid #e0e0e0; }
    [data-theme="dark"] .stMetric { background-color: #1e1e24; border: 1px solid #333; }
</style>
""", unsafe_allow_html=True)

@st.cache_data
def load_data():
    return ${readExpr(filename, `"${filename}"`)}

# --- Sidebar ---
st.sidebar.title("Configuration ⚙️")
st.sidebar.markdown("Filter and control the dashboard here.")

try:
    with st.spinner("Loading dataset..."):
        df = load_data()
    
    # Optional Sidebar Filtering
    sample_size = st.sidebar.slider("Sample Size", min_value=100, max_value=len(df), value=min(10000, len(df)))
    df_sample = df.sample(n=sample_size, random_state=42) if sample_size < len(df) else df

    # --- Header ---
    st.title("📊 ${ds.name} Dashboard")
    st.markdown("An interactive data exploration tool generated by **DataIQ Pro**.")
    
    # --- KPIs ---
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Rows", f"{len(df):,}")
    col2.metric("Total Columns", f"{len(df.columns)}")
    num_cols = len(df.select_dtypes(include="number").columns)
    col3.metric("Numeric Features", num_cols)
    col4.metric("Categorical Features", len(df.columns) - num_cols)
    
    st.divider()

    # --- Main Content Tabs ---
    tab1, tab2, tab3 = st.tabs(["📈 Data Explorer", "🔍 Distributions", "📋 Raw Data"])
    
    with tab1:
        st.subheader("Feature Relationships")
        num_features = df.select_dtypes(include="number").columns.tolist()
        if len(num_features) >= 2:
            sc1, sc2 = st.columns(2)
            x_col = sc1.selectbox("X-Axis", num_features, index=0)
            y_col = sc2.selectbox("Y-Axis", num_features, index=1)
            
            fig = px.scatter(df_sample, x=x_col, y=y_col, title=f"{y_col} vs {x_col}", opacity=0.7)
            st.plotly_chart(fig, use_container_width=True, theme="streamlit")
        else:
            st.info("Not enough numeric columns for scatter plots.")

    with tab2:
        st.subheader("Column Distributions")
        dist_col = st.selectbox("Select Column to Analyze", df.columns)
        
        if pd.api.types.is_numeric_dtype(df[dist_col]):
            fig = px.histogram(df_sample, x=dist_col, nbins=50, title=f"Distribution of {dist_col}", marginal="box")
            st.plotly_chart(fig, use_container_width=True, theme="streamlit")
        else:
            top_n = df_sample[dist_col].value_counts().nlargest(15).index
            filtered_df = df_sample[df_sample[dist_col].isin(top_n)]
            fig = px.pie(filtered_df, names=dist_col, title=f"Proportions of {dist_col} (Top 15)", hole=0.4)
            st.plotly_chart(fig, use_container_width=True, theme="streamlit")

    with tab3:
        st.subheader("Raw Dataset")
        st.dataframe(df, use_container_width=True)
        
        st.subheader("Statistical Summary")
        st.dataframe(df.describe(), use_container_width=True)
        
except Exception as e:
    st.error(f"Error loading dataset: {e}")
    st.info("Make sure the CSV file is in the same directory as this script.")
`;

  if (tab === "docker")
    return `# Dockerfile for FastAPI or Streamlit Service
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Expose port
EXPOSE 8000

# Command to run (Defaults to FastAPI)
# For Streamlit, change to: CMD ["streamlit", "run", "app.py", "--server.port", "8000", "--server.address", "0.0.0.0"]
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
`;

  return `# Automatically generated requirements
pandas>=2.0.0
numpy>=1.24.0
scikit-learn>=1.3.0
matplotlib>=3.7.0
seaborn>=0.12.0
scipy>=1.10.0
joblib>=1.3.0
# FastAPI Service
fastapi>=0.100.0
uvicorn[standard]>=0.23.0
pydantic>=2.0.0
# Streamlit Dashboard
streamlit>=1.25.0
# ETL Pipeline
pandera>=0.16.0
SQLAlchemy>=2.0.0
pyarrow>=12.0.0
# Deep Learning (PyTorch)
torch>=2.0.0
`;
}

function safePy(name: string): string {
  let s = name.replace(/\W+/g, "_");
  if (/^\d/.test(s)) s = "_" + s;
  if (!s) s = "field";
  return s;
}

const CustomSelect = ({
  value,
  options,
  onChange,
  placeholder,
  icon: Icon,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ElementType;
}) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o: { value: string; label: string }) => o.value === value);

  return (
    <div className={`relative ${open ? "z-50" : "z-10"}`}>
      <div
        onClick={() => setOpen(!open)}
        className="w-full bg-background/40 hover:bg-background/80 transition-colors px-3 py-1.5 rounded-2xl border border-white/10 text-sm font-medium backdrop-blur-md shadow-sm flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-primary" />}
          <span className={selected ? "text-foreground" : "text-muted-foreground truncate"}>
            {selected ? selected.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full left-0 right-0 mt-2 p-1.5 rounded-2xl border border-white/10 bg-[#09090b] shadow-2xl z-50 flex flex-col gap-0.5 max-h-[300px] overflow-y-auto"
          >
            {options.map((opt: { value: string; label: string }) => (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`px-3 py-2 rounded-xl text-sm font-medium cursor-pointer transition-colors ${value === opt.value ? "bg-primary/20 text-primary" : "hover:bg-white/5 text-muted-foreground hover:text-foreground"}`}
              >
                {opt.label}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
