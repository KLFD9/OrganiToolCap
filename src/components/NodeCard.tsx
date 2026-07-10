import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { resolveDisplay, type OrgNode, type OrgTheme } from "../types/orgchart";
import { computeNodeHeight, computeNodeStyle, getContrastColor, computeNodeWidth, formatPhoneNumber } from "../lib/nodeStyle";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { Mail, Phone } from "lucide-react";

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
  /**
   * Carte hors de toute page (mode multi-pages) : estompée avec badge
   * « hors page » — rien n'est oublié à l'export par accident.
   */
  outOfPage?: boolean;
  /** Couleur propre héritée du responsable le plus proche. */
  inheritedAccentColor?: string;
}

const ATTACH_SIDES = ["top", "bottom", "left", "right"] as const;

const SIDE_TO_POSITION: Record<(typeof ATTACH_SIDES)[number], Position> = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
};

const HANDLE_VISIBLE_CLASS =
  "!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 !border-2 !border-white dark:!border-zinc-950 !rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200";

/** Ancre muette : sert uniquement de point d'attache aux liens « snappés ». */
const HANDLE_ANCHOR_CLASS =
  "!w-px !h-px !min-w-0 !min-h-0 !border-0 !bg-transparent opacity-0 !pointer-events-none";

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
  const {
    orgNode,
    theme,
    level,
    direction,
    targetSide,
    childCount = 0,
    hiddenCount = 0,
    collapsed = false,
    outOfPage = false,
    inheritedAccentColor,
  } = data;
  const toggleCollapsed = useOrgChartStore((s) => s.toggleCollapsed);
  const style = computeNodeStyle(theme, level, {
    ...orgNode.styleOverride,
    ...(inheritedAccentColor ? { accentColor: inheritedAccentColor } : {}),
  });
  const display = resolveDisplay(theme);
  const { name, role, department, email, phone, avatarUrl } = orgNode.data;

  const isGlass = theme.nodeStyle === "glass";
  const isFlat = theme.nodeStyle === "flat";
  const isNeon = theme.nodeStyle === "neon";
  const isMinimal = theme.nodeStyle === "minimal";
  // Poignées interactives (visibles au survol, utilisables au drag) : celles
  // du sens de lecture courant. Les autres côtés portent des ancres muettes
  // (invisibles, non connectables) sur lesquelles le Canvas fait « snapper »
  // les liens selon la géométrie relative des cartes (cf. chooseEdgeSides).
  const interactiveSource = direction === "TB" ? "bottom" : "right";
  const interactiveTarget = targetSide === "left" ? "left" : direction === "TB" ? "top" : "left";

  // Configuration de l'ombre néon (glowing)
  const neonGlow = `0 0 14px ${style.accentColor}2c, 0 4px 18px rgba(0,0,0,0.5)`;

  // Ombres portées de style Awwwards
  const shadowStyle = selected
    ? `0 0 0 2px ${style.accentColor}, 0 20px 40px -10px rgba(0, 0, 0, 0.18)`
    : outOfPage
    ? "0 0 0 2px rgba(245, 158, 11, 0.75), 0 8px 30px -10px rgba(0, 0, 0, 0.06)"
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

  const cardWidth = computeNodeWidth(orgNode, display.showPhotos);
  const cardHeight = computeNodeHeight(orgNode, display);

  return (
    <div
      className="relative px-5 py-4 border transition-[box-shadow,transform,border-color] duration-200 ease-out group hover:-translate-y-0.5 cursor-pointer"
      style={{
        width: cardWidth,
        height: cardHeight,
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
        opacity: outOfPage && !selected ? 0.7 : undefined,
      }}
    >
      {/* Badge « hors page » (mode multi-pages) */}
      {outOfPage && (
        <div
          className="pointer-events-none absolute -top-2.5 right-3 z-10 rounded-full border px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest"
          style={{
            background: "#fffbeb",
            borderColor: "rgba(245, 158, 11, 0.5)",
            color: "#b45309",
          }}
        >
          hors page
        </div>
      )}
      {/* Points de connexion cible : un par côté. Seul celui du sens de
          lecture est interactif (visible au survol) ; les autres sont des
          ancres muettes pour le snap géométrique des liens. */}
      {ATTACH_SIDES.map((side) => (
        <Handle
          key={`t-${side}`}
          id={`t-${side}`}
          type="target"
          position={SIDE_TO_POSITION[side]}
          isConnectable={side === interactiveTarget}
          className={side === interactiveTarget ? HANDLE_VISIBLE_CLASS : HANDLE_ANCHOR_CLASS}
        />
      ))}

      {/* Pôle / Département */}
      {department && display.showDepartments && (
        <div
          className="mb-2.5 inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest"
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
          <div className="text-xs font-bold leading-normal tracking-tight break-words" style={{ color: style.textColor }}>
            {name || "Sans nom"}
          </div>
          {role && display.showRoles && (
            <div className={`text-[10px] leading-relaxed mt-0.5 font-medium break-words ${isDarkText ? "opacity-90" : "opacity-80"}`}>
              {role}
            </div>
          )}
        </div>
      </div>

      {/* Contacts (Email & Téléphone) */}
      {((email && display.showEmails) || (phone && display.showPhones)) && (
        <div
          className="mt-3.5 pt-3 border-t flex flex-col gap-1.5"
          style={{ borderColor: isDarkText ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)" }}
        >
          {email && display.showEmails && (
            <div className={`flex items-center gap-2 text-[10px] tracking-tight break-all ${isDarkText ? "opacity-70" : "opacity-60"}`}>
              <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} style={{ color: style.textColor }} />
              <span className="truncate" title={email}>{email}</span>
            </div>
          )}
          {phone && display.showPhones && (
            <div className={`flex items-center gap-2 text-[10px] tracking-tight break-all ${isDarkText ? "opacity-70" : "opacity-60"}`}>
              <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} style={{ color: style.textColor }} />
              <span className="truncate" title={formatPhoneNumber(phone)}>{formatPhoneNumber(phone)}</span>
            </div>
          )}
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

      {/* Points de connexion source : un par côté, même logique que les cibles. */}
      {ATTACH_SIDES.map((side) => (
        <Handle
          key={`s-${side}`}
          id={`s-${side}`}
          type="source"
          position={SIDE_TO_POSITION[side]}
          isConnectable={side === interactiveSource}
          className={side === interactiveSource ? HANDLE_VISIBLE_CLASS : HANDLE_ANCHOR_CLASS}
        />
      ))}
    </div>
  );
}

export const NodeCard = memo(NodeCardImpl);
