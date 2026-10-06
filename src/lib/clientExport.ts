import * as XLSX from "xlsx";
import { appointmentDate, formatDateTime, speciesLabel, statusLabel, text, type ClientRow } from "@/lib/crmClientData";

/**
 * The legacy keys stay string-compatible so existing export callers can keep
 * passing arrays such as ["name", "phone"]. Dynamic imported columns are
 * represented by ClientExportColumn objects below.
 */
export const exportColumns = [
  { key: "name", label: "שם לקוח" },
  { key: "firstName", label: "שם פרטי" },
  { key: "lastName", label: "שם משפחה" },
  { key: "nationalId", label: "תעודת זהות" },
  { key: "phone", label: "טלפון ראשי" },
  { key: "mobilePhone", label: "טלפון סלולרי" },
  { key: "homePhone", label: "טלפון בבית" },
  { key: "email", label: "אימייל" },
  { key: "address", label: "כתובת" },
  { key: "city", label: "עיר" },
  { key: "postalCode", label: "מיקוד" },
  { key: "petName", label: "חיות מחמד" },
  { key: "petSpecies", label: "סוגי חיות מחמד" },
  { key: "appointments", label: "מספר תורים" },
  { key: "lastAppointment", label: "תור אחרון" },
  { key: "lastActivity", label: "פעילות אחרונה" },
  { key: "status", label: "סטטוס" },
  { key: "notes", label: "הערות" },
  { key: "importSource", label: "מקור רשומה" },
  { key: "smsConsent", label: "הסכמת SMS" },
  { key: "smsConsentLanguage", label: "נוסח הסכמת SMS" },
] as const;

export type ExportColumnKey = typeof exportColumns[number]["key"];

export interface StandardExportColumn {
  kind: "standard";
  key: ExportColumnKey;
  label: string;
}

export interface AdditionalExportColumn {
  kind: "additional";
  /** Stable identifier used by the checklist and export selection. */
  key: string;
  /** A unique, readable spreadsheet header. */
  label: string;
  /** The stored additional-field key used for value lookup. */
  fieldKey: string;
  /** The original stored label, before duplicate-header disambiguation. */
  fieldLabel: string;
}

export type ClientExportColumn = StandardExportColumn | AdditionalExportColumn;
export type ExportColumnSelection = ExportColumnKey | ClientExportColumn;

type AdditionalFieldCandidate = {
  fieldKey: string;
  fieldLabel: string;
  identity: string;
};

function normalizedFieldPart(value: unknown): string {
  return text(value).toLocaleLowerCase("he").replace(/\s+/g, " ").trim();
}

function lexicalCompare(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function compareAdditionalCandidates(left: AdditionalFieldCandidate, right: AdditionalFieldCandidate): number {
  return normalizedFieldPart(left.fieldLabel).localeCompare(normalizedFieldPart(right.fieldLabel), "he")
    || lexicalCompare(left.fieldLabel, right.fieldLabel)
    || normalizedFieldPart(left.fieldKey).localeCompare(normalizedFieldPart(right.fieldKey), "he")
    || lexicalCompare(left.fieldKey, right.fieldKey)
    || lexicalCompare(left.identity, right.identity);
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function standardColumns(): StandardExportColumn[] {
  return exportColumns.map((column) => ({ kind: "standard" as const, key: column.key, label: column.label }));
}

/**
 * Creates one stable export column for each distinct imported additional field.
 * A field key plus its original label is the identity, which keeps similarly
 * named source columns separate. Headers are disambiguated when two different
 * fields would otherwise produce the same spreadsheet label.
 */
export function buildExportColumns(rows: ClientRow[]): ClientExportColumn[] {
  const candidates = new Map<string, AdditionalFieldCandidate>();

  rows.forEach((row) => {
    const fields = Array.isArray(row.additionalFields) ? row.additionalFields : [];
    fields.forEach((field) => {
      const fieldKey = text(field?.key);
      const fieldLabel = text(field?.label) || fieldKey || "עמודה נוספת";
      const resolvedKey = fieldKey || fieldLabel;
      const identity = `${normalizedFieldPart(resolvedKey)}\u0000${normalizedFieldPart(fieldLabel)}`;
      if (!identity) return;
      const candidate = { fieldKey: resolvedKey, fieldLabel, identity };
      const existing = candidates.get(identity);
      if (!existing || compareAdditionalCandidates(candidate, existing) < 0) candidates.set(identity, candidate);
    });
  });

  const sortedCandidates = Array.from(candidates.values()).sort(compareAdditionalCandidates);

  const labelOccurrences = new Map<string, number>();
  exportColumns.forEach((column) => labelOccurrences.set(normalizedFieldPart(column.label), 1));
  const usedKeys = new Set<string>();

  const additionalColumns: AdditionalExportColumn[] = sortedCandidates.map((candidate) => {
    const labelToken = normalizedFieldPart(candidate.fieldLabel) || "עמודה נוספת";
    const occurrence = (labelOccurrences.get(labelToken) || 0) + 1;
    labelOccurrences.set(labelToken, occurrence);
    const label = occurrence === 1 ? candidate.fieldLabel : `${candidate.fieldLabel} (${occurrence})`;
    const baseKey = `additional:${stableHash(candidate.identity)}`;
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey}:${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);
    return {
      kind: "additional",
      key,
      label,
      fieldKey: candidate.fieldKey,
      fieldLabel: candidate.fieldLabel,
    };
  });

  return [...standardColumns(), ...additionalColumns];
}

function resolveColumn(column: ExportColumnSelection): ClientExportColumn {
  if (typeof column !== "string") return column;
  const definition = exportColumns.find((item) => item.key === column);
  return {
    kind: "standard",
    key: column,
    label: definition?.label || column,
  };
}

function additionalFieldValue(row: ClientRow, column: AdditionalExportColumn): string {
  const fields = Array.isArray(row.additionalFields) ? row.additionalFields : [];
  const expectedKey = normalizedFieldPart(column.fieldKey);
  const expectedLabel = normalizedFieldPart(column.fieldLabel);
  const exact = fields.find((field) => (
    normalizedFieldPart(field?.key || column.fieldLabel) === expectedKey
      && normalizedFieldPart(field?.label || field?.key) === expectedLabel
  ));
  if (exact) return text(exact.value);

  // Older saved records may have a key but no label. Use the key only when it
  // identifies one field, so two similarly named fields are never conflated.
  const keyMatches = fields.filter((field) => normalizedFieldPart(field?.key) === expectedKey);
  return keyMatches.length === 1 ? text(keyMatches[0].value) : "";
}

function standardExportValue(row: ClientRow, key: ExportColumnKey): string {
  if (key === "name") return text(row.name);
  if (key === "firstName") return text(row.firstName);
  if (key === "lastName") return text(row.lastName);
  if (key === "nationalId") return text(row.nationalId);
  if (key === "phone") return text(row.phone) || text(row.mobilePhone) || text(row.homePhone);
  if (key === "mobilePhone") return text(row.mobilePhone);
  if (key === "homePhone") return text(row.homePhone);
  if (key === "email") return text(row.email);
  if (key === "address") return text(row.address);
  if (key === "city") return text(row.city);
  if (key === "postalCode") return text(row.postalCode);
  if (key === "petName") return row.pets.map((pet) => text(pet.name)).filter(Boolean).join(", ");
  if (key === "petSpecies") return Array.from(new Set(row.pets.map((pet) => speciesLabel(pet.species)))).join(", ");
  if (key === "appointments") return String(row.appointmentCount);
  if (key === "lastAppointment") return row.lastAppointment ? formatDateTime(appointmentDate(row.lastAppointment), true) : "אין תור";
  if (key === "lastActivity") return row.lastActivityTimestamp ? formatDateTime(new Date(row.lastActivityTimestamp), true) : "אין פעילות מתועדת";
  if (key === "status") return statusLabel(row.status);
  if (key === "notes") return text(row.notes);
  if (key === "importSource") return text(row.importSource) || (row.isImported ? "ייבוא" : "תורים");
  if (key === "smsConsentLanguage") return text(row.smsConsentLanguage);
  return row.smsConsent ? "כן" : "לא";
}

function exportValue(row: ClientRow, column: ClientExportColumn): string {
  return column.kind === "additional" ? additionalFieldValue(row, column) : standardExportValue(row, column.key);
}

export function exportMatrix(rows: ClientRow[], columns: ExportColumnSelection[]): string[][] {
  const resolvedColumns = columns.map(resolveColumn);
  const labels = resolvedColumns.map((column) => column.label);
  return [labels, ...rows.map((row) => resolvedColumns.map((column) => exportValue(row, column)))];
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function createClientCsv(rows: ClientRow[], columns: ExportColumnSelection[]): Blob {
  const content = exportMatrix(rows, columns).map((line) => line.map(csvEscape).join(",")).join("\r\n");
  return new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
}

export function createClientXlsx(rows: ClientRow[], columns: ExportColumnSelection[]): Blob {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(exportMatrix(rows, columns)), "לקוחות");
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadClientExport(rows: ClientRow[], columns: ExportColumnSelection[], format: "csv" | "xlsx") {
  const blob = format === "csv" ? createClientCsv(rows, columns) : createClientXlsx(rows, columns);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `לקוחות-${new Date().toISOString().slice(0, 10)}.${format}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
