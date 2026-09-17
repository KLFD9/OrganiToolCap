import type { Node } from "@xyflow/react";
import { captureFlow, fitContain, loadLogoForExport } from "./pdfExport";
import { CHROME_HEADER_MM, resolveChromeTextStyle } from "./chromeLayout";
import type { ChromeLayout, PageElement } from "../types/orgchart";
import { pageSizeMm, type PageSetup } from "./readability";

/**
 * Export PowerPoint (.pptx) : une diapositive 16:9 contenant l'organigramme
 * en image haute résolution, avec en-tête (logos, titre, sous-titre) et pied
 * de page éditables ensuite dans PowerPoint. Généré 100 % côté client.
 */

export interface PptxExportOptions {
  title?: string;
  subtitle?: string;
  footer?: string;
  logoUrl?: string;
  secondaryLogoUrl?: string;
  /** Couleur d'accent du thème, utilisée pour le titre (hex avec ou sans #). */
  accent?: string;
  /** Mise en forme des textes de page ; les positions papier ne sont pas transposées au format 16:9. */
  chromeLayout?: ChromeLayout;
}

// Dimensions d'une diapositive 16:9 en pouces (layout pptxgenjs LAYOUT_WIDE)
export const SLIDE_WIDTH_IN = 13.333;
export const SLIDE_HEIGHT_IN = 7.5;
const MARGIN_IN = 0.4;
const HEADER_HEIGHT_IN = 0.8;
const FOOTER_HEIGHT_IN = 0.3;
const PPTX_DPI_SCALE = 2.5;

export interface SlideArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Zone utile de la diapositive pour l'image, selon la présence d'en-tête et de pied de page. */
export function computeSlideContentArea(hasHeader: boolean, hasFooter: boolean): SlideArea {
  const top = hasHeader ? MARGIN_IN + HEADER_HEIGHT_IN + 0.15 : MARGIN_IN;
  const bottom = hasFooter ? MARGIN_IN + FOOTER_HEIGHT_IN : MARGIN_IN;
  return {
    x: MARGIN_IN,
    y: top,
    width: SLIDE_WIDTH_IN - MARGIN_IN * 2,
    height: SLIDE_HEIGHT_IN - top - bottom,
  };
}

export function pptxColor(hex: string | undefined, fallback: string): string {
  const value = (hex ?? fallback).replace("#", "");
  return /^[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

export function safePptxFileName(title: string | undefined): string {
  return `${(title || "organigramme").replace(/[^a-z0-9-_]+/gi, "-")}.pptx`;
}

/** Nom de l'entrée embarquée dans le zip .pptx pour le round-trip parfait. */
export const EMBEDDED_CHART_PATH = "orgchart.json";

type Slide = ReturnType<InstanceType<typeof import("pptxgenjs").default>["addSlide"]>;

/** Dessine l'en-tête (logos, titre, sous-titre) et le pied de page sur la diapositive. */
export async function addSlideChrome(slide: Slide, options: PptxExportOptions): Promise<void> {
  if (options.logoUrl) {
    try {
      const logo = await loadLogoForExport(options.logoUrl);
      const element = options.chromeLayout?.logo;
      const h = element ? HEADER_HEIGHT_IN * (element.size / CHROME_HEADER_MM) : HEADER_HEIGHT_IN;
      const boxW =
        element?.width && element.size > 0
          ? (element.width / element.size) * h
          : (logo.width / logo.height) * h;
      const placement = fitContain(logo.width, logo.height, MARGIN_IN, MARGIN_IN, boxW, h);
      slide.addImage({
        data: logo.dataUrl,
        x: placement.x,
        y: placement.y,
        w: placement.width,
        h: placement.height,
      });
    } catch {
      // logo illisible : on ignore silencieusement, comme pour le PDF
    }
  }
  if (options.secondaryLogoUrl) {
    try {
      const logo = await loadLogoForExport(options.secondaryLogoUrl);
      const element = options.chromeLayout?.secondaryLogo;
      const h = element ? HEADER_HEIGHT_IN * (element.size / CHROME_HEADER_MM) : HEADER_HEIGHT_IN;
      const boxW =
        element?.width && element.size > 0
          ? (element.width / element.size) * h
          : (logo.width / logo.height) * h;
      const placement = fitContain(
        logo.width,
        logo.height,
        SLIDE_WIDTH_IN - MARGIN_IN - boxW,
        MARGIN_IN,
        boxW,
        h
      );
      slide.addImage({
        data: logo.dataUrl,
        x: placement.x,
        y: placement.y,
        w: placement.width,
        h: placement.height,
      });
    } catch {
      // logo illisible : on ignore silencieusement
    }
  }

  if (options.title) {
    const style = resolveChromeTextStyle("title", options.chromeLayout?.title);
    slide.addText(options.title, {
      x: SLIDE_WIDTH_IN / 4,
      y: MARGIN_IN,
      w: SLIDE_WIDTH_IN / 2,
      h: options.subtitle ? HEADER_HEIGHT_IN * 0.6 : HEADER_HEIGHT_IN,
      align: "center",
      valign: "middle",
      fontSize: 20,
      bold: style.bold,
      italic: style.italic,
      color: options.chromeLayout?.title?.color
        ? pptxColor(style.color, "1F1F1F")
        : pptxColor(options.accent, "1F1F1F"),
    });
  }
  if (options.subtitle) {
    const style = resolveChromeTextStyle("subtitle", options.chromeLayout?.subtitle);
    slide.addText(options.subtitle, {
      x: SLIDE_WIDTH_IN / 4,
      y: MARGIN_IN + HEADER_HEIGHT_IN * 0.55,
      w: SLIDE_WIDTH_IN / 2,
      h: HEADER_HEIGHT_IN * 0.45,
      align: "center",
      valign: "middle",
      fontSize: 11,
      bold: style.bold,
      italic: style.italic,
      color: pptxColor(style.color, "777777"),
    });
  }

  if (options.footer) {
    const style = resolveChromeTextStyle("footer", options.chromeLayout?.footer);
    slide.addText(options.footer, {
      x: MARGIN_IN,
      y: SLIDE_HEIGHT_IN - MARGIN_IN - FOOTER_HEIGHT_IN,
      w: SLIDE_WIDTH_IN - MARGIN_IN * 2,
      h: FOOTER_HEIGHT_IN,
      align: "center",
      valign: "middle",
      fontSize: 9,
      bold: style.bold,
      italic: style.italic,
      color: pptxColor(style.color, "888888"),
    });
  }
}

/**
 * Ajoute les éléments libres d'une feuille à la diapositive. La projection est
 * proportionnelle à la page : le fichier .orgchart.json embarqué reste la
 * source exacte pour le round-trip, tandis que la diapositive reste éditable.
 */
export async function addSlidePageElements(slide: Slide, elements: PageElement[] | undefined, page: PageSetup): Promise<void> {
  const paper = pageSizeMm(page.format, page.orientation);
  const x = (mm: number) => (mm / paper.width) * SLIDE_WIDTH_IN;
  const y = (mm: number) => (mm / paper.height) * SLIDE_HEIGHT_IN;
  for (const element of elements ?? []) {
    if (element.type === "text") {
      slide.addText(element.value, {
        x: x(element.x), y: y(element.y), w: x(element.width), h: y(element.height),
        fontSize: (element.fontSize ?? 12) * 0.75,
        bold: element.bold ?? false, italic: element.italic ?? false,
        color: pptxColor(element.color, "27272A"), margin: 0,
        breakLine: false,
      });
      continue;
    }
    try {
      const image = await loadLogoForExport(element.value);
      const placement = fitContain(image.width, image.height, x(element.x), y(element.y), x(element.width), y(element.height));
      slide.addImage({ data: image.dataUrl, x: placement.x, y: placement.y, w: placement.width, h: placement.height });
    } catch {
      // Même tolérance que les logos du chrome.
    }
  }
}

/**
 * Finalise le .pptx en y embarquant le fichier .orgchart.json : réimporter ce
 * PowerPoint dans l'application restaure le projet à l'identique.
 */
export async function savePptxWithChart(
  pptx: InstanceType<typeof import("pptxgenjs").default>,
  chartJson: string | undefined,
  fileName: string
): Promise<void> {
  if (!chartJson) {
    await pptx.writeFile({ fileName });
    return;
  }
  const buffer = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  zip.file(EMBEDDED_CHART_PATH, chartJson);
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportFlowToPptx(
  viewportEl: HTMLElement,
  nodes: Node[],
  options: PptxExportOptions,
  /** Contenu .orgchart.json embarqué dans le fichier pour le round-trip. */
  chartJson?: string
): Promise<void> {
  const capture = await captureFlow(viewportEl, nodes, "png", PPTX_DPI_SCALE);

  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = options.title ?? "Organigramme";
  if (options.subtitle) pptx.subject = options.subtitle;

  const slide = pptx.addSlide();
  const hasHeader = Boolean(options.title || options.logoUrl || options.secondaryLogoUrl);
  const hasFooter = Boolean(options.footer);

  await addSlideChrome(slide, options);

  const area = computeSlideContentArea(hasHeader, hasFooter);
  const placement = fitContain(capture.pixelWidth, capture.pixelHeight, area.x, area.y, area.width, area.height);
  slide.addImage({
    data: capture.dataUrl,
    x: placement.x,
    y: placement.y,
    w: placement.width,
    h: placement.height,
  });

  await savePptxWithChart(pptx, chartJson, safePptxFileName(options.title));
}
