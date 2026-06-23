import type { Node } from "@xyflow/react";
import { captureFlow, fitContain, loadLogoForExport } from "./pdfExport";

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
      const w = (logo.width / logo.height) * HEADER_HEIGHT_IN;
      slide.addImage({ data: logo.dataUrl, x: MARGIN_IN, y: MARGIN_IN, w, h: HEADER_HEIGHT_IN });
    } catch {
      // logo illisible : on ignore silencieusement, comme pour le PDF
    }
  }
  if (options.secondaryLogoUrl) {
    try {
      const logo = await loadLogoForExport(options.secondaryLogoUrl);
      const w = (logo.width / logo.height) * HEADER_HEIGHT_IN;
      slide.addImage({
        data: logo.dataUrl,
        x: SLIDE_WIDTH_IN - MARGIN_IN - w,
        y: MARGIN_IN,
        w,
        h: HEADER_HEIGHT_IN,
      });
    } catch {
      // logo illisible : on ignore silencieusement
    }
  }

  if (options.title) {
    slide.addText(options.title, {
      x: SLIDE_WIDTH_IN / 4,
      y: MARGIN_IN,
      w: SLIDE_WIDTH_IN / 2,
      h: options.subtitle ? HEADER_HEIGHT_IN * 0.6 : HEADER_HEIGHT_IN,
      align: "center",
      valign: "middle",
      fontSize: 20,
      bold: true,
      color: pptxColor(options.accent, "1F1F1F"),
    });
  }
  if (options.subtitle) {
    slide.addText(options.subtitle, {
      x: SLIDE_WIDTH_IN / 4,
      y: MARGIN_IN + HEADER_HEIGHT_IN * 0.55,
      w: SLIDE_WIDTH_IN / 2,
      h: HEADER_HEIGHT_IN * 0.45,
      align: "center",
      valign: "middle",
      fontSize: 11,
      color: "777777",
    });
  }

  if (options.footer) {
    slide.addText(options.footer, {
      x: MARGIN_IN,
      y: SLIDE_HEIGHT_IN - MARGIN_IN - FOOTER_HEIGHT_IN,
      w: SLIDE_WIDTH_IN - MARGIN_IN * 2,
      h: FOOTER_HEIGHT_IN,
      align: "center",
      valign: "middle",
      fontSize: 9,
      color: "888888",
    });
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
