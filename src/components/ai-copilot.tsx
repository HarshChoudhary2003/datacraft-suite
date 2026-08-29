import { useState, useRef, useEffect } from "react";
import { useDataset, ROLES } from "@/store/dataset-context";
import { useServerFn } from "@tanstack/react-start";
import { aiAnalyze } from "@/lib/ai.functions";
import { summarizeDatasetForAI } from "@/lib/summarize";
import {
  Send,
  Loader2,
  MessageSquare,
  Download,
  User,
  Sparkles,
  X,
  FileText,
  Search,
  BarChart3,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/ui/markdown";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function AICopilot({ onClose }: { onClose: () => void }) {
  const { dataset, role, processRows } = useDataset();
  const [tab, setTab] = useState<"chat" | "insights">("chat");

  if (!dataset) {
    return (
      <div className="flex flex-col h-full bg-background/95 backdrop-blur">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <div className="font-bold flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> AI Copilot
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted/50 rounded-lg">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-muted-foreground">
          <MessageSquare className="size-8 opacity-20 mb-3" />
          <p className="text-sm">Please upload a dataset first to use the AI Copilot.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background/95 backdrop-blur">
      <div className="p-4 border-b border-border/50 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="font-bold flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> AI Copilot
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted/50 rounded-lg">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex bg-muted/30 p-1 rounded-lg">
          <button
            onClick={() => setTab("chat")}
            className={`flex-1 text-xs py-1.5 font-semibold rounded-md transition-colors ${tab === "chat" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            Chat
          </button>
          <button
            onClick={() => setTab("insights")}
            className={`flex-1 text-xs py-1.5 font-semibold rounded-md transition-colors ${tab === "insights" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            Insights
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {tab === "chat" ? <CopilotChat /> : <CopilotInsights />}
      </div>
    </div>
  );
}

function fallbackDataQuery(ds: any, query: string): string {
  const q = query.toLowerCase();
  if (q.includes("missing") || q.includes("null") || q.includes("na")) {
    const missingCols = ds.profiles.filter((p: any) => p.missing > 0);
    if (missingCols.length === 0) return `### Data Quality Report\nNo missing values found across all **${ds.colCount}** columns.`;
    const details = missingCols.map((p: any) => `- **${p.name}**: ${p.missing.toLocaleString()} missing (${p.missingPct.toFixed(1)}%)`).join("\n");
    return `### Missing Values Summary\nTotal Missing Cells: **${ds.missingTotal.toLocaleString()}**\n\n${details}`;
  }
  if (q.includes("row") || q.includes("count") || q.includes("size")) {
    return `### Dataset Dimensions\n- **Total Rows:** ${ds.rowCount.toLocaleString()}\n- **Total Columns:** ${ds.colCount}\n- **Sampled Mode:** ${ds.isSampled ? "Yes (Big Data Mode)" : "No (Full In-Memory)"}`;
  }
  if (q.includes("correlat") || q.includes("relat")) {
    const numCols = ds.profiles.filter((p: any) => p.type === "numeric");
    if (numCols.length < 2) return "Insufficient numeric columns to compute correlations.";
    return `### Correlation Insights\nComputed Pearson correlation matrix across **${numCols.length}** numeric columns. Open the **Charts & Correlations** tab for interactive visual heatmaps.`;
  }
  if (q.includes("quality") || q.includes("score") || q.includes("readiness")) {
    const penList = ds.readinessBreakdown?.map((b: any) => `- ${b.reason} (-${b.penalty} pts)`).join("\n") || "No penalties applied.";
    return `### Data Readiness Score: **${ds.readinessScore}/100**\n\n**Penalties Applied:**\n${penList}`;
  }
  return `### Executive Analysis for ${ds.name}\n- **Rows:** ${ds.rowCount.toLocaleString()}\n- **Columns:** ${ds.colCount}\n- **ML Readiness:** ${ds.readinessScore}/100\n- **Duplicate Rows:** ${ds.duplicateRows.toLocaleString()}`;
}

function CopilotChat() {
  const { dataset, role, processRows } = useDataset();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const analyze = useServerFn(aiAnalyze);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading || !dataset) return;
    const q = input.trim();
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await analyze({
        data: {
          role,
          task: "chat",
          datasetSummary: summarizeDatasetForAI(dataset),
          question: q,
          history: messages,
        },
      });
      if (!res.ok) {
        const localAnswer = fallbackDataQuery(dataset, q);
        setMessages((m) => [...m, { role: "assistant", content: localAnswer }]);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: res.content }]);
    } catch (e) {
      const localAnswer = fallbackDataQuery(dataset, q);
      setMessages((m) => [...m, { role: "assistant", content: localAnswer }]);
    } finally {
      setLoading(false);
    }
  };

  const roleSuggestions: Record<string, string[]> = {
    data_analyst: ["What are the key trends here?", "Summarize for a dashboard."],
    business_analyst: ["What is the business impact?", "Identify growth opportunities."],
    data_scientist: ["What are the strongest predictors?", "Suggest features to engineer."],
    ml_engineer: ["Any features causing training skew?", "Identify potential outliers."],
    ai_engineer: ["How to chunk this for RAG?", "What is the best prompt structure?"],
    data_engineer: ["How to partition this?", "Identify data quality issues."],
  };
  const suggestions = roleSuggestions[role] || roleSuggestions.data_analyst;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-6 space-y-3">
            <div className="size-10 rounded-full gradient-bg grid place-items-center text-white mx-auto shadow-md glow-primary">
              <Sparkles className="size-5" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Ask AI about {dataset?.name}</h3>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-left neo-sm p-3 text-xs border border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all group rounded-xl"
                >
                  <span className="text-muted-foreground group-hover:text-foreground font-medium flex items-center justify-between">
                    {s}
                    <Sparkles className="size-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-3 p-3 rounded-xl transition-colors ${
              m.role === "assistant"
                ? "bg-muted/30 border border-border/50 neo-sm"
                : "bg-primary/5 border border-primary/20"
            }`}
          >
            <div
              className={`size-7 shrink-0 rounded-lg flex items-center justify-center mt-0.5 text-xs font-bold ${
                m.role === "user"
                  ? "gradient-bg text-white shadow-sm"
                  : "bg-primary/10 text-primary border border-primary/30"
              }`}
            >
              {m.role === "user" ? (
                <User className="size-3.5" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                {m.role === "user" ? "You" : "AI Assistant"}
              </div>
              <div
                className={`text-xs ${
                  m.role === "user"
                    ? "text-foreground font-medium whitespace-pre-wrap leading-relaxed"
                    : "prose prose-sm dark:prose-invert max-w-none [&_p]:text-xs [&_li]:text-xs"
                }`}
              >
                {m.role === "user" ? m.content : <Markdown text={m.content} />}
              </div>
              {m.role === "assistant" && dataset && (
                <div className="mt-3 pt-2 border-t border-border/40 flex flex-wrap gap-2">
                  {dataset.duplicateRows > 0 && (
                    <button
                      onClick={async () => {
                        try {
                          const cleaned = dataset.rows.filter(
                            (_, idx) => !dataset.duplicateIndices.includes(idx),
                          );
                          await processRows(dataset.name, cleaned);
                          toast.success(
                            `Successfully removed ${dataset.duplicateRows} duplicate rows!`,
                          );
                        } catch {
                          toast.error("Failed to remove duplicate rows.");
                        }
                      }}
                      className="neo-btn px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 flex items-center gap-1 border-primary/20"
                    >
                      <Sparkles className="size-3" /> Remove {dataset.duplicateRows} Duplicates
                    </button>
                  )}
                  {dataset.missingTotal > 0 && (
                    <button
                      onClick={async () => {
                        try {
                          const fillMap: Record<string, any> = {};
                          dataset.profiles.forEach((p) => {
                            if (p.missing > 0) {
                              fillMap[p.name] = {
                                strategy: "median",
                                replacementValue: p.median ?? (p.topValues?.[0]?.value ?? 0),
                              };
                            }
                          });
                          const cleaned = dataset.rows.map((row) => {
                            const newRow = { ...row };
                            dataset.profiles.forEach((p) => {
                              if (
                                p.missing > 0 &&
                                (newRow[p.name] === null ||
                                  newRow[p.name] === undefined ||
                                  newRow[p.name] === "")
                              ) {
                                newRow[p.name] = p.median ?? (p.topValues?.[0]?.value ?? 0);
                              }
                            });
                            return newRow;
                          });
                          await processRows(dataset.name, cleaned);
                          toast.success("Successfully imputed missing values with median!");
                        } catch {
                          toast.error("Failed to impute missing values.");
                        }
                      }}
                      className="neo-btn px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10 flex items-center gap-1 border-accent/20"
                    >
                      <Sparkles className="size-3" /> Auto-Fill {dataset.missingTotal} Missing
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3 p-3 rounded-xl bg-muted/30 border border-border/50 neo-sm animate-pulse">
            <div className="size-7 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5 border border-primary/30">
              <Sparkles className="size-3.5 text-primary" />
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <div className="size-2 bg-primary rounded-full animate-bounce" />
              <div className="size-2 bg-primary/70 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="size-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-3 bg-background border-t border-border/50">
        <div className="neo-inset flex items-center p-1.5 rounded-xl bg-muted/20 border border-border/40 focus-within:border-primary/50 transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Ask AI anything about this dataset..."
            className="flex-1 bg-transparent px-3 py-1.5 outline-none text-xs text-foreground placeholder:text-muted-foreground"
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="p-2 bg-primary text-primary-foreground disabled:opacity-40 rounded-lg shadow-sm hover:scale-105 transition-transform"
          >
            <Send className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CopilotInsights() {
  const { dataset, role } = useDataset();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState<"general" | "quality" | "features" | "business">("general");
  const analyze = useServerFn(aiAnalyze);

  const FOCUS_MODES = [
    { id: "general", label: "Overview", icon: FileText },
    { id: "quality", label: "Quality Audit", icon: Search },
    { id: "features", label: "Features", icon: BarChart3 },
    { id: "business", label: "Business", icon: TrendingUp },
  ] as const;

  const run = async () => {
    if (!dataset) return;
    setLoading(true);
    setContent("");
    try {
      const res = await analyze({
        data: { role, task: "insights", focus, datasetSummary: summarizeDatasetForAI(dataset) },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setContent(res.content);
    } catch (e) {
      toast.error("Failed to generate insights");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border/50 flex flex-wrap gap-1.5">
        {FOCUS_MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setFocus(mode.id)}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-full flex items-center gap-1.5 transition-colors ${
              focus === mode.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            <mode.icon className="size-3" /> {mode.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {!content && !loading && (
          <div className="text-center mt-6">
            <button
              onClick={run}
              className="neo-btn px-4 py-2 text-xs font-semibold text-primary flex items-center gap-2 mx-auto"
            >
              <Sparkles className="size-4" /> Generate Insights
            </button>
          </div>
        )}
        {loading && (
          <div className="flex flex-col items-center justify-center h-32 space-y-3">
            <Loader2 className="size-6 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground animate-pulse">Analyzing...</p>
          </div>
        )}
        {content && !loading && (
          <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:text-xs [&_li]:text-xs [&_h3]:text-sm [&_h2]:text-sm">
            <Markdown text={content} />
          </div>
        )}
      </div>
    </div>
  );
}
