import { useState } from "react";
import { NodeResizer, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { Bold, Italic, Pencil, Trash2 } from "lucide-react";
import type { PageElement } from "../types/orgchart";

/** Élément de composition libre, toujours contenu dans une frame. */
export interface PageElementData extends Record<string, unknown> {
  element: PageElement;
  dark: boolean;
  onChange: (patch: Partial<Omit<PageElement, "id" | "type">>) => void;
  onDelete: () => void;
}

function PageElementImpl({ data, selected }: NodeProps & { data: PageElementData }) {
  const { element, dark, onChange, onDelete } = data;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(element.value);
  const isText = element.type === "text";
  const textColor = element.color ?? (dark ? "#F4F4F5" : "#27272A");

  return (
    <div className="group/page-element h-full w-full" title={isText ? "Double-cliquer pour modifier" : "Image ou logo de page — proportions conservées"}>
      <NodeResizer
        isVisible={Boolean(selected)}
        keepAspectRatio={!isText}
        minWidth={isText ? 24 : 14}
        minHeight={12}
        lineStyle={{ borderColor: "rgba(109, 74, 174, 0.6)" }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: "#fff", border: "1.5px solid #6D4AAE" }}
        // La poignée ne modifie que le cadre. Mélanger cadre et police crée
        // des réévaluations en cascade quand plusieurs gestes se suivent.
        onResizeEnd={(_event, params) => onChange({ width: params.width, height: params.height })}
      />
      {selected && (
        <NodeToolbar isVisible position={Position.Top} offset={14} className="nodrag nopan nowheel">
          <div className={`flex items-center gap-1 rounded-full border p-1 shadow-xl ${dark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-700"}`}>
            {isText ? <>
              <button type="button" aria-label="Modifier le texte" title="Modifier" onClick={() => { setDraft(element.value); setEditing(true); }} className="rounded-full p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label="Gras" aria-pressed={element.bold ?? false} title="Gras" onClick={() => onChange({ bold: !element.bold })} className={`rounded-full p-1.5 ${element.bold ? "bg-primary-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}><Bold className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label="Italique" aria-pressed={element.italic ?? false} title="Italique" onClick={() => onChange({ italic: !element.italic })} className={`rounded-full p-1.5 ${element.italic ? "bg-primary-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}><Italic className="h-3.5 w-3.5" /></button>
              <label className="ml-1 flex h-7 items-center gap-1 rounded-full px-2 text-[10px] font-semibold text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800" title="Taille de police">
                <span>Taille</span>
                <input
                  type="number"
                  min={6}
                  max={96}
                  aria-label="Taille de police"
                  key={element.fontSize}
                  defaultValue={Math.round(element.fontSize ?? 12)}
                  onBlur={(event) => {
                    const next = Number(event.currentTarget.value);
                    if (Number.isFinite(next)) onChange({ fontSize: Math.max(6, Math.min(96, next)) });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") event.currentTarget.blur();
                  }}
                  className="nodrag nowheel w-8 border-0 bg-transparent p-0 text-center text-[10px] font-semibold outline-none"
                />
                <span>px</span>
              </label>
              <label className="relative h-6 w-6 rounded-full ring-1 ring-black/10" style={{ backgroundColor: textColor }} title="Couleur du texte"><span className="sr-only">Couleur du texte</span><input type="color" aria-label="Couleur du texte" value={textColor} onChange={(event) => onChange({ color: event.target.value.toUpperCase() })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label>
            </> : <span className="px-2 text-[10px] font-semibold text-zinc-500 dark:text-zinc-300">Image · proportions conservées</span>}
            <button type="button" aria-label="Supprimer l’élément" title="Supprimer" onClick={onDelete} className="rounded-full p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </NodeToolbar>
      )}
      {isText ? editing ? (
        <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { onChange({ value: draft }); setEditing(false); }} onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { onChange({ value: draft }); setEditing(false); } }} className="nodrag nowheel h-full w-full resize-none rounded border border-primary-400 bg-white/95 p-1 outline-none dark:bg-zinc-900" style={{ color: textColor, fontSize: element.fontSize ?? 12, fontWeight: element.bold ? 700 : 400, fontStyle: element.italic ? "italic" : "normal" }} />
      ) : (
        <div onDoubleClick={() => { setDraft(element.value); setEditing(true); }} className="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-1" style={{ color: textColor, fontSize: element.fontSize ?? 12, fontWeight: element.bold ? 700 : 400, fontStyle: element.italic ? "italic" : "normal", lineHeight: 1.2 }}>{element.value}</div>
      ) : (
        <img src={element.value} alt="Élément de page" draggable={false} className="h-full w-full object-contain" />
      )}
    </div>
  );
}

export const PageElementNode = PageElementImpl;
