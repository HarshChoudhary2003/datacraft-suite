// Durable persistence for an in-flight upload/processing job so that a browser
// reload mid-processing can RESUME instead of starting over. We persist the raw
// file bytes (a File can't be serialized directly) plus the last known phase.
export type ProcessingPhaseId = "parse" | "profile" | "correlate" | "store";

export interface ProcessingJob {
  id: string;
  fileName: string;
  fileType: string;
  fileBytes: ArrayBuffer;
  phase: ProcessingPhaseId;
  overallPct: number;
  startedAt: number;
  updatedAt: number;
  status: "running" | "error";
}

const DB_NAME = "dataiq_runtime";
const STORE = "processing_jobs";
const KEY = "active";
const DB_VERSION = 2; // bumped to add the processing_jobs store alongside current_dataset

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("current_dataset")) {
        db.createObjectStore("current_dataset", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Persist the file + initial job state at the very start of processing. */
export async function startJob(file: File, phase: ProcessingPhaseId = "parse"): Promise<void> {
  try {
    const fileBytes = await file.arrayBuffer();
    const db = await openDB();
    const now = Date.now();
    const job: ProcessingJob = {
      id: KEY,
      fileName: file.name,
      fileType: file.type,
      fileBytes,
      phase,
      overallPct: 0,
      startedAt: now,
      updatedAt: now,
      status: "running",
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(job);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* best-effort — resume is a nicety, not required for the upload to work */
  }
}

/** Lightweight update of phase/progress (does not rewrite file bytes if missing). */
export async function updateJob(phase: ProcessingPhaseId, overallPct: number): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const getReq = store.get(KEY);
      getReq.onsuccess = () => {
        const job = getReq.result as ProcessingJob | undefined;
        if (job) {
          job.phase = phase;
          job.overallPct = overallPct;
          job.updatedAt = Date.now();
          store.put(job);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function loadJob(): Promise<ProcessingJob | null> {
  try {
    const db = await openDB();
    return await new Promise<ProcessingJob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as ProcessingJob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearJob(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/** Rebuild a File object from a persisted job so processing can resume. */
export function jobToFile(job: ProcessingJob): File {
  return new File([job.fileBytes], job.fileName, { type: job.fileType });
}
