import type { OrgNode, OrgTheme } from "../types/orgchart";

export interface DepartmentGroup {
  id: string;
  department: string;
  x: number;
  y: number;
  width: number;
  height: number;
  colorIndex: number;
}

const DEFAULT_NODE_WIDTH = 240;
const DEFAULT_NODE_HEIGHT = 110;
const GROUP_PADDING = 28;

/**
 * Calcule les zones de regroupement visuel par pôle/département : pour chaque valeur
 * distincte de `data.department` portée par au moins un nœud, calcule le rectangle
 * englobant (avec marge) de tous les nœuds de ce pôle.
 */
export function computeDepartmentGroups(
  nodes: OrgNode[],
  nodeSize: { width: number; height: number } = { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
  padding = GROUP_PADDING
): DepartmentGroup[] {
  const byDept = new Map<string, OrgNode[]>();
  const order: string[] = [];

  for (const node of nodes) {
    const dept = node.data.department?.trim();
    if (!dept) continue;
    if (!byDept.has(dept)) {
      byDept.set(dept, []);
      order.push(dept);
    }
    byDept.get(dept)!.push(node);
  }

  return order.map((dept, index) => {
    const members = byDept.get(dept)!;
    const minX = Math.min(...members.map((n) => n.position.x));
    const minY = Math.min(...members.map((n) => n.position.y));
    const maxX = Math.max(...members.map((n) => n.position.x + nodeSize.width));
    const maxY = Math.max(...members.map((n) => n.position.y + nodeSize.height));

    return {
      id: `group-${dept}`,
      department: dept,
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
      colorIndex: index,
    };
  });
}

export function buildGroupTheme(theme: OrgTheme, index: number): string {
  return theme.palette[index % theme.palette.length] ?? theme.accent;
}
