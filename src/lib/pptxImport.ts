import type { OrgEdge, OrgNode } from "../types/orgchart";
import { parseOrgChartFile } from "./fileIO";
import type { OrgChartFile } from "../types/orgchart";
import { EMBEDDED_CHART_PATH } from "./pptxExport";

/**
 * Import d'un fichier PowerPoint (.pptx) :
 *
 * 1. **Round-trip** : si le .pptx a été exporté par cette application, il
 *    contient le `.orgchart.json` complet → restauration à l'identique
 *    (positions, thème, logos, photos).
 * 2. **SmartArt** : les organigrammes créés dans PowerPoint (Insertion →
 *    SmartArt → Hiérarchie) stockent leurs données dans un XML structuré
 *    (`ppt/diagrams/data*.xml`) : personnes + liens parent/enfant. On les
 *    extrait pour reconstruire l'organigramme avec nos templates.
 */

export class PptxImportError extends Error {}

export type PptxImportResult =
  | { kind: "orgchart"; file: OrgChartFile }
  | { kind: "people"; nodes: OrgNode[]; edges: OrgEdge[]; warnings: string[] };

interface SmartArtPerson {
  id: string;
  name: string;
  role?: string;
}

export interface SmartArtParseResult {
  people: SmartArtPerson[];
  links: Array<{ source: string; target: string }>;
}

/** Types de points du modèle SmartArt qui représentent une personne. */
const PERSON_POINT_TYPES = new Set(["node", "asst", ""]);

/**
 * Parse le XML d'un diagramme SmartArt (`dgm:dataModel`). Insensible aux
 * préfixes d'espaces de noms (on compare les `localName`).
 */
export function parseSmartArtXml(xml: string): SmartArtParseResult {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const all = Array.from(doc.getElementsByTagName("*"));

  const people: SmartArtPerson[] = [];
  for (const el of all) {
    if (el.localName !== "pt") continue;
    const type = el.getAttribute("type") ?? "";
    if (!PERSON_POINT_TYPES.has(type)) continue;
    const modelId = el.getAttribute("modelId");
    if (!modelId) continue;

    // Texte : paragraphes (a:p) → runs (a:t). 1er paragraphe = nom, suite = poste.
    const paragraphs: string[] = [];
    for (const p of Array.from(el.getElementsByTagName("*"))) {
      if (p.localName !== "p") continue;
      const text = Array.from(p.getElementsByTagName("*"))
        .filter((t) => t.localName === "t")
        .map((t) => t.textContent ?? "")
        .join("")
        .trim();
      if (text) paragraphs.push(text);
    }
    if (paragraphs.length === 0) continue; // points de présentation sans texte

    people.push({
      id: modelId,
      name: paragraphs[0],
      role: paragraphs.length > 1 ? paragraphs.slice(1).join(" — ") : undefined,
    });
  }

  const ids = new Set(people.map((p) => p.id));
  const links: Array<{ source: string; target: string }> = [];
  for (const el of all) {
    if (el.localName !== "cxn") continue;
    const type = el.getAttribute("type") ?? "parOf";
    if (type !== "parOf") continue;
    const source = el.getAttribute("srcId");
    const target = el.getAttribute("destId");
    if (source && target && ids.has(source) && ids.has(target)) {
      links.push({ source, target });
    }
  }

  return { people, links };
}

function toOrgNodes(parsed: SmartArtParseResult): { nodes: OrgNode[]; edges: OrgEdge[] } {
  const nodes: OrgNode[] = parsed.people.map((p, i) => ({
    id: `pptx-${i + 1}`,
    position: { x: 0, y: i * 140 },
    data: { name: p.name, role: p.role },
  }));
  const idMap = new Map(parsed.people.map((p, i) => [p.id, `pptx-${i + 1}`]));
  const edges: OrgEdge[] = parsed.links.map((l, i) => ({
    id: `pptx-edge-${i + 1}`,
    source: idMap.get(l.source)!,
    target: idMap.get(l.target)!,
  }));
  return { nodes, edges };
}

/** Importe un .pptx (round-trip ou SmartArt). Lance `PptxImportError` sinon. */
export async function importPptxFile(data: ArrayBuffer): Promise<PptxImportResult> {
  const { default: JSZip } = await import("jszip");
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new PptxImportError("Fichier non reconnu : ce n'est pas un PowerPoint (.pptx) valide.");
  }

  // 1. Round-trip : .orgchart.json embarqué par notre export
  const embedded = zip.file(EMBEDDED_CHART_PATH);
  if (embedded) {
    const json = await embedded.async("string");
    return { kind: "orgchart", file: parseOrgChartFile(json) };
  }

  // 2. Diagrammes SmartArt : on prend celui qui contient le plus de personnes
  const diagramFiles = zip.file(/ppt\/diagrams\/data\d*\.xml$/);
  const warnings: string[] = [];
  let best: SmartArtParseResult | null = null;
  for (const f of diagramFiles) {
    const parsed = parseSmartArtXml(await f.async("string"));
    if (parsed.people.length > (best?.people.length ?? 0)) best = parsed;
  }
  if (diagramFiles.length > 1) {
    warnings.push(
      `${diagramFiles.length} diagrammes SmartArt trouvés : seul le plus grand a été importé.`
    );
  }

  if (!best || best.people.length === 0) {
    throw new PptxImportError(
      "Aucun organigramme exploitable dans ce PowerPoint. Sont pris en charge : les .pptx exportés par cette application, et les diagrammes SmartArt de type hiérarchie."
    );
  }

  if (best.links.length === 0 && best.people.length > 1) {
    warnings.push("Aucun lien hiérarchique trouvé : les personnes ont été importées sans rattachement.");
  }

  const { nodes, edges } = toOrgNodes(best);
  return { kind: "people", nodes, edges, warnings };
}
