export const ANALYSIS_REPORT_EXPORT_LABELS = ["HTML report", "PDF report"] as const;

export interface WeeklyReportExportPoint {
  weekStart: string;
  label: string;
  count: number;
  current: boolean;
}

type WeeklyCounts = Record<string, number>;

const STORAGE_KEY = "dataiq.weekly-report-exports.v1";
const CHANGE_EVENT = "dataiq:weekly-report-exports-change";

export function isAnalysisReportExport(label: string): boolean {
  return ANALYSIS_REPORT_EXPORT_LABELS.some((reportLabel) => reportLabel === label);
}

function weekStartDate(timestamp: number): Date {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readCounts(): WeeklyCounts {
  if (typeof window === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          /^\d{4}-\d{2}-\d{2}$/.test(entry[0]) &&
          typeof entry[1] === "number" &&
          Number.isSafeInteger(entry[1]) &&
          entry[1] >= 0,
      ),
    );
  } catch {
    return {};
  }
}

/** Record only a completed HTML/PDF analysis report, independently of job cleanup. */
export function recordSuccessfulReportExport(label: string, completedAt = Date.now()): boolean {
  if (!isAnalysisReportExport(label) || typeof window === "undefined") return false;
  const counts = readCounts();
  const key = dateKey(weekStartDate(completedAt));
  counts[key] = (counts[key] ?? 0) + 1;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function buildWeeklyReportExportTrend(
  counts: WeeklyCounts,
  now = Date.now(),
  numberOfWeeks = 8,
): WeeklyReportExportPoint[] {
  const weeks = Math.max(1, Math.floor(numberOfWeeks));
  const currentWeek = weekStartDate(now);
  const firstWeek = new Date(currentWeek);
  firstWeek.setDate(firstWeek.getDate() - (weeks - 1) * 7);

  return Array.from({ length: weeks }, (_, index) => {
    const week = new Date(firstWeek);
    week.setDate(firstWeek.getDate() + index * 7);
    const key = dateKey(week);
    return {
      weekStart: key,
      label: week.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: Number.isSafeInteger(counts[key]) && counts[key] > 0 ? counts[key] : 0,
      current: index === weeks - 1,
    };
  });
}

export function getWeeklyReportExportTrend(now = Date.now()): WeeklyReportExportPoint[] {
  return buildWeeklyReportExportTrend(readCounts(), now);
}

export function subscribeWeeklyReportExports(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}