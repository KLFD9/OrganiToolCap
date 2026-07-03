import type { OrgChartFile } from "../types/orgchart";
import { glassCapTheme } from "./themes";

const now = new Date().toISOString();

export const athanorDemo: OrgChartFile = {
  format: "orgchart",
  version: 2,
  meta: {
    title: "Organigramme ATHANOR",
    createdAt: now,
    updatedAt: now,
  },
  templateId: "glass-cap",
  theme: glassCapTheme,
  layout: { direction: "TB", auto: true },
  nodes: [
    {
      id: "n1",
      position: { x: 900, y: 0 },
      data: { name: "Claire Dubois", role: "Directrice Générale", department: "Direction" },
    },
    {
      id: "n2",
      position: { x: 300, y: 200 },
      data: { name: "Marc Lefèvre", role: "Directeur Opérations", department: "Pôle Opérations" },
    },
    {
      id: "n3",
      position: { x: 900, y: 200 },
      data: { name: "Sophie Martin", role: "Directrice Marketing & Communication", department: "Pôle Marketing & Com." },
    },
    {
      id: "n4",
      position: { x: 1500, y: 200 },
      data: { name: "Julien Bernard", role: "Directeur Administratif & Financier", department: "Pôle Admin & Finance" },
    },
    {
      id: "n5",
      position: { x: 100, y: 400 },
      data: { name: "Antoine Petit", role: "Responsable Logistique", department: "Pôle Opérations" },
    },
    {
      id: "n6",
      position: { x: 300, y: 400 },
      data: { name: "Camille Roux", role: "Coordinatrice Terrain", department: "Pôle Opérations" },
    },
    {
      id: "n7",
      position: { x: 500, y: 400 },
      data: { name: "Hugo Moreau", role: "Technicien Opérations", department: "Pôle Opérations" },
    },
    {
      id: "n8",
      position: { x: 700, y: 400 },
      data: { name: "Léa Girard", role: "Chargée de Communication", department: "Pôle Marketing & Com." },
    },
    {
      id: "n9",
      position: { x: 900, y: 400 },
      data: { name: "Thomas Fontaine", role: "Community Manager", department: "Pôle Marketing & Com." },
    },
    {
      id: "n10",
      position: { x: 1100, y: 400 },
      data: { name: "Emma Lambert", role: "Graphiste", department: "Pôle Marketing & Com." },
    },
    {
      id: "n11",
      position: { x: 1300, y: 400 },
      data: { name: "Nicolas Faure", role: "Comptable", department: "Pôle Admin & Finance" },
    },
    {
      id: "n12",
      position: { x: 1500, y: 400 },
      data: { name: "Manon Simon", role: "Responsable RH", department: "Pôle Admin & Finance" },
    },
    {
      id: "n13",
      position: { x: 1700, y: 400 },
      data: { name: "Pierre André", role: "Assistant Administratif", department: "Pôle Admin & Finance" },
    },
  ],
  edges: [
    { id: "e1-2", source: "n1", target: "n2" },
    { id: "e1-3", source: "n1", target: "n3" },
    { id: "e1-4", source: "n1", target: "n4" },
    { id: "e2-5", source: "n2", target: "n5" },
    { id: "e2-6", source: "n2", target: "n6" },
    { id: "e2-7", source: "n2", target: "n7" },
    { id: "e3-8", source: "n3", target: "n8" },
    { id: "e3-9", source: "n3", target: "n9" },
    { id: "e3-10", source: "n3", target: "n10" },
    { id: "e4-11", source: "n4", target: "n11" },
    { id: "e4-12", source: "n4", target: "n12" },
    { id: "e4-13", source: "n4", target: "n13" },
  ],
};
