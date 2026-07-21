import type { Node } from "@xyflow/react";
import { captureFlow } from "./pdfExport";

export interface WebPageImage {
  name: string;
  nodes: Node[];
}

export interface WebPagesExportOptions {
  title?: string;
  transparent?: boolean;
  scale: number;
  onProgress?: (current: number, total: number) => void;
}

export function webFileSlug(value: string, fallback = "page"): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || fallback;
}

export function webPagePngFilename(name: string, index: number, total: number): string {
  const digits = Math.max(2, String(total).length);
  return `${String(index + 1).padStart(digits, "0")}-${webFileSlug(name)}.png`;
}

/** Exporte uniquement les pages Web, dans l'ordre du rail, sans PDF ni CSV. */
export async function exportWebPagesZip(
  viewportEl: HTMLElement,
  pages: WebPageImage[],
  options: WebPagesExportOptions
): Promise<void> {
  const exportable = pages
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => page.nodes.length > 0);
  if (exportable.length === 0) return;

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  for (let i = 0; i < exportable.length; i++) {
    options.onProgress?.(i + 1, exportable.length);
    const { page, index } = exportable[i];
    const capture = await captureFlow(viewportEl, page.nodes, "png", options.scale, {
      transparent: options.transparent,
    });
    zip.file(webPagePngFilename(page.name, index, pages.length), capture.dataUrl.split(",")[1], {
      base64: true,
    });
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${webFileSlug(options.title || "organigramme", "organigramme")}-pages-web.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
