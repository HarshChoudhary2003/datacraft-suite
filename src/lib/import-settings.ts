/**
 * Validation for imported export-settings JSON files.
 * Produces a detailed, field-by-field report so users can see exactly
 * which fields are unsupported or invalid before a job is created.
 */

export const KNOWN_EXPORT_TYPES = [
  "HTML report",
  "PDF report",
  "Jupyter notebook",
  "Interactive HTML notebook",
  "Excel workbook",
] as const;

export type KnownExportType = (typeof KNOWN_EXPORT_TYPES)[number];

/** Settings keys the exporter understands. Anything else is reported as unsupported. */
const SUPPORTED_SETTING_KEYS = new Set([
  "sections",
  "title",
  "note",
  "fingerprint",
  "dataset",
  "role",
  "capturedAt",
  "rowCount",
  "colCount",
  "columns",
]);

/** Top-level keys the exporter understands. */
const SUPPORTED_TOP_KEYS = new Set(["exportType", "settings", "status", "createdAt", "finishedAt", "hasSnapshot", "label"]);

export interface ImportValidation {
  /** True when a job can be created (possibly after user edits in the review step). */
  canCreate: boolean;
  /** Hard problems that block creation until fixed in the review step. */
  errors: string[];
  /** Soft problems — the job can still be created. */
  warnings: string[];
  /** Fields present in the file that this app does not understand (ignored). */
  unsupported: string[];
  exportType: string;
  exportTypeValid: boolean;
  /** Section ids from the file that are valid. */
  validSections: string[];
  /** Section ids from the file that are not recognized. */
  invalidSections: string[];
  title: string | null;
  note: string | null;
  fingerprint: string | null;
  datasetName: string | null;
  /** True when the file carries report sections (PDF/HTML only). */
  isReport: boolean;
}

export function validateImportedSettings(parsed: unknown): ImportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unsupported: string[] = [];

  const result: ImportValidation = {
    canCreate: false,
    errors,
    warnings,
    unsupported,
    exportType: "",
    exportTypeValid: false,
    validSections: [],
    invalidSections: [],
    title: null,
    note: null,
    fingerprint: null,
    datasetName: null,
    isReport: false,
  };

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push("The file must contain a JSON object (for example one downloaded with “Download settings (JSON)”).");
    return result;
  }
  const top = parsed as Record<string, unknown>;

  for (const k of Object.keys(top)) {
    if (!SUPPORTED_TOP_KEYS.has(k)) unsupported.push(`top-level field "${k}"`);
  }

  // exportType
  const rawType = top.exportType;
  if (rawType == null) {
    errors.push('Missing "exportType" — expected one of: ' + KNOWN_EXPORT_TYPES.join(", ") + ".");
  } else if (typeof rawType !== "string") {
    errors.push(`"exportType" must be text, got ${Array.isArray(rawType) ? "a list" : typeof rawType}.`);
  } else if (!(KNOWN_EXPORT_TYPES as readonly string[]).includes(rawType)) {
    errors.push(
      `Unsupported export type "${rawType}". Supported types: ${KNOWN_EXPORT_TYPES.join(", ")}.`,
    );
  } else {
    result.exportType = rawType;
    result.exportTypeValid = true;
  }
  result.isReport = result.exportType === "HTML report" || result.exportType === "PDF report";

  // settings object
  const st = top.settings;
  if (st == null) {
    errors.push('Missing "settings" object with the saved export options.');
    return result;
  }
  if (typeof st !== "object" || Array.isArray(st)) {
    errors.push('"settings" must be an object.');
    return result;
  }
  const settings = st as Record<string, unknown>;

  for (const k of Object.keys(settings)) {
    if (!SUPPORTED_SETTING_KEYS.has(k)) unsupported.push(`settings field "${k}"`);
  }

  // sections
  if ("sections" in settings) {
    if (!Array.isArray(settings.sections)) {
      errors.push('"sections" must be a list of section ids.');
    } else {
      for (const raw of settings.sections as unknown[]) {
        const id = String(raw);
        if (validSectionIds.has(id)) result.validSections.push(id);
        else result.invalidSections.push(id);
      }
      if (result.invalidSections.length)
        warnings.push(
          `Unknown section${result.invalidSections.length > 1 ? "s" : ""} ignored: ${result.invalidSections.join(", ")}.`,
        );
      if (result.isReport && result.validSections.length === 0)
        errors.push("A report export needs at least one valid section — select sections in the review step.");
    }
  } else if (result.isReport) {
    warnings.push('No "sections" list found — the sections you pick in the review step will be used.');
  }

  // title / note
  if ("title" in settings) {
    if (typeof settings.title === "string") result.title = settings.title;
    else warnings.push('"title" must be text — it was ignored.');
  }
  if ("note" in settings) {
    if (typeof settings.note === "string") result.note = settings.note;
    else warnings.push('"note" must be text — it was ignored.');
  }

  // informational fields
  if (typeof settings.fingerprint === "string") result.fingerprint = settings.fingerprint;
  else if ("fingerprint" in settings) warnings.push('"fingerprint" must be text — it was ignored.');
  if (typeof settings.dataset === "string") result.datasetName = settings.dataset;
  if ("capturedAt" in settings && typeof settings.capturedAt !== "number")
    warnings.push('"capturedAt" should be a timestamp — it was ignored.');

  result.canCreate = errors.length === 0;
  return result;
}

const validSectionIds = new Set([
  "overview",
  "readiness",
  "stats",
  "shape",
  "categorical",
  "correlation",
  "outliers",
  "missing",
  "recommendations",
  "methodology",
]);
