import type { OrgNode } from "../types/orgchart";

export interface CollaborationCursor {
  x: number;
  y: number;
}

export interface CollaborationParticipant {
  clientId: number;
  name: string;
  color: string;
  cursor?: CollaborationCursor;
  selectedNodeIds: string[];
  editingNodeId?: string;
  isLocal: boolean;
}

export interface CollaborationAwarenessState {
  peerId?: string;
  user?: { name?: string; color?: string };
  cursor?: CollaborationCursor;
  selectedNodeIds?: string[];
  editingNodeId?: string;
}

export function normalizeCollaborationParticipant(
  clientId: number,
  state: CollaborationAwarenessState,
  localClientId: number,
): CollaborationParticipant | undefined {
  const name = state.user?.name?.trim();
  if (!name) return undefined;
  const editingNodeId = state.editingNodeId?.trim();
  return {
    clientId,
    name,
    color: state.user?.color ?? "#6D4AAE",
    cursor: state.cursor,
    selectedNodeIds: Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : [],
    ...(editingNodeId ? { editingNodeId } : {}),
    isLocal: clientId === localClientId,
  };
}

export function editingNodeLabel(
  participant: CollaborationParticipant,
  nodes: OrgNode[],
): string | undefined {
  if (!participant.editingNodeId) return undefined;
  return (
    nodes.find((node) => node.id === participant.editingNodeId)?.data.name?.trim() ||
    "une fiche"
  );
}
