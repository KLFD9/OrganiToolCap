import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { getRelaySockets, joinRoom, selfId } from "@trystero-p2p/nostr";
import { IndexeddbPersistence } from "y-indexeddb";
import type { OrgChartFile } from "../types/orgchart";
import type { CollaborationInvite } from "./collaborationLink";
import {
  isCollaborationDocumentInitialized,
  readOrgChartFromCollaborationDocument,
  writeOrgChartToCollaborationDocument,
} from "./collaborationDocument";
import { guardCollaborativeOrgChart } from "./collaborationGuards";
import { mergeIceServers } from "./collaborationConfig";
import {
  normalizeCollaborationParticipant,
  type CollaborationAwarenessState,
  type CollaborationCursor,
  type CollaborationParticipant,
} from "./collaborationPresence";

export type { CollaborationCursor, CollaborationParticipant } from "./collaborationPresence";

const COLLABORATION_REMOTE_ORIGIN = Symbol("organitool-trystero-remote");
const TRYSTERO_APP_ID = "fr.organisation-cap.organitool";
const RELAY_STATUS_INTERVAL_MS = 500;

export interface CollaborationTransport {
  signaling: "public" | "private" | "hybrid";
  signalingConnected: boolean;
  ignoredConfiguredSignaling: boolean;
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
  onDocumentReady: () => void;
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

async function rtcConfiguration(): Promise<{
  config: RTCConfiguration;
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
      return {
        config: { iceServers: mergeIceServers(iceServers) },
        status: "ready",
      };
    } catch (error) {
      console.warn("Le serveur TURN temporaire est indisponible.", error);
      return {
        config: { iceServers: mergeIceServers() },
        status: "unavailable",
      };
    }
  }

  const configured = import.meta.env.VITE_COLLAB_ICE_SERVERS_JSON?.trim();
  if (!configured) {
    return {
      config: { iceServers: mergeIceServers() },
      status: "not-configured",
    };
  }
  try {
    const iceServers = validIceServers(JSON.parse(configured));
    return {
      config: { iceServers: mergeIceServers(iceServers) },
      status: iceServers ? "ready" : "unavailable",
    };
  } catch {
    console.warn("Configuration ICE invalide : VITE_COLLAB_ICE_SERVERS_JSON est ignorée.");
    return {
      config: { iceServers: mergeIceServers() },
      status: "unavailable",
    };
  }
}

function bytes(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

export async function createCollaborationRuntime(
  options: CollaborationRuntimeOptions,
): Promise<CollaborationRuntime> {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const persistence = new IndexeddbPersistence(`organitool-session-${options.invite.roomId}`, doc);
  await persistence.whenSynced;

  if (options.initialFile && !isCollaborationDocumentInitialized(doc)) {
    writeOrgChartToCollaborationDocument(doc, options.initialFile);
  }

  let destroyed = false;
  let remoteReadQueued = false;
  let peerCount = 0;
  let signalingConnected = false;
  let lastTransportSignature = "";
  const peerConfiguration = await rtcConfiguration();
  const ignoredLegacySignaling = Boolean(import.meta.env.VITE_COLLAB_SIGNALING_URLS?.trim());

  const emitTransport = () => {
    const transport: CollaborationTransport = {
      signaling: "public",
      signalingConnected,
      ignoredConfiguredSignaling: ignoredLegacySignaling,
      turn: peerConfiguration.status,
    };
    const signature = [
      transport.signaling,
      transport.signalingConnected,
      transport.ignoredConfiguredSignaling,
      transport.turn,
    ].join(":");
    if (signature === lastTransportSignature) return;
    lastTransportSignature = signature;
    options.onTransport(transport);
  };
  const emitConnection = () => options.onConnection(signalingConnected || peerCount > 0);
  const updatePeerCount = (room: ReturnType<typeof joinRoom>) => {
    peerCount = Object.keys(room.getPeers()).length;
    options.onPeers(peerCount);
    emitConnection();
  };

  emitTransport();
  const room = joinRoom(
    {
      appId: TRYSTERO_APP_ID,
      password: options.invite.secret,
      rtcConfig: peerConfiguration.config,
    },
    options.invite.roomId,
    {
      onJoinError: ({ error }) => {
        console.warn("La découverte pair-à-pair a échoué.", error);
        signalingConnected = false;
        emitTransport();
        emitConnection();
      },
    },
  );

  const documentAction = room.makeAction<Uint8Array>("y-update");
  const awarenessAction = room.makeAction<Uint8Array>("y-aware");

  const emitParticipants = () => {
    const participants = Array.from(awareness.getStates().entries())
      .map(([clientId, state]) =>
        normalizeCollaborationParticipant(
          clientId,
          state as CollaborationAwarenessState,
          doc.clientID,
        ),
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
      options.onDocumentReady();
    });
  };

  const onDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== COLLABORATION_REMOTE_ORIGIN) {
      void documentAction.send(update).catch((error) => {
        if (!destroyed) console.warn("Une mise à jour collaborative n’a pas pu être envoyée.", error);
      });
    }
    if (origin === COLLABORATION_REMOTE_ORIGIN) emitRemoteFile();
  };

  const onAwarenessUpdate = (
    {
      added,
      updated,
      removed,
    }: {
      added: number[];
      updated: number[];
      removed: number[];
    },
    origin: unknown,
  ) => {
    const changedClients = [...added, ...updated, ...removed];
    if (origin !== COLLABORATION_REMOTE_ORIGIN && changedClients.length > 0) {
      const update = encodeAwarenessUpdate(awareness, changedClients);
      void awarenessAction.send(update).catch((error) => {
        if (!destroyed) console.warn("La présence n’a pas pu être envoyée.", error);
      });
    }
    const onlyLocalCursorUpdate =
      added.length === 0 &&
      removed.length === 0 &&
      updated.length > 0 &&
      updated.every((clientId) => clientId === doc.clientID);
    if (!onlyLocalCursorUpdate) emitParticipants();
  };

  documentAction.onMessage = (update) => {
    Y.applyUpdate(doc, bytes(update), COLLABORATION_REMOTE_ORIGIN);
  };
  awarenessAction.onMessage = (update) => {
    applyAwarenessUpdate(awareness, bytes(update), COLLABORATION_REMOTE_ORIGIN);
  };

  room.onPeerJoin = (peerId) => {
    updatePeerCount(room);
    void documentAction.send(Y.encodeStateAsUpdate(doc), { target: peerId });
    void awarenessAction.send(
      encodeAwarenessUpdate(awareness, [doc.clientID]),
      { target: peerId },
    );
  };
  room.onPeerLeave = (peerId) => {
    const clientIds = Array.from(awareness.getStates().entries())
      .filter(([, state]) => (state as CollaborationAwarenessState).peerId === peerId)
      .map(([clientId]) => clientId);
    if (clientIds.length > 0) {
      removeAwarenessStates(awareness, clientIds, COLLABORATION_REMOTE_ORIGIN);
    }
    updatePeerCount(room);
  };

  doc.on("update", onDocumentUpdate);
  awareness.on("update", onAwarenessUpdate);
  awareness.setLocalState({
    peerId: selfId,
    user: options.user,
    selectedNodeIds: [],
  });
  emitParticipants();
  updatePeerCount(room);

  const updateRelayStatus = () => {
    signalingConnected = Object.values(getRelaySockets() as Record<string, WebSocket>).some(
      (socket) => socket.readyState === WebSocket.OPEN,
    );
    emitTransport();
    emitConnection();
  };
  const relayStatusTimer = window.setInterval(updateRelayStatus, RELAY_STATUS_INTERVAL_MS);
  updateRelayStatus();

  if (options.initialFile) options.onDocumentReady();
  else emitRemoteFile();

  return {
    publishFile(file) {
      if (!destroyed) {
        writeOrgChartToCollaborationDocument(doc, guardCollaborativeOrgChart(file).file);
      }
    },
    updatePresence(patch) {
      if (destroyed) return;
      const current = (awareness.getLocalState() ?? {}) as CollaborationAwarenessState;
      const next: CollaborationAwarenessState = { ...current };
      if ("cursor" in patch) {
        if (patch.cursor) next.cursor = patch.cursor;
        else delete next.cursor;
      }
      if (patch.selectedNodeIds) next.selectedNodeIds = patch.selectedNodeIds;
      if ("editingNodeId" in patch) {
        if (patch.editingNodeId) next.editingNodeId = patch.editingNodeId;
        else delete next.editingNodeId;
      }
      awareness.setLocalState(next);
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      window.clearInterval(relayStatusTimer);
      awareness.setLocalState(null);
      doc.off("update", onDocumentUpdate);
      awareness.off("update", onAwarenessUpdate);
      await room.leave();
      awareness.destroy();
      await persistence.destroy();
      doc.destroy();
    },
  };
}
