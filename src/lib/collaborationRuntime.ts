import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { IndexeddbPersistence } from "y-indexeddb";
import type { OrgChartFile } from "../types/orgchart";
import type { CollaborationInvite } from "./collaborationLink";
import {
  COLLABORATION_LOCAL_ORIGIN,
  isCollaborationDocumentInitialized,
  readOrgChartFromCollaborationDocument,
  writeOrgChartToCollaborationDocument,
} from "./collaborationDocument";
import { guardCollaborativeOrgChart } from "./collaborationGuards";

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
  isLocal: boolean;
}

export interface CollaborationTransport {
  signaling: "public" | "private";
  turn: "not-configured" | "ready" | "unavailable";
}

export interface CollaborationRuntimeOptions {
  invite: CollaborationInvite;
  user: { name: string; color: string };
  initialFile?: OrgChartFile;
  onRemoteFile: (file: OrgChartFile) => void;
  onParticipants: (participants: CollaborationParticipant[]) => void;
  onPeers: (count: number) => void;
  onConnection: (connected: boolean) => void;
  onTransport: (transport: CollaborationTransport) => void;
}

export interface CollaborationRuntime {
  publishFile: (file: OrgChartFile) => void;
  updatePresence: (patch: {
    cursor?: CollaborationCursor | null;
    selectedNodeIds?: string[];
    editingNodeId?: string | null;
  }) => void;
  destroy: () => Promise<void>;
}

interface AwarenessState {
  user?: { name?: string; color?: string };
  cursor?: CollaborationCursor;
  selectedNodeIds?: string[];
  editingNodeId?: string;
}

function signalingUrls(): string[] | undefined {
  const configured = import.meta.env.VITE_COLLAB_SIGNALING_URLS?.trim();
  if (!configured) return undefined;
  const urls = configured.split(",").map((value: string) => value.trim()).filter(Boolean);
  return urls.length > 0 ? urls : undefined;
}

function validIceServers(value: unknown): RTCIceServer[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const servers = value.filter((server): server is RTCIceServer => {
    if (!server || typeof server !== "object") return false;
    const urls = (server as RTCIceServer).urls;
    return typeof urls === "string" ||
      (Array.isArray(urls) && urls.every((url) => typeof url === "string"));
  });
  return servers.length > 0 ? servers : undefined;
}

async function peerOptions(): Promise<{
  options?: { config: { iceServers: RTCIceServer[] } };
  status: CollaborationTransport["turn"];
}> {
  const credentialsUrl = import.meta.env.VITE_COLLAB_TURN_CREDENTIALS_URL?.trim();
  if (credentialsUrl) {
    try {
      const response = await fetch(credentialsUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(`TURN credentials: HTTP ${response.status}`);
      const payload = (await response.json()) as { iceServers?: unknown };
      const iceServers = validIceServers(payload.iceServers);
      if (!iceServers) throw new Error("TURN credentials: réponse invalide");
      return { options: { config: { iceServers } }, status: "ready" };
    } catch (error) {
      console.warn("Le serveur TURN temporaire est indisponible.", error);
      return { status: "unavailable" };
    }
  }

  const configured = import.meta.env.VITE_COLLAB_ICE_SERVERS_JSON?.trim();
  if (!configured) return { status: "not-configured" };
  try {
    const iceServers = validIceServers(JSON.parse(configured));
    if (!iceServers) return { status: "unavailable" };
    return { options: { config: { iceServers } }, status: "ready" };
  } catch {
    console.warn("Configuration ICE invalide : VITE_COLLAB_ICE_SERVERS_JSON est ignorée.");
    return { status: "unavailable" };
  }
}

function normalizeParticipant(
  clientId: number,
  state: AwarenessState,
  localClientId: number,
): CollaborationParticipant | undefined {
  const name = state.user?.name?.trim();
  if (!name) return undefined;
  return {
    clientId,
    name,
    color: state.user?.color ?? "#6D4AAE",
    cursor: state.cursor,
    selectedNodeIds: Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : [],
    isLocal: clientId === localClientId,
  };
}

export async function createCollaborationRuntime(
  options: CollaborationRuntimeOptions,
): Promise<CollaborationRuntime> {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(`organitool-session-${options.invite.roomId}`, doc);
  await persistence.whenSynced;

  if (options.initialFile && !isCollaborationDocumentInitialized(doc)) {
    writeOrgChartToCollaborationDocument(doc, options.initialFile);
  }

  let destroyed = false;
  let remoteReadQueued = false;
  let peerCount = 0;
  const signaling = signalingUrls();
  const peerConfiguration = await peerOptions();
  options.onTransport({
    signaling: signaling ? "private" : "public",
    turn: peerConfiguration.status,
  });

  const provider = new WebrtcProvider(`organitool-${options.invite.roomId}`, doc, {
    password: options.invite.secret,
    signaling,
    maxConns: 8,
    peerOpts: peerConfiguration.options,
  });

  const emitParticipants = () => {
    const participants = Array.from(provider.awareness.getStates().entries())
      .map(([clientId, state]) =>
        normalizeParticipant(clientId, state as AwarenessState, doc.clientID),
      )
      .filter((participant): participant is CollaborationParticipant => Boolean(participant))
      .sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || a.name.localeCompare(b.name, "fr"));
    options.onParticipants(participants);
  };

  const emitRemoteFile = () => {
    if (destroyed || remoteReadQueued) return;
    remoteReadQueued = true;
    queueMicrotask(() => {
      remoteReadQueued = false;
      const file = readOrgChartFromCollaborationDocument(doc);
      if (!file) return;
      const guarded = guardCollaborativeOrgChart(file);
      if (guarded.removedEdgeIds.length > 0) {
        writeOrgChartToCollaborationDocument(doc, guarded.file, "organitool-repair");
      }
      options.onRemoteFile(guarded.file);
    });
  };

  const onDocumentUpdate = (_update: Uint8Array, origin: unknown) => {
    if (origin !== COLLABORATION_LOCAL_ORIGIN) emitRemoteFile();
  };
  const onAwarenessChange = ({
    added,
    updated,
    removed,
  }: {
    added: number[];
    updated: number[];
    removed: number[];
  }) => {
    const onlyLocalUpdate =
      added.length === 0 &&
      removed.length === 0 &&
      updated.length > 0 &&
      updated.every((clientId) => clientId === doc.clientID);
    if (!onlyLocalUpdate) emitParticipants();
  };
  const onStatus = ({ connected }: { connected: boolean }) => options.onConnection(connected);
  const onPeers = ({
    webrtcPeers,
    bcPeers,
  }: {
    webrtcPeers: string[];
    bcPeers: string[];
  }) => {
    peerCount = new Set([...webrtcPeers, ...bcPeers]).size;
    options.onPeers(peerCount);
  };

  doc.on("update", onDocumentUpdate);
  provider.awareness.on("change", onAwarenessChange);
  provider.on("status", onStatus);
  provider.on("peers", onPeers);
  provider.awareness.setLocalState({
    user: options.user,
    selectedNodeIds: [],
  });
  emitParticipants();
  options.onConnection(provider.connected);
  options.onPeers(peerCount);

  if (!options.initialFile) emitRemoteFile();

  return {
    publishFile(file) {
      if (!destroyed) {
        writeOrgChartToCollaborationDocument(doc, guardCollaborativeOrgChart(file).file);
      }
    },
    updatePresence(patch) {
      if (destroyed) return;
      const current = (provider.awareness.getLocalState() ?? {}) as AwarenessState;
      const next: AwarenessState = { ...current };
      if ("cursor" in patch) {
        if (patch.cursor) next.cursor = patch.cursor;
        else delete next.cursor;
      }
      if (patch.selectedNodeIds) next.selectedNodeIds = patch.selectedNodeIds;
      if ("editingNodeId" in patch) {
        if (patch.editingNodeId) next.editingNodeId = patch.editingNodeId;
        else delete next.editingNodeId;
      }
      provider.awareness.setLocalState(next);
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      provider.awareness.setLocalState(null);
      doc.off("update", onDocumentUpdate);
      provider.awareness.off("change", onAwarenessChange);
      provider.off("status", onStatus);
      provider.off("peers", onPeers);
      provider.destroy();
      await persistence.destroy();
      doc.destroy();
    },
  };
}
