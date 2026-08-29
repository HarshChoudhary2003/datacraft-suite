import type { Dataset } from "@/lib/stats";

const DB_NAME = "dataiq_runtime";
const STORE = "current_dataset";
const KEY = "active";
const FALLBACK_KEY = "dataiq.current_dataset";
// Keep this version in sync with src/lib/processing-job.ts — both modules open
// the same database and must agree on the version + object stores.
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("processing_jobs")) {
        db.createObjectStore("processing_jobs", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function readFallback(): Dataset | null {
  if (!canUseBrowserStorage()) return null;
  try {
    const raw = window.localStorage.getItem(FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as Dataset) : null;
  } catch {
    return null;
  }
}

function writeFallback(dataset: Dataset | null): boolean {
  if (!canUseBrowserStorage()) return false;
  try {
    if (dataset) window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(dataset));
    else window.localStorage.removeItem(FALLBACK_KEY);
    return true;
  } catch {
    // quota exceeded / privacy mode — durability handled by IndexedDB instead.
    return false;
  }
}

function clearFallback() {
  if (!canUseBrowserStorage()) return;
  try {
    window.localStorage.removeItem(FALLBACK_KEY);
  } catch {
    /* ignore */
  }
}

export async function loadCurrentDataset(): Promise<Dataset | null> {
  try {
    const db = await openDB();
    const fromDb = await new Promise<Dataset | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result?.dataset as Dataset | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    return fromDb ?? readFallback();
  } catch {
    return readFallback();
  }
}

export async function saveCurrentDataset(dataset: Dataset): Promise<void> {
  // Prefer IndexedDB (durable, large-capacity). Only mirror to localStorage
  // when IndexedDB is unavailable, so we don't duplicate large datasets or
  // blow the localStorage quota.
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id: KEY, dataset, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // IndexedDB succeeded — drop any stale localStorage copy.
    clearFallback();
  } catch {
    // IndexedDB failed/unavailable — fall back to localStorage for durability.
    writeFallback(dataset);
  }
}

export async function clearCurrentDataset(): Promise<void> {
  clearFallback();
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* noop */
  }
}
