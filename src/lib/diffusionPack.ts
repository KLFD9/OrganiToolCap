import type { Node } from "@xyflow/react";
import type { OrgEdge, OrgNode, OrgTheme } from "../types/orgchart";
import type { FramePageContent } from "./frames";
import { captureFlow } from "./pdfExport";
import { buildFramesPdfVector, type FramesPdfCommonOptions } from "./pdfVector";
import { buildPeopleCsv } from "./csvExport";

/**
 * Pack de diffusion : un zip « tout-en-un » pour l'envoi mensuel —
 * PDF multi-pages (vectoriel), un PNG haute résolution par page et
 * l'annuaire CSV. Généré 100 % côté client (jszip, déjà utilisé pour
 * l'embarquement du .orgchart.json dans les .pptx).
 */

const PACK_PNG_SCALE = 2;

function slug(name: string): string {
  return (name || "page").replace(/[^a-z0-9-_]+/gi, "-");
}

export interface DiffusionPackInput {
  /** Pages du périmètre, dans l'ordre du document. */
  pages: FramePageContent[];
  /** Nœuds React Flow de chaque page (mêmes indices que `pages`), pour les captures PNG. */
  rfNodesPerPage: Node[][];
  theme: OrgTheme;
  common: FramesPdfCommonOptions;
  /** Annuaire complet (membres visibles du document). */
  directory: { nodes: OrgNode[]; edges: OrgEdge[] };
}

export async function exportDiffusionPack(viewportEl: HTMLElement, input: DiffusionPackInput): Promise<void> {
  const { pages, rfNodesPerPage, theme, common, directory } = input;
  if (pages.length === 0) return;

  const base = slug(common.docTitle || "organigramme");
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  // PDF multi-pages vectoriel
  const pdf = await buildFramesPdfVector(pages, theme, common);
  zip.file(`${base}.pdf`, pdf.output("arraybuffer"));

  // Un PNG par page (capture haute résolution des cartes de la page)
  for (let i = 0; i < pages.length; i++) {
    const rfNodes = rfNodesPerPage[i] ?? [];
    if (rfNodes.length === 0) continue;
    const capture = await captureFlow(viewportEl, rfNodes, "png", PACK_PNG_SCALE);
    const number = String(i + 1).padStart(2, "0");
    zip.file(`pages/${number}-${slug(pages[i].frame.name)}.png`, capture.dataUrl.split(",")[1], { base64: true });
  }

  // Annuaire CSV (BOM UTF-8 pour Excel, comme l'export CSV direct)
  zip.file(`${base}-annuaire.csv`, "\uFEFF" + buildPeopleCsv(directory.nodes, directory.edges));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}-pack.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
