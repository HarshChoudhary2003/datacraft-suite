import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ListFilter, ShieldCheck, Wand2 } from "lucide-react";
import { RawDataPage } from "@/components/prep/raw-data";
import { ValidationPage } from "@/components/prep/validation";
import { CleanPage } from "@/components/prep/clean";

export const Route = createFileRoute("/prep")({
  head: () => ({ meta: [{ title: "Data Preparation — DataIQ Pro" }] }),
  component: PrepPage,
});

function PrepPage() {
  const [tab, setTab] = useState<"raw" | "validate" | "clean">("raw");

  const tabs = [
    { id: "raw", label: "Raw Data", icon: ListFilter },
    { id: "validate", label: "Validation", icon: ShieldCheck },
    { id: "clean", label: "Clean & Fix", icon: Wand2 },
  ] as const;

  return (
    <div className="flex flex-col gap-6 h-full min-h-[calc(100vh-6rem)]">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Data Preparation</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Inspect, validate, and clean your dataset.
          </p>
        </div>

        <div className="neo p-1 flex gap-1 rounded-xl shrink-0 overflow-x-auto max-w-full">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as "raw" | "validate" | "clean")}
                className={`relative px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="prep-tab-active"
                    className="absolute inset-0 neo-inset rounded-lg -z-10"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <t.icon className="size-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {tab === "raw" && <RawDataPage />}
            {tab === "validate" && <ValidationPage />}
            {tab === "clean" && <CleanPage />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
