import { describe, expect, it } from "vitest";
import { guardCollaborativeOrgChart } from "./collaborationGuards";
import { demoCompany } from "../templates/demoCompany";

describe("guardCollaborativeOrgChart", () => {
  it("conserve un seul responsable déterministe après un conflit concurrent", () => {
    const target = demoCompany.nodes[1].id;
    const result = guardCollaborativeOrgChart({
      ...demoCompany,
      edges: [
        ...demoCompany.edges.filter((edge) => edge.target !== target),
        { id: "z-manager", source: demoCompany.nodes[2].id, target },
        { id: "a-manager", source: demoCompany.nodes[3].id, target },
      ],
    });

    expect(result.file.edges.filter((edge) => edge.target === target)).toEqual([
      { id: "a-manager", source: demoCompany.nodes[3].id, target },
    ]);
    expect(result.removedEdgeIds).toContain("z-manager");
  });

  it("casse un cycle sans supprimer les liens fonctionnels", () => {
    const [first, second, third] = demoCompany.nodes;
    const result = guardCollaborativeOrgChart({
      ...demoCompany,
      edges: [
        { id: "a", source: first.id, target: second.id },
        { id: "b", source: second.id, target: third.id },
        { id: "c", source: third.id, target: first.id },
        { id: "dotted", source: third.id, target: first.id, kind: "dotted" },
      ],
    });

    expect(result.file.edges.map((edge) => edge.id)).toEqual(["a", "b", "dotted"]);
    expect(result.removedEdgeIds).toEqual(["c"]);
  });

  it("retire les liens vers une carte supprimée", () => {
    const result = guardCollaborativeOrgChart({
      ...demoCompany,
      edges: [
        ...demoCompany.edges,
        { id: "orphan", source: demoCompany.nodes[0].id, target: "missing" },
      ],
    });

    expect(result.file.edges.some((edge) => edge.id === "orphan")).toBe(false);
  });
});

