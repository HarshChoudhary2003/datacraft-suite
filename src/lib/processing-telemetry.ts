// In-app telemetry for the upload/processing pipeline. Records how long each
// stage (parse → profile → correlate → store) took, plus overall throughput,
// so the UI can confirm the app stays responsive under load and ETAs are
// accurate. Persisted to localStorage as a small rolling history.
import type { ProcessingPhaseId } from "./processing-job";

export interface StageTiming {
  id: ProcessingPhaseId;
  label: string;
  ms: number;
}

export interface ProcessingTelemetry {
  fileName: string;
  rowCount: number;
  colCount: number;
  totalMs: number;
  rowsPerSec: number;
  stages: StageTiming[];
  recordedAt: number;
  resumed: boolean;
}

const KEY = "dataiq.telemetry";
const MAX_HISTORY = 20;

function canUse(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Read the full rolling history (newest first). */
export function readTelemetryHistory(): ProcessingTelemetry[] {
  if (!canUse()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProcessingTelemetry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The most recent processing run, if any. */
export function readLatestTelemetry(): ProcessingTelemetry | null {
  return readTelemetryHistory()[0] ?? null;
}

/** Persist a completed run to the front of the rolling history. */
export function recordTelemetry(entry: ProcessingTelemetry): void {
  if (!canUse()) return;
  try {
    const history = readTelemetryHistory();
    const next = [entry, ...history].slice(0, MAX_HISTORY);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* best-effort — telemetry is a nicety, never blocks processing */
  }
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}
