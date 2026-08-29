import { createFileRoute } from "@tanstack/react-router";

/**
 * Health probe for the Insights pipeline. Returns 200 when the server can
 * construct the insights request path (imports resolve, AI gateway key present).
 * Used by the smoke test to fail the build on any 5xx regression.
 *
 * It does NOT call the AI model (to avoid cost/latency) — it only verifies the
 * server-side module graph loads and required config exists.
 */
export const Route = createFileRoute("/api/public/insights-health")({
  server: {
    handlers: {
      GET: async () => {
        const traceId = `health_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        try {
          // Importing the server fn module verifies the server graph resolves.
          await import("@/lib/ai.functions");
          const hasKey = Boolean(process.env.LOVABLE_API_KEY);
          return new Response(JSON.stringify({ ok: true, aiConfigured: hasKey, traceId }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (error) {
          console.error(`[insights-health] [${traceId}] failed:`, error);
          return new Response(
            JSON.stringify({ ok: false, error: "Insights pipeline unavailable", traceId }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
