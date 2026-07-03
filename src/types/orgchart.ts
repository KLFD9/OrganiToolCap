import { z } from "zod";

export const NodeStyleVariantSchema = z.enum(["glass", "flat", "card", "outline", "neon", "gradient", "minimal"]);
export type NodeStyleVariant = z.infer<typeof NodeStyleVariantSchema>;

export const OrgNodeStyleSchema = z.object({
  background: z.string(),
  textColor: z.string(),
  borderColor: z.string(),
  accentColor: z.string(),
});
export type OrgNodeStyle = z.infer<typeof OrgNodeStyleSchema>;

// Champs affichés sur les cartes. Optionnel et additif sur le format v1
// (même pattern que layout.mode) : les fichiers antérieurs restent valides,
// l'absence d'un champ vaut « affiché ».
export const OrgDisplayOptionsSchema = z.object({
  showPhotos: z.boolean().optional(),
  showRoles: z.boolean().optional(),
  showDepartments: z.boolean().optional(),
  showEmails: z.boolean().optional(),
});
export type OrgDisplayOptions = z.infer<typeof OrgDisplayOptionsSchema>;

export const OrgThemeSchema = z.object({
  accent: z.string(),
  palette: z.array(z.string()).min(1),
  fontFamily: z.string(),
  nodeStyle: NodeStyleVariantSchema,
  cornerRadius: z.number(),
  logoUrl: z.string().optional(),          // logo de l'entreprise / du groupe
  secondaryLogoUrl: z.string().optional(), // logo d'une entité partenaire, le cas échéant
  display: OrgDisplayOptionsSchema.optional(),
});
export type OrgTheme = z.infer<typeof OrgThemeSchema>;

/** Options d'affichage effectives : tout est affiché par défaut. */
export function resolveDisplay(theme: Pick<OrgTheme, "display">): Required<OrgDisplayOptions> {
  return {
    showPhotos: theme.display?.showPhotos ?? true,
    showRoles: theme.display?.showRoles ?? true,
    showDepartments: theme.display?.showDepartments ?? true,
    showEmails: theme.display?.showEmails ?? true,
  };
}

export const OrgNodeDataSchema = z.object({
  name: z.string(),
  role: z.string().optional(),
  department: z.string().optional(),
  email: z.string().optional(),
  avatarUrl: z.string().optional(),
});
export type OrgNodeData = z.infer<typeof OrgNodeDataSchema>;

export const OrgNodeSchema = z.object({
  id: z.string(),
  data: OrgNodeDataSchema,
  position: z.object({ x: z.number(), y: z.number() }),
  styleOverride: OrgNodeStyleSchema.partial().optional(),
});
export type OrgNode = z.infer<typeof OrgNodeSchema>;

/**
 * Nature d'un lien (format v2) :
 * - "hierarchy" (ou absent, pour les fichiers v1) : rattachement hiérarchique
 *   — un seul responsable par personne, anti-cycle, structure les layouts,
 *   le repli, les statistiques et la colonne Responsable du CSV.
 * - "dotted" : rattachement fonctionnel (dotted line) — trait pointillé,
 *   plusieurs autorisés par personne, ignoré par toute la logique d'arbre.
 */
export const OrgEdgeKindSchema = z.enum(["hierarchy", "dotted"]);
export type OrgEdgeKind = z.infer<typeof OrgEdgeKindSchema>;

export const OrgEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: OrgEdgeKindSchema.optional(),
});
export type OrgEdge = z.infer<typeof OrgEdgeSchema>;

/** Vrai pour un lien hiérarchique (l'absence de `kind` vaut hiérarchique — fichiers v1). */
export function isHierarchyEdge(edge: OrgEdge): boolean {
  return edge.kind !== "dotted";
}

/** Sous-ensemble hiérarchique des liens : la seule entrée valide pour la logique d'arbre. */
export function hierarchyEdges(edges: OrgEdge[]): OrgEdge[] {
  return edges.filter(isHierarchyEdge);
}

/** Liens fonctionnels (pointillés). */
export function dottedEdges(edges: OrgEdge[]): OrgEdge[] {
  return edges.filter((e) => e.kind === "dotted");
}

/** Version courante du format de fichier. */
export const ORG_CHART_VERSION = 2;

export const OrgChartFileSchema = z.object({
  format: z.literal("orgchart"),
  // v1 : liens sans `kind`. v2 : liens hiérarchiques ou pointillés.
  version: z.union([z.literal(1), z.literal(2)]),
  meta: z.object({
    title: z.string(),
    subtitle: z.string().optional(),  // ex: groupe / entité affichée sous le titre à l'export
    footer: z.string().optional(),    // pied de page affiché à l'export
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  templateId: z.string(),
  theme: OrgThemeSchema,
  nodes: z.array(OrgNodeSchema),
  edges: z.array(OrgEdgeSchema),
  layout: z.object({
    direction: z.enum(["TB", "LR"]),
    auto: z.boolean(),
    // "tree" : arbre classique (elkjs). "compact" : équipes terrain empilées
    // verticalement (optimisé pour l'impression). Optionnel : les fichiers v1
    // antérieurs restent valides.
    mode: z.enum(["tree", "compact"]).optional(),
  }),
});
export type OrgChartFile = z.infer<typeof OrgChartFileSchema>;

/**
 * Migration à l'ouverture : porte un fichier valide vers la version courante.
 * v1 → v2 : aucune transformation de données nécessaire — l'absence de `kind`
 * sur un lien vaut « hiérarchique », seule la version est relevée.
 */
export function migrateOrgChartFile(file: OrgChartFile): OrgChartFile {
  if (file.version === ORG_CHART_VERSION) return file;
  return { ...file, version: ORG_CHART_VERSION };
}
