// IndexedDB-backed dataset version history.
// Stores compact snapshots of dataset profile + first 1000 rows for diffing.
import type { Dataset, ColumnProfile } from "./stats";

const DB_NAME = "dataiq_versions";
const STORE = "versions";
const DB_VERSION = 1;

export interface DatasetVersion {
  id: string;
  name: string;
  label: string;
  createdAt: number;
  rowCount: number;
  colCount: number;
  missingTotal: number;
  duplicateRows: number;
  readinessScore: number;
  columns: string[];
  profiles: ColumnProfile[];
  sampleRows: Record<string, unknown>[]; // first 1000 rows
  fullRowsAvailable: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function saveVersion(ds: Dataset, label?: string): Promise<DatasetVersion> {
  const db = await openDB();
  const v: DatasetVersion = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: ds.name,
    label: label || `Snapshot ${new Date().toLocaleString()}`,
    createdAt: Date.now(),
    rowCount: ds.rowCount,
    colCount: ds.colCount,
    missingTotal: ds.missingTotal,
    duplicateRows: ds.duplicateRows,
    readinessScore: ds.readinessScore,
    columns: ds.columns,
    profiles: ds.profiles,
    sampleRows: ds.rows.slice(0, 1000),
    fullRowsAvailable: ds.rows.length <= 1000,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(v);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return v;
}

export async function listVersions(): Promise<DatasetVersion[]> {
  try {
    const db = await openDB();
    return await new Promise<DatasetVersion[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () =>
        resolve((req.result as DatasetVersion[]).sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deleteVersion(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getVersion(id: string): Promise<DatasetVersion | null> {
  const db = await openDB();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as DatasetVersion) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export interface ColumnDelta {
  name: string;
  type: string;
  meanDelta: number;
  stdDelta: number;
  minDelta: number;
  maxDelta: number;
  missingDelta: number;
  uniqueDelta: number;
  outlierDelta: number;
  before: { mean?: number; std?: number; missing: number; unique: number };
  after: { mean?: number; std?: number; missing: number; unique: number };
}

export interface VersionDiff {
  rowDelta: number;
  colDelta: number;
  missingDelta: number;
  readinessDelta: number;
  duplicateDelta: number;
  addedColumns: string[];
  removedColumns: string[];
  typeChanges: { name: string; from: string; to: string }[];
  numericChanges: { name: string; meanDelta: number; stdDelta: number; missingDelta: number }[];
  columnDeltas: ColumnDelta[];
}

export function diffVersions(a: DatasetVersion, b: DatasetVersion): VersionDiff {
  const aCols = new Set(a.columns);
  const bCols = new Set(b.columns);
  const added = b.columns.filter((c) => !aCols.has(c));
  const removed = a.columns.filter((c) => !bCols.has(c));
  const aMap = new Map(a.profiles.map((p) => [p.name, p]));
  const typeChanges: VersionDiff["typeChanges"] = [];
  const numericChanges: VersionDiff["numericChanges"] = [];
  const columnDeltas: ColumnDelta[] = [];
  for (const bp of b.profiles) {
    const ap = aMap.get(bp.name);
    if (!ap) continue;
    if (ap.type !== bp.type) typeChanges.push({ name: bp.name, from: ap.type, to: bp.type });
    const meanDelta = (bp.mean ?? 0) - (ap.mean ?? 0);
    const stdDelta = (bp.std ?? 0) - (ap.std ?? 0);
    columnDeltas.push({
      name: bp.name,
      type: bp.type,
      meanDelta,
      stdDelta,
      minDelta: (bp.min ?? 0) - (ap.min ?? 0),
      maxDelta: (bp.max ?? 0) - (ap.max ?? 0),
      missingDelta: bp.missing - ap.missing,
      uniqueDelta: bp.unique - ap.unique,
      outlierDelta: (bp.outliersIQR ?? 0) - (ap.outliersIQR ?? 0),
      before: { mean: ap.mean, std: ap.std, missing: ap.missing, unique: ap.unique },
      after: { mean: bp.mean, std: bp.std, missing: bp.missing, unique: bp.unique },
    });
    if (ap.type === "numeric" && bp.type === "numeric") {
      numericChanges.push({
        name: bp.name,
        meanDelta,
        stdDelta,
        missingDelta: bp.missing - ap.missing,
      });
    }
  }
  return {
    rowDelta: b.rowCount - a.rowCount,
    colDelta: b.colCount - a.colCount,
    missingDelta: b.missingTotal - a.missingTotal,
    readinessDelta: b.readinessScore - a.readinessScore,
    duplicateDelta: b.duplicateRows - a.duplicateRows,
    addedColumns: added,
    removedColumns: removed,
    typeChanges,
    numericChanges: numericChanges
      .sort((x, y) => Math.abs(y.meanDelta) - Math.abs(x.meanDelta))
      .slice(0, 20),
    columnDeltas,
  };
}
