import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { OrgNode, OrgTheme } from "../types/orgchart";
import { computeNodeStyle } from "../lib/nodeStyle";

export interface NodeCardData extends Record<string, unknown> {
  orgNode: OrgNode;
  theme: OrgTheme;
  level: number;
  direction: "TB" | "LR";
  /** Poignée cible sur le côté gauche (subordonnés empilés en disposition compacte). */
  targetSide?: "top" | "left";
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
  const { orgNode, theme, level, direction, targetSide } = data;
  const style = computeNodeStyle(theme, level, orgNode.styleOverride);
  const { name, role, department, email, avatarUrl } = orgNode.data;

  const isGlass = theme.nodeStyle === "glass";
  const isFlat = theme.nodeStyle === "flat";
  const sourcePos = direction === "TB" ? Position.Bottom : Position.Right;
  const targetPos =
    targetSide === "left" ? Position.Left : direction === "TB" ? Position.Top : Position.Left;

  // Ombres portées de style Awwwards
  const shadowStyle = selected
    ? `0 0 0 2px ${style.accentColor}, 0 20px 40px -10px rgba(0, 0, 0, 0.18)`
    : "0 8px 30px -10px rgba(0, 0, 0, 0.06)";

  // Détection du texte sombre pour adapter les contrastes internes du nœud
  const isDarkText = style.textColor === "#1a1a1e" || style.textColor === "#111111" || style.textColor === "#000000";

  // Configuration dynamique de l'avatar initials
  const initialsBg = isFlat
    ? isDarkText
      ? "rgba(0, 0, 0, 0.08)"
      : "rgba(255, 255, 255, 0.22)"
    : style.accentColor;

  const initialsColor = isFlat ? style.textColor : "#ffffff";

  // Configuration du badge de département
  const deptBg = isFlat
    ? isDarkText
      ? "rgba(0, 0, 0, 0.07)"
      : "rgba(255, 255, 255, 0.18)"
    : `${style.accentColor}12`;

  const deptColor = isFlat ? style.textColor : style.accentColor;

  return (
    <div
      className="relative w-[240px] px-5 py-4 border transition-all duration-300 ease-out group hover:scale-[1.03] cursor-pointer"
      style={{
        background: style.background,
        color: style.textColor,
        borderColor: style.borderColor,
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
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500 !border-2 !border-white dark:!border-zinc-950 !rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200"
      />

      {/* Pôle / Département */}
      {department && (
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
        {avatarUrl ? (
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
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold leading-normal tracking-tight" style={{ color: style.textColor }}>
            {name || "Sans nom"}
          </div>
          {role && (
            <div className="truncate text-[10px] leading-relaxed mt-0.5 font-medium opacity-80">
              {role}
            </div>
          )}
        </div>
      </div>

      {/* Email */}
      {email && (
        <div
          className="mt-2.5 pt-2 border-t truncate text-[9px] font-mono tracking-tight opacity-60"
          style={{ borderColor: isDarkText ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)" }}
        >
          {email}
        </div>
      )}

      {/* Source connection point - invisible par défaut, s'affiche au survol */}
      <Handle
        type="source"
        position={sourcePos}
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500 !border-2 !border-white dark:!border-zinc-950 !rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200"
      />
    </div>
  );
}

export const NodeCard = memo(NodeCardImpl);
