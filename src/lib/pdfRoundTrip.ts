import { parseOrgChartFile } from "./fileIO";
import type { OrgChartFile } from "../types/orgchart";

/** Nom stable et explicite de la source jointe aux PDF réimportables. */
export const EMBEDDED_PDF_CHART_FILE = "organitool-source.orgchart.json";
const EMBEDDED_PDF_MANIFEST_FILE = "organitool-source.manifest.json";

const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export class PdfImportError extends Error {}

interface PdfSourceManifest {
  format: "organitool-pdf-source";
  version: 1;
  sourceFile: typeof EMBEDDED_PDF_CHART_FILE;
  sha256: string;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new PdfImportError("Votre navigateur ne permet pas de vérifier la source intégrée au PDF. Utilisez une version récente du navigateur.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseManifest(value: Uint8Array): PdfSourceManifest | undefined {
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value)) as Partial<PdfSourceManifest>;
    if (
      parsed.format === "organitool-pdf-source" &&
      parsed.version === 1 &&
      parsed.sourceFile === EMBEDDED_PDF_CHART_FILE &&
      typeof parsed.sha256 === "string" &&
      /^[a-f0-9]{64}$/i.test(parsed.sha256)
    ) return parsed as PdfSourceManifest;
  } catch {
    // Une source historique sans manifeste reste réimportable.
  }
  return undefined;
}

/**
 * Ajoute au PDF final la source OrganiTool complète. Le rendu du PDF n'est pas
 * modifié : un lecteur PDF ordinaire continue donc à l'afficher normalement.
 */
export async function attachOrgChartSource(pdfBlob: Blob, chart: OrgChartFile): Promise<Blob> {
  const chartJson = JSON.stringify(chart);
  const source = new TextEncoder().encode(chartJson);
  if (source.byteLength > MAX_SOURCE_BYTES) {
    throw new PdfImportError("La source de l’organigramme est trop volumineuse pour être intégrée au PDF.");
  }

  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(await pdfBlob.arrayBuffer(), { updateMetadata: false });
  await pdf.attach(source, EMBEDDED_PDF_CHART_FILE, {
    mimeType: "application/json",
    description: "Source modifiable dans OrganiTool CAP",
    afRelationship: "Source",
    creationDate: new Date(),
    modificationDate: new Date(),
  });
  const manifest: PdfSourceManifest = {
    format: "organitool-pdf-source",
    version: 1,
    sourceFile: EMBEDDED_PDF_CHART_FILE,
    sha256: await sha256(source),
  };
  await pdf.attach(new TextEncoder().encode(JSON.stringify(manifest)), EMBEDDED_PDF_MANIFEST_FILE, {
    mimeType: "application/json",
    description: "Contrôle d’intégrité de la source OrganiTool CAP",
    afRelationship: "Supplement",
  });
  return new Blob([toArrayBuffer(await pdf.save())], { type: "application/pdf" });
}

/**
 * Extrait exclusivement la source jointe par OrganiTool. Aucune page, action,
 * annotation ou JavaScript PDF n'est exécuté ni rendu pendant cette opération.
 */
export async function importOrgChartPdf(data: ArrayBuffer): Promise<OrgChartFile> {
  if (data.byteLength > MAX_PDF_BYTES) {
    throw new PdfImportError("Ce PDF est trop volumineux pour être ouvert en toute sécurité.");
  }

  try {
    const { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } = await import("pdf-lib");
    const pdf = await PDFDocument.load(data, { updateMetadata: false });
    const names = pdf.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
    const embeddedFiles = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
    const entries = embeddedFiles?.lookupMaybe(PDFName.of("Names"), PDFArray);
    const attachments = new Map<string, Uint8Array>();

    for (let index = 0; entries && index + 1 < entries.size(); index += 2) {
      const name = entries.lookup(index) as { decodeText?: () => string } | undefined;
      const filename = name?.decodeText?.();
      if (filename !== EMBEDDED_PDF_CHART_FILE && filename !== EMBEDDED_PDF_MANIFEST_FILE) continue;
      if (attachments.has(filename)) throw new PdfImportError("Ce PDF contient plusieurs sources OrganiTool ambiguës.");
      const fileSpec = entries.lookupMaybe(index + 1, PDFDict);
      const fileStreams = fileSpec?.lookupMaybe(PDFName.of("EF"), PDFDict);
      const stream = fileStreams?.lookup(PDFName.of("F")) as InstanceType<typeof PDFRawStream> | undefined;
      if (stream instanceof PDFRawStream) attachments.set(filename, decodePDFRawStream(stream).decode());
    }
    const source = attachments.get(EMBEDDED_PDF_CHART_FILE);

    if (!source) {
      throw new PdfImportError(
        "Ce PDF ne contient pas de source OrganiTool modifiable. Ouvrez le fichier .orgchart.json original, un PowerPoint OrganiTool, ou importez une liste Excel/CSV."
      );
    }
    if (source.byteLength > MAX_SOURCE_BYTES) {
      throw new PdfImportError("La source intégrée à ce PDF est trop volumineuse.");
    }
    const manifestBytes = attachments.get(EMBEDDED_PDF_MANIFEST_FILE);
    if (manifestBytes) {
      const manifest = parseManifest(manifestBytes);
      if (!manifest || manifest.sha256 !== await sha256(source)) {
        throw new PdfImportError("La source intégrée ne correspond pas au contrôle d’intégrité de ce PDF.");
      }
    }

    return parseOrgChartFile(new TextDecoder("utf-8", { fatal: true }).decode(source));
  } catch (error) {
    if (error instanceof PdfImportError) throw error;
    throw new PdfImportError("Ce PDF ne peut pas être lu ou sa source OrganiTool est endommagée.");
  }
}
