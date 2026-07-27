import { isHierarchyEdge, type OrgChartFile, type OrgEdge } from "../types/orgchart";
import { wouldCreateHierarchyCycle } from "./hierarchy";

export interface CollaborationGuardResult {
  file: OrgChartFile;
  removedEdgeIds: string[];
}

/**
 * Répare de façon déterministe les conflits structurels qui peuvent apparaître
 * lorsque deux participants modifient la hiérarchie au même instant.
 * Les liens fonctionnels restent indépendants et ne participent jamais au
 * contrôle de parent unique ou de cycle.
 */
export function guardCollaborativeOrgChart(file: OrgChartFile): CollaborationGuardResult {
  const nodeIds = new Set(file.nodes.map((node) => node.id));
  const candidates = file.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .sort((a, b) => a.id.localeCompare(b.id));

  const keptIds = new Set<string>();
  const hierarchy: OrgEdge[] = [];
  const parentTargets = new Set<string>();

  for (const edge of candidates) {
    if (!isHierarchyEdge(edge)) {
      keptIds.add(edge.id);
      continue;
    }
    if (
      edge.source === edge.target ||
      parentTargets.has(edge.target) ||
      wouldCreateHierarchyCycle(hierarchy, edge.source, edge.target)
    ) {
      continue;
    }
    hierarchy.push(edge);
    parentTargets.add(edge.target);
    keptIds.add(edge.id);
  }

  const edges = file.edges.filter((edge) => keptIds.has(edge.id));
  const removedEdgeIds = file.edges
    .filter((edge) => !keptIds.has(edge.id))
    .map((edge) => edge.id);

  return {
    file: removedEdgeIds.length > 0 ? { ...file, edges } : file,
    removedEdgeIds,
  };
}

