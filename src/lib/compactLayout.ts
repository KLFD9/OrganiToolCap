import { isHierarchyEdge, type OrgEdge, type OrgNode } from "../types/orgchart";
import { BASE_NODE_HEIGHT, computeNodeWidth } from "./nodeStyle";

/**
 * Disposition « compacte » : les équipes terrain (groupes de feuilles) sont
 * empilées verticalement sous leur responsable au lieu d'être étalées en ligne.
 *
 * C'est la réponse au problème classique des organigrammes plats et larges :
 * un arbre de ratio 5:1 ne tient pas lisiblement sur une page A4 (1,41:1).
 * En empilant les subordonnés directs, le ratio se rapproche de celui de la
 * page et les cartes restent à taille lisible à l'impression — sans toucher
 * au design des cartes elles-mêmes.
 */

export const CARD_WIDTH = 240;
export const CARD_HEIGHT = BASE_NODE_HEIGHT;
const SIBLING_GAP_X = 48;
const LEVEL_GAP_Y = 64;
const STACK_INDENT = 48;
const STACK_GAP_Y = 20;
const ROOT_GAP_X = 96;

/** Nombre minimal de feuilles sous un même responsable pour déclencher l'empilement. */
export const STACK_MIN_CHILDREN = 3;

export interface CompactLayoutResult {
  nodes: OrgNode[];
  /** Identifiants des nœuds empilés (leur lien parent se dessine « en épine »). */
  stackedIds: Set<string>;
}

function buildChildrenMap(nodes: OrgNode[], edges: OrgEdge[]): Map<string, string[]> {
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (!isHierarchyEdge(e)) continue;
    if (!order.has(e.source) || !order.has(e.target)) continue;
    const list = children.get(e.source) ?? [];
    list.push(e.target);
    children.set(e.source, list);
  }
  // Ordre stable : celui d'apparition des nœuds dans le fichier
  for (const list of children.values()) {
    list.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  }
  return children;
}

/**
 * Nœuds qui seront empilés en disposition compacte : les enfants d'un parent
 * dont TOUS les enfants sont des feuilles, à partir de `STACK_MIN_CHILDREN`.
 * Déterministe à partir de nodes + edges (rien à persister de plus dans le fichier).
 */
export function computeStackedIds(nodes: OrgNode[], edges: OrgEdge[]): Set<string> {
  const children = buildChildrenMap(nodes, edges);
  const stacked = new Set<string>();
  for (const kids of children.values()) {
    if (kids.length >= STACK_MIN_CHILDREN && kids.every((k) => !children.has(k))) {
      for (const k of kids) stacked.add(k);
    }
  }
  return stacked;
}

/** Tolérance d'alignement gauche pour reconnaître une pile (px canvas). */
const STACK_X_TOLERANCE = 8;

/**
 * Nœuds réellement dessinés en pile : `computeStackedIds` dit quels groupes
 * *seraient* empilés par la disposition compacte, sans regarder les positions.
 * Le rendu « en épine » (poignée gauche, tracé le long de la pile) n'a de sens
 * que si les cartes forment effectivement une pile indentée sous leur parent —
 * la signature géométrique produite par `layoutCompact`. Dès que l'utilisateur
 * dispose la fratrie autrement (rangée, cartes déplacées…), les liens doivent
 * retomber sur le snap géométrique standard (lib/edgeRouting.chooseEdgeSides).
 * Partagé canvas ↔ exports pour garantir le WYSIWYG.
 */
export function computeGeometricStackIds(nodes: OrgNode[], edges: OrgEdge[]): Set<string> {
  const candidates = computeStackedIds(nodes, edges);
  const result = new Set<string>();
  if (candidates.size === 0) return result;

  const children = buildChildrenMap(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const [parentId, kids] of children) {
    if (kids.length < STACK_MIN_CHILDREN || !kids.every((k) => candidates.has(k))) continue;
    const parent = byId.get(parentId);
    const kidNodes = kids.map((k) => byId.get(k)).filter((n): n is OrgNode => Boolean(n));
    if (!parent || kidNodes.length !== kids.length) continue;

    // Signature d'une pile : cartes alignées à gauche, indentées par rapport
    // au parent (mais sous sa moitié gauche, pour que l'épine ait la place de
    // descendre), et empilées verticalement sous lui sans chevauchement.
    const xs = kidNodes.map((k) => k.position.x);
    const x0 = Math.min(...xs);
    const leftAligned = Math.max(...xs) - x0 <= STACK_X_TOLERANCE;
    const indented = x0 > parent.position.x && x0 < parent.position.x + CARD_WIDTH / 2;
    const sorted = [...kidNodes].sort((a, b) => a.position.y - b.position.y);
    let stackedVertically = sorted[0].position.y >= parent.position.y + CARD_HEIGHT;
    for (let i = 1; i < sorted.length && stackedVertically; i++) {
      if (sorted[i].position.y < sorted[i - 1].position.y + CARD_HEIGHT) stackedVertically = false;
    }

    if (leftAligned && indented && stackedVertically) {
      for (const k of kids) result.add(k);
    }
  }
  return result;
}

interface SubtreeSize {
  width: number;
  height: number;
}

/** Calcule les nouvelles positions. Les positions d'origine ne sont pas mutées. */
export function layoutCompact(nodes: OrgNode[], edges: OrgEdge[]): CompactLayoutResult {
  const children = buildChildrenMap(nodes, edges);
  const hasParent = new Set(
    edges
      .filter((e) => isHierarchyEdge(e) && nodes.some((n) => n.id === e.source))
      .map((e) => e.target)
  );
  const roots = nodes.filter((n) => !hasParent.has(n.id));
  const stackedIds = computeStackedIds(nodes, edges);

  const sizes = new Map<string, SubtreeSize>();

  function measure(id: string): SubtreeSize {
    const cached = sizes.get(id);
    if (cached) return cached;
    const kids = children.get(id) ?? [];
    let size: SubtreeSize;
    const node = nodes.find((n) => n.id === id);
    const nodeW = node ? computeNodeWidth(node) : CARD_WIDTH;

    if (kids.length === 0) {
      size = { width: nodeW, height: CARD_HEIGHT };
    } else if (kids.every((k) => stackedIds.has(k))) {
      const childWidths = kids.map((kId) => {
        const kn = nodes.find((n) => n.id === kId);
        return kn ? computeNodeWidth(kn) : CARD_WIDTH;
      });
      const maxChildW = childWidths.length > 0 ? Math.max(...childWidths) : CARD_WIDTH;
      size = {
        width: Math.max(nodeW, STACK_INDENT + maxChildW),
        height:
          CARD_HEIGHT + LEVEL_GAP_Y + kids.length * CARD_HEIGHT + (kids.length - 1) * STACK_GAP_Y,
      };
    } else {
      const kidSizes = kids.map(measure);
      const rowWidth =
        kidSizes.reduce((sum, s) => sum + s.width, 0) + (kids.length - 1) * SIBLING_GAP_X;
      size = {
        width: Math.max(nodeW, rowWidth),
        height: CARD_HEIGHT + LEVEL_GAP_Y + Math.max(...kidSizes.map((s) => s.height)),
      };
    }
    sizes.set(id, size);
    return size;
  }

  const positions = new Map<string, { x: number; y: number }>();

  /** `x` est le bord gauche de l'enveloppe du sous-arbre, `y` le haut. */
  function place(id: string, x: number, y: number): void {
    const size = measure(id);
    const kids = children.get(id) ?? [];
    const node = nodes.find((n) => n.id === id);
    const nodeW = node ? computeNodeWidth(node) : CARD_WIDTH;

    if (kids.length > 0 && kids.every((k) => stackedIds.has(k))) {
      // Parent aligné à gauche, pile indentée dessous
      positions.set(id, { x, y });
      let childY = y + CARD_HEIGHT + LEVEL_GAP_Y;
      for (const k of kids) {
        positions.set(k, { x: x + STACK_INDENT, y: childY });
        childY += CARD_HEIGHT + STACK_GAP_Y;
      }
      return;
    }

    // Parent centré au-dessus de la rangée de ses sous-arbres
    positions.set(id, { x: x + (size.width - nodeW) / 2, y });
    let childX = x;
    for (const k of kids) {
      const kidSize = measure(k);
      place(k, childX, y + CARD_HEIGHT + LEVEL_GAP_Y);
      childX += kidSize.width + SIBLING_GAP_X;
    }
  }

  let rootX = 0;
  for (const root of roots) {
    place(root.id, rootX, 0);
    rootX += measure(root.id).width + ROOT_GAP_X;
  }

  return {
    nodes: nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })),
    stackedIds,
  };
}
