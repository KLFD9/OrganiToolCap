import { resolveDisplay, type OrgEdge, type OrgFrame, type OrgNode, type OrgTheme } from "../types/orgchart";
import { computeFrameMembership, frameRectPx } from "./frames";
import { computeNodeHeight, computeNodeWidth } from "./nodeStyle";

export type ExportPreflightSeverity = "error" | "warning" | "info";

export interface ExportPreflightIssue {
  code:
    | "empty-page"
    | "hidden-branches"
    | "missing-name"
    | "missing-title"
    | "nodes-outside-pages"
    | "partially-outside-page"
    | "overlapping-cards"
    | "readability"
    | "links-between-pages";
  severity: ExportPreflightSeverity;
  title: string;
  detail: string;
  pageId?: string;
  nodeIds?: string[];
}

export interface ExportPreflightReadability {
  rating: "good" | "warn" | "bad";
  fontPt: number;
  pageId?: string;
  pageName?: string;
}

export interface ExportPreflightInput {
  nodes: OrgNode[];
  edges: OrgEdge[];
  frames: OrgFrame[];
  theme: Pick<OrgTheme, "display">;
  /** Absence = toutes les pages. */
  scopeFrameIds?: ReadonlySet<string>;
  includeTitle?: boolean;
  title?: string;
  hiddenNodeCount?: number;
  readability?: ExportPreflightReadability | null;
  /** Le Web est recadré au contenu : les contraintes propres au papier ne s'appliquent pas. */
  destination?: "pdf" | "web";
}

export interface ExportPreflightResult {
  issues: ExportPreflightIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  exportedNodeCount: number;
  exportedPageCount: number;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function overlappingNodeIds(nodes: OrgNode[], theme: Pick<OrgTheme, "display">): string[] {
  const display = resolveDisplay(theme);
  const rects = nodes.map((node) => ({
    id: node.id,
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + computeNodeWidth(node, display.showPhotos),
    bottom: node.position.y + computeNodeHeight(node, display),
  }));
  const overlapping = new Set<string>();

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      // Un simple contact de bord ou une imprécision sous-pixel ne compte pas.
      if (overlapX > 2 && overlapY > 2) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }

  return [...overlapping];
}

/**
 * Contrôle local, déterministe et sans mutation du document avant diffusion.
 * Il ne bloque jamais l'export : il rend visibles les pertes ou défauts que le
 * client risquerait autrement de découvrir dans le fichier téléchargé.
 */
export function analyzeExportPreflight(input: ExportPreflightInput): ExportPreflightResult {
  const issues: ExportPreflightIssue[] = [];
  const allPagesSelected = !input.scopeFrameIds || input.scopeFrameIds.size === input.frames.length;
  const membership = input.frames.length > 0 ? computeFrameMembership(input.frames, input.nodes) : null;
  const activeFrames = input.frames.filter(
    (frame) => !input.scopeFrameIds || input.scopeFrameIds.has(frame.id)
  );
  const exportedNodeIds = new Set<string>();

  if (membership) {
    for (const frame of activeFrames) {
      const pageNodeIds = membership.byFrame.get(frame.id) ?? [];
      pageNodeIds.forEach((id) => exportedNodeIds.add(id));
      if (pageNodeIds.length === 0) {
        issues.push({
          code: "empty-page",
          severity: "warning",
          title: `${frame.name} est vide`,
          detail: "La page apparaîtra sans organigramme dans le document exporté.",
          pageId: frame.id,
        });
      }

      const pageNodeIdSet = new Set(pageNodeIds);
      const pageNodes = input.nodes.filter((node) => pageNodeIdSet.has(node.id));
      if (input.destination !== "web" && frame.page.placement === "exact") {
        const display = resolveDisplay(input.theme);
        const rect = frameRectPx(frame);
        const clippedIds = pageNodes
          .filter((node) => {
            const right = node.position.x + computeNodeWidth(node, display.showPhotos);
            const bottom = node.position.y + computeNodeHeight(node, display);
            return (
              node.position.x < rect.x ||
              node.position.y < rect.y ||
              right > rect.x + rect.width ||
              bottom > rect.y + rect.height
            );
          })
          .map((node) => node.id);
        if (clippedIds.length > 0) {
          issues.push({
            code: "partially-outside-page",
            severity: "error",
            title: `${clippedIds.length} ${plural(clippedIds.length, "carte partiellement hors page", "cartes partiellement hors page")}`,
            detail: `Sur ${frame.name}, replacez-les entièrement dans la feuille pour éviter toute coupure.`,
            pageId: frame.id,
            nodeIds: clippedIds,
          });
        }
      }
      const overlapIds = overlappingNodeIds(pageNodes, input.theme);
      if (overlapIds.length > 0) {
        issues.push({
          code: "overlapping-cards",
          severity: "warning",
          title: `${overlapIds.length} ${plural(overlapIds.length, "carte")} ${overlapIds.length === 1 ? "se chevauche" : "se chevauchent"}`,
          detail: `Sur ${frame.name}, séparez-les avant diffusion pour préserver la lisibilité.`,
          pageId: frame.id,
          nodeIds: overlapIds,
        });
      }
    }

    if (allPagesSelected && membership.orphanIds.size > 0) {
      issues.push({
        code: "nodes-outside-pages",
        severity: "error",
        title: `${membership.orphanIds.size} ${plural(membership.orphanIds.size, "carte")} hors page`,
        detail: `${plural(membership.orphanIds.size, "Elle sera exclue", "Elles seront exclues")} de tous les exports par page.`,
        nodeIds: [...membership.orphanIds],
      });
    }

    if (allPagesSelected) {
      const crossPageEdges = input.edges.filter((edge) => {
        const sourceFrame = membership.frameOf.get(edge.source);
        const targetFrame = membership.frameOf.get(edge.target);
        return sourceFrame && targetFrame && sourceFrame !== targetFrame;
      });
      if (crossPageEdges.length > 0) {
        const nodeIds = [...new Set(crossPageEdges.flatMap((edge) => [edge.source, edge.target]))];
        issues.push({
          code: "links-between-pages",
          severity: "warning",
          title: `${crossPageEdges.length} ${plural(crossPageEdges.length, "lien")} entre pages`,
          detail: `${plural(crossPageEdges.length, "Il ne sera pas tracé", "Ils ne seront pas tracés")} dans le PDF page par page.`,
          nodeIds,
        });
      }
    }
  } else {
    input.nodes.forEach((node) => exportedNodeIds.add(node.id));
    const overlapIds = overlappingNodeIds(input.nodes, input.theme);
    if (overlapIds.length > 0) {
      issues.push({
        code: "overlapping-cards",
        severity: "warning",
        title: `${overlapIds.length} ${plural(overlapIds.length, "carte")} ${overlapIds.length === 1 ? "se chevauche" : "se chevauchent"}`,
        detail: "Séparez-les avant diffusion pour préserver la lisibilité.",
        nodeIds: overlapIds,
      });
    }
  }

  const unnamedIds = input.nodes
    .filter((node) => exportedNodeIds.has(node.id) && !node.data.name.trim())
    .map((node) => node.id);
  if (unnamedIds.length > 0) {
    issues.push({
      code: "missing-name",
      severity: "warning",
      title: `${unnamedIds.length} ${plural(unnamedIds.length, "membre sans nom", "membres sans nom")}`,
      detail: "Complétez les fiches pour éviter la mention « Sans nom » dans les exports.",
      nodeIds: unnamedIds,
    });
  }

  if (input.includeTitle && !input.title?.trim()) {
    issues.push({
      code: "missing-title",
      severity: "info",
      title: "Titre du document vide",
      detail: "L'en-tête sera exporté sans titre.",
    });
  }

  if (input.destination !== "web" && input.readability && input.readability.rating !== "good") {
    const page = input.readability.pageName ? ` sur ${input.readability.pageName}` : "";
    issues.push({
      code: "readability",
      severity: input.readability.rating === "bad" ? "error" : "warning",
      title: input.readability.rating === "bad" ? "Texte trop petit" : "Lisibilité limite",
      detail: `Taille estimée${page} : ${input.readability.fontPt} pt. Réorganisez la page ou répartissez le contenu sur plusieurs pages A4.`,
      pageId: input.readability.pageId,
    });
  }

  if ((input.hiddenNodeCount ?? 0) > 0) {
    const count = input.hiddenNodeCount ?? 0;
    issues.push({
      code: "hidden-branches",
      severity: "info",
      title: `${count} ${plural(count, "membre masqué", "membres masqués")}`,
      detail: `${plural(count, "Il sera exclu", "Ils seront exclus")} conformément à la vue actuelle.`,
    });
  }

  return {
    issues,
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    infoCount: issues.filter((issue) => issue.severity === "info").length,
    exportedNodeCount: exportedNodeIds.size,
    exportedPageCount: input.frames.length > 0 ? activeFrames.length : 1,
  };
}
