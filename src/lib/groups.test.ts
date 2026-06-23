import { describe, expect, it } from "vitest";
import { computeDepartmentGroups, buildGroupTheme } from "./groups";
import type { OrgNode, OrgTheme } from "../types/orgchart";

function makeNode(id: string, x: number, y: number, department?: string): OrgNode {
  return { id, position: { x, y }, data: { name: id, department } };
}

describe("computeDepartmentGroups", () => {
  it("ignores nodes without a department", () => {
    const nodes = [makeNode("a", 0, 0), makeNode("b", 100, 100)];
    expect(computeDepartmentGroups(nodes)).toEqual([]);
  });

  it("groups nodes sharing the same department into one bounding box", () => {
    const nodes = [
      makeNode("a", 0, 0, "Tech"),
      makeNode("b", 300, 200, "Tech"),
      makeNode("c", 0, 0, "RH"),
    ];
    const groups = computeDepartmentGroups(nodes, { width: 240, height: 110 }, 28);

    expect(groups).toHaveLength(2);

    const tech = groups.find((g) => g.department === "Tech")!;
    expect(tech.x).toBe(0 - 28);
    expect(tech.y).toBe(0 - 28);
    expect(tech.width).toBe(300 + 240 - 0 + 28 * 2);
    expect(tech.height).toBe(200 + 110 - 0 + 28 * 2);

    const rh = groups.find((g) => g.department === "RH")!;
    expect(rh.x).toBe(-28);
    expect(rh.y).toBe(-28);
  });

  it("trims whitespace-only departments and treats them as undefined", () => {
    const nodes = [makeNode("a", 0, 0, "   ")];
    expect(computeDepartmentGroups(nodes)).toEqual([]);
  });

  it("preserves the order departments first appear", () => {
    const nodes = [
      makeNode("a", 0, 0, "RH"),
      makeNode("b", 0, 0, "Tech"),
      makeNode("c", 0, 0, "RH"),
    ];
    const groups = computeDepartmentGroups(nodes);
    expect(groups.map((g) => g.department)).toEqual(["RH", "Tech"]);
    expect(groups.map((g) => g.colorIndex)).toEqual([0, 1]);
  });
});

describe("buildGroupTheme", () => {
  const theme: OrgTheme = {
    accent: "#472F74",
    palette: ["#111111", "#222222", "#333333"],
    fontFamily: "Inter",
    nodeStyle: "card",
    cornerRadius: 12,
  };

  it("picks the palette color matching the index", () => {
    expect(buildGroupTheme(theme, 0)).toBe("#111111");
    expect(buildGroupTheme(theme, 1)).toBe("#222222");
  });

  it("wraps around the palette when index exceeds its length", () => {
    expect(buildGroupTheme(theme, 3)).toBe("#111111");
    expect(buildGroupTheme(theme, 4)).toBe("#222222");
  });
});
