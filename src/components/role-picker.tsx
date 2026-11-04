import { useRef, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { ROLES, RoleIcon, type Role } from "@/store/dataset-context";

/**
 * "Your Role" radio group.
 * ARIA radio pattern: roving tabindex, arrow keys move focus AND selection
 * (selection follows focus), Home/End jump to the first/last option.
 */
export function RolePicker({ role, setRole }: { role: Role; setRole: (r: Role) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (index: number, select = true) => {
    const i = (index + ROLES.length) % ROLES.length;
    refs.current[i]?.focus();
    if (select) setRole(ROLES[i].id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        move(index + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        move(index - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(ROLES.length - 1);
        break;
      // Space/Enter activate the focused button natively.
    }
  };

  return (
    <div className="neo p-3">
      <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">Your Role</div>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Select your role">
        {ROLES.map((r, i) => (
          <button
            key={r.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="radio"
            aria-checked={role === r.id}
            aria-label={r.label}
            tabIndex={role === r.id ? 0 : -1}
            onClick={() => setRole(r.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative text-left px-2 py-2 rounded-lg text-xs transition-all outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring ${role === r.id ? "text-primary font-semibold" : "neo-btn"}`}
          >
            {role === r.id && (
              <motion.div
                layoutId="role-active"
                className="absolute inset-0 neo-inset rounded-lg -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <RoleIcon role={r.id} size="sm" />
              <span>{r.short}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
