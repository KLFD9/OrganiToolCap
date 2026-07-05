import { describe, expect, it } from "vitest";
import { demoCompany } from "./demoCompany";
import { OrgChartFileSchema, dottedEdges } from "../types/orgchart";
import { availableAreaForSetup, estimateReadability, DEFAULT_PAGE } from "../lib/readability";

const demoPage = demoCompany.layout.page ?? DEFAULT_PAGE;
import { CARD_HEIGHT, CARD_WIDTH } from "../lib/compactLayout";

/** Marge de capture autour du contenu, comme le cadre de page (Canvas). */
const CAPTURE_MARGIN = 1.12;

describe("demoCompany (Société Horizon)", () => {
  it("est un fichier .orgchart.json valide (schéma v2)", () => {
    expect(() => OrgChartFileSchema.parse(demoCompany)).not.toThrow();
    expect(demoCompany.meta.title).toContain("Exemple");
    expect(dottedEdges(demoCompany.edges)).toHaveLength(1);
  });

  it("tient dans le cadre A4 paysage à l'ouverture : la première impression est « lisible »", () => {
    const xs = demoCompany.nodes.map((n) => n.position.x);
    const ys = demoCompany.nodes.map((n) => n.position.y);
    const width = (Math.max(...xs) - Math.min(...xs) + CARD_WIDTH) * CAPTURE_MARGIN;
    const height = (Math.max(...ys) - Math.min(...ys) + CARD_HEIGHT) * CAPTURE_MARGIN;

    const avail = availableAreaForSetup(demoPage, {
      title: demoCompany.meta.title,
      footer: demoCompany.meta.footer,
      logoUrl: demoCompany.theme.logoUrl,
      secondaryLogoUrl: demoCompany.theme.secondaryLogoUrl,
    });
    const estimate = estimateReadability(width, height, avail.width, avail.height);
    expect(estimate.rating).toBe("good");
  });

  it("e-mails factices normalisés (sans accents, domaine exemple.fr)", () => {
    for (const node of demoCompany.nodes) {
      expect(node.data.email).toMatch(/^[a-z.]+@exemple\.fr$/);
    }
  });
});
