import { describe, expect, it } from "vitest";
import { mergeTargets, rectTargets, snapPosition } from "./smartGuides";

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
