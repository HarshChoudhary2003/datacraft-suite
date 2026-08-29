import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Upload,
  BarChart3,
  Code2,
  FileDown,
  BookOpen,
  Database,
  ShieldCheck,
  History,
  PieChart,
  Settings2,
  BrainCircuit,
  Sparkles,
  Sun,
  Moon,
  Plus,
  FileText,
  MessageSquare,
} from "lucide-react";
import { useDataset, ROLES, type Role } from "@/store/dataset-context";
import { useTheme } from "@/store/theme-context";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCopilot?: () => void;
}

export function CommandPalette({ open, onOpenChange, onOpenCopilot }: Props) {
  const navigate = useNavigate();
  const { dataset, role, setRole } = useDataset();
  const { theme, toggle } = useTheme();

  const runCommand = (command: () => void) => {
    onOpenChange(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/" }))}>
            <Upload className="mr-2 size-4 text-primary" />
            <span>Upload Dataset</span>
            <CommandShortcut>Shift+U</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/overview" }))}>
            <Database className="mr-2 size-4 text-primary" />
            <span>Dataset Overview</span>
            <CommandShortcut>Shift+O</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/prep" }))}>
            <ShieldCheck className="mr-2 size-4 text-primary" />
            <span>Data Prep & Validation</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/analysis" }))}>
            <BarChart3 className="mr-2 size-4 text-primary" />
            <span>Deep Analysis</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/charts" }))}>
            <PieChart className="mr-2 size-4 text-primary" />
            <span>BI Dashboard & Visuals</span>
            <CommandShortcut>Shift+V</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/transform" }))}>
            <Settings2 className="mr-2 size-4 text-primary" />
            <span>Feature Engineering</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/train" }))}>
            <BrainCircuit className="mr-2 size-4 text-primary" />
            <span>AutoML Model Training</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/codegen" }))}>
            <Code2 className="mr-2 size-4 text-primary" />
            <span>Code Generator</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/export" }))}>
            <FileDown className="mr-2 size-4 text-primary" />
            <span>Export Notebook & Reports</span>
            <CommandShortcut>Shift+E</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/guide" }))}>
            <BookOpen className="mr-2 size-4 text-primary" />
            <span>Documentation & Guide</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/audit" }))}>
            <History className="mr-2 size-4 text-primary" />
            <span>Audit & Telemetry Log</span>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Actions">
          {onOpenCopilot && (
            <CommandItem onSelect={() => runCommand(onOpenCopilot)}>
              <Sparkles className="mr-2 size-4 text-primary" />
              <span>Ask AI Copilot</span>
              <CommandShortcut>Ctrl+Space</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/charts" }))}>
            <Plus className="mr-2 size-4 text-primary" />
            <span>Create Dashboard Chart</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate({ to: "/export" }))}>
            <FileText className="mr-2 size-4 text-primary" />
            <span>Generate Executive PDF Report</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(toggle)}>
            {theme === "dark" ? (
              <Sun className="mr-2 size-4 text-amber-400" />
            ) : (
              <Moon className="mr-2 size-4 text-indigo-400" />
            )}
            <span>Toggle Theme ({theme === "dark" ? "Light" : "Dark"})</span>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Switch Role Experience">
          {ROLES.map((r) => (
            <CommandItem
              key={r.id}
              onSelect={() => runCommand(() => setRole(r.id))}
              className={role === r.id ? "font-bold text-primary" : ""}
            >
              <MessageSquare className="mr-2 size-4 opacity-70" />
              <span>{r.label}</span>
              {role === r.id && <CommandShortcut>Active</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
