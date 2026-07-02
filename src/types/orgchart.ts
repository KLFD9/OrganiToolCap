import { z } from "zod";

export const NodeStyleVariantSchema = z.enum(["glass", "flat", "card", "outline"]);
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

export const OrgEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
});
export type OrgEdge = z.infer<typeof OrgEdgeSchema>;

export const OrgChartFileSchema = z.object({
  format: z.literal("orgchart"),
  version: z.literal(1),
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
