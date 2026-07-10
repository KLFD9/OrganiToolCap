import { isHierarchyEdge, type OrgDisplayOptions, type OrgEdge, type OrgNode, type OrgNodeStyle, type OrgTheme } from "../types/orgchart";

/** Hauteur contractuelle de NodeCard, partagée avec le routage et les exports. */
export function computeNodeHeight(node: OrgNode, display: OrgDisplayOptions): number {
  const hasDepartment = display.showDepartments && Boolean(node.data.department);
  const contactCount = [
    display.showEmails && Boolean(node.data.email),
    display.showPhones && Boolean(node.data.phone),
  ].filter(Boolean).length;
  return 110 + (hasDepartment ? 22 : 0) + (contactCount === 1 ? 34 : contactCount >= 2 ? 52 : 0);
}

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
  neon: "#ffffff",
  gradient: "#ffffff",
  minimal: "#18181b",
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

function getLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Détermine si le texte doit être blanc ou noir en fonction de la luminance du fond hexadécimal.
 * Respecte les directives d'accessibilité contrastes WCAG.
 */
export function getContrastColor(hexColor: string): string {
  if (!hexColor || hexColor === "transparent") return "#1a1a1e";
  
  const clean = hexColor.replace("#", "");
  if (clean.length !== 3 && clean.length !== 6) return "#1a1a1e";

  try {
    const bgLuminance = getLuminance(hexColor);
    const whiteLuminance = 1.0;
    const darkLuminance = 0.0091; // pour #1a1a1e

    const ratioWhite = (whiteLuminance + 0.05) / (bgLuminance + 0.05);
    const ratioDark = (bgLuminance + 0.05) / (darkLuminance + 0.05);

    return ratioWhite > ratioDark ? "#ffffff" : "#1a1a1e";
  } catch {
    return "#1a1a1e";
  }
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
    case "neon":
      base = {
        background: "#0c0a09",
        textColor: VARIANT_TEXT.neon,
        borderColor: accentColor,
        accentColor,
      };
      break;
    case "gradient":
      base = {
        background: `linear-gradient(135deg, ${accentColor} 0%, ${hexToRgba(accentColor, 0.75)} 100%)`,
        textColor: getContrastColor(accentColor),
        borderColor: "transparent",
        accentColor,
      };
      break;
    case "minimal":
      base = {
        background: "rgba(255, 255, 255, 0.85)",
        textColor: VARIANT_TEXT.minimal,
        borderColor: "rgba(9, 9, 11, 0.08)",
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

  // Forcer le calcul du contraste si le style global est "flat" ou "gradient" ou si un fond personnalisé est défini
  if (theme.nodeStyle === "flat" || theme.nodeStyle === "gradient" || override?.background) {
    const contrastBase = override?.background || (theme.nodeStyle === "gradient" ? accentColor : result.background);
    result.textColor = getContrastColor(contrastBase);
  }

  return result;
}

/**
 * Formate un numéro de téléphone brut en format français lisible :
 * - 0614053323 -> 06 14 05 33 23
 * - +33614053323 -> +33 6 14 05 33 23
 * - +330614053323 -> +33 (0)6 14 05 33 23
 */
export function formatPhoneNumber(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";

  // Supprime tous les caractères non numériques sauf le '+' initial
  const cleaned = trimmed.replace(/[^\d+]/g, "");

  // Cas 1 : Numéro français standard à 10 chiffres (ex: 0614053323)
  if (/^0[1-9]\d{8}$/.test(cleaned)) {
    return cleaned.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5");
  }

  // Cas 2 : Numéro français avec indicatif international +33 (ex: +33614053323)
  if (/^\+33[1-9]\d{8}$/.test(cleaned)) {
    return cleaned.replace(/^\+33([1-9])(\d{2})(\d{2})(\d{2})(\d{2})/, "+33 $1 $2 $3 $4 $5");
  }

  // Cas 3 : Numéro français avec indicatif international et 0 (ex: +330614053323)
  if (/^\+330[1-9]\d{8}$/.test(cleaned)) {
    return cleaned.replace(/^\+330([1-9])(\d{2})(\d{2})(\d{2})(\d{2})/, "+33 (0)$1 $2 $3 $4 $5");
  }

  return trimmed;
}

/**
 * Calcule la largeur d'un nœud (carte) en fonction de la longueur de ses textes.
 * Borne la largeur entre 240px (min) et 380px (max).
 */
export function computeNodeWidth(node: OrgNode, showPhotos: boolean = true): number {
  const name = node.data.name || "";
  const role = node.data.role || "";
  const email = node.data.email || "";
  const phone = formatPhoneNumber(node.data.phone || "");

  // Estimation du poids par caractère :
  // - Nom (gras, ~12px) : ~7.5px par caractère
  // - Rôle (~10px) : ~6.2px par caractère
  // - Email/Téléphone (sans-serif, ~10px) : ~5.8px par caractère + 22px pour l'icône et son espacement
  const nameWidth = name.length * 7.5;
  const roleWidth = role.length * 6.2;
  const emailWidth = email ? email.length * 5.8 + 22 : 0;
  const phoneWidth = phone ? phone.length * 5.8 + 22 : 0;

  const maxTextWidth = Math.max(nameWidth, roleWidth, emailWidth, phoneWidth);

  // Largeur totale = paddings (px-5 = 20px de chaque côté, soit 40px) 
  // + espace pour photo si activé (40px de largeur + 12px de gap = 52px)
  const baseSpacing = 40 + (showPhotos ? 52 : 0);
  const estimatedWidth = maxTextWidth + baseSpacing;

  return Math.max(240, Math.min(380, Math.round(estimatedWidth)));
}
