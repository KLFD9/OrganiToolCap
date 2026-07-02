import type { OrgEdge } from "../types/orgchart";

/**
 * Utilitaires de parcours de la hiérarchie. Les arêtes forment une forêt
 * (un seul responsable par personne, anti-cycle garanti par le store), mais
 * chaque fonction se protège quand même contre un fichier malformé.
 */

/** Map responsable → subordonnés directs. */
export function buildChildrenMap(edges: OrgEdge[]): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const e of edges) {
    const list = children.get(e.source);
    if (list) list.push(e.target);
    else children.set(e.source, [e.target]);
  }
  return children;
}

/** Ensemble de tous les descendants (directs et indirects) d'un nœud. */
export function computeDescendants(edges: OrgEdge[], rootId: string): Set<string> {
  const children = buildChildrenMap(edges);
  const result = new Set<string>();
  const queue = [...(children.get(rootId) ?? [])];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const child of children.get(id) ?? []) queue.push(child);
  }
  return result;
}

/**
 * Nœuds masqués par le repli : union des descendants de chaque branche
 * repliée. Un nœud replié à l'intérieur d'une branche déjà masquée reste
 * simplement masqué.
 */
export function computeHiddenNodeIds(collapsedIds: Iterable<string>, edges: OrgEdge[]): Set<string> {
  const children = buildChildrenMap(edges);
  const hidden = new Set<string>();
  for (const rootId of collapsedIds) {
    const queue = [...(children.get(rootId) ?? [])];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (hidden.has(id)) continue;
      hidden.add(id);
      for (const child of children.get(id) ?? []) queue.push(child);
    }
  }
  return hidden;
}

/**
 * Nombre de descendants (équipe totale) de chaque nœud, en un seul parcours.
 * Les nœuds sans équipe ne figurent pas dans la map (compte implicite : 0).
 */
export function computeDescendantCounts(edges: OrgEdge[]): Map<string, number> {
  const children = buildChildrenMap(edges);
  const counts = new Map<string, number>();
  const visiting = new Set<string>();

  const count = (id: string): number => {
    const memo = counts.get(id);
    if (memo !== undefined) return memo;
    if (visiting.has(id)) return 0; // cycle dans un fichier malformé : on coupe
    visiting.add(id);
    let total = 0;
    for (const child of children.get(id) ?? []) {
      total += 1 + count(child);
    }
    visiting.delete(id);
    counts.set(id, total);
    return total;
  };

  for (const id of children.keys()) count(id);
  return counts;
}
