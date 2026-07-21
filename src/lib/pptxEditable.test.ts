import { describe, expect, it } from "vitest";
import { buildEditableSpec } from "./pptxEditable";
import { glassCapTheme, flatCorporateTheme } from "../templates/themes";
import type { OrgEdge, OrgNode } from "../types/orgchart";

const AREA = { x: 0.4, y: 1.35, width: 12.53, height: 5.45 };

function org(): { nodes: OrgNode[]; edges: OrgEdge[] } {
  const nodes: OrgNode[] = [
    { id: "a", position: { x: 300, y: 0 }, data: { name: "Claire Dubois", role: "DG", department: "Direction" } },
    { id: "b", position: { x: 0, y: 250 }, data: { name: "Marc Lefèvre" } },
    { id: "c", position: { x: 600, y: 250 }, data: { name: "Sophie Martin" } },
  ];
  const edges: OrgEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "a", target: "c" },
  ];
  return { nodes, edges };
}

describe("buildEditableSpec", () => {
  it("place toutes les cartes dans la zone de la diapositive", () => {
    const { nodes, edges } = org();
    const spec = buildEditableSpec(nodes, edges, glassCapTheme, AREA);
    expect(spec.cards).toHaveLength(3);
    for (const c of spec.cards) {
      expect(c.x).toBeGreaterThanOrEqual(AREA.x - 1e-9);
      expect(c.y).toBeGreaterThanOrEqual(AREA.y - 1e-9);
      expect(c.x + c.w).toBeLessThanOrEqual(AREA.x + AREA.width + 1e-9);
      expect(c.y + c.h).toBeLessThanOrEqual(AREA.y + AREA.height + 1e-9);
    }
  });

  it("crée un connecteur par lien, du bas du parent vers le haut de l'enfant", () => {
    const { nodes, edges } = org();
    const spec = buildEditableSpec(nodes, edges, glassCapTheme, AREA);
    expect(spec.connectors).toHaveLength(2);
    for (const conn of spec.connectors) {
      const first = conn.points[0];
      const last = conn.points[conn.points.length - 1];
      expect(last.y).toBeGreaterThan(first.y); // l'enfant est sous le parent
    }
    // l'un des enfants est à gauche du parent
    expect(
      spec.connectors.some((c) => c.points[c.points.length - 1].x < c.points[0].x)
    ).toBe(true);
    expect(
      spec.connectors.some((c) => c.points[c.points.length - 1].x > c.points[0].x)
    ).toBe(true);
  });

  it("cartes côte à côte : connecteur latéral, ancré au milieu des bords verticaux", () => {
    const nodes: OrgNode[] = [
      { id: "a", position: { x: 0, y: 0 }, data: { name: "Claire Dubois" } },
      { id: "b", position: { x: 600, y: 40 }, data: { name: "Marc Lefèvre" } },
    ];
    const edges: OrgEdge[] = [{ id: "e1", source: "a", target: "b" }];
    const spec = buildEditableSpec(nodes, edges, glassCapTheme, AREA);
    const [conn] = spec.connectors;
    const first = conn.points[0];
    const last = conn.points[conn.points.length - 1];
    const [cardA, cardB] = spec.cards;
    // Sortie au milieu du bord droit de A, arrivée au milieu du bord gauche de B
    expect(first.x).toBeCloseTo(cardA.x + cardA.w, 6);
    expect(first.y).toBeCloseTo(cardA.y + cardA.h / 2, 6);
    expect(last.x).toBeCloseTo(cardB.x, 6);
    expect(last.y).toBeCloseTo(cardB.y + cardB.h / 2, 6);
  });

  it("thème glass : fond blanc, bordure accent ; thème flat : fond palette + texte contrasté", () => {
    const { nodes, edges } = org();
    const glass = buildEditableSpec(nodes, edges, glassCapTheme, AREA);
    expect(glass.cards[0].fillColor).toBe("FFFFFF");
    expect(glass.cards[0].lineColor).toBe("472F74"); // niveau 0 de la palette

    const flat = buildEditableSpec(nodes, edges, flatCorporateTheme, AREA);
    expect(flat.cards[0].fillColor).toBe("2B3A55"); // fond = palette niveau 0
    expect(flat.cards[0].textColor).toBe("FFFFFF"); // contraste sur fond sombre
  });

  it("borne la taille de police entre 6 et 16 pt", () => {
    const { nodes, edges } = org();
    // organigramme minuscule → grande échelle → police plafonnée
    const spec = buildEditableSpec(nodes, edges, glassCapTheme, AREA);
    expect(spec.cards[0].namePt).toBeLessThanOrEqual(16);
    // organigramme géant → petite échelle → police plancher
    const wide = nodes.map((n, i) => ({ ...n, position: { x: i * 5000, y: 0 } }));
    const tiny = buildEditableSpec(wide, edges, glassCapTheme, AREA);
    expect(tiny.cards[0].namePt).toBeGreaterThanOrEqual(6);
  });

  it("retourne un spec vide sans nœuds", () => {
    const spec = buildEditableSpec([], [], glassCapTheme, AREA);
    expect(spec.cards).toHaveLength(0);
    expect(spec.connectors).toHaveLength(0);
  });

  it("préserve le placement absolu avec une projection fixe", () => {
    const nodes: OrgNode[] = [
      { id: "a", position: { x: 300, y: 450 }, data: { name: "Claire" } },
    ];
    const spec = buildEditableSpec(nodes, [], glassCapTheme, AREA, {
      originX: 100,
      originY: 150,
      inchesPerPx: 0.01,
    });

    expect(spec.cards[0].x).toBeCloseTo(2, 6);
    expect(spec.cards[0].y).toBeCloseTo(3, 6);
    expect(spec.cards[0].w).toBeCloseTo(2.4, 6);
  });

  it("expose l'e-mail (si affiché) et l'accent du niveau", () => {
    const nodes: OrgNode[] = [
      { id: "a", position: { x: 0, y: 0 }, data: { name: "Claire", email: "claire@corp.fr" } },
    ];
    const spec = buildEditableSpec(nodes, [], glassCapTheme, AREA);
    expect(spec.cards[0].email).toBe("claire@corp.fr");
    expect(spec.cards[0].accentColor).toBe("472F74");

    const hidden = buildEditableSpec(nodes, [], { ...glassCapTheme, display: { showEmails: false } }, AREA);
    expect(hidden.cards[0].email).toBeUndefined();
  });

  it("styles pleins : neon = fond sombre, gradient = fond accent, texte contrasté", () => {
    const { nodes, edges } = org();
    const neon = buildEditableSpec(nodes, edges, { ...glassCapTheme, nodeStyle: "neon" }, AREA);
    expect(neon.cards[0].fillColor).toBe("0C0A09");
    expect(neon.cards[0].textColor).toBe("FFFFFF");

    const gradient = buildEditableSpec(nodes, edges, { ...glassCapTheme, nodeStyle: "gradient" }, AREA);
    expect(gradient.cards[0].fillColor).toBe("472F74"); // accent niveau 0
    expect(gradient.cards[0].textColor).toBe("FFFFFF");
  });

  it("respecte les options d'affichage du thème (postes et pôles masqués)", () => {
    const { nodes, edges } = org();
    const theme = { ...glassCapTheme, display: { showRoles: false, showDepartments: false } };
    const spec = buildEditableSpec(nodes, edges, theme, AREA);
    expect(spec.cards[0].role).toBeUndefined();
    expect(spec.cards[0].department).toBeUndefined();
    expect(spec.cards[0].name).toBe("Claire Dubois");

    // par défaut (sans display), tout est affiché
    const full = buildEditableSpec(nodes, edges, glassCapTheme, AREA);
    expect(full.cards[0].role).toBe("DG");
    expect(full.cards[0].department).toBe("Direction");
  });
});
