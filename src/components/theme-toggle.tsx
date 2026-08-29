import { useState, useRef, useEffect } from "react";
import { Moon, Sun, Zap, Shield, Eye, Palette } from "lucide-react";
import { useTheme, type Theme } from "@/store/theme-context";
import { toast } from "sonner";

const THEME_OPTIONS: { id: Theme; label: string; icon: typeof Sun; badge: string }[] = [
  { id: "light", label: "Light Glass", icon: Sun, badge: "☀️" },
  { id: "dark", label: "Dark Neomorphism", icon: Moon, badge: "🌙" },
  { id: "cyberpunk", label: "Cyberpunk Neon", icon: Zap, badge: "⚡" },
  { id: "emerald", label: "Emerald Analytics", icon: Shield, badge: "❇️" },
  { id: "oled", label: "Midnight OLED", icon: Eye, badge: "🖤" },
];

export function ThemeToggle({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentIndex = THEME_OPTIONS.findIndex((t) => t.id === theme);
  const active = THEME_OPTIONS[currentIndex >= 0 ? currentIndex : 0];
  const Icon = active.icon;

  const handleToggleClick = (e: React.MouseEvent) => {
    if (e.altKey || e.shiftKey) {
      setOpen((prev) => !prev);
      return;
    }
    const nextIndex = (currentIndex + 1) % THEME_OPTIONS.length;
    const nextTheme = THEME_OPTIONS[nextIndex];
    setTheme(nextTheme.id);
    toast.success(`Theme: ${nextTheme.label} ${nextTheme.badge}`, {
      duration: 1500,
    });
  };

  return (
    <div className={`relative shrink-0 ${className}`} ref={ref}>
      <button
        type="button"
        onClick={handleToggleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen((prev) => !prev);
        }}
        aria-label={`Current theme: ${active.label}. Click to switch theme, right-click for menu.`}
        title={`Current theme: ${active.label}\nClick to switch to next theme · Right-click for menu`}
        className={`neo-btn inline-flex items-center justify-center gap-1.5 sm:gap-2 focus-visible:ring-2 focus-visible:ring-primary outline-none text-xs font-semibold shrink-0 transition-all cursor-pointer hover:scale-105 active:scale-95 ${
          compact ? "p-2 rounded-xl" : "px-2.5 py-1.5 sm:py-2"
        }`}
      >
        <Icon className="size-4 text-primary shrink-0 transition-transform" />
        {!compact && (
          <span className="hidden xl:inline-block max-w-[85px] truncate text-xs">{active.label}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 py-1.5 bg-card/95 backdrop-blur-xl border border-border/60 rounded-2xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 border-b border-border/40 mb-1">
            <Palette className="size-3 text-primary shrink-0" /> Visual Themes
          </div>
          {THEME_OPTIONS.map((t) => {
            const TIcon = t.icon;
            const isSelected = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                  toast.success(`Theme: ${t.label} ${t.badge}`, { duration: 1500 });
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-primary/10 text-primary font-bold"
                    : "text-foreground hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <TIcon className="size-3.5 shrink-0" />
                  <span>{t.label}</span>
                </div>
                <span className="text-xs">{t.badge}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
