import { NodeToolbar, Position } from "@xyflow/react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  Rows3,
  ChevronDown,
  Copy,
  FilePlus2,
  Palette,
  PanelRightOpen,
} from "lucide-react";
import type { OrgTheme } from "../types/orgchart";
import type { SelectionLayoutAction } from "../lib/selectionLayout";

interface SelectionToolbarProps {
  nodeIds: string[];
  theme: OrgTheme;
  themeMode: "light" | "dark";
  onArrange: (action: SelectionLayoutAction) => void;
  onColorChange: (color: string) => void;
  onDuplicate: () => void;
  onOpenInspector: () => void;
  onCreateBranchPage?: () => void;
  arrangeDisabledReason?: string;
  distributionDisabledReasons?: Partial<Record<"distribute-x" | "distribute-y", string>>;
}

const ALIGN_ACTIONS = [
  { action: "align-left", label: "Aligner à gauche", Icon: AlignStartVertical },
  { action: "align-center-x", label: "Centrer horizontalement", Icon: AlignCenterVertical },
  { action: "align-right", label: "Aligner à droite", Icon: AlignEndVertical },
  { action: "align-top", label: "Aligner en haut", Icon: AlignStartHorizontal },
  { action: "align-center-y", label: "Centrer verticalement", Icon: AlignCenterHorizontal },
  { action: "align-bottom", label: "Aligner en bas", Icon: AlignEndHorizontal },
] satisfies Array<{ action: SelectionLayoutAction; label: string; Icon: typeof AlignStartVertical }>;

const DISTRIBUTE_ACTIONS = [
  { action: "distribute-x", label: "Répartir horizontalement", Icon: AlignHorizontalSpaceBetween },
  { action: "distribute-y", label: "Répartir verticalement", Icon: AlignVerticalSpaceBetween },
] satisfies Array<{ action: SelectionLayoutAction; label: string; Icon: typeof AlignStartVertical }>;

export function SelectionToolbar({
  nodeIds,
  theme,
  themeMode,
  onArrange,
  onColorChange,
  onDuplicate,
  onOpenInspector,
  onCreateBranchPage,
  arrangeDisabledReason,
  distributionDisabledReasons,
}: SelectionToolbarProps) {
  if (nodeIds.length === 0) return null;

  const multiple = nodeIds.length > 1;
  const colors = [...new Set([theme.accent, ...theme.palette])].slice(0, 5);
  const dark = themeMode === "dark";
  const dividerClass = dark ? "bg-zinc-700" : "bg-zinc-200";
  const buttonClass = `selection-toolbar-action flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
    dark ? "text-zinc-200 hover:bg-zinc-800" : "text-zinc-700 hover:bg-zinc-100"
  }`;

  return (
    <NodeToolbar nodeId={nodeIds} isVisible position={Position.Top} offset={14} className="nodrag nopan nowheel">
      <div
        role="toolbar"
        aria-label={multiple ? `Actions pour ${nodeIds.length} cartes` : "Actions de la carte"}
        className={`selection-toolbar-bubble flex items-center gap-1 rounded-full border p-1.5 shadow-xl backdrop-blur-xl ${
          dark
            ? "border-white/10 bg-zinc-900/95 text-zinc-200 shadow-black/40"
            : "border-zinc-200/90 bg-white/95 text-zinc-700 shadow-zinc-900/15"
        }`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="selection-toolbar-context pl-2 pr-1 text-[10px] font-semibold text-zinc-400">
          {multiple ? `${nodeIds.length} cartes` : "Carte"}
        </span>
        <span className={`selection-toolbar-divider mx-0.5 h-5 w-px ${dividerClass}`} />

        <div className="flex items-center gap-1 px-1" aria-label="Couleur de la carte">
          <Palette className="mr-0.5 h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          {colors.map((color, index) => (
            <button
              key={color}
              type="button"
              aria-label={`Appliquer la couleur ${color}`}
              title={`Couleur ${color}`}
              onClick={() => onColorChange(color)}
              className={`selection-toolbar-swatch h-5 w-5 cursor-pointer rounded-full ring-1 ring-inset ring-black/10 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${index >= 2 ? "selection-toolbar-color-secondary" : ""}`}
              style={{ backgroundColor: color }}
            />
          ))}
          <label
            className={`selection-toolbar-swatch relative flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-dashed text-[12px] leading-none transition-colors focus-within:ring-2 focus-within:ring-primary-500 ${
              dark ? "border-zinc-600 text-zinc-400 hover:border-zinc-400" : "border-zinc-300 text-zinc-400 hover:border-zinc-500"
            }`}
            title="Autre couleur"
          >
            +
            <input
              type="color"
              aria-label="Choisir une autre couleur"
              value={theme.accent}
              onChange={(event) => onColorChange(event.target.value.toUpperCase())}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>

        <span className={`selection-toolbar-divider mx-0.5 h-5 w-px ${dividerClass}`} />

        {multiple ? (
          <>
            <ActionMenu
              label="Aligner"
              icon={<AlignCenterVertical className="h-3.5 w-3.5" />}
              actions={ALIGN_ACTIONS}
              onAction={onArrange}
              buttonClass={buttonClass}
              dark={dark}
              disabledReason={arrangeDisabledReason}
            />
            <ActionMenu
              label="Répartir"
              icon={<Rows3 className="h-3.5 w-3.5" />}
              actions={DISTRIBUTE_ACTIONS}
              onAction={onArrange}
              buttonClass={buttonClass}
              dark={dark}
              disabledReason={
                arrangeDisabledReason ??
                (nodeIds.length < 3 ? "Sélectionnez au moins trois cartes" : undefined)
              }
              actionDisabledReasons={distributionDisabledReasons}
            />
          </>
        ) : (
          <>
            <button type="button" onClick={onDuplicate} className={buttonClass} title="Dupliquer la carte (Ctrl/Cmd+D)">
              <Copy className="h-3.5 w-3.5" />
              <span className="selection-toolbar-button-label">Dupliquer</span>
            </button>
            <button type="button" onClick={onOpenInspector} className={buttonClass} title="Modifier la fiche membre">
              <PanelRightOpen className="h-3.5 w-3.5" />
              <span className="selection-toolbar-button-label">Fiche</span>
            </button>
            {onCreateBranchPage && (
              <button
                type="button"
                onClick={onCreateBranchPage}
                className={buttonClass}
                title="Créer une page de pôle à partir de cette branche"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                <span className="selection-toolbar-button-label">Page de pôle</span>
              </button>
            )}
          </>
        )}
      </div>
    </NodeToolbar>
  );
}

interface ActionMenuProps {
  label: string;
  icon: React.ReactNode;
  actions: Array<{ action: SelectionLayoutAction; label: string; Icon: typeof AlignStartVertical }>;
  onAction: (action: SelectionLayoutAction) => void;
  buttonClass: string;
  dark: boolean;
  disabledReason?: string;
  actionDisabledReasons?: Partial<Record<SelectionLayoutAction, string>>;
}

function ActionMenu({
  label,
  icon,
  actions,
  onAction,
  buttonClass,
  dark,
  disabledReason,
  actionDisabledReasons,
}: ActionMenuProps) {
  const disabled = Boolean(disabledReason);
  return (
    <details className="group relative" onToggle={(event) => {
      if (disabled) event.currentTarget.removeAttribute("open");
    }}>
      <summary
        aria-disabled={disabled}
        className={`${buttonClass} list-none [&::-webkit-details-marker]:hidden ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
        title={disabledReason ?? label}
      >
        {icon}
        <span className="selection-toolbar-button-label">{label}</span>
        <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
      </summary>
      {!disabled && (
        <div
          className={`absolute left-0 top-[calc(100%+8px)] z-50 min-w-52 rounded-xl border p-1.5 shadow-xl ${
            dark ? "border-zinc-700 bg-zinc-900" : "border-zinc-200 bg-white"
          }`}
        >
          {actions.map(({ action, label: actionLabel, Icon }) => {
            const actionDisabledReason = actionDisabledReasons?.[action];
            return (
              <button
                key={action}
                type="button"
                disabled={Boolean(actionDisabledReason)}
                title={actionDisabledReason ?? actionLabel}
                onClick={(event) => {
                  onAction(action);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                  actionDisabledReason
                    ? "cursor-not-allowed opacity-45"
                    : dark
                    ? "cursor-pointer text-zinc-200 hover:bg-zinc-800"
                    : "cursor-pointer text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="flex min-w-0 flex-col">
                  <span>{actionLabel}</span>
                  {actionDisabledReason && (
                    <span className="text-[9px] font-normal text-zinc-400">
                      {actionDisabledReason}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </details>
  );
}
