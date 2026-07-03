import { describe, expect, it } from "vitest";
import { buildPeopleCsv, escapeCsvCell } from "./csvExport";
import { importPeopleCsv } from "./csvImport";
import type { OrgEdge, OrgNode } from "../types/orgchart";

function org(): { nodes: OrgNode[]; edges: OrgEdge[] } {
  const nodes: OrgNode[] = [
    {
      id: "a",
      position: { x: 0, y: 0 },
      data: { name: "Claire Dubois", role: "Directrice Générale", department: "Direction", email: "claire@corp.fr" },
    },
    {
      id: "b",
      position: { x: 0, y: 200 },
      data: { name: "Marc Lefèvre", role: "Directeur ; Opérations", department: "Pôle Ops" },
    },
    { id: "c", position: { x: 300, y: 200 }, data: { name: 'Léa "Lély" Girard' } },
  ];
  const edges: OrgEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "a", target: "c" },
  ];
  return { nodes, edges };
}

describe("escapeCsvCell", () => {
  it("met entre guillemets si séparateur, guillemet ou retour à la ligne", () => {
    expect(escapeCsvCell("simple")).toBe("simple");
    expect(escapeCsvCell("a;b")).toBe('"a;b"');
    expect(escapeCsvCell('dit "chef"')).toBe('"dit ""chef"""');
  });
});

describe("buildPeopleCsv", () => {
  it("génère l'en-tête standard et une ligne par membre avec son responsable", () => {
    const { nodes, edges } = org();
    const csv = buildPeopleCsv(nodes, edges);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Nom;Poste;Pôle;Email;Responsable");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("Claire Dubois");
    expect(lines[2]).toContain("Claire Dubois"); // responsable de Marc
    expect(lines[2]).toContain('"Directeur ; Opérations"'); // échappé
  });

  it("round-trip : le CSV exporté se réimporte avec la même structure", () => {
    const { nodes, edges } = org();
    const result = importPeopleCsv(buildPeopleCsv(nodes, edges));
    expect(result.warnings).toEqual([]);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);

    const byName = new Map(result.nodes.map((n) => [n.data.name, n]));
    expect(byName.get("Marc Lefèvre")?.data.role).toBe("Directeur ; Opérations");
    expect(byName.get("Claire Dubois")?.data.email).toBe("claire@corp.fr");
    expect(byName.get('Léa "Lély" Girard')).toBeDefined();

    // La hiérarchie est reconstruite : Claire est responsable des deux autres
    const claireId = byName.get("Claire Dubois")!.id;
    expect(result.edges.every((e) => e.source === claireId)).toBe(true);
  });

  it("gère un organigramme vide", () => {
    expect(buildPeopleCsv([], []).split("\r\n")).toHaveLength(1);
  });
});
