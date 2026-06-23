import { describe, expect, it } from "vitest";
import { computeSlideContentArea, SLIDE_HEIGHT_IN, SLIDE_WIDTH_IN } from "./pptxExport";
import { fitContain } from "./pdfExport";

describe("computeSlideContentArea", () => {
  it("occupe presque toute la diapositive sans en-tête ni pied de page", () => {
    const area = computeSlideContentArea(false, false);
    expect(area.x).toBeGreaterThan(0);
    expect(area.width).toBeLessThan(SLIDE_WIDTH_IN);
    expect(area.y + area.height).toBeLessThan(SLIDE_HEIGHT_IN);
  });

  it("réserve la zone d'en-tête quand titre ou logos sont présents", () => {
    const without = computeSlideContentArea(false, false);
    const withHeader = computeSlideContentArea(true, false);
    expect(withHeader.y).toBeGreaterThan(without.y);
    expect(withHeader.height).toBeLessThan(without.height);
  });

  it("réserve la zone de pied de page", () => {
    const without = computeSlideContentArea(false, false);
    const withFooter = computeSlideContentArea(false, true);
    expect(withFooter.height).toBeLessThan(without.height);
    expect(withFooter.y).toBe(without.y);
  });

  it("l'image placée en fit-contain reste dans la zone utile", () => {
    const area = computeSlideContentArea(true, true);
    // organigramme très large (paysage) puis très haut (portrait)
    for (const [w, h] of [
      [4000, 1000],
      [800, 3000],
    ]) {
      const p = fitContain(w, h, area.x, area.y, area.width, area.height);
      expect(p.x).toBeGreaterThanOrEqual(area.x);
      expect(p.y).toBeGreaterThanOrEqual(area.y);
      expect(p.x + p.width).toBeLessThanOrEqual(area.x + area.width + 1e-9);
      expect(p.y + p.height).toBeLessThanOrEqual(area.y + area.height + 1e-9);
      // le ratio d'aspect est préservé
      expect(p.width / p.height).toBeCloseTo(w / h, 5);
    }
  });
});
