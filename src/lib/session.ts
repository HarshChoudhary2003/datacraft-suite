// Stable, anonymous per-browser session id used to scope server-side audit and
// telemetry records. The app has no user auth, so this random id is the only
// way to group a user's activity/performance history across reloads.
const KEY = "dataiq.session_id";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "sess-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getSessionId(): string {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return "server";
  }
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = uuid();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}
