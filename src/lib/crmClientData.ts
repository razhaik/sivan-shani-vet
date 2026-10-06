import { format, isValid, parse } from "date-fns";
import { he } from "date-fns/locale";
import { aggregateClients, isLegacyPetId, legacyPetIdForName, normalizeClientPhone, normalizePetSpecies, type AggregatedClient, type ClientPet } from "@/lib/clientAggregation";

export type CrmRecord = Record<string, any>;
export type ClientRowStatus = "active" | "new" | "lead" | "imported";

export interface AdditionalField {
  key: string;
  label: string;
  value: string;
}

export interface ClientRow {
  id: string;
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
  additionalFields: AdditionalField[];
  pets: ClientPet[];
  appointments: CrmRecord[];
  inquiries: CrmRecord[];
  appointmentCount: number;
  lastActivityTimestamp: number;
  lastActivityLabel: string;
  lastAppointment: CrmRecord | null;
  futureAppointments: CrmRecord[];
  cancelledCount: number;
  noShowCount: number;
  status: ClientRowStatus;
  isImported: boolean;
  importSource: string;
  notes: string;
  smsConsent: boolean;
  smsConsentLanguage: string;
  businessClientIds: string[];
  linkedClientKeys: string[];
}

export function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function appointmentDate(record: CrmRecord): Date | null {
  const date = text(record.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = parse(`${date} ${text(record.start_time).slice(0, 5) || "00:00"}`, "yyyy-MM-dd HH:mm", new Date());
  return isValid(parsed) ? parsed : null;
}

export function storedDate(value: unknown): Date | null {
  const valueText = text(value);
  if (!valueText) return null;
  const date = new Date(valueText);
  return isValid(date) ? date : null;
}

export function formatDateTime(value: Date | null, includeTime = false): string {
  if (!value || !isValid(value)) return "תאריך לא צוין";
  return includeTime ? format(value, "d בMMMM · HH:mm", { locale: he }) : format(value, "d בMMMM yyyy", { locale: he });
}

function normalized(value: unknown): string {
  return text(value).toLocaleLowerCase("he").replace(/\s+/g, " ");
}

function identityTokens(record: CrmRecord, nameField: string, phoneField: string, emailField: string): string[] {
  const tokens: string[] = [];
  const phone = normalizeClientPhone(record[phoneField]);
  const email = normalized(record[emailField]);
  const name = normalized(record[nameField]);
  if (phone) tokens.push(`phone:${phone}`);
  if (email) tokens.push(`email:${email}`);
  if (name) tokens.push(`name:${name}`);
  return tokens;
}

function clientTokens(client: AggregatedClient): string[] {
  const tokens: string[] = [];
  const phone = normalizeClientPhone(client.phone);
  const email = normalized(client.email);
  const name = normalized(client.name);
  if (phone) tokens.push(`phone:${phone}`);
  if (email) tokens.push(`email:${email}`);
  if (name) tokens.push(`name:${name}`);
  return tokens;
}

function inquiryMatchesClient(inquiry: CrmRecord, client: AggregatedClient): boolean {
  const identity = new Set(clientTokens(client));
  return identityTokens(inquiry, "name", "phone", "email").some((token) => identity.has(token));
}

function appointmentActivityTimestamp(record: CrmRecord, now: number): number {
  const scheduledAt = appointmentDate(record)?.getTime();
  return scheduledAt && scheduledAt <= now ? scheduledAt : storedDate(record.created_at)?.getTime() || 0;
}

function scheduledAppointmentTimestamp(record: CrmRecord): number {
  return appointmentDate(record)?.getTime() || 0;
}

function inquiryTimestamp(record: CrmRecord): number {
  return storedDate(record.created_at)?.getTime() || 0;
}

function appointmentActivityLabel(record: CrmRecord): string {
  const status = text(record.status).toLowerCase();
  if (status === "requested") return "בקשת תור התקבלה";
  if (status === "confirmed") return "פגישה אושרה";
  if (["cancelled", "canceled"].includes(status)) return "פגישה בוטלה";
  if (["no_show", "no-show", "noshow"].includes(status)) return "אי-הגעה תועדה";
  return "פעילות בתור";
}

function activityFromRecords(appointments: CrmRecord[], inquiries: CrmRecord[]) {
  const now = Date.now();
  const appointmentActivity = appointments
    .map((record) => ({ timestamp: appointmentActivityTimestamp(record, now), label: appointmentActivityLabel(record) }))
    .filter((item) => item.timestamp > 0);
  const inquiryActivity = inquiries
    .map((record) => ({ timestamp: inquiryTimestamp(record), label: "פנייה התקבלה" }))
    .filter((item) => item.timestamp > 0);
  return [...appointmentActivity, ...inquiryActivity].sort((a, b) => b.timestamp - a.timestamp)[0] || { timestamp: 0, label: "אין פעילות מתועדת" };
}

function futureAppointments(appointments: CrmRecord[]): CrmRecord[] {
  const now = Date.now();
  return appointments
    .filter((record) => ["requested", "confirmed"].includes(text(record.status).toLowerCase()))
    .filter((record) => scheduledAppointmentTimestamp(record) > now)
    .sort((a, b) => scheduledAppointmentTimestamp(a) - scheduledAppointmentTimestamp(b));
}

function statusForClient(client: AggregatedClient): ClientRowStatus {
  return client.isNew ? "new" : "active";
}

function sortedImported(records: CrmRecord[]): CrmRecord[] {
  return [...records].sort((a, b) => (storedDate(b.updated_at)?.getTime() || storedDate(b.created_at)?.getTime() || 0) - (storedDate(a.updated_at)?.getTime() || storedDate(a.created_at)?.getTime() || 0));
}

/** The profile editor writes exactly this source marker for canonical values. */
export function findCanonicalProfile(records: CrmRecord[]): CrmRecord | null {
  return sortedImported(records.filter((record) => text(record.import_source)
    .toLocaleLowerCase("he")
    .split(/[;\\r\\n]+/)
    .map((token) => token.trim())
    .includes("crm_profile")))[0] || null;
}

function firstRecordValue(records: CrmRecord[], field: string): string {
  return sortedImported(records)
    .map((record) => text(record[field]))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length || left.localeCompare(right, "he"))[0] || "";
}

function importedNotes(records: CrmRecord[]): string {
  return Array.from(new Set(records.flatMap((record) => text(record.notes).split(/\r?\n+/).map((note) => note.trim()).filter(Boolean)))).join("\n");
}

function normalizeImportedPetName(value: string): string {
  return value.toLocaleLowerCase("he").replace(/\s+/g, " ").trim();
}

type ImportedPetDetail = {
  petId: string;
  name: string;
  species: ClientPet["species"];
  breed?: string;
  birthDate?: string;
  weightKg?: number;
  allergies?: string;
  medicalNotes?: string;
};

function validStoredBirthDate(value: unknown): string | undefined {
  const candidate = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return undefined;
  const [year, month, day] = candidate.split("-").map(Number);
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? candidate : undefined;
}

function storedWeight(value: unknown): number | undefined {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(",", ".") : "";
  if (!raw) return undefined;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 250) return undefined;
  return Number(numeric.toFixed(2));
}

function storedPetText(value: unknown, multiline = false): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  if (!multiline) return raw.replace(/\s+/g, " ");
  return raw.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim().replace(/[ \t]+/g, " ")).join("\n").trim() || undefined;
}

function importedPetDetails(record: CrmRecord, canonical = false): ImportedPetDetail[] {
  const details: ImportedPetDetail[] = [];
  const hasPetList = Array.isArray(record.pet_details);
  if (hasPetList) {
    record.pet_details.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const detail = item as Record<string, unknown>;
      const name = text(detail.name);
      if (!name) return;
      const petId = text(detail.pet_id) || legacyPetIdForName(name);
      const breed = storedPetText(detail.breed);
      const birthDate = validStoredBirthDate(detail.birth_date);
      const weightKg = storedWeight(detail.weight_kg);
      const allergies = storedPetText(detail.allergies);
      const medicalNotes = storedPetText(detail.medical_notes, true);
      details.push({
        petId,
        name,
        species: normalizePetSpecies(detail.species),
        ...(breed ? { breed } : {}),
        ...(birthDate ? { birthDate } : {}),
        ...(typeof weightKg === "number" ? { weightKg } : {}),
        ...(allergies ? { allergies } : {}),
        ...(medicalNotes ? { medicalNotes } : {}),
      });
    });
  }
  // A canonical profile with an explicit list owns even an empty list. Older
  // records without a nested list still use the legacy primary fields.
  if (canonical && hasPetList) return details;

  const legacySpecies = normalizePetSpecies(record.pet_species);
  text(record.pet_name)
    .split(/\r?\n+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .forEach((name) => {
      if (!details.some((detail) => normalizeImportedPetName(detail.name) === normalizeImportedPetName(name))) details.push({ petId: legacyPetIdForName(name), name, species: legacySpecies });
    });
  return details;
}

function mergeImportedPetDetail(existing: ClientPet, detail: ImportedPetDetail): void {
  if (isLegacyPetId(existing.petId, existing.name) && !isLegacyPetId(detail.petId, detail.name)) {
    existing.petId = detail.petId;
    existing.key = `import:${detail.petId}`;
  }
  if (!existing.species && detail.species) existing.species = detail.species;
  if (!existing.breed && detail.breed) existing.breed = detail.breed;
  if (!existing.birthDate && detail.birthDate) existing.birthDate = detail.birthDate;
  if (typeof existing.weightKg !== "number" && typeof detail.weightKg === "number") existing.weightKg = detail.weightKg;
  if (!existing.allergies && detail.allergies) existing.allergies = detail.allergies;
  if (!existing.medicalNotes && detail.medicalNotes) existing.medicalNotes = detail.medicalNotes;
}

function importedPets(records: CrmRecord[], canonical = false): ClientPet[] {
  const pets = new Map<string, ClientPet>();
  records.forEach((record) => importedPetDetails(record, canonical).forEach((detail) => {
    const nameKey = normalizeImportedPetName(detail.name);
    const existingEntry = Array.from(pets.entries()).find(([storedKey, pet]) =>
      pet.petId === detail.petId || storedKey === nameKey,
    );
    const existing = existingEntry?.[1];
    if (!existing) {
      pets.set(nameKey, {
        key: `import:${detail.petId || nameKey}`,
        petId: detail.petId,
        name: detail.name,
        species: detail.species,
        appointmentIds: [],
        ...(detail.breed ? { breed: detail.breed } : {}),
        ...(detail.birthDate ? { birthDate: detail.birthDate } : {}),
        ...(typeof detail.weightKg === "number" ? { weightKg: detail.weightKg } : {}),
        ...(detail.allergies ? { allergies: detail.allergies } : {}),
        ...(detail.medicalNotes ? { medicalNotes: detail.medicalNotes } : {}),
      });
    } else {
      mergeImportedPetDetail(existing, detail);
      if (existingEntry && existingEntry[0] !== nameKey) {
        pets.delete(existingEntry[0]);
        pets.set(nameKey, existing);
      }
    }
  }));
  return Array.from(pets.values()).sort((a, b) => a.name.localeCompare(b.name, "he"));
}

function normalizedAdditionalField(value: unknown): AdditionalField | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const fieldValue = text(record.value);
  if (!fieldValue) return null;
  const label = text(record.label) || text(record.key) || "עמודה נוספת";
  const key = text(record.key) || label.toLocaleLowerCase("he").replace(/\s+/g, "_");
  return { key, label, value: fieldValue };
}

function additionalFieldsFromRecord(record: CrmRecord): AdditionalField[] {
  if (!Array.isArray(record.additional_fields)) return [];
  return record.additional_fields.map(normalizedAdditionalField).filter((field): field is AdditionalField => Boolean(field));
}

function mergedAdditionalFields(records: CrmRecord[]): AdditionalField[] {
  const fields: AdditionalField[] = [];
  const seen = new Set<string>();
  records.forEach((record) => additionalFieldsFromRecord(record).forEach((field) => {
    const signature = `${field.key}\u0000${field.label}\u0000${field.value}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    fields.push(field);
  }));
  return fields;
}

function importedMatchesClient(record: CrmRecord, client: AggregatedClient): boolean {
  const storedLinks = Array.isArray(record.linked_client_keys) ? record.linked_client_keys.map(text) : [];
  const links = [text(record.linked_client_key), ...storedLinks].filter(Boolean);
  return links.some((link) => [client.id, client.key, `client:${client.id}`, `client:${client.key}`].includes(link));
}

function importedFields(records: CrmRecord[]) {
  const sorted = sortedImported(records);
  const canonical = findCanonicalProfile(sorted);
  const sourceRecords = canonical ? [canonical] : sorted;
  const links = Array.from(new Set(sorted.flatMap((record) => [text(record.linked_client_key), ...(Array.isArray(record.linked_client_keys) ? record.linked_client_keys.map(text) : [])]).filter(Boolean)));
  const ids = sorted.map((record) => text(record.id)).filter(Boolean);

  if (canonical) {
    const firstName = text(canonical.first_name);
    const lastName = text(canonical.last_name);
    const mobilePhone = text(canonical.mobile_phone);
    const legacyPhone = text(canonical.phone);
    return {
      name: text(canonical.name) || [firstName, lastName].filter(Boolean).join(" "),
      firstName,
      lastName,
      nationalId: text(canonical.national_id),
      mobilePhone,
      phone: mobilePhone || legacyPhone,
      homePhone: text(canonical.home_phone),
      email: text(canonical.email),
      address: text(canonical.address),
      city: text(canonical.city),
      postalCode: text(canonical.postal_code),
      additionalFields: additionalFieldsFromRecord(canonical),
      pets: importedPets(sourceRecords, true),
      notes: text(canonical.notes),
      source: text(canonical.import_source),
      consent: canonical.sms_consent === true && Boolean(text(canonical.sms_consent_language)),
      language: text(canonical.sms_consent_language),
      isCanonical: true,
      ids,
      links,
    };
  }

  const mobilePhone = firstRecordValue(sorted, "mobile_phone");
  const legacyPhone = firstRecordValue(sorted, "phone");
  const firstName = firstRecordValue(sorted, "first_name");
  const lastName = firstRecordValue(sorted, "last_name");
  return {
    name: firstRecordValue(sorted, "name") || [firstName, lastName].filter(Boolean).join(" "),
    firstName,
    lastName,
    nationalId: firstRecordValue(sorted, "national_id"),
    mobilePhone,
    phone: mobilePhone || legacyPhone,
    homePhone: firstRecordValue(sorted, "home_phone"),
    email: firstRecordValue(sorted, "email"),
    address: firstRecordValue(sorted, "address"),
    city: firstRecordValue(sorted, "city"),
    postalCode: firstRecordValue(sorted, "postal_code"),
    additionalFields: mergedAdditionalFields(sorted),
    pets: importedPets(sorted),
    notes: importedNotes(sorted),
    source: firstRecordValue(sorted, "import_source"),
    consent: sorted.some((record) => record.sms_consent === true && text(record.sms_consent_language)),
    language: firstRecordValue(sorted.filter((record) => record.sms_consent === true), "sms_consent_language"),
    isCanonical: false,
    ids,
    links,
  };
}

function mergeAppointmentPetProfile(appointmentPet: ClientPet, importedPet: ClientPet): ClientPet {
  const merged = { ...appointmentPet };
  if ((isLegacyPetId(merged.petId, merged.name) || !merged.petId) && importedPet.petId && !isLegacyPetId(importedPet.petId, importedPet.name)) {
    merged.petId = importedPet.petId;
    merged.key = `import:${importedPet.petId}`;
  } else if (!merged.petId && importedPet.petId) {
    merged.petId = importedPet.petId;
  }
  if (!merged.breed && importedPet.breed) merged.breed = importedPet.breed;
  if (!merged.birthDate && importedPet.birthDate) merged.birthDate = importedPet.birthDate;
  if (typeof merged.weightKg !== "number" && typeof importedPet.weightKg === "number") merged.weightKg = importedPet.weightKg;
  if (!merged.allergies && importedPet.allergies) merged.allergies = importedPet.allergies;
  if (!merged.medicalNotes && importedPet.medicalNotes) merged.medicalNotes = importedPet.medicalNotes;
  if (!merged.species && importedPet.species) merged.species = importedPet.species;
  return merged;
}

function mergeAppointmentAndImportedPets(appointmentPets: ClientPet[], importedPets: ClientPet[]): ClientPet[] {
  const importedById = new Map<string, ClientPet>();
  importedPets.forEach((pet) => { if (pet.petId) importedById.set(pet.petId, pet); });
  const importedByName = new Map(importedPets.map((pet) => [normalizeImportedPetName(pet.name), pet]));
  const matchedImportedPets = new Set<ClientPet>();
  const mergedAppointmentPets = appointmentPets.map((pet) => {
    const key = normalizeImportedPetName(pet.name);
    const importedPet = (pet.petId ? importedById.get(pet.petId) : undefined) || importedByName.get(key);
    if (!importedPet) return pet;
    matchedImportedPets.add(importedPet);
    return mergeAppointmentPetProfile(pet, importedPet);
  });
  return [
    ...mergedAppointmentPets,
    ...importedPets.filter((pet) => !matchedImportedPets.has(pet)),
  ];
}

function buildAppointmentRow(client: AggregatedClient, inquiries: CrmRecord[], imports: CrmRecord[]): ClientRow {
  const matchedInquiries = inquiries.filter((inquiry) => inquiryMatchesClient(inquiry, client));
  const lastActivity = activityFromRecords(client.appointments, matchedInquiries);
  const now = Date.now();
  const lastAppointment = [...client.appointments]
    .filter((record) => {
      const scheduledAt = appointmentDate(record)?.getTime();
      return typeof scheduledAt === "number" && Number.isFinite(scheduledAt) && scheduledAt <= now;
    })
    .sort((a, b) => scheduledAppointmentTimestamp(b) - scheduledAppointmentTimestamp(a))[0] || null;
  const imported = importedFields(imports);
  const phone = imported.isCanonical ? imported.phone : imported.phone || client.phone;
  const mobilePhone = imported.isCanonical ? imported.mobilePhone : imported.mobilePhone || imported.phone || client.phone;
  return {
    id: `client:${client.id}`,
    name: imported.isCanonical ? imported.name : imported.name || client.name,
    firstName: imported.firstName,
    lastName: imported.lastName,
    nationalId: imported.nationalId,
    phone,
    mobilePhone,
    homePhone: imported.homePhone,
    email: imported.isCanonical ? imported.email : imported.email || client.email,
    address: imported.address,
    city: imported.city,
    postalCode: imported.postalCode,
    additionalFields: imported.additionalFields,
    pets: imported.isCanonical
      ? imported.pets
      : mergeAppointmentAndImportedPets(client.pets, imported.pets),
    appointments: client.appointments,
    inquiries: matchedInquiries,
    appointmentCount: client.appointmentCount,
    lastActivityTimestamp: lastActivity.timestamp,
    lastActivityLabel: lastActivity.label,
    lastAppointment,
    futureAppointments: futureAppointments(client.appointments),
    cancelledCount: client.appointments.filter((record) => ["cancelled", "canceled"].includes(text(record.status).toLowerCase())).length,
    noShowCount: client.appointments.filter((record) => ["no_show", "no-show", "noshow"].includes(text(record.status).toLowerCase())).length,
    status: statusForClient(client),
    isImported: imports.length > 0,
    importSource: imported.source,
    notes: imported.notes,
    smsConsent: imported.consent,
    smsConsentLanguage: imported.language,
    businessClientIds: imported.ids,
    linkedClientKeys: imported.links,
  };
}

function buildImportedRow(record: CrmRecord, index: number): ClientRow {
  const fields = importedFields([record]);
  return {
    id: `business-client:${text(record.id) || index}`,
    name: fields.name || "לקוח ללא שם",
    firstName: fields.firstName,
    lastName: fields.lastName,
    nationalId: fields.nationalId,
    phone: fields.phone,
    mobilePhone: fields.mobilePhone,
    homePhone: fields.homePhone,
    email: fields.email,
    address: fields.address,
    city: fields.city,
    postalCode: fields.postalCode,
    additionalFields: fields.additionalFields,
    pets: fields.pets,
    appointments: [],
    inquiries: [],
    appointmentCount: 0,
    lastActivityTimestamp: 0,
    lastActivityLabel: "אין פעילות מתועדת",
    lastAppointment: null,
    futureAppointments: [],
    cancelledCount: 0,
    noShowCount: 0,
    status: "imported",
    isImported: true,
    importSource: fields.source,
    notes: fields.notes,
    smsConsent: fields.consent,
    smsConsentLanguage: fields.language,
    businessClientIds: fields.ids,
    linkedClientKeys: fields.links,
  };
}

function leadGroupKey(inquiry: CrmRecord, index: number): string {
  const tokens = identityTokens(inquiry, "name", "phone", "email");
  return tokens[0] || `record:${text(inquiry.id) || index}`;
}

function buildLeadRows(inquiries: CrmRecord[], converted: Set<CrmRecord>): ClientRow[] {
  const groups = new Map<string, CrmRecord[]>();
  inquiries.forEach((inquiry, index) => {
    if (converted.has(inquiry)) return;
    const key = leadGroupKey(inquiry, index);
    groups.set(key, [...(groups.get(key) || []), inquiry]);
  });
  return Array.from(groups.entries()).map(([key, group]) => {
    const sorted = [...group].sort((a, b) => inquiryTimestamp(b) - inquiryTimestamp(a));
    const latest = sorted[0];
    const lastActivity = activityFromRecords([], sorted);
    return {
      id: `lead:${key}`,
      name: text(latest.name) || "פונה ללא שם",
      firstName: "",
      lastName: "",
      nationalId: "",
      phone: text(latest.phone),
      mobilePhone: text(latest.phone),
      homePhone: "",
      email: text(latest.email),
      address: "",
      city: "",
      postalCode: "",
      additionalFields: [],
      pets: [],
      appointments: [],
      inquiries: sorted,
      appointmentCount: 0,
      lastActivityTimestamp: lastActivity.timestamp,
      lastActivityLabel: lastActivity.label,
      lastAppointment: null,
      futureAppointments: [],
      cancelledCount: 0,
      noShowCount: 0,
      status: "lead",
      isImported: false,
      importSource: "",
      notes: "",
      smsConsent: false,
      smsConsentLanguage: "",
      businessClientIds: [],
      linkedClientKeys: [],
    };
  });
}

export function buildClientRows(appointments: CrmRecord[], inquiries: CrmRecord[], businessClients: CrmRecord[] = []): ClientRow[] {
  const clients = aggregateClients(appointments);
  const linked = new Set<string>();
  const converted = new Set<CrmRecord>();
  const appointmentRows = clients.map((client) => {
    const imports = businessClients.filter((record) => importedMatchesClient(record, client));
    imports.forEach((record) => linked.add(text(record.id)));
    inquiries.forEach((inquiry) => {
      if (inquiryMatchesClient(inquiry, client)) converted.add(inquiry);
    });
    return buildAppointmentRow(client, inquiries, imports);
  });
  const importedRows = businessClients
    .filter((record) => !linked.has(text(record.id)) || !text(record.id))
    .map((record, index) => buildImportedRow(record, index));
  return [...appointmentRows, ...importedRows, ...buildLeadRows(inquiries, converted)].sort((a, b) => b.lastActivityTimestamp - a.lastActivityTimestamp || a.name.localeCompare(b.name, "he"));
}

export function statusLabel(status: ClientRowStatus): string {
  if (status === "lead") return "ליד חדש";
  if (status === "new") return "לקוח חדש";
  if (status === "imported") return "לקוח מיובא";
  return "לקוח פעיל";
}

export function speciesLabel(species: string): string {
  if (species === "dog") return "כלב";
  if (species === "cat") return "חתול";
  if (species === "other") return "אחר";
  return "לא ידוע";
}

export function rowHasSpecies(row: ClientRow, species: string): boolean {
  if (species === "unknown") return row.pets.length === 0 || row.pets.some((pet) => !normalizePetSpecies(pet.species));
  return row.pets.some((pet) => normalizePetSpecies(pet.species) === species);
}
