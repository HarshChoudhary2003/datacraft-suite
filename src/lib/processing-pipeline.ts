// Staged dataset-processing pipeline with per-step progress + ETA.
// Stages: parse → profile → correlate → store. Each stage reports progress
// within itself; the pipeline maps that to a weighted overall percentage and
// estimates time remaining from elapsed time vs. fraction completed.
import { runWorkerPipeline, type ParseDiagnostics } from "./parse-file-worker-client";
import { type Dataset } from "./stats";
import { saveCurrentDataset } from "./current-dataset";
import { startJob, updateJob, clearJob, type ProcessingPhaseId } from "./processing-job";
import {
  recordTelemetry,
  type ProcessingTelemetry,
  type StageTiming,
} from "./processing-telemetry";

export interface StageInfo {
  id: ProcessingPhaseId;
  label: string;
  status: "pending" | "running" | "done";
}

export interface PipelineProgress {
  stage: ProcessingPhaseId;
  stageLabel: string;
  overallPct: number;
  etaMs: number | null;
  resuming: boolean;
  stages: StageInfo[];
}

export const STAGE_DEFS: { id: ProcessingPhaseId; label: string; weight: number }[] = [
  { id: "parse", label: "Parsing file", weight: 0.5 },
  { id: "profile", label: "Profiling columns", weight: 0.25 },
  { id: "correlate", label: "Computing correlations", weight: 0.15 },
  { id: "store", label: "Storing dataset", weight: 0.1 },
];

const STAGE_START: Record<ProcessingPhaseId, number> = (() => {
  const map = {} as Record<ProcessingPhaseId, number>;
  let acc = 0;
  for (const s of STAGE_DEFS) {
    map[s.id] = acc;
    acc += s.weight;
  }
  return map;
})();

function stageList(active: ProcessingPhaseId): StageInfo[] {
  const order = STAGE_DEFS.map((s) => s.id);
  const activeIdx = order.indexOf(active);
  return STAGE_DEFS.map((s, i) => ({
    id: s.id,
    label: s.label,
    status: i < activeIdx ? "done" : i === activeIdx ? "running" : "pending",
  }));
}

export interface PipelineResult {
  dataset: Dataset;
  diagnostics?: ParseDiagnostics;
  rowCount: number;
  telemetry: ProcessingTelemetry;
}

interface RunOptions {
  /** Provide a File to parse from scratch (uploads + resume). */
  file?: File;
  /** Or provide already-parsed rows (sample datasets). */
  name?: string;
  rows?: Record<string, unknown>[];
  resuming?: boolean;
  /** Skip persisting the file as a resumable job (used for sample data). */
  persistJob?: boolean;
  onProgress?: (p: PipelineProgress) => void;
}

export async function runPipeline(opts: RunOptions): Promise<PipelineResult> {
  const { file, onProgress, resuming = false, persistJob = true } = opts;
  const startedAt = Date.now();

  // Per-stage timing tracker: when the active stage changes we close out the
  // previous stage's elapsed time. Powers the in-app processing telemetry.
  const stageDurations: Partial<Record<ProcessingPhaseId, number>> = {};
  let currentStage: ProcessingPhaseId | null = null;
  let currentStageStart = startedAt;

  const markStage = (stage: ProcessingPhaseId) => {
    if (currentStage === stage) return;
    if (currentStage) {
      stageDurations[currentStage] =
        (stageDurations[currentStage] ?? 0) + (Date.now() - currentStageStart);
    }
    currentStage = stage;
    currentStageStart = Date.now();
  };

  const finalizeStages = () => {
    if (currentStage) {
      stageDurations[currentStage] =
        (stageDurations[currentStage] ?? 0) + (Date.now() - currentStageStart);
      currentStage = null;
    }
  };

  const emit = (stage: ProcessingPhaseId, stagePct: number, customLabel?: string) => {
    markStage(stage);
    const def = STAGE_DEFS.find((s) => s.id === stage)!;
    const overall = Math.min(100, (STAGE_START[stage] + def.weight * (stagePct / 100)) * 100);
    const elapsed = Date.now() - startedAt;
    const frac = overall / 100;
    const etaMs =
      frac > 0.02 && frac < 1 ? Math.round((elapsed / frac) * (1 - frac)) : frac >= 1 ? 0 : null;
    onProgress?.({
      stage,
      stageLabel: customLabel || def.label,
      overallPct: overall,
      etaMs,
      resuming,
      stages: stageList(stage),
    });
  };

  if (file && persistJob) await startJob(file, "parse");

  // Call the web worker which now handles parse -> profile -> correlate
  const workerResult = await runWorkerPipeline(
    { file, name: opts.name, rows: opts.rows },
    async (p) => {
      emit(p.stage, p.pct, p.phase);
      if (persistJob) {
        if (p.stage === "profile" && p.pct === 10) await updateJob("profile", 50);
        if (p.stage === "correlate" && p.pct === 10) await updateJob("correlate", 75);
      }
    },
  );

  const { dataset, diagnostics } = workerResult;

  if (persistJob) await updateJob("store", 90);

  // ---- Stage 4: store ----
  emit("store", 30, "Saving to local database…");
  await saveCurrentDataset(dataset);
  emit("store", 100, "Done");
  finalizeStages(); // close out the final stage timer

  if (persistJob) await clearJob();

  const totalMs = Date.now() - startedAt;
  const stages: StageTiming[] = STAGE_DEFS.map((s) => ({
    id: s.id,
    label: s.label,
    ms: stageDurations[s.id] ?? 0,
  }));
  const telemetry: ProcessingTelemetry = {
    fileName: dataset.name,
    rowCount: dataset.rowCount,
    colCount: dataset.colCount,
    totalMs,
    rowsPerSec: totalMs > 0 ? Math.round((dataset.rowCount / totalMs) * 1000) : 0,
    stages,
    recordedAt: Date.now(),
    resumed: resuming,
  };
  recordTelemetry(telemetry);

  return { dataset, diagnostics, rowCount: dataset.rowCount, telemetry };
}
