import type { OrgChartFile, OrgEdge, OrgNode } from "../types/orgchart";
import { glassCapTheme } from "./themes";
import { layoutCompact } from "../lib/compactLayout";

/**
 * Organigramme de démonstration : PME généraliste (Société Horizon, 17
 * personnes) — direction, finance & RH, commercial, opérations, informatique.
 * Volontairement transposable à tout type d'entreprise ; le titre « Exemple »
 * rappelle qu'il est à remplacer. Montre un rattachement fonctionnel (lien
 * pointillé, format v2).
 *
 * Les positions sont calculées par `layoutCompact` (équipes empilées) pour que
 * la démo TIENNE dans le cadre A4 paysage à l'ouverture : la première
 * impression doit être une jauge « lisible », pas un débordement.
 */

const now = new Date().toISOString();

const person = (
  id: string,
  name: string,
  role: string,
  department: string
): OrgNode => ({
  id,
  position: { x: 0, y: 0 }, // remplacée par layoutCompact ci-dessous
  data: {
    name,
    role,
    department,
    email: `${name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, ".")}@exemple.fr`,
  },
});

const people: OrgNode[] = [
  person("n1", "Claire Dubois", "Directrice Générale", "Direction"),
  // Finance & RH
  person("n2", "Julien Bernard", "Directeur Administratif & Financier", "Finance & RH"),
  person("n6", "Nicolas Faure", "Comptable", "Finance & RH"),
  person("n7", "Manon Simon", "Responsable Ressources Humaines", "Finance & RH"),
  person("n8", "Sarah Lopez", "Gestionnaire de paie", "Finance & RH"),
  // Commercial
  person("n3", "Sophie Martin", "Directrice Commerciale", "Commercial"),
  person("n9", "Thomas Fontaine", "Chargé d'affaires", "Commercial"),
  person("n10", "Léa Girard", "Assistante commerciale", "Commercial"),
  person("n11", "Karim Benali", "Responsable grands comptes", "Commercial"),
  // Opérations
  person("n4", "Marc Lefèvre", "Directeur des Opérations", "Opérations"),
  person("n12", "Antoine Petit", "Responsable Logistique", "Opérations"),
  person("n13", "Camille Roux", "Cheffe d'atelier", "Opérations"),
  person("n14", "Hugo Moreau", "Technicien de production", "Opérations"),
  // Informatique
  person("n5", "Emma Lambert", "Responsable Informatique", "Informatique"),
  person("n15", "Pierre André", "Technicien support", "Informatique"),
  person("n16", "Inès Caron", "Développeuse interne", "Informatique"),
  person("n17", "David Nguyen", "Alternant systèmes & réseaux", "Informatique"),
];

const links: OrgEdge[] = [
  { id: "e1-2", source: "n1", target: "n2" },
  { id: "e1-3", source: "n1", target: "n3" },
  { id: "e1-4", source: "n1", target: "n4" },
  { id: "e1-5", source: "n1", target: "n5" },
  { id: "e2-6", source: "n2", target: "n6" },
  { id: "e2-7", source: "n2", target: "n7" },
  { id: "e2-8", source: "n2", target: "n8" },
  { id: "e3-9", source: "n3", target: "n9" },
  { id: "e3-10", source: "n3", target: "n10" },
  { id: "e3-11", source: "n3", target: "n11" },
  { id: "e4-12", source: "n4", target: "n12" },
  { id: "e4-13", source: "n4", target: "n13" },
  { id: "e4-14", source: "n4", target: "n14" },
  { id: "e5-15", source: "n5", target: "n15" },
  { id: "e5-16", source: "n5", target: "n16" },
  { id: "e5-17", source: "n5", target: "n17" },
  // Rattachement fonctionnel : la RH travaille en transverse avec la DG
  { id: "e1-7d", source: "n1", target: "n7", kind: "dotted" },
];

const { nodes: placedPeople } = layoutCompact(people, links);

export const demoCompany: OrgChartFile = {
  format: "orgchart",
  version: 2,
  meta: {
    title: "Exemple — Société Horizon",
    subtitle: "Organigramme de démonstration, à remplacer par le vôtre",
    createdAt: now,
    updatedAt: now,
  },
  templateId: "glass-cap",
  theme: glassCapTheme,
  // Marges 8 mm : avec la disposition compacte, l'ensemble tient dans la zone
  // utile A4 paysage à l'échelle confort — la jauge affiche « lisible » à
  // l'ouverture (verrouillé par demoCompany.test.ts).
  layout: {
    direction: "TB",
    auto: true,
    mode: "compact",
    page: { format: "a4", orientation: "landscape", margin: 8 },
  },
  nodes: placedPeople,
  edges: links,
};
