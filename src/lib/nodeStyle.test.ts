import { describe, expect, it } from "vitest";
import { computeLevels, computeNodeStyle } from "./nodeStyle";
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
