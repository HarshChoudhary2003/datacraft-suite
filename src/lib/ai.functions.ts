import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isRole, canRolePerform } from "@/lib/permissions";

const InsightSchema = z.object({
  role: z.string().min(1).max(64),
  task: z.enum(["insights", "chat"]),
  datasetSummary: z.string().min(1).max(20000),
  focus: z.string().optional(),
  question: z.string().max(2000).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .optional(),
});

const ROLE_SYSTEM: Record<string, string> = {
  data_analyst:
    "You are an expert Data Analyst. Focus on KPIs, trends, segmentation, and dashboard-ready findings. Cite real numbers from the dataset summary.",
  business_analyst:
    "You are a Business Analyst. Translate data into business impact, ROI, opportunities, and prioritized recommendations for stakeholders.",
  data_scientist:
    "You are a senior Data Scientist. Focus on hypotheses, statistical significance, feature engineering, model selection, and validation strategies.",
  ml_engineer:
    "You are an ML Engineer. Focus on production pipelines, feature stores, training/serving skew, monitoring, leakage, and reproducibility.",
  ai_engineer:
    "You are an AI Engineer building LLM apps. Focus on schema for retrieval, embeddings, chunking, NL-to-SQL safety, and grounding.",
  data_engineer:
    "You are a Data Engineer. Focus on schema design, partitioning, data quality SLAs, lineage, ingestion patterns, and warehouse-ready transforms.",
};

export const aiAnalyze = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const res = InsightSchema.safeParse(input);
    return res.success ? res.data : null;
  })
  .handler(async ({ data }) => {
    const traceId = `ins_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    if (!data) {
      return { ok: false as const, error: "Invalid parameters.", traceId };
    }
    try {

      // Server-side authorization: never trust the client's route guards. Reject
      // unknown roles and any role not permitted to invoke this action, so a
      // direct API call cannot bypass the UI's role experience.
      if (!isRole(data.role)) {
        console.error(`[insights] [${traceId}] forbidden: unknown role "${data.role}"`);
        return { ok: false as const, error: "Forbidden: unrecognized role.", traceId };
      }
      const action = data.task === "insights" ? "ai_insights" : "ai_chat";
      if (!canRolePerform(data.role, action)) {
        console.error(
          `[insights] [${traceId}] forbidden: role "${data.role}" cannot perform "${action}"`,
        );
        return {
          ok: false as const,
          error: "Forbidden: your role is not authorized for this action.",
          traceId,
        };
      }

      const apiKey = process.env.OPENAI_API_KEY || process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        console.error(`[insights] [${traceId}] AI not configured: OPENAI_API_KEY missing`);
        return {
          ok: false as const,
          error: "AI is not configured. Add OPENAI_API_KEY to your .env file.",
          traceId,
        };
      }
      const system = ROLE_SYSTEM[data.role] ?? ROLE_SYSTEM.data_analyst;

      let focusInstruction =
        "produce 5 concrete, role-specific insights. Each insight: a short title, the finding (cite numbers), and a recommended action.";
      if (data.focus === "quality")
        focusInstruction =
          "perform a harsh Data Quality Audit. Focus specifically on missing values, extreme outliers, high cardinality, skewness, and duplicates. Suggest concrete cleaning steps.";
      if (data.focus === "features")
        focusInstruction =
          "brainstorm 5 creative Feature Engineering ideas. Look at the existing columns and suggest mathematical transformations, binning strategies, interaction terms, or aggregations to improve ML models.";
      if (data.focus === "business")
        focusInstruction =
          "translate the raw numbers into Business Opportunities. Identify potential ROI, cost savings, risk factors, and KPIs that executives should care about.";

      const userPrompt =
        data.task === "insights"
          ? `Analyze this dataset profile and ${focusInstruction}\n\nDATASET:\n${data.datasetSummary}\n\nReply in markdown with ## headings per insight.`
          : `User question: ${data.question}\n\nAnswer using ONLY the dataset profile below. Cite specific numbers when possible. Be concise.\n\nDATASET:\n${data.datasetSummary}`;

      // Use standard OpenAI API URL (or Lovable fallback if using their key)
      const endpoint =
        process.env.OPENAI_API_URL ||
        (process.env.LOVABLE_API_KEY
          ? "https://ai.gateway.lovable.dev/v1/chat/completions"
          : "https://api.openai.com/v1/chat/completions");
      const model =
        process.env.OPENAI_MODEL ||
        (process.env.LOVABLE_API_KEY ? "google/gemini-3-flash-preview" : "gpt-4o-mini");

      const apiMessages = [
        { role: "system", content: system },
        ...(data.history || []),
        { role: "user", content: userPrompt },
      ];

      // Execute AI API call with 15-second timeout and exponential backoff retry for transient errors
      let res: Response | null = null;
      let lastError: unknown = null;
      const maxRetries = 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          res = await fetch(endpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: model,
              messages: apiMessages,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (res.status === 429) {
            console.error(`[insights] [${traceId}] rate limited (429)`);
            return {
              ok: false as const,
              error: "Rate limit exceeded. Try again in a moment.",
              traceId,
            };
          }

          if (res.status === 401 || res.status === 402) {
            console.error(`[insights] [${traceId}] auth/credits error (${res.status})`);
            return {
              ok: false as const,
              error: "AI Authentication failed or credits exhausted. Check your API key.",
              traceId,
            };
          }

          // Retry on 5xx server errors
          if (res.status >= 500 && attempt < maxRetries) {
            console.warn(
              `[insights] [${traceId}] transient server error ${res.status}, retrying attempt ${attempt + 1}...`,
            );
            await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
            continue;
          }

          break;
        } catch (err: unknown) {
          clearTimeout(timeoutId);
          lastError = err;
          if (attempt < maxRetries) {
            const delay = 500 * Math.pow(2, attempt);
            console.warn(
              `[insights] [${traceId}] fetch attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
              err,
            );
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      if (!res) {
        const isAbort = (lastError as { name?: string })?.name === "AbortError";
        console.error(`[insights] [${traceId}] fetch failed after retries:`, lastError);
        return {
          ok: false as const,
          error: isAbort
            ? "AI request timed out after 15s. Please retry."
            : "AI service unreachable.",
          traceId,
        };
      }

      if (!res.ok) {
        const t = await res.text();
        console.error(`[insights] [${traceId}] AI service error ${res.status}: ${t.slice(0, 500)}`);
        return { ok: false as const, error: `AI service error (${res.status})`, traceId };
      }
      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content ?? "";
      return { ok: true as const, content, traceId };
    } catch (e) {
      console.error("[insights] AI call exception:", e);
      return {
        ok: false as const,
        error: "AI service is currently unavailable",
        traceId: `ins_err_${Date.now()}`,
      };
    }
  });
