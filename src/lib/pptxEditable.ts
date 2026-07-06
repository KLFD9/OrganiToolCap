import { resolveDisplay, type OrgEdge, type OrgNode, type OrgTheme } from "../types/orgchart";
import { computeLevels, computeNodeStyle, getContrastColor } from "./nodeStyle";
import { computeStackedIds, CARD_WIDTH, CARD_HEIGHT } from "./compactLayout";
import { computeElbowRoute, computeSpineRoute, isSpineDirection, type EdgeRoutePoint } from "./edgeRouting";
import { nameInitials } from "./nameInitials";
import { blendHex } from "./colorBlend";
import type { FramePageContent } from "./frames";
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
  /** Pastille avatar (initiales) — masquée si l'affichage des photos est désactivé. */
  avatar?: { diameterIn: number; bg: string; textColor: string; initials: string };
  /** Style « minimal » : fine barre d'accent sur le bord gauche de la carte. */
  accentBarWidthIn?: number;
}

export interface ConnectorSpec {
  /** Polyligne (mêmes points que le tracé canvas, cf. lib/edgeRouting.ts). */
  points: EdgeRoutePoint[];
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
    const isNeon = theme.nodeStyle === "neon";
    const isMinimal = theme.nodeStyle === "minimal";
    const textColor =
      isNeon
        ? "FFFFFF"
        : solidBg
        ? pptxColor(getContrastColor(`#${fillColor}`), "1A1A1E")
        : "1A1A1E";
    // Pastille avatar : réplique de NodeCard (40 px de diamètre, cf. lib/pdfVector.ts)
    const avatarDiameterPx = 40;
    const avatar = display.showPhotos
      ? {
          diameterIn: toIn(avatarDiameterPx),
          bg: solidBg || isNeon ? blendHex(textColor, fillColor, 0.18) : accent,
          textColor: solidBg || isNeon ? textColor : "FFFFFF",
          initials: nameInitials(n.data.name || "?") || "?",
        }
      : undefined;
    return {
      x: posX(n.position.x),
      y: posY(n.position.y),
      w: toIn(CARD_WIDTH),
      h: toIn(CARD_HEIGHT),
      radiusIn: toIn(theme.cornerRadius),
      fillColor,
      lineColor: accent,
      lineWidth: theme.nodeStyle === "outline" || isNeon ? 1.25 : 0.75,
      department: display.showDepartments ? n.data.department : undefined,
      name: n.data.name || "Sans nom",
      role: display.showRoles ? n.data.role : undefined,
      email: display.showEmails ? n.data.email : undefined,
      deptColor: solidBg || isNeon ? textColor : accent,
      textColor,
      accentColor: accent,
      namePt,
      rolePt: Math.max(MIN_FONT_PT, namePt * 0.82),
      deptPt: Math.max(MIN_FONT_PT - 1, namePt * 0.62),
      avatar,
      accentBarWidthIn: isMinimal ? toIn(6) : undefined,
    };
  });

  const connectors: ConnectorSpec[] = [];
  for (const e of edges) {
    const source = byId.get(e.source);
    const target = byId.get(e.target);
    if (!source || !target) continue;

    // Départ : bas-centre du responsable. Arrivée : haut-centre du subordonné,
    // ou côté gauche pour les subordonnés empilés (disposition compacte) —
    // même géométrie que le canvas (cf. components/OrgEdge.tsx), calculée en
    // px canvas puis mise à l'échelle point par point pour garantir le WYSIWYG.
    const dashed = e.kind === "dotted";
    const sxPx = source.position.x + CARD_WIDTH / 2;
    const syPx = source.position.y + CARD_HEIGHT;
    const stacked = !dashed && stackedIds.has(e.target);
    const txPx = stacked ? target.position.x : target.position.x + CARD_WIDTH / 2;
    const tyPx = stacked ? target.position.y + CARD_HEIGHT / 2 : target.position.y;

    const routePx =
      stacked && isSpineDirection(sxPx, syPx, txPx, tyPx)
        ? computeSpineRoute(sxPx, syPx, txPx, tyPx)
        : computeElbowRoute(sxPx, syPx, txPx, tyPx);

    connectors.push({
      points: routePx.map((p) => ({ x: posX(p.x), y: posY(p.y) })),
      color: "B5B5C0",
      dashed,
    });
  }

  return { cards, connectors };
}

type PptxInstance = InstanceType<typeof import("pptxgenjs").default>;
type PptxSlide = ReturnType<PptxInstance["addSlide"]>;

/** Dessine une spec (cartes + connecteurs) sur une diapositive. */
function renderEditableSpec(pptx: PptxInstance, slide: PptxSlide, spec: EditableSlideSpec): void {
  // Connecteurs d'abord : les cartes passent au-dessus. Chaque polyligne est
  // dessinée segment par segment avec des lignes droites (pptx.ShapeType.line)
  // — une géométrie OOXML toujours valide, contrairement au coude générique
  // ("bentConnector3") utilisé auparavant, dont la forme réelle échappait à
  // pptxgenjs et provoquait une invite de réparation à l'ouverture.
  for (const c of spec.connectors) {
    for (let i = 0; i < c.points.length - 1; i++) {
      const a = c.points[i];
      const b = c.points[i + 1];
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) continue;
      slide.addShape(pptx.ShapeType.line, {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.max(Math.abs(b.x - a.x), 0.001),
        h: Math.max(Math.abs(b.y - a.y), 0.001),
        flipH: b.x < a.x,
        flipV: b.y < a.y,
        line: { color: c.color, width: 1, dashType: c.dashed ? "dash" : "solid" },
      });
    }
  }

  for (const card of spec.cards) {
    // 1. Fond de carte (toujours la forme pleine, sous tout le reste)
    slide.addShape(pptx.ShapeType.roundRect, {
      x: card.x,
      y: card.y,
      w: card.w,
      h: card.h,
      rectRadius: Math.min(card.radiusIn, card.h / 2),
      fill: { color: card.fillColor },
      line: { color: card.lineColor, width: card.lineWidth },
      shadow: { type: "outer", blur: 4, offset: 1, angle: 90, color: "9A9AA8", opacity: 0.3 },
    });

    // 2. Barre d'accent (style « minimal »), en surimpression sur le bord gauche
    if (card.accentBarWidthIn) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: card.x,
        y: card.y,
        w: card.accentBarWidthIn,
        h: card.h,
        rectRadius: Math.min(card.radiusIn, card.h / 2),
        fill: { color: card.accentColor },
        line: { type: "none" },
      });
    }

    // 3. Avatar (pastille d'initiales), réplique de NodeCard
    const leftInset = (card.accentBarWidthIn ?? 0) + 0.06;
    let textLeftInset = leftInset;
    if (card.avatar) {
      const d = card.avatar.diameterIn;
      const avatarX = card.x + leftInset;
      const avatarY = card.y + (card.h - d) / 2;
      slide.addShape(pptx.ShapeType.ellipse, {
        x: avatarX,
        y: avatarY,
        w: d,
        h: d,
        fill: { color: card.avatar.bg },
        line: { type: "none" },
      });
      slide.addText(card.avatar.initials, {
        x: avatarX,
        y: avatarY,
        w: d,
        h: d,
        align: "center",
        valign: "middle",
        fontSize: Math.max(MIN_FONT_PT, card.namePt * 0.9),
        bold: true,
        color: card.avatar.textColor,
      });
      textLeftInset = leftInset + d + 0.1;
    }

    // 4. Texte (nom, poste, pôle, e-mail) : bloc transparent superposé au fond
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
      x: card.x + textLeftInset,
      y: card.y,
      w: card.w - textLeftInset - 0.06,
      h: card.h,
      align: "left",
      valign: "middle",
      margin: 6,
    });
  }
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
  renderEditableSpec(pptx, slide, spec);

  await savePptxWithChart(pptx, chartJson, safePptxFileName(options.title));
}

/**
 * Export PowerPoint éditable multi-pages : une diapositive par frame, dans
 * l'ordre du document — le titre / sous-titre de chaque diapositive sont ceux
 * de la page (hérités du document sinon).
 */
export async function exportFramesToPptxEditable(
  pages: FramePageContent[],
  theme: OrgTheme,
  options: PptxExportOptions,
  chartJson?: string
): Promise<void> {
  if (pages.length === 0) return;
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = options.title ?? "Organigramme";
  if (options.subtitle) pptx.subject = options.subtitle;

  for (const page of pages) {
    const slide = pptx.addSlide();
    const slideOptions: PptxExportOptions = { ...options, title: page.title, subtitle: page.subtitle };
    const hasHeader = Boolean(slideOptions.title || options.logoUrl || options.secondaryLogoUrl);
    const hasFooter = Boolean(options.footer);
    await addSlideChrome(slide, slideOptions);

    const area = computeSlideContentArea(hasHeader, hasFooter);
    renderEditableSpec(pptx, slide, buildEditableSpec(page.nodes, page.edges, theme, area));
  }

  await savePptxWithChart(pptx, chartJson, safePptxFileName(options.title));
}
