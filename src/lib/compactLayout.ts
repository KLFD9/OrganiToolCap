import type { OrgEdge, OrgNode } from "../types/orgchart";

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
export const CARD_HEIGHT = 110;
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

interface SubtreeSize {
  width: number;
  height: number;
}

/** Calcule les nouvelles positions. Les positions d'origine ne sont pas mutées. */
export function layoutCompact(nodes: OrgNode[], edges: OrgEdge[]): CompactLayoutResult {
  const children = buildChildrenMap(nodes, edges);
  const hasParent = new Set(edges.filter((e) => nodes.some((n) => n.id === e.source)).map((e) => e.target));
  const roots = nodes.filter((n) => !hasParent.has(n.id));
  const stackedIds = computeStackedIds(nodes, edges);

  const sizes = new Map<string, SubtreeSize>();

  function measure(id: string): SubtreeSize {
    const cached = sizes.get(id);
    if (cached) return cached;
    const kids = children.get(id) ?? [];
    let size: SubtreeSize;
    if (kids.length === 0) {
      size = { width: CARD_WIDTH, height: CARD_HEIGHT };
    } else if (kids.every((k) => stackedIds.has(k))) {
      size = {
        width: STACK_INDENT + CARD_WIDTH,
        height:
          CARD_HEIGHT + LEVEL_GAP_Y + kids.length * CARD_HEIGHT + (kids.length - 1) * STACK_GAP_Y,
      };
    } else {
      const kidSizes = kids.map(measure);
      const rowWidth =
        kidSizes.reduce((sum, s) => sum + s.width, 0) + (kids.length - 1) * SIBLING_GAP_X;
      size = {
        width: Math.max(CARD_WIDTH, rowWidth),
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
    positions.set(id, { x: x + (size.width - CARD_WIDTH) / 2, y });
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
