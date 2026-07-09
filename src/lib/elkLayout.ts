import type ELKType from "elkjs/lib/elk.bundled.js";
import { hierarchyEdges, type OrgEdge, type OrgNode } from "../types/orgchart";
import { computeNodeWidth } from "./nodeStyle";

// elkjs pèse ~1,4 Mo : chargé à la demande au premier « Ranger automatiquement »
// pour ne pas alourdir le bundle initial.
let elkInstance: InstanceType<typeof ELKType> | undefined;
async function getElk(): Promise<InstanceType<typeof ELKType>> {
  if (!elkInstance) {
    const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
    elkInstance = new ELK();
  }
  return elkInstance;
}

const NODE_HEIGHT = 110;

export async function layoutWithElk(
  nodes: OrgNode[],
  edges: OrgEdge[],
  direction: "TB" | "LR"
): Promise<OrgNode[]> {
  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction === "TB" ? "DOWN" : "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.spacing.nodeNode": "48",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: computeNodeWidth(n),
      height: NODE_HEIGHT,
    })),
    // Les liens pointillés (fonctionnels) ne contraignent pas la mise en page
    edges: hierarchyEdges(edges).map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const elk = await getElk();
  const result = await elk.layout(elkGraph);

  const positions = new Map<string, { x: number; y: number }>();
  for (const child of result.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  return nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) ?? n.position,
  }));
}
