import { describe, expect, it } from "vitest";
import {
  chromeFontStyle,
  defaultChromeElement,
  resolveChromeElement,
  resolveChromeTextStyle,
  CHROME_HEADER_MM,
} from "./chromeLayout";
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

describe("resolveChromeTextStyle", () => {
  it("donne une hiérarchie typographique claire par défaut", () => {
    expect(resolveChromeTextStyle("title", undefined)).toMatchObject({ bold: true, italic: false });
    expect(resolveChromeTextStyle("subtitle", undefined)).toMatchObject({ bold: false, italic: false });
  });

  it("respecte les choix explicites et compose la variante de police", () => {
    const style = resolveChromeTextStyle("title", {
      x: 0,
      y: 0,
      size: 18,
      bold: false,
      italic: true,
      color: "#2457A6",
    });
    expect(style).toEqual({ bold: false, italic: true, color: "#2457A6" });
    expect(chromeFontStyle(style)).toBe("italic");
    expect(chromeFontStyle({ bold: true, italic: true })).toBe("bolditalic");
  });
});
