import type { jsPDF } from "jspdf";
import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";
import { resolveChromeElement, textHeightMm } from "./chromeLayout";
import type { ChromeElement, ChromeLayout } from "../types/orgchart";
import type { PageSetup } from "./readability";

// html-to-image et jspdf ne servent qu'à l'export : chargés à la demande
// pour alléger le bundle initial.
let htmlToImagePromise: Promise<typeof import("html-to-image")> | undefined;
const importHtmlToImage = () => import("html-to-image");
const loadHtmlToImage = () => (htmlToImagePromise ??= importHtmlToImage());
const loadJsPdf = () => import("jspdf");

export type PdfFormat = "a4" | "a3" | "a2";
export type PdfOrientation = "portrait" | "landscape";

export interface PdfExportOptions {
  format: PdfFormat;
  orientation: PdfOrientation;
  margin: number; // mm
  title?: string;
  subtitle?: string;
  footer?: string;
  logoUrl?: string;
  secondaryLogoUrl?: string;
  /** Si vrai, répartit l'organigramme sur plusieurs pages (grand format / affiche). Sinon, ajustement dynamique sur une seule page. */
  multiPage?: boolean;
  /** Positions/tailles personnalisées de l'en-tête et du pied de page (WYSIWYG canvas ↔ export). */
  chromeLayout?: ChromeLayout;
}

const PNG_DPI_SCALE = 2.5;
const PDF_DPI_SCALE = 3; // jsPDF n'embarque pas le SVG (pas de plugin svg2pdf) : on rasterise en haute densité
const CONTENT_PADDING_RATIO = 0.06; // marge proportionnelle autour de l'organigramme

// Garde-fous navigateur : au-delà, `canvas.toDataURL` renvoie une image vide (blanche).
// WebKit/Safari plafonne l'aire d'un canvas à 16 777 216 px² et chaque côté à ~8192 px.
const MAX_CANVAS_AREA = 14_000_000; // marge de sécurité sous la limite WebKit
const MAX_CANVAS_SIDE = 8192;

/** Densité (px image / mm de page) ciblée pour le découpage multi-pages. */
export const PDF_TILE_PX_PER_MM = 4;

export interface PdfTileGrid {
  cols: number;
  rows: number;
  tileWidthPx: number;
  tileHeightPx: number;
}

export interface PdfTile {
  row: number;
  col: number;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

/**
 * Calcule le plus grand `pixelRatio` réalisable sans dépasser les limites de canvas du
 * navigateur (aire maximale et côté maximal), borné par la densité souhaitée. Évite
 * les exports vides (image blanche) sur les grands organigrammes.
 */
export function safePixelRatio(width: number, height: number, desired: number): number {
  if (width <= 0 || height <= 0) return desired;

  // Borne par côté maximal
  const sideLimited = Math.min(desired, MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height);
  // Borne par aire maximale
  const areaLimited = Math.sqrt(MAX_CANVAS_AREA / (width * height));

  const ratio = Math.min(sideLimited, areaLimited, desired);
  // On autorise un ratio < 1 pour les très grands graphes, avec un plancher raisonnable.
  return Math.max(0.3, ratio);
}

/**
 * Détermine le nombre de colonnes/lignes de pages nécessaires pour imprimer un contenu
 * de `contentWidth` x `contentHeight` px CSS sans descendre sous la densité `pxPerMm`
 * sur une page dont la zone utile mesure `pageAvailWidthMm` x `pageAvailHeightMm`.
 */
export function computeMultiPageGrid(
  contentWidth: number,
  contentHeight: number,
  pageAvailWidthMm: number,
  pageAvailHeightMm: number,
  pxPerMm = PDF_TILE_PX_PER_MM
): PdfTileGrid {
  const tileWidthPx = pageAvailWidthMm * pxPerMm;
  const tileHeightPx = pageAvailHeightMm * pxPerMm;
  const cols = Math.max(1, Math.ceil(contentWidth / tileWidthPx));
  const rows = Math.max(1, Math.ceil(contentHeight / tileHeightPx));
  return { cols, rows, tileWidthPx, tileHeightPx };
}

/** Découpe une image de `imageWidth` x `imageHeight` px en une grille `cols` x `rows` de tuiles égales. */
export function computePdfTiles(imageWidth: number, imageHeight: number, cols: number, rows: number): PdfTile[] {
  const tileWidth = imageWidth / cols;
  const tileHeight = imageHeight / rows;
  const tiles: PdfTile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({
        row,
        col,
        sx: col * tileWidth,
        sy: row * tileHeight,
        sWidth: tileWidth,
        sHeight: tileHeight,
      });
    }
  }
  return tiles;
}

/**
 * Calcule le placement (mm) d'une image dans une zone, en préservant le ratio d'aspect
 * et en centrant. Renvoie les coordonnées et dimensions pour `pdf.addImage`.
 */
export function fitContain(
  imageWidth: number,
  imageHeight: number,
  areaX: number,
  areaY: number,
  areaWidth: number,
  areaHeight: number
): { x: number; y: number; width: number; height: number } {
  const ratio = Math.min(areaWidth / imageWidth, areaHeight / imageHeight);
  const width = imageWidth * ratio;
  const height = imageHeight * ratio;
  return {
    x: areaX + (areaWidth - width) / 2,
    y: areaY + (areaHeight - height) / 2,
    width,
    height,
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function cropToDataUrl(img: HTMLImageElement, tile: PdfTile): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(tile.sWidth);
  canvas.height = Math.round(tile.sHeight);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, tile.sx, tile.sy, tile.sWidth, tile.sHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

// L'analyse des @font-face et leur conversion en data-URI est l'une des
// opérations les plus coûteuses de html-to-image. Les polices de l'éditeur
// sont bundlées et immuables pendant la session : un seul résultat suffit
// pour toutes les pages d'un export.
let fontEmbedCssPromise: Promise<string | undefined> | undefined;

async function getCachedFontEmbedCss(viewportEl: HTMLElement): Promise<string | undefined> {
  if (!fontEmbedCssPromise) {
    fontEmbedCssPromise = loadHtmlToImage()
      .then(({ getFontEmbedCSS }) => getFontEmbedCSS(viewportEl, { cacheBust: false }))
      .catch(() => undefined);
  }
  return fontEmbedCssPromise;
}

export interface CaptureResult {
  dataUrl: string;
  /** Dimensions du contenu en px CSS (avant `pixelRatio`). */
  width: number;
  height: number;
  /** Dimensions réelles de l'image rasterisée en px. */
  pixelWidth: number;
  pixelHeight: number;
}

/**
 * Recadre temporairement le viewport React Flow pour que tous les nœuds tiennent dans la
 * capture, attend le chargement des polices/images, rasterise, puis restaure l'état d'origine.
 */
export async function captureFlow(
  viewportEl: HTMLElement,
  nodes: Node[],
  type: "svg" | "png" | "jpeg",
  desiredRatio: number,
  capture?: { transparent?: boolean }
): Promise<CaptureResult> {
  const bounds = getNodesBounds(nodes);
  const width = Math.max(1, Math.ceil(bounds.width * (1 + CONTENT_PADDING_RATIO * 2)));
  const height = Math.max(1, Math.ceil(bounds.height * (1 + CONTENT_PADDING_RATIO * 2)));
  const viewport = getViewportForBounds(bounds, width, height, 0.1, 2, CONTENT_PADDING_RATIO);

  const pixelRatio = type === "svg" ? 1 : safePixelRatio(width, height, desiredRatio);

  // Garantit que les polices web sont prêtes : sinon le rendu utilise une police de
  // secours (largeurs différentes) et le résultat n'est pas fidèle à l'écran.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore : on capture quand même
    }
  }

  const prevTransform = viewportEl.style.transform;
  const prevWidth = viewportEl.style.width;
  const prevHeight = viewportEl.style.height;

  viewportEl.style.width = `${width}px`;
  viewportEl.style.height = `${height}px`;
  viewportEl.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;

  await nextFrame();

  try {
    // Le JPEG ne gère pas la transparence : fond blanc imposé.
    const transparent = Boolean(capture?.transparent) && type !== "jpeg";
    const fontEmbedCSS = type === "svg" ? undefined : await getCachedFontEmbedCss(viewportEl);
    const options = {
      backgroundColor: transparent ? undefined : "#ffffff",
      pixelRatio,
      width,
      height,
      quality: 0.95,
      // Les assets sont locaux ou en data-URI. Forcer un cache-bust à chaque
      // frame multipliait les lectures et l'encodage des polices/logos.
      cacheBust: false,
      fontEmbedCSS,
    };

    const { toSvg, toPng, toJpeg } = await loadHtmlToImage();
    const render = () =>
      type === "svg"
        ? toSvg(viewportEl, options)
        : type === "jpeg"
        ? toJpeg(viewportEl, options)
        : toPng(viewportEl, options);

    const dataUrl = await render();

    return {
      dataUrl,
      width,
      height,
      pixelWidth: Math.round(width * pixelRatio),
      pixelHeight: Math.round(height * pixelRatio),
    };
  } finally {
    viewportEl.style.transform = prevTransform;
    viewportEl.style.width = prevWidth;
    viewportEl.style.height = prevHeight;
  }
}

/**
 * Prépare un logo pour insertion dans un document Office (PDF / PPTX).
 * jsPDF et PowerPoint ne savent pas insérer de SVG et jsPDF convertit les PNG
 * en une chaîne binaire en mémoire. Tous les logos sont donc normalisés vers
 * un PNG borné : qualité suffisante à la taille d'un en-tête, sans risque de
 * `RangeError: Invalid string length` sur une photo/logo source démesuré.
 */
type ExportLogo = { dataUrl: string; width: number; height: number };
const logoExportCache = new Map<string, Promise<ExportLogo>>();
const MAX_EXPORT_LOGO_SIDE = 512;

export function fitExportLogoDimensions(
  width: number,
  height: number,
  upscale: boolean
): { width: number; height: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const ratio = upscale
    ? MAX_EXPORT_LOGO_SIDE / Math.max(safeWidth, safeHeight)
    : Math.min(1, MAX_EXPORT_LOGO_SIDE / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  };
}

async function decodeLogoForExport(url: string): Promise<ExportLogo> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });

  // Certains SVG sans attributs width/height ont des dimensions naturelles nulles
  const width = img.naturalWidth || img.width || 256;
  const height = img.naturalHeight || img.height || 256;

  const isSvg = url.startsWith("data:image/svg") || /\.svg($|\?)/i.test(url);
  const fitted = fitExportLogoDimensions(width, height, isSvg);
  const canvas = document.createElement("canvas");
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible pour préparer le logo.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

export function loadLogoForExport(url: string): Promise<ExportLogo> {
  const cached = logoExportCache.get(url);
  if (cached) return cached;
  const pending = decodeLogoForExport(url).catch((error) => {
    // Une erreur transitoire ne doit pas empoisonner les exports suivants.
    logoExportCache.delete(url);
    throw error;
  });
  logoExportCache.set(url, pending);
  return pending;
}

const HEADER_HEIGHT_MM = 16;

/** Calcule les marges hautes/basses occupées par l'en-tête et le pied de page, sans dessiner. */
export function computeChromeOffsets(options: PdfExportOptions, margin: number): { topOffset: number; bottomOffset: number } {
  const hasHeader = Boolean(options.logoUrl || options.secondaryLogoUrl || options.title);
  const hasFooter = Boolean(options.footer || options.multiPage);
  return {
    topOffset: hasHeader ? margin + HEADER_HEIGHT_MM + 4 : margin,
    bottomOffset: hasFooter ? margin + 8 : margin,
  };
}

/** Dessine l'en-tête (logos, titre, sous-titre) et le pied de page sur la page courante du PDF. */
export async function drawPageChrome(
  pdf: jsPDF,
  options: PdfExportOptions,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  pageLabel?: string
): Promise<{ topOffset: number; bottomOffset: number }> {
  const { topOffset, bottomOffset } = computeChromeOffsets(options, margin);
  const page: PageSetup = { format: options.format, orientation: options.orientation, margin };

  // Même résolveur que le canvas (lib/chromeLayout) : la position stockée
  // fait foi, sinon la disposition historique par défaut est reproduite.
  const measureTextMm = (text: string, pt: number) => {
    pdf.setFontSize(pt);
    return pdf.getTextWidth(text);
  };
  // `size` est la taille de police (pt) ; la ligne de base jsPDF se place au
  // bas de la boîte de texte mesurée en mm (cohérent avec le rendu canvas).
  const baselineY = (el: ChromeElement) => el.y + textHeightMm(el.size);

  if (options.logoUrl || options.secondaryLogoUrl || options.title) {
    // Les deux logos sont indépendants : les préparer en parallèle évite de
    // cumuler leurs temps de décodage sur la première page. Les pages
    // suivantes réutilisent les promesses mises en cache.
    const [logo, secondaryLogo] = await Promise.all([
      options.logoUrl ? loadLogoForExport(options.logoUrl).catch(() => undefined) : undefined,
      options.secondaryLogoUrl
        ? loadLogoForExport(options.secondaryLogoUrl).catch(() => undefined)
        : undefined,
    ]);
    if (logo) {
      const el = resolveChromeElement(options.chromeLayout, "logo", page);
      const logoW = (logo.width / logo.height) * el.size;
      try {
        pdf.addImage(logo.dataUrl, "PNG", el.x, el.y, logoW, el.size, "orgchart-logo-primary", "FAST");
      } catch {
        // Un logo illisible ne doit jamais faire échouer tout le document.
      }
    }
    if (secondaryLogo) {
      const el = resolveChromeElement(options.chromeLayout, "secondaryLogo", page, {
        logoAspect: secondaryLogo.width / secondaryLogo.height,
      });
      const logoW = (secondaryLogo.width / secondaryLogo.height) * el.size;
      try {
        pdf.addImage(secondaryLogo.dataUrl, "PNG", el.x, el.y, logoW, el.size, "orgchart-logo-secondary", "FAST");
      } catch {
        // Même garde-fou pour le logo secondaire.
      }
    }
    if (options.title) {
      const el = resolveChromeElement(options.chromeLayout, "title", page, { measureTextMm, text: options.title });
      pdf.setFontSize(el.size);
      pdf.setTextColor(0);
      pdf.text(options.title, el.x, baselineY(el));
    }
    if (options.subtitle) {
      const el = resolveChromeElement(options.chromeLayout, "subtitle", page, {
        measureTextMm,
        text: options.subtitle,
      });
      pdf.setFontSize(el.size);
      pdf.setTextColor(120);
      pdf.text(options.subtitle, el.x, baselineY(el));
      pdf.setTextColor(0);
    }
  }

  if (options.footer || pageLabel) {
    if (options.footer) {
      const el = resolveChromeElement(options.chromeLayout, "footer", page, {
        measureTextMm,
        text: options.footer,
      });
      pdf.setFontSize(el.size);
      pdf.setTextColor(120);
      pdf.text(options.footer, el.x, baselineY(el));
    }
    if (pageLabel) {
      pdf.setFontSize(9);
      pdf.setTextColor(120);
      pdf.text(pageLabel, pageWidth - margin, pageHeight - margin / 2, { align: "right" });
    }
    pdf.setTextColor(0);
  }

  return { topOffset, bottomOffset };
}

export function safeFileName(title: string | undefined, suffix = ""): string {
  return `${(title || "organigramme").replace(/[^a-z0-9-_]+/gi, "-")}${suffix}.pdf`;
}

/**
 * Métadonnées d'accessibilité et d'archivage du document : titre, sujet,
 * créateur et langue (lecteurs d'écran, recherche, GED).
 */
export function applyPdfMetadata(pdf: jsPDF, options: Pick<PdfExportOptions, "title" | "subtitle">): void {
  pdf.setProperties({
    title: options.title || "Organigramme",
    subject: options.subtitle || "Organigramme",
    creator: "OrganiTool CAP",
    author: options.subtitle || options.title || "OrganiTool CAP",
  });
  pdf.setLanguage("fr-FR");
}

/** Exporte les nœuds React Flow (recadrés sur l'ensemble de l'organigramme) en PDF haute résolution. */
export async function exportFlowToPdf(viewportEl: HTMLElement, nodes: Node[], options: PdfExportOptions): Promise<void> {
  const capture = await captureFlow(viewportEl, nodes, "jpeg", PDF_DPI_SCALE);

  const { jsPDF } = await loadJsPdf();
  const pdf = new jsPDF({
    orientation: options.orientation,
    unit: "mm",
    format: options.format,
  });

  applyPdfMetadata(pdf, options);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = options.margin;

  if (options.multiPage) {
    const chrome = computeChromeOffsets(options, margin);
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - chrome.topOffset - chrome.bottomOffset;

    // Le nombre de pages dépend du contenu (px CSS) ; le découpage opère sur l'image rasterisée.
    const grid = computeMultiPageGrid(capture.width, capture.height, availableWidth, availableHeight);

    // Une seule page suffit : on bascule sur l'ajustement dynamique (pas de découpage inutile).
    if (grid.cols === 1 && grid.rows === 1) {
      await drawSinglePage(pdf, options, capture.dataUrl, capture.pixelWidth, capture.pixelHeight, pageWidth, pageHeight, margin);
      pdf.save(safeFileName(options.title));
      return;
    }

    const tiles = computePdfTiles(capture.pixelWidth, capture.pixelHeight, grid.cols, grid.rows);
    const img = await loadImage(capture.dataUrl);

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (i > 0) pdf.addPage(options.format, options.orientation);

      const label = `Page ${i + 1}/${tiles.length} · col ${tile.col + 1}, ligne ${tile.row + 1}`;
      const { topOffset, bottomOffset } = await drawPageChrome(pdf, options, pageWidth, pageHeight, margin, label);
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - topOffset - bottomOffset;

      const tileDataUrl = cropToDataUrl(img, tile);
      const placement = fitContain(tile.sWidth, tile.sHeight, margin, topOffset, usableWidth, usableHeight);
      pdf.addImage(tileDataUrl, "JPEG", placement.x, placement.y, placement.width, placement.height);
    }

    pdf.save(safeFileName(options.title, "-multipages"));
    return;
  }

  await drawSinglePage(pdf, options, capture.dataUrl, capture.pixelWidth, capture.pixelHeight, pageWidth, pageHeight, margin);
  pdf.save(safeFileName(options.title));
}

/** Dessine l'organigramme entier, ajusté dynamiquement, sur une page unique. */
async function drawSinglePage(
  pdf: jsPDF,
  options: PdfExportOptions,
  dataUrl: string,
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number,
  margin: number
): Promise<void> {
  const { topOffset, bottomOffset } = await drawPageChrome(pdf, options, pageWidth, pageHeight, margin);
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - topOffset - bottomOffset;
  const placement = fitContain(imageWidth, imageHeight, margin, topOffset, availableWidth, availableHeight);
  pdf.addImage(dataUrl, "JPEG", placement.x, placement.y, placement.width, placement.height);
}

/** Page d'un export PDF image multi-pages : chrome + nœuds React Flow à capturer. */
export interface FrameImagePage {
  format: PdfFormat;
  orientation: PdfOrientation;
  margin: number;
  name: string;
  title?: string;
  subtitle?: string;
  chromeLayout?: ChromeLayout;
  /** Nœuds React Flow (cartes membres de la page) à capturer. */
  rfNodes: Node[];
}

export type ExportProgressCallback = (currentPage: number, totalPages: number) => void;

/**
 * Export PDF image multi-pages : une page par frame, chacune capturée en haute
 * résolution et ajustée dans la zone utile de son format papier.
 */
export async function exportFramesToPdfImage(
  viewportEl: HTMLElement,
  pages: FrameImagePage[],
  common: { docTitle?: string; docSubtitle?: string; footer?: string; logoUrl?: string; secondaryLogoUrl?: string },
  onProgress?: ExportProgressCallback
): Promise<void> {
  if (pages.length === 0) return;
  const { jsPDF } = await loadJsPdf();
  const pdf = new jsPDF({ orientation: pages[0].orientation, unit: "mm", format: pages[0].format });
  applyPdfMetadata(pdf, { title: common.docTitle, subtitle: common.docSubtitle });

  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i + 1, pages.length);
    const page = pages[i];
    if (i > 0) pdf.addPage(page.format, page.orientation);

    const options: PdfExportOptions = {
      format: page.format,
      orientation: page.orientation,
      margin: page.margin,
      title: page.title,
      subtitle: page.subtitle,
      footer: common.footer,
      logoUrl: common.logoUrl,
      secondaryLogoUrl: common.secondaryLogoUrl,
      chromeLayout: page.chromeLayout,
    };
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const label = pages.length > 1 ? `${page.name} · ${i + 1}/${pages.length}` : undefined;
    const { topOffset, bottomOffset } = await drawPageChrome(pdf, options, pageWidth, pageHeight, page.margin, label);

    if (page.rfNodes.length === 0) continue; // page vide : chrome seul

    const capture = await captureFlow(viewportEl, page.rfNodes, "jpeg", PDF_DPI_SCALE);
    const availableWidth = pageWidth - page.margin * 2;
    const availableHeight = pageHeight - topOffset - bottomOffset;
    const placement = fitContain(
      capture.pixelWidth,
      capture.pixelHeight,
      page.margin,
      topOffset,
      availableWidth,
      availableHeight
    );
    pdf.addImage(capture.dataUrl, "JPEG", placement.x, placement.y, placement.width, placement.height);
  }

  pdf.save(safeFileName(common.docTitle, pages.length > 1 ? "-pages" : ""));
}

/** Export PNG haute résolution, recadré sur l'ensemble de l'organigramme. */
export async function exportFlowToPng(
  viewportEl: HTMLElement,
  nodes: Node[],
  filename = "organigramme.png",
  options?: { transparent?: boolean }
): Promise<void> {
  const { dataUrl } = await captureFlow(viewportEl, nodes, "png", PNG_DPI_SCALE, options);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/**
 * Copie l'organigramme en PNG dans le presse-papiers (collage direct dans
 * PowerPoint, Teams, un e-mail…). Nécessite un contexte sécurisé (https ou localhost).
 */
export async function copyFlowToClipboard(viewportEl: HTMLElement, nodes: Node[]): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("Le presse-papiers n'est pas disponible dans ce navigateur ou ce contexte.");
  }
  const { dataUrl } = await captureFlow(viewportEl, nodes, "png", 2);
  const blob = await (await fetch(dataUrl)).blob();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Export SVG, recadré sur l'ensemble de l'organigramme. */
export async function exportFlowToSvg(
  viewportEl: HTMLElement,
  nodes: Node[],
  filename = "organigramme.svg",
  options?: { transparent?: boolean }
): Promise<void> {
  const { dataUrl } = await captureFlow(viewportEl, nodes, "svg", 1, options);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
