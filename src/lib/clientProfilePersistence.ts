import { BusinessClient } from "@/entities";
import {
  isValidClientPhone,
  normalizePetSpecies,
} from "@/lib/clientAggregation";
import {
  findCanonicalProfile,
  text,
  type AdditionalField,
  type ClientRow,
  type CrmRecord,
} from "@/lib/crmClientData";

export type ClientProfilePetSpecies = "" | "dog" | "cat" | "other";

export interface ClientProfilePetDraft {
  /** Internal identity only. The editor never renders this value. */
  petId?: string;
  name: string;
  species: ClientProfilePetSpecies;
  breed: string;
  birthDate: string;
  weightKg: string;
  allergies: string;
  medicalNotes: string;
}

export interface ClientProfileDraft {
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  mobilePhone: string;
  homePhone: string;
  email: string;
  nationalId: string;
  address: string;
  city: string;
  postalCode: string;
  pets: ClientProfilePetDraft[];
  notes: string;
  /** Imported source values are carried through saves but are never editable in the form. */
  additionalFields: AdditionalField[];
}

export interface ClientProfileSaveResult {
  record: CrmRecord;
  created: boolean;
}

export const CLIENT_PROFILE_LIMITS = {
  name: 120,
  firstName: 80,
  lastName: 80,
  phone: 40,
  mobilePhone: 40,
  homePhone: 40,
  email: 160,
  nationalId: 40,
  address: 240,
  city: 120,
  postalCode: 20,
  petName: 80,
  petBreed: 80,
  petAllergies: 500,
  petMedicalNotes: 1000,
  petWeightMax: 250,
  petWeightDecimals: 2,
  notes: 1000,
} as const;

function inputText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function normalizedName(value: unknown): string {
  return inputText(value)
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedSingleLine(value: unknown): string {
  return inputText(value).trim().replace(/\s+/g, " ");
}

function normalizedMultiline(value: unknown): string {
  return inputText(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .trim();
}

function normalizedEmail(value: unknown): string {
  return inputText(value)
    .trim()
    .toLocaleLowerCase("en-US");
}

function isValidEmail(value: string): boolean {
  return value.length <= CLIENT_PROFILE_LIMITS.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value);
}

function petSpecies(value: unknown): ClientProfilePetSpecies {
  return normalizePetSpecies(value) as ClientProfilePetSpecies;
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function generatedPetId(): string {
  return `pet:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizedPetId(value: unknown): string {
  return inputText(value).trim().replace(/\s+/g, " ");
}

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function normalizedWeight(value: unknown, index: number): string {
  const raw = inputText(value).trim().replace(/\s+/g, "").replace(",", ".");
  if (!raw) return "";
  const candidate = raw.startsWith(".") ? `0${raw}` : raw;
  if (!/^\d+(?:\.\d+)?$/.test(candidate)) {
    throw new Error(`המשקל של חיית מחמד ${index + 1} צריך להיות מספר חיובי בקילוגרמים.`);
  }
  const decimalPart = candidate.split(".")[1] || "";
  if (decimalPart.length > CLIENT_PROFILE_LIMITS.petWeightDecimals) {
    throw new Error(`המשקל של חיית מחמד ${index + 1} יכול להכיל עד שתי ספרות אחרי הנקודה.`);
  }
  const numeric = Number(candidate);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`המשקל של חיית מחמד ${index + 1} צריך להיות גדול מאפס.`);
  }
  if (numeric > CLIENT_PROFILE_LIMITS.petWeightMax) {
    throw new Error(`המשקל של חיית מחמד ${index + 1} לא יכול להיות יותר מ-${CLIENT_PROFILE_LIMITS.petWeightMax} ק״ג.`);
  }
  return String(Number(numeric.toFixed(CLIENT_PROFILE_LIMITS.petWeightDecimals)));
}

/**
 * Profile-specific phone normalization. The general appointment helper keeps
 * some legacy input untouched, while profile fields need to accept the local
 * Israeli landline form such as 03-1234567 as well as international values.
 */
export function normalizeClientProfilePhone(value: unknown): string {
  const raw = inputText(value).trim();
  if (!raw) return "";
  const compact = raw.replace(/[^\d+]/g, "");
  const digits = compact.replace(/\D/g, "");
  if (!digits) return "";

  if (compact.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00") && digits.length > 2) return `+${digits.slice(2)}`;
  if (digits.startsWith("972") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) return `+972${digits.slice(1)}`;
  // Israeli local landline numbers may be entered without the leading 0.
  if (/^[2-9]\d{7,8}$/.test(digits)) return `+972${digits}`;

  return "";
}

function normalizeAdditionalFields(value: unknown): AdditionalField[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<AdditionalField[]>((fields, item) => {
    if (!item || typeof item !== "object") return fields;
    const raw = item as Record<string, unknown>;
    const fieldValue = inputText(raw.value).trim();
    if (!fieldValue) return fields;
    const label = inputText(raw.label).trim() || inputText(raw.key).trim() || "עמודה נוספת";
    const key = inputText(raw.key).trim() || label.toLocaleLowerCase("he").replace(/\s+/g, "_");
    fields.push({ key, label, value: fieldValue });
    return fields;
  }, []);
}

function profilePetDetails(draft: ClientProfileDraft): Array<{
  pet_id: string;
  name: string;
  species: ClientProfilePetSpecies;
  breed?: string;
  birth_date?: string;
  weight_kg?: number;
  allergies?: string;
  medical_notes?: string;
}> {
  return draft.pets.map((pet) => {
    const detail: {
      pet_id: string;
      name: string;
      species: ClientProfilePetSpecies;
      breed?: string;
      birth_date?: string;
      weight_kg?: number;
      allergies?: string;
      medical_notes?: string;
    } = {
      pet_id: normalizedPetId(pet.petId) || generatedPetId(),
      name: pet.name,
      species: pet.species,
    };
    if (pet.breed) detail.breed = pet.breed;
    if (pet.birthDate) detail.birth_date = pet.birthDate;
    if (pet.weightKg) detail.weight_kg = Number(pet.weightKg);
    if (pet.allergies) detail.allergies = pet.allergies;
    if (pet.medicalNotes) detail.medical_notes = pet.medicalNotes;
    return detail;
  });
}

function profileFields(draft: ClientProfileDraft): CrmRecord {
  const pets = profilePetDetails(draft);
  const primaryPet = pets[0];
  return {
    name: draft.name,
    first_name: draft.firstName,
    last_name: draft.lastName,
    phone: draft.phone,
    mobile_phone: draft.mobilePhone,
    home_phone: draft.homePhone,
    email: draft.email,
    national_id: draft.nationalId,
    address: draft.address,
    city: draft.city,
    postal_code: draft.postalCode,
    notes: draft.notes,
    pet_name: primaryPet?.name || "",
    pet_species: primaryPet?.species || "",
    pet_details: pets,
    // These values are read-only in the editor. Including them in the update
    // payload prevents a profile save from dropping imported source columns.
    additional_fields: draft.additionalFields.map((field) => ({ ...field })),
  };
}

function matchedBusinessClients(row: ClientRow, businessClients: CrmRecord[]): CrmRecord[] {
  const ids = new Set([
    ...row.businessClientIds.map((id) => text(id)),
    row.id.startsWith("business-client:") ? row.id.slice("business-client:".length) : "",
  ].filter(Boolean));
  const linkedKeys = new Set(row.linkedClientKeys.map((key) => text(key)).filter(Boolean));
  return businessClients.filter((record) => {
    const recordId = text(record.id);
    if (recordId && ids.has(recordId)) return true;
    const recordLinks = [
      text(record.linked_client_key),
      ...(Array.isArray(record.linked_client_keys) ? record.linked_client_keys.map(text) : []),
    ].filter(Boolean);
    return recordLinks.some((link) => linkedKeys.has(link));
  });
}

function appointmentClientKey(row: ClientRow): string {
  if (row.id.startsWith("client:")) return row.id.slice("client:".length).trim();
  const linkedKey = row.linkedClientKeys.map((key) => text(key)).find(Boolean);
  return linkedKey || "";
}

function recordId(record: CrmRecord | null): string {
  return record ? text(record.id) : "";
}

function importedOnlyTarget(row: ClientRow, records: CrmRecord[]): CrmRecord | null {
  const rowId = row.id.startsWith("business-client:") ? row.id.slice("business-client:".length) : "";
  return records.find((record) => text(record.id) === rowId) || records[0] || null;
}

function userSafeEntityError(action: "create" | "update", error: unknown): Error {
  console.error(`Failed to ${action} CRM client profile:`, error);
  return new Error(
    action === "create"
      ? "לא ניתן היה ליצור את תיק הלקוח. הרשומה לא נשמרה, אפשר לנסות שוב."
      : "לא ניתן היה לשמור את תיק הלקוח. הרשומה הקיימת נשארה ללא שינוי.",
  );
}

/**
 * Normalize and validate the same fields that the manual customer flow accepts.
 * Blank pet rows are intentionally omitted, while partially filled rows are rejected.
 */
export function normalizeClientProfileDraft(input: ClientProfileDraft): ClientProfileDraft {
  const firstName = normalizedName(input.firstName);
  const lastName = normalizedName(input.lastName);
  const name = normalizedName(input.name) || normalizedName([firstName, lastName].filter(Boolean).join(" "));
  const rawPhone = inputText(input.phone).trim();
  const normalizedPhone = normalizeClientProfilePhone(rawPhone);
  const rawMobilePhone = inputText(input.mobilePhone).trim();
  const rawHomePhone = inputText(input.homePhone).trim();
  const mobilePhone = normalizeClientProfilePhone(rawMobilePhone);
  const homePhone = normalizeClientProfilePhone(rawHomePhone);
  const email = normalizedEmail(input.email);
  const nationalId = inputText(input.nationalId).trim();
  const address = normalizedSingleLine(input.address);
  const city = normalizedSingleLine(input.city);
  const postalCode = normalizedSingleLine(input.postalCode);
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const additionalFields = normalizeAdditionalFields(input.additionalFields);

  if (!name) throw new Error("נדרש להזין שם מלא או שם פרטי ושם משפחה.");
  if (name.length > CLIENT_PROFILE_LIMITS.name) throw new Error(`השם יכול להכיל עד ${CLIENT_PROFILE_LIMITS.name} תווים.`);
  if (firstName.length > CLIENT_PROFILE_LIMITS.firstName) throw new Error(`השם הפרטי יכול להכיל עד ${CLIENT_PROFILE_LIMITS.firstName} תווים.`);
  if (lastName.length > CLIENT_PROFILE_LIMITS.lastName) throw new Error(`שם המשפחה יכול להכיל עד ${CLIENT_PROFILE_LIMITS.lastName} תווים.`);
  if (rawPhone.length > CLIENT_PROFILE_LIMITS.phone || !normalizedPhone || !isValidClientPhone(normalizedPhone)) {
    throw new Error("הזיני מספר טלפון תקין, למשל 050-1234567 או +972501234567.");
  }
  if (rawMobilePhone.length > CLIENT_PROFILE_LIMITS.mobilePhone || (rawMobilePhone && !mobilePhone) || (mobilePhone && !isValidClientPhone(mobilePhone))) {
    throw new Error("הזיני מספר טלפון סלולרי תקין, למשל 050-1234567.");
  }
  if (rawHomePhone.length > CLIENT_PROFILE_LIMITS.homePhone || (rawHomePhone && !homePhone) || (homePhone && !isValidClientPhone(homePhone))) {
    throw new Error("הזיני מספר טלפון בבית תקין, למשל 03-1234567.");
  }
  if (email && !isValidEmail(email)) throw new Error("הזיני כתובת אימייל תקינה, למשל name@example.com.");
  if (nationalId.length > CLIENT_PROFILE_LIMITS.nationalId) throw new Error(`תעודת הזהות יכולה להכיל עד ${CLIENT_PROFILE_LIMITS.nationalId} תווים.`);
  if (address.length > CLIENT_PROFILE_LIMITS.address) throw new Error(`הכתובת יכולה להכיל עד ${CLIENT_PROFILE_LIMITS.address} תווים.`);
  if (city.length > CLIENT_PROFILE_LIMITS.city) throw new Error(`העיר יכולה להכיל עד ${CLIENT_PROFILE_LIMITS.city} תווים.`);
  if (postalCode.length > CLIENT_PROFILE_LIMITS.postalCode) throw new Error(`המיקוד יכול להכיל עד ${CLIENT_PROFILE_LIMITS.postalCode} תווים.`);
  if (notes.length > CLIENT_PROFILE_LIMITS.notes) throw new Error(`ההערות יכולות להכיל עד ${CLIENT_PROFILE_LIMITS.notes.toLocaleString("he-IL")} תווים.`);

  const pets: ClientProfilePetDraft[] = [];
  (Array.isArray(input.pets) ? input.pets : []).forEach((pet, index) => {
    const petName = normalizedName(pet?.name);
    const species = petSpecies(pet?.species);
    const breed = normalizedSingleLine(pet?.breed);
    const birthDate = inputText(pet?.birthDate).trim();
    const weightInput = inputText(pet?.weightKg).trim();
    const allergies = normalizedSingleLine(pet?.allergies);
    const medicalNotes = normalizedMultiline(pet?.medicalNotes);
    const hasPetValues = Boolean(petName || species || breed || birthDate || weightInput || allergies || medicalNotes);

    if (!hasPetValues) return;
    if (!petName) throw new Error(`נדרש להזין שם לחיית מחמד ${index + 1}.`);
    if (petName.length > CLIENT_PROFILE_LIMITS.petName) throw new Error(`שם חיית מחמד ${index + 1} יכול להכיל עד ${CLIENT_PROFILE_LIMITS.petName} תווים.`);
    if (breed.length > CLIENT_PROFILE_LIMITS.petBreed) throw new Error(`הגזע של חיית מחמד ${index + 1} יכול להכיל עד ${CLIENT_PROFILE_LIMITS.petBreed} תווים.`);
    if (birthDate) {
      if (!isRealIsoDate(birthDate)) throw new Error(`תאריך הלידה של חיית מחמד ${index + 1} אינו תאריך תקין.`);
      if (birthDate > todayIsoDate()) throw new Error(`תאריך הלידה של חיית מחמד ${index + 1} לא יכול להיות בעתיד.`);
    }
    const weightKg = normalizedWeight(weightInput, index);
    if (allergies.length > CLIENT_PROFILE_LIMITS.petAllergies) throw new Error(`האלרגיות של חיית מחמד ${index + 1} יכולות להכיל עד ${CLIENT_PROFILE_LIMITS.petAllergies.toLocaleString("he-IL")} תווים.`);
    if (medicalNotes.length > CLIENT_PROFILE_LIMITS.petMedicalNotes) throw new Error(`ההערות הרפואיות של חיית מחמד ${index + 1} יכולות להכיל עד ${CLIENT_PROFILE_LIMITS.petMedicalNotes.toLocaleString("he-IL")} תווים.`);

    pets.push({ petId: normalizedPetId(pet?.petId), name: petName, species, breed, birthDate, weightKg, allergies, medicalNotes });
  });

  return {
    name,
    firstName,
    lastName,
    phone: normalizedPhone,
    mobilePhone,
    homePhone,
    email,
    nationalId,
    address,
    city,
    postalCode,
    pets,
    notes,
    additionalFields,
  };
}

/**
 * Save only editable profile fields. Appointment and inquiry records are never
 * touched here. A profile for an appointment-derived row becomes the canonical
 * source for future aggregation refreshes.
 */
export async function saveClientProfile(
  draft: ClientProfileDraft,
  row: ClientRow,
  businessClients: CrmRecord[],
): Promise<ClientProfileSaveResult> {
  const normalizedDraft = normalizeClientProfileDraft(draft);
  const matched = matchedBusinessClients(row, businessClients);
  const canonical = findCanonicalProfile(matched);

  if (row.status === "lead" && !matched.length) {
    throw new Error("אפשר לערוך תיק לקוח רק לאחר שנשמרה רשומת לקוח.");
  }

  const existingTarget = canonical || (row.status === "imported" ? importedOnlyTarget(row, matched) : null);
  const existingId = recordId(existingTarget);
  if (existingTarget && existingId) {
    const payload = profileFields(normalizedDraft);
    try {
      const response = await BusinessClient.update(existingId, payload);
      const responseRecord = response && typeof response === "object" && !Array.isArray(response) ? response as CrmRecord : {};
      return { record: { ...existingTarget, ...payload, ...responseRecord, id: existingId }, created: false };
    } catch (error) {
      throw userSafeEntityError("update", error);
    }
  }

  if (row.status === "lead") {
    throw new Error("אפשר לערוך תיק לקוח רק לאחר שנשמרה רשומת לקוח.");
  }

  const linkedKey = appointmentClientKey(row);
  if (!linkedKey) {
    throw new Error("לא נמצא מפתח לקוח יציב לקישור התיק. רענני את הרשומה ונסי שוב.");
  }

  const payload: CrmRecord = {
    ...profileFields(normalizedDraft),
    import_source: "crm_profile",
    linked_client_key: linkedKey,
    linked_client_keys: uniqueValues([linkedKey, ...row.linkedClientKeys]),
    // Consent is read-only in this editor. Copy the current derived value when
    // creating the canonical record so a refresh does not change what staff sees.
    sms_consent: row.smsConsent,
    sms_consent_language: row.smsConsent ? row.smsConsentLanguage : "",
  };

  try {
    const response = await BusinessClient.create(payload);
    if (!response || typeof response !== "object" || Array.isArray(response) || !text((response as CrmRecord).id)) {
      throw new Error("PROFILE_CREATE_MISSING_ID");
    }
    const responseRecord = response as CrmRecord;
    return { record: { ...payload, ...responseRecord }, created: true };
  } catch (error) {
    if (error instanceof Error && error.message === "PROFILE_CREATE_MISSING_ID") {
      console.error("BusinessClient.create did not return a profile id:", error);
      throw new Error("תיק הלקוח לא נשמר כי לא התקבל מזהה רשומה. אפשר לנסות שוב.");
    }
    throw userSafeEntityError("create", error);
  }
}
