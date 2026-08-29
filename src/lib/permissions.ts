// Canonical, isomorphic authorization map used by BOTH the client experience
// and the server-side guards. Keeping this pure (no React imports) lets server
// functions import it safely to enforce role permissions on direct API calls —
// so a Business Analyst or Data Engineer cannot bypass the UI and hit a
// server action their role is not allowed to perform.
import { ROLE_PRESETS } from "@/lib/role-presets";
import type { Role } from "@/store/dataset-context";

export const ALL_ROLES: Role[] = [
  "data_analyst",
  "data_scientist",
  "ml_engineer",
  "ai_engineer",
  "business_analyst",
  "data_engineer",
];

/** Routes every role can always reach (upload, overview, guide, legal pages). */
export const ALWAYS_ALLOWED = new Set<string>([
  "/",
  "/overview",
  "/guide",
  "/cookies",
  "/privacy",
  "/terms",
  "/audit",
  "/charts",
]);

/** Server-enforceable actions exposed via server functions / APIs. */
export type ServerAction =
  | "ai_chat"
  | "ai_insights"
  | "export"
  | "codegen"
  | "dashboard_create"
  | "dashboard_export";

/**
 * Actions whose authorization mirrors route access (a role may perform them iff
 * it may open the corresponding module). Keeps server enforcement in lockstep
 * with the role capability map in role-presets.
 */
const ACTION_ROUTE: Partial<Record<ServerAction, string>> = {
  export: "/export",
  codegen: "/codegen",
  dashboard_create: "/charts",
  dashboard_export: "/charts",
};

/** Every role may use the AI copilot; the guard still rejects unknown roles. */
const ROLE_SERVER_ACTIONS: Record<Role, ServerAction[]> = {
  data_analyst: ["ai_chat", "ai_insights"],
  data_scientist: ["ai_chat", "ai_insights"],
  ml_engineer: ["ai_chat", "ai_insights"],
  ai_engineer: ["ai_chat", "ai_insights"],
  business_analyst: ["ai_chat", "ai_insights"],
  data_engineer: ["ai_chat", "ai_insights"],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ALL_ROLES as string[]).includes(value);
}

function normalize(path: string): string {
  return path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** The full set of routes a role may open (capabilities + always-allowed). */
export function allowedRoutes(role: Role): Set<string> {
  const caps = ROLE_PRESETS[role].capabilities.map((c) => c.to);
  return new Set<string>([...ALWAYS_ALLOWED, ...caps]);
}

/** True when the role is permitted to open the given route. */
export function canRoleAccess(role: Role, path: string): boolean {
  const p = normalize(path);
  if (ALWAYS_ALLOWED.has(p)) return true;
  return allowedRoutes(role).has(p);
}

/** True when the role may invoke the given server action. */
export function canRolePerform(role: Role, action: ServerAction): boolean {
  const route = ACTION_ROUTE[action];
  if (route) return canRoleAccess(role, route);
  return ROLE_SERVER_ACTIONS[role]?.includes(action) ?? false;
}
