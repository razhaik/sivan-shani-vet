import { BusinessClient, ClientArchive } from "@/entities";
import type { ClientRow } from "@/lib/crmClientData";

export type ClientActionResultKind = "deleted" | "archived" | "failed";

export interface ClientActionResult {
  rowId: string;
  name: string;
  kind: ClientActionResultKind;
  importedRecordsDeleted: number;
  archiveCreated: boolean;
  error?: string;
}

export interface ClientActionSummary {
  total: number;
  deletedRows: number;
  archivedRows: number;
  failedRows: number;
  importedRecordsDeleted: number;
  archiveRecordsCreated: number;
  results: ClientActionResult[];
}

function recordText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

export function clientRowHasHistory(row: ClientRow): boolean {
  return row.status === "lead" || row.appointments.length > 0 || row.inquiries.length > 0 || row.appointmentCount > 0;
}

export function isImportedOnlyClientRow(row: ClientRow): boolean {
  return row.status === "imported" && !clientRowHasHistory(row);
}

function uniqueBusinessClientIds(row: ClientRow): string[] {
  return Array.from(new Set(row.businessClientIds.map(recordText).filter(Boolean)));
}

function archiveKeyFor(row: ClientRow): string {
  const key = recordText(row.id);
  return /^(client|lead):.+/.test(key) ? key : "";
}

function failedResult(row: ClientRow, error: string, importedRecordsDeleted = 0): ClientActionResult {
  return {
    rowId: row.id,
    name: row.name || "לקוח ללא שם",
    kind: "failed",
    importedRecordsDeleted,
    archiveCreated: false,
    error,
  };
}

function successResult(
  row: ClientRow,
  kind: Exclude<ClientActionResultKind, "failed">,
  importedRecordsDeleted: number,
  archiveCreated: boolean,
): ClientActionResult {
  return {
    rowId: row.id,
    name: row.name || "לקוח ללא שם",
    kind,
    importedRecordsDeleted,
    archiveCreated,
  };
}

interface DeleteResult {
  ok: boolean;
  error?: string;
}

interface ArchiveResult {
  created: boolean;
}

export async function processClientRows(
  rows: ClientRow[],
  options: { existingArchivedClientKeys?: ReadonlySet<string> } = {},
): Promise<ClientActionSummary> {
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values());
  const archiveRows = uniqueRows.filter((row) => !isImportedOnlyClientRow(row));
  const archiveKeys = new Set(options.existingArchivedClientKeys || []);
  let archiveLookupError = "";

  if (archiveRows.length > 0) {
    try {
      const existingArchives = await ClientArchive.list("-created_at", 500);
      if (Array.isArray(existingArchives)) {
        existingArchives.forEach((archive) => {
          const key = recordText(archive?.client_key);
          if (key) archiveKeys.add(key);
        });
      }
    } catch (error) {
      archiveLookupError = errorText(error, "לא ניתן לבדוק ארכיוני לקוחות קיימים.");
    }
  }

  const deletePromises = new Map<string, Promise<DeleteResult>>();
  const deleteImportedRecord = (id: string): Promise<DeleteResult> => {
    const existing = deletePromises.get(id);
    if (existing) return existing;
    const promise = (async () => {
      try {
        await BusinessClient.delete(id);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: errorText(error, "מחיקת רשומת הייבוא נכשלה.") };
      }
    })();
    deletePromises.set(id, promise);
    return promise;
  };

  const archivePromises = new Map<string, Promise<ArchiveResult>>();
  const createArchive = (row: ClientRow, key: string): Promise<ArchiveResult> => {
    const existingPromise = archivePromises.get(key);
    if (existingPromise) return existingPromise;
    const promise = (async () => {
      await ClientArchive.create({
        client_key: key,
        display_name: row.name || "לקוח ללא שם",
        phone: row.phone || "",
        email: row.email || "",
        archived_at: new Date().toISOString(),
        source_status: row.status,
      });
      archiveKeys.add(key);
      return { created: true };
    })();
    archivePromises.set(key, promise);
    return promise;
  };

  const processRow = async (row: ClientRow): Promise<ClientActionResult> => {
    const ids = uniqueBusinessClientIds(row);
    const deleteImportedRecords = async () => {
      if (!ids.length) return { deleted: 0, failures: [] as string[] };
      const outcomes = await Promise.all(ids.map((id) => deleteImportedRecord(id)));
      const failures = outcomes
        .map((outcome, index) => (outcome.ok ? "" : `${ids[index]}: ${outcome.error || "מחיקה נכשלה"}`))
        .filter(Boolean);
      return {
        deleted: outcomes.filter((outcome) => outcome.ok).length,
        failures,
      };
    };

    if (isImportedOnlyClientRow(row)) {
      if (!ids.length) return failedResult(row, "לא נמצאה רשומת לקוח מיובאת שניתן למחוק.");
      const deletion = await deleteImportedRecords();
      if (deletion.failures.length) {
        return failedResult(row, `מחיקת הרשומות המיובאות נכשלה. ${deletion.failures[0]}`, deletion.deleted);
      }
      return successResult(row, "deleted", deletion.deleted, false);
    }

    const archiveKey = archiveKeyFor(row);
    if (!archiveKey) return failedResult(row, "ללקוח אין מפתח קבוע ולכן אי אפשר להסתיר אותו בבטחה.");
    if (archiveLookupError && !archiveKeys.has(archiveKey)) {
      return failedResult(row, "לא ניתן לבדוק אם הלקוח כבר בארכיון. הרשומה נשארה ללא שינוי.");
    }

    const deletion = await deleteImportedRecords();
    if (deletion.failures.length) {
      return failedResult(row, `מחיקת המידע המיובא המקושר נכשלה, לכן הלקוח נשאר גלוי. ${deletion.failures[0]}`, deletion.deleted);
    }

    if (archiveKeys.has(archiveKey)) {
      return successResult(row, "archived", deletion.deleted, false);
    }

    try {
      const archiveResult = await createArchive(row, archiveKey);
      return successResult(row, "archived", deletion.deleted, archiveResult.created);
    } catch (error) {
      return failedResult(row, `שמירת ההסתרה נכשלה, לכן הלקוח נשאר גלוי. ${errorText(error, "שמירת הארכיון נכשלה.")}`, deletion.deleted);
    }
  };

  const settled = await Promise.allSettled(uniqueRows.map((row) => processRow(row)));
  const results = settled.map((outcome, index) => {
    if (outcome.status === "fulfilled") return outcome.value;
    return failedResult(uniqueRows[index], errorText(outcome.reason, "הפעולה נכשלה עבור הלקוח."));
  });

  return {
    total: results.length,
    deletedRows: results.filter((result) => result.kind === "deleted").length,
    archivedRows: results.filter((result) => result.kind === "archived").length,
    failedRows: results.filter((result) => result.kind === "failed").length,
    importedRecordsDeleted: results.reduce((total, result) => total + result.importedRecordsDeleted, 0),
    archiveRecordsCreated: results.filter((result) => result.archiveCreated).length,
    results,
  };
}
