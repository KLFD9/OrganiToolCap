import { describe, expect, it } from "vitest";
import { OrgChartFileSchema } from "../types/orgchart";
import { computeFrameMembership } from "../lib/frames";
import { createBlankChart, createEmptyChart, prepareDraftForResume } from "./blank";

describe("createEmptyChart", () => {
  it("crée un accueil valide, sans fausse personne et avec une page visible", () => {
    const chart = createEmptyChart();

    expect(() => OrgChartFileSchema.parse(chart)).not.toThrow();
    expect(chart.nodes).toEqual([]);
    expect(chart.edges).toEqual([]);
    expect(chart.frames).toHaveLength(1);
    expect(chart.frames?.[0].name).toBe("Page 1");
    expect(chart.frames?.[0].page.placement).toBe("exact");
    expect(computeFrameMembership(chart.frames ?? [], chart.nodes).orphanIds.size).toBe(0);
  });
});

describe("prepareDraftForResume", () => {
  it("matérialise la page implicite autour du contenu existant", () => {
    const draft = createBlankChart("glass-cap");
    draft.frames = undefined;
    if (draft.layout.page) draft.layout.page = { ...draft.layout.page, placement: undefined };
    const resumed = prepareDraftForResume(draft);
    const membership = computeFrameMembership(resumed.frames ?? [], resumed.nodes);

    expect(resumed.frames).toHaveLength(1);
    expect(membership.frameOf.get("root")).toBe("page-1");
    expect(membership.orphanIds.size).toBe(0);
    expect(resumed.frames?.[0].page.placement).toBeUndefined();
  });

  it("retire le chrome exact de l'ancienne démonstration sans supprimer le contenu", () => {
    const draft = createBlankChart("glass-cap");
    draft.meta.title = "Exemple — Société Horizon";
    draft.meta.subtitle = "Organigramme de démonstration, à remplacer par le vôtre";

    const resumed = prepareDraftForResume(draft);

    expect(resumed.meta.title).toBe("Nouvel organigramme");
    expect(resumed.meta.subtitle).toBeUndefined();
    expect(resumed.nodes).toEqual(draft.nodes);
  });
});
