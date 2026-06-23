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
];

export const TEMPLATES_BY_ID: Record<string, TemplateDefinition> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t])
);
