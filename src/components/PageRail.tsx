import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, Copy, FilePlus2, Layers, PanelLeftClose, Trash } from "lucide-react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { computeFrameMembership, frameRectPx, frameSizePx, nodesBounds } from "../lib/frames";
import { computeNodeHeight, computeNodeWidth } from "../lib/nodeStyle";
import { resolveDisplay } from "../types/orgchart";

/**
 * Navigateur de pages : panneau ancré à gauche du canevas (style Figma).
 * Miniature de sommaire visuel, renommage au double-clic et actions essentielles.
 * Les réglages détaillés restent regroupés dans le panneau Propriétés.
 */

interface PageRailProps {
  themeMode?: "light" | "dark";
  onClose: () => void;
}

export function PageRail({ themeMode = "light", onClose }: PageRailProps) {
  const frames = useOrgChartStore((s) => s.frames);
  const nodes = useOrgChartStore((s) => s.nodes);
  const theme = useOrgChartStore((s) => s.theme);
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
  const display = resolveDisplay(theme);

  return (
    <div className={`flex h-full w-full flex-col ${dark ? "bg-[#0d0d10]" : "bg-[#fbfbfc]"}`}>
      {/* Header Figma-style */}
      <div
        className={`flex h-12 items-center justify-between px-4 border-b ${
          dark ? "border-zinc-800/80 bg-[#111115]" : "border-zinc-200/80 bg-white"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold tracking-wide ${dark ? "text-zinc-200" : "text-zinc-800"}`}>Pages</span>
          <span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] ${dark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
            {Math.max(1, frames.length)}
          </span>
        </div>
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
        /* Compatibilité : anciens fichiers sans `frames` = une page implicite. */
        <div className="flex flex-col p-3 h-full flex-1">
          <button
            onClick={() => fitBounds(nodesBounds(nodes) ?? { x: 0, y: 0, width: 800, height: 560 }, { duration: reduceMotion ? 0 : 300, padding: 0.2 })}
            className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${dark ? "border-primary-400/50 bg-zinc-900/30 hover:bg-zinc-900/50" : "border-primary-600/40 bg-white hover:bg-primary-50/30"}`}
          >
            <div className={`flex h-28 items-center justify-center rounded-md border ${dark ? "border-zinc-800 bg-zinc-900" : "border-zinc-200 bg-white"}`}>
              <Layers className={`h-6 w-6 ${dark ? "text-primary-400" : "text-primary-600"}`} />
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <span className={`text-xs font-semibold ${dark ? "text-zinc-200" : "text-zinc-800"}`}>Page 1</span>
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] ${dark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>{nodes.length}</span>
            </div>
          </button>
          <button
            onClick={handleAddFrame}
            className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${dark ? "border-zinc-800 text-zinc-400 hover:border-primary-400/50 hover:text-primary-300" : "border-zinc-200 text-zinc-500 hover:border-primary-600/40 hover:text-primary-700"}`}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            <span>Activer les pages</span>
          </button>
        </div>
      ) : (
        <div className="custom-scrollbar flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5">
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
                className={`group relative overflow-hidden rounded-xl border p-2 transition-[border-color,background-color,box-shadow] duration-200 cursor-pointer ${
                  isSelected
                    ? dark
                      ? "border-primary-500/70 bg-primary-950/20 shadow-[0_12px_30px_-20px_rgba(109,74,174,0.9)] ring-1 ring-primary-400/20"
                      : "border-primary-500/60 bg-white shadow-[0_12px_30px_-20px_rgba(71,47,116,0.45)] ring-1 ring-primary-500/15"
                    : dark
                    ? "border-zinc-800 bg-zinc-900/25 hover:border-zinc-700 hover:bg-zinc-900/45"
                    : "border-zinc-200/90 bg-white/80 hover:border-zinc-300 hover:bg-white hover:shadow-sm"
                }`}
              >
                {isSelected && <span className="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-primary-500" aria-hidden="true" />}
                {/* Miniature schématique : feuille + cartes en rectangles */}
                <button
                  onClick={() => jumpTo(frame.id)}
                  title={`Aller à « ${frame.name} »`}
                  className="block w-full cursor-pointer"
                >
                  <svg
                    viewBox={`0 0 ${size.width} ${size.height}`}
                    className="h-28 w-full rounded-lg shadow-sm transition-shadow hover:shadow-md"
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
                        width={computeNodeWidth(n, display.showPhotos)}
                        height={computeNodeHeight(n, display)}
                        rx={14}
                        fill={dark ? "rgba(157, 131, 203, 0.78)" : "rgba(109, 74, 174, 0.66)"}
                      />
                    ))}
                  </svg>
                </button>

                {/* Actions regroupées sur la miniature : visibles sur la page
                    active, au survol ou au focus clavier. */}
                <div
                  className={`absolute right-3 top-3 flex items-center gap-0.5 rounded-lg border p-0.5 shadow-sm backdrop-blur transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${
                    isSelected ? "opacity-100" : "opacity-0"
                  } ${dark ? "border-zinc-700/80 bg-zinc-900/90" : "border-zinc-200/90 bg-white/90"}`}
                >
                  {frames.length > 1 && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderFrame(frame.id, -1);
                        }}
                        disabled={index === 0}
                        title="Avancer dans l'ordre des pages"
                        aria-label="Avancer la page dans l'ordre d'export"
                        className={`${iconButton} disabled:opacity-25 disabled:cursor-default`}
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
                        className={`${iconButton} disabled:opacity-25 disabled:cursor-default`}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <span className={`mx-0.5 h-4 w-px ${dark ? "bg-zinc-700" : "bg-zinc-200"}`} aria-hidden="true" />
                    </>
                  )}
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

                {/* Nom (double-clic pour renommer) + effectif */}
                <div className="mt-2 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className={`flex h-5 min-w-5 items-center justify-center rounded-md font-mono text-[9px] font-bold ${isSelected ? "bg-primary-600 text-white" : dark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
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
                  <span
                    aria-label={`${memberIds.length} membre${memberIds.length > 1 ? "s" : ""}`}
                    className={`shrink-0 font-mono text-[9px] ${dark ? "text-zinc-500" : "text-zinc-400"}`}
                  >
                    {memberIds.length} pers.
                  </span>
                </div>

                {/* Résumé de sortie ; les réglages détaillés sont dans Propriétés. */}
                <div className={`ml-7 mt-0.5 text-[9px] font-medium ${
                    isSelected
                      ? dark
                        ? "text-primary-300"
                        : "text-primary-700"
                      : dark
                      ? "text-zinc-500"
                      : "text-zinc-400"
                  }`}>
                  {frame.page.format.toUpperCase()} · {frame.page.orientation === "landscape" ? "Paysage" : "Portrait"}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
