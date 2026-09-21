import * as Y from "yjs";
import {
  ORG_CHART_VERSION,
  OrgChartFileSchema,
  type OrgChartFile,
  type OrgEdge,
  type OrgFrame,
  type OrgNode,
} from "../types/orgchart";

export const COLLABORATION_LOCAL_ORIGIN = "organitool-local";

const SYSTEM_MAP = "system";
const META_MAP = "meta";
const THEME_MAP = "theme";
const LAYOUT_MAP = "layout";
const NODES_MAP = "nodes";
const EDGES_MAP = "edges";
const FRAMES_MAP = "frames";
const NODE_ORDER = "node-order";
const EDGE_ORDER = "edge-order";
const FRAME_ORDER = "frame-order";

type SharedRecord = Y.Map<unknown>;

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function setValue(map: SharedRecord, key: string, value: unknown): void {
  if (value === undefined) {
    if (map.has(key)) map.delete(key);
    return;
  }
  if (!sameValue(map.get(key), value)) map.set(key, value);
}

function syncKeys(map: SharedRecord, values: Record<string, unknown>): void {
  const expected = new Set(Object.keys(values));
  for (const key of map.keys()) {
    if (!expected.has(key)) map.delete(key);
  }
  for (const [key, value] of Object.entries(values)) setValue(map, key, value);
}

function sharedRecord(collection: Y.Map<SharedRecord>, id: string): SharedRecord {
  const current = collection.get(id);
  if (current instanceof Y.Map) return current;
  const created = new Y.Map<unknown>();
  collection.set(id, created);
  return created;
}

function syncCollection<T extends { id: string }>(
  collection: Y.Map<SharedRecord>,
  items: T[],
  serialize: (item: T) => Record<string, unknown>,
): void {
  const ids = new Set(items.map((item) => item.id));
  for (const id of collection.keys()) {
    if (!ids.has(id)) collection.delete(id);
  }
  for (const item of items) syncKeys(sharedRecord(collection, item.id), serialize(item));
}

function serializeNode(node: OrgNode): Record<string, unknown> {
  return {
    id: node.id,
    name: node.data.name,
    role: node.data.role,
    department: node.data.department,
    email: node.data.email,
    phone: node.data.phone,
    avatarUrl: node.data.avatarUrl,
    x: node.position.x,
    y: node.position.y,
    styleOverride: node.styleOverride,
  };
}

function serializeEdge(edge: OrgEdge): Record<string, unknown> {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    kind: edge.kind,
    routing: edge.routing,
    anchors: edge.anchors,
  };
}

function serializeFrame(frame: OrgFrame): Record<string, unknown> {
  return {
    id: frame.id,
    name: frame.name,
    x: frame.position.x,
    y: frame.position.y,
    page: frame.page,
    meta: frame.meta,
    chromeLayout: frame.chromeLayout,
  };
}

function orderedRecords(
  collection: Y.Map<SharedRecord>,
  order?: readonly string[],
): Array<Record<string, unknown>> {
  const ids = order ?? Array.from(collection.keys()).sort();
  return ids
    .map((id) => collection.get(id))
    .filter((record): record is SharedRecord => record instanceof Y.Map)
    .map((record) => Object.fromEntries(record.entries()));
}

function syncOrder(order: Y.Array<string>, nextOrder: string[]): void {
  if (sameValue(order.toArray(), nextOrder)) return;
  order.delete(0, order.length);
  if (nextOrder.length > 0) order.insert(0, nextOrder);
}

export function isCollaborationDocumentInitialized(doc: Y.Doc): boolean {
  return doc.getMap(SYSTEM_MAP).get("initialized") === true;
}

export function writeOrgChartToCollaborationDocument(
  doc: Y.Doc,
  file: OrgChartFile,
  origin: unknown = COLLABORATION_LOCAL_ORIGIN,
): void {
  doc.transact(() => {
    const system = doc.getMap(SYSTEM_MAP);
    setValue(system, "initialized", true);
    setValue(system, "formatVersion", ORG_CHART_VERSION);
    setValue(system, "templateId", file.templateId);

    syncKeys(doc.getMap(META_MAP), { ...file.meta });
    syncKeys(doc.getMap(THEME_MAP), { ...file.theme });
    syncKeys(doc.getMap(LAYOUT_MAP), { ...file.layout });

    syncCollection(doc.getMap(NODES_MAP), file.nodes, serializeNode);
    syncCollection(doc.getMap(EDGES_MAP), file.edges, serializeEdge);
    syncCollection(doc.getMap(FRAMES_MAP), file.frames ?? [], serializeFrame);

    syncOrder(doc.getArray<string>(NODE_ORDER), file.nodes.map((node) => node.id));
    syncOrder(doc.getArray<string>(EDGE_ORDER), file.edges.map((edge) => edge.id));
    syncOrder(doc.getArray<string>(FRAME_ORDER), (file.frames ?? []).map((frame) => frame.id));
  }, origin);
}

export function readOrgChartFromCollaborationDocument(doc: Y.Doc): OrgChartFile | undefined {
  if (!isCollaborationDocumentInitialized(doc)) return undefined;

  const meta = Object.fromEntries(doc.getMap(META_MAP).entries());
  const theme = Object.fromEntries(doc.getMap(THEME_MAP).entries());
  const layout = Object.fromEntries(doc.getMap(LAYOUT_MAP).entries());
  const templateId = doc.getMap(SYSTEM_MAP).get("templateId");
  const nodeRecords = orderedRecords(doc.getMap(NODES_MAP), doc.getArray<string>(NODE_ORDER).toArray());
  const edgeRecords = orderedRecords(doc.getMap(EDGES_MAP), doc.getArray<string>(EDGE_ORDER).toArray());
  const frameOrder = doc.getArray<string>(FRAME_ORDER).toArray();
  const frameRecords = orderedRecords(doc.getMap(FRAMES_MAP), frameOrder);

  const candidate = {
    format: "orgchart",
    version: ORG_CHART_VERSION,
    meta,
    templateId: typeof templateId === "string" ? templateId : "glass-cap",
    theme,
    nodes: nodeRecords.map((node) => ({
      id: node.id,
      data: {
        name: node.name,
        ...(node.role !== undefined ? { role: node.role } : {}),
        ...(node.department !== undefined ? { department: node.department } : {}),
        ...(node.email !== undefined ? { email: node.email } : {}),
        ...(node.phone !== undefined ? { phone: node.phone } : {}),
        ...(node.avatarUrl !== undefined ? { avatarUrl: node.avatarUrl } : {}),
      },
      position: { x: node.x, y: node.y },
      ...(node.styleOverride !== undefined ? { styleOverride: node.styleOverride } : {}),
    })),
    edges: edgeRecords,
    layout,
    ...(frameRecords.length > 0
      ? {
          frames: frameRecords.map((frame) => ({
            id: frame.id,
            name: frame.name,
            position: { x: frame.x, y: frame.y },
            page: frame.page,
            ...(frame.meta !== undefined ? { meta: frame.meta } : {}),
            ...(frame.chromeLayout !== undefined ? { chromeLayout: frame.chromeLayout } : {}),
          })),
        }
      : {}),
  };

  const parsed = OrgChartFileSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}
