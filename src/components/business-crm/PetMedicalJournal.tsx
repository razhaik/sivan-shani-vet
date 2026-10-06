import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { format, isValid, parse } from "date-fns";
import { he } from "date-fns/locale";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  Check,
  FileText,
  Loader2,
  Pencil,
  PawPrint,
  Plus,
  Save,
  Stethoscope,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { PetMedicalRecord } from "@/entities";
import { legacyPetIdForName, type ClientPet } from "@/lib/clientAggregation";
import { speciesLabel } from "@/lib/crmClientData";

type MedicalRecordType = "visit" | "vaccination" | "treatment" | "medication" | "test" | "other";

type MedicalRecord = Record<string, any>;

type JournalForm = {
  recordType: MedicalRecordType;
  recordDate: string;
  title: string;
  details: string;
};

type PetOption = {
  id: string;
  name: string;
  species: ClientPet["species"];
  kind: "current" | "orphan";
  count?: number;
};

type JournalFeedback = {
  kind: "success" | "info" | "error";
  text: string;
};

const RECORD_TYPES: Array<{ value: MedicalRecordType; label: string }> = [
  { value: "visit", label: "ביקור" },
  { value: "vaccination", label: "חיסון" },
  { value: "treatment", label: "טיפול" },
  { value: "medication", label: "תרופה" },
  { value: "test", label: "בדיקה" },
  { value: "other", label: "אחר" },
];

const JOURNAL_TITLE_LIMIT = 120;
const JOURNAL_DETAILS_LIMIT = 2000;

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function normalizeTitle(value: unknown): string {
  return text(value).replace(/\s+/g, " ").trim();
}

function normalizeDetails(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .trim();
}

function normalizeRecordType(value: unknown): MedicalRecordType {
  const candidate = text(value) as MedicalRecordType;
  return RECORD_TYPES.some((item) => item.value === candidate) ? candidate : "other";
}

function emptyForm(): JournalForm {
  return { recordType: "visit", recordDate: todayIsoDate(), title: "", details: "" };
}

function petIdForDisplay(pet: ClientPet): string {
  return text(pet.petId) || legacyPetIdForName(pet.name);
}

function entryPetId(record: MedicalRecord): string {
  return text(record.pet_id) || legacyPetIdForName(record.pet_name);
}

function recordTypeLabel(value: unknown): string {
  return RECORD_TYPES.find((item) => item.value === normalizeRecordType(value))?.label || "אחר";
}

function recordDateLabel(value: unknown): string {
  const candidate = text(value);
  if (!isRealIsoDate(candidate)) return "תאריך לא צוין";
  const parsed = parse(candidate, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? format(parsed, "d בMMMM yyyy", { locale: he }) : "תאריך לא צוין";
}

function createdAtLabel(value: unknown): string {
  const candidate = text(value);
  if (!candidate) return "";
  const parsed = new Date(candidate);
  return isValid(parsed) ? format(parsed, "d בMMMM yyyy · HH:mm", { locale: he }) : "";
}

function sortRecords(records: MedicalRecord[]): MedicalRecord[] {
  return [...records].sort((first, second) => {
    const dateOrder = text(second.record_date).localeCompare(text(first.record_date));
    if (dateOrder !== 0) return dateOrder;
    const secondCreated = Date.parse(text(second.created_at));
    const firstCreated = Date.parse(text(first.created_at));
    if (Number.isFinite(secondCreated) || Number.isFinite(firstCreated)) return (Number.isFinite(secondCreated) ? secondCreated : 0) - (Number.isFinite(firstCreated) ? firstCreated : 0);
    return text(second.id).localeCompare(text(first.id));
  });
}

function PetOptionButton({ option, selected, onSelect }: { option: PetOption; selected: boolean; onSelect: () => void }) {
  return <button
    type="button"
    onClick={onSelect}
    aria-pressed={selected}
    className={`group flex min-h-[72px] items-center gap-3 rounded-2xl border px-3 py-3 text-right transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${selected ? "border-[#236B68] bg-[#EAF7F5] shadow-[0_10px_24px_-18px_rgba(35,107,104,0.8)]" : "border-[#E0EAEB] bg-[#FBFDFD] hover:border-[#8FC7C3] hover:bg-[#F4FBFA]"}`}
  >
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${option.kind === "orphan" ? "bg-[#F1F3FA] text-[#5267A8]" : "bg-[#F2D162]/30 text-[#69550C]"}`}>
      {option.kind === "orphan" ? <Archive className="h-4 w-4" /> : <PawPrint className="h-4 w-4" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className={`block truncate text-xs font-black ${selected ? "text-[#236B68]" : "text-[#152E4D]"}`}>{option.kind === "orphan" ? "חיה שהוסרה מהפרופיל" : option.name}</span>
      <span className="mt-1 block truncate text-[10px] font-bold text-slate-400">{option.kind === "orphan" ? `${option.name || "שם לא נשמר"} · ${option.count || 0} רשומות` : option.species ? speciesLabel(option.species) : "סוג לא צוין"}</span>
    </span>
    {selected && <Check className="h-4 w-4 shrink-0 text-[#236B68]" aria-hidden="true" />}
  </button>;
}

function JournalFormPanel({
  form,
  editing,
  saving,
  formError,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: JournalForm;
  editing: boolean;
  saving: boolean;
  formError: string;
  onChange: (field: keyof JournalForm, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return <form onSubmit={onSubmit} noValidate className="mt-4 rounded-2xl border border-[#CFE5E3] bg-[#F4FBFA] p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6D9998]">{editing ? "עדכון רשומה" : "רשומה חדשה"}</p>
        <h3 className="mt-1 text-sm font-black text-[#152E4D]">{editing ? "עריכת רשומה רפואית" : "הוספת רשומה רפואית"}</h3>
        <p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">המידע יישמר ביומן הפנימי של המרפאה.</p>
      </div>
      <button type="button" onClick={onCancel} disabled={saving} aria-label="סגירת טופס הרשומה" className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-[#152E4D] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40"><X className="h-4 w-4" /></button>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-extrabold text-[#152E4D]">סוג הרשומה <b className="text-red-600" aria-hidden="true">*</b></span>
        <select value={form.recordType} onChange={(event) => onChange("recordType", event.target.value)} disabled={saving} className="h-10 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold text-[#152E4D] outline-none transition focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162]">
          {RECORD_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-extrabold text-[#152E4D]">תאריך הרשומה <b className="text-red-600" aria-hidden="true">*</b></span>
        <div className="relative"><CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="date" value={form.recordDate} onChange={(event) => onChange("recordDate", event.target.value)} max={todayIsoDate()} disabled={saving} dir="ltr" className="h-10 w-full rounded-xl border border-[#D4E0E2] bg-white py-2 pl-3 pr-9 text-right text-sm font-semibold text-[#152E4D] outline-none transition focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162]" /></div>
      </label>
      <label className="block sm:col-span-2">
        <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[11px] font-extrabold text-[#152E4D]">כותרת קצרה <b className="text-red-600" aria-hidden="true">*</b></span><span className="text-[10px] font-bold text-slate-400">{form.title.length}/{JOURNAL_TITLE_LIMIT}</span></div>
        <input value={form.title} onChange={(event) => onChange("title", event.target.value)} maxLength={JOURNAL_TITLE_LIMIT} disabled={saving} className="h-10 w-full rounded-xl border border-[#D4E0E2] bg-white px-3 text-sm font-semibold text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162]" placeholder="למשל, ביקורת לאחר טיפול" />
      </label>
      <label className="block sm:col-span-2">
        <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[11px] font-extrabold text-[#152E4D]">פרטים <span className="font-medium text-slate-400">(אופציונלי)</span></span><span className="text-[10px] font-bold text-slate-400">{form.details.length}/{JOURNAL_DETAILS_LIMIT}</span></div>
        <textarea value={form.details} onChange={(event) => onChange("details", event.target.value)} maxLength={JOURNAL_DETAILS_LIMIT} rows={4} disabled={saving} className="w-full resize-y rounded-xl border border-[#D4E0E2] bg-white px-3 py-2.5 text-sm font-semibold leading-6 text-[#152E4D] outline-none transition placeholder:text-slate-400 focus:border-[#236B68]/50 focus:ring-2 focus:ring-[#F2D162]" placeholder="פרטים שהצוות צריך לראות בהמשך" />
      </label>
    </div>

    {formError && <div role="alert" aria-live="assertive" className="mt-3 flex items-start gap-2 rounded-xl border border-[#F3D0D0] bg-[#FFF8F8] px-3 py-2.5 text-xs font-extrabold leading-5 text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{formError}</p></div>}

    <div className="mt-4 flex flex-col-reverse gap-2 border-t border-[#DCEBEC] pt-4 sm:flex-row sm:justify-start"><button type="button" onClick={onCancel} disabled={saving} className="min-h-10 rounded-xl border border-[#CAD8DA] bg-white px-4 text-xs font-extrabold text-[#152E4D] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50">ביטול</button><button type="submit" disabled={saving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#152E4D] px-4 text-xs font-extrabold text-white transition hover:bg-[#244568] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? "שומרת..." : editing ? "שמירת השינויים" : "שמירת הרשומה"}</button></div>
  </form>;
}

function JournalEntryCard({
  record,
  canEdit,
  deleting,
  confirmDelete,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  record: MedicalRecord;
  canEdit: boolean;
  deleting: boolean;
  confirmDelete: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const title = text(record.title) || "רשומה ללא כותרת";
  const details = normalizeDetails(record.details);
  const author = text(record.author_name);
  const createdAt = createdAtLabel(record.created_at);
  const id = text(record.id);
  return <article className="rounded-2xl border border-[#E0EAEB] bg-[#FBFDFD] p-4 transition hover:border-[#B8DCD9]" aria-labelledby={id ? `journal-entry-${id}` : undefined}>
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF7F5] text-[#236B68]"><Stethoscope className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-[#EAF7F5] px-2.5 py-1 text-[10px] font-black text-[#236B68]">{recordTypeLabel(record.record_type)}</span><span className="text-[10px] font-bold text-slate-400">{recordDateLabel(record.record_date)}</span></div><h3 id={id ? `journal-entry-${id}` : undefined} className="mt-2 break-words text-sm font-black text-[#152E4D]">{title}</h3></div>
          {canEdit && <div className="flex shrink-0 items-center gap-1"><button type="button" onClick={onEdit} disabled={deleting} className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-[#236B68] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40" aria-label={`עריכת ${title}`} title="עריכת הרשומה"><Pencil className="h-4 w-4" /></button><button type="button" onClick={onRequestDelete} disabled={deleting} className="rounded-lg p-2 text-slate-400 transition hover:bg-[#FFF4F4] hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40" aria-label={`מחיקת ${title}`} title="מחיקת הרשומה"><Trash2 className="h-4 w-4" /></button></div>}
        </div>
        {details && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-[#E8EFF0] bg-white px-3 py-2.5 text-xs font-medium leading-6 text-slate-600">{details}</p>}
        {(author || createdAt) && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-bold text-slate-400">{author && <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{author}</span>}{createdAt && <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />נשמרה {createdAt}</span>}</div>}
      </div>
    </div>
    {confirmDelete && <div role="alertdialog" aria-label="אישור מחיקת רשומה" className="mt-4 rounded-xl border border-[#F1D4D4] bg-[#FFF8F8] p-3"><p className="text-xs font-extrabold leading-5 text-red-800">למחוק את הרשומה הזו מהיומן?</p><p className="mt-1 text-[11px] font-medium leading-5 text-red-700">המחיקה קבועה ולא משנה את הערות התורים.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={onCancelDelete} disabled={deleting} className="min-h-9 rounded-lg border border-[#E5CACA] bg-white px-3 text-[11px] font-extrabold text-[#7A3D3D] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:opacity-50">ביטול</button><button type="button" onClick={onConfirmDelete} disabled={deleting} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#B33A3A] px-3 text-[11px] font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-60">{deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}כן, מחיקת הרשומה</button></div></div>}
  </article>;
}

export interface PetMedicalJournalProps {
  clientKey: string;
  pets: ClientPet[];
  editable: boolean;
  hasCustomerProfile: boolean;
  staffName: string;
}

export function PetMedicalJournal({ clientKey, pets, editable, hasCustomerProfile, staffName }: PetMedicalJournalProps) {
  const [entries, setEntries] = useState<MedicalRecord[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState<JournalForm>(() => emptyForm());
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [feedback, setFeedback] = useState<JournalFeedback | null>(null);
  const requestRef = useRef(0);
  const activeClientKeyRef = useRef(clientKey);

  const currentPetOptions = useMemo<PetOption[]>(() => {
    const seen = new Set<string>();
    return pets.reduce<PetOption[]>((result, pet) => {
      const id = petIdForDisplay(pet);
      if (seen.has(id)) return result;
      seen.add(id);
      result.push({ id, name: text(pet.name) || "חיית מחמד ללא שם", species: pet.species, kind: "current" });
      return result;
    }, []);
  }, [pets]);

  const orphanPetOptions = useMemo<PetOption[]>(() => {
    const currentIds = new Set(currentPetOptions.map((option) => option.id));
    const grouped = new Map<string, { name: string; count: number }>();
    entries.forEach((record) => {
      const id = entryPetId(record);
      if (!id || currentIds.has(id)) return;
      const current = grouped.get(id) || { name: text(record.pet_name), count: 0 };
      current.count += 1;
      if (!current.name && text(record.pet_name)) current.name = text(record.pet_name);
      grouped.set(id, current);
    });
    return Array.from(grouped.entries()).map(([id, snapshot]) => ({ id, name: snapshot.name || "שם לא נשמר", species: "", kind: "orphan", count: snapshot.count }));
  }, [currentPetOptions, entries]);

  const petOptions = useMemo(() => [...currentPetOptions, ...orphanPetOptions], [currentPetOptions, orphanPetOptions]);
  const selectedPet = petOptions.find((option) => option.id === selectedPetId) || petOptions[0] || null;
  const selectedCurrentPet = currentPetOptions.find((option) => option.id === selectedPet?.id) || null;
  const selectedEntries = useMemo(() => selectedPet ? sortRecords(entries.filter((record) => entryPetId(record) === selectedPet.id)) : [], [entries, selectedPet]);

  const loadEntries = useCallback(async (): Promise<boolean> => {
    if (!hasCustomerProfile || !clientKey || activeClientKeyRef.current !== clientKey) return false;
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setLoadError("");
    try {
      const result = await PetMedicalRecord.query().where("client_key", clientKey).sort("-record_date").limit(500).exec();
      if (requestId !== requestRef.current || activeClientKeyRef.current !== clientKey) return false;
      setEntries(Array.isArray(result) ? result.filter(Boolean) as MedicalRecord[] : []);
      return true;
    } catch (error) {
      console.error("Failed to load pet medical journal:", error);
      if (requestId !== requestRef.current || activeClientKeyRef.current !== clientKey) return false;
      setLoadError("לא הצלחנו לטעון את היומן הרפואי. בדקי את ההרשאה ונסי שוב.");
      return false;
    } finally {
      if (requestId === requestRef.current && activeClientKeyRef.current === clientKey) setIsLoading(false);
    }
  }, [clientKey, hasCustomerProfile]);

  useEffect(() => {
    activeClientKeyRef.current = clientKey;
    requestRef.current += 1;
    setEntries([]);
    setSelectedPetId("");
    setFormOpen(false);
    setEditingId("");
    setForm(emptyForm());
    setFormError("");
    setDeletingId("");
    setConfirmDeleteId("");
    setFeedback(null);
    if (!hasCustomerProfile || !clientKey) {
      setLoadError("");
      setIsLoading(false);
      return;
    }
    void loadEntries();
    return () => { requestRef.current += 1; };
  }, [clientKey, hasCustomerProfile, loadEntries]);

  useEffect(() => {
    if (!petOptions.length) {
      if (selectedPetId) setSelectedPetId("");
      return;
    }
    if (!petOptions.some((option) => option.id === selectedPetId)) setSelectedPetId(petOptions[0].id);
  }, [petOptions, selectedPetId]);

  const selectPet = (id: string) => {
    if (id === selectedPetId) return;
    setSelectedPetId(id);
    setFormOpen(false);
    setEditingId("");
    setFormError("");
    setConfirmDeleteId("");
    setFeedback(null);
  };

  const changeForm = (field: keyof JournalForm, value: string) => {
    setForm((current) => ({ ...current, [field]: field === "recordType" ? normalizeRecordType(value) : value }));
    setFormError("");
    setFeedback(null);
  };

  const startNewEntry = () => {
    if (!editable || !selectedCurrentPet) return;
    setEditingId("");
    setForm(emptyForm());
    setFormError("");
    setFeedback(null);
    setConfirmDeleteId("");
    setFormOpen(true);
  };

  const startEditing = (record: MedicalRecord) => {
    const id = text(record.id);
    if (!editable || !id) return;
    setEditingId(id);
    setForm({ recordType: normalizeRecordType(record.record_type), recordDate: text(record.record_date), title: text(record.title), details: normalizeDetails(record.details) });
    setFormError("");
    setFeedback(null);
    setConfirmDeleteId("");
    setFormOpen(true);
  };

  const cancelForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditingId("");
    setFormError("");
  };

  const validateForm = (): JournalForm | null => {
    const recordType = normalizeRecordType(form.recordType);
    const recordDate = text(form.recordDate);
    const title = normalizeTitle(form.title);
    const details = normalizeDetails(form.details);
    if (!recordType) { setFormError("בחרי סוג רשומה."); return null; }
    if (!isRealIsoDate(recordDate)) { setFormError("בחרי תאריך רשומה תקין."); return null; }
    if (recordDate > todayIsoDate()) { setFormError("תאריך הרשומה לא יכול להיות בעתיד."); return null; }
    if (!title) { setFormError("נדרשת כותרת קצרה לרשומה."); return null; }
    if (title.length > JOURNAL_TITLE_LIMIT) { setFormError(`הכותרת יכולה להכיל עד ${JOURNAL_TITLE_LIMIT} תווים.`); return null; }
    if (details.length > JOURNAL_DETAILS_LIMIT) { setFormError(`הפרטים יכולים להכיל עד ${JOURNAL_DETAILS_LIMIT.toLocaleString("he-IL")} תווים.`); return null; }
    return { recordType, recordDate, title, details };
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !editable || !hasCustomerProfile) return;
    setFormError("");
    const normalized = validateForm();
    if (!normalized) return;
    const currentPet = selectedCurrentPet;
    if (!editingId && !currentPet) {
      setFormError("אפשר להוסיף רשומה רק לחיית מחמד שנמצאת כרגע בפרופיל.");
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const payload = { record_type: normalized.recordType, record_date: normalized.recordDate, title: normalized.title, details: normalized.details };
      if (editingId) {
        await PetMedicalRecord.update(editingId, payload);
      } else if (currentPet) {
        await PetMedicalRecord.create({
          client_key: clientKey,
          pet_id: currentPet.id,
          pet_name: currentPet.name,
          ...payload,
          author_name: text(staffName) || "צוות המרפאה",
        });
      }
      const refreshed = await loadEntries();
      setFormOpen(false);
      setEditingId("");
      setFormError("");
      setForm(emptyForm());
      setFeedback({ kind: refreshed ? "success" : "info", text: refreshed ? (editingId ? "הרשומה עודכנה בהצלחה." : "הרשומה נוספה ליומן בהצלחה.") : "הרשומה נשמרה, אך רענון היומן לא הצליח. נסי לרענן את התיק." });
    } catch (error) {
      console.error("Failed to save pet medical journal entry:", error);
      setFormError("לא הצלחנו לשמור את הרשומה. בדקי את ההרשאה ונסי שוב.");
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (record: MedicalRecord) => {
    const id = text(record.id);
    if (!editable || !id) return;
    setConfirmDeleteId(id);
    setFeedback(null);
  };

  const confirmDelete = async (record: MedicalRecord) => {
    const id = text(record.id);
    if (!id || deletingId || !editable) return;
    setDeletingId(id);
    setFeedback(null);
    try {
      await PetMedicalRecord.delete(id);
      const refreshed = await loadEntries();
      setConfirmDeleteId("");
      setFeedback({ kind: refreshed ? "success" : "info", text: refreshed ? "הרשומה נמחקה מהיומן." : "הרשומה נמחקה, אך רענון היומן לא הצליח." });
    } catch (error) {
      console.error("Failed to delete pet medical journal entry:", error);
      setFeedback({ kind: "error", text: "לא הצלחנו למחוק את הרשומה. בדקי את ההרשאה ונסי שוב." });
    } finally {
      setDeletingId("");
    }
  };

  return <section className="rounded-2xl border border-[#DDE7E8] bg-white p-4 shadow-[0_14px_38px_-30px_rgba(21,46,77,0.55)] sm:p-5" dir="rtl" aria-labelledby="pet-medical-journal-heading">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF0FF] text-[#5267A8]"><FileText className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6D9998]">מידע פנימי לצוות</p><span className="rounded-full bg-[#F1F3FA] px-2 py-1 text-[10px] font-black text-[#5267A8]">יומן רפואי</span></div><h2 id="pet-medical-journal-heading" className="mt-1 text-lg font-black text-[#152E4D]">היסטוריה רפואית לפי חיה</h2><p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-slate-500">תיעוד קצר של ביקורים, חיסונים, טיפולים ובדיקות. הרשומות נשמרות בנפרד מהערות התורים.</p></div></div>
      {hasCustomerProfile && <span className="rounded-full border border-[#E1ECEC] bg-[#F8FBFB] px-3 py-1.5 text-[10px] font-black text-slate-500">{entries.length} {entries.length === 1 ? "רשומה" : "רשומות"}</span>}
    </header>

    {!hasCustomerProfile ? <div role="note" className="mt-5 flex items-start gap-3 rounded-2xl border border-[#D9E5F4] bg-[#F7F9FF] px-4 py-4 text-[#33447A]"><Archive className="mt-0.5 h-5 w-5 shrink-0 text-[#5267A8]" /><div><p className="text-sm font-black">יומן רפואי ייפתח לאחר שמירת תיק הלקוח</p><p className="mt-1 text-xs font-medium leading-5">שמרי או צרי את רשומת הלקוח לפני הוספת מידע רפואי פנימי. ליד ללא תיק לקוח נשאר לקריאה בלבד.</p></div></div> : <>
      <div className="mt-5 rounded-2xl border border-[#E5EFF0] bg-[#F9FCFC] p-3.5 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black text-[#152E4D]">בחירת חיית מחמד</p><p className="mt-1 text-[11px] font-medium text-slate-500">בחרי חיה כדי לראות את הרשומות שלה.</p></div>{editable && selectedCurrentPet && <button type="button" onClick={startNewEntry} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#152E4D] px-3.5 text-xs font-extrabold text-white transition hover:bg-[#244568] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Plus className="h-4 w-4 text-[#F2D162]" />הוספת רשומה</button>}</div>
        {petOptions.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{petOptions.map((option) => <PetOptionButton key={option.id} option={option} selected={selectedPet?.id === option.id} onSelect={() => selectPet(option.id)} />)}</div> : <div className="mt-3 rounded-xl border border-dashed border-[#C9DDDF] bg-white px-4 py-5 text-center"><PawPrint className="mx-auto h-5 w-5 text-[#6D9998]" /><p className="mt-2 text-xs font-extrabold text-[#315A67]">אין חיות מחמד בפרופיל</p><p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">הוסיפי חיית מחמד בעריכת התיק כדי לפתוח עבורה יומן.</p></div>}
      </div>

      {isLoading && <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#D9E5F4] bg-[#F7F9FF] px-3 py-2.5 text-xs font-bold text-[#33447A]" role="status" aria-live="polite"><Loader2 className="h-4 w-4 animate-spin" />טוענים את הרשומות השמורות...</div>}
      {loadError && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F3D0D0] bg-[#FFF8F8] px-3 py-2.5 text-xs font-bold text-red-700" role="alert"><span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{loadError}</span><button type="button" onClick={() => void loadEntries()} className="rounded-lg border border-[#E5CACA] bg-white px-3 py-1.5 text-[11px] font-extrabold text-red-700 focus:outline-none focus:ring-2 focus:ring-[#F2D162]">ניסיון נוסף</button></div>}
      {feedback && <div className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${feedback.kind === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : feedback.kind === "error" ? "border-[#F3D0D0] bg-[#FFF8F8] text-red-700" : "border-[#D9E5F4] bg-[#F7F9FF] text-[#33447A]"}`} role={feedback.kind === "error" ? "alert" : "status"} aria-live="polite">{feedback.kind === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}{feedback.text}</div>}

      {formOpen && <JournalFormPanel form={form} editing={Boolean(editingId)} saving={saving} formError={formError} onChange={changeForm} onSubmit={submitForm} onCancel={cancelForm} />}

      <div className="mt-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6D9998]">{selectedPet?.kind === "orphan" ? "רשומות היסטוריות" : "ציר רפואי"}</p><h3 className="mt-1 text-sm font-black text-[#152E4D]">{selectedPet ? (selectedPet.kind === "orphan" ? `רשומות שנשמרו תחת ${selectedPet.name}` : `הרשומות של ${selectedPet.name}`) : "בחירת חיה"}</h3></div>{selectedPet?.kind === "orphan" && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F3FA] px-2.5 py-1 text-[10px] font-black text-[#5267A8]"><Archive className="h-3.5 w-3.5" />חיה שהוסרה מהפרופיל</span>}</div>
        {selectedPet && selectedEntries.length ? <div className="mt-3 space-y-3">{selectedEntries.map((record, index) => { const id = text(record.id) || `${selectedPet.id}-${index}`; return <JournalEntryCard key={id} record={record} canEdit={editable} deleting={deletingId === id} confirmDelete={confirmDeleteId === id} onEdit={() => startEditing(record)} onRequestDelete={() => requestDelete(record)} onCancelDelete={() => setConfirmDeleteId("")} onConfirmDelete={() => void confirmDelete(record)} />; })}</div> : <div className="mt-3 rounded-2xl border border-dashed border-[#C9DDDF] bg-[#F9FCFC] px-5 py-10 text-center"><FileText className="mx-auto h-6 w-6 text-[#6D9998]" /><p className="mt-2 text-sm font-extrabold text-[#152E4D]">{selectedPet ? "אין עדיין רשומות רפואיות" : "בחרי חיית מחמד"}</p><p className="mx-auto mt-2 max-w-md text-xs font-medium leading-5 text-slate-500">{selectedPet?.kind === "orphan" ? "הרשומות ההיסטוריות של החיה נשמרו, אך אין כרגע חיה תואמת בפרופיל." : selectedPet ? (editable ? "הוסיפי את הביקור או הטיפול הראשון כדי להתחיל את היומן." : "אין רשומות שנשמרו לחיה הזו.") : "הרשומות יוצגו כאן לאחר בחירת חיה."}</p>{editable && selectedCurrentPet && !formOpen && <button type="button" onClick={startNewEntry} className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#B8DCD9] bg-white px-3.5 text-xs font-extrabold text-[#236B68] transition hover:border-[#236B68] hover:bg-[#EAF7F5] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><Plus className="h-4 w-4" />הוספת רשומה ראשונה</button>}</div>}
      </div>
    </>}

    <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#D9E5F4] bg-[#F7F9FF] px-3 py-2.5 text-[11px] font-bold leading-5 text-[#33447A]" role="note"><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[#5267A8]" /><p>היומן מיועד לצוות המרפאה בלבד. הרשומות אינן נשלחות ללקוח ואינן משנות את היסטוריית התורים.</p></div>
  </section>;
}
