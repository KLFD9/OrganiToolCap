import { describe, expect, it } from "vitest";
import type { OrgChartFile, OrgEdge, OrgNode } from "../types/orgchart";
import { compareOrgCharts } from "./orgChartDiff";

function node(id: string, name: string, email: string, role?: string, department?: string): OrgNode {
  return { id, position: { x: 0, y: 0 }, data: { name, email, role, department } };
}

function file(nodes: OrgNode[], edges: OrgEdge[] = []): OrgChartFile {
  return {
    format: "orgchart",
    version: 2,
    meta: { title: "Test", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    templateId: "blank",
    theme: {
      accent: "#472F74",
      palette: ["#472F74"],
      fontFamily: "Inter",
      nodeStyle: "flat",
      cornerRadius: 8,
    },
    nodes,
    edges,
    layout: { direction: "TB", auto: false },
  };
}

describe("compareOrgCharts", () => {
  it("rapproche par e-mail malgré un changement d'identifiant et détecte les évolutions", () => {
    const aliceBefore = node("old-a", "Alice", "alice@example.com", "Directrice", "Direction");
    const bobBefore = node("old-b", "Bob", "bob@example.com", "Chargé", "Marketing");
    const aliceNow = node("new-a", "Alice", "alice@example.com", "Présidente", "Direction");
    const claraNow = node("new-c", "Clara", "clara@example.com", "RH", "RH");
    const diff = compareOrgCharts(
      file([aliceBefore, bobBefore], [{ id: "e1", source: "old-a", target: "old-b" }]),
      file([aliceNow, claraNow], [])
    );

    expect(diff.arrivals.map((item) => item.data.name)).toEqual(["Clara"]);
    expect(diff.departures.map((item) => item.data.name)).toEqual(["Bob"]);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0].fields).toContainEqual(
      expect.objectContaining({ label: "Poste", before: "Directrice", after: "Présidente" })
    );
  });

  it("détecte un changement de responsable et de rattachement fonctionnel", () => {
    const a = node("a", "Alice", "alice@example.com");
    const b = node("b", "Bob", "bob@example.com");
    const c = node("c", "Clara", "clara@example.com");
    const reference = file([a, b, c], [{ id: "h1", source: "a", target: "b" }]);
    const current = file([a, b, c], [
      { id: "h2", source: "c", target: "b" },
      { id: "d1", source: "a", target: "b", kind: "dotted" },
    ]);

    const diff = compareOrgCharts(reference, current);
    const bob = diff.changes.find((change) => change.name === "Bob")!;
    expect(bob.fields.map((field) => field.label)).toEqual([
      "Responsable",
      "Rattachements fonctionnels",
    ]);
  });

  it("ne rapproche pas silencieusement deux personnes avec la même identité", () => {
    const previous = node("old", "Alex Martin", "", "Designer", "Création");
    const current = file([
      node("new-1", "Alex Martin", "", "Designer", "Création"),
      node("new-2", "Alex Martin", "", "Designer", "Création"),
    ]);

    const diff = compareOrgCharts(file([previous]), current);
    expect(diff.departures).toHaveLength(1);
    expect(diff.arrivals).toHaveLength(2);
    expect(diff.ambiguities).toHaveLength(1);
  });

  it("ignore les identifiants positionnels identiques de deux imports tabulaires", () => {
    const reference = file([node("import-1", "Alice", "alice@example.com")]);
    const current = file([node("import-1", "Bob", "bob@example.com")]);

    const diff = compareOrgCharts(reference, current);
    expect(diff.arrivals.map((item) => item.data.name)).toEqual(["Bob"]);
    expect(diff.departures.map((item) => item.data.name)).toEqual(["Alice"]);
  });
});
