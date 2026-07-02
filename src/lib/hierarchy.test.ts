import { describe, expect, it } from "vitest";
import { buildChildrenMap, computeDescendants, computeDescendantCounts, computeHiddenNodeIds } from "./hierarchy";
import type { OrgEdge } from "../types/orgchart";

// Arbre : a → (b, c) ; b → (d, e) ; d → f
const edges: OrgEdge[] = [
  { id: "1", source: "a", target: "b" },
  { id: "2", source: "a", target: "c" },
  { id: "3", source: "b", target: "d" },
  { id: "4", source: "b", target: "e" },
  { id: "5", source: "d", target: "f" },
];

describe("buildChildrenMap", () => {
  it("regroupe les subordonnés directs par responsable", () => {
    const map = buildChildrenMap(edges);
    expect(map.get("a")).toEqual(["b", "c"]);
    expect(map.get("b")).toEqual(["d", "e"]);
    expect(map.get("c")).toBeUndefined();
  });
});

describe("computeDescendants", () => {
  it("renvoie tous les descendants directs et indirects", () => {
    expect(computeDescendants(edges, "b")).toEqual(new Set(["d", "e", "f"]));
  });

  it("renvoie un ensemble vide pour une feuille", () => {
    expect(computeDescendants(edges, "f").size).toBe(0);
  });
});

describe("computeHiddenNodeIds", () => {
  it("masque les descendants de chaque branche repliée", () => {
    expect(computeHiddenNodeIds(["b"], edges)).toEqual(new Set(["d", "e", "f"]));
  });

  it("cumule plusieurs branches repliées", () => {
    expect(computeHiddenNodeIds(["b", "c"], edges)).toEqual(new Set(["d", "e", "f"]));
    expect(computeHiddenNodeIds(["d", "b"], edges)).toEqual(new Set(["d", "e", "f"]));
  });

  it("ne masque rien sans branche repliée", () => {
    expect(computeHiddenNodeIds([], edges).size).toBe(0);
  });

  it("le nœud replié reste visible (seule sa descendance est masquée)", () => {
    expect(computeHiddenNodeIds(["a"], edges).has("a")).toBe(false);
  });
});

describe("computeDescendantCounts", () => {
  it("compte l'équipe totale de chaque responsable", () => {
    const counts = computeDescendantCounts(edges);
    expect(counts.get("a")).toBe(5);
    expect(counts.get("b")).toBe(3);
    expect(counts.get("d")).toBe(1);
    expect(counts.get("f") ?? 0).toBe(0);
  });

  it("survit à un cycle dans un fichier malformé", () => {
    const cyclic: OrgEdge[] = [
      { id: "1", source: "x", target: "y" },
      { id: "2", source: "y", target: "x" },
    ];
    const counts = computeDescendantCounts(cyclic);
    expect(counts.get("x")).toBeGreaterThanOrEqual(1);
  });
});
