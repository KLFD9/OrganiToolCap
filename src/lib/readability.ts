import { computeChromeOffsets, type PdfFormat, type PdfOrientation } from "./pdfExport";

/**
 * Estimation de la lisibilité du document exporté AVANT génération.
 *
 * Quand l'organigramme est ajusté pour tenir sur une page (fit-contain),
 * tout est mis à l'échelle — y compris le texte. On calcule ici la taille
 * réelle (en points typographiques) qu'aura le nom des cartes une fois
 * imprimé, pour avertir l'utilisateur et lui proposer des solutions
 * (disposition compacte, A3, multi-pages) plutôt que de le laisser
 * découvrir un PDF illisible.
 */

/** Taille en px CSS du nom sur une carte (text-xs de NodeCard). */
export const NAME_FONT_PX = 12;
export const PT_PER_MM = 72 / 25.4;

/** En dessous : illisible à l'impression. Au-dessus de `GOOD` : confortable. */
export const READABLE_PT_GOOD = 6.5;
export const READABLE_PT_LIMIT = 4.5;

const PAGE_SIZES_MM: Record<PdfFormat, [number, number]> = {
  a4: [210, 297],
  a3: [297, 420],
};

export type ReadabilityRating = "good" | "warn" | "bad";

/** Dimensions totales de la page en mm, orientation appliquée. */
export function pageSizeMm(format: PdfFormat, orientation: PdfOrientation): { width: number; height: number } {
  const [shortSide, longSide] = PAGE_SIZES_MM[format];
  return orientation === "landscape"
    ? { width: longSide, height: shortSide }
    : { width: shortSide, height: longSide };
}

export interface ReadabilityEstimate {
  /** Taille du nom des cartes sur le papier, en points typographiques. */
  fontPt: number;
  rating: ReadabilityRating;
  /** Largeur d'une carte sur le papier, en mm. */
  cardWidthMm: number;
}

/**
 * Zone utile de la page en mm. `topOffsetMm` / `bottomOffsetMm` sont les
 * offsets complets calculés par `computeChromeOffsets` (marge + en-tête/pied).
 */
export function pageAvailableArea(
  format: PdfFormat,
  orientation: PdfOrientation,
  sideMarginMm: number,
  topOffsetMm: number,
  bottomOffsetMm: number
): { width: number; height: number } {
  const [shortSide, longSide] = PAGE_SIZES_MM[format];
  const pageW = orientation === "landscape" ? longSide : shortSide;
  const pageH = orientation === "landscape" ? shortSide : longSide;
  return {
    width: Math.max(1, pageW - sideMarginMm * 2),
    height: Math.max(1, pageH - topOffsetMm - bottomOffsetMm),
  };
}

/**
 * Estime la taille du texte imprimé pour un contenu de `contentWidthPx` x
 * `contentHeightPx` (px CSS, cartes de 240 px) ajusté dans la zone
 * `availWidthMm` x `availHeightMm`.
 */
/** Format de page cible du document (cadre de page, rangement auto, export). */
export interface PageSetup {
  format: PdfFormat;
  orientation: PdfOrientation;
  margin: number;
}

export const DEFAULT_PAGE: PageSetup = { format: "a4", orientation: "landscape", margin: 10 };

/**
 * Échelle (mm de papier par px de canvas) au seuil « confortable » : un
 * contenu qui tient dans la zone utile dessinée à cette échelle imprimera
 * son texte à READABLE_PT_GOOD minimum une fois ajusté à la page.
 */
export const COMFORT_MM_PER_PX = READABLE_PT_GOOD / (NAME_FONT_PX * PT_PER_MM);

export interface PageChrome {
  title?: string;
  footer?: string;
  logoUrl?: string;
  secondaryLogoUrl?: string;
}

/** Offsets haut/bas (mm) occupés par marges + en-tête/pied pour un format configuré. */
export function chromeOffsetsForSetup(
  page: PageSetup,
  chrome: PageChrome
): { topOffset: number; bottomOffset: number } {
  return computeChromeOffsets(
    { format: page.format, orientation: page.orientation, margin: page.margin, ...chrome },
    page.margin
  );
}

/**
 * Zone utile (mm) pour un format de page configuré, en-tête / pied déduits
 * selon les métadonnées du document (mêmes règles que l'export PDF).
 */
export function availableAreaForSetup(page: PageSetup, chrome: PageChrome): { width: number; height: number } {
  const offsets = chromeOffsetsForSetup(page, chrome);
  return pageAvailableArea(page.format, page.orientation, page.margin, offsets.topOffset, offsets.bottomOffset);
}

export function estimateReadability(
  contentWidthPx: number,
  contentHeightPx: number,
  availWidthMm: number,
  availHeightMm: number
): ReadabilityEstimate {
  const mmPerPx = Math.min(availWidthMm / Math.max(1, contentWidthPx), availHeightMm / Math.max(1, contentHeightPx));
  const fontPt = NAME_FONT_PX * mmPerPx * PT_PER_MM;
  const rating: ReadabilityRating =
    fontPt >= READABLE_PT_GOOD ? "good" : fontPt >= READABLE_PT_LIMIT ? "warn" : "bad";
  return {
    fontPt: Math.round(fontPt * 10) / 10,
    rating,
    cardWidthMm: Math.round(240 * mmPerPx),
  };
}
