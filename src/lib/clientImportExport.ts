import * as XLSX from "xlsx";
import { normalizePetSpecies } from "@/lib/clientAggregation";
import type { AdditionalField, ClientRow } from "@/lib/crmClientData";

export type ImportField =
  | "name"
  | "firstName"
  | "lastName"
  | "nationalId"
  | "phone"
  | "mobilePhone"
  | "homePhone"
  | "email"
  | "address"
  | "city"
  | "postalCode"
  | "petName"
  | "petSpecies"
  | "notes"
  | "smsConsent"
  | "smsConsentLanguage";

export const importFields: ImportField[] = [
  "name",
  "firstName",
  "lastName",
  "nationalId",
  "mobilePhone",
  "homePhone",
  "phone",
  "email",
  "address",
  "city",
  "postalCode",
  "petName",
  "petSpecies",
  "notes",
  "smsConsent",
  "smsConsentLanguage",
];

export const importFieldLabels: Record<ImportField, string> = {
  name: "שם מלא",
  firstName: "שם פרטי",
  lastName: "שם משפחה",
  nationalId: "תעודת זהות",
  phone: "טלפון כללי",
  mobilePhone: "טלפון סלולרי",
  homePhone: "טלפון בבית",
  email: "אימייל",
  address: "כתובת",
  city: "עיר",
  postalCode: "מיקוד",
  petName: "שם חיית מחמד",
  petSpecies: "סוג חיית מחמד",
  notes: "הערות",
  smsConsent: "הסכמת SMS",
  smsConsentLanguage: "נוסח הסכמה",
};

export type ImportMapping = Record<ImportField, string>;

export interface ImportHeader {
  header: string;
  originalLabel: string;
  normalizedKey: string;
  occurrence: number;
}

export interface ParsedImportFile {
  fileName: string;
  headers: string[];
  headerDetails: ImportHeader[];
  headerWarnings: string[];
  rows: RawImportRow[];
  mapping: ImportMapping;
}

export interface RawImportRow {
  rowIndex: number;
  sourceRow: number;
  values: Record<string, string>;
}

export interface ImportValues {
  name: string;
  firstName: string;
  lastName: string;
  nationalId: string;
  phone: string;
  mobilePhone: string;
  homePhone: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  petName: string;
  petSpecies: "dog" | "cat" | "other" | "";
  notes: string;
  smsConsent: boolean;
  smsConsentLanguage: string;
  additionalFields: AdditionalField[];
}

export interface ImportRow {
  rowIndex: number;
  sourceRow: number;
  values: ImportValues;
  errors: string[];
  warnings: string[];
}

export type ImportAction = "pending" | "merge" | "new" | "skip";
export interface ImportDecision {
  action: ImportAction;
  targetKey?: string;
}
export interface ImportPlanEntry {
  rowIndex: number;
  sourceRow: number;
  values: ImportValues;
  action: Exclude<ImportAction, "pending">;
  targetKey?: string;
  importSource: string;
}

export interface DuplicateTarget {
  targetKey: string;
  kind: "existing" | "file";
  name: string;
  phone: string;
  email: string;
  nationalId?: string;
  sourceRow?: number;
  reasons: string[];
  certainty: "certain" | "possible";
  isImported: boolean;
  appointmentCount: number;
  detailScore: number;
  stableIndex: number;
}

export interface ImportReviewRow extends ImportRow {
  matches: DuplicateTarget[];
  defaultDecision: ImportDecision;
  /** Number of source rows grouped into this owner during the review. */
  groupedRowCount: number;
  /** Number of unique pet names represented by the grouped source rows. */
  groupedPetCount: number;
  groupedSourceRows: number[];
}

export interface ImportRowsSummary {
  rows: number;
  validRows: number;
  invalidRows: number;
  extraColumns: number;
  extraValues: number;
  groupedOwners: number;
  groupedRows: number;
}

type Identity = {
  name: string;
  phoneNumbers: string[];
  email: string;
  nationalId: string;
};
type FileGroup = ImportRow[];

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5_000;
const MAX_IMPORT_COLUMNS = 200;

const aliases: Record<ImportField, string[]> = {
  name: [
    "name", "full name", "client", "client name", "customer", "customer name", "client_name", "שם", "שם מלא", "שם לקוח", "לקוח", "שם בעלים", "שם הבעלים",
  ],
  firstName: [
    "first name", "firstname", "given name", "first_name", "שם פרטי", "שם פרטי לקוח", "פרטי",
  ],
  lastName: [
    "last name", "lastname", "family name", "surname", "last_name", "שם משפחה", "שם משפחה לקוח", "משפחה",
  ],
  nationalId: [
    "national id", "national_id", "id number", "identity number", "teudat zehut", "ת.ז", "תז", "תעודת זהות", "מספר תעודת זהות", "מספר זהות", "מס זהות", "תעודת זיהוי",
  ],
  phone: [
    "phone", "telephone", "phone number", "phone_number", "טלפון", "מספר טלפון", "טלפון לקוח", "טלפון ראשי", "טלפון כללי", "טל",
  ],
  mobilePhone: [
    "mobile", "mobile phone", "cell", "cell phone", "cellular", "mobile_phone", "טל סלולרי", "טלפון סלולרי", "טלפון נייד", "מספר טלפון נייד", "נייד", "סלולרי", "פלאפון",
  ],
  homePhone: [
    "home phone", "home telephone", "landline", "house phone", "home_phone", "טל בבית", "טלפון בבית", "טלפון בית", "בית", "טל ביתי", "טלפון ביתי",
  ],
  email: [
    "email", "e-mail", "mail", "email address", "email_address", "אימייל", "כתובת אימייל", "כתובת דואר אלקטרוני", "דואר אלקטרוני", "מייל", "דואל", "דוא ל",
  ],
  address: [
    "address", "street address", "home address", "כתובת", "כתובת מלאה", "רחוב וכתובת", "כתובת מגורים",
  ],
  city: ["city", "town", "עיר", "יישוב", "ישוב", "מקום מגורים"],
  postalCode: ["postal code", "postcode", "zip", "zip code", "postal_code", "מיקוד", "קוד דואר", "קוד מיקוד"],
  petName: [
    "pet", "pet name", "pet_name", "animal name", "שם חיית מחמד", "שם חיית המחמד", "חיית מחמד", "חיית המחמד", "שם בעל החיים", "שם חיה", "בעל חיים",
  ],
  petSpecies: [
    "species", "pet species", "pet_species", "animal type", "סוג חיית מחמד", "סוג חיית המחמד", "סוג בעל החיים", "סוג חיה", "מין חיית מחמד", "מין", "סוג",
  ],
  notes: ["notes", "note", "comments", "comment", "הערות", "הערה", "הערות פנימיות"],
  smsConsent: ["sms", "sms consent", "sms_consent", "consent", "הסכמה sms", "הסכמה לקבלת sms", "הסכמה ל-sms", "אישור sms", "קבלת sms", "הסכמת sms"],
  smsConsentLanguage: ["sms consent language", "sms_consent_language", "consent language", "consent text", "נוסח הסכמה", "נוסח הסכמה ל-sms", "נוסח הסמס"],
};

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const UTF16_LE_BOM = [0xff, 0xfe] as const;
const UTF16_BE_BOM = [0xfe, 0xff] as const;

function startsWithBytes(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function decodeBytes(bytes: Uint8Array, encoding: string, offset = 0): string | null {
  try {
    const decoded = new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset));
    if (decoded.includes("\uFFFD")) return null;
    return decoded.replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
}

function decodeCsvText(bytes: Uint8Array): string {
  if (startsWithBytes(bytes, UTF8_BOM)) {
    const decoded = decodeBytes(bytes, "utf-8", UTF8_BOM.length);
    if (decoded !== null) return decoded;
    throw new Error("לא הצלחנו לקרוא את קידוד הטקסט של קובץ ה-CSV.");
  }
  if (startsWithBytes(bytes, UTF16_LE_BOM)) {
    const decoded = decodeBytes(bytes, "utf-16le", UTF16_LE_BOM.length);
    if (decoded !== null) return decoded;
    throw new Error("לא הצלחנו לקרוא את קידוד הטקסט של קובץ ה-CSV.");
  }
  if (startsWithBytes(bytes, UTF16_BE_BOM)) {
    const decoded = decodeBytes(bytes, "utf-16be", UTF16_BE_BOM.length);
    if (decoded !== null) return decoded;
    throw new Error("לא הצלחנו לקרוא את קידוד הטקסט של קובץ ה-CSV.");
  }

  const utf8 = decodeBytes(bytes, "utf-8");
  if (utf8 !== null) return utf8;
  for (const encoding of ["windows-1255", "iso-8859-8"]) {
    const fallback = decodeBytes(bytes, encoding);
    if (fallback !== null) return fallback;
  }
  throw new Error("לא הצלחנו לקרוא את קידוד הטקסט של קובץ ה-CSV.");
}

const mojibakeSequence = /(?:[×][\u0080-\u00ff\u0192\u02c6\u02dc\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u2020\u2021\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]){2,}/g;
const windows1252Bytes: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a,
  0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c,
  0x17e: 0x9e, 0x178: 0x9f,
};

function mojibakeByte(character: string): number | null {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return null;
  if (codePoint <= 0xff) return codePoint;
  return windows1252Bytes[codePoint] ?? null;
}

function readableText(value: string): boolean {
  return /[\u0590-\u05ff]/.test(value);
}

function repairMojibakeSegment(segment: string): string {
  const bytes: number[] = [];
  for (const character of segment) {
    const byte = mojibakeByte(character);
    if (byte === null) return segment;
    bytes.push(byte);
  }
  const repaired = decodeBytes(Uint8Array.from(bytes), "utf-8");
  const originalMarkers = (segment.match(/×/g) || []).length;
  const repairedMarkers = repaired ? (repaired.match(/×/g) || []).length : originalMarkers;
  if (repaired === null || repaired === segment || !readableText(repaired) || repairedMarkers >= originalMarkers) return segment;
  return repaired;
}

function repairMojibake(value: string): string {
  if (!value.includes("×") || /^[^\s@]+@[^\s@]+$/.test(value)) return value;
  return value.replace(mojibakeSequence, repairMojibakeSegment);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return repairMojibake(String(value).replace(/^\uFEFF/, "").trim());
}

function normalizeHeader(value: unknown): string {
  return cellText(value).toLocaleLowerCase("he").replace(/[\s_.\-()/\\:"'׳״,;]+/g, "");
}

function normalizedHeaderKey(value: string, fallback: string): string {
  const key = normalizeHeader(value)
    .replace(/[^a-z0-9\u0590-\u05ff]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLocaleLowerCase("he");
  return key || fallback;
}

function headerDetails(values: unknown[]): { details: ImportHeader[]; warnings: string[] } {
  const counts = new Map<string, number>();
  const rawLabels = values.map((value, index) => cellText(value) || `עמודה ${index + 1}`);
  rawLabels.forEach((label) => {
    const normalized = normalizeHeader(label);
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });
  const seen = new Map<string, number>();
  const warnings: string[] = [];
  counts.forEach((count, normalized) => {
    if (count > 1) {
      const label = rawLabels.find((candidate) => normalizeHeader(candidate) === normalized) || "כותרת";
      warnings.push(`הכותרת "${label}" מופיעה ${count} פעמים. כל עותק נשמר בנפרד.`);
    }
  });
  const blankCount = values.filter((value) => !cellText(value)).length;
  if (blankCount) warnings.push(`${blankCount} עמודות ללא כותרת קיבלו שמות זמניים כדי לא לאבד ערכים.`);

  const details = rawLabels.map((originalLabel, index) => {
    const normalized = normalizeHeader(originalLabel);
    const occurrence = (seen.get(normalized) || 0) + 1;
    seen.set(normalized, occurrence);
    const header = occurrence === 1 ? originalLabel : `${originalLabel} (${occurrence})`;
    const baseKey = normalizedHeaderKey(originalLabel, `column_${index + 1}`);
    return { header, originalLabel, normalizedKey: occurrence === 1 ? baseKey : `${baseKey}_${occurrence}`, occurrence };
  });
  return { details, warnings };
}

function blankMapping(): ImportMapping {
  return importFields.reduce((result, field) => ({ ...result, [field]: "" }), {} as ImportMapping);
}

export function suggestImportMapping(headers: string[]): ImportMapping {
  const mapping = blankMapping();
  importFields.forEach((field) => {
    const fieldAliases = aliases[field].map(normalizeHeader);
    const header = headers.find((candidate) => fieldAliases.includes(normalizeHeader(candidate)));
    if (header) mapping[field] = header;
  });
  return mapping;
}

export async function parseClientImportFile(file: File): Promise<ParsedImportFile> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (!extension || !["csv", "xls", "xlsx"].includes(extension)) throw new Error("אפשר לייבא קובץ CSV, XLS או XLSX בלבד.");
  if (file.size > MAX_FILE_BYTES) throw new Error("הקובץ גדול מדי. אפשר להעלות קובץ עד 10MB.");

  let workbook: XLSX.WorkBook;
  try {
    const fileBuffer = await file.arrayBuffer();
    workbook = extension === "csv"
      ? XLSX.read(decodeCsvText(new Uint8Array(fileBuffer)), { type: "string", raw: false })
      : XLSX.read(fileBuffer, { type: "array", raw: false });
  } catch {
    throw new Error("לא הצלחנו לקרוא את הקובץ. בדקי שהוא קובץ CSV או Excel תקין.");
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("הקובץ אינו מכיל גיליון נתונים.");
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false }) as unknown[][];
  const headerIndex = matrix.findIndex((row) => row.some((cell) => Boolean(cellText(cell))));
  if (headerIndex < 0) throw new Error("לא נמצאה בקובץ שורת כותרות.");
  const { details, warnings } = headerDetails(matrix[headerIndex] || []);
  if (details.length > MAX_IMPORT_COLUMNS) throw new Error(`נמצאו ${details.length} עמודות. אפשר לייבא עד ${MAX_IMPORT_COLUMNS} עמודות בקובץ אחד.`);
  const remainingRows = matrix.slice(headerIndex + 1);
  if (remainingRows.length > MAX_IMPORT_ROWS) throw new Error(`נמצאו יותר מ-${MAX_IMPORT_ROWS.toLocaleString("he-IL")} שורות. פצלי את הקובץ לכמה קבצים ונסי שוב.`);
  const headers = details.map((detail) => detail.header);
  const rows = remainingRows
    .map((values, index) => ({
      rowIndex: index,
      sourceRow: headerIndex + index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, cellText(values[column])])),
    }))
    .filter((row) => Object.values(row.values).some(Boolean));
  return { fileName: file.name, headers, headerDetails: details, headerWarnings: warnings, rows, mapping: suggestImportMapping(headers) };
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) return `972${digits.slice(1)}`;
  if (digits.length === 9 && /^[2-9]\d{8}$/.test(digits)) return `972${digits}`;
  return digits.length >= 7 ? digits : "";
}

function storedPhone(value: string): string {
  const normalized = normalizePhone(value);
  return normalized ? `+${normalized}` : "";
}

function normalizedName(value: string): string {
  return value.toLocaleLowerCase("he").replace(/[.,;:!?()[\]{}'׳״`]+/g, "").replace(/\s+/g, " ").trim();
}

function normalizedEmail(value: string): string {
  return value.toLocaleLowerCase("en-US").trim();
}

function normalizedNationalId(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizedIdentity(value: string, field: "phone" | "email" | "name" | "nationalId"): string {
  if (field === "phone") return normalizePhone(value);
  if (field === "email") return normalizedEmail(value);
  if (field === "nationalId") {
    const normalized = normalizedNationalId(value);
    // Short values are retained for display, but are too weak to merge automatically.
    return normalized.length >= 5 ? normalized : "";
  }
  return normalizedName(value);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function explicitConsent(value: string): boolean | null {
  const normalized = value.toLocaleLowerCase("he").trim();
  if (!normalized) return null;
  if (["false", "0", "no", "n", "לא", "אין", "לא מסכים", "לא מעוניין", "לא מעוניינת", "ללא"].some((item) => normalized === item || normalized.startsWith(`${item} `) || normalized.startsWith(`${item},`))) return false;
  if (["true", "1", "yes", "y", "כן", "מאושר", "מסכים", "אישרתי"].some((item) => normalized === item || normalized.includes(item))) return true;
  return null;
}

function normalizeSpecies(value: string): "dog" | "cat" | "other" | "" {
  const normalized = value.toLocaleLowerCase("he").trim();
  if (["dog", "כלב", "כלבה", "כלבים"].includes(normalized)) return "dog";
  if (["cat", "חתול", "חתולה", "חתולים"].includes(normalized)) return "cat";
  if (normalized && normalizePetSpecies(normalized) === "other") return "other";
  if (["other", "אחר", "אחרת", "ציפור", "מכרסם", "ארנב"].includes(normalized)) return "other";
  return "";
}

function additionalFieldsForRow(parsed: ParsedImportFile, row: RawImportRow, mapping: ImportMapping): AdditionalField[] {
  const mappedHeaders = new Set(Object.values(mapping).filter(Boolean));
  return parsed.headerDetails
    .filter((detail) => !mappedHeaders.has(detail.header))
    .map((detail) => ({
      key: detail.normalizedKey,
      label: detail.occurrence > 1 ? `${detail.originalLabel} (${detail.occurrence})` : detail.originalLabel,
      value: row.values[detail.header] || "",
    }))
    .filter((field) => Boolean(field.value.trim()));
}

function mappedValue(row: RawImportRow, mapping: ImportMapping, field: ImportField): string {
  const header = mapping[field];
  return header ? row.values[header] || "" : "";
}

export function mapImportRows(parsed: ParsedImportFile, mapping: ImportMapping): ImportRow[] {
  return parsed.rows.map((row) => {
    const get = (field: ImportField) => mappedValue(row, mapping, field);
    const firstName = get("firstName");
    const lastName = get("lastName");
    const explicitName = get("name");
    const name = explicitName || [firstName, lastName].filter(Boolean).join(" ");
    const genericPhoneRaw = get("phone");
    const mobileRaw = get("mobilePhone");
    const homeRaw = get("homePhone");
    const mobilePhone = storedPhone(mobileRaw);
    const homePhone = storedPhone(homeRaw);
    const genericPhone = storedPhone(genericPhoneRaw);
    const phone = mobilePhone || genericPhone || homePhone;
    const consentLanguage = get("smsConsentLanguage");
    const explicit = explicitConsent(get("smsConsent"));
    const nationalId = get("nationalId");
    const additionalFields = additionalFieldsForRow(parsed, row, mapping);
    const values: ImportValues = {
      name,
      firstName,
      lastName,
      nationalId,
      phone,
      mobilePhone,
      homePhone,
      email: normalizedEmail(get("email")),
      address: get("address"),
      city: get("city"),
      postalCode: get("postalCode"),
      petName: get("petName"),
      petSpecies: normalizeSpecies(get("petSpecies")),
      notes: get("notes"),
      smsConsent: explicit === true && Boolean(consentLanguage.trim()),
      smsConsentLanguage: explicit === true ? consentLanguage : "",
      additionalFields,
    };
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!values.name && !values.phone && !values.email && !values.nationalId) errors.push("נדרש שם או פרטי קשר מזוהים");
    if (!values.name && (values.phone || values.email || values.nationalId)) warnings.push("השורה נשענת על פרטי זיהוי ללא שם. בדקי את ההתאמה לפני השמירה.");
    if (mobileRaw && !mobilePhone) warnings.push("הטלפון הסלולרי לא זוהה כמספר תקין ונשמר כריק");
    if (homeRaw && !homePhone) warnings.push("הטלפון בבית לא זוהה כמספר תקין ונשמר כריק");
    if (genericPhoneRaw && !genericPhone) warnings.push("הטלפון הכללי לא זוהה כמספר תקין");
    if (nationalId && (!normalizedNationalId(nationalId) || normalizedNationalId(nationalId).length < 5)) warnings.push("תעודת הזהות אינה נראית תקינה, אך הערך המקורי נשמר");
    if (explicit === true && !consentLanguage.trim()) warnings.push("הסכמת SMS לא נשמרה כי חסר נוסח הסכמה");
    if (explicit === null && get("smsConsent").trim()) warnings.push("ערך ההסכמה לא זוהה, ולכן נשמרה ללא הסכמה");
    if (additionalFields.length) warnings.push(`${additionalFields.length} ערכים בעמודות נוספות יישמרו בפרטי הלקוח`);
    return { rowIndex: row.rowIndex, sourceRow: row.sourceRow, values, errors, warnings };
  });
}

function identityForImport(row: ImportRow): Identity {
  return {
    name: normalizedIdentity(row.values.name, "name"),
    phoneNumbers: uniqueStrings([row.values.mobilePhone, row.values.phone, row.values.homePhone].map((value) => normalizedIdentity(value, "phone"))),
    email: normalizedIdentity(row.values.email, "email"),
    nationalId: normalizedIdentity(row.values.nationalId, "nationalId"),
  };
}

function identityForClient(row: ClientRow): Identity {
  const displayName = ["לקוח ללא שם", "פונה ללא שם"].includes(row.name.trim()) ? "" : row.name;
  return {
    name: normalizedIdentity(displayName, "name"),
    phoneNumbers: uniqueStrings([row.mobilePhone, row.phone, row.homePhone].map((value) => normalizedIdentity(value, "phone"))),
    email: normalizedIdentity(row.email, "email"),
    nationalId: normalizedIdentity(row.nationalId, "nationalId"),
  };
}

function compareIdentities(left: Identity, right: Identity) {
  const reasons: string[] = [];
  if (left.phoneNumbers.some((phone) => right.phoneNumbers.includes(phone))) reasons.push("מספר טלפון זהה");
  if (left.email && left.email === right.email) reasons.push("אימייל זהה");
  if (left.nationalId && left.nationalId === right.nationalId) reasons.push("תעודת זהות זהה");
  if (left.name && left.name === right.name) reasons.push("שם מנורמל זהה");
  if (!reasons.length) return null;
  const certain = reasons.some((reason) => ["מספר טלפון זהה", "אימייל זהה", "תעודת זהות זהה"].includes(reason));
  return { reasons, certainty: certain ? "certain" as const : "possible" as const };
}

function meaningfulName(value: string): boolean {
  const normalized = normalizedName(value);
  return Boolean(normalized) && !["לקוח ללא שם", "פונה ללא שם", "לא צוין", "ללא שם", "unknown", "n/a", "na", "-"].includes(normalized);
}

function valueLength(value: string): number { return value.trim().length; }

function importDetailScore(values: ImportValues): number {
  let score = 0;
  if (meaningfulName(values.name)) score += 3;
  if (values.phone) score += 3;
  if (values.email) score += 3;
  if (values.nationalId) score += 2;
  if (values.address || values.city || values.postalCode) score += 2;
  if (values.petName) score += 3;
  if (values.petSpecies) score += 1;
  if (values.additionalFields.length) score += Math.min(4, values.additionalFields.length);
  if (values.notes) score += Math.min(4, Math.max(1, Math.ceil(valueLength(values.notes) / 80)));
  if (values.smsConsent === true && values.smsConsentLanguage.trim()) score += 3;
  return score;
}

function clientDetailScore(row: ClientRow): number {
  let score = 0;
  if (meaningfulName(row.name)) score += 3;
  if (row.phone || row.mobilePhone || row.homePhone) score += 3;
  if (row.email) score += 3;
  if (row.nationalId) score += 2;
  if (row.address || row.city || row.postalCode) score += 2;
  if (row.pets.length) score += 3 + Math.min(3, row.pets.length);
  if (row.additionalFields.length) score += Math.min(4, row.additionalFields.length);
  if (row.notes) score += Math.min(4, Math.max(1, Math.ceil(valueLength(row.notes) / 80)));
  if (row.smsConsent === true && row.smsConsentLanguage.trim()) score += 3;
  score += Math.min(10, row.appointmentCount);
  score += Math.min(4, row.inquiries.length);
  return score;
}

function uniqueReasons(reasons: string[]): string[] { return Array.from(new Set(reasons.filter(Boolean))); }

function mergeTargets(previous: DuplicateTarget | undefined, next: DuplicateTarget): DuplicateTarget {
  if (!previous) return next;
  return {
    ...previous,
    reasons: uniqueReasons([...previous.reasons, ...next.reasons]),
    certainty: previous.certainty === "certain" || next.certainty === "certain" ? "certain" : "possible",
    detailScore: Math.max(previous.detailScore, next.detailScore),
    stableIndex: Math.min(previous.stableIndex, next.stableIndex),
  };
}

function compareTargetRichness(left: DuplicateTarget, right: DuplicateTarget): number {
  return Number(right.certainty === "certain") - Number(left.certainty === "certain") || right.detailScore - left.detailScore || left.stableIndex - right.stableIndex || left.targetKey.localeCompare(right.targetKey);
}

function certainIdentityKeys(identity: Identity): string[] {
  return [
    ...identity.phoneNumbers.map((phone) => `phone:${phone}`),
    identity.email ? `email:${identity.email}` : "",
    identity.nationalId ? `national-id:${identity.nationalId}` : "",
  ].filter(Boolean);
}

function fileGroups(rows: ImportRow[]): FileGroup[] {
  const parent = new Map<number, number>();
  const ownerByIdentity = new Map<string, number>();
  rows.forEach((row) => parent.set(row.rowIndex, row.rowIndex));
  const find = (rowIndex: number): number => {
    const owner = parent.get(rowIndex);
    if (owner === undefined || owner === rowIndex) return rowIndex;
    const root = find(owner);
    parent.set(rowIndex, root);
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const root = Math.min(leftRoot, rightRoot);
    const child = root === leftRoot ? rightRoot : leftRoot;
    parent.set(child, root);
  };
  rows.forEach((row) => {
    certainIdentityKeys(identityForImport(row)).forEach((identity) => {
      const owner = ownerByIdentity.get(identity);
      if (owner === undefined) ownerByIdentity.set(identity, row.rowIndex);
      else union(owner, row.rowIndex);
    });
  });
  const groups = new Map<number, ImportRow[]>();
  rows.forEach((row) => {
    const root = find(row.rowIndex);
    groups.set(root, [...(groups.get(root) || []), row]);
  });
  return Array.from(groups.values()).sort((left, right) => left[0].rowIndex - right[0].rowIndex);
}

function targetForExisting(row: ClientRow, existingIndex: number, compared: { reasons: string[]; certainty: "certain" | "possible" }): DuplicateTarget {
  return {
    targetKey: `existing:${row.id}`,
    kind: "existing",
    name: row.name,
    phone: row.phone,
    email: row.email,
    nationalId: row.nationalId,
    reasons: compared.reasons,
    certainty: compared.certainty,
    isImported: row.isImported,
    appointmentCount: row.appointmentCount,
    detailScore: clientDetailScore(row),
    stableIndex: existingIndex,
  };
}

function targetForFile(row: ImportRow): DuplicateTarget {
  return {
    targetKey: `file:${row.rowIndex}`,
    kind: "file",
    name: row.values.name || `שורה ${row.sourceRow}`,
    phone: row.values.phone,
    email: row.values.email,
    nationalId: row.values.nationalId,
    sourceRow: row.sourceRow,
    reasons: [],
    certainty: "certain",
    isImported: false,
    appointmentCount: 0,
    detailScore: importDetailScore(row.values),
    stableIndex: row.rowIndex,
  };
}

function groupedTarget(target: DuplicateTarget, extraReason: string): DuplicateTarget {
  return { ...target, reasons: uniqueReasons([...target.reasons, extraReason]), certainty: "certain" };
}

export function findDuplicateMatches(rows: ImportRow[], existingRows: ClientRow[]): ImportReviewRow[] {
  const validRows = rows.filter((row) => row.errors.length === 0);
  const directMatches = new Map<number, Map<string, DuplicateTarget>>();
  validRows.forEach((row) => directMatches.set(row.rowIndex, new Map()));
  const addMatch = (rowIndex: number, target: DuplicateTarget) => {
    const matches = directMatches.get(rowIndex);
    if (!matches) return;
    matches.set(target.targetKey, mergeTargets(matches.get(target.targetKey), target));
  };

  validRows.forEach((row) => {
    existingRows.forEach((existing, existingIndex) => {
      const compared = compareIdentities(identityForImport(row), identityForClient(existing));
      if (compared) addMatch(row.rowIndex, targetForExisting(existing, existingIndex, compared));
    });
  });
  validRows.forEach((row) => {
    validRows.forEach((other) => {
      if (other.rowIndex === row.rowIndex) return;
      const compared = compareIdentities(identityForImport(row), identityForImport(other));
      if (compared) addMatch(row.rowIndex, { ...targetForFile(other), reasons: compared.reasons, certainty: compared.certainty });
    });
  });

  const groups = fileGroups(validRows);
  const groupByRow = new Map<number, FileGroup>();
  groups.forEach((group) => group.forEach((row) => groupByRow.set(row.rowIndex, group)));
  const groupTargetByRow = new Map<number, DuplicateTarget | null>();

  groups.forEach((group) => {
    const candidates = Array.from(new Map(
      group.flatMap((row) => Array.from(directMatches.get(row.rowIndex)?.values() || []))
        .filter((target) => target.kind === "existing" && target.certainty === "certain")
        .map((target) => [target.targetKey, target]),
    ).values()).sort(compareTargetRichness);
    const bestExisting = candidates[0] || null;
    group.forEach((row) => groupTargetByRow.set(row.rowIndex, bestExisting));
    if (bestExisting || group.length <= 1) return;
    const canonical = [...group].sort((left, right) => importDetailScore(right.values) - importDetailScore(left.values) || left.rowIndex - right.rowIndex)[0];
    const canonicalTarget = targetForFile(canonical);
    group.forEach((row) => {
      if (row.rowIndex === canonical.rowIndex) return;
      const direct = directMatches.get(row.rowIndex)?.get(canonicalTarget.targetKey);
      const target = groupedTarget(direct || canonicalTarget, "כפילות ודאית לפי פרטי זהות בשורות הקובץ");
      addMatch(row.rowIndex, target);
    });
  });

  return validRows.map((row) => {
    const matches = Array.from(directMatches.get(row.rowIndex)?.values() || []).sort(compareTargetRichness);
    const group = groupByRow.get(row.rowIndex);
    const existingTarget = groupTargetByRow.get(row.rowIndex) || null;
    let defaultDecision: ImportDecision;
    if (existingTarget) {
      const direct = directMatches.get(row.rowIndex)?.get(existingTarget.targetKey);
      if (!direct) addMatch(row.rowIndex, groupedTarget(existingTarget, "אותה קבוצת בעלים בקובץ"));
      defaultDecision = { action: "merge", targetKey: existingTarget.targetKey };
    } else if (group && group.length > 1) {
      const canonicalRowIndex = [...group].sort((left, right) => importDetailScore(right.values) - importDetailScore(left.values) || left.rowIndex - right.rowIndex)[0].rowIndex;
      defaultDecision = row.rowIndex === canonicalRowIndex ? { action: "new" } : { action: "merge", targetKey: `file:${canonicalRowIndex}` };
    } else {
      const certainMatch = matches.find((match) => match.certainty === "certain");
      defaultDecision = certainMatch ? { action: "merge", targetKey: certainMatch.targetKey } : { action: "new" };
    }
    const finalMatches = Array.from(directMatches.get(row.rowIndex)?.values() || []).sort(compareTargetRichness);
    const groupedSourceRows = (group || [row]).map((groupedRow) => groupedRow.sourceRow);
    const groupedPetCount = new Set(
      (group || [row])
        .map((groupedRow) => normalizedName(groupedRow.values.petName))
        .filter(Boolean),
    ).size;
    return {
      ...row,
      matches: finalMatches,
      defaultDecision,
      groupedRowCount: (group || [row]).length,
      groupedPetCount,
      groupedSourceRows,
    };
  });
}

export function summarizeImportRows(rows: ImportRow[], allRows = rows): ImportRowsSummary {
  const groups = fileGroups(rows.filter((row) => row.errors.length === 0));
  const grouped = groups.filter((group) => group.length > 1);
  return {
    rows: allRows.length,
    validRows: rows.filter((row) => row.errors.length === 0).length,
    invalidRows: rows.filter((row) => row.errors.length > 0).length,
    extraColumns: new Set(rows.flatMap((row) => row.values.additionalFields.map((field) => field.key))).size,
    extraValues: rows.reduce((sum, row) => sum + row.values.additionalFields.length, 0),
    groupedOwners: grouped.length,
    groupedRows: grouped.reduce((sum, group) => sum + group.length, 0),
  };
}

/** Keeps the review step from saving a missing target or a circular chain. */
export function areImportDecisionsResolvable(rows: ImportReviewRow[], decisions: Record<number, ImportDecision>): boolean {
  if (!rows.length) return false;
  const rowByIndex = new Map(rows.map((row) => [row.rowIndex, row]));
  const state = new Map<number, "visiting" | "resolved" | "invalid">();
  const resolve = (rowIndex: number): boolean => {
    const row = rowByIndex.get(rowIndex);
    if (!row) return false;
    const currentState = state.get(rowIndex);
    if (currentState === "visiting") return false;
    if (currentState === "resolved") return true;
    if (currentState === "invalid") return false;
    state.set(rowIndex, "visiting");
    const decision = decisions[rowIndex] || row.defaultDecision;
    let result = false;
    if (decision.action === "new" || decision.action === "skip") result = true;
    else if (decision.action === "merge" && decision.targetKey) {
      const targetIsAvailable = row.matches.some((match) => match.targetKey === decision.targetKey);
      if (targetIsAvailable && decision.targetKey.startsWith("existing:")) result = true;
      else if (targetIsAvailable && decision.targetKey.startsWith("file:")) {
        const targetRowIndex = Number(decision.targetKey.slice("file:".length));
        result = Number.isInteger(targetRowIndex) && resolve(targetRowIndex);
      }
    }
    state.set(rowIndex, result ? "resolved" : "invalid");
    return result;
  };
  return rows.every((row) => resolve(row.rowIndex));
}
