import type { ChromeLayout, OrgEdge, OrgFrame, OrgNode } from "../types/orgchart";
import { CARD_HEIGHT, CARD_WIDTH } from "./compactLayout";
import { COMFORT_MM_PER_PX, pageSizeMm, type PageSetup } from "./readability";

/**
 * Frames multi-pages : géométrie et appartenance.
 *
 * Un frame est une feuille A4 ou grand format posée sur le canvas, dessinée à l'échelle
 * « confort » (COMFORT_MM_PER_PX) : une carte qui tient dans sa zone utile
 * imprimera son texte à ≥ 6,5 pt. L'appartenance d'une carte à un frame est
 * purement géométrique — le frame qui contient le centre de la carte — donc
 * rien à maintenir : glisser une carte dans une page suffit.
 */

export interface RectPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Espacement horizontal entre deux feuilles posées côte à côte (px canvas). */
export const FRAME_GAP_PX = 160;

/**
 * Id du nœud React Flow représentant la feuille d'un frame — partagé par le
 * canvas et le navigateur de pages (fitView ciblé).
 */
export const FRAME_NODE_ID_PREFIX = "frame:";
export const frameNodeId = (frameId: string) => `${FRAME_NODE_ID_PREFIX}${frameId}`;
export const frameIdFromNodeId = (id: string): string | undefined =>
  id.startsWith(FRAME_NODE_ID_PREFIX) ? id.slice(FRAME_NODE_ID_PREFIX.length) : undefined;

/** Dimensions d'une feuille en px canvas (échelle confort). */
export function frameSizePx(page: PageSetup): { width: number; height: number } {
  const mm = pageSizeMm(page.format, page.orientation);
  return { width: mm.width / COMFORT_MM_PER_PX, height: mm.height / COMFORT_MM_PER_PX };
}

/** Rectangle de la feuille d'un frame en px canvas. */
export function frameRectPx(frame: OrgFrame): RectPx {
  const size = frameSizePx(frame.page);
  return { x: frame.position.x, y: frame.position.y, ...size };
}

/** Centre d'une carte (px canvas). */
export function nodeCenter(node: OrgNode): { x: number; y: number } {
  return { x: node.position.x + CARD_WIDTH / 2, y: node.position.y + CARD_HEIGHT / 2 };
}

function rectContains(rect: RectPx, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
  );
}

/**
 * Frame contenant un point. En cas de chevauchement de feuilles, le premier
 * frame de l'ordre du document l'emporte (déterministe).
 */
export function frameAtPoint(frames: OrgFrame[], point: { x: number; y: number }): OrgFrame | undefined {
  return frames.find((f) => rectContains(frameRectPx(f), point));
}

export interface FrameMembership {
  /** frameId → ids des cartes dont le centre est dans la feuille (ordre des nœuds). */
  byFrame: Map<string, string[]>;
  /** nodeId → frameId d'appartenance. */
  frameOf: Map<string, string>;
  /** Cartes hors de toute page (affichées estompées, exclues des exports par page). */
  orphanIds: Set<string>;
}

/** Appartenance géométrique de chaque carte : le frame qui contient son centre. */
export function computeFrameMembership(frames: OrgFrame[], nodes: OrgNode[]): FrameMembership {
  const byFrame = new Map<string, string[]>(frames.map((f) => [f.id, []]));
  const frameOf = new Map<string, string>();
  const orphanIds = new Set<string>();
  if (frames.length === 0) {
    for (const n of nodes) orphanIds.add(n.id);
    return { byFrame, frameOf, orphanIds };
  }

  const rects = frames.map((f) => ({ id: f.id, rect: frameRectPx(f) }));
  for (const node of nodes) {
    const center = nodeCenter(node);
    const hit = rects.find((r) => rectContains(r.rect, center));
    if (hit) {
      byFrame.get(hit.id)!.push(node.id);
      frameOf.set(node.id, hit.id);
    } else {
      orphanIds.add(node.id);
    }
  }
  return { byFrame, frameOf, orphanIds };
}

/** Nom par défaut d'une nouvelle page : « Page N » sans collision. */
export function defaultFrameName(frames: OrgFrame[]): string {
  const existing = new Set(frames.map((f) => f.name));
  let n = frames.length + 1;
  while (existing.has(`Page ${n}`)) n += 1;
  return `Page ${n}`;
}

/**
 * Position d'une nouvelle feuille : la **première** page enveloppe le contenu
 * existant (centrée dessus — les cartes deviennent membres sans manipulation),
 * les suivantes se posent à droite de la feuille la plus à droite.
 */
export function nextFramePosition(
  frames: OrgFrame[],
  page: PageSetup,
  contentBounds?: RectPx
): { x: number; y: number } {
  if (frames.length > 0) {
    const rects = frames.map(frameRectPx);
    const rightmost = rects.reduce((a, b) => (b.x + b.width > a.x + a.width ? b : a));
    return { x: rightmost.x + rightmost.width + FRAME_GAP_PX, y: rightmost.y };
  }
  if (contentBounds) {
    const size = frameSizePx(page);
    return {
      x: contentBounds.x + contentBounds.width / 2 - size.width / 2,
      y: contentBounds.y + contentBounds.height / 2 - size.height / 2,
    };
  }
  return { x: 0, y: 0 };
}

/** Rectangle englobant d'un ensemble de cartes (px canvas), ou undefined si vide. */
export function nodesBounds(nodes: OrgNode[]): RectPx | undefined {
  if (nodes.length === 0) return undefined;
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX + CARD_WIDTH,
    height: Math.max(...ys) - minY + CARD_HEIGHT,
  };
}

export interface FrameChrome {
  title?: string;
  subtitle?: string;
}

/** Titre / sous-titre effectifs d'une page : ceux du frame, sinon ceux du document. */
export function resolveFrameChrome(
  frame: OrgFrame,
  docMeta: { title?: string; subtitle?: string }
): FrameChrome {
  return {
    title: frame.meta?.title ?? docMeta.title,
    subtitle: frame.meta?.subtitle ?? docMeta.subtitle,
  };
}

/** Contenu et chrome effectifs d'une page, prêts pour un moteur d'export. */
export interface FramePageContent {
  frame: OrgFrame;
  /** Cartes appartenant à la page (centre dans la feuille). */
  nodes: OrgNode[];
  /** Liens internes à la page (les deux extrémités membres). */
  edges: OrgEdge[];
  title?: string;
  subtitle?: string;
  /** Disposition d'en-tête fusionnée : celle du frame prime, élément par élément. */
  chromeLayout?: ChromeLayout;
}

/**
 * Découpe le document en pages exportables : une entrée par frame, dans
 * l'ordre du tableau (= ordre des pages du PDF / des diapositives).
 */
export function buildFramePages(
  frames: OrgFrame[],
  nodes: OrgNode[],
  edges: OrgEdge[],
  docMeta: { title?: string; subtitle?: string; chromeLayout?: ChromeLayout }
): FramePageContent[] {
  const membership = computeFrameMembership(frames, nodes);
  return frames.map((frame) => {
    const memberIds = new Set(membership.byFrame.get(frame.id) ?? []);
    const chrome = resolveFrameChrome(frame, docMeta);
    return {
      frame,
      nodes: nodes.filter((n) => memberIds.has(n.id)),
      edges: edges.filter((e) => memberIds.has(e.source) && memberIds.has(e.target)),
      title: chrome.title,
      subtitle: chrome.subtitle,
      chromeLayout:
        docMeta.chromeLayout || frame.chromeLayout
          ? { ...docMeta.chromeLayout, ...frame.chromeLayout }
          : undefined,
    };
  });
}
