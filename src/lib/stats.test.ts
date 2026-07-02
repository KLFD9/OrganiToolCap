import { describe, expect, it } from "vitest";
import { computeOrgStats, computeTeamSize, NO_DEPARTMENT_LABEL } from "./stats";
import type { OrgEdge, OrgNode } from "../types/orgchart";

function node(id: string, department?: string): OrgNode {
  return { id, data: { name: id, department }, position: { x: 0, y: 0 } };
}

// a (Direction) → b (Ops), c (Ops) ; b → d (Marketing), e (sans pôle)
const nodes: OrgNode[] = [
  node("a", "Direction"),
  node("b", "Ops"),
  node("c", "Ops"),
  node("d", "Marketing"),
  node("e"),
];
const edges: OrgEdge[] = [
  { id: "1", source: "a", target: "b" },
  { id: "2", source: "a", target: "c" },
  { id: "3", source: "b", target: "d" },
  { id: "4", source: "b", target: "e" },
];

describe("computeOrgStats", () => {
  it("calcule effectif, encadrants et profondeur", () => {
    const stats = computeOrgStats(nodes, edges);
    expect(stats.total).toBe(5);
    expect(stats.managers).toBe(2); // a et b
    expect(stats.depth).toBe(3);
  });

  it("répartit par pôle en ordre décroissant, sans-pôle regroupés", () => {
    const stats = computeOrgStats(nodes, edges);
    expect(stats.byDepartment[0]).toEqual({ department: "Ops", count: 2 });
    expect(stats.byDepartment).toContainEqual({ department: NO_DEPARTMENT_LABEL, count: 1 });
  });

  it("gère un organigramme vide", () => {
    const stats = computeOrgStats([], []);
    expect(stats.total).toBe(0);
    expect(stats.depth).toBe(0);
    expect(stats.byDepartment).toEqual([]);
  });
});

describe("computeTeamSize", () => {
  it("distingue subordonnés directs et équipe totale", () => {
    expect(computeTeamSize(edges, "a")).toEqual({ direct: 2, total: 4 });
    expect(computeTeamSize(edges, "b")).toEqual({ direct: 2, total: 2 });
    expect(computeTeamSize(edges, "e")).toEqual({ direct: 0, total: 0 });
  });
});
