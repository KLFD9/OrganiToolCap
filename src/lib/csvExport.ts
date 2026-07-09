import { isHierarchyEdge, type OrgEdge, type OrgNode } from "../types/orgchart";

/**
 * Export de l'annuaire en CSV — l'inverse exact de csvImport : mêmes colonnes
 * (`Nom;Poste;Pôle;Email;Responsable`), séparateur `;` à la française et BOM
 * UTF-8 pour qu'Excel ouvre le fichier correctement. Un fichier exporté se
 * réimporte à l'identique (round-trip), ce qui fait d'Excel / Google Sheets
 * un éditeur de masse pour l'organigramme.
 */

const DELIMITER = ";";
export const CSV_HEADER = ["Nom", "Poste", "Pôle", "Email", "Téléphone", "Responsable"];

/** Échappe une cellule CSV : guillemets si séparateur, guillemet ou retour à la ligne. */
export function escapeCsvCell(value: string): string {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Construit le contenu CSV de l'annuaire. Fonction pure (sans BOM). */
export function buildPeopleCsv(nodes: OrgNode[], edges: OrgEdge[]): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // La colonne Responsable ne porte que le rattachement hiérarchique
  const parentOf = new Map(edges.filter(isHierarchyEdge).map((e) => [e.target, e.source]));

  const lines = [CSV_HEADER.join(DELIMITER)];
  for (const node of nodes) {
    const parent = parentOf.has(node.id) ? byId.get(parentOf.get(node.id)!) : undefined;
    // Le responsable est identifié par son nom, comme à l'import ; l'e-mail
    // sert de secours si le nom est vide (l'import résout aussi par e-mail).
    const manager = parent ? parent.data.name || parent.data.email || "" : "";
    lines.push(
      [
        node.data.name,
        node.data.role ?? "",
        node.data.department ?? "",
        node.data.email ?? "",
        node.data.phone ?? "",
        manager,
      ]
        .map(escapeCsvCell)
        .join(DELIMITER)
    );
  }
  return lines.join("\r\n");
}

/** Déclenche le téléchargement du CSV (BOM UTF-8 inclus pour Excel). */
export function downloadPeopleCsv(nodes: OrgNode[], edges: OrgEdge[], title?: string): void {
  const content = `\uFEFF${buildPeopleCsv(nodes, edges)}`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(title || "annuaire").replace(/[^a-z0-9-_]+/gi, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
