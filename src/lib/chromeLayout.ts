import type { ChromeElement, ChromeKey, ChromeLayout } from "../types/orgchart";
import { pageSizeMm, PT_PER_MM, type PageSetup } from "./readability";

/**
 * Résolveur unique des positions d'en-tête/pied de page (titre, sous-titre,
 * logos, footer) sur la feuille. Utilisé par le canvas (aperçu manipulable)
 * ET par les exports PDF : toute divergence visuelle entre les deux est un
 * bug. Position stockée dans le fichier ?? défaut historique (titre centré,
 * logos aux coins de la bande d'en-tête, footer centré en bas).
 */

/** Hauteur de la bande d'en-tête historique (voir pdfExport). */
export const CHROME_HEADER_MM = 16;

/** Interligne des éléments de texte du chrome — canvas (ChromeElement) et calcul de boîte (Canvas). */
export const CHROME_TEXT_LINE_HEIGHT = 1.2;

/**
 * Pile de polices des textes de chrome à l'écran ET pour la mesure de largeur :
 * alignée sur l'Helvetica du PDF (jsPDF) pour que centrage par défaut et boîtes
 * de sélection correspondent au rendu imprimé.
 */
export const CHROME_TEXT_FONT_FAMILY = "Helvetica, Arial, sans-serif";

/** Tailles par défaut : pt pour les textes, mm de hauteur pour les logos. */
export const CHROME_DEFAULT_SIZE: Record<ChromeKey, number> = {
  title: 14,
  subtitle: 10,
  logo: CHROME_HEADER_MM,
  secondaryLogo: CHROME_HEADER_MM,
  footer: 9,
};

export const CHROME_TEXT_KEYS: ChromeKey[] = ["title", "subtitle", "footer"];

export interface ResolvedChromeTextStyle {
  bold: boolean;
  italic: boolean;
  color: string;
}

/**
 * Style effectif d'un texte de page. Le titre conserve une hiérarchie forte
 * par défaut ; les textes secondaires restent plus discrets. Une couleur
 * personnalisée fait foi sur le canvas comme dans les exports.
 */
export function resolveChromeTextStyle(
  key: ChromeKey,
  element: ChromeElement | undefined,
  dark = false
): ResolvedChromeTextStyle {
  const isTitle = key === "title";
  return {
    bold: element?.bold ?? isTitle,
    italic: element?.italic ?? false,
    color:
      element?.color ??
      (dark ? (isTitle ? "#f4f4f5" : "#a1a1aa") : isTitle ? "#27272a" : "#71717a"),
  };
}

/** Variante de police commune aux moteurs canvas/PDF. */
export function chromeFontStyle(style: Pick<ResolvedChromeTextStyle, "bold" | "italic">) {
  if (style.bold && style.italic) return "bolditalic" as const;
  if (style.bold) return "bold" as const;
  if (style.italic) return "italic" as const;
  return "normal" as const;
}

export function isChromeTextKey(key: ChromeKey): boolean {
  return key === "title" || key === "subtitle" || key === "footer";
}

/** Hauteur approximative (mm) d'une ligne de texte à `pt` points. */
export function textHeightMm(pt: number): number {
  return pt / PT_PER_MM;
}

/**
 * Position par défaut d'un élément, reproduisant la disposition historique
 * de l'export. `measureTextMm` mesure la largeur du libellé (mm) pour les
 * éléments centrés ; `logoAspect` = largeur/hauteur du logo concerné.
 */
export function defaultChromeElement(
  key: ChromeKey,
  page: PageSetup,
  options: { measureTextMm?: (text: string, pt: number) => number; text?: string; logoAspect?: number } = {}
): ChromeElement {
  const { width: pageW, height: pageH } = pageSizeMm(page.format, page.orientation);
  const m = page.margin;
  const size = CHROME_DEFAULT_SIZE[key];
  const centeredX = (pt: number) => {
    const textW = options.measureTextMm && options.text ? options.measureTextMm(options.text, pt) : 0;
    return pageW / 2 - textW / 2;
  };

  switch (key) {
    case "title":
      return { x: centeredX(size), y: m + (CHROME_HEADER_MM - textHeightMm(size)) / 2 - 1.2, size };
    case "subtitle":
      return { x: centeredX(size), y: m + CHROME_HEADER_MM / 2 + 2, size };
    case "logo":
      return { x: m, y: m, size };
    case "secondaryLogo":
      return { x: pageW - m - size * (options.logoAspect ?? 1), y: m, size };
    case "footer":
      return { x: centeredX(size), y: pageH - m / 2 - textHeightMm(size), size };
  }
}

/** Position effective : stockée dans le fichier, sinon défaut historique. */
export function resolveChromeElement(
  layout: ChromeLayout | undefined,
  key: ChromeKey,
  page: PageSetup,
  options?: { measureTextMm?: (text: string, pt: number) => number; text?: string; logoAspect?: number }
): ChromeElement {
  return layout?.[key] ?? defaultChromeElement(key, page, options);
}
