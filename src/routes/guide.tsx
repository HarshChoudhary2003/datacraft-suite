import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  Upload,
  ShieldCheck,
  BarChart3,
  PieChart,
  Settings2,
  BrainCircuit,
  Code2,
  FileDown,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { useDataset, ROLES } from "@/store/dataset-context";
import { presetFor } from "@/lib/role-presets";

export const Route = createFileRoute("/guide")({
  head: () => ({ meta: [{ title: "How to Use — DataIQ Pro" }] }),
  component: GuidePage,
});

const steps = [
  {
    title: "1. Upload Your Data",
    icon: Upload,
    description:
      "Start by dropping a CSV file on the Home tab. The system will parse it automatically, detect data types, and run immediate statistical checks in the background.",
  },
  {
    title: "2. Data Preparation",
    icon: ShieldCheck,
    description:
      "Navigate to Data Prep to handle missing values, duplicates, and incorrect types. Use automatic cleaning routines to quickly repair your dataset so it's ready for modeling.",
  },
  {
    title: "3. Deep Analysis",
    icon: BarChart3,
    description:
      "Use Deep Analysis to explore summary statistics, identify outliers, and check correlation matrices. This helps you understand the underlying patterns in your dataset.",
  },
  {
    title: "4. Visualization",
    icon: PieChart,
    description:
      "Create custom charts (Bar, Line, Scatter, Pie) in the Visualization tab to easily present your findings and spot trends visually.",
  },
  {
    title: "5. Feature Engineering",
    icon: Settings2,
    description:
      "Prepare your data for machine learning by encoding categorical variables (e.g., Label Encoding, One-Hot Encoding) and scaling numerical variables in the Feature Eng tab.",
  },
  {
    title: "6. AutoML Builder",
    icon: BrainCircuit,
    description:
      "Select your target variable in the AutoML tab to automatically train and compare multiple machine learning algorithms. Evaluate performance using the Leaderboard.",
  },
  {
    title: "7. Code Generation",
    icon: Code2,
    description:
      "Head to Code Gen to instantly convert your dataset's schema and statistics into boilerplate code for Python, SQL, or Node.js to use in external projects.",
  },
  {
    title: "8. Export Reports",
    icon: FileDown,
    description:
      "Generate and download a comprehensive, boardroom-ready PDF report or a full Excel workbook encompassing all your statistics, charts, and machine learning results.",
  },
];

function GuidePage() {
  const { role } = useDataset();
  const preset = presetFor(role);
  const roleMeta = ROLES.find((r) => r.id === role);
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold gradient-text flex items-center gap-3">
          <BookOpen className="size-8 text-primary" /> How to Use DataIQ Pro
        </h1>
        <p className="text-muted-foreground">
          Follow this step-by-step workflow to get the most out of your data analysis journey.
        </p>
      </div>

      {/* Role-tailored recommended path */}
      <div className="neo p-6 bg-gradient-to-br from-primary/10 to-transparent border-l-4 border-primary space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" /> Recommended for {roleMeta?.emoji}{" "}
            {roleMeta?.label}
          </div>
          <h2 className="text-lg font-bold mt-1">{preset.mission}</h2>
        </div>
        <ol className="grid sm:grid-cols-2 gap-2">
          {preset.workflow.map((step, i) => (
            <li key={i}>
              <Link
                to={step.to}
                className="group neo-sm p-3 flex items-start gap-3 hover:bg-primary/5 transition-colors h-full"
              >
                <span className="shrink-0 size-6 rounded-full grid place-items-center text-xs font-bold gradient-bg text-white">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    {step.label}
                    <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{step.detail}</div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          Switch your role in the sidebar to see a different recommended path.
        </p>
      </div>

      <div className="grid gap-6">
        {steps.map((step, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="neo p-6 bg-background flex gap-4 items-start hover:bg-primary/5 transition-colors"
          >
            <div className="neo p-3 bg-primary/10 rounded-xl shrink-0 text-primary">
              <step.icon className="size-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold mb-1">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="neo p-8 bg-primary/10 mt-12 text-center space-y-4">
        <h3 className="text-xl font-bold text-primary">Need more help?</h3>
        <p className="text-muted-foreground">
          You can always use the <strong className="text-foreground">AI Copilot</strong> located at
          the bottom right of your screen. It can analyze your data structure, answer complex
          questions, and guide you directly to the tools you need.
        </p>
      </div>
    </div>
  );
}
