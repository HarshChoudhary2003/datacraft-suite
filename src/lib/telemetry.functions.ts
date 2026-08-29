// Server functions to persist and query dataset-processing telemetry. Access is
// service-role-only (telemetry_runs is RLS-locked), routed through the admin
// client loaded inside handlers. Records are scoped by anonymous session id.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isRole } from "@/lib/permissions";

export interface StageTimingRow {
  id: string;
  label: string;
  ms: number;
}

export interface TelemetryRun {
  id: string;
  session_id: string;
  role: string;
  dataset_name: string;
  row_count: number;
  col_count: number;
  total_ms: number;
  rows_per_sec: number;
  stages: StageTimingRow[];
  resumed: boolean;
  created_at: string;
}

const StageSchema = z.object({
  id: z.string().max(32),
  label: z.string().max(64),
  ms: z.number().nonnegative(),
});

const RecordSchema = z.object({
  sessionId: z.string().min(1).max(128),
  role: z.string().min(1).max(64),
  datasetName: z.string().min(1).max(256),
  rowCount: z.number().int().nonnegative(),
  colCount: z.number().int().nonnegative(),
  totalMs: z.number().int().nonnegative(),
  rowsPerSec: z.number().int().nonnegative(),
  stages: z.array(StageSchema).max(20),
  resumed: z.boolean().default(false),
});

/** Persist one completed processing run (best-effort). */
export const recordTelemetryRun = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => {
    const res = RecordSchema.safeParse(i);
    return res.success ? res.data : null;
  })
  .handler(async ({ data }) => {
    if (!data) return { ok: false as const };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const role = isRole(data.role) ? data.role : "unknown";
      const { error } = await (
        supabaseAdmin as unknown as {
          from: (t: string) => { insert: (r: unknown) => Promise<{ error: unknown }> };
        }
      )
        .from("telemetry_runs")
        .insert({
          session_id: data.sessionId,
          role,
          dataset_name: data.datasetName,
          row_count: data.rowCount,
          col_count: data.colCount,
          total_ms: data.totalMs,
          rows_per_sec: data.rowsPerSec,
          stages: data.stages,
          resumed: data.resumed,
        });
      if (error) {
        console.error("[telemetry] insert error:", error);
        return { ok: false as const };
      }
      return { ok: true as const };
    } catch (e) {
      console.error("[telemetry] insert failed:", e);
      return { ok: false as const };
    }
  });

const ListSchema = z.object({
  sessionId: z.string().min(1).max(128),
  dataset: z.string().max(256).optional(),
  since: z.string().max(40).optional(),
  until: z.string().max(40).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

/** Read processing-telemetry history for a session with optional filters. */
export const listTelemetryRuns = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => {
    const res = ListSchema.safeParse(i);
    return res.success ? res.data : null;
  })
  .handler(async ({ data }) => {
    if (!data) {
      return { ok: false as const, error: "Invalid parameters", runs: [] as TelemetryRun[] };
    }
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let q = (supabaseAdmin as any)
        .from("telemetry_runs")
        .select("*")
        .eq("session_id", data.sessionId)
        .order("created_at", { ascending: false })
        .limit(data.limit ?? 200);
      if (data.dataset) q = q.ilike("dataset_name", `%${data.dataset}%`);
      if (data.since) q = q.gte("created_at", data.since);
      if (data.until) q = q.lte("created_at", data.until);
      const { data: rows, error } = await q;
      if (error) {
        console.error("[telemetry] list error:", error);
        return {
          ok: false as const,
          error: "Failed to load telemetry",
          runs: [] as TelemetryRun[],
        };
      }
      return { ok: true as const, runs: (rows ?? []) as TelemetryRun[] };
    } catch (e) {
      console.error("[telemetry] list failed:", e);
      return { ok: false as const, error: "Telemetry unavailable", runs: [] as TelemetryRun[] };
    }
  });
