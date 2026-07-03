import { isHierarchyEdge, type OrgEdge, type OrgNode } from "../types/orgchart";
import { computeLevels } from "./nodeStyle";
import { buildChildrenMap, computeDescendants } from "./hierarchy";

export interface DepartmentStat {
  department: string;
  count: number;
}

export interface OrgStats {
  /** Effectif total. */
  total: number;
  /** Nombre de personnes encadrant au moins un subordonné direct. */
  managers: number;
  /** Nombre de niveaux hiérarchiques (1 = tout le monde au même niveau). */
  depth: number;
  /** Répartition par pôle, décroissante. Les membres sans pôle sont regroupés. */
  byDepartment: DepartmentStat[];
}

export const NO_DEPARTMENT_LABEL = "Sans pôle";

/** Statistiques d'effectifs dérivées de l'organigramme. Fonction pure. */
export function computeOrgStats(nodes: OrgNode[], edges: OrgEdge[]): OrgStats {
  const children = buildChildrenMap(edges);
  const levels = computeLevels(nodes, edges);

  let depth = 0;
  for (const level of levels.values()) depth = Math.max(depth, level + 1);

  const byDept = new Map<string, number>();
  for (const n of nodes) {
    const dept = n.data.department?.trim() || NO_DEPARTMENT_LABEL;
    byDept.set(dept, (byDept.get(dept) ?? 0) + 1);
  }

  return {
    total: nodes.length,
    managers: [...children.keys()].filter((id) => nodes.some((n) => n.id === id)).length,
    depth,
    byDepartment: [...byDept.entries()]
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department, "fr")),
  };
}

export interface TeamSize {
  /** Subordonnés directs. */
  direct: number;
  /** Équipe totale (directs + indirects). */
  total: number;
}

/** Taille de l'équipe d'un membre (liens hiérarchiques uniquement). Fonction pure. */
export function computeTeamSize(edges: OrgEdge[], id: string): TeamSize {
  const direct = edges.filter((e) => isHierarchyEdge(e) && e.source === id).length;
  return { direct, total: computeDescendants(edges, id).size };
}
