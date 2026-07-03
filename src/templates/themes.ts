import type { OrgTheme } from "../types/orgchart";

export const glassCapTheme: OrgTheme = {
  accent: "#472F74",
  palette: ["#472F74", "#6D4AAE", "#9B86CE", "#C9BEEA"],
  fontFamily: "'Poppins', system-ui, sans-serif",
  nodeStyle: "glass",
  cornerRadius: 20,
};

export const flatCorporateTheme: OrgTheme = {
  accent: "#2B3A55",
  palette: ["#2B3A55", "#3F5374", "#5A7196", "#8AA0BD"],
  fontFamily: "'Inter', system-ui, sans-serif",
  nodeStyle: "flat",
  cornerRadius: 8,
};

export const cardOutlineTheme: OrgTheme = {
  accent: "#472F74",
  palette: ["#472F74", "#6D4AAE", "#9B86CE", "#C9BEEA"],
  fontFamily: "'Inter', system-ui, sans-serif",
  nodeStyle: "outline",
  cornerRadius: 12,
};

export const neonDarkTheme: OrgTheme = {
  accent: "#00f2fe",
  palette: ["#00f2fe", "#4facfe", "#00ff87", "#ff0844"],
  fontFamily: "ui-monospace, monospace",
  nodeStyle: "neon",
  cornerRadius: 8,
};

export const gradientSoftTheme: OrgTheme = {
  accent: "#6366f1",
  palette: ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e"],
  fontFamily: "'Poppins', system-ui, sans-serif",
  nodeStyle: "gradient",
  cornerRadius: 16,
};

export const minimalAccentTheme: OrgTheme = {
  accent: "#18181b",
  palette: ["#18181b", "#3f3f46", "#71717a", "#a1a1aa"],
  fontFamily: "'Inter', system-ui, sans-serif",
  nodeStyle: "minimal",
  cornerRadius: 6,
};

export interface TemplateDefinition {
  id: string;
  label: string;
  description: string;
  theme: OrgTheme;
}

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: "glass-cap",
    label: "Glass CAP",
    description: "Glassmorphisme, dégradés violets, look institutionnel CAP.",
    theme: glassCapTheme,
  },
  {
    id: "flat-corporate",
    label: "Flat Corporate",
    description: "Aplats nets, hiérarchie par teintes de l'accent.",
    theme: flatCorporateTheme,
  },
  {
    id: "card-outline",
    label: "Card Outline",
    description: "Cartes blanches, bordures fines, look sobre et dense.",
    theme: cardOutlineTheme,
  },
  {
    id: "neon-dark",
    label: "Neon Dark",
    description: "Néon fluorescent sur fond sombre, look moderne et technologique.",
    theme: neonDarkTheme,
  },
  {
    id: "gradient-soft",
    label: "Soft Gradient",
    description: "Dégradés linéaires fluides, coins arrondis, look chaleureux.",
    theme: gradientSoftTheme,
  },
  {
    id: "minimal-accent",
    label: "Minimal Accent",
    description: "Cartes épurées avec liseré d'accentuation gauche, look très dense.",
    theme: minimalAccentTheme,
  },
];

export const TEMPLATES_BY_ID: Record<string, TemplateDefinition> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t])
);
