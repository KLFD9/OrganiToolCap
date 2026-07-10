import { describe, expect, it } from "vitest";
import {
  chooseEdgeSides,
  computeElbowRoute,
  computeElbowRouteHorizontal,
  computeSmartRoute,
  computeObstacleAwareRoute,
  sideAnchor,
  type NodeRect,
} from "./edgeRouting";

const rect = (x: number, y: number, width = 240, height = 110): NodeRect => ({
  x,
  y,
  width,
  height,
});

describe("chooseEdgeSides", () => {
  it("cible sous la source → bas vers haut (lecture hiérarchique classique)", () => {
    expect(chooseEdgeSides(rect(0, 0), rect(100, 200))).toEqual({
      sourceSide: "bottom",
      targetSide: "top",
    });
  });

  it("cible au-dessus de la source → haut vers bas", () => {
    expect(chooseEdgeSides(rect(0, 300), rect(100, 0))).toEqual({
      sourceSide: "top",
      targetSide: "bottom",
    });
  });

  it("cartes côte à côte (bandes verticales qui se chevauchent) → liaison latérale", () => {
    expect(chooseEdgeSides(rect(0, 0), rect(400, 40))).toEqual({
      sourceSide: "right",
      targetSide: "left",
    });
    expect(chooseEdgeSides(rect(400, 0), rect(0, 40))).toEqual({
      sourceSide: "left",
      targetSide: "right",
    });
  });

  it("chevauchement partiel : c'est le chevauchement des bandes qui décide, pas le centre", () => {
    // La cible descend de 100 px mais chevauche encore la source de 10 px → latéral
    expect(chooseEdgeSides(rect(0, 0), rect(500, 100))).toEqual({
      sourceSide: "right",
      targetSide: "left",
    });
    // Dès que la cible passe entièrement sous la source → vertical
    expect(chooseEdgeSides(rect(0, 0), rect(500, 110))).toEqual({
      sourceSide: "bottom",
      targetSide: "top",
    });
  });
});

describe("sideAnchor", () => {
  it("ancre au centre de chaque côté", () => {
    const r = rect(100, 200, 240, 110);
    expect(sideAnchor(r, "top")).toEqual({ x: 220, y: 200 });
    expect(sideAnchor(r, "bottom")).toEqual({ x: 220, y: 310 });
    expect(sideAnchor(r, "left")).toEqual({ x: 100, y: 255 });
    expect(sideAnchor(r, "right")).toEqual({ x: 340, y: 255 });
  });
});

describe("computeElbowRouteHorizontal", () => {
  it("coude à mi-largeur entre deux attaches latérales", () => {
    expect(computeElbowRouteHorizontal(240, 55, 400, 155)).toEqual([
      { x: 240, y: 55 },
      { x: 320, y: 55 },
      { x: 320, y: 155 },
      { x: 400, y: 155 },
    ]);
  });

  it("dégénère en segment droit quand les X coïncident", () => {
    expect(computeElbowRouteHorizontal(240, 55, 240.5, 155)).toHaveLength(2);
  });
});

describe("computeSmartRoute", () => {
  it("vertical : coude classique bas → haut", () => {
    const { sourceSide, targetSide, points } = computeSmartRoute(rect(0, 0), rect(300, 200));
    expect(sourceSide).toBe("bottom");
    expect(targetSide).toBe("top");
    expect(points).toEqual(computeElbowRoute(120, 110, 420, 200));
  });

  it("latéral : coude horizontal droite → gauche", () => {
    const { sourceSide, points } = computeSmartRoute(rect(0, 0), rect(400, 40));
    expect(sourceSide).toBe("right");
    // Sortie au milieu du bord droit de la source, arrivée au milieu du bord gauche de la cible
    expect(points[0]).toEqual({ x: 240, y: 55 });
    expect(points[points.length - 1]).toEqual({ x: 400, y: 95 });
  });
});

describe("computeObstacleAwareRoute", () => {
  it("décale le corridor pour ne pas traverser une carte intermédiaire", () => {
    const source = { x: 120, y: 110 };
    const target = { x: 520, y: 300 };
    const obstacle = rect(260, 170, 140, 90);

    const route = computeObstacleAwareRoute(source, target, "y", [obstacle]);

    // Le corridor médian y=205 traverserait l'obstacle : il est décalé.
    expect(route[1].y).not.toBe(205);
    expect(route.every((point, index) => index === 0 || point.x === route[index - 1].x || point.y === route[index - 1].y)).toBe(true);
  });

  it("respecte un corridor manuel même si le routage automatique en choisirait un autre", () => {
    const route = computeObstacleAwareRoute(
      { x: 120, y: 110 },
      { x: 520, y: 300 },
      "y",
      [rect(260, 170, 140, 90)],
      { axis: "y", value: 140 }
    );

    expect(route[1].y).toBe(140);
  });
});
