import { OrgChartFileSchema, type OrgChartFile } from "../types/orgchart";

declare global {
  interface Window {
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
    showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
  }
}

export type OpenResult =
  | { kind: "orgchart"; file: OrgChartFile; handle?: FileSystemFileHandle }
  | { kind: "pptx"; data: ArrayBuffer; fileName: string };

const OPEN_FILE_TYPES = [
  {
    description: "Organigramme JSON",
    accept: { "application/json": [".orgchart.json", ".json"] },
  },
  {
    description: "PowerPoint",
    accept: {
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    },
  },
];

export class FileFormatError extends Error {}

function suggestedName(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "organigramme";
  return `${slug}.orgchart.json`;
}

/** Enregistre le fichier. Réutilise le handle existant si fourni (Ctrl+S silencieux), sinon ouvre un dialogue. */
export async function saveOrgChartFile(
  data: OrgChartFile,
  handle?: FileSystemFileHandle
): Promise<FileSystemFileHandle | undefined> {
  const json = JSON.stringify(data, null, 2);

  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    return handle;
  }

  if (window.showSaveFilePicker) {
    const newHandle = await window.showSaveFilePicker({
      suggestedName: suggestedName(data.meta.title),
      types: [
        {
          description: "Organigramme JSON",
          accept: { "application/json": [".orgchart.json", ".json"] },
        },
      ],
    });
    const writable = await newHandle.createWritable();
    await writable.write(json);
    await writable.close();
    return newHandle;
  }

  // Fallback : téléchargement Blob
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName(data.meta.title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return undefined;
}

/** Parse et valide un contenu JSON brut contre le schéma OrgChartFile. */
export function parseOrgChartFile(raw: string): OrgChartFile {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new FileFormatError("Fichier non reconnu : ce n'est pas un JSON valide.");
  }

  if (
    typeof json === "object" &&
    json !== null &&
    "format" in json &&
    "version" in json &&
    (json as { format?: unknown }).format === "orgchart" &&
    (json as { version?: unknown }).version !== 1
  ) {
    throw new FileFormatError(
      "Ce fichier a été créé avec une version plus récente (ou incompatible) du format. Mise à jour de l'application requise."
    );
  }

  const result = OrgChartFileSchema.safeParse(json);
  if (!result.success) {
    throw new FileFormatError("Fichier non reconnu : le format ne correspond pas à un organigramme valide.");
  }

  return result.data;
}

function isPptx(name: string): boolean {
  return /\.pptx$/i.test(name);
}

/** Ouvre un fichier .orgchart.json ou .pptx via le dialogue natif si dispo, sinon via un input file. */
export async function openOrgChartFile(): Promise<OpenResult> {
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({
      types: OPEN_FILE_TYPES,
      multiple: false,
    });
    const file = await handle.getFile();
    if (isPptx(file.name)) {
      return { kind: "pptx", data: await file.arrayBuffer(), fileName: file.name };
    }
    const text = await file.text();
    return { kind: "orgchart", file: parseOrgChartFile(text), handle };
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.orgchart.json,.pptx,application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) {
        reject(new Error("Aucun fichier sélectionné."));
        return;
      }
      try {
        if (isPptx(f.name)) {
          resolve({ kind: "pptx", data: await f.arrayBuffer(), fileName: f.name });
        } else {
          resolve({ kind: "orgchart", file: parseOrgChartFile(await f.text()) });
        }
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}
