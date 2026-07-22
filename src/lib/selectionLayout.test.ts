import { describe, expect, it } from "vitest";
import { arrangeSelection, distributionGap, type SelectionRect } from "./selectionLayout";

const rects: SelectionRect[] = [
  { id: "a", x: 10, y: 20, width: 100, height: 40 },
  { id: "b", x: 180, y: 90, width: 80, height: 60 },
  { id: "c", x: 350, y: 180, width: 120, height: 50 },
];

describe("arrangeSelection", () => {
  it("aligne des cartes de tailles différentes sur leurs bords", () => {
    expect(arrangeSelection(rects, "align-right").map((item) => item.position.x)).toEqual([
      370, 390, 350,
    ]);
    expect(arrangeSelection(rects, "align-bottom").map((item) => item.position.y)).toEqual([
      190, 170, 180,
    ]);
  });

  it("centre les cartes dans les limites de la sélection", () => {
    expect(arrangeSelection(rects, "align-center-x").map((item) => item.position.x)).toEqual([
      190, 200, 180,
    ]);
    expect(arrangeSelection(rects, "align-center-y").map((item) => item.position.y)).toEqual([
      105, 95, 100,
    ]);
  });

  it("répartit un espace égal en conservant les cartes extérieures", () => {
    const result = arrangeSelection(rects, "distribute-x");
    expect(result[0].position.x).toBe(10);
    expect(result[1].position.x).toBe(190);
    expect(result[2].position.x).toBe(350);
  });

  it("ne distribue pas une sélection de moins de trois cartes", () => {
    expect(arrangeSelection(rects.slice(0, 2), "distribute-y")).toEqual([
      { id: "a", position: { x: 10, y: 20 } },
      { id: "b", position: { x: 180, y: 90 } },
    ]);
  });

  it("refuse une répartition qui ferait se chevaucher les cartes", () => {
    const crowded: SelectionRect[] = [
      { id: "a", x: 0, y: 0, width: 100, height: 40 },
      { id: "b", x: 40, y: 80, width: 100, height: 40 },
      { id: "c", x: 120, y: 160, width: 100, height: 40 },
    ];

    expect(distributionGap(crowded, "x")).toBe(-40);
    expect(arrangeSelection(crowded, "distribute-x")).toEqual(
      crowded.map(({ id, x, y }) => ({ id, position: { x, y } }))
    );
  });

  it("calcule séparément la place disponible sur chaque axe", () => {
    expect(distributionGap(rects, "x")).toBe(80);
    expect(distributionGap(rects, "y")).toBe(30);
    expect(distributionGap(rects.slice(0, 2), "x")).toBeUndefined();
  });

  it("ne modifie pas les rectangles reçus", () => {
    const original = structuredClone(rects);
    arrangeSelection(rects, "distribute-y");
    expect(rects).toEqual(original);
  });
});
