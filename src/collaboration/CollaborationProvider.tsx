import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import {
  buildCollaborationUrl,
  createCollaborationInvite,
  parseCollaborationInvite,
  removeCollaborationInviteFromUrl,
  type CollaborationInvite,
} from "../lib/collaborationLink";
import type {
  CollaborationCursor,
  CollaborationParticipant,
  CollaborationRuntime,
  CollaborationTransport,
} from "../lib/collaborationRuntime";
import {
  CollaborationContext,
  type CollaborationContextValue,
  type CollaborationStatus,
} from "./CollaborationContext";
const PARTICIPANT_COLORS = ["#6D4AAE", "#2563EB", "#059669", "#D97706", "#DB2777", "#0891B2"];
const DOCUMENT_KEYS = ["meta", "templateId", "theme", "nodes", "edges", "layout", "frames"] as const;

function randomParticipantColor(): string {
  const index = crypto.getRandomValues(new Uint8Array(1))[0] % PARTICIPANT_COLORS.length;
  return PARTICIPANT_COLORS[index];
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 40);
}

function documentChanged(
  current: ReturnType<typeof useOrgChartStore.getState>,
  previous: ReturnType<typeof useOrgChartStore.getState>,
): boolean {
  return DOCUMENT_KEYS.some((key) => current[key] !== previous[key]);
}

export function CollaborationProvider({ children }: { children: ReactNode }) {
  const runtimeRef = useRef<CollaborationRuntime | null>(null);
  const publishTimerRef = useRef<number | null>(null);
  const applyingRemoteRef = useRef(false);
  const resetFileHandleOnNextRemoteRef = useRef(false);
  const pendingCursorRef = useRef<CollaborationCursor | null>(null);
  const cursorFrameRef = useRef<number | null>(null);

  const [status, setStatus] = useState<CollaborationStatus>("idle");
  const [connected, setConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [participants, setParticipants] = useState<CollaborationParticipant[]>([]);
  const [invite, setInvite] = useState<CollaborationInvite | undefined>(() =>
    typeof window === "undefined" ? undefined : parseCollaborationInvite(),
  );
  const [shareUrl, setShareUrl] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(() => Boolean(invite));
  const [error, setError] = useState<string>();
  const [isHost, setIsHost] = useState(false);
  const [transport, setTransport] = useState<CollaborationTransport>({
    signaling: import.meta.env.VITE_COLLAB_SIGNALING_URLS?.trim() ? "private" : "public",
    turn:
      import.meta.env.VITE_COLLAB_TURN_CREDENTIALS_URL?.trim() ||
      import.meta.env.VITE_COLLAB_ICE_SERVERS_JSON?.trim()
        ? "unavailable"
        : "not-configured",
  });
  const selectedNodeIds = useOrgChartStore((state) => state.selectedNodeIds);

  useEffect(() => {
    return useOrgChartStore.subscribe((current, previous) => {
      if (!runtimeRef.current || applyingRemoteRef.current || !documentChanged(current, previous)) return;
      if (publishTimerRef.current !== null) window.clearTimeout(publishTimerRef.current);
      publishTimerRef.current = window.setTimeout(() => {
        publishTimerRef.current = null;
        runtimeRef.current?.publishFile(useOrgChartStore.getState().toFile());
      }, 80);
    });
  }, []);

  useEffect(() => {
    runtimeRef.current?.updatePresence({ selectedNodeIds });
  }, [selectedNodeIds]);

  const stopRuntime = useCallback(async () => {
    if (publishTimerRef.current !== null) {
      window.clearTimeout(publishTimerRef.current);
      publishTimerRef.current = null;
    }
    if (cursorFrameRef.current !== null) {
      window.cancelAnimationFrame(cursorFrameRef.current);
      cursorFrameRef.current = null;
    }
    const runtime = runtimeRef.current;
    runtimeRef.current = null;
    if (runtime) await runtime.destroy();
  }, []);

  useEffect(() => () => void stopRuntime(), [stopRuntime]);

  const beginSession = useCallback(
    async (sessionInvite: CollaborationInvite, rawName: string, host: boolean) => {
      const name = normalizeName(rawName);
      if (!name) {
        setError("Saisissez votre prénom ou un pseudonyme.");
        return;
      }

      setStatus("starting");
      setError(undefined);
      setIsHost(host);
      resetFileHandleOnNextRemoteRef.current = !host;
      localStorage.setItem("collaboration-display-name", name);

      try {
        await stopRuntime();
        const { createCollaborationRuntime } = await import("../lib/collaborationRuntime");
        const runtime = await createCollaborationRuntime({
          invite: sessionInvite,
          user: { name, color: randomParticipantColor() },
          initialFile: host ? useOrgChartStore.getState().toFile() : undefined,
          onRemoteFile: (file) => {
            applyingRemoteRef.current = true;
            useOrgChartStore
              .getState()
              .applyCollaborativeFile(file, resetFileHandleOnNextRemoteRef.current);
            resetFileHandleOnNextRemoteRef.current = false;
            applyingRemoteRef.current = false;
          },
          onParticipants: setParticipants,
          onPeers: setPeerCount,
          onConnection: setConnected,
          onTransport: setTransport,
        });
        runtimeRef.current = runtime;
        setInvite(sessionInvite);
        const url = buildCollaborationUrl(sessionInvite);
        setShareUrl(url);
        window.history.replaceState(null, "", url);
        setStatus("active");
      } catch (sessionError) {
        console.error(sessionError);
        setStatus("error");
        setError("La session collaborative n’a pas pu démarrer. Vérifiez votre connexion.");
      }
    },
    [stopRuntime],
  );

  const startSession = useCallback(
    async (name: string) => beginSession(createCollaborationInvite(), name, true),
    [beginSession],
  );

  const joinSession = useCallback(
    async (name: string) => {
      const invitation = invite ?? parseCollaborationInvite();
      if (!invitation) {
        setError("Ce lien de collaboration est incomplet ou invalide.");
        return;
      }
      await beginSession(invitation, name, false);
    },
    [beginSession, invite],
  );

  const leaveSession = useCallback(async () => {
    await stopRuntime();
    setStatus("idle");
    setConnected(false);
    setPeerCount(0);
    setParticipants([]);
    setShareUrl(undefined);
    setInvite(undefined);
    setIsHost(false);
    setTransport({
      signaling: import.meta.env.VITE_COLLAB_SIGNALING_URLS?.trim() ? "private" : "public",
      turn:
        import.meta.env.VITE_COLLAB_TURN_CREDENTIALS_URL?.trim() ||
        import.meta.env.VITE_COLLAB_ICE_SERVERS_JSON?.trim()
          ? "unavailable"
          : "not-configured",
    });
    setError(undefined);
    window.history.replaceState(null, "", removeCollaborationInviteFromUrl());
  }, [stopRuntime]);

  const updateCursor = useCallback((cursor: CollaborationCursor | null) => {
    pendingCursorRef.current = cursor;
    if (cursorFrameRef.current !== null) return;
    cursorFrameRef.current = window.requestAnimationFrame(() => {
      cursorFrameRef.current = null;
      runtimeRef.current?.updatePresence({ cursor: pendingCursorRef.current });
    });
  }, []);

  const value = useMemo<CollaborationContextValue>(
    () => ({
      status,
      connected,
      peerCount,
      participants,
      shareUrl,
      invitationAvailable: Boolean(invite) && status === "idle",
      dialogOpen,
      error,
      isHost,
      transport,
      openDialog: () => setDialogOpen(true),
      closeDialog: () => setDialogOpen(false),
      startSession,
      joinSession,
      leaveSession,
      updateCursor,
    }),
    [
      status,
      connected,
      peerCount,
      participants,
      shareUrl,
      invite,
      dialogOpen,
      error,
      isHost,
      transport,
      startSession,
      joinSession,
      leaveSession,
      updateCursor,
    ],
  );

  return <CollaborationContext.Provider value={value}>{children}</CollaborationContext.Provider>;
}
