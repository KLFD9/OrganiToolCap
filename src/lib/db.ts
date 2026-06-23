import Dexie, { type Table } from "dexie";
import type { OrgChartFile } from "../types/orgchart";

export interface DraftRecord {
  id: string;
  data: OrgChartFile;
  savedAt: string;
}

class OrgChartDB extends Dexie {
  drafts!: Table<DraftRecord, string>;

  constructor() {
    super("orgchart-builder");
    this.version(1).stores({
      drafts: "id",
    });
  }
}

export const db = new OrgChartDB();

export const DRAFT_ID = "current";

export async function saveDraft(data: OrgChartFile): Promise<void> {
  await db.drafts.put({ id: DRAFT_ID, data, savedAt: new Date().toISOString() });
}

export async function loadDraft(): Promise<DraftRecord | undefined> {
  return db.drafts.get(DRAFT_ID);
}

export async function clearDraft(): Promise<void> {
  await db.drafts.delete(DRAFT_ID);
}
