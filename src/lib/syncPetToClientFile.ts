import { Appointment, BusinessClient } from "@/entities";
import { normalizeClientPhone, normalizePetName, normalizePetSpecies } from "@/lib/clientAggregation";

interface PetSource {
  id?: unknown;
  phone?: unknown;
  pet_name?: unknown;
  pet_species?: unknown;
}

type Rec = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Makes sure the pet of an appointment appears in the client's CRM file.
 * The client file is the source of truth for pets (dashboard + booking suggestions),
 * so a pet booked for the first time must be added there. Best effort: never throws.
 */
export async function ensurePetInClientFile(source: PetSource): Promise<void> {
  try {
    let record: PetSource = source;
    if ((!text(record.pet_species) || !text(record.phone)) && text(source.id)) {
      try { record = { ...(await Appointment.get(text(source.id)) as Rec), ...stripEmpty(source) }; } catch { /* keep what we have */ }
    }
    const petName = text(record.pet_name).replace(/\s+/g, " ");
    const phone = normalizeClientPhone(record.phone);
    if (!petName || !phone) return;

    const listed = await BusinessClient.list("-created_at");
    const clients = (Array.isArray(listed) ? listed : []) as Rec[];
    const file = clients.find((client) => normalizeClientPhone(client.mobile_phone) === phone || normalizeClientPhone(client.phone) === phone);
    if (!file || !text(file.id)) return; // No client file yet: the dashboard shows the appointment's pet on its own.

    const species = normalizePetSpecies(record.pet_species);
    const details: Rec[] = Array.isArray(file.pet_details)
      ? (file.pet_details as unknown[]).filter((item): item is Rec => Boolean(item) && typeof item === "object").map((item) => ({ ...item }))
      : text(file.pet_name).split(/\r?\n+/).map((name) => name.trim()).filter(Boolean)
        .map((name) => ({ name, species: normalizePetSpecies(file.pet_species) }));

    const key = normalizePetName(petName);
    const existing = details.find((item) => normalizePetName(item.name) === key);
    if (existing) {
      if (existing.species || !species) return;
      existing.species = species;
    } else {
      details.push({ name: petName, species });
    }
    await BusinessClient.update(text(file.id), { pet_details: details });
  } catch (error) {
    console.error("[CRM] adding pet to client file failed:", error);
  }
}

function stripEmpty(value: PetSource): PetSource {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => text(v))) as PetSource;
}
