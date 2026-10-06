export type PetSpecies = "dog" | "cat" | "other" | "";

export interface ClientPet {
  key: string;
  petId?: string;
  name: string;
  species: PetSpecies;
  appointmentIds: string[];
  breed?: string;
  birthDate?: string;
  weightKg?: number;
  allergies?: string;
  medicalNotes?: string;
}

export interface AggregatedClient {
  id: string;
  key: string;
  name: string;
  phone: string;
  email: string;
  pets: ClientPet[];
  appointments: Record<string, any>[];
  appointmentCount: number;
  lastAppointmentDate: string;
  eligiblePhones: string[];
  isNew: boolean;
}

type ClientGroup = {
  records: Record<string, any>[];
};

const KNOWN_SPECIES = new Set<PetSpecies>(["dog", "cat", "other"]);

export function normalizeClientPhone(raw?: unknown): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return "+972" + digits.slice(1);
  return trimmed;
}

export function isValidClientPhone(value: string | null): value is string {
  return Boolean(value && /^\+[1-9]\d{7,14}$/.test(value));
}

export function normalizePetSpecies(value?: unknown): PetSpecies {
  const species = typeof value === "string" ? value.trim().toLowerCase() : "";
  return KNOWN_SPECIES.has(species as PetSpecies) ? (species as PetSpecies) : "";
}

/** A stable, human-name-based key for old appointment and profile records. */
export function normalizePetName(value?: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("he");
}

/** Legacy pets had no stored id, so their fallback must stay deterministic. */
export function legacyPetIdForName(value?: unknown): string {
  return `pet:${normalizePetName(value) || "__unknown_pet__"}`;
}

export function isLegacyPetId(petId?: unknown, petName?: unknown): boolean {
  const stored = typeof petId === "string" ? petId.trim() : "";
  return !stored || stored === legacyPetIdForName(petName);
}

function normalizeText(value?: unknown): string {
  return normalizePetName(value);
}

function identityKeys(appointment: Record<string, any>): string[] {
  const keys: string[] = [];
  const phone = normalizeClientPhone(appointment.phone);
  const email = normalizeText(appointment.email);
  const name = normalizeText(appointment.client_name);
  if (phone) keys.push(`phone:${phone}`);
  if (email) keys.push(`email:${email}`);
  if (name) keys.push(`name:${name}`);
  if (keys.length === 0 && appointment.id) keys.push(`record:${String(appointment.id)}`);
  return keys;
}

function appointmentSortKey(appointment: Record<string, any>): string {
  return `${String(appointment.date ?? "")} ${String(appointment.start_time ?? "")} ${String(appointment.created_at ?? "")}`;
}

function sortAppointments(records: Record<string, any>[]): Record<string, any>[] {
  return [...records].sort((a, b) => appointmentSortKey(b).localeCompare(appointmentSortKey(a)));
}

function canonicalKey(records: Record<string, any>[]): string {
  const keys = new Set(records.flatMap(identityKeys));
  const pick = (prefix: string) => [...keys].filter((key) => key.startsWith(prefix)).sort()[0];
  return pick("phone:") || pick("email:") || pick("name:") || pick("record:") || "record:unknown";
}

function groupAppointments(appointments: Record<string, any>[]): ClientGroup[] {
  const groups: ClientGroup[] = [];
  const identityToGroup = new Map<string, ClientGroup>();

  for (const appointment of appointments) {
    const keys = identityKeys(appointment);
    const matches = Array.from(new Set(
      keys.map((key) => identityToGroup.get(key)).filter((group): group is ClientGroup => Boolean(group)),
    ));
    const group = matches[0] || { records: [] };
    if (!matches.length) groups.push(group);

    for (const other of matches.slice(1)) {
      if (other === group) continue;
      group.records.push(...other.records);
      const index = groups.indexOf(other);
      if (index >= 0) groups.splice(index, 1);
      for (const [identity, owner] of identityToGroup.entries()) {
        if (owner === other) identityToGroup.set(identity, group);
      }
    }

    group.records.push(appointment);
    keys.forEach((key) => identityToGroup.set(key, group));
  }

  return groups;
}

function firstValue(records: Record<string, any>[], field: string): string {
  const record = records.find((item) => String(item?.[field] ?? "").trim());
  return record ? String(record[field]).trim() : "";
}

function buildPets(records: Record<string, any>[]): ClientPet[] {
  const pets = new Map<string, ClientPet>();
  for (const appointment of records) {
    const rawName = String(appointment.pet_name ?? "").trim();
    const key = normalizeText(rawName) || "__unknown_pet__";
    const existing = pets.get(key) || {
      key,
      petId: legacyPetIdForName(rawName),
      name: rawName || "חיית מחמד ללא שם",
      species: "" as PetSpecies,
      appointmentIds: [],
    };
    if (!existing.appointmentIds.includes(String(appointment.id ?? "")) && appointment.id) {
      existing.appointmentIds.push(String(appointment.id));
    }
    const species = normalizePetSpecies(appointment.pet_species);
    // Records are newest first, so the most recent known species wins for this pet only.
    if (!existing.species && species) existing.species = species;
    pets.set(key, existing);
  }
  return Array.from(pets.values()).sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export function aggregateClients(appointments: unknown): AggregatedClient[] {
  const records = Array.isArray(appointments) ? appointments.filter(Boolean) as Record<string, any>[] : [];
  return groupAppointments(records).map((group) => {
    const sorted = sortAppointments(group.records);
    const active = sorted.filter((appointment) => appointment.status !== "cancelled");
    const eligiblePhones = Array.from(new Set(
      sorted
        .filter((appointment) => appointment.sms_consent === true && String(appointment.sms_consent_language ?? "").trim())
        .map((appointment) => normalizeClientPhone(appointment.phone))
        .filter(isValidClientPhone),
    ));
    const lastAppointment = active[0] || sorted[0];
    return {
      id: canonicalKey(sorted),
      key: canonicalKey(sorted),
      name: firstValue(sorted, "client_name") || "לקוח ללא שם",
      phone: firstValue(sorted, "phone"),
      email: firstValue(sorted, "email"),
      pets: buildPets(sorted),
      appointments: sorted,
      appointmentCount: active.length,
      lastAppointmentDate: String(lastAppointment?.date ?? ""),
      eligiblePhones,
      isNew: active.length === 1,
    };
  }).sort((a, b) => {
    if (b.appointmentCount !== a.appointmentCount) return b.appointmentCount - a.appointmentCount;
    return a.name.localeCompare(b.name, "he");
  });
}
