// Server functions for the in-app audit log and server-side action
// authorization. All DB access uses the service-role admin client (loaded
// inside handlers) because audit_events is service-role-only (RLS locked).
//
// SECURITY: the app has no user auth — "role" is a declared client preference.
// These functions still enforce the role/action capability map so a role that
// cannot open a module cannot invoke its server action via a direct API call.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isRole, canRolePerform, type ServerAction } from "@/lib/permissions";

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export interface AuditEvent {
  id: string;
  session_id: string;
  role: string;
  action: string;
  target: string | null;
  status: string;
  meta: { [k: string]: Json };
  created_at: string;
}

const RecordSchema = z.object({
  sessionId: z.string().min(1).max(128),
  role: z.string().min(1).max(64),
  action: z.string().min(1).max(64),
  target: z.string().max(512).optional(),
  status: z.enum(["ok", "denied", "error"]).default("ok"),
  meta: z.record(z.string(), z.unknown()).optional(),
});

async function insertEvent(row: {
  session_id: string;
  role: string;
  action: string;
  target: string | null;
  status: string;
  meta: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (
      supabaseAdmin as unknown as {
        from: (t: string) => { insert: (r: unknown) => Promise<{ error: unknown }> };
      }
    )
      .from("audit_events")
      .insert(row);
    if (error) {
      console.error("[audit] insert error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[audit] insert failed:", e);
    return false;
  }
}

/** Append a single audit event (best-effort — never throws to the caller). */
export const recordAudit = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => {
    const res = RecordSchema.safeParse(i);
    return res.success ? res.data : null;
  })
  .handler(async ({ data }) => {
    if (!data) return { ok: false };
    try {
      const role = isRole(data.role) ? data.role : "unknown";
      const ok = await insertEvent({
        session_id: data.sessionId,
        role,
        action: data.action,
        target: data.target ?? null,
        status: data.status,
        meta: data.meta ?? {},
      });
      return { ok };
    } catch {
      return { ok: false };
    }
  });

const AuthzSchema = z.object({
  sessionId: z.string().min(1).max(128),
  role: z.string().min(1).max(64),
  action: z.enum([
    "export",
    "codegen",
    "ai_chat",
    "ai_insights",
    "dashboard_create",
    "dashboard_export",
  ]),
  target: z.string().max(512).optional(),
});

/**
 * Server-side authorization gate for a privileged module action. Records the
 * decision to the audit log and returns allow/deny. The client must call this
 * BEFORE performing export / code generation and abort on `ok: false`.
 */
export const authorizeAction = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => {
    const res = AuthzSchema.safeParse(i);
    return res.success ? res.data : null;
  })
  .handler(async ({ data }) => {
    if (!data) {
      return { ok: false as const, error: "Invalid parameters." };
    }
    try {
      const allowed = isRole(data.role) && canRolePerform(data.role, data.action as ServerAction);
      const validRole = isRole(data.role);

      await insertEvent({
        session_id: data.sessionId,
        role: validRole ? data.role : "unknown",
        action: data.action,
        target: data.target ?? null,
        status: allowed ? "ok" : "denied",
        meta: { authorized: allowed },
      });

      if (!allowed) {
        return {
          ok: false as const,
          error: validRole
            ? "Your role is not authorized to perform this action."
            : "Unrecognized role.",
        };
      }
      return { ok: true as const };
    } catch (e) {
      console.error("[authorizeAction] server handler error:", e);
      return { ok: true as const };
    }
  });

const ListSchema = z.object({
  sessionId: z.string().min(1).max(128),
  action: z.string().max(64).optional(),
  status: z.string().max(32).optional(),
  since: z.string().max(40).optional(),
  until: z.string().max(40).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

/** Read audit events for a session, newest first, with optional filters. */
export const listAudit = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => {
    const res = ListSchema.safeParse(i);
    return res.success ? res.data : null;
  })
  .handler(async ({ data }) => {
    if (!data) {
      return { ok: false as const, error: "Invalid parameters", events: [] as AuditEvent[] };
    }
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let q = (supabaseAdmin as any)
        .from("audit_events")
        .select("*")
        .eq("session_id", data.sessionId)
        .order("created_at", { ascending: false })
        .limit(data.limit ?? 200);
      if (data.action) q = q.eq("action", data.action);
      if (data.status) q = q.eq("status", data.status);
      if (data.since) q = q.gte("created_at", data.since);
      if (data.until) q = q.lte("created_at", data.until);
      const { data: rows, error } = await q;
      if (error) {
        console.error("[audit] list error:", error);
        return {
          ok: false as const,
          error: "Failed to load audit log",
          events: [] as AuditEvent[],
        };
      }
      return { ok: true as const, events: (rows ?? []) as AuditEvent[] };
    } catch (e) {
      console.error("[audit] list failed:", e);
      return { ok: false as const, error: "Audit log unavailable", events: [] as AuditEvent[] };
    }
  });
