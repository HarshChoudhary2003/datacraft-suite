// Dashboard save points, version history and shareable links.
//
// Versions are stored in localStorage as full layout snapshots (widgets + theme
// + filters) so a user can roll a canvas back after experimenting. Share links
// encode the same snapshot into the URL so no server round-trip is needed —
// the recipient opens /charts#dash=<payload> and the canvas rebuilds locally.

import type { Widget } from "./dashboard-store";

export interface DashboardVersion {
  id: string;
  label: string;
  createdAt: number;
  datasetName: string;
  theme: string;
  widgets: Widget[];
  /** Slicer selections captured with the save point. */
  slicers: Record<string, string[]>;
}

/** The payload that travels inside a share link. */
export interface SharePayload {
  v: 1;
  name: string;
  theme: string;
  widgets: Widget[];
  slicers: Record<string, string[]>;
  /** Read-only links hide all editing affordances. */
  ro: boolean;
}

const KEY = "dataiq.dashboard.versions.v1";
const MAX_VERSIONS = 20;

function read(): DashboardVersion[] {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DashboardVersion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: DashboardVersion[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_VERSIONS)));
    return true;
  } catch {
    return false;
  }
}

export function listVersions(datasetName: string): DashboardVersion[] {
  return read()
    .filter((v) => v.datasetName === datasetName)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function saveVersion(
  input: Omit<DashboardVersion, "id" | "createdAt">,
): DashboardVersion | null {
  const version: DashboardVersion = {
    ...input,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  const next = [version, ...read()];
  return write(next) ? version : null;
}

export function deleteVersion(id: string): void {
  write(read().filter((v) => v.id !== id));
}

/* ------------------------------------------------------------------ */
/* Share links                                                         */
/* ------------------------------------------------------------------ */

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Build an absolute share URL for the current canvas. */
export function buildShareLink(payload: SharePayload, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/charts#dash=${toBase64Url(JSON.stringify(payload))}`;
}

/** Parse a share payload out of a location hash. Returns null when absent/invalid. */
export function parseShareHash(hash: string): SharePayload | null {
  const m = /(?:^|[#&])dash=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(m[1])) as SharePayload;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.widgets)) return null;
    return { ...parsed, slicers: parsed.slicers ?? {}, ro: !!parsed.ro };
  } catch {
    return null;
  }
}
