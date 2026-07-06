import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, Copy, FilePlus2, Layers, PanelLeftClose, Trash } from "lucide-react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { computeFrameMembership, frameRectPx, frameSizePx } from "../lib/frames";
import { CARD_HEIGHT, CARD_WIDTH } from "../lib/compactLayout";

/**
 * Navigateur de pages : panneau ancré à gauche du canevas (style Figma).
 * Miniature de sommaire visuel, renommage au double-clic, réglage du format
 * de page (A4/A3, orientation) et actions de réorganisation/duplication/suppression.
 */

interface PageRailProps {
  themeMode?: "light" | "dark";
  onClose: () => void;
}

export function PageRail({ themeMode = "light", onClose }: PageRailProps) {
  const frames = useOrgChartStore((s) => s.frames);
  const nodes = useOrgChartStore((s) => s.nodes);
  const addFrame = useOrgChartStore((s) => s.addFrame);
  const updateFrame = useOrgChartStore((s) => s.updateFrame);
  const deleteFrame = useOrgChartStore((s) => s.deleteFrame);
  const duplicateFrame = useOrgChartStore((s) => s.duplicateFrame);
  const reorderFrame = useOrgChartStore((s) => s.reorderFrame);
  const selectedFrameId = useOrgChartStore((s) => s.selectedFrameId);
  const selectFrame = useOrgChartStore((s) => s.selectFrame);
  const { fitBounds } = useReactFlow();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const dark = themeMode === "dark";
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const jumpTo = (frameId: string) => {
    const frame = useOrgChartStore.getState().frames.find((f) => f.id === frameId);
    if (!frame) return;
    selectFrame(frameId);
    const rect = frameRectPx(frame);
    fitBounds(rect, { duration: reduceMotion ? 0 : 300, padding: 0.1 });
  };

  const handleAddFrame = () => {
    const id = addFrame();
    requestAnimationFrame(() => jumpTo(id));
  };

  const commitRename = (frameId: string) => {
    const name = draft.trim();
    const frame = frames.find((f) => f.id === frameId);
    if (frame && name && name !== frame.name) updateFrame(frameId, { name });
    setRenamingId(null);
  };

  const iconButton = `rounded-lg p-1 transition-all cursor-pointer ${
    dark
      ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
      : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
  }`;

  const membership = computeFrameMembership(frames, nodes);

  return (
    <div className="flex flex-col h-full w-full bg-panel-bg-light dark:bg-panel-bg-dark">
      {/* Header Figma-style */}
      <div
        className={`flex h-12 items-center justify-between px-4 border-b ${
          dark ? "border-border-dark bg-zinc-950/20" : "border-border-light bg-zinc-50/50"
        }`}
      >
        <span className={`text-xs font-semibold tracking-wide ${dark ? "text-zinc-200" : "text-zinc-800"}`}>
          Pages{frames.length > 0 ? ` (${frames.length})` : ""}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleAddFrame}
            title="Ajouter une page"
            aria-label="Ajouter une page"
            className={iconButton}
          >
            <FilePlus2 className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            title="Replier le navigateur de pages"
            aria-label="Replier le navigateur de pages"
            className={iconButton}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {frames.length === 0 ? (
        /* État d'accueil Figma-style */
        <div className="flex flex-col items-center justify-center p-6 text-center h-full flex-1">
          <div className={`mb-4 rounded-full p-4 ${dark ? "bg-primary-950/20 text-primary-400" : "bg-primary-50 text-primary-600"}`}>
            <Layers className="h-7 w-7" />
          </div>
          <h3 className={`text-sm font-semibold ${dark ? "text-zinc-200" : "text-zinc-800"}`}>
            Aucune page
          </h3>
          <p className={`mt-2 text-[11px] leading-relaxed max-w-[185px] ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
            Découpez le document en <strong>pages A4/A3</strong> pour un export multi-pages de qualité professionnelle.
          </p>
          <button
            onClick={handleAddFrame}
            className={`mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
              dark ? "bg-primary-600 text-white hover:bg-primary-500" : "bg-primary-700 text-white hover:bg-primary-600"
            }`}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            <span>Créer la première page</span>
          </button>
        </div>
      ) : (
        <div className="custom-scrollbar flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {frames.map((frame, index) => {
            const size = frameSizePx(frame.page);
            const memberIds = membership.byFrame.get(frame.id) ?? [];
            const memberSet = new Set(memberIds);
            const members = nodes.filter((n) => memberSet.has(n.id));

            const isSelected = frame.id === selectedFrameId;

            return (
              <div
                key={frame.id}
                onClick={() => selectFrame(frame.id)}
                className={`group rounded-xl border p-2.5 transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? dark
                      ? "border-primary-400/70 bg-zinc-900/30 shadow-sm ring-1 ring-primary-400/30"
                      : "border-primary-600/60 bg-white shadow-sm ring-1 ring-primary-600/20"
                    : dark
                    ? "border-zinc-800/60 bg-zinc-900/10 hover:border-primary-400/40 hover:bg-zinc-900/20 hover:shadow-sm"
                    : "border-zinc-200 bg-zinc-50/40 hover:border-primary-600/30 hover:bg-white hover:shadow-sm"
                }`}
              >
                {/* Miniature schématique : feuille + cartes en rectangles */}
                <button
                  onClick={() => jumpTo(frame.id)}
                  title={`Aller à « ${frame.name} »`}
                  className="block w-full cursor-pointer"
                >
                  <svg
                    viewBox={`0 0 ${size.width} ${size.height}`}
                    className="w-full rounded-md shadow-sm transition-shadow hover:shadow-md"
                    style={{
                      background: dark ? "#1c1c1e" : "#ffffff",
                      border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(24,24,27,0.08)"}`,
                      aspectRatio: `${size.width} / ${size.height}`,
                    }}
                    role="img"
                    aria-label={`Miniature de la page ${frame.name}`}
                  >
                    {members.map((n) => (
                      <rect
                        key={n.id}
                        x={n.position.x - frame.position.x}
                        y={n.position.y - frame.position.y}
                        width={CARD_WIDTH}
                        height={CARD_HEIGHT}
                        rx={24}
                        fill={dark ? "rgba(157, 131, 203, 0.7)" : "rgba(109, 74, 174, 0.55)"}
                      />
                    ))}
                  </svg>
                </button>

                {/* Nom (double-clic pour renommer) + effectif */}
                <div className="mt-2.5 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className={`font-mono text-[9px] ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
                      {index + 1}
                    </span>
                    {renamingId === frame.id ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => commitRename(frame.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(frame.id);
                          else if (e.key === "Escape") setRenamingId(null);
                        }}
                        className={`min-w-0 flex-1 rounded border px-1.5 py-0.5 text-xs focus:outline-none ${
                          dark
                            ? "border-primary-400/60 bg-zinc-950 text-zinc-100"
                            : "border-primary-600/60 bg-white text-zinc-800"
                        }`}
                      />
                    ) : (
                      <button
                        onDoubleClick={() => {
                          setDraft(frame.name);
                          setRenamingId(frame.id);
                        }}
                        onClick={() => jumpTo(frame.id)}
                        title="Double-clic pour renommer"
                        className={`min-w-0 flex-1 truncate text-left text-xs font-semibold hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer ${
                          dark ? "text-zinc-300" : "text-zinc-700"
                        }`}
                      >
                        {frame.name}
                      </button>
                    )}
                  </div>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded-full font-mono text-[9px] font-medium ${
                    dark ? "bg-zinc-800/80 text-zinc-400" : "bg-zinc-100 text-zinc-500"
                  }`}>
                    {memberIds.length}
                  </span>
                </div>

                {/* Format papier : lecture seule ici — cliquer la page l'ouvre
                    dans le panneau Propriétés (à droite) pour le modifier. */}
                <div
                  className={`mt-2 flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-wide ${
                    isSelected
                      ? dark
                        ? "text-primary-300"
                        : "text-primary-700"
                      : dark
                      ? "text-zinc-500"
                      : "text-zinc-400"
                  }`}
                >
                  <span>
                    {frame.page.format.toUpperCase()} · {frame.page.orientation === "landscape" ? "Paysage" : "Portrait"}
                  </span>
                  {isSelected && <span className="normal-case font-normal opacity-80">— réglable à droite →</span>}
                </div>

                {/* Actions (toujours visibles mais atténuées, s'activent au survol) */}
                <div className="mt-2.5 pt-2 flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-800/40 opacity-40 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorderFrame(frame.id, -1);
                      }}
                      disabled={index === 0}
                      title="Avancer dans l'ordre des pages"
                      aria-label="Avancer la page dans l'ordre d'export"
                      className={`${iconButton} disabled:opacity-30 disabled:cursor-default`}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorderFrame(frame.id, 1);
                      }}
                      disabled={index === frames.length - 1}
                      title="Reculer dans l'ordre des pages"
                      aria-label="Reculer la page dans l'ordre d'export"
                      className={`${iconButton} disabled:opacity-30 disabled:cursor-default`}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const cloneId = duplicateFrame(frame.id);
                        if (cloneId) requestAnimationFrame(() => jumpTo(cloneId));
                      }}
                      title="Dupliquer la page avec son contenu"
                      aria-label={`Dupliquer la page ${frame.name}`}
                      className={iconButton}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFrame(frame.id);
                      }}
                      title="Supprimer la page (les cartes restent sur le canevas)"
                      aria-label={`Supprimer la page ${frame.name}`}
                      className={`rounded-lg p-1 transition-all cursor-pointer ${
                        dark
                          ? "text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                          : "text-zinc-500 hover:text-red-600 hover:bg-red-50"
                      }`}
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {frames.length > 0 && (
        <div className={`p-3 border-t ${dark ? "border-border-dark bg-zinc-950/10" : "border-border-light bg-zinc-50/30"}`}>
          <button
            onClick={handleAddFrame}
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
              dark
                ? "border-zinc-800 text-zinc-400 hover:border-primary-400/50 hover:text-primary-300 bg-zinc-900/10 hover:bg-zinc-900/25"
                : "border-zinc-200 text-zinc-500 hover:border-primary-600/40 hover:text-primary-700 bg-zinc-50/50 hover:bg-primary-50/5"
            }`}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            <span>Ajouter une page</span>
          </button>
        </div>
      )}
    </div>
  );
}
