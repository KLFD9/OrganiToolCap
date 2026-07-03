import { isHierarchyEdge, type OrgEdge, type OrgNode, type OrgNodeStyle, type OrgTheme } from "../types/orgchart";

/**
 * Calcule la profondeur de chaque nœud par BFS depuis les racines (nœuds sans
 * parent). Seuls les liens hiérarchiques comptent — un rattachement
 * fonctionnel ne change ni le niveau ni la couleur de palette.
 */
export function computeLevels(nodes: OrgNode[], edges: OrgEdge[]): Map<string, number> {
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const e of edges) {
    if (!isHierarchyEdge(e)) continue;
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source)!.push(e.target);
    hasParent.add(e.target);
  }

  const levels = new Map<string, number>();
  const roots = nodes.filter((n) => !hasParent.has(n.id));
  const queue: Array<{ id: string; level: number }> = roots.map((n) => ({ id: n.id, level: 0 }));

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    if (levels.has(id)) continue;
    levels.set(id, level);
    for (const childId of childrenOf.get(id) ?? []) {
      if (!levels.has(childId)) queue.push({ id: childId, level: level + 1 });
    }
  }

  // Nœuds orphelins / non rattachés (cycles, données partielles)
  for (const n of nodes) {
    if (!levels.has(n.id)) levels.set(n.id, 0);
  }

  return levels;
}

const VARIANT_TEXT: Record<OrgTheme["nodeStyle"], string> = {
  glass: "#1a1a1e",
  flat: "#ffffff",
  card: "#1a1a1e",
  outline: "#1a1a1e",
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Détermine si le texte doit être blanc ou noir en fonction de la luminance du fond hexadécimal.
 * Respecte les directives d'accessibilité contrastes WCAG.
 */
export function getContrastColor(hexColor: string): string {
  if (!hexColor || hexColor === "transparent") return "#1a1a1e";
  
  const clean = hexColor.replace("#", "");
  if (clean.length !== 3 && clean.length !== 6) return "#1a1a1e";
  
  const bigint = parseInt(clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  
  // Calcul de la luminance relative (formule standard)
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Un luma élevé (> 150) indique une couleur claire : on renvoie du texte sombre
  return luma > 150 ? "#1a1a1e" : "#ffffff";
}

/** Calcule le style effectif d'un nœud : palette du thème selon le niveau, fusionnée avec styleOverride. */
export function computeNodeStyle(theme: OrgTheme, level: number, override?: Partial<OrgNodeStyle>): OrgNodeStyle {
  const accentColor = override?.accentColor ?? theme.palette[Math.min(level, theme.palette.length - 1)];

  let base: OrgNodeStyle;
  switch (theme.nodeStyle) {
    case "glass":
      base = {
        background: "rgba(255, 255, 255, 0.72)",
        textColor: VARIANT_TEXT.glass,
        borderColor: hexToRgba(accentColor, 0.25),
        accentColor,
      };
      break;
    case "flat":
      base = {
        background: accentColor,
        textColor: getContrastColor(accentColor),
        borderColor: "transparent",
        accentColor,
      };
      break;
    case "outline":
      base = {
        background: "rgba(255, 255, 255, 0.95)",
        textColor: VARIANT_TEXT.outline,
        borderColor: accentColor,
        accentColor,
      };
      break;
    case "card":
    default:
      base = {
        background: "#ffffff",
        textColor: VARIANT_TEXT.card,
        borderColor: hexToRgba(accentColor, 0.15),
        accentColor,
      };
      break;
  }

  const result = { ...base, ...override };

  // Forcer le calcul du contraste si le style global est "flat" ou si un fond personnalisé est défini
  if (theme.nodeStyle === "flat" || override?.background) {
    result.textColor = getContrastColor(result.background);
  }

  return result;
}
