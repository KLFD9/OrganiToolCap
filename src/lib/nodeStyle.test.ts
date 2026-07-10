import { describe, expect, it } from "vitest";
import { computeInheritedAccentColors, computeLevels, computeNodeHeight, computeNodeStyle } from "./nodeStyle";
import type { OrgEdge, OrgNode, OrgTheme } from "../types/orgchart";

function makeNode(id: string): OrgNode {
  return { id, position: { x: 0, y: 0 }, data: { name: id } };
}

describe("computeLevels", () => {
  it("assigns level 0 to roots and increments per generation", () => {
    const nodes = [makeNode("root"), makeNode("a"), makeNode("b"), makeNode("c")];
    const edges: OrgEdge[] = [
      { id: "e1", source: "root", target: "a" },
      { id: "e1b", source: "root", target: "b" },
      { id: "e2", source: "a", target: "c" },
    ];

    const levels = computeLevels(nodes, edges);

    expect(levels.get("root")).toBe(0);
    expect(levels.get("a")).toBe(1);
    expect(levels.get("b")).toBe(1);
    expect(levels.get("c")).toBe(2);
  });

  it("does not loop forever and assigns a level to every node even with cyclic edges", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges: OrgEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "a" },
    ];

    const levels = computeLevels(nodes, edges);

    expect(levels.size).toBe(2);
    expect(levels.get("a")).toBeTypeOf("number");
    expect(levels.get("b")).toBeTypeOf("number");
  });
});

describe("computeNodeStyle", () => {
  const theme: OrgTheme = {
    accent: "#472F74",
    palette: ["#111111", "#222222", "#333333"],
    fontFamily: "sans-serif",
    nodeStyle: "card",
    cornerRadius: 8,
  };

  it("clamps the palette index to the deepest available level", () => {
    const styleAtMax = computeNodeStyle(theme, 2);
    const styleBeyondMax = computeNodeStyle(theme, 10);

    expect(styleBeyondMax.accentColor).toBe(styleAtMax.accentColor);
    expect(styleBeyondMax.accentColor).toBe("#333333");
  });

  it("merges styleOverride on top of the computed base style", () => {
    const style = computeNodeStyle(theme, 0, { accentColor: "#ff0000" });
    expect(style.accentColor).toBe("#ff0000");
    expect(style.background).toBe("#ffffff"); // base "card" style préservé
  });
});

describe("computeNodeHeight", () => {
  const display = {
    showPhotos: true,
    showRoles: true,
    showDepartments: true,
    showEmails: true,
    showPhones: true,
  };

  it("réserve la place des informations visibles sans modifier les cartes simples", () => {
    const simple = makeNode("simple");
    const detailed: OrgNode = {
      ...makeNode("detailed"),
      data: { name: "Détaillé", department: "Finance", email: "a@b.fr", phone: "0102030405" },
    };

    expect(computeNodeHeight(simple, display)).toBe(110);
    expect(computeNodeHeight(detailed, display)).toBe(184);
  });

  it("ignore les champs masqués par le thème", () => {
    const node: OrgNode = {
      ...makeNode("hidden"),
      data: { name: "Masqué", department: "RH", email: "a@b.fr", phone: "0102030405" },
    };

    expect(
      computeNodeHeight(node, { ...display, showDepartments: false, showEmails: false, showPhones: false })
    ).toBe(110);
  });
});

describe("computeInheritedAccentColors", () => {
  it("propage la couleur du responsable dans sa branche", () => {
    const nodes = [
      { ...makeNode("root"), styleOverride: { accentColor: "#729A37" } },
      makeNode("child"),
      makeNode("grandchild"),
    ];
    const edges: OrgEdge[] = [
      { id: "e1", source: "root", target: "child" },
      { id: "e2", source: "child", target: "grandchild" },
    ];

    const colors = computeInheritedAccentColors(nodes, edges);

    expect(colors.get("root")).toBe("#729A37");
    expect(colors.get("child")).toBe("#729A37");
    expect(colors.get("grandchild")).toBe("#729A37");
  });

  it("priorise la couleur de l'enfant et ignore les liens fonctionnels", () => {
    const nodes = [
      { ...makeNode("root"), styleOverride: { accentColor: "#729A37" } },
      { ...makeNode("child"), styleOverride: { accentColor: "#3E92D0" } },
      makeNode("functional"),
    ];
    const edges: OrgEdge[] = [
      { id: "e1", source: "root", target: "child" },
      { id: "e2", source: "root", target: "functional", kind: "dotted" },
    ];

    const colors = computeInheritedAccentColors(nodes, edges);

    expect(colors.get("child")).toBe("#3E92D0");
    expect(colors.has("functional")).toBe(false);
  });
});
