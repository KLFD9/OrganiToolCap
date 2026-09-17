import { useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FilePlus2,
  Layers,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash,
  X,
} from "lucide-react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { frameRectPx, nodesBounds } from "../lib/frames";

/** Navigation compacte : des pages à scanner rapidement, pas une galerie. */
interface PageRailProps {
  themeMode?: "light" | "dark";
  onClose: () => void;
  /** Ouvre le configurateur de la page dans le panneau Propriétés. */
  onConfigure?: () => void;
}

const ENTITY_COLORS = [
  { label: "Violet", value: "#6D4AAE" },
  { label: "Bleu", value: "#2563EB" },
  { label: "Émeraude", value: "#059669" },
  { label: "Ambre", value: "#D97706" },
  { label: "Rose", value: "#DB2777" },
  { label: "Ardoise", value: "#64748B" },
] as const;

export function PageRail({ themeMode = "light", onClose, onConfigure }: PageRailProps) {
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
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const dark = themeMode === "dark";
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const visibleFrames = useMemo(
    () => frames.filter((frame) => frame.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),
    [frames, query]
  );

  const jumpTo = (frameId: string) => {
    const frame = useOrgChartStore.getState().frames.find((candidate) => candidate.id === frameId);
    if (!frame) return;
    selectFrame(frameId);
    fitBounds(frameRectPx(frame), { duration: reduceMotion ? 0 : 300, padding: 0.1 });
  };
  const handleAddFrame = () => {
    const id = addFrame();
    requestAnimationFrame(() => jumpTo(id));
  };
  const commitRename = (frameId: string) => {
    const name = draft.trim();
    const frame = frames.find((candidate) => candidate.id === frameId);
    if (frame && name && name !== frame.name) updateFrame(frameId, { name });
    setRenamingId(null);
  };

  const iconButton = `rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
    dark ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
  }`;
  const menuSurface = dark ? "border-zinc-700 bg-zinc-900 text-zinc-100 shadow-black/35" : "border-zinc-200 bg-white text-zinc-700 shadow-zinc-900/15";

  return (
    <div className={`flex h-full w-full flex-col ${dark ? "bg-[#0d0d10]" : "bg-[#fbfbfc]"}`}>
      <div className={`flex h-12 shrink-0 items-center justify-between border-b px-3 ${dark ? "border-zinc-800 bg-[#111115]" : "border-zinc-200/80 bg-white"}`}>
        {searchOpen ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Search className={`h-3.5 w-3.5 shrink-0 ${dark ? "text-zinc-500" : "text-zinc-400"}`} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une page" aria-label="Rechercher une page" className={`min-w-0 flex-1 bg-transparent text-xs outline-none ${dark ? "placeholder:text-zinc-600" : "placeholder:text-zinc-400"}`} />
            <button type="button" aria-label="Fermer la recherche" title="Fermer la recherche" onClick={() => { setQuery(""); setSearchOpen(false); }} className={iconButton}><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <>
            <span className={`text-xs font-semibold tracking-wide ${dark ? "text-zinc-200" : "text-zinc-800"}`}>Pages</span>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => setSearchOpen(true)} title="Rechercher une page" aria-label="Rechercher une page" className={iconButton}><Search className="h-4 w-4" /></button>
              <button type="button" onClick={handleAddFrame} title="Ajouter une page" aria-label="Ajouter une page" className={iconButton}><FilePlus2 className="h-4 w-4" /></button>
              <button type="button" onClick={onClose} title="Replier le navigateur de pages" aria-label="Replier le navigateur de pages" className={iconButton}><PanelLeftClose className="h-4 w-4" /></button>
            </div>
          </>
        )}
      </div>

      {frames.length === 0 ? (
        <div className="flex flex-1 flex-col p-3">
          <button type="button" onClick={() => fitBounds(nodesBounds(nodes) ?? { x: 0, y: 0, width: 800, height: 560 }, { duration: reduceMotion ? 0 : 300, padding: 0.2 })} className={`flex items-center gap-2.5 rounded-lg border px-3 py-3 text-left text-xs font-semibold transition-colors ${dark ? "border-zinc-800 text-zinc-200 hover:bg-zinc-900" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}><Layers className="h-4 w-4 text-primary-500" />Page 1</button>
          <button type="button" onClick={handleAddFrame} className={`mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2.5 text-xs font-semibold ${dark ? "border-zinc-800 text-zinc-400 hover:border-primary-400 hover:text-primary-300" : "border-zinc-200 text-zinc-500 hover:border-primary-500 hover:text-primary-700"}`}><FilePlus2 className="h-3.5 w-3.5" />Créer des pages</button>
        </div>
      ) : (
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div className="space-y-1">
            {visibleFrames.map((frame) => {
              const index = frames.findIndex((candidate) => candidate.id === frame.id);
              const isSelected = frame.id === selectedFrameId;
              const menuOpen = frame.id === openMenuId;
              const marker = frame.color ?? (dark ? "#71717A" : "#A1A1AA");
              return (
                <div key={frame.id} className={`group relative flex min-h-10 items-center gap-2 rounded-lg border px-2 py-1 transition-colors ${isSelected ? dark ? "border-primary-500/60 bg-primary-950/30" : "border-primary-400/70 bg-primary-50/70" : dark ? "border-transparent hover:bg-zinc-900" : "border-transparent hover:bg-zinc-100/80"}`}>
                  <button type="button" onClick={() => jumpTo(frame.id)} onDoubleClick={() => { setDraft(frame.name); setRenamingId(frame.id); }} aria-current={isSelected ? "page" : undefined} title={`Aller à « ${frame.name} »`} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/60 dark:ring-zinc-950" style={{ backgroundColor: marker }} aria-hidden="true" />
                    {renamingId === frame.id ? (
                      <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => commitRename(frame.id)} onKeyDown={(event) => { if (event.key === "Enter") commitRename(frame.id); else if (event.key === "Escape") setRenamingId(null); }} onClick={(event) => event.stopPropagation()} aria-label="Nom de la page" className={`min-w-0 flex-1 rounded border bg-transparent px-1 py-0.5 text-xs font-semibold outline-none ${dark ? "border-primary-400 text-zinc-100" : "border-primary-500 text-zinc-800"}`} />
                    ) : <span className={`truncate text-xs font-semibold ${dark ? "text-zinc-200" : "text-zinc-700"}`}>{frame.name}</span>}
                  </button>
                  <button type="button" onClick={() => setOpenMenuId(menuOpen ? null : frame.id)} aria-expanded={menuOpen} aria-label={`Actions de la page ${frame.name}`} title="Actions de la page" className={`${iconButton} ${menuOpen || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}><MoreHorizontal className="h-4 w-4" /></button>
                  {menuOpen && (
                    <div role="menu" className={`absolute right-1 top-10 z-30 w-52 rounded-xl border p-1.5 shadow-xl ${menuSurface}`}>
                      <button type="button" role="menuitem" onClick={() => { setDraft(frame.name); setRenamingId(frame.id); setOpenMenuId(null); }} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium ${dark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"}`}><Pencil className="h-3.5 w-3.5" />Renommer</button>
                      <button type="button" role="menuitem" onClick={() => { selectFrame(frame.id); onConfigure?.(); setOpenMenuId(null); }} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium ${dark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"}`}><SlidersHorizontal className="h-3.5 w-3.5" />Configurer la page</button>
                      <div className={`my-1 border-t ${dark ? "border-zinc-700" : "border-zinc-200"}`} />
                      <p className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${dark ? "text-zinc-500" : "text-zinc-400"}`}>Repère d’entité</p>
                      <div className="flex items-center gap-1 px-2 pb-1.5 pt-0.5">
                        <button type="button" title="Aucune couleur" aria-label="Aucune couleur" onClick={() => { updateFrame(frame.id, { color: undefined }); setOpenMenuId(null); }} className={`flex h-5 w-5 items-center justify-center rounded-full border ${dark ? "border-zinc-600" : "border-zinc-300"}`}>{!frame.color && <Check className="h-3 w-3" />}</button>
                        {ENTITY_COLORS.map((color) => <button key={color.value} type="button" title={color.label} aria-label={`Couleur ${color.label}`} onClick={() => { updateFrame(frame.id, { color: color.value }); setOpenMenuId(null); }} className="flex h-5 w-5 items-center justify-center rounded-full ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" style={{ backgroundColor: color.value }}>{frame.color === color.value && <Check className="h-3 w-3 text-white" />}</button>)}
                      </div>
                      <div className={`my-1 border-t ${dark ? "border-zinc-700" : "border-zinc-200"}`} />
                      <div className="grid grid-cols-2 gap-1">
                        <button type="button" role="menuitem" disabled={index === 0} onClick={() => reorderFrame(frame.id, -1)} className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-30 ${dark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"}`}><ChevronUp className="h-3.5 w-3.5" />Monter</button>
                        <button type="button" role="menuitem" disabled={index === frames.length - 1} onClick={() => reorderFrame(frame.id, 1)} className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-30 ${dark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"}`}><ChevronDown className="h-3.5 w-3.5" />Descendre</button>
                      </div>
                      <button type="button" role="menuitem" onClick={() => { const cloneId = duplicateFrame(frame.id); setOpenMenuId(null); if (cloneId) requestAnimationFrame(() => jumpTo(cloneId)); }} className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium ${dark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"}`}><Copy className="h-3.5 w-3.5" />Dupliquer</button>
                      <button type="button" role="menuitem" onClick={() => { deleteFrame(frame.id); setOpenMenuId(null); }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash className="h-3.5 w-3.5" />Supprimer</button>
                    </div>
                  )}
                </div>
              );
            })}
            {visibleFrames.length === 0 && <p className={`px-2 py-5 text-center text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>Aucune page trouvée.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
