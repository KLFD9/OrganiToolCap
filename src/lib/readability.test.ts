import { describe, expect, it } from "vitest";
import { estimateReadability, pageAvailableArea } from "./readability";

describe("pageAvailableArea", () => {
  it("calcule la zone utile A4 paysage", () => {
    const area = pageAvailableArea("a4", "landscape", 10, 30, 18);
    expect(area.width).toBe(297 - 20);
    expect(area.height).toBe(210 - 48);
  });

  it("l'A3 offre une zone plus grande que l'A4", () => {
    const a4 = pageAvailableArea("a4", "landscape", 10, 10, 10);
    const a3 = pageAvailableArea("a3", "landscape", 10, 10, 10);
    expect(a3.width).toBeGreaterThan(a4.width);
    expect(a3.height).toBeGreaterThan(a4.height);
  });
});

describe("estimateReadability", () => {
  it("juge lisible un petit organigramme sur A4 paysage", () => {
    // 3 cartes de large (~820 px) sur zone 277×160 mm → échelle confortable
    const r = estimateReadability(820, 400, 277, 160);
    expect(r.rating).toBe("good");
    expect(r.fontPt).toBeGreaterThan(6.5);
  });

  it("juge illisible un organigramme très large sur A4", () => {
    // ~13 cartes de front (ratio 5:1, le cas du client) → texte minuscule
    const r = estimateReadability(3900, 800, 277, 160);
    expect(r.rating).toBe("bad");
    expect(r.fontPt).toBeLessThan(4.5);
  });

  it("le même organigramme compacté redevient lisible", () => {
    // Après disposition compacte : ratio ~1,8:1 (≈1000×550 px)
    const wide = estimateReadability(3900, 800, 277, 160);
    const compact = estimateReadability(1000, 550, 277, 160);
    expect(compact.fontPt).toBeGreaterThan(wide.fontPt * 2);
    expect(compact.rating).toBe("good");
  });

  it("l'échelle est bornée par la dimension la plus contraignante", () => {
    // contenu très haut : c'est la hauteur de page qui limite
    const r = estimateReadability(500, 4000, 277, 160);
    expect(r.cardWidthMm).toBeLessThan(15);
  });
});
