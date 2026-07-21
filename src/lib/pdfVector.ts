import { resolveDisplay, type OrgEdge, type OrgNode, type OrgTheme } from "../types/orgchart";
import { buildEditableSpec, type EditableSlideSpec } from "./pptxEditable";
import { computeNodeWidth } from "./nodeStyle";
import { nameInitials } from "./nameInitials";
import { blendHex } from "./colorBlend";
import type { FramePageContent } from "./frames";
import { COMFORT_MM_PER_PX } from "./readability";
import {
  applyPdfMetadata,
  drawPageChrome,
  safeFileName,
  type ExportProgressCallback,
  type PdfExportOptions,
} from "./pdfExport";

/**
 * Export PDF « vectoriel natif » : réplique proportionnelle des cartes du
 * canvas — chaque dimension est exprimée en px de la carte à l'écran (240 px
 * de large) puis convertie à l'échelle de la page. Pour une page explicite en
 * mode `exact`, les coordonnées sont projetées depuis l'origine de la frame : badge de
 * pôle en pilule, pastille d'initiales, nom 12 px, poste 10 px, contact 10 px.
 * Texte net à toutes les échelles, fichier de quelques dizaines de Ko.
 * Limites assumées : police standardisée (Helvetica) et photos remplacées
 * par les initiales ; le mode « image » reste disponible pour le pixel près.
 */

const MM_PER_IN = 25.4;
const CONNECTOR_COLOR = "#DBDBDF"; // ≈ rgba(39,39,42,0.15) du canvas, aplati sur blanc
const CONTACT_ICON_PX = 14;
const CONTACT_GAP_PX = 8;
const CONTACT_BORDER_TO_ROW_CENTER_PX = 19;
const CONTACT_ROW_GAP_PX = 15.5;

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

function truncateSpacedTextToWidth(
  pdf: JsPdfLike,
  text: string,
  maxWidthMm: number,
  charSpaceMm: number
): string {
  const width = (value: string) =>
    pdf.getTextWidth(value) + Math.max(0, value.length - 1) * charSpaceMm;
  if (width(text) <= maxWidthMm) return text;
  let truncated = text;
  while (truncated.length > 1 && width(`${truncated}…`) > maxWidthMm) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated.trimEnd()}…`;
}

/** jsPDF sans dépendance de type statique (module chargé à la demande). */
type JsPdfLike = Awaited<ReturnType<typeof loadPdf>>["pdf"];

type RoundedFillPdf = Pick<JsPdfLike, "rect" | "circle">;

/**
 * Remplit un rectangle arrondi sans le remplissage natif de `roundedRect`.
 * Certains moteurs PDF matérialisent la fermeture de ce tracé par un cheveu
 * vertical à `x + radius`, visible sous l'avatar jusque dans les coordonnées.
 */
export function drawSeamlessRoundedFill(
  pdf: RoundedFillPdf,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r === 0) {
    pdf.rect(x, y, width, height, "F");
    return;
  }

  // Le très léger chevauchement évite aussi les coutures d'anticrénelage
  // entre les rectangles centraux et les quatre coins circulaires.
  const overlap = Math.min(r, 0.02);
  pdf.rect(x + r - overlap, y, width - r * 2 + overlap * 2, height, "F");
  pdf.rect(x, y + r - overlap, width, height - r * 2 + overlap * 2, "F");
  pdf.circle(x + r, y + r, r, "F");
  pdf.circle(x + width - r, y + r, r, "F");
  pdf.circle(x + r, y + height - r, r, "F");
  pdf.circle(x + width - r, y + height - r, r, "F");
}

async function loadPdf(orientation: PdfExportOptions["orientation"], format: PdfExportOptions["format"]) {
  const { jsPDF } = await import("jspdf");
  return { pdf: new jsPDF({ orientation, unit: "mm", format }) };
}

function drawMailIcon(pdf: JsPdfLike, x: number, centerY: number, size: number): void {
  const y = centerY - size / 2;
  const unit = size / 24;
  pdf.setLineWidth(unit * 1.8);
  pdf.setLineCap("round");
  pdf.setLineJoin("round");
  // Géométrie Lucide `Mail` (viewBox 24×24, strokeWidth 1.8 comme NodeCard).
  pdf.roundedRect(x + unit * 2, y + unit * 4, unit * 20, unit * 16, unit * 2, unit * 2, "S");
  pdf.line(x + unit * 2, y + unit * 6, x + unit * 12, y + unit * 13);
  pdf.line(x + unit * 22, y + unit * 6, x + unit * 12, y + unit * 13);
}

function drawPhoneIcon(pdf: JsPdfLike, x: number, centerY: number, size: number): void {
  const y = centerY - size / 2;
  const unit = size / 24;
  const p = (value: number, axis: "x" | "y") => (axis === "x" ? x : y) + value * unit;
  pdf.setLineWidth(unit * 1.8);
  pdf.setLineCap("round");
  pdf.setLineJoin("round");
  // Géométrie Lucide `Phone`, convertie en courbes jsPDF plutôt qu'une icône
  // de téléphone mobile (qui expliquait la divergence visible dans le PDF).
  pdf.path([
      { op: "m", c: [p(22, "x"), p(16.92, "y")] },
      { op: "l", c: [p(22, "x"), p(19.92, "y")] },
      { op: "c", c: [p(22, "x"), p(21.1, "y"), p(20.95, "x"), p(22.03, "y"), p(19.82, "x"), p(21.92, "y")] },
      { op: "c", c: [p(11.25, "x"), p(20.99, "y"), p(3.01, "x"), p(12.75, "y"), p(2.08, "x"), p(4.18, "y")] },
      { op: "c", c: [p(1.97, "x"), p(3.05, "y"), p(2.9, "x"), p(2, "y"), p(4.08, "x"), p(2, "y")] },
      { op: "l", c: [p(7.08, "x"), p(2, "y")] },
      { op: "c", c: [p(8.1, "x"), p(2, "y"), p(8.96, "x"), p(2.76, "y"), p(9.1, "x"), p(3.72, "y")] },
      { op: "c", c: [p(9.23, "x"), p(4.68, "y"), p(9.46, "x"), p(5.62, "y"), p(9.8, "x"), p(6.52, "y")] },
      { op: "c", c: [p(10.08, "x"), p(7.26, "y"), p(9.9, "x"), p(8.1, "y"), p(9.35, "x"), p(8.63, "y")] },
      { op: "l", c: [p(8.09, "x"), p(9.91, "y")] },
      { op: "c", c: [p(9.5, "x"), p(12.55, "y"), p(11.45, "x"), p(14.5, "y"), p(14.09, "x"), p(15.91, "y")] },
      { op: "l", c: [p(15.36, "x"), p(14.64, "y")] },
      { op: "c", c: [p(15.9, "x"), p(14.1, "y"), p(16.73, "x"), p(13.93, "y"), p(17.48, "x"), p(14.2, "y")] },
      { op: "c", c: [p(18.39, "x"), p(14.54, "y"), p(19.33, "x"), p(14.77, "y"), p(20.29, "x"), p(14.9, "y")] },
      { op: "c", c: [p(21.27, "x"), p(15.04, "y"), p(22, "x"), p(15.88, "y"), p(22, "x"), p(16.92, "y")] },
  ]);
  // Contrairement à `line`/`roundedRect`, jsPDF.path ignore totalement son
  // ancien argument de style : le contour doit être déclenché explicitement,
  // sinon le chemin est peint plus tard avec la couleur d'un autre élément.
  pdf.stroke();
}

/**
 * Dessine la page courante : chrome (en-tête/pied) puis cartes et connecteurs
 * ajustés dans la zone utile. Partagé par l'export mono-page et le multi-pages.
 */
async function drawVectorPage(
  pdf: JsPdfLike,
  nodes: OrgNode[],
  edges: OrgEdge[],
  theme: OrgTheme,
  options: PdfExportOptions,
  pageLabel?: string,
  exactOrigin?: { x: number; y: number }
): Promise<void> {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = options.margin;
  const { topOffset, bottomOffset } = await drawPageChrome(pdf, options, pageWidth, pageHeight, margin, pageLabel);

  // buildEditableSpec calcule la géométrie pour une zone en pouces
  const areaIn = {
    x: margin / MM_PER_IN,
    y: topOffset / MM_PER_IN,
    width: Math.max(0.1, (pageWidth - margin * 2) / MM_PER_IN),
    height: Math.max(0.1, (pageHeight - topOffset - bottomOffset) / MM_PER_IN),
  };
  const spec = buildEditableSpec(
    nodes,
    edges,
    theme,
    areaIn,
    exactOrigin
      ? {
          originX: exactOrigin.x,
          originY: exactOrigin.y,
          inchesPerPx: COMFORT_MM_PER_PX / MM_PER_IN,
        }
      : undefined
  );
  if (spec.cards.length > 0) drawEditableSpec(pdf, spec, theme);
}

/** Dessine cartes et connecteurs d'une spec éditable (réplique de NodeCard). */
function drawEditableSpec(pdf: JsPdfLike, spec: EditableSlideSpec, theme: OrgTheme): void {
  const mm = (inches: number) => inches * MM_PER_IN;
  // Échelle exacte : mm de papier par px de canvas — toutes les dimensions
  // du dessin sont les px de NodeCard multipliés par cette échelle.
  const display = resolveDisplay(theme);
  const firstCard = spec.cards[0];
  const firstNodeW = computeNodeWidth(
    {
      data: {
        name: firstCard.name,
        role: firstCard.role,
        email: firstCard.email,
        phone: firstCard.phone,
      },
    } as OrgNode,
    display.showPhotos
  );
  const mmPerPx = mm(firstCard.w) / firstNodeW;
  const px = (cssPx: number) => cssPx * mmPerPx;
  // pt typographiques équivalents à une taille en px du canvas
  const pt = (cssPx: number) => cssPx * mmPerPx * (72 / MM_PER_IN);

  const isOutline = theme.nodeStyle === "outline";
  const isNeon = theme.nodeStyle === "neon";
  const isMinimal = theme.nodeStyle === "minimal";
  const solidBg = theme.nodeStyle === "flat" || theme.nodeStyle === "gradient";

  // Connecteurs d'abord (les cartes passent au-dessus), fins et clairs comme
  // à l'écran — polyligne partagée avec le canvas (lib/edgeRouting.ts) et
  // l'export PowerPoint, point par point.
  pdf.setDrawColor(CONNECTOR_COLOR);
  pdf.setLineWidth(px(1.25));
  for (const c of spec.connectors) {
    pdf.setLineDashPattern(c.dashed ? [px(6), px(5)] : [], 0);
    const pts = c.points.map((p) => ({ x: mm(p.x), y: mm(p.y) }));
    for (let i = 0; i < pts.length - 1; i++) {
      pdf.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
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
    drawSeamlessRoundedFill(pdf, x, y, w, h, radius);
    pdf.setDrawColor(`#${borderColor}`);
    pdf.setLineWidth(px(isOutline || isNeon ? 1.5 : 1));
    pdf.roundedRect(x, y, w, h, radius, radius, "D");

    // Style minimal : un trait unique évite tout raccord entre deux aplats.
    if (isMinimal) {
      pdf.setDrawColor(`#${card.accentColor}`);
      pdf.setLineWidth(px(4));
      pdf.setLineCap("round");
      const inset = Math.max(px(2), radius * 0.45);
      pdf.line(x + px(2), y + inset, x + px(2), y + h - inset);
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
      const charSpace = px(0.8); // Tailwind `tracking-widest` à 8 px = 0,8 px
      const pillPadX = px(10); // NodeCard `px-2.5`
      const label = truncateSpacedTextToWidth(
        pdf,
        card.department.toUpperCase(),
        innerW - pillPadX * 2,
        charSpace
      );
      const labelW = pdf.getTextWidth(label) + Math.max(0, label.length - 1) * charSpace;
      const pillW = labelW + pillPadX * 2;
      const pillH = px(17);
      const pillBg = solidBg || isNeon
        ? blendHex(card.textColor, card.fillColor, 0.14)
        : blendHex(card.accentColor, card.fillColor, 0.09);
      pdf.setFillColor(`#${pillBg}`);
      pdf.roundedRect(x + padX, cursorY, pillW, pillH, pillH / 2, pillH / 2, "F");
      pdf.setTextColor(`#${card.deptColor}`);
      pdf.text(label, x + padX + pillPadX, cursorY + pillH / 2, { baseline: "middle", charSpace });
      cursorY += pillH + px(10);
    }

    // Rangée avatar (40 px) + nom (12 px) / poste (10 px)
    const avatarD = display.showPhotos ? px(40) : 0;
    const rowH = Math.max(avatarD, px(30));
    const rowCenterY = !card.department && !card.email && !card.phone
      ? y + h / 2
      : cursorY + rowH / 2;

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

    // Contacts (e-mail & téléphone) : mêmes espacements que NodeCard
    // (`mt-3.5 pt-3`, icône 14 px, gap 8 px, texte 10 px).
    if (card.email || card.phone) {
      const lineY = cursorY + rowH + px(14);
      pdf.setDrawColor(textOn(card.fillColor, card.textColor, 0.08));
      pdf.setLineWidth(px(1));
      pdf.line(x + padX, lineY, x + w - padX, lineY);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(pt(10));
      const contactColor = textOn(card.fillColor, card.textColor, 0.7);
      pdf.setTextColor(contactColor);
      pdf.setDrawColor(contactColor);
      pdf.setLineWidth(px(1.05));

      let contactCenterY = lineY + px(CONTACT_BORDER_TO_ROW_CENTER_PX);
      const iconSize = px(CONTACT_ICON_PX);
      const textX = x + padX + iconSize + px(CONTACT_GAP_PX);
      const textW = Math.max(1, innerW - iconSize - px(CONTACT_GAP_PX));

      if (card.email) {
        drawMailIcon(pdf, x + padX, contactCenterY, iconSize);
        pdf.text(truncateToWidth(pdf, card.email, textW), textX, contactCenterY, { baseline: "middle" });
        contactCenterY += px(CONTACT_ROW_GAP_PX);
      }
      if (card.phone) {
        drawPhoneIcon(pdf, x + padX, contactCenterY, iconSize);
        pdf.text(truncateToWidth(pdf, card.phone, textW), textX, contactCenterY, { baseline: "middle" });
      }
    }
  }
}

export async function buildFlowPdfVector(
  nodes: OrgNode[],
  edges: OrgEdge[],
  theme: OrgTheme,
  options: PdfExportOptions
): Promise<JsPdfLike> {
  const { pdf } = await loadPdf(options.orientation, options.format);
  applyPdfMetadata(pdf, options);
  await drawVectorPage(pdf, nodes, edges, theme, options);
  return pdf;
}

export async function exportFlowToPdfVector(
  nodes: OrgNode[],
  edges: OrgEdge[],
  theme: OrgTheme,
  options: PdfExportOptions
): Promise<void> {
  const pdf = await buildFlowPdfVector(nodes, edges, theme, options);
  pdf.save(safeFileName(options.title, "-vectoriel"));
}

export interface FramesPdfCommonOptions {
  docTitle?: string;
  docSubtitle?: string;
  footer?: string;
  logoUrl?: string;
  secondaryLogoUrl?: string;
}

/**
 * Construit le PDF vectoriel multi-pages : une page par frame, dans l'ordre du
 * document. Chaque page porte son propre chrome (titre/sous-titre de la page,
 * disposition d'en-tête héritée ou propre) et le format papier de sa feuille.
 * Renvoie le document sans le sauvegarder (réutilisé par le pack de diffusion).
 */
export async function buildFramesPdfVector(
  pages: FramePageContent[],
  theme: OrgTheme,
  common: FramesPdfCommonOptions,
  onProgress?: ExportProgressCallback
): Promise<JsPdfLike> {
  const first = pages[0];
  const { pdf } = await loadPdf(first.frame.page.orientation, first.frame.page.format);
  applyPdfMetadata(pdf, { title: common.docTitle, subtitle: common.docSubtitle });

  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i + 1, pages.length);
    const page = pages[i];
    if (i > 0) pdf.addPage(page.frame.page.format, page.frame.page.orientation);
    const options: PdfExportOptions = {
      format: page.frame.page.format,
      orientation: page.frame.page.orientation,
      margin: page.frame.page.margin,
      title: page.title,
      subtitle: page.subtitle,
      footer: common.footer,
      logoUrl: common.logoUrl,
      secondaryLogoUrl: common.secondaryLogoUrl,
      chromeLayout: page.chromeLayout,
    };
    const label = pages.length > 1 ? `${page.frame.name} · ${i + 1}/${pages.length}` : undefined;
    await drawVectorPage(
      pdf,
      page.nodes,
      page.edges,
      theme,
      options,
      label,
      page.frame.page.placement === "exact" ? page.frame.position : undefined
    );
  }

  return pdf;
}

/** Export PDF vectoriel multi-pages (téléchargement direct). */
export async function exportFramesToPdfVector(
  pages: FramePageContent[],
  theme: OrgTheme,
  common: FramesPdfCommonOptions,
  onProgress?: ExportProgressCallback
): Promise<void> {
  if (pages.length === 0) return;
  const pdf = await buildFramesPdfVector(pages, theme, common, onProgress);
  pdf.save(safeFileName(common.docTitle, pages.length > 1 ? "-pages" : "-vectoriel"));
}
