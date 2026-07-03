import { resolveDisplay, type OrgEdge, type OrgNode, type OrgTheme } from "../types/orgchart";
import { buildEditableSpec } from "./pptxEditable";
import { CARD_WIDTH } from "./compactLayout";
import {
  applyPdfMetadata,
  drawPageChrome,
  safeFileName,
  type PdfExportOptions,
} from "./pdfExport";

/**
 * Export PDF « vectoriel natif » : réplique proportionnelle des cartes du
 * canvas — chaque dimension est exprimée en px de la carte à l'écran (240 px
 * de large) puis convertie à l'échelle de la page. Le document imprimé est
 * la copie exacte de ce que montre le canvas et le cadre de page : badge de
 * pôle en pilule, pastille d'initiales, nom 12 px, poste 10 px, e-mail 9 px.
 * Texte net à toutes les échelles, fichier de quelques dizaines de Ko.
 * Limites assumées : police standardisée (Helvetica) et photos remplacées
 * par les initiales ; le mode « image » reste disponible pour le pixel près.
 */

const MM_PER_IN = 25.4;
const CONNECTOR_COLOR = "#DBDBDF"; // ≈ rgba(39,39,42,0.15) du canvas, aplati sur blanc

/** Mélange deux couleurs hex (sans #) — bordures et textes atténués sans transparence. */
export function blendHex(fg: string, bg: string, fgRatio: number): string {
  const parse = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
  const [fr, fgG, fb] = parse(fg);
  const [br, bgG, bb] = parse(bg);
  const mix = (a: number, b: number) => Math.round(a * fgRatio + b * (1 - fgRatio));
  return [mix(fr, br), mix(fgG, bgG), mix(fb, bb)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}

/** Initiales d'un nom (mêmes règles que la carte à l'écran). */
export function nameInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
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

  // buildEditableSpec calcule la géométrie pour une zone en pouces
  const areaIn = {
    x: margin / MM_PER_IN,
    y: topOffset / MM_PER_IN,
    width: Math.max(0.1, (pageWidth - margin * 2) / MM_PER_IN),
    height: Math.max(0.1, (pageHeight - topOffset - bottomOffset) / MM_PER_IN),
  };
  const spec = buildEditableSpec(nodes, edges, theme, areaIn);
  if (spec.cards.length === 0) {
    pdf.save(safeFileName(options.title, "-vectoriel"));
    return;
  }

  const mm = (inches: number) => inches * MM_PER_IN;
  // Échelle exacte : mm de papier par px de canvas — toutes les dimensions
  // du dessin sont les px de NodeCard multipliés par cette échelle.
  const mmPerPx = mm(spec.cards[0].w) / CARD_WIDTH;
  const px = (cssPx: number) => cssPx * mmPerPx;
  // pt typographiques équivalents à une taille en px du canvas
  const pt = (cssPx: number) => cssPx * mmPerPx * (72 / MM_PER_IN);

  const display = resolveDisplay(theme);
  const isOutline = theme.nodeStyle === "outline";
  const isNeon = theme.nodeStyle === "neon";
  const isMinimal = theme.nodeStyle === "minimal";
  const solidBg = theme.nodeStyle === "flat" || theme.nodeStyle === "gradient";

  // Connecteurs d'abord (les cartes passent au-dessus), fins et clairs comme
  // à l'écran, en coude à mi-hauteur
  pdf.setDrawColor(CONNECTOR_COLOR);
  pdf.setLineWidth(px(1.25));
  for (const c of spec.connectors) {
    pdf.setLineDashPattern(c.dashed ? [px(6), px(5)] : [], 0);
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
  pdf.setLineDashPattern([], 0);

  for (const card of spec.cards) {
    const x = mm(card.x);
    const y = mm(card.y);
    const w = mm(card.w);
    const h = mm(card.h);
    const radius = Math.min(px(theme.cornerRadius), h / 2, w / 2);

    // Bordure fidèle au canvas : accent plein (outline/neon), accent
    // adouci (glass 25 %, card 15 %), gris très léger (minimal), sinon rien
    // de visible sur fond plein.
    const borderColor = isOutline || isNeon
      ? card.accentColor
      : solidBg
      ? card.fillColor
      : isMinimal
      ? blendHex("18181B", card.fillColor, 0.08)
      : blendHex(card.accentColor, card.fillColor, theme.nodeStyle === "glass" ? 0.25 : 0.15);

    pdf.setFillColor(`#${card.fillColor}`);
    pdf.setDrawColor(`#${borderColor}`);
    pdf.setLineWidth(px(isOutline || isNeon ? 1.5 : 1));
    pdf.roundedRect(x, y, w, h, radius, radius, "FD");

    // Style minimal : barre d'accent sur le bord gauche (4 px)
    if (isMinimal) {
      pdf.setFillColor(`#${card.accentColor}`);
      pdf.roundedRect(x, y, px(6), h, Math.min(radius, px(3)), Math.min(radius, px(3)), "F");
      pdf.setFillColor(`#${card.fillColor}`);
      pdf.rect(x + px(3), y, px(3), h, "F");
    }

    // Réplique de NodeCard : padding 20 px / 16 px
    const padX = px(20);
    let cursorY = y + px(16);
    const innerW = w - padX * 2;
    const textOn = (bg: string, color: string, ratio: number) => `#${blendHex(color, bg, ratio)}`;

    // Badge de pôle : pilule accent translucide, texte 8 px gras espacé
    if (card.department) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(pt(8));
      const label = truncateToWidth(pdf, card.department.toUpperCase(), innerW - px(16));
      const pillW = pdf.getTextWidth(label) + px(16);
      const pillH = px(17);
      const pillBg = solidBg || isNeon
        ? blendHex(card.textColor, card.fillColor, 0.14)
        : blendHex(card.accentColor, card.fillColor, 0.09);
      pdf.setFillColor(`#${pillBg}`);
      pdf.roundedRect(x + padX, cursorY, pillW, pillH, px(6), px(6), "F");
      pdf.setTextColor(`#${card.deptColor}`);
      pdf.text(label, x + padX + px(8), cursorY + pillH / 2, { baseline: "middle", charSpace: px(0.8) });
      cursorY += pillH + px(10);
    }

    // Rangée avatar (40 px) + nom (12 px) / poste (10 px)
    const avatarD = display.showPhotos ? px(40) : 0;
    const rowH = Math.max(avatarD, px(30));
    const rowCenterY = cursorY + rowH / 2;

    if (display.showPhotos) {
      const avatarBg = solidBg || isNeon
        ? blendHex(card.textColor, card.fillColor, 0.18)
        : card.accentColor;
      const avatarText = solidBg || isNeon ? card.textColor : "FFFFFF";
      pdf.setFillColor(`#${avatarBg}`);
      pdf.circle(x + padX + avatarD / 2, rowCenterY, avatarD / 2, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(pt(11));
      pdf.setTextColor(`#${avatarText}`);
      pdf.text(nameInitials(card.name) || "?", x + padX + avatarD / 2, rowCenterY, {
        align: "center",
        baseline: "middle",
      });
    }

    const textX = x + padX + (avatarD > 0 ? avatarD + px(12) : 0);
    const textW = Math.max(1, x + w - padX - textX);
    const nameY = card.role ? rowCenterY - px(8) : rowCenterY;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(pt(12));
    pdf.setTextColor(`#${card.textColor}`);
    pdf.text(truncateToWidth(pdf, card.name, textW), textX, nameY, { baseline: "middle" });

    if (card.role) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(pt(10));
      pdf.setTextColor(textOn(card.fillColor, card.textColor, 0.8));
      pdf.text(truncateToWidth(pdf, card.role, textW), textX, nameY + px(15), { baseline: "middle" });
    }

    // E-mail : filet + 9 px atténué, comme la carte
    if (card.email) {
      const emailY = cursorY + rowH + px(10);
      pdf.setDrawColor(textOn(card.fillColor, card.textColor, 0.08));
      pdf.setLineWidth(px(1));
      pdf.line(x + padX, emailY, x + w - padX, emailY);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(pt(9));
      pdf.setTextColor(textOn(card.fillColor, card.textColor, 0.6));
      pdf.text(truncateToWidth(pdf, card.email, innerW), x + padX, emailY + px(8), { baseline: "middle" });
    }
  }

  pdf.save(safeFileName(options.title, "-vectoriel"));
}
