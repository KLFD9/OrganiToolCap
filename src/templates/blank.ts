import type { OrgChartFile } from "../types/orgchart";
import { TEMPLATES_BY_ID, glassCapTheme } from "./themes";

export function createBlankChart(templateId: string): OrgChartFile {
  const now = new Date().toISOString();
  const theme = TEMPLATES_BY_ID[templateId]?.theme ?? glassCapTheme;

  return {
    format: "orgchart",
    version: 2,
    meta: {
      title: "Nouvel organigramme",
      createdAt: now,
      updatedAt: now,
    },
    templateId,
    theme,
    layout: { direction: "TB", auto: true },
    nodes: [
      {
        id: "root",
        position: { x: 0, y: 0 },
        data: { name: "Nom Prénom", role: "Direction" },
      },
    ],
    edges: [],
  };
}
