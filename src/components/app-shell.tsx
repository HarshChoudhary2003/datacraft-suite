import { Link, useRouterState } from "@tanstack/react-router";
import {
  Upload,
  BarChart3,
  Code2,
  FileDown,
  BookOpen,
  Database,
  Menu,
  X,
  ShieldCheck,
  History,
  PieChart,
  Settings2,
  BrainCircuit,
  HelpCircle,
  ChevronDown,
  Sparkles,
  Undo2,
  Redo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDataset, ROLES, type Role } from "@/store/dataset-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProcessingBreakdown } from "@/components/processing-breakdown";
import { AICopilot } from "@/components/ai-copilot";

import { CommandPalette } from "@/components/command-palette";
import { Search, WifiOff } from "lucide-react";

const NAV = [
  { to: "/", icon: Upload, label: "Upload" },
  { to: "/overview", icon: Database, label: "Overview" },
  { to: "/prep", icon: ShieldCheck, label: "Data Prep" },
  { to: "/analysis", icon: BarChart3, label: "Deep Analysis" },
  { to: "/charts", icon: PieChart, label: "Visualization" },
  { to: "/transform", icon: Settings2, label: "Feature Eng" },
  { to: "/train", icon: BrainCircuit, label: "AutoML" },
  { to: "/codegen", icon: Code2, label: "Code Gen" },
  { to: "/export", icon: FileDown, label: "Export Reports" },
  { to: "/guide", icon: BookOpen, label: "How to Use" },
  { to: "/audit", icon: History, label: "Audit & Telemetry" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const {
    role,
    setRole,
    dataset,
    processing,
    progress,
    resuming,
    undo,
    redo,
    canUndo,
    canRedo,
    historyIndex,
    history,
  } = useDataset();
  const [open, setOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const drawerRef = useRef<HTMLElement>(null);
  const openBtnRef = useRef<HTMLButtonElement>(null);

  // Online / Offline network status listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Global Ctrl+K, Ctrl+Z, Ctrl+Y keydown listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        // Prevent default undo if not in standard input/textarea
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          if (canUndo) undo();
        }
      }
      if (
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          if (canRedo) redo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  // Close drawer on Escape, focus drawer when opened, restore focus on close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    drawerRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      openBtnRef.current?.focus();
    };
  }, [open]);

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <div className="min-h-screen w-full flex relative overflow-hidden">
      {/* Global Ambient Background */}
      <div className="fixed inset-0 -z-50 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] bg-primary/10 animate-mesh" />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] bg-accent/10 animate-mesh"
          style={{ animationDelay: "-7s" }}
        />
      </div>
      {resuming && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Resuming dataset processing"
        >
          <div className="neo p-6 w-full max-w-md space-y-4">
            <div>
              <div className="font-bold text-lg gradient-text">Resuming your upload</div>
              <p className="text-xs text-muted-foreground mt-1">
                Your browser reloaded mid-processing. We restored the file and are continuing from
                where it stopped.
              </p>
            </div>
            <ProcessingBreakdown progress={progress} resuming />
          </div>
        </div>
      )}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 neo-btn px-3 py-2 text-sm font-semibold"
      >
        Skip to main content
      </a>
      {/* Sidebar (desktop) */}
      <aside
        className="hidden md:flex w-56 lg:w-64 shrink-0 flex-col p-3 lg:p-5 gap-3 lg:gap-4 z-10"
        aria-label="Primary"
      >
        <div className="neo p-3 lg:p-4 flex items-center justify-between gap-2 lg:gap-3 relative group">
          <div className="flex items-center gap-2.5 lg:gap-3 min-w-0 flex-1">
            <div
              className="size-9 lg:size-10 rounded-xl gradient-bg grid place-items-center text-white font-black text-sm lg:text-base shadow-md glow-primary shrink-0 transition-transform group-hover:scale-105"
              aria-hidden="true"
            >
              DI
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold gradient-text text-sm lg:text-base leading-none truncate tracking-tight">
                DataIQ Pro
              </div>
              <div className="text-[10px] lg:text-xs text-muted-foreground mt-1 font-medium flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="truncate">v3 · Enterprise</span>
              </div>
            </div>
          </div>
          <ThemeToggle compact />
        </div>
        <nav
          className="neo p-2 lg:p-3 flex-1 flex flex-col gap-0.5 lg:gap-1 overflow-y-auto"
          aria-label="Main navigation"
          aria-busy={processing}
        >
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = path === to;
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                aria-disabled={processing || undefined}
                tabIndex={processing ? -1 : undefined}
                onClick={(e) => {
                  if (processing) e.preventDefault();
                }}
                className={`relative flex items-center gap-2.5 lg:gap-3 px-3 lg:px-3.5 py-2 lg:py-2.5 rounded-xl text-xs lg:text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  active
                    ? "font-semibold text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                } ${processing ? "opacity-50 pointer-events-none" : ""}`}
              >
                {active && (
                  <motion.div
                    layoutId="desktop-active-nav"
                    className="absolute inset-0 neo-inset rounded-xl -z-10 border border-primary/30"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}
                <Icon
                  className={`size-4 shrink-0 z-10 transition-colors ${active ? "text-primary" : "opacity-80"}`}
                  aria-hidden="true"
                />
                <span className="truncate z-10">{label}</span>
              </Link>
            );
          })}
        </nav>
        {processing && (
          <div
            className="neo-sm p-3 text-xs text-muted-foreground space-y-2"
            role="status"
            aria-live="polite"
          >
            <div className="font-semibold text-foreground">
              {progress
                ? `${progress.stageLabel}… ${Math.round(progress.overallPct)}%`
                : "Processing dataset…"}
            </div>
            <div>Navigation is locked until processing finishes.</div>
          </div>
        )}
        <RolePicker role={role} setRole={setRole} />
        {dataset && (
          <div className="neo-sm p-3 text-xs border border-primary/20">
            <div className="font-semibold truncate text-foreground">{dataset.name}</div>
            <div className="text-muted-foreground mt-1 flex items-center justify-between">
              <span>{dataset.rowCount.toLocaleString()} rows</span>
              <span className="font-mono text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                {dataset.colCount} cols
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile nav drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(4px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          >
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              ref={drawerRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Site navigation"
              className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-background/95 backdrop-blur-2xl p-4 flex flex-col gap-3 overflow-y-auto outline-none shadow-2xl border-r border-border/40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold gradient-text text-base sm:text-lg tracking-tight truncate">DataIQ Pro</div>
                <div className="flex items-center gap-2 shrink-0">
                  <ThemeToggle compact />
                  <button
                    className="neo-btn p-2 outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              <nav
                className="neo p-2 flex flex-col gap-1"
                aria-label="Main navigation"
                aria-busy={processing}
              >
                {NAV.map(({ to, icon: Icon, label }) => {
                  const active = path === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={(e) => {
                        if (processing) {
                          e.preventDefault();
                          return;
                        }
                        setOpen(false);
                      }}
                      aria-current={active ? "page" : undefined}
                      aria-disabled={processing || undefined}
                      tabIndex={processing ? -1 : undefined}
                      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "font-semibold text-primary" : "text-muted-foreground"} ${processing ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      {active && (
                        <motion.div
                          layoutId="mobile-active-nav"
                          className="absolute inset-0 neo-inset rounded-xl -z-10"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <Icon className="size-4 z-10" aria-hidden="true" />
                      <span className="z-10">{label}</span>
                    </Link>
                  );
                })}
              </nav>
              <RolePicker role={role} setRole={setRole} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <main
        id="main-content"
        className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden relative z-0"
      >
        {!isOnline && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs font-semibold text-amber-500 flex items-center justify-center gap-2 z-40 backdrop-blur-md">
            <WifiOff className="size-4 shrink-0 animate-pulse" />
            <span>You are currently offline. Local dataset analysis remains fully functional.</span>
          </div>
        )}
        <header className="sticky top-0 z-30 px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 bg-background/70 backdrop-blur-xl border-b border-border/40 min-w-0 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="md:hidden flex items-center gap-2">
              <button
                ref={openBtnRef}
                className="neo-btn p-2 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
                aria-expanded={open}
                aria-controls="mobile-drawer"
              >
                <Menu className="size-4 sm:size-5" />
              </button>
              <div className="font-bold gradient-text text-xs sm:text-base truncate">
                DataIQ Pro
              </div>
            </div>

            <button
              onClick={() => setCommandOpen(true)}
              className="neo-btn px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-2 transition-all hover:scale-[1.01]"
              title="Open Command Palette (Ctrl+K)"
            >
              <Search className="size-3.5 text-primary shrink-0" />
              <span className="hidden sm:inline">Search or command...</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold neo-sm rounded bg-muted/60 text-muted-foreground border border-border/50">
                Ctrl+K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-2">
              <div className="flex items-center gap-1 neo-inset p-1 rounded-xl">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  title="Undo last dataset action (Ctrl+Z)"
                  className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    canUndo
                      ? "hover:bg-card hover:text-foreground text-primary shadow-sm cursor-pointer"
                      : "text-muted-foreground/40 cursor-not-allowed"
                  }`}
                >
                  <Undo2 className="size-3.5" />
                  <span className="sr-only">Undo</span>
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo}
                  title="Redo dataset action (Ctrl+Y)"
                  className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    canRedo
                      ? "hover:bg-card hover:text-foreground text-primary shadow-sm cursor-pointer"
                      : "text-muted-foreground/40 cursor-not-allowed"
                  }`}
                >
                  <Redo2 className="size-3.5" />
                  <span className="sr-only">Redo</span>
                </button>
              </div>
              <button className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <History className="size-3.5 text-primary" /> v{historyIndex + 1}/{Math.max(1, history.length)}{" "}
                <ChevronDown className="size-3 opacity-60" />
              </button>
              <ThemeToggle />
              <button
                className="neo-btn p-1.5 rounded-full text-muted-foreground hover:text-foreground"
                title="How to Use"
              >
                <HelpCircle className="size-4" />
              </button>
            </div>
            <button
              onClick={() => setCopilotOpen(!copilotOpen)}
              className="neo-btn px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-bold text-primary flex items-center gap-2 hover:scale-[1.02] transition-all shadow-sm whitespace-nowrap border-primary/30"
            >
              <Sparkles className="size-3.5 sm:size-4 shrink-0 text-primary animate-pulse" />{" "}
              <span className="hidden xs:inline sm:inline">AI Copilot</span>
              <span className="xs:hidden sm:hidden">AI</span>
            </button>
            <div className="md:hidden flex items-center gap-1.5 shrink-0">
              <div className="neo-sm px-2 py-1 text-[10px] sm:text-xs truncate max-w-[80px]">
                {ROLES.find((r) => r.id === role)?.short}
              </div>
              <ThemeToggle compact />
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full min-h-full">{children}</div>
        </div>

        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onOpenCopilot={() => setCopilotOpen(true)}
        />

        {/* AI Copilot Side Panel */}
        <AnimatePresence>
          {copilotOpen && (
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="absolute right-0 top-[57px] bottom-0 w-full sm:w-80 md:w-96 max-w-full border-l border-border/50 bg-background/95 backdrop-blur-2xl z-40 shadow-2xl flex flex-col"
            >
              <AICopilot onClose={() => setCopilotOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function RolePicker({ role, setRole }: { role: Role; setRole: (r: Role) => void }) {
  return (
    <div className="neo p-3">
      <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">Your Role</div>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Select your role">
        {ROLES.map((r) => (
          <button
            key={r.id}
            role="radio"
            aria-checked={role === r.id}
            onClick={() => setRole(r.id)}
            className={`relative text-left px-2 py-2 rounded-lg text-xs transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary ${role === r.id ? "text-primary font-semibold" : "neo-btn"}`}
          >
            {role === r.id && (
              <motion.div
                layoutId="role-active"
                className="absolute inset-0 neo-inset rounded-lg -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="mr-1 z-10" aria-hidden="true">
              {r.emoji}
            </span>
            <span className="z-10">{r.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
