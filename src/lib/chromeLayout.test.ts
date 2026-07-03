import { describe, expect, it } from "vitest";
import { defaultChromeElement, resolveChromeElement, CHROME_HEADER_MM } from "./chromeLayout";
import { pageSizeMm, type PageSetup } from "./readability";

const A4L: PageSetup = { format: "a4", orientation: "landscape", margin: 10 };

describe("defaultChromeElement", () => {
  it("place le logo principal au coin de la marge, hauteur de la bande d'en-tête", () => {
    const logo = defaultChromeElement("logo", A4L);
    expect(logo).toEqual({ x: 10, y: 10, size: CHROME_HEADER_MM });
  });

  it("aligne le logo secondaire sur la marge droite selon son ratio", () => {
    const el = defaultChromeElement("secondaryLogo", A4L, { logoAspect: 2 });
    const { width } = pageSizeMm("a4", "landscape");
    expect(el.x).toBeCloseTo(width - 10 - CHROME_HEADER_MM * 2, 5);
  });

  it("centre le titre horizontalement quand la mesure du texte est fournie", () => {
    const el = defaultChromeElement("title", A4L, {
      text: "Organigramme",
      measureTextMm: () => 60,
    });
    const { width } = pageSizeMm("a4", "landscape");
    expect(el.x).toBeCloseTo(width / 2 - 30, 5);
    expect(el.y).toBeGreaterThan(10);
    expect(el.y).toBeLessThan(10 + CHROME_HEADER_MM);
  });

  it("place le footer dans la marge basse", () => {
    const el = defaultChromeElement("footer", A4L, { text: "Confidentiel", measureTextMm: () => 30 });
    const { height } = pageSizeMm("a4", "landscape");
    expect(el.y).toBeGreaterThan(height - 10);
    expect(el.y).toBeLessThan(height);
  });
});

describe("resolveChromeElement", () => {
  it("la position stockée fait foi sur le défaut", () => {
    const stored = { x: 200, y: 5, size: 20 };
    expect(resolveChromeElement({ title: stored }, "title", A4L)).toEqual(stored);
    expect(resolveChromeElement({}, "logo", A4L)).toEqual(defaultChromeElement("logo", A4L));
    expect(resolveChromeElement(undefined, "logo", A4L)).toEqual(defaultChromeElement("logo", A4L));
  });
});
