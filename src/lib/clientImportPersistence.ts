import { BusinessClient } from "@/entities";
import { normalizePetSpecies } from "@/lib/clientAggregation";
import { findCanonicalProfile, type CrmRecord, type ClientRow } from "@/lib/crmClientData";
import type { ImportPlanEntry, ImportValues } from "@/lib/clientImportExport";

export interface ImportSaveResult {
  created: number;
  merged: number;
  skipped: number;
}

export type ImportSaveProgressPhase = "preparing" | "writing" | "complete" | "error";

export interface ImportSaveProgress {
  phase: ImportSaveProgressPhase;
  completed: number;
  total: number;
  action?: "create" | "merge";
}

export type ImportSaveProgressCallback = (progress: ImportSaveProgress) => void;

type TargetRef = { kind: "existing" | "file"; row?: ClientRow; rowIndex?: number };
type StoredPetDetail = {
  pet_id?: string;
  name: string;
  species: "dog" | "cat" | "other" | "";
  [key: string]: unknown;
};
type BatchUpdate = { id: string; data: CrmRecord };
type MergeGroupEntry = { entry: ImportPlanEntry; target: TargetRef };
type MergeGroup = {
  kind: "existing" | "file";
  rowIndex?: number;
  baseRecord: CrmRecord | null;
  entries: MergeGroupEntry[];
};

const IMPORT_UPDATE_CHUNK_SIZE = 100;
const IMPORT_CREATE_CONCURRENCY = 15;

function value(input: unknown): string {
  return typeof input === "string" || typeof input === "number" ? String(input).trim() : "";
}

function entityId(record: CrmRecord | undefined): string {
  return value(record?.id);
}

function normalizedText(input: string): string {
  return input.toLocaleLowerCase("he").replace(/\s+/g, " ").trim();
}

function isPlaceholder(input: string): boolean {
  return ["", "לא צוין", "לקוח ללא שם", "פונה ללא שם", "ללא שם", "unknown", "n/a", "na", "-"].includes(normalizedText(input));
}

function fillBlank(current: unknown, incoming: unknown, treatPlaceholderAsBlank = false): string {
  const currentText = value(current);
  const incomingText = value(incoming);
  if ((!currentText || (treatPlaceholderAsBlank && isPlaceholder(currentText))) && incomingText) return incomingText;
  return currentText;
}

function uniqueEntries(values: string[], splitPattern: RegExp = /\r?\n+/): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  values.forEach((raw) => raw.split(splitPattern).map((entry) => entry.trim()).filter(Boolean).forEach((entry) => {
    const key = normalizedText(entry);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(entry);
    }
  }));
  return result;
}

function mergedNotes(current: unknown, incoming: string): string {
  return uniqueEntries([value(current), incoming]).join("\n");
}

function mergedSources(current: unknown, source: string): string {
  return uniqueEntries([value(current), source ? `ייבוא: ${source}` : ""], /[;\r\n]+/).join("; ");
}

function normalizeStoredSpecies(input: unknown): StoredPetDetail["species"] {
  return normalizePetSpecies(value(input));
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableOwnerIdentity(values: ImportValues, current?: CrmRecord | null): string {
  const nationalId = value(current?.national_id) || value(values.nationalId);
  const mobile = value(current?.mobile_phone) || value(values.mobilePhone);
  const phone = value(current?.phone) || value(values.phone);
  const email = value(current?.email) || value(values.email);
  const name = value(current?.name) || value(values.name) || [values.firstName, values.lastName].filter(Boolean).join(" ");
  return normalizedText(nationalId || mobile || phone || email || name);
}

function stablePetId(ownerIdentity: string, petName: string): string {
  return `pet:import-${stableHash(`${ownerIdentity}\u0000${normalizedText(petName)}`)}`;
}

function recordPetDetails(record: CrmRecord | null | undefined): StoredPetDetail[] {
  const details: StoredPetDetail[] = [];
  if (Array.isArray(record?.pet_details)) {
    record.pet_details.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const raw = item as Record<string, unknown>;
      const name = value(raw.name);
      if (!name) return;
      details.push({
        ...raw,
        name,
        species: normalizeStoredSpecies(raw.species),
        ...(value(raw.pet_id) ? { pet_id: value(raw.pet_id) } : {}),
      });
    });
  }
  const legacySpecies = normalizeStoredSpecies(record?.pet_species);
  value(record?.pet_name).split(/\r?\n+/).map((name) => name.trim()).filter(Boolean).forEach((name) => {
    if (!details.some((detail) => normalizedText(detail.name) === normalizedText(name))) {
      details.push({ name, species: legacySpecies });
    }
  });
  return details;
}

function mergedPetDetails(current: CrmRecord | null | undefined, values: ImportValues): StoredPetDetail[] {
  const ownerIdentity = stableOwnerIdentity(values, current);
  const details = recordPetDetails(current);
  if (values.petName) {
    const incomingName = values.petName.trim();
    const existing = details.find((detail) => normalizedText(detail.name) === normalizedText(incomingName));
    if (existing) {
      if (!existing.species && values.petSpecies) existing.species = values.petSpecies;
      if (!value(existing.pet_id)) existing.pet_id = stablePetId(ownerIdentity, existing.name);
    } else {
      details.push({
        pet_id: stablePetId(ownerIdentity, incomingName),
        name: incomingName,
        species: values.petSpecies,
      });
    }
  }
  details.forEach((detail) => {
    if (!value(detail.pet_id)) detail.pet_id = stablePetId(ownerIdentity, detail.name);
  });
  return details;
}

function mergedAdditionalFields(
  current: unknown,
  incoming: ImportValues["additionalFields"],
  preserveExistingKeys = false,
): Array<{ key: string; label: string; value: string }> {
  const fields: Array<{ key: string; label: string; value: string }> = [];
  const seen = new Set<string>();
  const existingKeys = new Set<string>();
  const add = (raw: unknown, fromCurrent = false) => {
    if (!raw || typeof raw !== "object") return;
    const record = raw as Record<string, unknown>;
    const fieldValue = value(record.value);
    if (!fieldValue) return;
    const label = value(record.label) || value(record.key) || "עמודה נוספת";
    const key = value(record.key) || normalizedText(label).replace(/\s+/g, "_");
    const keySignature = JSON.stringify([key, label]);
    const signature = JSON.stringify([key, label, fieldValue]);
    if (fromCurrent) existingKeys.add(keySignature);
    if (preserveExistingKeys && !fromCurrent && existingKeys.has(keySignature)) return;
    if (seen.has(signature)) return;
    seen.add(signature);
    fields.push({ key, label, value: fieldValue });
  };
  if (Array.isArray(current)) current.forEach((item) => add(item, true));
  incoming.forEach((item) => add(item));
  return fields;
}

function petPayload(current: CrmRecord | null | undefined, values: ImportValues): Pick<CrmRecord, "pet_name" | "pet_species" | "pet_details"> {
  const details = mergedPetDetails(current, values);
  const currentSpecies = normalizeStoredSpecies(current?.pet_species);
  const primarySpecies = currentSpecies || details.find((detail) => detail.species)?.species || "";
  return {
    pet_name: details.map((detail) => detail.name).filter(Boolean).join("\n") || value(current?.pet_name) || values.petName,
    pet_species: primarySpecies,
    pet_details: details,
  };
}

function primaryPhone(values: ImportValues): string {
  return value(values.mobilePhone) || value(values.phone) || value(values.homePhone);
}

function importedPayload(values: ImportValues, source: string, link = ""): CrmRecord {
  const mobilePhone = value(values.mobilePhone);
  const homePhone = value(values.homePhone);
  return {
    name: value(values.name) || [values.firstName, values.lastName].filter(Boolean).join(" "),
    first_name: value(values.firstName),
    last_name: value(values.lastName),
    national_id: value(values.nationalId),
    phone: primaryPhone(values),
    mobile_phone: mobilePhone,
    home_phone: homePhone,
    email: value(values.email),
    address: value(values.address),
    city: value(values.city),
    postal_code: value(values.postalCode),
    ...petPayload(null, values),
    additional_fields: mergedAdditionalFields([], values.additionalFields),
    notes: value(values.notes),
    sms_consent: values.smsConsent === true && Boolean(values.smsConsentLanguage.trim()),
    sms_consent_language: values.smsConsent === true ? values.smsConsentLanguage.trim() : "",
    import_source: source ? `ייבוא: ${source}` : "",
    ...linkedPayload(null, link),
  };
}

function isCanonicalRecord(record: CrmRecord | null | undefined): boolean {
  return Boolean(value(record?.import_source)
    .toLocaleLowerCase("he")
    .split(/[;\\r\\n]+/)
    .map((token) => token.trim())
    .includes("crm_profile"));
}

function mergePayload(current: CrmRecord | null, values: ImportValues, source: string, link = ""): CrmRecord {
  const currentConsent = current?.sms_consent === true;
  const incomingConsent = values.smsConsent === true && Boolean(values.smsConsentLanguage.trim());
  const consentLanguage = uniqueEntries([
    currentConsent ? value(current?.sms_consent_language) : "",
    incomingConsent ? values.smsConsentLanguage.trim() : "",
  ]).join("\n");

  // A profile edited by staff is the canonical authority. Imports may add a
  // new source column, additive consent, or a genuinely new pet, but must not
  // replace any non-empty canonical field or resurrect a cleared value.
  if (current && isCanonicalRecord(current)) {
    // Ignore stale legacy pet_name data when the canonical nested list exists.
    // New rows can still append a pet without changing the existing list or IDs.
    const petSource = Array.isArray(current.pet_details)
      ? { ...current, pet_name: "", pet_species: "" }
      : current;
    const pet = petPayload(petSource, values);
    return {
      name: value(current.name),
      first_name: value(current.first_name),
      last_name: value(current.last_name),
      national_id: value(current.national_id),
      phone: value(current.phone),
      mobile_phone: value(current.mobile_phone),
      home_phone: value(current.home_phone),
      email: value(current.email),
      address: value(current.address),
      city: value(current.city),
      postal_code: value(current.postal_code),
      ...pet,
      additional_fields: mergedAdditionalFields(current.additional_fields, values.additionalFields, true),
      notes: value(current.notes),
      sms_consent: currentConsent || incomingConsent,
      sms_consent_language: consentLanguage,
      import_source: mergedSources(current.import_source, source),
      ...linkedPayload(current, link),
    };
  }

  const currentPhone = value(current?.phone);
  const incomingPrimaryPhone = primaryPhone(values);
  const mobilePhone = fillBlank(current?.mobile_phone, values.mobilePhone);
  const homePhone = fillBlank(current?.home_phone, values.homePhone);
  const phone = currentPhone || incomingPrimaryPhone || mobilePhone || homePhone;
  const pet = petPayload(current, values);
  return {
    name: fillBlank(current?.name, values.name || [values.firstName, values.lastName].filter(Boolean).join(" "), true),
    first_name: fillBlank(current?.first_name, values.firstName),
    last_name: fillBlank(current?.last_name, values.lastName),
    national_id: fillBlank(current?.national_id, values.nationalId),
    phone,
    mobile_phone: mobilePhone,
    home_phone: homePhone,
    email: fillBlank(current?.email, values.email),
    address: fillBlank(current?.address, values.address),
    city: fillBlank(current?.city, values.city),
    postal_code: fillBlank(current?.postal_code, values.postalCode),
    ...pet,
    additional_fields: mergedAdditionalFields(current?.additional_fields, values.additionalFields),
    notes: mergedNotes(current?.notes, values.notes),
    sms_consent: currentConsent || incomingConsent,
    sms_consent_language: consentLanguage,
    import_source: mergedSources(current?.import_source, source),
    ...linkedPayload(current, link),
  };
}

function recordDetailScore(record: CrmRecord): number {
  let score = 0;
  if (!isPlaceholder(value(record.name))) score += 3;
  if (value(record.phone) || value(record.mobile_phone)) score += 3;
  if (value(record.email)) score += 3;
  if (recordPetDetails(record).length) score += 3 + Math.min(3, recordPetDetails(record).length);
  if (value(record.notes)) score += Math.min(4, Math.max(1, Math.ceil(value(record.notes).length / 80)));
  if (record.sms_consent === true && value(record.sms_consent_language)) score += 3;
  if (Array.isArray(record.additional_fields)) score += Math.min(4, record.additional_fields.length);
  return score;
}

function existingRecord(row: ClientRow, records: CrmRecord[]): CrmRecord | null {
  const ids = Array.from(new Set([
    ...row.businessClientIds.map(value),
    row.id.startsWith("business-client:") ? row.id.slice("business-client:".length) : "",
  ].filter(Boolean)));
  const matchingRecords = records.filter((record) => ids.includes(entityId(record)));
  return findCanonicalProfile(matchingRecords)
    || matchingRecords.sort((left, right) => recordDetailScore(right) - recordDetailScore(left) || entityId(left).localeCompare(entityId(right)))[0]
    || null;
}

function findExistingRow(key: string, rows: ClientRow[]): ClientRow | null {
  return key.startsWith("existing:") ? rows.find((row) => row.id === key.slice("existing:".length)) || null : null;
}

function linkedKeys(record: CrmRecord | null | undefined, extra = ""): string[] {
  const arrayValues = Array.isArray(record?.linked_client_keys) ? record.linked_client_keys.map(value) : [];
  return Array.from(new Set([value(record?.linked_client_key), ...arrayValues, value(extra)].filter(Boolean)));
}

function linkedPayload(record: CrmRecord | null | undefined, extra = ""): Pick<CrmRecord, "linked_client_key" | "linked_client_keys"> {
  const keys = linkedKeys(record, extra);
  return { linked_client_key: keys[0] || "", linked_client_keys: keys };
}

function resolveTarget(key: string | undefined, entries: Map<number, ImportPlanEntry>, rows: ClientRow[], seen = new Set<string>()): TargetRef {
  if (!key || seen.has(key)) throw new Error("נמצאה בחירת איחוד מעגלית. חזרי לסקירת הכפילויות ובחרי יעד אחר.");
  const nextSeen = new Set(seen).add(key);
  if (key.startsWith("existing:")) {
    const row = findExistingRow(key, rows);
    if (!row) throw new Error("הלקוח שנבחר לא נמצא עוד ברשומות הקיימות.");
    return { kind: "existing", row };
  }
  if (key.startsWith("file:")) {
    const rowIndex = Number(key.slice("file:".length));
    const entry = entries.get(rowIndex);
    if (!entry || entry.action === "skip" || entry.action === "pending") throw new Error("אי אפשר לאחד עם שורה שלא תישמר.");
    if (entry.action === "new") return { kind: "file", rowIndex };
    return resolveTarget(entry.targetKey, entries, rows, nextSeen);
  }
  throw new Error("יעד האיחוד אינו מזוהה.");
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

/** Individual creates are intentional because create responses carry the stable record id. */
async function createInChunks(
  payloads: CrmRecord[],
  requireIds: boolean,
  onSuccess?: () => void,
): Promise<CrmRecord[]> {
  if (!payloads.length) return [];
  const saved: CrmRecord[] = [];
  for (const payloadChunk of chunks(payloads, IMPORT_CREATE_CONCURRENCY)) {
    const settledChunk = await Promise.allSettled(payloadChunk.map(async (payload) => {
      const customerName = value(payload.name) || "ללא שם";
      try {
        const response = await BusinessClient.create(payload);
        const record = response as CrmRecord | undefined;
        if (requireIds && (!record || typeof record !== "object" || !entityId(record))) throw new Error("IMPORT_CREATE_MISSING_ID");
        onSuccess?.();
        return record && typeof record === "object" ? record : {};
      } catch (error) {
        if (error instanceof Error && error.message === "IMPORT_CREATE_MISSING_ID") throw new Error(`שמירת הייבוא נכשלה: יצירת הלקוח "${customerName}" לא החזירה מזהה רשומה.`);
        const detail = error instanceof Error && error.message ? ` פירוט: ${error.message}` : "";
        throw new Error(`שמירת הייבוא נכשלה: יצירת הלקוח "${customerName}" נכשלה.${detail}`);
      }
    }));
    const createdChunk = settledChunk.map((result) => {
      if (result.status === "rejected") throw result.reason instanceof Error ? result.reason : new Error("שמירת הייבוא נכשלה במהלך יצירת לקוח.");
      return result.value;
    });
    saved.push(...createdChunk);
  }
  return saved;
}

async function batchUpdateInChunks(updates: BatchUpdate[], onSuccess?: (count: number) => void): Promise<void> {
  if (!updates.length) return;
  for (const updateChunk of chunks(updates, IMPORT_UPDATE_CHUNK_SIZE)) {
    await BusinessClient.batch().update(updateChunk);
    onSuccess?.(updateChunk.length);
  }
}

export async function saveClientImportPlan(
  plan: ImportPlanEntry[],
  businessClients: CrmRecord[],
  existingRows: ClientRow[],
  onProgress?: ImportSaveProgressCallback,
): Promise<ImportSaveResult> {
  let completedWrites = 0;
  let totalWrites = 0;
  const notify = (progress: ImportSaveProgress) => {
    try {
      onProgress?.(progress);
    } catch (error) {
      // Progress is UI feedback and must never turn a successful database write into a failed import.
      console.error("Failed to report customer import progress:", error);
    }
  };

  try {
    notify({ phase: "preparing", completed: 0, total: 0 });
    const entries = new Map(plan.map((entry) => [entry.rowIndex, entry]));
    plan.forEach((entry) => {
      if (entry.action === "pending") throw new Error("יש עדיין שורות שדורשות בחירה לפני השמירה.");
      if (entry.action === "merge") resolveTarget(entry.targetKey, entries, existingRows);
    });

    let skipped = 0;
    const mergeGroups = new Map<string, MergeGroup>();
    for (const entry of plan) {
      if (entry.action === "skip") {
        skipped += 1;
        continue;
      }
      if (entry.action === "new") continue;
      const target = resolveTarget(entry.targetKey, entries, existingRows);
      let group: MergeGroup;
      if (target.kind === "file") {
        const groupKey = `file:${target.rowIndex}`;
        group = mergeGroups.get(groupKey) || { kind: "file", rowIndex: target.rowIndex, baseRecord: null, entries: [] };
        mergeGroups.set(groupKey, group);
      } else {
        const row = target.row;
        if (!row) throw new Error("הלקוח שנבחר לא נמצא עוד ברשומות הקיימות.");
        const backingRecord = existingRecord(row, businessClients);
        const backingId = entityId(backingRecord || undefined);
        const groupKey = backingId ? `existing-record:${backingId}` : `existing-row:${row.id}`;
        group = mergeGroups.get(groupKey) || { kind: "existing", baseRecord: backingRecord, entries: [] };
        mergeGroups.set(groupKey, group);
      }
      group.entries.push({ entry, target });
    }

    const newEntries = plan.filter((entry) => entry.action === "new");
    // One explicit new row is one create. Each grouped merge target produces one final update/create.
    // This is the real number of writes, after duplicate grouping and skip decisions.
    totalWrites = newEntries.length + mergeGroups.size;
    if (totalWrites > 0) notify({ phase: "writing", completed: 0, total: totalWrites });
    const reportWrite = (action: "create" | "merge") => {
      completedWrites += 1;
      notify({ phase: "writing", completed: completedWrites, total: totalWrites, action });
    };

    const createdByRow = new Map<number, CrmRecord>();
    let created = 0;
    if (newEntries.length) {
      const canonicalPayloads = newEntries.map((entry) => importedPayload(entry.values, entry.importSource));
      const canonicalRecords = await createInChunks(canonicalPayloads, true, () => reportWrite("create"));
      newEntries.forEach((entry, index) => createdByRow.set(entry.rowIndex, { ...canonicalPayloads[index], ...canonicalRecords[index] }));
      created = newEntries.length;
    }

    const missingTargetCreates: CrmRecord[] = [];
    const updates: BatchUpdate[] = [];
    for (const group of mergeGroups.values()) {
      if (group.kind === "file") {
        const record = createdByRow.get(group.rowIndex!);
        if (!record || !entityId(record)) throw new Error("לא ניתן לעדכן את הרשומה שנוצרה עבור האיחוד.");
        let working = record;
        let finalPayload: CrmRecord | null = null;
        group.entries.forEach(({ entry }) => {
          const payload = mergePayload(working, entry.values, entry.importSource);
          finalPayload = payload;
          working = { ...working, ...payload };
        });
        if (finalPayload) updates.push({ id: entityId(record), data: finalPayload });
        continue;
      }

      let working = group.baseRecord;
      let finalPayload: CrmRecord | null = null;
      group.entries.forEach(({ entry, target }) => {
        const row = target.row;
        if (!row) throw new Error("הלקוח שנבחר לא נמצא עוד ברשומות הקיימות.");
        const payload = mergePayload(working, entry.values, entry.importSource, row.id);
        finalPayload = payload;
        working = { ...(working || {}), ...payload };
      });
      if (!finalPayload) continue;
      const backingId = entityId(group.baseRecord || undefined);
      if (backingId) updates.push({ id: backingId, data: finalPayload });
      else missingTargetCreates.push(finalPayload);
    }

    await createInChunks(missingTargetCreates, false, () => reportWrite("merge"));
    await batchUpdateInChunks(updates, (count) => {
      for (let index = 0; index < count; index += 1) reportWrite("merge");
    });

    let merged = 0;
    plan.forEach((entry) => {
      if (entry.action === "merge") merged += 1;
    });
    notify({ phase: "complete", completed: completedWrites, total: totalWrites });
    return { created, merged, skipped };
  } catch (error) {
    notify({ phase: "error", completed: completedWrites, total: totalWrites });
    throw error;
  }
}
