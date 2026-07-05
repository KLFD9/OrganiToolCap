import { describe, expect, it } from "vitest";
import { parseOrgChartFile, FileFormatError } from "./fileIO";
import {
  dottedEdges,
  hierarchyEdges,
  isHierarchyEdge,
  migrateOrgChartFile,
  ORG_CHART_VERSION,
  type OrgChartFile,
} from "../types/orgchart";
import { buildChildrenMap, computeDescendants, wouldCreateHierarchyCycle } from "./hierarchy";
import { computeTeamSize, computeOrgStats } from "./stats";
import { buildPeopleCsv } from "./csvExport";
import { buildEditableSpec } from "./pptxEditable";
import { glassCapTheme } from "../templates/themes";

function v1File(): Record<string, unknown> {
  return {
    format: "orgchart",
    version: 1,
    meta: { title: "Test", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    templateId: "glass-cap",
    theme: glassCapTheme,
    nodes: [
      { id: "a", data: { name: "Claire" }, position: { x: 0, y: 0 } },
      { id: "b", data: { name: "Marc" }, position: { x: 0, y: 200 } },
    ],
    edges: [{ id: "e1", source: "a", target: "b" }],
    layout: { direction: "TB", auto: true },
  };
}

function v2File(): OrgChartFile {
  const base = v1File() as unknown as OrgChartFile;
  return {
    ...base,
    version: 2,
    nodes: [...base.nodes, { id: "c", data: { name: "Léa" }, position: { x: 300, y: 200 } }],
    edges: [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "a", target: "c" },
      { id: "e3", source: "b", target: "c", kind: "dotted" },
    ],
  };
}

describe("migration v1 → v2", () => {
  it("un fichier v1 s'ouvre et est porté en version courante sans perte", () => {
    const parsed = parseOrgChartFile(JSON.stringify(v1File()));
    expect(parsed.version).toBe(ORG_CHART_VERSION);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    // L'absence de kind vaut hiérarchique
    expect(isHierarchyEdge(parsed.edges[0])).toBe(true);
  });

  it("un fichier v2 avec liens pointillés fait le round-trip", () => {
    const parsed = parseOrgChartFile(JSON.stringify(v2File()));
    expect(parsed.version).toBe(2);
    expect(dottedEdges(parsed.edges)).toHaveLength(1);
    expect(hierarchyEdges(parsed.edges)).toHaveLength(2);
    // Re-sérialisation identique
    expect(parseOrgChartFile(JSON.stringify(parsed))).toEqual(parsed);
  });

  it("rejette une version future avec un message explicite", () => {
    expect(() => parseOrgChartFile(JSON.stringify({ ...v1File(), version: 3 }))).toThrow(FileFormatError);
  });

  it("migrateOrgChartFile est sans effet sur un fichier déjà en version courante", () => {
    const file = v2File();
    expect(migrateOrgChartFile(file)).toBe(file);
  });

  it("frames (multi-pages) : champ additif v2, round-trip sans perte", () => {
    const withFrames: OrgChartFile = {
      ...v2File(),
      frames: [
        {
          id: "frame-1",
          name: "Direction",
          position: { x: 0, y: 0 },
          page: { format: "a4", orientation: "landscape", margin: 10 },
          meta: { title: "Comité de direction" },
          chromeLayout: { title: { x: 12, y: 8, size: 16 } },
        },
      ],
    };
    const parsed = parseOrgChartFile(JSON.stringify(withFrames));
    expect(parsed.frames).toHaveLength(1);
    expect(parsed.frames?.[0].meta?.title).toBe("Comité de direction");
    expect(parseOrgChartFile(JSON.stringify(parsed))).toEqual(parsed);
    // Un fichier sans frames reste valide (page implicite)
    expect(parseOrgChartFile(JSON.stringify(v2File())).frames).toBeUndefined();
  });
});

describe("les liens pointillés sont ignorés par la logique d'arbre", () => {
  const { nodes, edges } = v2File();

  it("hiérarchie : enfants, descendants", () => {
    expect(buildChildrenMap(edges).get("b")).toBeUndefined(); // e3 dotted ignoré
    expect(computeDescendants(edges, "b").size).toBe(0);
    expect(computeDescendants(edges, "a")).toEqual(new Set(["b", "c"]));
  });

  it("statistiques : effectif d'équipe et encadrants", () => {
    expect(computeTeamSize(edges, "b")).toEqual({ direct: 0, total: 0 });
    expect(computeOrgStats(nodes, edges).managers).toBe(1); // seul a encadre
  });

  it("anti-cycle : seuls les liens hiérarchiques comptent", () => {
    // c → a serait un cycle via la hiérarchie (a → c)
    expect(wouldCreateHierarchyCycle(edges, "c", "a")).toBe(true);
    // b → c existe en pointillé : c → b ne crée PAS de cycle hiérarchique
    expect(wouldCreateHierarchyCycle(edges, "b", "c")).toBe(false);
  });

  it("CSV : la colonne Responsable ne porte que la hiérarchie", () => {
    const lines = buildPeopleCsv(nodes, edges).split("\r\n");
    const lea = lines.find((l) => l.startsWith("Léa"))!;
    expect(lea.endsWith("Claire")).toBe(true); // pas Marc (dotted)
  });

  it("PPTX éditable : le connecteur pointillé est marqué dashed", () => {
    const spec = buildEditableSpec(nodes, edges, glassCapTheme, { x: 0, y: 0, width: 12, height: 6 });
    expect(spec.connectors).toHaveLength(3);
    expect(spec.connectors.filter((c) => c.dashed)).toHaveLength(1);
  });
});
