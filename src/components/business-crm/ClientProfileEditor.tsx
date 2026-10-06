import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CalendarDays, Loader2, PawPrint, Plus, Save, Scale, Trash2, UserRound, X } from "lucide-react";
import type { AdditionalField, ClientRow } from "@/lib/crmClientData";
import { isValidClientPhone, normalizePetSpecies } from "@/lib/clientAggregation";
import {
  CLIENT_PROFILE_LIMITS,
  normalizeClientProfileDraft,
  normalizeClientProfilePhone,
  type ClientProfileDraft,
  type ClientProfilePetDraft,
} from "@/lib/clientProfilePersistence";

interface ClientProfileEditorProps {
  open: boolean;
  row: ClientRow;
  focusField?: "notes";
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: ClientProfileDraft) => Promise<void> | void;
}

type EditableField = "name" | "firstName" | "lastName" | "phone" | "mobilePhone" | "homePhone" | "email" | "address" | "city" | "postalCode" | "notes";
type FieldErrors = Partial<Record<EditableField, string>> & { pets: Record<number, string> };

function fieldText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function singleLineText(value: unknown): string {
  return fieldText(value).trim().replace(/\s+/g, " ");
}

function additionalFieldsFromRow(row: ClientRow): AdditionalField[] {
  if (!Array.isArray(row.additionalFields)) return [];
  return row.additionalFields.map((field) => ({
    key: fieldText(field?.key).trim(),
    label: fieldText(field?.label).trim() || "עמודה נוספת",
    value: fieldText(field?.value).trim(),
  }));
}

function draftFromRow(row: ClientRow): ClientProfileDraft {
  const firstName = singleLineText(row.firstName);
  const lastName = singleLineText(row.lastName);
  const primaryPhone = fieldText(row.phone).trim() || fieldText(row.mobilePhone).trim();
  return {
    name: singleLineText(row.name) || [firstName, lastName].filter(Boolean).join(" "),
    firstName,
    lastName,
    phone: primaryPhone,
    mobilePhone: fieldText(row.mobilePhone).trim(),
    homePhone: fieldText(row.homePhone).trim(),
    email: fieldText(row.email).trim(),
    nationalId: fieldText(row.nationalId).trim(),
    address: singleLineText(row.address),
    city: singleLineText(row.city),
    postalCode: singleLineText(row.postalCode),
    notes: fieldText(row.notes).trim(),
    additionalFields: additionalFieldsFromRow(row),
    pets: (Array.isArray(row.pets) ? row.pets : []).map((pet) => ({
      petId: fieldText(pet.petId).trim(),
      name: fieldText(pet.name).trim(),
      species: normalizePetSpecies(pet.species),
      breed: fieldText(pet.breed).trim(),
      birthDate: fieldText(pet.birthDate).trim(),
      weightKg: typeof pet.weightKg === "number" && Number.isFinite(pet.weightKg) ? String(pet.weightKg) : fieldText(pet.weightKg).trim(),
      allergies: fieldText(pet.allergies).trim(),
      medicalNotes: fieldText(pet.medicalNotes).trim(),
    })),
  };
}

function emptyPetDraft(): ClientProfilePetDraft {
  return { petId: "", name: "", species: "", breed: "", birthDate: "", weightKg: "", allergies: "", medicalNotes: "" };
}

function emailValid(value: string): boolean {
  return value.length <= CLIENT_PROFILE_LIMITS.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value);
}

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function petHasValues(pet: ClientProfilePetDraft): boolean {
  return Boolean(
    pet.name.trim() ||
    pet.species ||
    pet.breed.trim() ||
    pet.birthDate.trim() ||
    pet.weightKg.trim() ||
    pet.allergies.trim() ||
    pet.medicalNotes.trim(),
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "השמירה לא הושלמה. בדקי את הפרטים ונסי שוב.";
}

function FieldError({ id, children }: { id: string; children: string }) {
  return <p id={id} className="mt-1 text-[11px] font-bold leading-5 text-red-600" role="alert">{children}</p>;
}

export function ClientProfileEditor({ open, row, focusField, isSaving, onClose, onSave }: ClientProfileEditorProps) {
  const [draft, setDraft] = useState<ClientProfileDraft>(() => draftFromRow(row));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({ pets: {} });
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open || focusField !== "notes") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("client-profile-notes")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusField, open, row.id]);

  useEffect(() => {
    if (!open) return;
    setDraft(draftFromRow(row));
    setFieldErrors({ pets: {} });
    setFormError("");
  }, [open, row.id]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose, open]);

  const updateField = (field: EditableField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setFormError("");
  };

  const updatePet = (index: number, field: keyof ClientProfilePetDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      pets: current.pets.map((pet, petIndex) => petIndex === index ? { ...pet, [field]: value } : pet),
    }));
    setFieldErrors((current) => ({ ...current, pets: { ...current.pets, [index]: "" } }));
    setFormError("");
  };

  const addPet = () => {
    setDraft((current) => ({ ...current, pets: [...current.pets, emptyPetDraft()] }));
    setFormError("");
  };

  const removePet = (index: number) => {
    setDraft((current) => ({ ...current, pets: current.pets.filter((_, petIndex) => petIndex !== index) }));
    setFieldErrors((current) => ({
      ...current,
      pets: Object.fromEntries(Object.entries(current.pets).filter(([key]) => Number(key) !== index).map(([key, value]) => [Number(key) > index ? Number(key) - 1 : Number(key), value])),
    }));
    setFormError("");
  };

  const validate = (): ClientProfileDraft | null => {
    const firstName = singleLineText(draft.firstName);
    const lastName = singleLineText(draft.lastName);
    const typedName = singleLineText(draft.name);
    const name = firstName && lastName ? `${firstName} ${lastName}` : typedName || [firstName, lastName].filter(Boolean).join(" ");
    const rawPhone = draft.phone.trim() || draft.mobilePhone.trim();
    const phone = normalizeClientProfilePhone(rawPhone);
    const rawMobilePhone = draft.mobilePhone.trim();
    const mobilePhone = normalizeClientProfilePhone(rawMobilePhone);
    const rawHomePhone = draft.homePhone.trim();
    const homePhone = normalizeClientProfilePhone(rawHomePhone);
    const email = draft.email.trim().toLocaleLowerCase("en-US");
    const nationalId = fieldText(draft.nationalId).trim();
    const address = singleLineText(draft.address);
    const city = singleLineText(draft.city);
    const postalCode = singleLineText(draft.postalCode);
    const notes = draft.notes.trim();
    const nextErrors: FieldErrors = { pets: {} };

    if (!name) nextErrors.name = "נדרש להזין שם מלא, או שם פרטי ושם משפחה.";
    else if (name.length > CLIENT_PROFILE_LIMITS.name) nextErrors.name = `השם יכול להכיל עד ${CLIENT_PROFILE_LIMITS.name} תווים.`;
    if (firstName.length > CLIENT_PROFILE_LIMITS.firstName) nextErrors.firstName = `השם הפרטי יכול להכיל עד ${CLIENT_PROFILE_LIMITS.firstName} תווים.`;
    if (lastName.length > CLIENT_PROFILE_LIMITS.lastName) nextErrors.lastName = `שם המשפחה יכול להכיל עד ${CLIENT_PROFILE_LIMITS.lastName} תווים.`;

    if (!rawPhone) nextErrors.phone = "נדרש להזין מספר טלפון ראשי. אפשר להשתמש בטלפון הנייד הקיים.";
    else if (rawPhone.length > CLIENT_PROFILE_LIMITS.phone || !phone || !isValidClientPhone(phone)) nextErrors.phone = "הזיני מספר טלפון תקין, למשל 050-1234567 או +972501234567.";
    if (rawMobilePhone && (rawMobilePhone.length > CLIENT_PROFILE_LIMITS.mobilePhone || !mobilePhone || !isValidClientPhone(mobilePhone))) nextErrors.mobilePhone = "הזיני מספר טלפון סלולרי תקין, למשל 050-1234567.";
    if (rawHomePhone && (rawHomePhone.length > CLIENT_PROFILE_LIMITS.homePhone || !homePhone || !isValidClientPhone(homePhone))) nextErrors.homePhone = "הזיני מספר טלפון בבית תקין, למשל 03-1234567.";

    if (email && !emailValid(email)) nextErrors.email = "הזיני כתובת אימייל תקינה, למשל name@example.com.";
    if (address.length > CLIENT_PROFILE_LIMITS.address) nextErrors.address = `הכתובת יכולה להכיל עד ${CLIENT_PROFILE_LIMITS.address} תווים.`;
    if (city.length > CLIENT_PROFILE_LIMITS.city) nextErrors.city = `העיר יכולה להכיל עד ${CLIENT_PROFILE_LIMITS.city} תווים.`;
    if (postalCode.length > CLIENT_PROFILE_LIMITS.postalCode) nextErrors.postalCode = `המיקוד יכול להכיל עד ${CLIENT_PROFILE_LIMITS.postalCode} תווים.`;
    if (notes.length > CLIENT_PROFILE_LIMITS.notes) nextErrors.notes = `ההערות יכולות להכיל עד ${CLIENT_PROFILE_LIMITS.notes.toLocaleString("he-IL")} תווים.`;

    draft.pets.forEach((pet, index) => {
      if (!petHasValues(pet)) return;
      const petName = pet.name.trim().replace(/\s+/g, " ");
      if (!petName) nextErrors.pets[index] = "נדרש להזין שם לחיית המחמד כאשר נשמר לה פרט כלשהו.";
      else if (petName.length > CLIENT_PROFILE_LIMITS.petName) nextErrors.pets[index] = `שם חיית המחמד יכול להכיל עד ${CLIENT_PROFILE_LIMITS.petName} תווים.`;
    });

    setFieldErrors(nextErrors);
    const hasFieldErrors = ["name", "firstName", "lastName", "phone", "mobilePhone", "homePhone", "email", "address", "city", "postalCode", "notes"].some((field) => Boolean(nextErrors[field as EditableField]));
    if (hasFieldErrors || Object.keys(nextErrors.pets).length > 0) return null;

    try {
      return normalizeClientProfileDraft({
        name,
        firstName,
        lastName,
        phone: phone || "",
        mobilePhone: mobilePhone || "",
        homePhone: homePhone || "",
        email,
        nationalId,
        address,
        city,
        postalCode,
        notes,
        pets: draft.pets,
        additionalFields: Array.isArray(draft.additionalFields) ? draft.additionalFields : [],
      });
    } catch (error) {
      const message = errorMessage(error);
      const petNumber = message.match(/חיית מחמד (\d+)/)?.[1];
      const petIndex = petNumber ? Number(petNumber) - 1 : -1;
      const field: EditableField | undefined = message.includes("שם פרטי")
        ? "firstName"
        : message.includes("שם המשפחה")
          ? "lastName"
          : message.includes("מספר טלפון סלולרי")
            ? "mobilePhone"
            : message.includes("מספר טלפון בבית")
              ? "homePhone"
              : message.includes("מספר טלפון")
                ? "phone"
                : message.includes("כתובת")
                  ? "address"
                  : message.includes("העיר")
                    ? "city"
                    : message.includes("המיקוד")
                      ? "postalCode"
                      : message.includes("אימייל")
                        ? "email"
                        : undefined;
      if (petIndex >= 0 && petIndex < draft.pets.length) {
        setFieldErrors((current) => ({ ...current, pets: { ...current.pets, [petIndex]: message } }));
      } else if (field) {
        setFieldErrors((current) => ({ ...current, [field]: message }));
      } else {
        setFormError(message);
      }
      return null;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setFormError("");
    const normalizedDraft = validate();
    if (!normalizedDraft) return;
    try {
      await onSave(normalizedDraft);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  if (!open) return null;

  const maxBirthDate = todayIsoDate();
  const visibleAdditionalFields = (Array.isArray(draft.additionalFields) ? draft.additionalFields : []).filter((field) => fieldText(field.value).trim());

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-[#1A1A3E]/[0.5] p-3 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        id="client-profile-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-profile-editor-title"
        aria-describedby="client-profile-editor-description"
        aria-busy={isSaving}
        dir="rtl"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#DCE6E8] bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-3 border-b border-[#E5EEF0] pb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF7F5] text-[#236B68]"><UserRound className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="client-profile-editor-title" className="text-lg font-black text-[#152E4D]">עריכת תיק הלקוח</h2>
                <p id="client-profile-editor-description" className="mt-1 text-xs font-medium leading-5 text-slate-500">עדכני את פרטי הקשר, פרופילי חיות המחמד וההערה הקבועה של {row.name}.</p>
              </div>
              <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl p-2 text-slate-400 transition hover:bg-[#F4F8F8] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40" aria-label="סגירת עריכת תיק הלקוח"><X className="h-5 w-5" /></button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5" noValidate>
          <section aria-labelledby="client-profile-identity-heading">
            <div className="mb-3"><h3 id="client-profile-identity-heading" className="text-sm font-black text-[#152E4D]">פרטי זיהוי</h3><p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">אפשר לעדכן שם מלא, או להוסיף שם פרטי ושם משפחה. כאשר שני החלקים מלאים, הם משמשים לבניית השם המלא.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-extrabold text-[#152E4D]">שם מלא <b className="text-red-600" aria-hidden="true">*</b></span>
                <input autoFocus={focusField !== "notes"} id="client-profile-name" value={draft.name} onChange={(event) => updateField("name", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.name} disabled={isSaving} autoComplete="name" aria-required="true" aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "client-profile-name-error" : undefined} className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" />
                {fieldErrors.name && <FieldError id="client-profile-name-error">{fieldErrors.name}</FieldError>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#152E4D]">שם פרטי <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                <input id="client-profile-first-name" value={draft.firstName} onChange={(event) => updateField("firstName", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.firstName} disabled={isSaving} autoComplete="given-name" aria-invalid={Boolean(fieldErrors.firstName)} aria-describedby={fieldErrors.firstName ? "client-profile-first-name-error" : undefined} className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" />
                {fieldErrors.firstName && <FieldError id="client-profile-first-name-error">{fieldErrors.firstName}</FieldError>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#152E4D]">שם משפחה <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                <input id="client-profile-last-name" value={draft.lastName} onChange={(event) => updateField("lastName", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.lastName} disabled={isSaving} autoComplete="family-name" aria-invalid={Boolean(fieldErrors.lastName)} aria-describedby={fieldErrors.lastName ? "client-profile-last-name-error" : undefined} className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" />
                {fieldErrors.lastName && <FieldError id="client-profile-last-name-error">{fieldErrors.lastName}</FieldError>}
              </label>
            </div>
          </section>

          <section aria-labelledby="client-profile-contact-heading">
            <div className="mb-3"><h3 id="client-profile-contact-heading" className="text-sm font-black text-[#152E4D]">פרטי קשר</h3><p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">הטלפון הראשי נדרש לזיהוי הלקוח. אין צורך להוסיף מספר נייד נוסף אם הוא כבר משמש כטלפון הראשי.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#152E4D]">טלפון ראשי <b className="text-red-600" aria-hidden="true">*</b></span>
                <input id="client-profile-phone" value={draft.phone} onChange={(event) => updateField("phone", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.phone} disabled={isSaving} type="tel" dir="ltr" autoComplete="tel" aria-required="true" aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? "client-profile-phone-error" : "client-profile-phone-help"} className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-right text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="050-1234567" />
                {fieldErrors.phone ? <FieldError id="client-profile-phone-error">{fieldErrors.phone}</FieldError> : <p id="client-profile-phone-help" className="mt-1 text-[11px] font-medium text-slate-400">המספר יישמר בפורמט בינלאומי.</p>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#152E4D]">טלפון נייד <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                <input id="client-profile-mobile-phone" value={draft.mobilePhone} onChange={(event) => updateField("mobilePhone", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.mobilePhone} disabled={isSaving} type="tel" dir="ltr" autoComplete="tel" aria-invalid={Boolean(fieldErrors.mobilePhone)} aria-describedby={fieldErrors.mobilePhone ? "client-profile-mobile-phone-error" : undefined} className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-right text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="050-1234567" />
                {fieldErrors.mobilePhone && <FieldError id="client-profile-mobile-phone-error">{fieldErrors.mobilePhone}</FieldError>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#152E4D]">טלפון בבית <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                <input id="client-profile-home-phone" value={draft.homePhone} onChange={(event) => updateField("homePhone", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.homePhone} disabled={isSaving} type="tel" dir="ltr" autoComplete="tel" aria-invalid={Boolean(fieldErrors.homePhone)} aria-describedby={fieldErrors.homePhone ? "client-profile-home-phone-error" : undefined} className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-right text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="03-1234567" />
                {fieldErrors.homePhone && <FieldError id="client-profile-home-phone-error">{fieldErrors.homePhone}</FieldError>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#152E4D]">אימייל <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                <input id="client-profile-email" value={draft.email} onChange={(event) => updateField("email", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.email} disabled={isSaving} type="email" dir="ltr" autoComplete="email" spellCheck={false} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "client-profile-email-error" : undefined} className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-right text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="name@example.com" />
                {fieldErrors.email && <FieldError id="client-profile-email-error">{fieldErrors.email}</FieldError>}
              </label>
            </div>
          </section>

          <section aria-labelledby="client-profile-address-heading">
            <div className="mb-3"><h3 id="client-profile-address-heading" className="text-sm font-black text-[#152E4D]">כתובת</h3><p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">הכתובת נשמרת בפרופיל הלקוח ונשארת זמינה לצוות המרפאה.</p></div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.55fr)]">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-extrabold text-[#152E4D]">כתובת <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                <input id="client-profile-address" value={draft.address} onChange={(event) => updateField("address", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.address} disabled={isSaving} autoComplete="street-address" aria-invalid={Boolean(fieldErrors.address)} aria-describedby={fieldErrors.address ? "client-profile-address-error" : undefined} className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="רחוב ומספר" />
                {fieldErrors.address && <FieldError id="client-profile-address-error">{fieldErrors.address}</FieldError>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#152E4D]">עיר <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                <input id="client-profile-city" value={draft.city} onChange={(event) => updateField("city", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.city} disabled={isSaving} autoComplete="address-level2" aria-invalid={Boolean(fieldErrors.city)} aria-describedby={fieldErrors.city ? "client-profile-city-error" : undefined} className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="למשל, תל אביב" />
                {fieldErrors.city && <FieldError id="client-profile-city-error">{fieldErrors.city}</FieldError>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#152E4D]">מיקוד <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                <input id="client-profile-postal-code" value={draft.postalCode} onChange={(event) => updateField("postalCode", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.postalCode} disabled={isSaving} inputMode="numeric" dir="ltr" autoComplete="postal-code" aria-invalid={Boolean(fieldErrors.postalCode)} aria-describedby={fieldErrors.postalCode ? "client-profile-postal-code-error" : undefined} className="h-11 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-right text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="1234567" />
                {fieldErrors.postalCode && <FieldError id="client-profile-postal-code-error">{fieldErrors.postalCode}</FieldError>}
              </label>
            </div>
          </section>

          <section aria-labelledby="client-profile-imported-heading" className="rounded-2xl border border-[#D9E5F4] bg-[#F7F9FF] p-4">
            <div><h3 id="client-profile-imported-heading" className="text-sm font-black text-[#152E4D]">פרטים מהייבוא</h3><p className="mt-1 text-[11px] font-medium leading-5 text-[#33447A]">הערכים האלה מוצגים לקריאה בלבד כדי לשמור על נתוני המקור. הם יישמרו גם אחרי עדכון פרטים אחרים.</p></div>
            <div className="mt-4 rounded-xl border border-[#D9E5F4] bg-white px-3 py-3">
              <p className="text-[10px] font-extrabold text-slate-400">תעודת זהות</p>
              <p dir="ltr" className={`mt-1 text-sm font-bold ${draft.nationalId ? "text-[#152E4D]" : "text-slate-400"}`}>{draft.nationalId || "לא צוין ברשומה"}</p>
            </div>
            <div className="mt-4">
              <h4 className="text-xs font-black text-[#152E4D]">פרטים נוספים מהייבוא</h4>
              {visibleAdditionalFields.length ? <dl className="mt-2 grid gap-2 sm:grid-cols-2">{visibleAdditionalFields.map((field, index) => <div key={`${field.key || field.label}-${index}`} className="rounded-xl border border-[#E8EFF0] bg-white px-3 py-2.5"><dt className="text-[10px] font-extrabold text-slate-400">{field.label || "עמודה נוספת"}</dt><dd dir="auto" className="mt-1 break-words text-xs font-bold leading-5 text-[#152E4D]">{field.value}</dd></div>)}</dl> : <p className="mt-2 rounded-xl border border-dashed border-[#C9D9EB] bg-white px-3 py-3 text-[11px] font-medium leading-5 text-slate-400">לא נשמרו עמודות נוספות בעלות ערך ברשומה הזו.</p>}
            </div>
          </section>

          <section aria-labelledby="client-profile-pets-heading" className="rounded-2xl border border-[#DCEBED] bg-[#F7FBFB] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 id="client-profile-pets-heading" className="text-sm font-black text-[#152E4D]">חיות מחמד</h3><p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">לכל חיה יש פרופיל עצמאי, כדי שהצוות יוכל למצוא את פרטי הזיהוי והטיפול במקום אחד.</p></div>
              <button type="button" onClick={addPet} disabled={isSaving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#B8DCD9] bg-white px-3 text-xs font-extrabold text-[#236B68] transition hover:border-[#236B68] hover:bg-[#EAF7F5] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />הוספת חיה</button>
            </div>

            {draft.pets.length ? <div className="mt-4 space-y-3">{draft.pets.map((pet, index) => {
              const errorId = `client-profile-pet-${index}-error`;
              const petError = fieldErrors.pets[index];
              return <article key={`pet-${index}`} className="rounded-2xl border border-[#DCEBED] bg-white p-3.5 sm:p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F2D162]/30 text-[#69550C]"><PawPrint className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-wide text-[#6D9998]">חיה {index + 1}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">אפשר להשאיר את סוג החיה לא ידוע.</p></div>
                  <button type="button" onClick={() => removePet(index)} disabled={isSaving} className="rounded-lg p-2 text-slate-400 transition hover:bg-[#FFF4F4] hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40" aria-label={`הסרת חיית מחמד ${index + 1}`} title="הסרת חיית מחמד"><Trash2 className="h-4 w-4" /></button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.62fr)]">
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-extrabold text-[#152E4D]">שם חיית המחמד <b className="text-red-600" aria-hidden="true">*</b></span>
                    <input value={pet.name} onChange={(event) => updatePet(index, "name", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.petName} disabled={isSaving} aria-invalid={Boolean(petError)} aria-describedby={petError ? errorId : undefined} className="h-10 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="למשל, לוקי" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-extrabold text-[#152E4D]">סוג <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                    <select value={pet.species} onChange={(event) => updatePet(index, "species", event.target.value)} disabled={isSaving} aria-invalid={Boolean(petError)} aria-describedby={petError ? errorId : undefined} className="h-10 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold text-[#152E4D] outline-none transition focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300"><option value="">לא צוין</option><option value="dog">כלב</option><option value="cat">חתול</option><option value="other">אחר</option></select>
                  </label>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[11px] font-extrabold text-[#152E4D]">גזע <span className="font-medium text-slate-400">(אופציונלי)</span></span><span className="text-[10px] font-bold text-slate-400">{pet.breed.length}/{CLIENT_PROFILE_LIMITS.petBreed}</span></div>
                    <input value={pet.breed} onChange={(event) => updatePet(index, "breed", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.petBreed} disabled={isSaving} aria-invalid={Boolean(petError)} aria-describedby={petError ? errorId : undefined} className="h-10 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="למשל, לברדור" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-extrabold text-[#152E4D]">תאריך לידה <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                    <div className="relative"><CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="date" value={pet.birthDate} onChange={(event) => updatePet(index, "birthDate", event.target.value)} max={maxBirthDate} disabled={isSaving} dir="ltr" aria-invalid={Boolean(petError)} aria-describedby={petError ? errorId : undefined} className="h-10 w-full rounded-xl border border-[#D4E0E2] bg-white py-2 pl-3 pr-9 text-right text-sm font-semibold text-[#152E4D] outline-none transition focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" /></div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-extrabold text-[#152E4D]">משקל בק״ג <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                    <div className="relative"><Scale className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="text" inputMode="decimal" value={pet.weightKg} onChange={(event) => updatePet(index, "weightKg", event.target.value)} disabled={isSaving} dir="ltr" aria-invalid={Boolean(petError)} aria-describedby={petError ? errorId : undefined} className="h-10 w-full rounded-xl border border-[#D4E0E2] bg-white py-2 pl-3 pr-9 text-right text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="למשל 4.8" /></div>
                    <p className="mt-1 text-[10px] font-medium text-slate-400">עד {CLIENT_PROFILE_LIMITS.petWeightMax} ק״ג, עד שתי ספרות אחרי הנקודה.</p>
                  </label>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[11px] font-extrabold text-[#152E4D]">אלרגיות <span className="font-medium text-slate-400">(אופציונלי)</span></span><span className="text-[10px] font-bold text-slate-400">{pet.allergies.length}/{CLIENT_PROFILE_LIMITS.petAllergies}</span></div>
                    <textarea value={pet.allergies} onChange={(event) => updatePet(index, "allergies", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.petAllergies} rows={2} disabled={isSaving} aria-invalid={Boolean(petError)} aria-describedby={petError ? errorId : undefined} className="w-full resize-y rounded-xl border border-[#D4E0E2] bg-white px-3 py-2 text-sm font-semibold leading-5 text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="למשל, רגישות למזון מסוים" />
                  </label>
                  <label className="block sm:col-span-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[11px] font-extrabold text-[#152E4D]">הערות רפואיות <span className="font-medium text-slate-400">(אופציונלי)</span></span><span className="text-[10px] font-bold text-slate-400">{pet.medicalNotes.length}/{CLIENT_PROFILE_LIMITS.petMedicalNotes}</span></div>
                    <textarea value={pet.medicalNotes} onChange={(event) => updatePet(index, "medicalNotes", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.petMedicalNotes} rows={3} disabled={isSaving} aria-invalid={Boolean(petError)} aria-describedby={petError ? errorId : undefined} className="w-full resize-y rounded-xl border border-[#D4E0E2] bg-white px-3 py-2 text-sm font-semibold leading-5 text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="מידע רפואי קצר שחשוב לצוות לזכור" />
                  </label>
                </div>
                {petError && <FieldError id={errorId}>{petError}</FieldError>}
              </article>;
            })}</div> : <div className="mt-4 rounded-xl border border-dashed border-[#C9DDDF] bg-white px-4 py-5 text-center"><PawPrint className="mx-auto h-5 w-5 text-[#6D9998]" /><p className="mt-2 text-xs font-extrabold text-[#315A67]">אין חיות מחמד בתיק</p><p className="mt-1 text-[11px] font-medium text-slate-500">הוסיפי חיה אם יש מידע שחשוב לצוות לזכור.</p></div>}
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#D9E5F4] bg-[#F7F9FF] px-3 py-2.5 text-[11px] font-bold leading-5 text-[#33447A]" role="note"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" /><p>פרטי האלרגיות והמידע הרפואי מיועדים לשימוש פנימי של צוות המרפאה בלבד.</p></div>
          </section>

          <section aria-labelledby="client-profile-notes-heading">
            <div className="mb-3 flex items-end justify-between gap-3"><div><h3 id="client-profile-notes-heading" className="text-sm font-black text-[#152E4D]">הערה קבועה לתיק</h3><p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">הערה זו נשמרת בפרופיל ואינה משנה הערות של תורים קודמים.</p></div><span className="shrink-0 text-[10px] font-bold text-slate-400">{draft.notes.length}/{CLIENT_PROFILE_LIMITS.notes}</span></div>
            <textarea id="client-profile-notes" value={draft.notes} onChange={(event) => updateField("notes", event.target.value)} maxLength={CLIENT_PROFILE_LIMITS.notes} rows={4} disabled={isSaving} aria-invalid={Boolean(fieldErrors.notes)} aria-describedby={fieldErrors.notes ? "client-profile-notes-error" : "client-profile-notes-help"} className="w-full resize-y rounded-xl border border-[#D4E0E2] bg-white px-3 py-2.5 text-sm font-semibold leading-6 text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300" placeholder="מידע שיעזור לצוות לזכור את פרטי הלקוח" />
            {fieldErrors.notes ? <FieldError id="client-profile-notes-error">{fieldErrors.notes}</FieldError> : <p id="client-profile-notes-help" className="mt-1 text-[11px] font-medium text-slate-400">אפשר להשאיר ריק או למחוק את ההערה הקיימת.</p>}
          </section>

          <div className="flex items-start gap-2 rounded-xl border border-[#D9E5F4] bg-[#F7F9FF] px-3 py-2.5 text-xs font-bold leading-5 text-[#33447A]" role="note"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" /><p>הסכמת SMS נשארת ללא שינוי בעריכת התיק. הסטטוס הנוכחי: {row.smsConsent ? "נשמרה עם נוסח מתועד" : "לא נשמרה"}.</p></div>

          {formError && <div role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-xl border border-[#F3D0D0] bg-[#FFF8F8] px-3 py-2.5 text-xs font-extrabold leading-5 text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{formError}</p></div>}

          <div className="flex flex-col-reverse gap-2 border-t border-[#E5EEF0] pt-4 sm:flex-row sm:justify-start"><button type="button" onClick={onClose} disabled={isSaving} className="min-h-11 rounded-xl border border-[#CAD8DA] bg-white px-5 text-sm font-extrabold text-[#152E4D] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50">ביטול</button><button type="submit" disabled={isSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#152E4D] px-5 text-sm font-extrabold text-white transition hover:bg-[#244568] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{isSaving ? "שומרת את התיק..." : "שמירת התיק"}</button></div>
        </form>
      </div>
    </div>
  );
}
