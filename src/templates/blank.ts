import type { OrgChartFile } from "../types/orgchart";
import { DEFAULT_PAGE } from "../lib/readability";
import { frameSizePx, nextFramePosition, nodesBounds } from "../lib/frames";
import { CARD_HEIGHT, CARD_WIDTH } from "../lib/compactLayout";
import { TEMPLATES_BY_ID, glassCapTheme } from "./themes";

export function createBlankChart(templateId: string): OrgChartFile {
  const now = new Date().toISOString();
  const theme = TEMPLATES_BY_ID[templateId]?.theme ?? glassCapTheme;
  const page = { ...DEFAULT_PAGE, placement: "exact" as const };
  const pageSize = frameSizePx(page);

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
    layout: { direction: "TB", auto: true, page },
    nodes: [
      {
        id: "root",
        position: {
          x: (pageSize.width - CARD_WIDTH) / 2,
          y: (pageSize.height - CARD_HEIGHT) / 2,
        },
        data: { name: "Nom Prénom", role: "Direction" },
      },
    ],
    edges: [],
    frames: [{ id: "page-1", name: "Page 1", position: { x: 0, y: 0 }, page }],
  };
}

/**
 * Accueil neutre de l'application : une vraie feuille, sans fausse donnée RH.
 * La première carte est créée uniquement quand l'utilisateur le demande.
 */
export function createEmptyChart(templateId = "glass-cap"): OrgChartFile {
  const chart = createBlankChart(templateId);
  return {
    ...chart,
    nodes: [],
  };
}

const LEGACY_DEMO_TITLE = "Exemple — Société Horizon";
const LEGACY_DEMO_SUBTITLE = "Organigramme de démonstration, à remplacer par le vôtre";

/**
 * Rend un brouillon historique immédiatement éditable dans l'UX actuelle.
 * Aucun changement de version : `frames` et le chrome restent additifs.
 */
export function prepareDraftForResume(file: OrgChartFile): OrgChartFile {
  const page = file.layout.page ?? { ...DEFAULT_PAGE, placement: "fit" as const };
  const legacyDemoChrome =
    file.meta.title === LEGACY_DEMO_TITLE && file.meta.subtitle === LEGACY_DEMO_SUBTITLE;

  return {
    ...file,
    meta: legacyDemoChrome
      ? { ...file.meta, title: "Nouvel organigramme", subtitle: undefined }
      : file.meta,
    frames:
      file.frames && file.frames.length > 0
        ? file.frames
        : [
            {
              id: "page-1",
              name: "Page 1",
              position: nextFramePosition([], page, nodesBounds(file.nodes)),
              page,
            },
          ],
  };
}
