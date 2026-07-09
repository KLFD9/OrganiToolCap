import { resolveDisplay, type OrgEdge, type OrgNode, type OrgTheme } from "../types/orgchart";
import { buildEditableSpec, type EditableSlideSpec } from "./pptxEditable";
import { computeNodeWidth } from "./nodeStyle";
import { nameInitials } from "./nameInitials";
import { blendHex } from "./colorBlend";
import type { FramePageContent } from "./frames";
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

/** jsPDF sans dépendance de type statique (module chargé à la demande). */
type JsPdfLike = Awaited<ReturnType<typeof loadPdf>>["pdf"];

async function loadPdf(orientation: PdfExportOptions["orientation"], format: PdfExportOptions["format"]) {
  const { jsPDF } = await import("jspdf");
  return { pdf: new jsPDF({ orientation, unit: "mm", format }) };
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
  pageLabel?: string
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
  const spec = buildEditableSpec(nodes, edges, theme, areaIn);
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
    pdf.setDrawColor(`#${borderColor}`);
    pdf.setLineWidth(px(isOutline || isNeon ? 1.5 : 1));
    pdf.roundedRect(x, y, w, h, radius, radius, "FD");

    // Style minimal : barre d'accent sur le bord gauche (4 px)
    if (isMinimal) {
      if (radius > px(4)) {
        // 1. Dessiner un rectangle arrondi de largeur 2 * radius (pour garantir un rayon parfait sur le bord gauche)
        pdf.setFillColor(`#${card.accentColor}`);
        pdf.roundedRect(x, y, 2 * radius, h, radius, radius, "F");
        
        // 2. Couvrir la partie droite avec le fond du nœud pour ne laisser que px(4) visible à gauche
        pdf.setFillColor(`#${card.fillColor}`);
        pdf.rect(x + px(4), y, 2 * radius - px(4), h, "F");
      } else {
        // Pour les coins carrés ou très peu arrondis, un rectangle simple de 4px suffit
        pdf.setFillColor(`#${card.accentColor}`);
        pdf.rect(x, y, px(4), h, "F");
      }
      
      // 3. Redessiner le contour du nœud par-dessus
      pdf.setDrawColor(`#${borderColor}`);
      pdf.setLineWidth(px(1));
      pdf.roundedRect(x, y, w, h, radius, radius, "D");
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

    // Contacts (E-mail & Téléphone) : filet + 9 px atténué
    if (card.email || card.phone) {
      let contactY = cursorY + rowH + px(10);
      pdf.setDrawColor(textOn(card.fillColor, card.textColor, 0.08));
      pdf.setLineWidth(px(1));
      pdf.line(x + padX, contactY, x + w - padX, contactY);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(pt(9));
      pdf.setTextColor(textOn(card.fillColor, card.textColor, 0.6));

      if (card.email) {
        pdf.text(truncateToWidth(pdf, card.email, innerW), x + padX, contactY + px(8), { baseline: "middle" });
        contactY += px(14);
      }
      if (card.phone) {
        pdf.text(truncateToWidth(pdf, card.phone, innerW), x + padX, contactY + px(8), { baseline: "middle" });
      }
    }
  }
}

export async function exportFlowToPdfVector(
  nodes: OrgNode[],
  edges: OrgEdge[],
  theme: OrgTheme,
  options: PdfExportOptions
): Promise<void> {
  const { pdf } = await loadPdf(options.orientation, options.format);
  applyPdfMetadata(pdf, options);
  await drawVectorPage(pdf, nodes, edges, theme, options);
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
  common: FramesPdfCommonOptions
): Promise<JsPdfLike> {
  const first = pages[0];
  const { pdf } = await loadPdf(first.frame.page.orientation, first.frame.page.format);
  applyPdfMetadata(pdf, { title: common.docTitle, subtitle: common.docSubtitle });

  for (let i = 0; i < pages.length; i++) {
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
    await drawVectorPage(pdf, page.nodes, page.edges, theme, options, label);
  }

  return pdf;
}

/** Export PDF vectoriel multi-pages (téléchargement direct). */
export async function exportFramesToPdfVector(
  pages: FramePageContent[],
  theme: OrgTheme,
  common: FramesPdfCommonOptions
): Promise<void> {
  if (pages.length === 0) return;
  const pdf = await buildFramesPdfVector(pages, theme, common);
  pdf.save(safeFileName(common.docTitle, pages.length > 1 ? "-pages" : "-vectoriel"));
}
