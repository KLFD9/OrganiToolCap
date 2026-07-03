import { resolveDisplay, type OrgEdge, type OrgNode, type OrgTheme } from "../types/orgchart";
import { computeLevels, computeNodeStyle, getContrastColor } from "./nodeStyle";
import { computeStackedIds, CARD_WIDTH, CARD_HEIGHT } from "./compactLayout";
import {
  addSlideChrome,
  computeSlideContentArea,
  pptxColor,
  safePptxFileName,
  savePptxWithChart,
  type PptxExportOptions,
} from "./pptxExport";

/**
 * Export PowerPoint « éditable » : chaque carte est une vraie forme PowerPoint
 * (rectangle arrondi + texte), chaque lien un connecteur. Le destinataire peut
 * déplacer les cartes, corriger un nom ou changer une couleur directement dans
 * PowerPoint — contrairement au mode image, fidèle au pixel mais figé.
 */

export interface CardSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  radiusIn: number;
  fillColor: string; // hex sans #
  lineColor: string;
  lineWidth: number;
  department?: string;
  name: string;
  role?: string;
  email?: string;
  deptColor: string;
  textColor: string;
  /** Couleur d'accent du niveau (bordures, pastille d'initiales). */
  accentColor: string;
  namePt: number;
  rolePt: number;
  deptPt: number;
}

export interface ConnectorSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  flipH: boolean;
  flipV: boolean;
  color: string;
  /** Rattachement fonctionnel : trait pointillé. */
  dashed: boolean;
}

export interface EditableSlideSpec {
  cards: CardSpec[];
  connectors: ConnectorSpec[];
}

const PT_PER_IN = 72;
const MIN_FONT_PT = 6;
const MAX_NAME_PT = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Convertit l'organigramme (positions px) en spécifications de formes (pouces)
 * ajustées dans `area`, ratio d'aspect préservé. Fonction pure.
 */
export function buildEditableSpec(
  nodes: OrgNode[],
  edges: OrgEdge[],
  theme: OrgTheme,
  area: { x: number; y: number; width: number; height: number }
): EditableSlideSpec {
  if (nodes.length === 0) return { cards: [], connectors: [] };

  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const boundsW = Math.max(...xs) - minX + CARD_WIDTH;
  const boundsH = Math.max(...ys) - minY + CARD_HEIGHT;

  const scale = Math.min(area.width / boundsW, area.height / boundsH); // pouces par px
  const offsetX = area.x + (area.width - boundsW * scale) / 2;
  const offsetY = area.y + (area.height - boundsH * scale) / 2;

  const toIn = (px: number) => px * scale;
  const posX = (px: number) => offsetX + (px - minX) * scale;
  const posY = (px: number) => offsetY + (px - minY) * scale;

  const levels = computeLevels(nodes, edges);
  const stackedIds = computeStackedIds(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const display = resolveDisplay(theme);

  const namePt = clamp(12 * scale * PT_PER_IN * (96 / 72), MIN_FONT_PT, MAX_NAME_PT);

  const cards: CardSpec[] = nodes.map((n) => {
    const style = computeNodeStyle(theme, levels.get(n.id) ?? 0, n.styleOverride);
    const accent = pptxColor(style.accentColor, "472F74");
    // Fond de carte selon le style : plein pour flat/gradient (accent) et
    // neon (sombre), blanc pour les styles clairs (glass, card, outline,
    // minimal — leurs fonds semi-transparents s'aplatissent en blanc).
    const solidBg =
      theme.nodeStyle === "flat" || theme.nodeStyle === "gradient" || Boolean(n.styleOverride?.background);
    const fillColor =
      theme.nodeStyle === "neon"
        ? "0C0A09"
        : theme.nodeStyle === "gradient"
        ? accent
        : solidBg
        ? pptxColor(style.background, accent)
        : "FFFFFF";
    const textColor =
      theme.nodeStyle === "neon"
        ? "FFFFFF"
        : solidBg
        ? pptxColor(getContrastColor(`#${fillColor}`), "1A1A1E")
        : "1A1A1E";
    return {
      x: posX(n.position.x),
      y: posY(n.position.y),
      w: toIn(CARD_WIDTH),
      h: toIn(CARD_HEIGHT),
      radiusIn: toIn(theme.cornerRadius),
      fillColor,
      lineColor: accent,
      lineWidth: theme.nodeStyle === "outline" || theme.nodeStyle === "neon" ? 1.25 : 0.75,
      department: display.showDepartments ? n.data.department : undefined,
      name: n.data.name || "Sans nom",
      role: display.showRoles ? n.data.role : undefined,
      email: display.showEmails ? n.data.email : undefined,
      deptColor: solidBg || theme.nodeStyle === "neon" ? textColor : accent,
      textColor,
      accentColor: accent,
      namePt,
      rolePt: Math.max(MIN_FONT_PT, namePt * 0.82),
      deptPt: Math.max(MIN_FONT_PT - 1, namePt * 0.62),
    };
  });

  const connectors: ConnectorSpec[] = [];
  for (const e of edges) {
    const source = byId.get(e.source);
    const target = byId.get(e.target);
    if (!source || !target) continue;

    // Départ : bas-centre du responsable. Arrivée : haut-centre du subordonné,
    // ou côté gauche pour les subordonnés empilés (disposition compacte).
    const dashed = e.kind === "dotted";
    const sx = posX(source.position.x + CARD_WIDTH / 2);
    const sy = posY(source.position.y + CARD_HEIGHT);
    const stacked = !dashed && stackedIds.has(e.target);
    const tx = stacked ? posX(target.position.x) : posX(target.position.x + CARD_WIDTH / 2);
    const ty = stacked ? posY(target.position.y + CARD_HEIGHT / 2) : posY(target.position.y);

    connectors.push({
      x: Math.min(sx, tx),
      y: Math.min(sy, ty),
      w: Math.abs(tx - sx),
      h: Math.abs(ty - sy),
      flipH: tx < sx,
      flipV: ty < sy,
      color: "B5B5C0",
      dashed,
    });
  }

  return { cards, connectors };
}

export async function exportFlowToPptxEditable(
  nodes: OrgNode[],
  edges: OrgEdge[],
  theme: OrgTheme,
  options: PptxExportOptions,
  /** Contenu .orgchart.json embarqué dans le fichier pour le round-trip. */
  chartJson?: string
): Promise<void> {
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
  const spec = buildEditableSpec(nodes, edges, theme, area);

  // « bentConnector3 » est une géométrie OOXML standard (connecteur en coude) ;
  // pptxgenjs écrit la chaîne telle quelle dans le XML mais son enum TS ne la liste pas.
  const bentConnector = "bentConnector3" as unknown as typeof pptx.ShapeType.line;

  // Connecteurs d'abord : les cartes passent au-dessus
  for (const c of spec.connectors) {
    const isStraight = c.w < 0.02 || c.h < 0.02;
    slide.addShape(isStraight ? pptx.ShapeType.line : bentConnector, {
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      flipH: c.flipH,
      flipV: c.flipV,
      line: { color: c.color, width: 1, dashType: c.dashed ? "dash" : "solid" },
    });
  }

  for (const card of spec.cards) {
    const runs: Array<{ text: string; options: Record<string, unknown> }> = [];
    if (card.department) {
      runs.push({
        text: card.department.toUpperCase(),
        options: { fontSize: card.deptPt, color: card.deptColor, bold: true, charSpacing: 2, breakLine: true },
      });
    }
    runs.push({
      text: card.name,
      options: {
        fontSize: card.namePt,
        color: card.textColor,
        bold: true,
        breakLine: Boolean(card.role || card.email),
      },
    });
    if (card.role) {
      runs.push({
        text: card.role,
        options: { fontSize: card.rolePt, color: card.textColor, transparency: 25, breakLine: Boolean(card.email) },
      });
    }
    if (card.email) {
      runs.push({
        text: card.email,
        options: { fontSize: Math.max(MIN_FONT_PT - 1, card.rolePt * 0.9), color: card.textColor, transparency: 40 },
      });
    }

    slide.addText(runs, {
      shape: pptx.ShapeType.roundRect,
      x: card.x,
      y: card.y,
      w: card.w,
      h: card.h,
      rectRadius: Math.min(card.radiusIn, card.h / 2),
      fill: { color: card.fillColor },
      line: { color: card.lineColor, width: card.lineWidth },
      align: "left",
      valign: "middle",
      margin: 6,
      shadow: { type: "outer", blur: 4, offset: 1, angle: 90, color: "9A9AA8", opacity: 0.3 },
    });
  }

  await savePptxWithChart(pptx, chartJson, safePptxFileName(options.title));
}
