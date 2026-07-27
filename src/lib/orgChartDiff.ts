import { isHierarchyEdge, type OrgChartFile, type OrgNode } from "../types/orgchart";

export interface PersonChange {
  referenceId: string;
  currentId: string;
  name: string;
  fields: Array<{ label: string; before?: string; after?: string }>;
}

export interface OrgChartDiff {
  arrivals: OrgNode[];
  departures: OrgNode[];
  changes: PersonChange[];
  ambiguities: string[];
  unchanged: number;
}

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildIndex(
  nodes: OrgNode[],
  keyOf: (node: OrgNode) => string
): { unique: Map<string, OrgNode>; duplicates: Set<string> } {
  const grouped = new Map<string, OrgNode[]>();
  for (const node of nodes) {
    const key = keyOf(node);
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), node]);
  }
  return {
    unique: new Map(
      [...grouped].flatMap(([key, values]) => values.length === 1 ? [[key, values[0]] as const] : [])
    ),
    duplicates: new Set(
      [...grouped].filter(([, values]) => values.length > 1).map(([key]) => key)
    ),
  };
}

function personKey(node: OrgNode | undefined): string {
  if (!node) return "";
  return normalize(node.data.email) || `${normalize(node.data.name)}|${normalize(node.data.department)}`;
}

function managerOf(file: OrgChartFile, id: string): OrgNode | undefined {
  const edge = file.edges.find((item) => isHierarchyEdge(item) && item.target === id);
  return edge ? file.nodes.find((node) => node.id === edge.source) : undefined;
}

function dottedManagers(file: OrgChartFile, id: string): { keys: string[]; labels: string[] } {
  const byId = new Map(file.nodes.map((node) => [node.id, node]));
  const managers = file.edges
    .filter((edge) => edge.kind === "dotted" && edge.target === id)
    .map((edge) => byId.get(edge.source))
    .filter((node): node is OrgNode => Boolean(node))
    .map((node) => ({ key: personKey(node), label: node.data.name || node.data.email || "Sans nom" }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    keys: managers.map((manager) => manager.key),
    labels: managers.map((manager) => manager.label),
  };
}

/** Compare deux fichiers localement. `reference` = version précédente, `current` = document actuel. */
export function compareOrgCharts(reference: OrgChartFile, current: OrgChartFile): OrgChartDiff {
  const currentById = new Map(current.nodes.map((node) => [node.id, node]));
  const emailIndex = buildIndex(current.nodes, (node) => normalize(node.data.email));
  const identityIndex = buildIndex(
    current.nodes,
    (node) => `${normalize(node.data.name)}|${normalize(node.data.department)}`
  );
  const usedCurrent = new Set<string>();
  const matches = new Map<string, OrgNode>();
  const ambiguities: string[] = [];

  for (const previous of reference.nodes) {
    // Les identifiants synthétiques des imports tabulaires dépendent de l'ordre
    // des lignes et ne constituent pas une identité durable entre deux imports.
    let candidate = /^(?:csv|import)-\d+$/i.test(previous.id)
      ? undefined
      : currentById.get(previous.id);
    const emailKey = normalize(previous.data.email);
    if (!candidate && emailKey) {
      if (emailIndex.duplicates.has(emailKey)) {
        ambiguities.push(`Plusieurs personnes actuelles utilisent l’e-mail de « ${previous.data.name || "Sans nom"} ».`);
      } else {
        candidate = emailIndex.unique.get(emailKey);
      }
    }
    if (!candidate) {
      const key = `${normalize(previous.data.name)}|${normalize(previous.data.department)}`;
      if (identityIndex.duplicates.has(key)) {
        ambiguities.push(`Plusieurs personnes actuelles correspondent à « ${previous.data.name || "Sans nom"} ».`);
      } else {
        candidate = identityIndex.unique.get(key);
      }
    }
    if (candidate && !usedCurrent.has(candidate.id)) {
      matches.set(previous.id, candidate);
      usedCurrent.add(candidate.id);
    } else if (candidate) {
      ambiguities.push(`« ${previous.data.name || "Sans nom"} » correspond à une personne déjà rapprochée.`);
    }
  }

  const departures = reference.nodes.filter((node) => !matches.has(node.id));
  const arrivals = current.nodes.filter((node) => !usedCurrent.has(node.id));
  const changes: PersonChange[] = [];
  let unchanged = 0;

  for (const previous of reference.nodes) {
    const next = matches.get(previous.id);
    if (!next) continue;
    const fields: PersonChange["fields"] = [];
    const add = (label: string, before: string | undefined, after: string | undefined) => {
      if (normalize(before) !== normalize(after)) fields.push({ label, before, after });
    };
    add("Nom", previous.data.name, next.data.name);
    add("Poste", previous.data.role, next.data.role);
    add("Pôle", previous.data.department, next.data.department);
    add("E-mail", previous.data.email, next.data.email);
    add("Téléphone", previous.data.phone, next.data.phone);
    const beforeManager = managerOf(reference, previous.id);
    const afterManager = managerOf(current, next.id);
    if (personKey(beforeManager) !== personKey(afterManager)) {
      fields.push({
        label: "Responsable",
        before: beforeManager?.data.name,
        after: afterManager?.data.name,
      });
    }
    const beforeDotted = dottedManagers(reference, previous.id);
    const afterDotted = dottedManagers(current, next.id);
    if (beforeDotted.keys.join("\n") !== afterDotted.keys.join("\n")) {
      fields.push({
        label: "Rattachements fonctionnels",
        before: beforeDotted.labels.length ? beforeDotted.labels.join(", ") : undefined,
        after: afterDotted.labels.length ? afterDotted.labels.join(", ") : undefined,
      });
    }
    if (fields.length) {
      changes.push({
        referenceId: previous.id,
        currentId: next.id,
        name: next.data.name || previous.data.name || "Sans nom",
        fields,
      });
    } else {
      unchanged++;
    }
  }

  return { arrivals, departures, changes, ambiguities, unchanged };
}
