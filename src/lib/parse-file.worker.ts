/// <reference lib="webworker" />
// Web worker: parse data and build dataset off the main thread.
import { parseFile } from "./parse-file";
import { buildDatasetScaled, correlationMatrix, type Dataset } from "./stats";

export type WorkerInbound =
  | { id: number; type: "from_file"; file: File }
  | { id: number; type: "from_rows"; name: string; rows: Record<string, unknown>[] };

export type WorkerOutbound =
  | {
      id: number;
      type: "progress";
      stage: "parse" | "profile" | "correlate";
      phase: string;
      pct: number;
    }
  | { id: number; type: "done"; dataset: Dataset; sheetNames?: string[] }
  | { id: number; type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<WorkerInbound>) => {
  const { id } = ev.data;
  const post = (m: WorkerOutbound) => ctx.postMessage(m);
  try {
    let rows: Record<string, unknown>[];
    let name: string;
    let sheetNames: string[] | undefined;

    if (ev.data.type === "from_file") {
      name = ev.data.file.name;
      post({ id, type: "progress", stage: "parse", phase: "Reading file…", pct: 10 });
      const parsed = await parseFile(ev.data.file);
      rows = parsed.rows;
      sheetNames = parsed.sheetNames;
      post({ id, type: "progress", stage: "parse", phase: "Normalizing rows…", pct: 100 });
    } else {
      name = ev.data.name;
      rows = ev.data.rows;
      post({ id, type: "progress", stage: "parse", phase: "Rows loaded", pct: 100 });
    }

    if (rows.length === 0) throw new Error("No rows found");

    post({ id, type: "progress", stage: "profile", phase: "Profiling columns…", pct: 10 });
    const dataset = buildDatasetScaled(name, rows);
    post({ id, type: "progress", stage: "profile", phase: "Profiling complete", pct: 100 });

    post({ id, type: "progress", stage: "correlate", phase: "Computing correlations…", pct: 10 });
    dataset.correlation = correlationMatrix(dataset);
    post({ id, type: "progress", stage: "correlate", phase: "Correlations complete", pct: 100 });

    post({ id, type: "done", dataset, sheetNames });
  } catch (e) {
    post({ id, type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
