import type { OrgEdge, OrgNode } from "../types/orgchart";
import { wouldCreateHierarchyCycle } from "./hierarchy";

/**
 * Import d'une liste de personnes depuis un CSV (export Excel / Google Sheets).
 *
 * Colonnes reconnues (insensible à la casse et aux accents) :
 * - nom / name / collaborateur            → obligatoire
 * - poste / rôle / fonction / title       → optionnel
 * - pôle / département / service / équipe → optionnel
 * - email / courriel / mail               → optionnel
 * - responsable / manager / n+1           → optionnel ; nom (ou email) du supérieur,
 *   utilisé pour reconstruire la hiérarchie.
 *
 * Le séparateur (`;` à la française ou `,`) est détecté automatiquement.
 */

export class CsvFormatError extends Error {}

export interface CsvImportResult {
  nodes: OrgNode[];
  edges: OrgEdge[];
  /** Avertissements non bloquants : responsable introuvable, doublons, lignes ignorées. */
  warnings: string[];
}

export type PeopleColumnKey = "name" | "role" | "department" | "email" | "phone" | "manager";
export type PeopleColumnMapping = Partial<Record<PeopleColumnKey, number>>;

/** Normalise pour comparaison : minuscules, accents retirés, espaces réduits. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const COLUMN_ALIASES: Record<PeopleColumnKey, string[]> = {
  name: ["nom", "name", "nom complet", "prenom nom", "collaborateur", "personne"],
  role: ["poste", "role", "fonction", "title", "intitule", "intitule de poste"],
  department: ["pole", "departement", "department", "service", "equipe", "direction", "bu"],
  email: ["email", "e-mail", "mail", "courriel", "adresse e-mail", "adresse email"],
  phone: ["telephone", "tel", "phone", "numero", "gsm", "mobile", "portable", "numero de telephone"],
  manager: ["responsable", "manager", "n+1", "superieur", "rattachement", "reports to", "responsable direct"],
};

/** Détecte le séparateur le plus probable sur la ligne d'en-tête. */
export function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  const counts: Array<[",", number] | [";", number] | ["\t", number]> = [
    [";", (headerLine.match(/;/g) ?? []).length],
    [",", (headerLine.match(/,/g) ?? []).length],
    ["\t", (headerLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

/** Parse un CSV complet (guillemets, retours à la ligne dans les champs, CRLF) en lignes de cellules. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);

  // Élimine les lignes entièrement vides
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function detectPeopleColumns(header: string[]): PeopleColumnMapping {
  const mapping: PeopleColumnMapping = {};
  header.forEach((raw, index) => {
    const cell = normalize(raw);
    for (const key of Object.keys(COLUMN_ALIASES) as PeopleColumnKey[]) {
      if (mapping[key] === undefined && COLUMN_ALIASES[key].includes(cell)) {
        mapping[key] = index;
      }
    }
  });
  return mapping;
}

/** Convertit des lignes tabulaires déjà décodées (CSV ou XLSX) en organigramme. */
export function importPeopleRows(
  rows: string[][],
  columns: PeopleColumnMapping,
  headerRowIndex = 0
): CsvImportResult {
  if (columns.name === undefined) {
    throw new CsvFormatError("Associez une colonne au champ obligatoire « Nom ».");
  }

  const dataRows = rows.slice(headerRowIndex + 1);
  if (dataRows.length === 0) {
    throw new CsvFormatError("Le tableau doit contenir au moins une personne sous la ligne d’en-tête.");
  }

  const warnings: string[] = [];
  const nodes: OrgNode[] = [];
  const sourceRows = new Map<number, { row: string[]; id: string }>();
  const byName = new Map<string, string>();
  const byEmail = new Map<string, string>();

  const cellAt = (row: string[], index: number | undefined): string | undefined => {
    if (index === undefined) return undefined;
    const value = row[index]?.trim();
    return value ? value : undefined;
  };

  dataRows.forEach((row, dataIndex) => {
    const sourceLine = headerRowIndex + dataIndex + 2;
    const name = cellAt(row, columns.name);
    if (!name) {
      if (row.some((cell) => cell.trim())) warnings.push(`Ligne ${sourceLine} ignorée : nom manquant.`);
      return;
    }
    const id = `import-${dataIndex + 1}`;
    const email = cellAt(row, columns.email);
    const nameKey = normalize(name);
    if (byName.has(nameKey)) {
      warnings.push(`Doublon de nom « ${name} » : les rattachements utiliseront la première occurrence.`);
    } else {
      byName.set(nameKey, id);
    }
    if (email) byEmail.set(normalize(email), id);

    sourceRows.set(dataIndex, { row, id });
    nodes.push({
      id,
      position: { x: 0, y: (dataIndex + 1) * 140 },
      data: {
        name,
        role: cellAt(row, columns.role),
        department: cellAt(row, columns.department),
        email,
        phone: cellAt(row, columns.phone),
      },
    });
  });

  if (nodes.length === 0) throw new CsvFormatError("Aucune personne valide trouvée dans le fichier.");

  const edges: OrgEdge[] = [];
  for (const [dataIndex, source] of sourceRows) {
    const manager = cellAt(source.row, columns.manager);
    if (!manager) continue;
    const sourceLine = headerRowIndex + dataIndex + 2;
    const key = normalize(manager);
    const managerId = manager.includes("@") ? byEmail.get(key) : byName.get(key);
    if (!managerId) {
      warnings.push(`Responsable « ${manager} » introuvable (ligne ${sourceLine}) : nœud laissé sans rattachement.`);
      continue;
    }
    if (managerId === source.id) {
      warnings.push(`Ligne ${sourceLine} : une personne ne peut pas être son propre responsable.`);
      continue;
    }
    if (wouldCreateHierarchyCycle(edges, managerId, source.id)) {
      warnings.push(
        `Ligne ${sourceLine} : le rattachement à « ${manager} » créerait une boucle hiérarchique et a été ignoré.`
      );
      continue;
    }
    edges.push({ id: `import-edge-${dataIndex + 1}`, source: managerId, target: source.id });
  }

  return { nodes, edges, warnings };
}

/**
 * Convertit le contenu d'un fichier CSV en nœuds + liens hiérarchiques.
 * Lance `CsvFormatError` si la colonne « nom » est introuvable ou si le fichier est vide.
 */
export function importPeopleCsv(text: string): CsvImportResult {
  const trimmed = text.replace(/^\uFEFF/, ""); // BOM Excel
  if (!trimmed.trim()) throw new CsvFormatError("Le fichier CSV est vide.");

  const delimiter = detectDelimiter(trimmed.split(/\r?\n/, 1)[0]);
  const rows = parseCsv(trimmed, delimiter);
  if (rows.length < 2) {
    throw new CsvFormatError("Le fichier CSV doit contenir une ligne d'en-tête et au moins une personne.");
  }

  const columns = detectPeopleColumns(rows[0]);
  if (columns.name === undefined) {
    throw new CsvFormatError(
      "Colonne « Nom » introuvable. L'en-tête doit contenir une colonne nom/name/collaborateur."
    );
  }

  return importPeopleRows(rows, columns);
}
