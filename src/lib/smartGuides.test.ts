import { describe, expect, it } from "vitest";
import { mergeTargets, neighborGaps, rectTargets, snapPosition } from "./smartGuides";

describe("rectTargets", () => {
  it("expose bords et axes centraux d'un rectangle", () => {
    const t = rectTargets([{ x: 100, y: 50, width: 200, height: 100 }]);
    expect(t.v).toEqual([100, 200, 300]);
    expect(t.h).toEqual([50, 100, 150]);
  });
});

describe("snapPosition", () => {
  const card = { w: 240, h: 110 };

  it("aimante le bord gauche à une ligne verticale proche", () => {
    const targets = { v: [500], h: [] };
    const r = snapPosition(495, 0, card.w, card.h, targets, 8);
    expect(r.x).toBe(500);
    expect(r.vLine).toBe(500);
    expect(r.hLine).toBeUndefined();
  });

  it("aimante par le centre quand c'est la référence la plus proche", () => {
    // Centre de la carte : x + 120. Ligne à 620 → x devient 500.
    const targets = { v: [620], h: [] };
    const r = snapPosition(495, 0, card.w, card.h, targets, 8);
    expect(r.x).toBe(500);
  });

  it("chaque axe s'aimante indépendamment", () => {
    const targets = { v: [300], h: [200] };
    // Seul le haut de la carte (195) est dans le seuil de la ligne 200
    const r = snapPosition(297, 195, card.w, card.h, targets, 8);
    expect(r).toEqual({ x: 300, y: 200, vLine: 300, hLine: 200 });
  });

  it("hors du seuil : aucune aimantation", () => {
    const r = snapPosition(480, 480, card.w, card.h, { v: [500], h: [500] }, 8);
    expect(r).toEqual({ x: 480, y: 480, vLine: undefined, hLine: undefined });
  });

  it("choisit la cible la plus proche parmi plusieurs", () => {
    const r = snapPosition(503, 0, card.w, card.h, { v: [500, 508], h: [] }, 8);
    // 508 est à 5 px du bord gauche (503), 500 à 3 px → 500 gagne
    expect(r.x).toBe(500);
  });

  it("mergeTargets concatène les jeux de cibles", () => {
    const merged = mergeTargets({ v: [1], h: [2] }, { v: [3], h: [4] });
    expect(merged).toEqual({ v: [1, 3], h: [2, 4] });
  });
});

describe("neighborGaps", () => {
  const rect = { x: 200, y: 200, width: 100, height: 100 };

  it("détecte l'écart à droite avec un voisin aligné verticalement", () => {
    const right = { x: 350, y: 220, width: 100, height: 60 };
    const gaps = neighborGaps(rect, [right]);
    expect(gaps.right).toEqual({ axis: "x", gap: 50, at: 250, from: 300, to: 350 });
    expect(gaps.left).toBeUndefined();
    expect(gaps.top).toBeUndefined();
    expect(gaps.bottom).toBeUndefined();
  });

  it("détecte l'écart en bas avec un voisin aligné horizontalement", () => {
    const below = { x: 210, y: 350, width: 60, height: 100 };
    const gaps = neighborGaps(rect, [below]);
    expect(gaps.bottom).toEqual({ axis: "y", gap: 50, at: 240, from: 300, to: 350 });
  });

  it("ignore les rectangles qui ne se chevauchent sur aucun axe perpendiculaire", () => {
    const diagonal = { x: 400, y: 400, width: 50, height: 50 };
    const gaps = neighborGaps(rect, [diagonal]);
    expect(gaps).toEqual({});
  });

  it("choisit le voisin le plus proche dans une direction", () => {
    const near = { x: 350, y: 200, width: 50, height: 100 };
    const far = { x: 500, y: 200, width: 50, height: 100 };
    const gaps = neighborGaps(rect, [far, near]);
    expect(gaps.right?.gap).toBe(50);
  });

  it("ignore un voisin au-delà de maxGap", () => {
    const far = { x: 1200, y: 200, width: 50, height: 100 };
    const gaps = neighborGaps(rect, [far], 500);
    expect(gaps.right).toBeUndefined();
  });
});
