import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Loader2, UserPlus, X } from "lucide-react";
import type { ClientRow } from "@/lib/crmClientData";
import { isValidClientPhone, normalizeClientPhone } from "@/lib/clientAggregation";

export type CreateClientPetSpecies = "" | "dog" | "cat" | "other";

export interface CreateClientPayload {
  name: string;
  phone: string;
  email: string;
  notes: string;
  sms_consent: false;
  sms_consent_language: "";
  import_source: "crm_manual";
  pet_name?: string;
  pet_species?: CreateClientPetSpecies;
  pet_details?: Array<{ name: string; species: CreateClientPetSpecies }>;
}

interface CreateClientDialogProps {
  open: boolean;
  existingRows: ClientRow[];
  isSaving: boolean;
  onClose: () => void;
  onCreate: (payload: CreateClientPayload) => Promise<void> | void;
}

type FormState = {
  name: string;
  phone: string;
  email: string;
  petName: string;
  petSpecies: CreateClientPetSpecies;
  notes: string;
};

type FieldErrors = Partial<Record<"name" | "phone" | "email", string>>;

const INITIAL_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  petName: "",
  petSpecies: "",
  notes: "",
};

const MAX_LENGTHS = {
  name: 120,
  phone: 40,
  email: 160,
  petName: 80,
  notes: 1000,
} as const;

function compactPhoneInput(value: string): string {
  return value.trim().replace(/[\s().-]+/g, "");
}

function normalizedPhone(value: unknown): string | null {
  const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!raw) return null;
  return normalizeClientPhone(compactPhoneInput(raw));
}

function phoneComparisonKey(value: unknown): string {
  const normalized = normalizedPhone(value);
  return normalized ? normalized.replace(/\D/g, "") : "";
}

function normalizedEmail(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim().toLocaleLowerCase("en-US") : "";
}

function isValidEmail(value: string): boolean {
  return value.length <= MAX_LENGTHS.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value);
}

function normalizedName(value: unknown): string {
  const raw = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return raw
    .toLocaleLowerCase("he")
    .replace(/[.,;:!?()[\]{}'׳״`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulName(value: string): boolean {
  return Boolean(value) && !["לקוח ללא שם", "פונה ללא שם", "ללא שם", "לא צוין", "unknown", "n/a", "na", "-"].includes(value);
}

function matchingNames(rows: ClientRow[]): string {
  const names = Array.from(new Set(rows.map((row) => row.name.trim() || "לקוח ללא שם")));
  const visible = names.slice(0, 3).join(" · ");
  const remaining = names.length - visible.split(" · ").filter(Boolean).length;
  return remaining > 0 ? `${visible} ועוד ${remaining}` : visible;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "השמירה לא הושלמה. בדקי את הפרטים ונסי שוב.";
}

export default function CreateClientDialog({
  open,
  existingRows,
  isSaving,
  onClose,
  onCreate,
}: CreateClientDialogProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [nameWarningArmed, setNameWarningArmed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(INITIAL_FORM);
    setFieldErrors({});
    setFormError("");
    setNameWarningArmed(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose, open]);

  const normalizedFormPhone = useMemo(() => normalizedPhone(form.phone), [form.phone]);
  const formPhoneKey = useMemo(() => phoneComparisonKey(form.phone), [form.phone]);
  const formEmailKey = useMemo(() => normalizedEmail(form.email), [form.email]);
  const formNameKey = useMemo(() => normalizedName(form.name), [form.name]);

  const exactPhoneMatches = useMemo(
    () => formPhoneKey ? existingRows.filter((row) => phoneComparisonKey(row.phone) === formPhoneKey) : [],
    [existingRows, formPhoneKey],
  );
  const exactEmailMatches = useMemo(
    () => formEmailKey ? existingRows.filter((row) => normalizedEmail(row.email) === formEmailKey) : [],
    [existingRows, formEmailKey],
  );
  const exactMatchIds = useMemo(
    () => new Set([...exactPhoneMatches, ...exactEmailMatches].map((row) => row.id)),
    [exactEmailMatches, exactPhoneMatches],
  );
  const nameOnlyMatches = useMemo(
    () => meaningfulName(formNameKey)
      ? existingRows.filter((row) => normalizedName(row.name) === formNameKey && !exactMatchIds.has(row.id))
      : [],
    [existingRows, exactMatchIds, formNameKey],
  );

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === "name" || field === "phone" || field === "email") {
      setFieldErrors((current) => ({ ...current, [field]: "" }));
    }
    setFormError("");
    setNameWarningArmed(false);
  };

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setFieldErrors({});
    setFormError("");
    setNameWarningArmed(false);
  };

  const validate = (): { valid: boolean; name: string; phone: string; email: string } => {
    const name = form.name.trim();
    const phone = normalizedFormPhone || "";
    const email = form.email.trim();
    const nextErrors: FieldErrors = {};

    if (!name) nextErrors.name = "נדרש להזין שם מלא.";
    else if (name.length > MAX_LENGTHS.name) nextErrors.name = `השם יכול להכיל עד ${MAX_LENGTHS.name} תווים.`;

    if (!phone) nextErrors.phone = "נדרש להזין מספר טלפון.";
    else if (!isValidClientPhone(phone)) nextErrors.phone = "הזיני מספר טלפון תקין, למשל 050-1234567 או +972501234567.";

    if (email && !isValidEmail(email)) nextErrors.email = "הזיני כתובת אימייל תקינה, למשל name@example.com.";

    setFieldErrors(nextErrors);
    return { valid: Object.keys(nextErrors).length === 0, name, phone, email };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setFormError("");

    const result = validate();
    if (!result.valid) return;

    if (exactPhoneMatches.length || exactEmailMatches.length) {
      const matches = Array.from(new Map(
        [...exactPhoneMatches, ...exactEmailMatches].map((row) => [row.id, row]),
      ).values());
      setNameWarningArmed(false);
      setFormError(`כבר קיימת רשומה עם ${exactPhoneMatches.length ? "מספר הטלפון" : "כתובת האימייל"}. לא ניתן ליצור לקוח כפול${matches.length ? ` עבור ${matchingNames(matches)}` : ""}.`);
      return;
    }

    if (nameOnlyMatches.length && !nameWarningArmed) {
      setNameWarningArmed(true);
      return;
    }

    const payload: CreateClientPayload = {
      name: result.name,
      phone: result.phone,
      email: result.email,
      notes: form.notes.trim(),
      sms_consent: false,
      sms_consent_language: "",
      import_source: "crm_manual",
    };
    const petName = form.petName.trim();
    if (petName) {
      payload.pet_name = petName;
      payload.pet_species = form.petSpecies;
      payload.pet_details = [{ name: petName, species: form.petSpecies }];
    }

    try {
      await onCreate(payload);
      resetForm();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  if (!open) return null;

  const exactMatches = Array.from(new Map(
    [...exactPhoneMatches, ...exactEmailMatches].map((row) => [row.id, row]),
  ).values());

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[#1A1A3E]/[0.48] p-3 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        id="create-client-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-client-title"
        aria-describedby="create-client-description"
        aria-busy={isSaving}
        dir="rtl"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-3 border-b border-[#EEF0F3] pb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1A1A3E] text-[#F2D162]">
            <UserPlus className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="create-client-title" className="text-lg font-black text-[#1A1A3E]">יצירת לקוח חדש</h2>
                <p id="create-client-description" className="mt-1 text-xs font-medium leading-5 text-slate-500">הוסיפי לקוח ישירות לרשימת הלקוחות, בלי ליצור תור או לשלוח הודעה.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="סגירת חלון יצירת לקוח"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">שם מלא <b className="text-red-600" aria-hidden="true">*</b></span>
              <input
                autoFocus
                id="create-client-name"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                maxLength={MAX_LENGTHS.name}
                autoComplete="name"
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "create-client-name-error" : undefined}
                className="h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300"
                placeholder="שם הלקוח"
              />
              {fieldErrors.name && <p id="create-client-name-error" className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.name}</p>}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">טלפון <b className="text-red-600" aria-hidden="true">*</b></span>
              <input
                id="create-client-phone"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                maxLength={MAX_LENGTHS.phone}
                type="tel"
                dir="ltr"
                autoComplete="tel"
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? "create-client-phone-error" : "create-client-phone-help"}
                className="h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-right text-sm font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300"
                placeholder="050-1234567"
              />
              {fieldErrors.phone ? <p id="create-client-phone-error" className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.phone}</p> : <p id="create-client-phone-help" className="mt-1 text-[11px] font-medium text-slate-400">המספר יישמר בפורמט בינלאומי.</p>}
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">אימייל <span className="font-medium text-slate-400">(אופציונלי)</span></span>
              <input
                id="create-client-email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                maxLength={MAX_LENGTHS.email}
                type="email"
                dir="ltr"
                autoComplete="email"
                spellCheck={false}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "create-client-email-error" : undefined}
                className="h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-right text-sm font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162] aria-[invalid=true]:border-red-300"
                placeholder="name@example.com"
              />
              {fieldErrors.email && <p id="create-client-email-error" className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.email}</p>}
            </label>
          </div>

          <div className="rounded-2xl border border-[#EEF0F3] bg-[#FBFCFD] p-4">
            <div className="mb-3">
              <h3 className="text-sm font-black text-[#1A1A3E]">פרטי חיית המחמד</h3>
              <p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">אפשר להוסיף חיית מחמד עכשיו, או להשאיר את הפרטים לביקור הבא.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">שם חיית המחמד <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                <input
                  id="create-client-pet-name"
                  value={form.petName}
                  onChange={(event) => updateField("petName", event.target.value)}
                  maxLength={MAX_LENGTHS.petName}
                  className="h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]"
                  placeholder="למשל, לוקי"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">סוג חיית המחמד <span className="font-medium text-slate-400">(אופציונלי)</span></span>
                <select
                  id="create-client-pet-species"
                  value={form.petSpecies}
                  onChange={(event) => updateField("petSpecies", event.target.value as CreateClientPetSpecies)}
                  className="h-11 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none transition focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]"
                >
                  <option value="">לא צוין</option>
                  <option value="dog">כלב</option>
                  <option value="cat">חתול</option>
                  <option value="other">אחר</option>
                </select>
              </label>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold text-[#1A1A3E]">הערות <span className="font-medium text-slate-400">(אופציונלי)</span></span>
            <textarea
              id="create-client-notes"
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              maxLength={MAX_LENGTHS.notes}
              rows={3}
              className="w-full resize-y rounded-xl border border-[#D9DEE5] bg-white px-3 py-2.5 text-sm font-semibold leading-6 text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]"
              placeholder="מידע שיעזור לצוות לזכור את פרטי הלקוח"
            />
            <span className="mt-1 block text-[11px] font-medium text-slate-400">עד {MAX_LENGTHS.notes} תווים</span>
          </label>

          <div className="flex items-start gap-2 rounded-xl border border-[#E6E9F3] bg-[#F7F8FF] px-3 py-2.5 text-xs font-bold leading-5 text-[#33447A]" role="note">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" />
            <p>הלקוח יישמר ללא הסכמה ל-SMS. שליחת הודעות שיווקיות דורשת הסכמה מתועדת שהתקבלה מהלקוח.</p>
          </div>

          {exactMatches.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-[#F3D0D0] bg-[#FFF8F8] px-3 py-2.5 text-xs font-extrabold leading-5 text-red-700" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>נמצאה רשומה קיימת עם מספר טלפון או אימייל זהים: {matchingNames(exactMatches)}. לא ניתן ליצור את הלקוח בלי לשנות את פרטי הקשר.</p>
            </div>
          )}

          {nameWarningArmed && nameOnlyMatches.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-[#F2D162] bg-[#FFFBEA] px-3 py-2.5 text-xs font-extrabold leading-5 text-[#69550C]" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>נמצא לקוח עם אותו שם בלבד: {matchingNames(nameOnlyMatches)}. ייתכן שמדובר באדם אחר. לחצי על ״ליצור בכל זאת״ כדי לשמור לקוח חדש, או על ״ביטול״ כדי לחזור לרשימה.</p>
            </div>
          )}

          {formError && <p className="flex items-start gap-2 rounded-xl border border-[#F3D0D0] bg-[#FFF8F8] px-3 py-2.5 text-xs font-extrabold leading-5 text-red-700" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{formError}</p>}

          <div className="flex flex-col-reverse gap-2 border-t border-[#EEF0F3] pt-4 sm:flex-row sm:justify-start">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="min-h-11 rounded-xl border border-[#D9DEE5] bg-white px-5 text-sm font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSaving || exactMatches.length > 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {isSaving ? "שומרת את הלקוח..." : nameWarningArmed && nameOnlyMatches.length > 0 ? "ליצור בכל זאת" : "שמירת הלקוח"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
