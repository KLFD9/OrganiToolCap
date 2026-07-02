import type { OrgChartFile, OrgEdge, OrgNode } from "../types/orgchart";
import { estimateReadability, type ReadabilityEstimate } from "./readability";
import { CARD_HEIGHT, CARD_WIDTH, layoutCompact } from "./compactLayout";
import { layoutWithElk } from "./elkLayout";
import { buildChildrenMap, computeDescendants } from "./hierarchy";

/**
 * Optimiseur de disposition pour l'export : au lieu de constater qu'un
 * organigramme est illisible une fois ajusté sur la page (jauge de
 * lisibilité), on essaie plusieurs dispositions candidates, on mesure la
 * taille de texte réelle que chacune donnerait sur la zone utile de la page,
 * et on propose la meilleure. La lisibilité du document imprimé est le seul
 * critère de classement.
 */

/** Marge intérieure autour du contenu, identique à celle de la capture (captureFlow). */
export const CONTENT_MARGIN_RATIO = 1.12;

export type ExportLayoutId = "current" | "tree-tb" | "tree-lr" | "compact" | "grid";

/** En dessous de ce gain (pt), on conserve la disposition actuelle : pas de churn. */
export const MIN_GAIN_PT = 0.3;

export interface LayoutCandidate {
  id: ExportLayoutId;
  label: string;
  /** Nœuds repositionnés (les positions d'origine ne sont pas mutées). */
  nodes: OrgNode[];
  layout: Pick<OrgChartFile["layout"], "direction" | "mode">;
}

export interface RankedCandidate extends LayoutCandidate {
  estimate: ReadabilityEstimate;
}

/** Encombrement du contenu en px CSS, marge intérieure de capture incluse. */
export function contentBounds(nodes: OrgNode[]): { width: number; height: number } {
  if (nodes.length === 0) return { width: 1, height: 1 };
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  return {
    width: (Math.max(...xs) - Math.min(...xs) + CARD_WIDTH) * CONTENT_MARGIN_RATIO,
    height: (Math.max(...ys) - Math.min(...ys) + CARD_HEIGHT) * CONTENT_MARGIN_RATIO,
  };
}

/**
 * Classe les candidats par taille de texte imprimée décroissante. À gain
 * négligeable (< MIN_GAIN_PT), la disposition actuelle garde la première
 * place : on ne bouleverse pas l'organigramme de l'utilisateur pour 0,1 pt.
 */
export function rankCandidates(
  candidates: LayoutCandidate[],
  availWidthMm: number,
  availHeightMm: number
): RankedCandidate[] {
  const ranked = candidates
    .map((c) => {
      const bounds = contentBounds(c.nodes);
      return { ...c, estimate: estimateReadability(bounds.width, bounds.height, availWidthMm, availHeightMm) };
    })
    .sort((a, b) => b.estimate.fontPt - a.estimate.fontPt);

  const current = ranked.find((c) => c.id === "current");
  if (current && ranked[0].id !== "current" && ranked[0].estimate.fontPt - current.estimate.fontPt < MIN_GAIN_PT) {
    return [current, ...ranked.filter((c) => c.id !== "current")];
  }
  return ranked;
}

const GRID_GAP_X = 96;
const GRID_GAP_Y = 128;
const ROOT_GAP_Y = 64;

/**
 * Disposition « grille » page-aware : les sous-arbres de premier niveau
 * (déjà densifiés par la disposition compacte) sont réagencés en rangées
 * (shelf-packing) pour que l'enveloppe globale épouse le ratio de la page
 * cible — un organigramme plat de ratio 5:1 devient 2 ou 3 rangées proches
 * du 1,4:1 de l'A4 paysage. La racine unique reste centrée au-dessus.
 * Fonction pure.
 */
export function layoutGridForRatio(nodes: OrgNode[], edges: OrgEdge[], targetRatio: number): OrgNode[] {
  if (nodes.length === 0) return nodes;
  const { nodes: compactNodes } = layoutCompact(nodes, edges);
  const posById = new Map(compactNodes.map((n) => [n.id, n.position]));
  const nodeIds = new Set(nodes.map((n) => n.id));

  const children = buildChildrenMap(edges);
  const hasParent = new Set(edges.filter((e) => nodeIds.has(e.source)).map((e) => e.target));
  const roots = nodes.filter((n) => !hasParent.has(n.id));

  // Blocs à réagencer : sous-arbres des enfants de la racine unique,
  // ou sous-arbres des racines s'il y en a plusieurs.
  const singleRoot = roots.length === 1 ? roots[0] : undefined;
  const blockRootIds = singleRoot ? children.get(singleRoot.id) ?? [] : roots.map((r) => r.id);
  if (blockRootIds.length < 2) return compactNodes;

  interface Block {
    ids: string[];
    minX: number;
    minY: number;
    width: number;
    height: number;
  }

  const blocks: Block[] = blockRootIds.map((rootId) => {
    const ids = [rootId, ...computeDescendants(edges, rootId)].filter((id) => posById.has(id));
    const xs = ids.map((id) => posById.get(id)!.x);
    const ys = ids.map((id) => posById.get(id)!.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      ids,
      minX,
      minY,
      width: Math.max(...xs) - minX + CARD_WIDTH,
      height: Math.max(...ys) - minY + CARD_HEIGHT,
    };
  });

  // Largeur cible des rangées : celle qui rapproche l'enveloppe du ratio de
  // la page, sans descendre sous le bloc le plus large.
  const totalArea = blocks.reduce((sum, b) => sum + (b.width + GRID_GAP_X) * (b.height + GRID_GAP_Y), 0);
  const targetWidth = Math.max(
    Math.max(...blocks.map((b) => b.width)),
    Math.sqrt(totalArea * Math.max(0.1, targetRatio))
  );

  // Shelf-packing : remplissage des rangées de gauche à droite, dans l'ordre
  // du fichier (les pôles restent dans l'ordre voulu par l'utilisateur).
  const offsets = new Map<string, { dx: number; dy: number }>();
  let rowX = 0;
  let rowY = singleRoot ? CARD_HEIGHT + ROOT_GAP_Y + GRID_GAP_Y / 2 : 0;
  let rowMaxHeight = 0;
  let gridWidth = 0;

  for (const block of blocks) {
    if (rowX > 0 && rowX + block.width > targetWidth) {
      rowY += rowMaxHeight + GRID_GAP_Y;
      rowX = 0;
      rowMaxHeight = 0;
    }
    for (const id of block.ids) {
      offsets.set(id, { dx: rowX - block.minX, dy: rowY - block.minY });
    }
    rowX += block.width + GRID_GAP_X;
    gridWidth = Math.max(gridWidth, rowX - GRID_GAP_X);
    rowMaxHeight = Math.max(rowMaxHeight, block.height);
  }

  if (singleRoot) {
    offsets.set(singleRoot.id, {
      dx: (gridWidth - CARD_WIDTH) / 2 - posById.get(singleRoot.id)!.x,
      dy: -posById.get(singleRoot.id)!.y,
    });
  }

  return compactNodes.map((n) => {
    const offset = offsets.get(n.id);
    if (!offset) return n;
    return { ...n, position: { x: n.position.x + offset.dx, y: n.position.y + offset.dy } };
  });
}

/**
 * Construit les dispositions candidates : actuelle, arbre vertical (elk),
 * arbre horizontal (elk), compacte, grille page-aware. elkjs est chargé à la demande.
 */
export async function buildCandidates(
  nodes: OrgNode[],
  edges: OrgEdge[],
  currentLayout: OrgChartFile["layout"],
  targetRatio: number
): Promise<LayoutCandidate[]> {
  const [treeTb, treeLr] = await Promise.all([
    layoutWithElk(nodes, edges, "TB"),
    layoutWithElk(nodes, edges, "LR"),
  ]);
  return [
    {
      id: "current",
      label: "Disposition actuelle",
      nodes,
      layout: { direction: currentLayout.direction, mode: currentLayout.mode ?? "tree" },
    },
    { id: "tree-tb", label: "Arbre vertical", nodes: treeTb, layout: { direction: "TB", mode: "tree" } },
    { id: "tree-lr", label: "Arbre horizontal", nodes: treeLr, layout: { direction: "LR", mode: "tree" } },
    {
      id: "compact",
      label: "Disposition compacte",
      nodes: layoutCompact(nodes, edges).nodes,
      layout: { direction: "TB", mode: "compact" },
    },
    {
      id: "grid",
      label: "Grille ajustée à la page",
      nodes: layoutGridForRatio(nodes, edges, targetRatio),
      layout: { direction: "TB", mode: "compact" },
    },
  ];
}

/** Candidats classés pour la zone utile donnée (le meilleur en tête). */
export async function optimizeLayoutForPage(
  nodes: OrgNode[],
  edges: OrgEdge[],
  currentLayout: OrgChartFile["layout"],
  avail: { width: number; height: number }
): Promise<RankedCandidate[]> {
  const candidates = await buildCandidates(nodes, edges, currentLayout, avail.width / Math.max(1, avail.height));
  return rankCandidates(candidates, avail.width, avail.height);
}
