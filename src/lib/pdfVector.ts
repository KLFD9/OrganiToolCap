import type { OrgEdge, OrgNode, OrgTheme } from "../types/orgchart";
import { buildEditableSpec } from "./pptxEditable";
import {
  applyPdfMetadata,
  drawPageChrome,
  safeFileName,
  type PdfExportOptions,
} from "./pdfExport";

/**
 * Export PDF « vectoriel natif » : comme pour le PowerPoint éditable, chaque
 * carte est dessinée nativement (rectangle arrondi + texte) au lieu d'être
 * rasterisée — texte parfaitement net à toutes les échelles de zoom et
 * d'impression, fichier de quelques dizaines de Ko au lieu de plusieurs Mo.
 * Limites assumées : polices standardisées (Helvetica) et photos non
 * incluses ; le mode « image » reste disponible pour la fidélité au pixel.
 */

const MM_PER_IN = 25.4;
const MM_PER_PT = 25.4 / 72;
const CARD_PADDING_MM = 2.4;
const CONNECTOR_COLOR = "#B5B5C0";

/** Mélange deux couleurs hex (sans #) — sert à atténuer le texte secondaire sans transparence. */
export function blendHex(fg: string, bg: string, fgRatio: number): string {
  const parse = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
  const [fr, fgG, fb] = parse(fg);
  const [br, bgG, bb] = parse(bg);
  const mix = (a: number, b: number) => Math.round(a * fgRatio + b * (1 - fgRatio));
  return [mix(fr, br), mix(fgG, bgG), mix(fb, bb)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}

/** Tronque un libellé à la largeur donnée (mm) pour la taille de police courante. */
function truncateToWidth(
  pdf: { getTextWidth: (t: string) => number },
  text: string,
  maxWidthMm: number
): string {
  if (pdf.getTextWidth(text) <= maxWidthMm) return text;
  let t = text;
  while (t.length > 1 && pdf.getTextWidth(`${t}…`) > maxWidthMm) {
    t = t.slice(0, -1);
  }
  return `${t.trimEnd()}…`;
}

export async function exportFlowToPdfVector(
  nodes: OrgNode[],
  edges: OrgEdge[],
  theme: OrgTheme,
  options: PdfExportOptions
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: options.orientation, unit: "mm", format: options.format });
  applyPdfMetadata(pdf, options);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = options.margin;
  const { topOffset, bottomOffset } = await drawPageChrome(pdf, options, pageWidth, pageHeight, margin);

  // buildEditableSpec calcule ses tailles de police pour une zone en pouces
  const areaIn = {
    x: margin / MM_PER_IN,
    y: topOffset / MM_PER_IN,
    width: Math.max(0.1, (pageWidth - margin * 2) / MM_PER_IN),
    height: Math.max(0.1, (pageHeight - topOffset - bottomOffset) / MM_PER_IN),
  };
  const spec = buildEditableSpec(nodes, edges, theme, areaIn);
  const mm = (inches: number) => inches * MM_PER_IN;

  // Connecteurs d'abord (les cartes passent au-dessus), en coude à mi-hauteur
  pdf.setDrawColor(CONNECTOR_COLOR);
  pdf.setLineWidth(0.25);
  for (const c of spec.connectors) {
    const sx = mm(c.flipH ? c.x + c.w : c.x);
    const sy = mm(c.flipV ? c.y + c.h : c.y);
    const ex = mm(c.flipH ? c.x : c.x + c.w);
    const ey = mm(c.flipV ? c.y : c.y + c.h);
    if (mm(c.w) < 0.5 || mm(c.h) < 0.5) {
      pdf.line(sx, sy, ex, ey);
    } else {
      const midY = (sy + ey) / 2;
      pdf.lines(
        [
          [0, midY - sy],
          [ex - sx, 0],
          [0, ey - midY],
        ],
        sx,
        sy
      );
    }
  }

  for (const card of spec.cards) {
    const x = mm(card.x);
    const y = mm(card.y);
    const w = mm(card.w);
    const h = mm(card.h);
    const radius = Math.min(mm(card.radiusIn), h / 2, w / 2);

    pdf.setFillColor(`#${card.fillColor}`);
    pdf.setDrawColor(`#${card.lineColor}`);
    pdf.setLineWidth(card.lineWidth * MM_PER_PT);
    pdf.roundedRect(x, y, w, h, radius, radius, "FD");

    // Bloc de texte centré verticalement : pôle / nom / poste
    const textX = x + CARD_PADDING_MM;
    const maxTextWidth = Math.max(1, w - CARD_PADDING_MM * 2);
    const lineGap = 0.8;

    interface Line {
      text: string;
      pt: number;
      color: string;
      bold: boolean;
    }
    const lines: Line[] = [];
    if (card.department) {
      lines.push({ text: card.department.toUpperCase(), pt: card.deptPt, color: card.deptColor, bold: true });
    }
    lines.push({ text: card.name, pt: card.namePt, color: card.textColor, bold: true });
    if (card.role) {
      lines.push({
        text: card.role,
        pt: card.rolePt,
        color: blendHex(card.textColor, card.fillColor, 0.72),
        bold: false,
      });
    }

    const totalHeight =
      lines.reduce((sum, l) => sum + l.pt * MM_PER_PT, 0) + lineGap * (lines.length - 1);
    let cursorY = y + Math.max(CARD_PADDING_MM / 2, (h - totalHeight) / 2);

    for (const line of lines) {
      pdf.setFont("helvetica", line.bold ? "bold" : "normal");
      pdf.setFontSize(line.pt);
      pdf.setTextColor(`#${line.color}`);
      pdf.text(truncateToWidth(pdf, line.text, maxTextWidth), textX, cursorY, { baseline: "top" });
      cursorY += line.pt * MM_PER_PT + lineGap;
    }
  }

  pdf.save(safeFileName(options.title, "-vectoriel"));
}
