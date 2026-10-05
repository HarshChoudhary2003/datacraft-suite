// Per-export-type choice of which alerts show as pop-ups. Notifications are
// always kept in the bell list; these settings only control pop-ups.

export const EXPORT_TYPES = [
  "PDF report",
  "HTML report",
  "Interactive HTML notebook",
  "Jupyter notebook",
  "Excel workbook",
] as const;

export interface PopupPref {
  success: boolean;
  failure: boolean;
}
export type NotificationPrefs = Record<string, PopupPref>;

const KEY = "export-notification-prefs-v1";
const DEFAULT: PopupPref = { success: true, failure: true };
const EMPTY: NotificationPrefs = {};

let prefs: NotificationPrefs = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof localStorage === "undefined") return;
  loaded = true;
  try {
    prefs = JSON.parse(localStorage.getItem(KEY) || "{}") ?? {};
  } catch {
    prefs = {};
  }
}

export function subscribeNotificationPrefs(l: () => void) {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}
export function getNotificationPrefs(): NotificationPrefs {
  load();
  return prefs;
}
export const getServerNotificationPrefs = () => EMPTY;

export function popupPref(label: string): PopupPref {
  return { ...DEFAULT, ...getNotificationPrefs()[label] };
}

export function setPopupPref(label: string, kind: keyof PopupPref, value: boolean) {
  prefs = { ...getNotificationPrefs(), [label]: { ...popupPref(label), [kind]: value } };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* best-effort */
  }
  listeners.forEach((l) => l());
}
