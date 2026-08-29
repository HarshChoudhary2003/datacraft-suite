// Helper to run full dataset pipeline in a Web Worker with progress callbacks.
// Falls back to inline (main-thread) parsing if the worker is unavailable
// or fails to initialize/run for any reason — so uploads never silently die.
import { parseFile as inlineParse } from "./parse-file";
import { buildDataset, correlationMatrix, type Dataset } from "./stats";
import type { WorkerInbound, WorkerOutbound } from "./parse-file.worker";

export interface PipelineProgressEvent {
  stage: "parse" | "profile" | "correlate";
  phase: string;
  pct: number;
}
export type ParseEngine = "worker" | "fallback";

export interface ParseAttempt {
  parser: ParseEngine;
  status: "success" | "failed" | "unavailable";
  message: string;
}

export interface ParseDiagnostics {
  attempts: ParseAttempt[];
  finalParser?: ParseEngine;
}

export interface PipelineWorkerResult {
  dataset: Dataset;
  sheetNames?: string[];
  diagnostics: ParseDiagnostics;
}

export class ParseFileError extends Error {
  diagnostics: ParseDiagnostics;

  constructor(message: string, diagnostics: ParseDiagnostics) {
    super(message);
    this.name = "ParseFileError";
    this.diagnostics = diagnostics;
  }
}

function normalizeReason(reason: unknown, fallback = "Upload parsing failed.") {
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return reason.message;
  return fallback;
}

const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

async function inlineFallback(
  options: { file?: File; name?: string; rows?: Record<string, unknown>[] },
  onProgress?: (p: PipelineProgressEvent) => void,
) {
  let rows: Record<string, unknown>[];
  let sheetNames: string[] | undefined;
  let name: string;

  if (options.file) {
    name = options.file.name;
    onProgress?.({ stage: "parse", phase: "Parsing on main thread…", pct: 30 });
    const parsed = await inlineParse(options.file);
    rows = parsed.rows;
    sheetNames = parsed.sheetNames;
    onProgress?.({ stage: "parse", phase: "Normalizing rows…", pct: 80 });
  } else {
    name = options.name ?? "dataset";
    rows = options.rows ?? [];
    onProgress?.({ stage: "parse", phase: "Rows loaded", pct: 100 });
  }

  if (rows.length === 0) throw new Error("No rows found");

  await yieldToUI();
  onProgress?.({ stage: "profile", phase: "Profiling columns…", pct: 10 });
  const dataset = buildDataset(name, rows);
  onProgress?.({ stage: "profile", phase: "Profiling complete", pct: 100 });

  await yieldToUI();
  onProgress?.({ stage: "correlate", phase: "Computing correlations…", pct: 10 });
  dataset.correlation = correlationMatrix(dataset);
  onProgress?.({ stage: "correlate", phase: "Correlations complete", pct: 100 });

  return { dataset, sheetNames };
}

export function runWorkerPipeline(
  options: { file?: File; name?: string; rows?: Record<string, unknown>[] },
  onProgress?: (p: PipelineProgressEvent) => void,
): Promise<PipelineWorkerResult> {
  const attempts: ParseAttempt[] = [];

  if (typeof Worker === "undefined") {
    attempts.push({
      parser: "worker",
      status: "unavailable",
      message: "Background worker support is unavailable, so parsing switched to the main thread.",
    });
    return inlineFallback(options, onProgress).then(
      ({ dataset, sheetNames }) => ({
        dataset,
        sheetNames,
        diagnostics: {
          attempts: [
            ...attempts,
            {
              parser: "fallback",
              status: "success",
              message: "Main-thread parsing completed successfully.",
            },
          ],
          finalParser: "fallback",
        },
      }),
      (error) => {
        const message = normalizeReason(error);
        throw new ParseFileError(message, {
          attempts: [...attempts, { parser: "fallback", status: "failed", message }],
        });
      },
    );
  }

  return new Promise((resolve, reject) => {
    let worker: Worker;
    let settled = false;
    let fallbackStarted = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        worker?.terminate();
      } catch {
        /* noop */
      }
      fn();
    };

    const fallback = (reason?: unknown) => {
      if (settled || fallbackStarted) return;
      fallbackStarted = true;
      try {
        worker?.terminate();
      } catch {
        /* noop */
      }
      const workerMessage = normalizeReason(reason, "Background worker parsing failed.");
      attempts.push({ parser: "worker", status: "failed", message: workerMessage });
      if (reason) console.warn("[parse-file] worker failed, falling back to main thread:", reason);

      inlineFallback(options, onProgress).then(
        ({ dataset, sheetNames }) => {
          finish(() =>
            resolve({
              dataset,
              sheetNames,
              diagnostics: {
                attempts: [
                  ...attempts,
                  {
                    parser: "fallback",
                    status: "success",
                    message: "Main-thread parsing completed successfully after the worker failed.",
                  },
                ],
                finalParser: "fallback",
              },
            }),
          );
        },
        (error) => {
          const message = normalizeReason(error);
          finish(() =>
            reject(
              new ParseFileError(message, {
                attempts: [...attempts, { parser: "fallback", status: "failed", message }],
              }),
            ),
          );
        },
      );
    };

    try {
      worker = new Worker(new URL("./parse-file.worker.ts", import.meta.url), { type: "module" });
    } catch (e) {
      fallback(e);
      return;
    }

    const id = Date.now();

    worker.onmessage = (ev: MessageEvent<WorkerOutbound>) => {
      const msg = ev.data;
      if (msg.id !== id) return;
      if (msg.type === "progress")
        onProgress?.({ stage: msg.stage, phase: msg.phase, pct: msg.pct });
      else if (msg.type === "done") {
        attempts.push({
          parser: "worker",
          status: "success",
          message: "Background worker pipeline completed successfully.",
        });
        finish(() =>
          resolve({
            dataset: msg.dataset,
            sheetNames: msg.sheetNames,
            diagnostics: { attempts, finalParser: "worker" },
          }),
        );
      } else fallback(msg.message);
    };
    worker.onerror = (e) => fallback(e instanceof ErrorEvent ? e.message : e);
    worker.onmessageerror = () => fallback("message deserialization failed");

    try {
      if (options.file) {
        worker.postMessage({ id, type: "from_file", file: options.file });
      } else if (options.name && options.rows) {
        worker.postMessage({ id, type: "from_rows", name: options.name, rows: options.rows });
      } else {
        throw new Error("Must provide either file or rows");
      }
    } catch (e) {
      fallback(e);
    }
  });
}
