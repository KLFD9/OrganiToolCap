import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { resolveDisplay, type OrgNode, type OrgTheme } from "../types/orgchart";
import { computeNodeStyle, getContrastColor } from "../lib/nodeStyle";
import { useOrgChartStore } from "../store/useOrgChartStore";

export interface NodeCardData extends Record<string, unknown> {
  orgNode: OrgNode;
  theme: OrgTheme;
  level: number;
  direction: "TB" | "LR";
  /** Poignée cible sur le côté gauche (subordonnés empilés en disposition compacte). */
  targetSide?: "top" | "left";
  /** Subordonnés directs (0 = feuille, pas de bouton de repli). */
  childCount?: number;
  /** Effectif masqué quand la branche est repliée. */
  hiddenCount?: number;
  /** Branche repliée. */
  collapsed?: boolean;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function NodeCardImpl({ data, selected }: NodeProps & { data: NodeCardData }) {
  const { orgNode, theme, level, direction, targetSide, childCount = 0, hiddenCount = 0, collapsed = false } = data;
  const toggleCollapsed = useOrgChartStore((s) => s.toggleCollapsed);
  const style = computeNodeStyle(theme, level, orgNode.styleOverride);
  const display = resolveDisplay(theme);
  const { name, role, department, email, avatarUrl } = orgNode.data;

  const isGlass = theme.nodeStyle === "glass";
  const isFlat = theme.nodeStyle === "flat";
  const isNeon = theme.nodeStyle === "neon";
  const isMinimal = theme.nodeStyle === "minimal";
  const sourcePos = direction === "TB" ? Position.Bottom : Position.Right;
  const targetPos =
    targetSide === "left" ? Position.Left : direction === "TB" ? Position.Top : Position.Left;

  // Configuration de l'ombre néon (glowing)
  const neonGlow = `0 0 14px ${style.accentColor}2c, 0 4px 18px rgba(0,0,0,0.5)`;

  // Ombres portées de style Awwwards
  const shadowStyle = selected
    ? `0 0 0 2px ${style.accentColor}, 0 20px 40px -10px rgba(0, 0, 0, 0.18)`
    : isNeon
    ? neonGlow
    : "0 8px 30px -10px rgba(0, 0, 0, 0.06)";

  // Détection du texte sombre pour adapter les contrastes internes du nœud
  const isDarkText =
    !isNeon &&
    (style.textColor === "#1a1a1e" ||
      style.textColor === "#111111" ||
      style.textColor === "#000000" ||
      style.textColor === "#18181b");

  // Détermination si le fond global de la carte est coloré
  const isColoredBg = isFlat || theme.nodeStyle === "gradient";

  // Configuration dynamique de l'avatar initials
  const initialsBg = isColoredBg
    ? isDarkText
      ? "rgba(0, 0, 0, 0.08)"
      : "rgba(255, 255, 255, 0.22)"
    : isNeon
    ? `${style.accentColor}1a`
    : style.accentColor;

  const initialsColor = isColoredBg ? style.textColor : isNeon ? style.accentColor : "#ffffff";

  // Configuration du badge de département
  const deptBg = isColoredBg
    ? isDarkText
      ? "rgba(0, 0, 0, 0.07)"
      : "rgba(255, 255, 255, 0.18)"
    : isNeon
    ? `${style.accentColor}1f`
    : `${style.accentColor}12`;

  const deptColor = isColoredBg ? style.textColor : style.accentColor;

  return (
    <div
      className="relative w-[240px] px-5 py-4 border transition-all duration-300 ease-out group hover:scale-[1.03] cursor-pointer"
      style={{
        background: style.background,
        color: style.textColor,
        borderColor: style.borderColor,
        borderLeftWidth: isMinimal ? "4px" : undefined,
        borderLeftColor: isMinimal ? style.accentColor : undefined,
        borderRadius: theme.cornerRadius,
        fontFamily: theme.fontFamily,
        boxShadow: shadowStyle,
        backdropFilter: isGlass ? "blur(18px) saturate(160%)" : undefined,
        WebkitBackdropFilter: isGlass ? "blur(18px) saturate(160%)" : undefined,
      }}
    >
      {/* Target connection point - invisible par défaut, s'affiche au survol */}
      <Handle
        type="target"
        position={targetPos}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 !border-2 !border-white dark:!border-zinc-950 !rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200"
      />

      {/* Pôle / Département */}
      {department && display.showDepartments && (
        <div
          className="mb-2.5 inline-block rounded-md px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest"
          style={{
            background: deptBg,
            color: deptColor,
          }}
        >
          {department}
        </div>
      )}

      {/* Détails du membre */}
      <div className="flex items-center gap-3">
        {display.showPhotos &&
          (avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="h-10 w-10 shrink-0 rounded-full object-cover shadow-sm transition-transform duration-300 group-hover:scale-105"
              style={{ border: `2px solid ${style.accentColor}` }}
            />
          ) : (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tracking-tight shadow-inner"
              style={{
                background: initialsBg,
                color: initialsColor,
              }}
            >
              {initials(name) || "?"}
            </div>
          ))}

        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold leading-normal tracking-tight" style={{ color: style.textColor }}>
            {name || "Sans nom"}
          </div>
          {role && display.showRoles && (
            <div className={`truncate text-[10px] leading-relaxed mt-0.5 font-medium ${isDarkText ? "opacity-90" : "opacity-80"}`}>
              {role}
            </div>
          )}
        </div>
      </div>

      {/* Email */}
      {email && display.showEmails && (
        <div
          className={`mt-2.5 pt-2 border-t truncate text-[9px] font-mono tracking-tight ${isDarkText ? "opacity-75" : "opacity-60"}`}
          style={{ borderColor: isDarkText ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)" }}
        >
          {email}
        </div>
      )}

      {/* Replier / déplier la branche : badge d'effectif quand replié, bouton au survol sinon */}
      {childCount > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapsed(orgNode.id);
          }}
          title={
            collapsed
              ? `Déplier la branche (${hiddenCount} membre${hiddenCount > 1 ? "s" : ""} masqué${hiddenCount > 1 ? "s" : ""})`
              : "Replier la branche"
          }
          aria-label={collapsed ? "Déplier la branche" : "Replier la branche"}
          aria-expanded={!collapsed}
          className={`nodrag absolute z-10 flex h-5 min-w-5 items-center justify-center rounded-full border-2 px-1 font-mono text-[9px] font-bold shadow-sm transition-all duration-200 cursor-pointer hover:scale-110 ${
            direction === "TB"
              ? "-bottom-2.5 left-[calc(50%+22px)] -translate-x-1/2"
              : "-right-2.5 top-[calc(50%+22px)] -translate-y-1/2"
          } ${collapsed ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          style={{
            background: collapsed ? style.accentColor : "#ffffff",
            borderColor: style.accentColor,
            color: collapsed ? getContrastColor(style.accentColor) : style.accentColor,
          }}
        >
          {collapsed ? `+${hiddenCount}` : "−"}
        </button>
      )}

      {/* Source connection point - invisible par défaut, s'affiche au survol */}
      <Handle
        type="source"
        position={sourcePos}
        className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 !border-2 !border-white dark:!border-zinc-950 !rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200"
      />
    </div>
  );
}

export const NodeCard = memo(NodeCardImpl);
