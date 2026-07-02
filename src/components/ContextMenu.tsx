import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  /** Petit hint affiché à droite (raccourci clavier, effectif…). */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Insère un séparateur au-dessus de cet élément. */
  separator?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  themeMode: "light" | "dark";
}

/**
 * Menu contextuel du canvas (clic droit sur un membre ou sur le fond).
 * Fermé par clic extérieur, Échap, ou après action. Navigable au clavier
 * (les éléments sont de vrais boutons, le premier reçoit le focus).
 */
export function ContextMenu({ x, y, items, onClose, themeMode }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Garde le menu dans la fenêtre (ouverture près d'un bord)
  const style: React.CSSProperties = {
    left: Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 240),
    top: Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 9999) - items.length * 34 - 16),
  };

  return (
    <>
      {/* Calque transparent : capte le clic extérieur sans déclencher le canvas */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        style={style}
        className={`fixed z-50 min-w-52 rounded-xl border p-1.5 shadow-2xl backdrop-blur-md animate-fade-in ${
          themeMode === "dark"
            ? "border-border-dark bg-panel-bg-dark/95 shadow-black/40"
            : "border-border-light bg-panel-bg-light/95 shadow-zinc-300/40"
        }`}
      >
        {items.map((item, i) => (
          <div key={i}>
            {item.separator && <div className="my-1.5 h-px bg-zinc-100 dark:bg-zinc-800" />}
            <button
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onClick();
              }}
              className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                item.danger
                  ? "text-red-500 hover:bg-red-500/10"
                  : themeMode === "dark"
                  ? "text-zinc-200 hover:bg-zinc-800"
                  : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              <span>{item.label}</span>
              {item.hint && (
                <span className="font-mono text-[9px] text-zinc-400 dark:text-zinc-500">{item.hint}</span>
              )}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
